/**
 * Service for persisting carried-over predictions to the database.
 *
 * When a member doesn't submit before a round's deadline, we copy their most recent
 * earlier predictions and persist them as carried.
 */

import { prisma } from "@/lib/prisma";
import { planCarryOvers } from "@/lib/carry-over";
import type { PickValue } from "@/lib/picks";
import { RoundStatus } from "@prisma/client";

/**
 * Apply carry-over logic for the active season.
 *
 * Loads the active season, then with a fast-path query checks for closed rounds
 * (deadline passed OR locked/completed) with matches and no carryOverAppliedAt marker.
 * If none found, returns immediately (common case: two small queries).
 *
 * Otherwise, loads all closed rounds, matches, and predictions (needed for source chains),
 * calls planCarryOvers to plan carry-overs, creates predictions in a transaction,
 * and marks (with carryOverAppliedAt) the due rounds still closed.
 *
 * Never throws. Catches errors, logs to console.error, and returns.
 * Reopening a round (services/rounds.ts updateRound) clears the marker for re-processing.
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

    // Define closed condition reused in multiple queries
    const closed = [
      { deadline: { lte: now } },
      { status: { in: [RoundStatus.locked, RoundStatus.completed] } },
    ];

    // Fast path: check if any closed round lacks the marker
    const due = await prisma.round.findMany({
      where: {
        seasonId: activeSeason.id,
        carryOverAppliedAt: null,
        matches: { some: {} }, // Only rounds with matches
        OR: closed,
      },
      select: { id: true },
    });

    if (due.length === 0) {
      // No rounds due for carry-over, nothing to do
      return;
    }

    // Load all closed rounds in the active season (needed for source chains in planCarryOvers)
    const roundsToProcess = await prisma.round.findMany({
      where: {
        seasonId: activeSeason.id,
        OR: closed,
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

    // Create predictions and mark rounds in one transaction
    await prisma.$transaction([
      prisma.prediction.createMany({
        data: carriedPredictions.map((p) => ({
          roundId: p.roundId,
          userId: p.userId,
          matchId: p.matchId,
          pick: p.pick,
          carriedFromRoundNumber: p.carriedFromRoundNumber,
        })),
        skipDuplicates: true,
      }),
      prisma.round.updateMany({
        where: { id: { in: due.map((d) => d.id) }, OR: closed },
        // Only mark rounds still closed, so a round reopened mid-pass is re-processed when it closes again
        data: { carryOverAppliedAt: now },
      }),
    ]);
  } catch (error) {
    console.error("Error applying carry-over logic:", error);
    // Never throw; just log and return
  }
}
