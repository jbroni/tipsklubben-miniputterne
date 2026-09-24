import { prisma } from "./prisma";
import { computeLeaderboard } from "./leaderboard";
import { carryOverMissingCoupons } from "./services/carry-over";
import type { LeaderboardEntry } from "@/types";

/**
 * Load leaderboard entries from the database for a given season.
 * Fetches the active season if seasonId is not provided.
 * Returns an empty array if no active season exists.
 * Runs queries concurrently for efficiency.
 */
export async function getLeaderboardEntries(seasonId?: string): Promise<LeaderboardEntry[]> {
  // Apply carry-overs first
  await carryOverMissingCoupons();

  // Get active season if not specified
  let targetSeasonId = seasonId;
  if (!targetSeasonId) {
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
    });
    if (!activeSeason) {
      return [];
    }
    targetSeasonId = activeSeason.id;
  }

  // Run queries concurrently
  const [rounds, users] = await Promise.all([
    prisma.round.findMany({
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
    }),
    prisma.user.findMany({
      select: { id: true, displayName: true, avatarUrl: true },
    }),
  ]);

  // Build leaderboard using shared utility
  const entries = computeLeaderboard(rounds, users);

  // Filter to only include players who have participated in at least one round
  return entries.filter((e) => e.roundsPlayed > 0);
}
