import { Decimal } from "@prisma/client/runtime/library";

interface MatchOdds {
  oddsHome: Decimal | number;
  oddsDraw: Decimal | number;
  oddsAway: Decimal | number;
  fedtHome?: number | null;
  fedtDraw?: number | null;
  fedtAway?: number | null;
}

type PickType = "HOME" | "DRAW" | "AWAY";

/**
 * Convert match odds to normalized implied probabilities (percentages that sum to 100).
 * If fedtHome, fedtDraw, and fedtAway are all provided (non-null), return them directly
 * without renormalization. Otherwise derive from odds.
 */
function oddsToProb(match: MatchOdds): { home: number; draw: number; away: number } {
  // If all three fedt percentages are provided, use them directly
  if (
    match.fedtHome != null &&
    match.fedtDraw != null &&
    match.fedtAway != null
  ) {
    return {
      home: match.fedtHome,
      draw: match.fedtDraw,
      away: match.fedtAway,
    };
  }

  // Otherwise derive from odds
  const h = 1 / Number(match.oddsHome);
  const d = 1 / Number(match.oddsDraw);
  const a = 1 / Number(match.oddsAway);
  const total = h + d + a;
  return { home: (h / total) * 100, draw: (d / total) * 100, away: (a / total) * 100 };
}

/**
 * Get the implied probability (%) of the chosen outcome for a single match.
 *
 * Higher = safer pick (favorite), lower = bolder pick (underdog).
 */
export function calcMatchFedt(match: MatchOdds, pick: PickType): number {
  const probs = oddsToProb(match);
  return pick === "HOME" ? probs.home : pick === "DRAW" ? probs.draw : probs.away;
}

/**
 * Calculate the Fedt score for an entire round.
 *
 * Sums the chosen probabilities across all picks, then normalizes between
 * the theoretical min (all boldest picks) and max (all safest picks):
 *   fedt = (sumChosen - sumMin) / (sumMax - sumMin) × 100
 *
 * Result is 0–100 where 100 = safest possible coupon, 0 = boldest.
 */
export function calcRoundFedt(
  picks: { match: MatchOdds; pick: PickType }[]
): number {
  if (picks.length === 0) return 50;

  let sumChosen = 0;
  let sumMin = 0;
  let sumMax = 0;

  for (const { match, pick } of picks) {
    const probs = oddsToProb(match);
    const values = [probs.home, probs.draw, probs.away];
    sumChosen += pick === "HOME" ? probs.home : pick === "DRAW" ? probs.draw : probs.away;
    sumMin += Math.min(...values);
    sumMax += Math.max(...values);
  }

  if (sumMax === sumMin) return 50;

  return Math.round(((sumChosen - sumMin) / (sumMax - sumMin)) * 10000) / 100;
}

/**
 * Calculate cumulative season Fedt (average of round Fedt scores).
 */
export function calcSeasonFedt(roundFedts: number[]): number {
  if (roundFedts.length === 0) return 50;
  const sum = roundFedts.reduce((a, b) => a + b, 0);
  return Math.round((sum / roundFedts.length) * 100) / 100;
}

/**
 * Format a decimal number using Danish convention (comma instead of dot).
 */
export function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

/**
 * Get a Danish label for a Fedt score.
 */
export function getFedtLabel(fedt: number): string {
  if (fedt >= 85) return "meget sikker";
  if (fedt >= 65) return "sikker";
  if (fedt >= 45) return "neutral";
  if (fedt >= 25) return "modig";
  return "vild";
}
