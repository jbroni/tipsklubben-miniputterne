/**
 * Pure carry-over logic for propagating missed coupons.
 *
 * When a member doesn't submit before a round's deadline, their most recent
 * earlier coupon (same season) becomes their predictions for that round, flagged
 * as carried. This module computes which predictions to create, mapping picks
 * by matchNumber and propagating carry source information.
 */

import type { PickValue } from "./picks";

/**
 * A round with matches and predictions, prepared for carry-over computation.
 */
export interface CarryOverRound {
  /** The Prisma ID of the round. */
  roundId: string;
  /** The round number within the season (1..13, etc.). */
  roundNumber: number;
  /** Matches in this round with their matchNumber. */
  matches: { id: string; matchNumber: number }[];
  /**
   * All predictions currently in this round, including ones already marked as carried.
   * Each entry: userId, matchNumber (for matching to this round's matches),
   * pick value, and carriedFromRoundNumber (null = submitted, non-null = already carried).
   */
  predictions: {
    userId: string;
    matchNumber: number;
    pick: PickValue;
    carriedFromRoundNumber: number | null;
  }[];
}

/**
 * A single prediction record to be created in the database.
 */
export interface CarriedPrediction {
  /** The Prisma ID of the round receiving the carried pick. */
  roundId: string;
  /** The Prisma ID of the user. */
  userId: string;
  /** The Prisma ID of the match in the target round. */
  matchId: string;
  /** The pick value (HOME, DRAW, or AWAY). */
  pick: PickValue;
  /** The round number the picks were originally submitted in. */
  carriedFromRoundNumber: number;
}

/**
 * Compute carry-over predictions for a season's rounds.
 *
 * Algorithm:
 * 1. Sort rounds ascending by roundNumber.
 * 2. For each round with >= 1 match:
 *    a. Identify users with zero predictions in this round.
 *    b. For each such user, find the highest roundNumber < current where they
 *       have >= 1 prediction (from input or from carries created in this call).
 *    c. Copy those picks onto this round's matches, mapping by matchNumber.
 *       Skip matchNumbers absent in the target round.
 *    d. Propagate carriedFromRoundNumber: if source picks have carriedFromRoundNumber,
 *       use that; otherwise use the source round's roundNumber.
 * 3. Return records in deterministic order (roundId, then userId, then matchNumber).
 *
 * Idempotency: users with any prediction in the target round are skipped, so
 * re-running this function produces no duplicates.
 * Chaining: carries created in this call are visible as sources to later rounds,
 * enabling multi-round carry-overs (e.g., user missing rounds 3 and 4 gets
 * round 3's picks carried to 4, with carriedFromRoundNumber = round 3's original source).
 *
 * @param rounds - All deadline-passed rounds of one season, any order.
 * @returns Array of Prisma-ready prediction records to create.
 */
export function planCarryOvers(rounds: CarryOverRound[]): CarriedPrediction[] {
  // Sort ascending by roundNumber for deterministic processing
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  // Track carries created in this call: (userId, roundNumber) -> picks from source round
  const carriesCreated = new Map<string, Map<number, Map<number, { pick: PickValue; carriedFrom: number }>>>();

  const result: CarriedPrediction[] = [];

  // Process each round
  for (const currentRound of sortedRounds) {
    if (currentRound.matches.length === 0) continue;

    // Build set of (userId, matchNumber) pairs already in this round
    const existingUserMatches = new Set<string>();
    for (const pred of currentRound.predictions) {
      existingUserMatches.add(`${pred.userId}:${pred.matchNumber}`);
    }

    // Collect all users who have predictions in any input round or in carries created so far
    const allUsers = new Set<string>();
    for (const round of sortedRounds) {
      for (const pred of round.predictions) {
        allUsers.add(pred.userId);
      }
    }
    for (const userId of carriesCreated.keys()) {
      allUsers.add(userId);
    }

    // For each user, check if they need carry-over for this round
    for (const userId of Array.from(allUsers).sort()) {
      // Check if user has ANY prediction in currentRound
      const hasAnyInCurrent = currentRound.predictions.some((p) => p.userId === userId);
      if (hasAnyInCurrent) continue;

      // Find highest earlier round where this user has predictions (input or carried in same call)
      let highestSourceRoundNumber: number | null = null;

      // Check input rounds first
      for (let i = sortedRounds.length - 1; i >= 0; i--) {
        const round = sortedRounds[i];
        if (round.roundNumber >= currentRound.roundNumber) continue;
        if (round.predictions.some((p) => p.userId === userId)) {
          highestSourceRoundNumber = round.roundNumber;
          break;
        }
      }

      // Check carries created in this call
      const userCarries = carriesCreated.get(userId);
      if (userCarries) {
        const carryRounds = Array.from(userCarries.keys()).sort((a, b) => b - a);
        for (const carryRound of carryRounds) {
          if (carryRound < currentRound.roundNumber) {
            if (highestSourceRoundNumber === null || carryRound > highestSourceRoundNumber) {
              highestSourceRoundNumber = carryRound;
            }
            break;
          }
        }
      }

      if (highestSourceRoundNumber === null) continue;

      // Get user's picks from the source round
      const userPicks = new Map<number, { pick: PickValue; carriedFrom: number }>();

      // Check input rounds
      const sourceRound = sortedRounds.find((r) => r.roundNumber === highestSourceRoundNumber);
      if (sourceRound) {
        for (const pred of sourceRound.predictions) {
          if (pred.userId === userId) {
            userPicks.set(pred.matchNumber, {
              pick: pred.pick,
              carriedFrom: pred.carriedFromRoundNumber ?? sourceRound.roundNumber,
            });
          }
        }
      }

      // Check carries created in this call
      if (userCarries && userCarries.has(highestSourceRoundNumber)) {
        const carriedPicks = userCarries.get(highestSourceRoundNumber)!;
        for (const [matchNumber, pickData] of carriedPicks) {
          userPicks.set(matchNumber, pickData);
        }
      }

      if (userPicks.size === 0) continue;

      // Map picks onto current round's matches by matchNumber
      for (const match of currentRound.matches) {
        const pickData = userPicks.get(match.matchNumber);
        if (!pickData) continue; // matchNumber not in source, skip it

        const key = `${userId}:${match.matchNumber}`;
        if (existingUserMatches.has(key)) continue; // Already predicted in this round

        result.push({
          roundId: currentRound.roundId,
          userId,
          matchId: match.id,
          pick: pickData.pick,
          carriedFromRoundNumber: pickData.carriedFrom,
        });

        // Track for chaining: record this carry as a source for future rounds
        if (!carriesCreated.has(userId)) {
          carriesCreated.set(userId, new Map());
        }
        const userRoundMap = carriesCreated.get(userId)!;
        if (!userRoundMap.has(currentRound.roundNumber)) {
          userRoundMap.set(currentRound.roundNumber, new Map());
        }
        const roundPicks = userRoundMap.get(currentRound.roundNumber)!;
        roundPicks.set(match.matchNumber, pickData);
      }
    }
  }

  // Sort result deterministically: roundId, then userId, then matchId
  result.sort((a, b) => {
    if (a.roundId !== b.roundId) return a.roundId.localeCompare(b.roundId);
    if (a.userId !== b.userId) return a.userId.localeCompare(b.userId);
    return a.matchId.localeCompare(b.matchId);
  });

  return result;
}
