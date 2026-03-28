import { Decimal } from "@prisma/client/runtime/library";

interface MatchOdds {
  oddsHome: Decimal | number;
  oddsDraw: Decimal | number;
  oddsAway: Decimal | number;
}

type PickType = "HOME" | "DRAW" | "AWAY";

/**
 * Calculate the Fedt score for a single pick on a single match.
 *
 * Fedt = 100 means the safest possible pick (lowest odds / heaviest favorite).
 * Fedt = 0 means the boldest possible pick (highest odds / biggest underdog).
 *
 * Formula:
 *   match_fedt = (1 - (chosen_odds - min_odds) / (max_odds - min_odds)) × 100
 */
export function calcMatchFedt(match: MatchOdds, pick: PickType): number {
  const home = Number(match.oddsHome);
  const draw = Number(match.oddsDraw);
  const away = Number(match.oddsAway);

  const chosenOdds =
    pick === "HOME" ? home : pick === "DRAW" ? draw : away;

  const minOdds = Math.min(home, draw, away);
  const maxOdds = Math.max(home, draw, away);

  // All odds equal — completely neutral
  if (maxOdds === minOdds) return 50;

  const normalized = (chosenOdds - minOdds) / (maxOdds - minOdds);
  return Math.round((1 - normalized) * 100);
}

/**
 * Calculate the Fedt score for an entire round (average across 13 matches).
 */
export function calcRoundFedt(
  picks: { match: MatchOdds; pick: PickType }[]
): number {
  if (picks.length === 0) return 50;

  const total = picks.reduce((sum, { match, pick }) => {
    return sum + calcMatchFedt(match, pick);
  }, 0);

  return Math.round(total / picks.length);
}

/**
 * Calculate cumulative season Fedt (average of round Fedt scores).
 */
export function calcSeasonFedt(roundFedts: number[]): number {
  if (roundFedts.length === 0) return 50;
  const sum = roundFedts.reduce((a, b) => a + b, 0);
  return Math.round(sum / roundFedts.length);
}

/**
 * Get a label for a Fedt score.
 */
export function getFedtLabel(fedt: number): string {
  if (fedt >= 85) return "Meget fedt";
  if (fedt >= 65) return "Fedt";
  if (fedt >= 45) return "Neutral";
  if (fedt >= 25) return "Modig";
  return "Vild";
}

/**
 * Get a color class for a Fedt score (Tailwind).
 */
export function getFedtColor(fedt: number): string {
  if (fedt >= 85) return "text-blue-400";
  if (fedt >= 65) return "text-sky-400";
  if (fedt >= 45) return "text-gray-400";
  if (fedt >= 25) return "text-orange-400";
  return "text-red-400";
}
