/**
 * Free-form coupon editor logic.
 *
 * Pure, framework-free module for editing group coupons without automatic re-solving.
 * Rows are edited independently; constraints are validated but not enforced until save.
 */

import { PICK_ORDER, type PickValue } from "./picks";
import { type SystemDefinition } from "./coupon-systems";

/**
 * Coverage level for a match in the coupon.
 */
export type Coverage = "single" | "half" | "full";

/**
 * A single match row in the editable coupon.
 */
export interface EditableRow {
  /** Match number (1..13) */
  matchNumber: number;
  /** Coverage level: single (1 outcome), half (2 outcomes), or full (3 outcomes) */
  coverage: Coverage;
  /** Covered outcomes, always kept in PICK_ORDER order */
  outcomes: PickValue[];
  /** Base outcome for U-systems; null for single rows or non-U systems */
  baseOutcome: PickValue | null;
  /** Reasoning text (e.g., why this coverage was chosen) */
  reasoning: string;
}

/**
 * Reasoning text applied when an admin manually edits a row.
 */
export const ADMIN_OVERRIDE_REASONING = "Manuelt tilpasset af admin.";

/**
 * Derive coverage level from outcome count.
 *
 * @throws Error if outcomeCount is not in [1, 2, 3]
 */
export function coverageFor(outcomeCount: number): Coverage {
  if (outcomeCount === 1) {
    return "single";
  } else if (outcomeCount === 2) {
    return "half";
  } else if (outcomeCount === 3) {
    return "full";
  }
  throw new Error(`Invalid outcome count: ${outcomeCount}`);
}

/**
 * Toggle an outcome in a row: add it if absent, remove if present.
 *
 * If toggling would empty the outcome set, return the input row unchanged.
 * The returned row has outcomes sorted in PICK_ORDER, coverage derived from count,
 * and reasoning set to ADMIN_OVERRIDE_REASONING.
 *
 * Base outcome is set per the following rule:
 * - If !requiresBaseRow or new coverage is "single": baseOutcome = null
 * - Otherwise:
 *   - If old baseOutcome is in new outcomes: keep it
 *   - Else if old row was single and its sole outcome is in new outcomes: use that
 *   - Else: baseOutcome = null
 *
 * @param row The row to toggle
 * @param outcome The outcome to toggle
 * @param requiresBaseRow Whether the system requires a base row for non-single coverage
 * @returns A new row with the outcome toggled, or the same row if toggling would empty it
 */
export function toggleOutcome(
  row: EditableRow,
  outcome: PickValue,
  requiresBaseRow: boolean
): EditableRow {
  const newOutcomes = row.outcomes.includes(outcome)
    ? row.outcomes.filter((o) => o !== outcome)
    : [...row.outcomes, outcome];

  // Return unchanged if toggling would empty the set
  if (newOutcomes.length === 0) {
    return row;
  }

  // Sort outcomes in PICK_ORDER
  const sortedOutcomes = newOutcomes.slice().sort(
    (a, b) => PICK_ORDER.indexOf(a) - PICK_ORDER.indexOf(b)
  );

  // Derive new coverage
  const newCoverage = coverageFor(sortedOutcomes.length);

  // Determine new base outcome
  let newBaseOutcome: PickValue | null = null;

  if (requiresBaseRow && newCoverage !== "single") {
    // Check if old base outcome is still in the new set
    if (row.baseOutcome && sortedOutcomes.includes(row.baseOutcome)) {
      newBaseOutcome = row.baseOutcome;
    } else if (
      // Check if old row was single and its sole outcome is now in the new set
      row.coverage === "single" &&
      row.outcomes.length === 1 &&
      sortedOutcomes.includes(row.outcomes[0])
    ) {
      newBaseOutcome = row.outcomes[0];
    }
    // Otherwise, newBaseOutcome stays null
  }

  return {
    matchNumber: row.matchNumber,
    coverage: newCoverage,
    outcomes: sortedOutcomes,
    baseOutcome: newBaseOutcome,
    reasoning: ADMIN_OVERRIDE_REASONING,
  };
}

/**
 * Set the base outcome for a row.
 *
 * Returns the row unchanged (same reference) if:
 * - Coverage is "single", or
 * - The outcome is not in row.outcomes
 *
 * Otherwise, returns a new row with baseOutcome set and reasoning = ADMIN_OVERRIDE_REASONING.
 *
 * @param row The row to update
 * @param outcome The outcome to set as base
 * @returns A new row with the base outcome set, or the same row if the operation is invalid
 */
export function setBaseOutcome(
  row: EditableRow,
  outcome: PickValue
): EditableRow {
  // Single rows cannot have a base outcome
  if (row.coverage === "single") {
    return row;
  }

  // Outcome must be in the row's outcomes
  if (!row.outcomes.includes(outcome)) {
    return row;
  }

  // Return new row with base outcome set
  return {
    ...row,
    baseOutcome: outcome,
    reasoning: ADMIN_OVERRIDE_REASONING,
  };
}

/**
 * Check if a row differs from its baseline.
 *
 * Returns true if coverage, outcome set, or baseOutcome differ (ignores reasoning).
 *
 * @param row The edited row
 * @param baseline The baseline row to compare against
 * @returns true if the row has been edited
 */
export function isRowEdited(row: EditableRow, baseline: EditableRow): boolean {
  // Check coverage
  if (row.coverage !== baseline.coverage) {
    return true;
  }

  // Check outcome set (order-independent)
  const rowOutcomes = new Set(row.outcomes);
  const baselineOutcomes = new Set(baseline.outcomes);
  if (rowOutcomes.size !== baselineOutcomes.size) {
    return true;
  }
  for (const outcome of rowOutcomes) {
    if (!baselineOutcomes.has(outcome)) {
      return true;
    }
  }

  // Check base outcome
  if (row.baseOutcome !== baseline.baseOutcome) {
    return true;
  }

  return false;
}

/**
 * Coverage statistics for a coupon.
 */
export interface CoverageCounts {
  single: number;
  half: number;
  full: number;
}

/**
 * Count the coverage distribution in a set of rows.
 *
 * @param rows The rows to count
 * @returns An object with single, half, and full counts
 */
export function countCoverage(rows: EditableRow[]): CoverageCounts {
  const counts: CoverageCounts = { single: 0, half: 0, full: 0 };

  for (const row of rows) {
    counts[row.coverage]++;
  }

  return counts;
}

/**
 * A validation issue found in a coupon.
 */
export interface CouponValidationIssue {
  /** The kind of issue: "budget" or "missingBase" */
  kind: "budget" | "missingBase";
  /** Human-readable message in Danish */
  message: string;
  /** Match number for this issue, if applicable */
  matchNumber?: number;
}

/**
 * Validate a coupon against a system definition.
 *
 * Returns an array of validation issues:
 * - One "budget" issue if the coverage counts don't match the system's requirements
 * - One "missingBase" issue per row that needs but lacks a base outcome
 *
 * @param rows The rows to validate
 * @param system The system definition to validate against
 * @returns An array of validation issues (empty if valid)
 */
export function validateCoupon(
  rows: EditableRow[],
  system: SystemDefinition
): CouponValidationIssue[] {
  const issues: CouponValidationIssue[] = [];

  // Count coverage
  const counts = countCoverage(rows);

  // Check budget
  if (
    counts.full !== system.full ||
    counts.half !== system.half ||
    counts.single !== system.single
  ) {
    issues.push({
      kind: "budget",
      message: `Systemet ${system.code} kræver ${system.full} hel- og ${system.half} halvgarderinger – kuponen har ${counts.full} og ${counts.half}.`,
    });
  }

  // Check for missing base outcomes in U-systems
  if (system.requiresBaseRow) {
    for (const row of rows) {
      if (row.coverage !== "single" && (!row.baseOutcome || !row.outcomes.includes(row.baseOutcome))) {
        issues.push({
          kind: "missingBase",
          message: `Kamp ${row.matchNumber} mangler udgangstegn (U).`,
          matchNumber: row.matchNumber,
        });
      }
    }
  }

  return issues;
}
