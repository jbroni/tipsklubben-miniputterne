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
 * Rule 2: In a U-system, glyph 1 always denotes the baseOutcome (udgangsrække),
 *         with the remaining covered outcomes assigned to the remaining glyphs (X, then 2)
 *         in PICK_ORDER (HOME, DRAW, AWAY). Thus: outcomes = [base, ...sortedCovered.filter(o => o !== base)].
 *         Verified empirically against three real U7-4-133 coupons (rounds dated 12/9, 19/9, 26/9 2026)
 *         whose full row lists reproduce exactly.
 *
 * The ordering of matches within each block (full-covered and half-covered) is confirmed
 * empirically: ascending matchNumber (DEFAULT_CONVENTION) reproduces all three real U7-4-133
 * coupons exactly, while descending matchNumber fails. This is assumed to hold for all U-systems
 * with the same key-file format and convention.
 *
 * Variants in CANDIDATE_CONVENTIONS exist to test the alternative descending ordering
 * and to include a transposition variant so the calibration harness (scripts/calibrate-system-key.ts)
 * can distinguish the correct rule (base first in PICK_ORDER) from the previously tested (incorrect) transposition approach.
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
 * Shared by DEFAULT_CONVENTION and the transposition-u-base variant.
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
 * This convention is confirmed to produce the correct key rows for all
 * 12 official R- and U-system keys. The within-block ordering (ascending vs. descending
 * matchNumber) is verified empirically against three real U7-4-133 coupons (rounds dated 12/9, 19/9, 26/9 2026):
 * ascending matchNumber reproduces the coupons exactly, while descending fails.
 * This rule is assumed to hold for all U-systems with the same key-file format and convention.
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
    let outcomes = [...outcomesSorted];

    // Step 4: For U-systems with covered slots, put baseOutcome on glyph 1
    // and the remaining covered outcomes in PICK_ORDER on the remaining glyphs
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

      // Put baseOutcome first, then the rest in PICK_ORDER
      const otherOutcomes = outcomes.filter((o) => o !== slot.baseOutcome);
      outcomes = [slot.baseOutcome, ...otherOutcomes];
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
 * The within-block ordering (ascending vs. descending matchNumber) is the primary candidate
 * distinction. Only two orderings are considered plausible:
 * - ascending-match-number (the default, verified empirically against three real U7-4-133 coupons)
 * - descending-match-number (an alternative ordering that fails the U7-4-133 coupons)
 *
 * Any other permutation of match order within blocks is not enumerated. If the calibration
 * harness reports "no exact match" (rather than an exact match for one of these two), it
 * signals that the sample violates one of the core reading rules, rather than a silent
 * near-miss from an unenumerated ordering.
 *
 * The transposition-u-base variant is kept to distinguish the correct glyph-mapping rule
 * (base outcome on glyph 1, remaining outcomes in PICK_ORDER) from the previously tested
 * (incorrect) transposition approach (swap base with first in PICK_ORDER).
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

  // Variant: transposition mapping (old incorrect approach)
  {
    id: "transposition-u-base",
    label: "Ombytningsvariant (forkert)",
    assignColumns: DEFAULT_CONVENTION.assignColumns,
    decodeGlyph(glyph: KeyGlyph, slot: CouponSlot, system: SystemDefinition): PickValue {
      const outcomesSorted = validateAndGetOutcomes(glyph, slot);

      // Step 2: Define which glyphs the slot can express
      const glyphsForSlot: KeyGlyph[] = slot.coverage === "full" ? ["1", "X", "2"] : ["1", "X"];

      // Step 3: Create outcomes array where outcomes[i] is for glyph glyphsForSlot[i]
      const outcomes = [...outcomesSorted];

      // Step 4: For U-systems with covered slots, use the old (incorrect) transposition rule:
      // swap baseOutcome with what's at index 0
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

        // Find which index currently has baseOutcome and swap it with index 0
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
  },
];
