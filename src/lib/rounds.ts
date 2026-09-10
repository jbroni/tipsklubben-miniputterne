/**
 * Pure module for round status helpers.
 *
 * Derives effective round status from both explicit status and deadline,
 * keeping this module Prisma-free so it remains client-safe.
 */

/**
 * Round data shape: a minimal subset needed to determine locking state.
 */
interface RoundStatus {
  status: string;
  deadline: Date | string;
}

/**
 * Check if picks can still be submitted to this round.
 *
 * Returns true if and only if:
 * - The round is explicitly "open" AND
 * - The deadline has not yet passed
 */
export function arePicksStillOpen(round: RoundStatus): boolean {
  if (round.status !== "open") {
    return false;
  }

  const deadline = new Date(round.deadline);
  return deadline > new Date();
}

/**
 * Check if the round is effectively locked and all picks should be revealed.
 *
 * Returns true if any of:
 * - The round is explicitly "locked" OR
 * - The round is explicitly "completed" OR
 * - The deadline has passed
 *
 * Note: "locked" status takes precedence and can force revelation before deadline.
 */
export function arePicksRevealed(round: RoundStatus): boolean {
  if (round.status === "locked" || round.status === "completed") {
    return true;
  }

  const deadline = new Date(round.deadline);
  return deadline <= new Date();
}
