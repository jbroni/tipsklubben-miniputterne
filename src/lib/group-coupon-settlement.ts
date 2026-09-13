/**
 * Group coupon settlement calculation.
 *
 * Expands a hedged coupon row using a system key and convention,
 * then scores the expanded rows against match results.
 *
 * All functions are pure and Prisma-free.
 */

import { PickValue, PICK_ORDER } from "./picks";
import { SystemDefinition, getSystem, COUPON_SIZE } from "./coupon-systems";
import { SystemKey, getSystemKey } from "./system-keys/index";
import { CouponSlot, KeyConvention, DEFAULT_CONVENTION } from "./system-keys/conventions";

/**
 * One expanded row from the group coupon key.
 *
 * - index: 0-based row number from the key.
 * - signs: the 13 PickValues for this row, indexed by match number (0 = match 1, etc.).
 */
export interface ExpandedRow {
  index: number;
  signs: PickValue[];
}

/**
 * Expand a hedged coupon into all its rows using a system key and convention.
 *
 * Builds each row by starting with the single-coverage outcomes (constant
 * across all rows) and overwriting each hedged slot's position from its
 * assigned key column's glyph.
 *
 * Validates inputs and throws clear Errors on:
 * - Slot count !== 13
 * - Duplicate or missing match numbers
 * - Outcomes.length disagrees with coverage
 * - Key column count !== system.full + system.half
 *
 * @throws Error if validation fails or key decoding fails.
 */
export function expandCoupon(params: {
  system: SystemDefinition;
  slots: CouponSlot[];
  key: SystemKey;
  convention?: KeyConvention;
}): ExpandedRow[] {
  const { system, slots, key, convention = DEFAULT_CONVENTION } = params;

  // Validation: slot count
  if (slots.length !== COUPON_SIZE) {
    throw new Error(
      `Expected ${COUPON_SIZE} slots, got ${slots.length}`
    );
  }

  // Validation: match numbers 1..13 present exactly once
  const matchNumbers = new Set(slots.map((s) => s.matchNumber));
  if (matchNumbers.size !== COUPON_SIZE) {
    throw new Error(`Duplicate match numbers in slots`);
  }
  for (let i = 1; i <= COUPON_SIZE; i++) {
    if (!matchNumbers.has(i)) {
      throw new Error(`Missing match number ${i}`);
    }
  }

  // Validation: outcomes length matches coverage
  for (const slot of slots) {
    const expectedLen =
      slot.coverage === "single" ? 1 : slot.coverage === "half" ? 2 : 3;
    if (slot.outcomes.length !== expectedLen) {
      throw new Error(
        `Match ${slot.matchNumber}: coverage '${slot.coverage}' expects ${expectedLen} outcomes, got ${slot.outcomes.length}`
      );
    }
  }

  // Validation: outcomes are distinct (no duplicates)
  for (const slot of slots) {
    if (new Set(slot.outcomes).size !== slot.outcomes.length) {
      throw new Error(
        `Match ${slot.matchNumber}: outcomes are not distinct: ${slot.outcomes.join(", ")}`
      );
    }
  }

  // Validation: key column count
  if (key.columns !== system.full + system.half) {
    throw new Error(
      `Key has ${key.columns} columns but system expects ${system.full + system.half}`
    );
  }

  // Assign key columns to slots
  const keySlots = convention.assignColumns(slots, system);

  // Expand each key row
  const rows: ExpandedRow[] = [];

  for (let rowIdx = 0; rowIdx < key.rows.length; rowIdx++) {
    const keyRow = key.rows[rowIdx];

    // Start with single-coverage outcomes
    const signs: PickValue[] = new Array(COUPON_SIZE).fill("HOME");
    for (const slot of slots) {
      if (slot.coverage === "single") {
        signs[slot.matchNumber - 1] = slot.outcomes[0];
      }
    }

    // Overwrite hedged slots from key columns
    for (let colIdx = 0; colIdx < keySlots.length; colIdx++) {
      const glyph = keyRow[colIdx] as "1" | "X" | "2";
      const slot = keySlots[colIdx];
      const outcome = convention.decodeGlyph(glyph, slot, system);
      signs[slot.matchNumber - 1] = outcome;
    }

    rows.push({ index: rowIdx, signs });
  }

  return rows;
}

/**
 * Prize tiers: counts of fully correct rows.
 */
export const PRIZE_TIERS = [13, 12, 11, 10] as const;
export type PrizeTier = (typeof PRIZE_TIERS)[number];

/**
 * Facts about the outcome of settlement that don't depend on the key.
 *
 * - ceiling: how many matches had outcomes in the covered set.
 * - fullyCovered: ceiling === 13.
 * - missedMatches: matchNumbers where the result was not in the covered set.
 * - baseRowCorrect: for U-systems, the score of the udgangsrække itself.
 *   Computed using each slot's baseOutcome (or single outcome for uncovered slots).
 *   Null for non-U systems.
 */
interface KeyFreeFacts {
  ceiling: number;
  fullyCovered: boolean;
  missedMatches: number[];
  baseRowCorrect: number | null;
}

/**
 * The outcome of group coupon settlement.
 *
 * - "pending": round not completed or missing results.
 * - "partial": key not found or validation failed, but ceiling/baseRow computed.
 * - "settled": complete settlement with all stats.
 * - "error": unhandled exception during processing (should not occur).
 */
export type SettlementResult =
  | { status: "pending"; reason: "round-not-completed" | "missing-results"; missingMatches: number[] }
  | ({ status: "partial"; reason: "no-key" | "invalid-coupon"; systemCode: string } & KeyFreeFacts)
  | ({
      status: "settled";
      systemCode: string;
      conventionId: string;
      totalRows: number;
      distribution: Record<number, number>;
      tierCounts: Record<PrizeTier, number>;
      bestRow: { index: number; correct: number; signs: PickValue[] };
      bestRowCount: number;
      reductionCost: number;
    } & KeyFreeFacts)
  | { status: "error"; message: string };

/**
 * Settle a group coupon against match results.
 *
 * Computes the ceiling (matches with outcomes in the covered set),
 * expands the coupon rows, scores each row, and identifies the best row(s).
 *
 * Never throws. Returns a SettlementResult describing the outcome, with
 * Danish error messages on failure.
 */
export function settleGroupCoupon(params: {
  systemCode: string;
  slots: CouponSlot[];
  results: Record<number, PickValue | null>;
  roundCompleted: boolean;
  convention?: KeyConvention;
}): SettlementResult {
  const { systemCode, slots, results, roundCompleted, convention = DEFAULT_CONVENTION } = params;

  try {
    // Check if round is completed
    if (!roundCompleted) {
      return {
        status: "pending",
        reason: "round-not-completed",
        missingMatches: [],
      };
    }

    // Check for missing results
    const missing: number[] = [];
    for (let i = 1; i <= COUPON_SIZE; i++) {
      if (!(i in results) || results[i] === null) {
        missing.push(i);
      }
    }
    if (missing.length > 0) {
      return {
        status: "pending",
        reason: "missing-results",
        missingMatches: missing,
      };
    }

    // Get system definition
    const system = getSystem(systemCode);
    if (!system) {
      const keyFree = computeKeyFreeFacts(slots, results, null);
      return {
        status: "partial",
        reason: "no-key",
        systemCode,
        ...keyFree,
      };
    }

    // Compute key-free facts
    const keyFree = computeKeyFreeFacts(slots, results, system);

    // Get system key
    const key = getSystemKey(systemCode);
    if (!key) {
      return {
        status: "partial",
        reason: "no-key",
        systemCode,
        ...keyFree,
      };
    }

    // Expand coupon rows
    let expandedRows: ExpandedRow[];
    try {
      expandedRows = expandCoupon({ system, slots, key, convention });
    } catch (err) {
      // Expansion failed: coupon structure is invalid (coverage mismatch, non-distinct outcomes, etc.)
      return {
        status: "partial",
        reason: "invalid-coupon",
        systemCode,
        ...keyFree,
      };
    }

    // Score each row and find the best
    let bestCorrect = -1;
    let bestIndex = -1;
    const scoreMap: Record<number, number> = {};

    for (const row of expandedRows) {
      let correct = 0;
      for (let i = 1; i <= COUPON_SIZE; i++) {
        if (row.signs[i - 1] === results[i]) {
          correct++;
        }
      }
      scoreMap[row.index] = correct;

      if (correct > bestCorrect) {
        bestCorrect = correct;
        bestIndex = row.index;
      }
    }

    // Count rows at each score level
    const distribution: Record<number, number> = {};
    for (const score of Object.values(scoreMap)) {
      distribution[score] = (distribution[score] || 0) + 1;
    }

    // Find the best row's signs and count ties
    let bestRowCount = 0;
    let bestRowSigns: PickValue[] = [];
    for (const row of expandedRows) {
      if (scoreMap[row.index] === bestCorrect) {
        bestRowCount++;
        if (row.index === bestIndex) {
          bestRowSigns = [...row.signs];
        }
      }
    }

    // Build tier counts (all four keys, 0 for missing)
    const tierCounts: Record<PrizeTier, number> = { 13: 0, 12: 0, 11: 0, 10: 0 };
    for (const tier of PRIZE_TIERS) {
      tierCounts[tier] = distribution[tier] || 0;
    }

    return {
      status: "settled",
      systemCode,
      conventionId: convention.id,
      totalRows: expandedRows.length,
      distribution,
      tierCounts,
      bestRow: {
        index: bestIndex,
        correct: bestCorrect,
        signs: bestRowSigns,
      },
      bestRowCount,
      reductionCost: keyFree.ceiling - bestCorrect,
      ...keyFree,
    };
  } catch (err) {
    // Unhandled error (should not occur)
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      message: `Fejl ved beregning af settlement: ${message}`,
    };
  }
}

/**
 * Compute facts that don't depend on the key:
 * - Ceiling (how many matches had outcomes in the covered set)
 * - Fully covered (ceiling === 13)
 * - Missed matches (matchNumbers with results not in the covered set)
 * - Base row correct (U-systems only)
 */
function computeKeyFreeFacts(
  slots: CouponSlot[],
  results: Record<number, PickValue | null>,
  system: SystemDefinition | null
): KeyFreeFacts {
  const slotByMatch = new Map(slots.map((s) => [s.matchNumber, s]));

  let ceiling = 0;
  const missedMatches: number[] = [];

  for (let i = 1; i <= COUPON_SIZE; i++) {
    const result = results[i];
    const slot = slotByMatch.get(i);

    if (result === null || result === undefined) {
      missedMatches.push(i);
      continue;
    }

    if (slot && slot.outcomes.includes(result)) {
      ceiling++;
    } else {
      missedMatches.push(i);
    }
  }

  // Compute baseRowCorrect for U-systems
  let baseRowCorrect: number | null = null;
  if (system && system.type === "U") {
    baseRowCorrect = 0;
    for (let i = 1; i <= COUPON_SIZE; i++) {
      const slot = slotByMatch.get(i);
      const result = results[i];

      if (result === null || result === undefined) continue;

      // Use baseOutcome if the slot is covered, otherwise use the single outcome
      let expected: PickValue | null = null;

      if (slot) {
        if (slot.coverage !== "single" && slot.baseOutcome !== null) {
          expected = slot.baseOutcome;
        } else if (slot.coverage === "single") {
          expected = slot.outcomes[0];
        }
      }

      if (expected === result) {
        baseRowCorrect++;
      }
    }
  }

  return {
    ceiling,
    fullyCovered: ceiling === COUPON_SIZE,
    missedMatches,
    baseRowCorrect,
  };
}
