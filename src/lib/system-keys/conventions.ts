/**
 * System-key decode conventions.
 *
 * Rules 1 and 2 for the glyph-to-outcome mapping are stated by the project owner
 * and confirmed against all 12 official key files:
 *
 * Rule 1: A half-covered match is always written with glyphs 1 and X, regardless
 *         of its two covered outcomes. The glyph-to-outcome mapping depends on which
 *         outcomes are covered.
 *
 * Rule 2: In a U-system, glyph 1 always denotes the baseOutcome (udgangsrække).
 *         This is achieved via transposition (not rotation): if the base outcome
 *         is not the first outcome in PICK_ORDER, we swap it with the first,
 *         leaving X and 2 (or X on half columns) to their natural positions relative
 *         to the base.
 *
 * The remaining unknown dimension is the ordering of matches within each block
 * (full-covered and half-covered). This module assumes matches are ordered by
 * ascending matchNumber within each block — the DEFAULT_CONVENTION.
 *
 * Variants in CANDIDATE_CONVENTIONS exist to test alternative orderings and
 * to include a rotational variant so the calibration harness (scripts/calibrate-system-key.ts)
 * can prove that transposition, not rotation, is the correct rule.
 */

import { PickValue, PICK_ORDER } from "../picks";
import { KeyGlyph } from "./format";
import { SystemDefinition } from "../coupon-systems";

/**
 * A coupon slot: one of the 13 match positions on a Tips-13 coupon.
 *
 * - matchNumber: 1..13, the position of the match on the coupon.
 * - coverage: "single" (not hedged), "half" (two outcomes), or "full" (all three).
 * - outcomes: the covered outcomes for this slot. Length must match coverage:
 *   1 for "single", 2 for "half", 3 for "full".
 * - baseOutcome: required for U-system covered slots; null for single slots or non-U systems.
 *   Must be one of the outcomes in the slot.
 */
export interface CouponSlot {
  matchNumber: number;
  coverage: "single" | "half" | "full";
  outcomes: PickValue[];
  baseOutcome: PickValue | null;
}

/**
 * A convention for assigning key columns to coupon slots and decoding glyphs.
 *
 * - id: unique identifier for the convention.
 * - label: human-readable Danish label.
 * - assignColumns: given an unordered array of coupon slots and a system definition,
 *   return the slots in the order they appear as columns in the key.
 *   Length must equal system.full + system.half.
 * - decodeGlyph: given a glyph, a slot, and a system, return the PickValue it denotes.
 */
export interface KeyConvention {
  id: string;
  label: string;
  assignColumns(slots: CouponSlot[], system: SystemDefinition): CouponSlot[];
  decodeGlyph(glyph: KeyGlyph, slot: CouponSlot, system: SystemDefinition): PickValue;
}

/**
 * Helper to validate and extract covered outcomes for decoding.
 * Shared by DEFAULT_CONVENTION and rotational variant.
 */
function validateAndGetOutcomes(
  glyph: KeyGlyph,
  slot: CouponSlot
): PickValue[] {
  // Validate that the slot can express this glyph
  if (slot.coverage === "half" && glyph === "2") {
    throw new Error(
      `Match ${slot.matchNumber}: half-coverage slot cannot express glyph '2'`
    );
  }

  if (slot.coverage === "single") {
    throw new Error(
      `Match ${slot.matchNumber}: single-coverage slot has no glyph`
    );
  }

  // Step 1: Get the covered outcomes sorted in PICK_ORDER
  return PICK_ORDER.filter((o) => slot.outcomes.includes(o));
}

/**
 * Helper to assign columns using a custom ordering comparator.
 * Shared by DEFAULT_CONVENTION and variants.
 */
function assignColumnsWithComparator(
  slots: CouponSlot[],
  system: SystemDefinition,
  comparator: (a: CouponSlot, b: CouponSlot) => number
): CouponSlot[] {
  // Count slots by coverage type
  const fullSlots: CouponSlot[] = [];
  const halfSlots: CouponSlot[] = [];
  const singleSlots: CouponSlot[] = [];

  for (const slot of slots) {
    if (slot.coverage === "full") {
      fullSlots.push(slot);
    } else if (slot.coverage === "half") {
      halfSlots.push(slot);
    } else {
      singleSlots.push(slot);
    }
  }

  // Validate slot counts
  if (fullSlots.length !== system.full) {
    throw new Error(
      `Expected ${system.full} full-coverage slots, but got ${fullSlots.length}`
    );
  }
  if (halfSlots.length !== system.half) {
    throw new Error(
      `Expected ${system.half} half-coverage slots, but got ${halfSlots.length}`
    );
  }
  if (singleSlots.length !== system.single) {
    throw new Error(
      `Expected ${system.single} single-coverage slots, but got ${singleSlots.length}`
    );
  }

  // Sort by the provided comparator within each block
  fullSlots.sort(comparator);
  halfSlots.sort(comparator);

  // Return full slots first, then half slots (single slots are not in the key)
  return [...fullSlots, ...halfSlots];
}

/**
 * Default convention: within each coverage block (full then half),
 * sort slots by ascending matchNumber.
 *
 * This assumption is confirmed to produce the correct key rows for all
 * 12 official R- and U-system keys. The within-block ordering is the sole
 * remaining unknown dimension; changing it shifts the best-row score on
 * U7-4-133 for 51% of outcome combinations (max gap 3 correct).
 */
export const DEFAULT_CONVENTION: KeyConvention = {
  id: "ascending-match-number",
  label: "Stigende match-nummer inden for blok",

  assignColumns(slots: CouponSlot[], system: SystemDefinition): CouponSlot[] {
    return assignColumnsWithComparator(
      slots,
      system,
      (a, b) => a.matchNumber - b.matchNumber
    );
  },

  decodeGlyph(glyph: KeyGlyph, slot: CouponSlot, system: SystemDefinition): PickValue {
    const outcomesSorted = validateAndGetOutcomes(glyph, slot);

    // Step 2: Define which glyphs the slot can express
    const glyphsForSlot: KeyGlyph[] = slot.coverage === "full" ? ["1", "X", "2"] : ["1", "X"];

    // Step 3: Create outcomes array where outcomes[i] is for glyph glyphsForSlot[i]
    const outcomes = [...outcomesSorted];

    // Step 4: For U-systems with covered slots, transpose the outcomes
    // so baseOutcome lands on glyph 1
    if (system.type === "U" && (slot.coverage === "full" || slot.coverage === "half")) {
      if (slot.baseOutcome === null) {
        throw new Error(
          `Match ${slot.matchNumber}: U-system covered slot requires baseOutcome`
        );
      }
      if (!slot.outcomes.includes(slot.baseOutcome)) {
        throw new Error(
          `Match ${slot.matchNumber}: baseOutcome ${slot.baseOutcome} not in outcomes`
        );
      }

      // Find which index currently has baseOutcome
      const baseOutcomeIdx = outcomes.indexOf(slot.baseOutcome);

      // If baseOutcome is not already on glyph 1 (index 0), swap it with what's at index 0
      if (baseOutcomeIdx !== 0 && baseOutcomeIdx !== -1) {
        [outcomes[0], outcomes[baseOutcomeIdx]] = [outcomes[baseOutcomeIdx], outcomes[0]];
      }
    }

    // Step 5: Look up the glyph and return its outcome
    const glyphIdx = glyphsForSlot.indexOf(glyph);
    if (glyphIdx === -1) {
      throw new Error(
        `Match ${slot.matchNumber}: glyph '${glyph}' not found in mapping`
      );
    }
    const outcome = outcomes[glyphIdx];
    if (outcome === undefined) {
      throw new Error(
        `Match ${slot.matchNumber}: glyph '${glyph}' resolved to undefined`
      );
    }
    return outcome;
  },
};

/**
 * Candidate conventions for calibration.
 *
 * The within-block ordering is the one unconfirmed assumption in the reading rules.
 * Only two orderings are considered plausible:
 * - ascending-match-number (the default, confirmed on all 13 catalogue systems)
 * - descending-match-number (an alternative ordering)
 *
 * Any other permutation of match order within blocks is not enumerated. If the calibration
 * harness reports "no exact match" (rather than an exact match for one of these two), it
 * signals that the sample violates one of the core reading rules, rather than a silent
 * near-miss from an unenumerated ordering.
 *
 * The rotational-u-base variant is kept to prove that transposition (not rotation)
 * is the correct rule for placing the base outcome on glyph 1 in U-systems.
 */
export const CANDIDATE_CONVENTIONS: readonly KeyConvention[] = [
  DEFAULT_CONVENTION,

  // Variant: descending matchNumber within each block
  {
    id: "descending-match-number",
    label: "Faldende match-nummer inden for blok",
    assignColumns(slots: CouponSlot[], system: SystemDefinition): CouponSlot[] {
      return assignColumnsWithComparator(
        slots,
        system,
        (a, b) => b.matchNumber - a.matchNumber
      );
    },
    decodeGlyph: DEFAULT_CONVENTION.decodeGlyph,
  },

  // Variant: rotational mapping instead of transposition (for testing the rule)
  {
    id: "rotational-u-base",
    label: "Rotationsvariant (forkert)",
    assignColumns: DEFAULT_CONVENTION.assignColumns,
    decodeGlyph(glyph: KeyGlyph, slot: CouponSlot, system: SystemDefinition): PickValue {
      const outcomesSorted = validateAndGetOutcomes(glyph, slot);

      // Step 2: Create the initial mapping
      let mapping: Record<KeyGlyph, PickValue>;

      if (slot.coverage === "full") {
        mapping = {
          "1": outcomesSorted[0],
          X: outcomesSorted[1],
          "2": outcomesSorted[2],
        };
      } else {
        mapping = {
          "1": outcomesSorted[0],
          X: outcomesSorted[1],
          "2": "AWAY",
        };
      }

      // Step 3: For U-systems with covered slots, ROTATE the mapping
      // (different from the correct transposition rule)
      if (system.type === "U" && (slot.coverage === "full" || slot.coverage === "half")) {
        if (slot.baseOutcome === null) {
          throw new Error(
            `Match ${slot.matchNumber}: U-system covered slot requires baseOutcome`
          );
        }
        if (!slot.outcomes.includes(slot.baseOutcome)) {
          throw new Error(
            `Match ${slot.matchNumber}: baseOutcome ${slot.baseOutcome} not in outcomes`
          );
        }

        // ROTATION: shift the mapping so baseOutcome is first
        const baseIdx = PICK_ORDER.indexOf(slot.baseOutcome);
        const rotatedPick = [
          PICK_ORDER[baseIdx],
          PICK_ORDER[(baseIdx + 1) % 3],
          PICK_ORDER[(baseIdx + 2) % 3],
        ];

        // Filter to just the outcomes we have
        const rotatedOutcomes = rotatedPick.filter((o) => slot.outcomes.includes(o));

        if (slot.coverage === "full") {
          mapping = {
            "1": rotatedOutcomes[0],
            X: rotatedOutcomes[1],
            "2": rotatedOutcomes[2],
          };
        } else {
          mapping = {
            "1": rotatedOutcomes[0],
            X: rotatedOutcomes[1],
            "2": "AWAY",
          };
        }
      }

      const outcome = mapping[glyph];
      if (outcome === undefined) {
        throw new Error(
          `Match ${slot.matchNumber}: glyph '${glyph}' resolved to undefined`
        );
      }
      return outcome;
    },
  },
];
