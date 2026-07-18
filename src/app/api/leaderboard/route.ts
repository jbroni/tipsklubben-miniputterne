import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { computeLeaderboard } from "@/lib/leaderboard";

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

  // Build leaderboard using shared utility
  const entries = computeLeaderboard(rounds, users);

  return NextResponse.json({ data: entries });
}
