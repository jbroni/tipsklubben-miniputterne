/**
 * Pure module mapping Pick values to their coupon glyphs and canonical ordering.
 *
 * Keeps this module Prisma-free so it remains client-safe.
 */

/**
 * A prediction outcome: HOME (1), DRAW (X), or AWAY (2).
 *
 * Structurally identical to the Prisma Pick enum, but imported-free.
 */
export type PickValue = "HOME" | "DRAW" | "AWAY";

/**
 * Map each PickValue to its coupon glyph.
 */
export const PICK_LABEL: Record<PickValue, string> = {
  HOME: "1",
  DRAW: "X",
  AWAY: "2",
};

/**
 * Canonical ordering of outcomes on the 1–X–2 axis.
 *
 * Used for stable comparisons (e.g., "which outcome is closer to X on the axis?")
 * and for deterministic output.
 */
export const PICK_ORDER: readonly PickValue[] = ["HOME", "DRAW", "AWAY"];
