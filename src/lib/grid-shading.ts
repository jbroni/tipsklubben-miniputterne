/**
 * Pure module for determining match row shading in the prediction grid.
 *
 * Rows are shaded in alternating bands of three matches, with the final band
 * absorbing the extra row (10–13 is four rows instead of three).
 *
 * Keeps this module Prisma-free so it remains client-safe.
 */

/**
 * Determine whether a match row should be shaded.
 *
 * Rows are shaded in bands of three:
 * - Matches 1–3: unshaded
 * - Matches 4–6: shaded
 * - Matches 7–9: unshaded
 * - Matches 10–13: shaded
 *
 * @param matchNumber The match number (1–13)
 * @returns true if the row should be shaded, false otherwise
 */
export function isShadedRow(matchNumber: number): boolean {
  // Bands of three, but the last band (10-13) has four rows
  if (matchNumber >= 10) {
    // Last band (10–13) is shaded
    return true;
  }

  // For matches 1–9, determine which band of three they're in
  // Band 0: matches 1–3 (unshaded)
  // Band 1: matches 4–6 (shaded)
  // Band 2: matches 7–9 (unshaded)
  const band = Math.floor((matchNumber - 1) / 3);
  return band % 2 === 1;
}
