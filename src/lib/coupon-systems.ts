/**
 * Pure module describing the 13 purchasable Tips-13 system coupons.
 */

export type SystemType = "R" | "U" | "M";

/**
 * Definition of a single system coupon.
 *
 * A system hedges across the 13 matches: some fully covered (all three outcomes),
 * some half covered (two outcomes), and the rest single (one outcome).
 * `single = 13 - full - half` always holds.
 *
 * - R: reduced (complete hedging strategy)
 * - U: udgangsrække (reduced, requires a base row)
 * - M: mathematical (complete/unreduced system; always has 2^half rows)
 */
export interface SystemDefinition {
  code: string;
  type: SystemType;
  full: number;
  half: number;
  single: number;
  rows: number;
  requiresBaseRow: boolean;
}

/** Size of a Tips-13 coupon: exactly 13 matches. */
export const COUPON_SIZE = 13;

/**
 * Parse a system code (e.g. "U8-3-100") into a SystemDefinition.
 *
 * Format: `<letter><full>-<half>-<rows>`
 * - letter must be R, U, or M
 * - full and half must be non-negative integers
 * - rows must be a positive integer
 * - full + half must not exceed 13
 *
 * Throws Error on malformed input or invalid constraints.
 */
export function parseSystemCode(code: string): SystemDefinition {
  const match = code.match(/^([RUM])(\d+)-(\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`Malformed system code: ${code}`);
  }

  const [, letter, fullStr, halfStr, rowsStr] = match;
  const type = letter as SystemType;
  const full = parseInt(fullStr, 10);
  const half = parseInt(halfStr, 10);
  const rows = parseInt(rowsStr, 10);

  if (full + half > COUPON_SIZE) {
    throw new Error(
      `System code ${code}: full + half (${full} + ${half} = ${full + half}) exceeds ${COUPON_SIZE}`
    );
  }

  const single = COUPON_SIZE - full - half;
  const requiresBaseRow = type === "U";

  return {
    code,
    type,
    full,
    half,
    single,
    rows,
    requiresBaseRow,
  };
}

/**
 * The 13 purchasable system coupons, parsed from their codes.
 */
export const SYSTEMS: readonly SystemDefinition[] = [
  parseSystemCode("U8-3-100"),
  parseSystemCode("U7-3-100"),
  parseSystemCode("U6-4-106"),
  parseSystemCode("R5-5-108"),
  parseSystemCode("R7-2-108"),
  parseSystemCode("U6-3-118"),
  parseSystemCode("M0-7-128"),
  parseSystemCode("R0-13-128"),
  parseSystemCode("U7-4-133"),
  parseSystemCode("U11-0-133"),
  parseSystemCode("R3-7-144"),
  parseSystemCode("R4-4-144"),
  parseSystemCode("R6-4-144"),
];

/**
 * Look up a system definition by its code.
 *
 * Returns undefined if the code is not in the catalogue.
 */
export function getSystem(code: string): SystemDefinition | undefined {
  return SYSTEMS.find((s) => s.code === code);
}
