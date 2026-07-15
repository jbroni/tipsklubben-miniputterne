import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { calcRoundFedt, calcSeasonFedt } from "@/lib/fedt";
import type { LeaderboardEntry } from "@/types";
import type { Pick as PickType } from "@prisma/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");

  // Get active season if not specified
  let targetSeasonId = seasonId;
  if (!targetSeasonId) {
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
    });
    if (!activeSeason) {
      return NextResponse.json({ data: [] });
    }
    targetSeasonId = activeSeason.id;
  }

  // Get all completed rounds for this season
  const rounds = await prisma.round.findMany({
    where: {
      seasonId: targetSeasonId,
      status: "completed",
    },
    include: {
      matches: true,
      predictions: {
        include: { match: true },
      },
    },
    orderBy: { roundNumber: "asc" },
  });

  // Get all users
  const users = await prisma.user.findMany();

  // Build leaderboard
  const entries: LeaderboardEntry[] = users.map((u) => {
    const roundScores = rounds.map((round) => {
      const userPredictions = round.predictions.filter(
        (p) => p.userId === u.id
      );

      const points = userPredictions.filter(
        (p) => p.match.result && p.pick === p.match.result
      ).length;

      const fedtPicks = userPredictions.map((p) => ({
        match: {
          oddsHome: p.match.oddsHome,
          oddsDraw: p.match.oddsDraw,
          oddsAway: p.match.oddsAway,
        },
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
      roundScores: roundScores.map(({ played: _played, ...r }) => r),
    };
  });

  // Sort: most points first, then lower Fedt (bolder) breaks ties
  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.seasonFedt - b.seasonFedt;
  });

  return NextResponse.json({ data: entries });
}
