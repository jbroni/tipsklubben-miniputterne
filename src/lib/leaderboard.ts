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
  match: {
    oddsHome: Match["oddsHome"] | number;
    oddsDraw: Match["oddsDraw"] | number;
    oddsAway: Match["oddsAway"] | number;
    fedtHome?: number | null;
    fedtDraw?: number | null;
    fedtAway?: number | null;
  }
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
 * Compute rank movements for leaderboard entries.
 * Returns a map of user ID to movement (positive = improved, negative = dropped, 0 = same, undefined = no history).
 * Ranking is consistent with compareEntries: most points first, then bolder (lower fedt) on ties.
 */
export function computeMovements(entries: LeaderboardEntry[]): Record<string, number | undefined> {
  const hasHistory = entries.some((e) => e.roundScores.length > 0);

  const movement: Record<string, number | undefined> = {};

  if (!hasHistory) {
    for (const entry of entries) {
      movement[entry.user.id] = undefined;
    }
    return movement;
  }

  const currRanked = [...entries].sort(compareEntries);
  const currRanking = new Map(currRanked.map((e, i) => [e.user.id, i]));

  const prevEntries = entries.map((e) => {
    const lastRound = e.roundScores[e.roundScores.length - 1];
    const lastRoundPoints = lastRound?.points ?? 0;
    const prevTotal = e.totalPoints - lastRoundPoints;

    // Previous fedt excludes the final round position, mirroring prevTotal derivation
    const prevPlayedRounds = e.roundScores.slice(0, -1).filter((r) => r.played);
    const prevFedt = calcSeasonFedt(prevPlayedRounds.map((r) => r.fedt));

    return { id: e.user.id, prevTotal, prevFedt };
  });

  const prevRanked = [...prevEntries].sort((a, b) => {
    if (b.prevTotal !== a.prevTotal) return b.prevTotal - a.prevTotal;
    return a.prevFedt - b.prevFedt;
  });
  const prevRanking = new Map(prevRanked.map((e, i) => [e.id, i]));

  for (const entry of entries) {
    const currRank = currRanking.get(entry.user.id) ?? 0;
    const prevRank = prevRanking.get(entry.user.id) ?? 0;
    movement[entry.user.id] = prevRank - currRank;
  }

  return movement;
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

