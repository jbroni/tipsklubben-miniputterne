/**
 * Service for persisting carried-over predictions to the database.
 *
 * When a member doesn't submit before a round's deadline, we copy their most recent
 * earlier predictions and persist them as carried.
 */

import { prisma } from "@/lib/prisma";
import { planCarryOvers } from "@/lib/carry-over";
import type { PickValue } from "@/lib/picks";

/**
 * Apply carry-over logic for the active season.
 *
 * - Loads the active season and its deadline-passed rounds.
 * - For each round, fetches matches and predictions (including any already marked as carried).
 * - Calls planCarryOvers to compute which predictions to create.
 * - Creates them in the database (idempotent: skips existing predictions).
 *
 * Never throws. Catches errors, logs to console.error, and returns.
 */
export async function carryOverMissingCoupons(): Promise<void> {
  try {
    // Load the active season
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
    });

    if (!activeSeason) {
      // No active season, nothing to do
      return;
    }

    // Get current time
    const now = new Date();

    // Load all rounds in the active season with deadline passed
    const roundsToProcess = await prisma.round.findMany({
      where: {
        seasonId: activeSeason.id,
        deadline: { lte: now },
      },
      include: {
        matches: {
          select: { id: true, matchNumber: true },
        },
        predictions: {
          select: {
            userId: true,
            carriedFromRoundNumber: true,
            match: { select: { matchNumber: true } },
            pick: true,
          },
        },
      },
      orderBy: { roundNumber: "asc" },
    });

    if (roundsToProcess.length === 0) {
      // No rounds with passed deadlines, nothing to do
      return;
    }

    // Prepare input for planCarryOvers
    const carryOverRounds = roundsToProcess.map((round) => ({
      roundId: round.id,
      roundNumber: round.roundNumber,
      matches: round.matches,
      predictions: round.predictions.map((p) => ({
        userId: p.userId,
        matchNumber: p.match.matchNumber,
        pick: p.pick as PickValue,
        carriedFromRoundNumber: p.carriedFromRoundNumber,
      })),
    }));

    // Compute carry-overs
    const carriedPredictions = planCarryOvers(carryOverRounds);

    if (carriedPredictions.length === 0) {
      // No carry-overs needed
      return;
    }

    // Create predictions in the database (idempotent: skipDuplicates)
    await prisma.prediction.createMany({
      data: carriedPredictions.map((p) => ({
        roundId: p.roundId,
        userId: p.userId,
        matchId: p.matchId,
        pick: p.pick,
        carriedFromRoundNumber: p.carriedFromRoundNumber,
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("Error applying carry-over logic:", error);
    // Never throw; just log and return
  }
}
