import type { Round, Match, Prediction, Pick as PickType } from "@prisma/client";
import { calcRoundFedt, calcSeasonFedt } from "./fedt";
import type { LeaderboardEntry, LeaderboardUser } from "@/types";

type RoundWithMatches = Round & {
  matches: Match[];
  predictions: (Prediction & { match: Match })[];
};

/**
 * Convert a match to the input format needed for fedt calculations,
 * including odds and optional fedt percentage fields.
 */
export function toFedtInput(
  match: Match
): {
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  fedtHome?: number | null;
  fedtDraw?: number | null;
  fedtAway?: number | null;
} {
  return {
    oddsHome: Number(match.oddsHome),
    oddsDraw: Number(match.oddsDraw),
    oddsAway: Number(match.oddsAway),
    fedtHome: match.fedtHome,
    fedtDraw: match.fedtDraw,
    fedtAway: match.fedtAway,
  };
}

/**
 * Compare two leaderboard entries for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Sort order: most points first, then lower Fedt (bolder) breaks ties.
 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  return a.seasonFedt - b.seasonFedt;
}

/**
 * Compute the full leaderboard from a list of rounds and users.
 * Aggregates points and fedt scores across all completed predictions.
 * Returns entries sorted by totalPoints (desc) then seasonFedt (asc).
 */
export function computeLeaderboard(
  rounds: RoundWithMatches[],
  users: LeaderboardUser[]
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = users.map((u) => {
    const roundScores = rounds.map((round) => {
      const userPredictions = round.predictions.filter(
        (p) => p.userId === u.id
      );

      const points = userPredictions.filter(
        (p) => p.match && p.match.result && p.pick === p.match.result
      ).length;

      const fedtPicks = userPredictions
        .filter((p) => p.match)
        .map((p) => ({
          match: toFedtInput(p.match),
          pick: p.pick as PickType,
        }));

      const fedt = calcRoundFedt(fedtPicks);

      return {
        roundNumber: round.roundNumber,
        points,
        fedt,
        played: userPredictions.length > 0,
      };
    });

    const playedRoundScores = roundScores.filter((r) => r.played);
    const totalPoints = roundScores.reduce((sum, r) => sum + r.points, 0);
    const roundsPlayed = playedRoundScores.length;
    const avgScore = roundsPlayed > 0 ? totalPoints / roundsPlayed : 0;
    const seasonFedt = calcSeasonFedt(playedRoundScores.map((r) => r.fedt));

    return {
      user: u,
      totalPoints,
      roundsPlayed,
      avgScore,
      seasonFedt,
      roundScores,
    };
  });

  // Sort: most points first, then lower Fedt (bolder) breaks ties
  entries.sort(compareEntries);

  return entries;
}

