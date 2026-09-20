import type { Decimal } from "@prisma/client/runtime/library";
import type { Pick as PickType, Match } from "@prisma/client";
import { calcRoundFedt } from "./fedt";
import { toFedtInput } from "./leaderboard";

export interface RoundScoreUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface RoundScore {
  user: RoundScoreUser;
  points: number;
  fedt: number;
}

interface RoundScoreMatch {
  result: PickType | null;
  oddsHome: Decimal | number;
  oddsDraw: Decimal | number;
  oddsAway: Decimal | number;
  fedtHome?: number | null;
  fedtDraw?: number | null;
  fedtAway?: number | null;
  predictions: Array<{
    userId: string;
    pick: PickType | null;
  }>;
}

export function computeRoundScores(
  matches: RoundScoreMatch[],
  users: RoundScoreUser[]
): RoundScore[] {
  const usersWithPredictions = users.filter((u) =>
    matches.some((m) => m.predictions.some((p) => p.userId === u.id))
  );

  const scores = usersWithPredictions.map((u) => {
    const allPicks = matches.map((m) => {
      const pred = m.predictions.find((p) => p.userId === u.id);
      return {
        match: m,
        pick: pred?.pick ?? null,
        correct: pred && m.result ? pred.pick === m.result : false,
      };
    });

    const points = allPicks.filter((p) => p.correct).length;

    const fedt = calcRoundFedt(
      allPicks
        .filter((p): p is typeof allPicks[0] & { pick: PickType } => p.pick !== null)
        .map((p) => ({
          match: toFedtInput(p.match),
          pick: p.pick,
        }))
    );

    return { user: u, points, fedt };
  });

  scores.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.fedt - b.fedt;
  });

  return scores;
}
