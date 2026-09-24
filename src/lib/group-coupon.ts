/**
 * Pure suggestion engine for merging group predictions into a system coupon.
 *
 * Core logic:
 * - Build ballots from current and carried predictions
 * - Tally votes per match
 * - Rank outcomes deterministically
 * - Calculate coverage costs
 * - Fit system via exact dynamic program
 * - Rank systems by total cost
 *
 * All reasoning text is in Danish.
 */

import { SYSTEMS, SystemDefinition, COUPON_SIZE } from "./coupon-systems";
import { PICK_LABEL, PICK_ORDER, PickValue } from "./picks";

/* ──────────────────────────────────────────────────────────────────────── */
/* Input types                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * A single match with odds.
 */
export interface MatchInput {
  matchNumber: number; // 1..13
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
}

/**
 * Pinned coverage assignments for specific matches.
 * Keyed by matchNumber; value is the exact coverage to use.
 * These assignments are fixed points that persist across system switches.
 */
export type PinnedCoverage = Record<number, "single" | "half" | "full">;

/**
 * A user's prediction for a single match.
 */
export interface PredictionInput {
  userId: string;
  matchNumber: number;
  pick: PickValue;
  /// When present and non-null, indicates this pick was carried from an earlier round.
  carriedFromRoundNumber?: number | null;
}

/**
 * All predictions for a round.
 */
export interface RoundPredictions {
  roundNumber: number;
  predictions: PredictionInput[];
}

/**
 * A ballot: a user's set of picks for 13 matches, with their source and origin.
 */
export interface Ballot {
  userId: string;
  displayName: string;
  source: "current" | "carried";
  sourceRoundNumber: number; // The round these picks actually came from
  picks: Record<number, PickValue>; // Keyed by matchNumber
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Vote tallying                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * A vote tally for a single match.
 */
export interface VoteTally {
  HOME: number;
  DRAW: number;
  AWAY: number;
  total: number;
}

/**
 * Build ballots from current and prior predictions.
 *
 * - Users with a prediction in currentRound contribute a "current" ballot, unless
 *   ALL of their current-round picks have carriedFromRoundNumber set (persisted carry-over),
 *   in which case they're marked as "carried" with sourceRoundNumber from that field.
 * - Users without predictions in currentRound use their highest prior round
 *   (< currentRound.roundNumber) that has a prediction, marked as "carried".
 * - Users with no predictions anywhere are omitted.
 * - Picks are mapped by matchNumber (match 7 in round 8 becomes match 7 in round 9).
 * - Result is sorted by displayName for stable output.
 */
export function buildBallots(params: {
  users: { id: string; displayName: string }[];
  currentRound: RoundPredictions;
  priorRounds: RoundPredictions[];
}): Ballot[] {
  const { users, currentRound, priorRounds } = params;

  // Index current predictions by userId for O(1) lookup
  // Also track if all predictions for a user are carried
  const currentPredsByUser = new Map<string, Map<number, PickValue>>();
  const currentCarriedFromByUser = new Map<string, Set<number>>();
  const currentCarriedCountByUser = new Map<string, number>();

  for (const pred of currentRound.predictions) {
    if (!currentPredsByUser.has(pred.userId)) {
      currentPredsByUser.set(pred.userId, new Map());
      currentCarriedFromByUser.set(pred.userId, new Set());
    }
    currentPredsByUser.get(pred.userId)!.set(pred.matchNumber, pred.pick);

    if (pred.carriedFromRoundNumber !== null && pred.carriedFromRoundNumber !== undefined) {
      currentCarriedFromByUser.get(pred.userId)!.add(pred.carriedFromRoundNumber);
      currentCarriedCountByUser.set(pred.userId, (currentCarriedCountByUser.get(pred.userId) ?? 0) + 1);
    }
  }

  // Sort prior rounds by roundNumber descending so we find the highest first
  const sortedPriors = [...priorRounds].sort((a, b) => b.roundNumber - a.roundNumber);

  // Index all prior predictions by userId for O(1) lookup
  const priorPredsByUser = new Map<string, Map<number, Map<number, PickValue>>>();
  for (const prior of sortedPriors) {
    for (const pred of prior.predictions) {
      if (!priorPredsByUser.has(pred.userId)) {
        priorPredsByUser.set(pred.userId, new Map());
      }
      if (!priorPredsByUser.get(pred.userId)!.has(prior.roundNumber)) {
        priorPredsByUser.get(pred.userId)!.set(prior.roundNumber, new Map());
      }
      priorPredsByUser
        .get(pred.userId)!
        .get(prior.roundNumber)!
        .set(pred.matchNumber, pred.pick);
    }
  }

  const ballots: Ballot[] = [];

  for (const user of users) {
    const currentPicks = currentPredsByUser.get(user.id);

    if (currentPicks && currentPicks.size > 0) {
      // User has predictions in current round
      // Check if ALL predictions are carried (have non-null carriedFromRoundNumber)
      const carriedSet = currentCarriedFromByUser.get(user.id);
      const allCarried = carriedSet && carriedSet.size === 1 && currentCarriedCountByUser.get(user.id) === currentPicks.size
        ? Array.from(carriedSet)[0]
        : null;

      // Only mark as "carried" if EVERY pick has the same non-null carriedFromRoundNumber
      if (allCarried !== null) {
        ballots.push({
          userId: user.id,
          displayName: user.displayName,
          source: "carried",
          sourceRoundNumber: allCarried,
          picks: Object.fromEntries(currentPicks),
        });
      } else {
        ballots.push({
          userId: user.id,
          displayName: user.displayName,
          source: "current",
          sourceRoundNumber: currentRound.roundNumber,
          picks: Object.fromEntries(currentPicks),
        });
      }
    } else {
      // Find highest prior round with predictions for this user
      const userPriors = priorPredsByUser.get(user.id);
      if (userPriors) {
        const priorRoundNumbers = Array.from(userPriors.keys()).sort((a, b) => b - a);
        const highestRound = priorRoundNumbers.find((rn) => rn < currentRound.roundNumber);

        if (highestRound !== undefined) {
          const priorPicks = userPriors.get(highestRound)!;
          ballots.push({
            userId: user.id,
            displayName: user.displayName,
            source: "carried",
            sourceRoundNumber: highestRound,
            picks: Object.fromEntries(priorPicks),
          });
        }
      }
    }
  }

  // Sort by displayName for stable output
  ballots.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return ballots;
}

/**
 * Tally votes for a single match across all ballots.
 */
export function tallyVotes(ballots: Ballot[], matchNumber: number): VoteTally {
  const tally: VoteTally = { HOME: 0, DRAW: 0, AWAY: 0, total: 0 };

  for (const ballot of ballots) {
    const pick = ballot.picks[matchNumber];
    if (pick) {
      tally[pick]++;
      tally.total++;
    }
  }

  return tally;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Ranking and comparison logic                                             */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Map PickValue to the odds field name in MatchInput.
 * Type-safe lookup: a future field rename will break the build rather than silently disable the rule.
 */
const ODDS_FIELD: Record<PickValue, keyof MatchInput> = {
  HOME: "oddsHome",
  DRAW: "oddsDraw",
  AWAY: "oddsAway",
};

/**
 * Get odds for a given outcome. Type-safe.
 */
function oddsFor(match: MatchInput, outcome: PickValue): number {
  return match[ODDS_FIELD[outcome]];
}

/**
 * Rank all three outcomes in descending preference order.
 *
 * Comparator applied in order:
 * 1. More votes wins.
 * 2. Lean: if two outcomes are tied and the third has at least one vote,
 *    prefer whichever sits closer to the third on the axis ["HOME","DRAW","AWAY"].
 * 3. Lowest odds wins (bookmaker's favourite).
 * 4. Axis order (HOME, DRAW, AWAY) as deterministic backstop.
 */
export function rankOutcomes(
  tally: VoteTally,
  match: MatchInput
): PickValue[] {
  const outcomes: PickValue[] = ["HOME", "DRAW", "AWAY"];

  // Total-order comparator: a and b are outcomes, return < 0 if a > b (prefer a), > 0 if b > a
  const compare = (a: PickValue, b: PickValue): number => {
    const votesA = tally[a];
    const votesB = tally[b];

    // 1. More votes wins
    if (votesA !== votesB) {
      return votesB - votesA; // Higher votes come first
    }

    // 2. Lean: if tied and third outcome has strictly fewer votes ("stray vote"), prefer closer to third
    const third = outcomes.find((o) => o !== a && o !== b)!;
    const votesThird = tally[third];

    if (votesThird > 0 && votesThird < votesA && votesThird < votesB) {
      // Third outcome is a "stray": strictly fewer votes than the tied pair
      // Both tied outcomes should lean toward the third
      const indexA = PICK_ORDER.indexOf(a);
      const indexB = PICK_ORDER.indexOf(b);
      const indexThird = PICK_ORDER.indexOf(third);

      const distA = Math.abs(indexA - indexThird);
      const distB = Math.abs(indexB - indexThird);

      if (distA !== distB) {
        return distA - distB; // Closer distance comes first
      }
    }

    // 3. Lowest odds wins
    const oddsA = oddsFor(match, a);
    const oddsB = oddsFor(match, b);

    if (oddsA !== oddsB) {
      return oddsA - oddsB; // Lower odds come first
    }

    // 4. Axis order
    const indexA = PICK_ORDER.indexOf(a);
    const indexB = PICK_ORDER.indexOf(b);
    return indexA - indexB;
  };

  return outcomes.sort(compare);
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Coverage costs                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Coverage choice: outcomes list and cost (fraction of voters uncovered).
 */
export interface CoverageChoice {
  cost: number;
  outcomes: PickValue[];
}

/**
 * Coverage costs for a single match.
 */
export interface CoverageCosts {
  full: CoverageChoice;
  half: CoverageChoice;
  single: CoverageChoice;
}

/**
 * Calculate coverage costs for a single match.
 *
 * - full: all three outcomes, cost 0
 * - half: top two ranked outcomes, cost = tally[ranked[2]] / N
 * - single: top ranked outcome, cost = (N - tally[ranked[0]]) / N
 *
 * If N === 0, all costs are 0. Outcomes still respect coverage level (1, 2, 3)
 * and are taken from ranked order (which falls through to odds, then axis order).
 */
export function coverageCosts(
  tally: VoteTally,
  match: MatchInput
): CoverageCosts {
  const ranked = rankOutcomes(tally, match);
  const N = tally.total;

  // Full: all three, cost 0
  const fullOutcomes = PICK_ORDER.slice();
  const fullCost = 0;

  // Half: top two ranked
  const halfOutcomes = [ranked[0], ranked[1]].sort(
    (a, b) => PICK_ORDER.indexOf(a) - PICK_ORDER.indexOf(b)
  );
  const halfCost = N > 0 ? tally[ranked[2]] / N : 0;

  // Single: top ranked
  const singleOutcomes = [ranked[0]];
  const singleCost = N > 0 ? (N - tally[ranked[0]]) / N : 0;

  return {
    full: { cost: fullCost, outcomes: fullOutcomes },
    half: { cost: halfCost, outcomes: halfOutcomes },
    single: { cost: singleCost, outcomes: singleOutcomes },
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Ideal coverage (unconstrained)                                           */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * The unconstrained ideal coverage given a vote tally.
 *
 * - single: when top outcome gets >= 80% of votes
 * - half: when at most two outcomes received any votes
 * - otherwise: full
 * - N === 0: full
 */
export function idealCoverage(tally: VoteTally): "single" | "half" | "full" {
  if (tally.total === 0) {
    return "full";
  }

  const ranked = rankOutcomes(
    tally,
    { matchNumber: 0, oddsHome: 1, oddsDraw: 1, oddsAway: 1 } // dummy match for ranking
  );

  // Check if top outcome gets >= 80%
  if (tally[ranked[0]] / tally.total >= 0.8) {
    return "single";
  }

  // Check if at most two outcomes have votes
  const withVotes = [
    tally.HOME > 0,
    tally.DRAW > 0,
    tally.AWAY > 0,
  ].filter(Boolean).length;

  if (withVotes <= 2) {
    return "half";
  }

  return "full";
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Dynamic programming: system fit                                          */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Thrown when pinned assignments exceed the system's slot budget.
 * Allows the UI to distinguish this from a genuine system error.
 */
export class InfeasiblePinsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfeasiblePinsError";
  }
}

/**
 * Assignment of a match to a coverage within a fitted system.
 */
export interface MatchAssignment {
  matchNumber: number;
  coverage: "single" | "half" | "full";
  outcomes: PickValue[]; // 1, 2 or 3 entries, in PICK_ORDER order
  baseOutcome: PickValue | null; // Set only when system.requiresBaseRow && coverage !== "single"
  tally: VoteTally;
  idealCoverage: "single" | "half" | "full";
  reasoning: string; // Danish
}

/**
 * The result of fitting a system to a set of matches and ballots.
 */
export interface SystemFit {
  system: SystemDefinition;
  assignments: MatchAssignment[];
  totalCost: number; // Sum of per-match costs
  coverage: number; // 100 * (1 - totalCost / 13), rounded to 1 decimal
}

/**
 * Fit a system to matches and ballots using exact dynamic programming.
 *
 * Assigns each match to exactly one coverage (single, half, full) such that:
 * - Total fully covered = system.full (exact)
 * - Total half covered = system.half (exact)
 * - Total single covered = system.single (computed: 13 - full - half)
 * - Total cost is minimized
 *
 * If `pinned` is provided, matches listed in it are constrained to that coverage.
 * Unpinned matches are solved optimally against the remaining slot budget.
 * The exact slot constraint still holds overall.
 *
 * Uses DP over (matchIndex, fullUsed, halfUsed).
 *
 * Throws if system.full + system.half > 13.
 * Throws InfeasiblePinsError if pins exceed the system's budget.
 */
export function fitSystem(
  system: SystemDefinition,
  matches: MatchInput[],
  ballots: Ballot[],
  pinned?: PinnedCoverage
): SystemFit {
  if (system.full + system.half > COUPON_SIZE) {
    throw new Error(
      `System ${system.code}: full + half (${system.full} + ${system.half}) exceeds ${COUPON_SIZE}`
    );
  }

  const numMatches = matches.length;
  if (numMatches !== COUPON_SIZE) {
    throw new Error(`Expected ${COUPON_SIZE} matches, got ${numMatches}`);
  }

  // Normalize pinned to empty object if not provided
  const pinnedCoverage = pinned || {};
  const hasPins = Object.keys(pinnedCoverage).length > 0;

  // Precompute tallies and costs for all matches
  const tallies = matches.map((match) => tallyVotes(ballots, match.matchNumber));
  const costs = matches.map((match, idx) => coverageCosts(tallies[idx], match));

  // If we have pins, check feasibility first
  if (hasPins) {
    let pinnedFullCount = 0;
    let pinnedHalfCount = 0;
    let pinnedSingleCount = 0;
    const validMatchNumbers = new Set(matches.map((m) => m.matchNumber));

    for (const matchNumberStr in pinnedCoverage) {
      const matchNumber = parseInt(matchNumberStr, 10);

      // Validate that the match number is valid
      if (!validMatchNumbers.has(matchNumber)) {
        throw new InfeasiblePinsError(
          `Pinned match number ${matchNumber} does not exist in the match list`
        );
      }

      const coverage = pinnedCoverage[matchNumber];
      if (coverage === "full") pinnedFullCount++;
      else if (coverage === "half") pinnedHalfCount++;
      else if (coverage === "single") pinnedSingleCount++;
    }

    // Calculate remaining unpinned matches
    const pinnedCount = Object.keys(pinnedCoverage).length;
    const unpinnedCount = COUPON_SIZE - pinnedCount;

    // Check if pinned full exceeds system full
    if (pinnedFullCount > system.full) {
      throw new InfeasiblePinsError(
        `Pinned ${pinnedFullCount} full matches exceeds system capacity of ${system.full} full slots`
      );
    }

    // Check if pinned half exceeds system half
    if (pinnedHalfCount > system.half) {
      throw new InfeasiblePinsError(
        `Pinned ${pinnedHalfCount} half matches exceeds system capacity of ${system.half} half slots`
      );
    }

    // Check if pinned single exceeds system single
    if (pinnedSingleCount > system.single) {
      throw new InfeasiblePinsError(
        `Pinned ${pinnedSingleCount} single matches exceeds system capacity of ${system.single} single slots`
      );
    }

    // Defense-in-depth: check if remaining unpinned can satisfy the required full/half slots.
    // Because every catalogue system satisfies full + half + single === COUPON_SIZE (13),
    // this condition is algebraically equivalent to the pinnedSingleCount > system.single
    // check above and is therefore unreachable in practice. We retain it only to remain
    // correct if that invariant ever changes.
    const remainingFullNeeded = system.full - pinnedFullCount;
    const remainingHalfNeeded = system.half - pinnedHalfCount;
    const totalSlotsNeeded = remainingFullNeeded + remainingHalfNeeded;

    if (totalSlotsNeeded > unpinnedCount) {
      throw new InfeasiblePinsError(
        `Not enough unpinned matches (${unpinnedCount}) to satisfy remaining slot requirements (full: ${remainingFullNeeded}, half: ${remainingHalfNeeded})`
      );
    }
  }

  // DP state: dp[i][full][half] = minimum cost to cover first i matches
  // using exactly `full` fully covered and `half` half covered
  type DPState = number | null; // null means infeasible
  const dp: DPState[][][] = Array.from({ length: numMatches + 1 }, () =>
    Array.from({ length: system.full + 1 }, () =>
      Array.from({ length: system.half + 1 }, () => null)
    )
  );

  // Base case: 0 matches, 0 slots used
  dp[0][0][0] = 0;

  // Fill DP table
  for (let i = 0; i < numMatches; i++) {
    const matchNumber = matches[i].matchNumber;
    const isPinned = matchNumber in pinnedCoverage;
    const pinnedCov = pinnedCoverage[matchNumber];

    for (let fullUsed = 0; fullUsed <= system.full; fullUsed++) {
      for (let halfUsed = 0; halfUsed <= system.half; halfUsed++) {
        const prevState = dp[i][fullUsed][halfUsed];
        if (prevState === null) continue;

        // prevState is now known to be non-null
        const currentCost: number = prevState;

        if (isPinned) {
          // This match is pinned: only one legal transition
          let newFullUsed = fullUsed;
          let newHalfUsed = halfUsed;
          let newCost = currentCost;

          if (pinnedCov === "full") {
            newFullUsed = fullUsed + 1;
            newCost = currentCost + costs[i].full.cost;
          } else if (pinnedCov === "half") {
            newHalfUsed = halfUsed + 1;
            newCost = currentCost + costs[i].half.cost;
          } else {
            // "single" — don't increment fullUsed or halfUsed
            newCost = currentCost + costs[i].single.cost;
          }

          const existing = dp[i + 1][newFullUsed][newHalfUsed];
          if (existing === null || existing > newCost) {
            dp[i + 1][newFullUsed][newHalfUsed] = newCost;
          }
        } else {
          // This match is not pinned: try all transitions
          // Try assigning this match to single coverage
          const newCost1 = currentCost + costs[i].single.cost;
          const existing1 = dp[i + 1][fullUsed][halfUsed];
          if (existing1 === null || existing1 > newCost1) {
            dp[i + 1][fullUsed][halfUsed] = newCost1;
          }

          // Try assigning this match to half coverage (if slots available)
          if (halfUsed < system.half) {
            const newCost2 = currentCost + costs[i].half.cost;
            const existing2 = dp[i + 1][fullUsed][halfUsed + 1];
            if (existing2 === null || existing2 > newCost2) {
              dp[i + 1][fullUsed][halfUsed + 1] = newCost2;
            }
          }

          // Try assigning this match to full coverage (if slots available)
          if (fullUsed < system.full) {
            const newCost3 = currentCost + costs[i].full.cost;
            const existing3 = dp[i + 1][fullUsed + 1][halfUsed];
            if (existing3 === null || existing3 > newCost3) {
              dp[i + 1][fullUsed + 1][halfUsed] = newCost3;
            }
          }
        }
      }
    }
  }

  // Extract solution: backtrack from dp[numMatches][system.full][system.half]
  const optimalCost = dp[numMatches][system.full][system.half];
  if (optimalCost === null) {
    // If pins were supplied, this is an infeasible pins error; otherwise it's a genuine system error
    if (hasPins) {
      throw new InfeasiblePinsError(
        `Cannot fit system ${system.code} with the given pins: no valid assignment (full=${system.full}, half=${system.half})`
      );
    } else {
      throw new Error(
        `Cannot fit system ${system.code}: no valid assignment (full=${system.full}, half=${system.half})`
      );
    }
  }

  // Reconstruct the assignment by backtracking
  const assignment: ("single" | "half" | "full")[] = [];
  let fullUsed = system.full;
  let halfUsed = system.half;

  for (let i = numMatches; i > 0; i--) {
    const matchNumber = matches[i - 1].matchNumber;
    const isPinned = matchNumber in pinnedCoverage;
    const pinnedCov = pinnedCoverage[matchNumber];

    let chosen: "single" | "half" | "full" | null = null;
    const currentCost = dp[i][fullUsed][halfUsed];

    if (currentCost === null) {
      throw new Error(`DP state is null at [${i}][${fullUsed}][${halfUsed}]`);
    }

    if (isPinned) {
      // For pinned matches, there's only one way to get here
      chosen = pinnedCov;
      if (pinnedCov === "full") {
        fullUsed--;
      } else if (pinnedCov === "half") {
        halfUsed--;
      }
      // "single" doesn't change fullUsed or halfUsed
    } else {
      // For unpinned matches, try each possibility
      // Check if this match was assigned to single (most likely)
      const prevCostSingle = dp[i - 1][fullUsed][halfUsed];
      if (prevCostSingle !== null) {
        const expectedCost = prevCostSingle + costs[i - 1].single.cost;
        if (Math.abs(currentCost - expectedCost) < 1e-9) {
          chosen = "single";
        }
      }

      // Check if this match was assigned to half
      if (chosen === null && halfUsed > 0) {
        const prevCostHalf = dp[i - 1][fullUsed][halfUsed - 1];
        if (prevCostHalf !== null) {
          const expectedCost = prevCostHalf + costs[i - 1].half.cost;
          if (Math.abs(currentCost - expectedCost) < 1e-9) {
            chosen = "half";
            halfUsed--;
          }
        }
      }

      // Check if this match was assigned to full
      if (chosen === null && fullUsed > 0) {
        const prevCostFull = dp[i - 1][fullUsed - 1][halfUsed];
        if (prevCostFull !== null) {
          const expectedCost = prevCostFull + costs[i - 1].full.cost;
          if (Math.abs(currentCost - expectedCost) < 1e-9) {
            chosen = "full";
            fullUsed--;
          }
        }
      }
    }

    if (chosen === null) {
      throw new Error(`Failed to reconstruct assignment for match ${i}`);
    }

    assignment[i - 1] = chosen;
  }

  // Build MatchAssignment objects
  const ranked = matches.map((match, idx) => rankOutcomes(tallies[idx], match));
  const ideal = matches.map((match, idx) => idealCoverage(tallies[idx]));

  const assignments: MatchAssignment[] = matches.map((match, idx) => {
    const coverage = assignment[idx];
    const tally = tallies[idx];
    const rankedOutcomes = ranked[idx];
    const idealCov = ideal[idx];
    const costs_ = costs[idx];

    // Determine base outcome
    let baseOutcome: PickValue | null = null;
    if (system.requiresBaseRow && coverage !== "single") {
      // Base outcome is the highest-ranked outcome among the covered outcomes
      const coveredOutcomes = costs_[coverage].outcomes;
      baseOutcome = rankedOutcomes.find((o) => coveredOutcomes.includes(o)) || null;
    }

    // Build reasoning text
    const reasoning = buildReasoningText(
      match,
      tally,
      coverage,
      baseOutcome,
      idealCov,
      rankedOutcomes
    );

    return {
      matchNumber: match.matchNumber,
      coverage,
      outcomes: costs_[coverage].outcomes,
      baseOutcome,
      tally,
      idealCoverage: idealCov,
      reasoning,
    };
  });

  // Sort assignments by matchNumber for stable output
  assignments.sort((a, b) => a.matchNumber - b.matchNumber);

  // Calculate coverage figure
  const coverage = Math.round((1 - optimalCost / COUPON_SIZE) * 1000) / 10;

  return {
    system,
    assignments,
    totalCost: optimalCost,
    coverage,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Ranking systems                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Rank all 13 systems by fit quality (lowest cost wins).
 *
 * Sort by:
 * 1. totalCost ascending
 * 2. system.rows ascending (fewer rows wins a tie)
 * 3. code for stability
 */
export function rankSystems(
  matches: MatchInput[],
  ballots: Ballot[]
): SystemFit[] {
  const fits = SYSTEMS.map((system) => fitSystem(system, matches, ballots));

  fits.sort((a, b) => {
    // 1. totalCost ascending
    if (a.totalCost !== b.totalCost) {
      return a.totalCost - b.totalCost;
    }
    // 2. rows ascending
    if (a.system.rows !== b.system.rows) {
      return a.system.rows - b.system.rows;
    }
    // 3. code for stability
    return a.system.code.localeCompare(b.system.code);
  });

  return fits;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Reasoning text generation (Danish)                                       */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Determine which rule decided between the base outcome and the runner-up
 * among covered outcomes, for the purpose of reporting the justification.
 *
 * Returns:
 * - "votes" if base outcome has strictly more votes than runner-up
 * - "lean" if votes tied and third outcome exists
 * - "odds" if votes and lean tied
 * - "axis" if all tie (axis order as backstop)
 */
function whichRuleDecidedBase(
  baseOutcome: PickValue,
  coveredOutcomes: PickValue[],
  tally: VoteTally,
  match: MatchInput
): string {
  if (coveredOutcomes.length < 2) return "axis"; // No runner-up to compare

  // Get votes for base and runner-up
  const baseVotes = tally[baseOutcome];
  const runnerUp = coveredOutcomes.find((o) => o !== baseOutcome)!;
  const runnerVotes = tally[runnerUp];

  if (baseVotes !== runnerVotes) {
    return "votes"; // More votes wins
  }

  // Votes are tied; check lean rule
  // Lean applies only if third has strictly fewer votes ("stray")
  const allOutcomes = PICK_ORDER;
  const third = allOutcomes.find((o) => !coveredOutcomes.includes(o));
  const thirdVotes = third ? tally[third] : 0;

  if (thirdVotes > 0 && thirdVotes < baseVotes && thirdVotes < runnerVotes) {
    // Lean rule applies (third is "stray")
    const baseIndex = PICK_ORDER.indexOf(baseOutcome);
    const runnerIndex = PICK_ORDER.indexOf(runnerUp);
    const thirdIndex = PICK_ORDER.indexOf(third!);

    const baseDist = Math.abs(baseIndex - thirdIndex);
    const runnerDist = Math.abs(runnerIndex - thirdIndex);

    if (baseDist !== runnerDist) {
      return "lean"; // Closer to third
    }
  }

  // Check odds
  const baseOdds = oddsFor(match, baseOutcome);
  const runnerOdds = oddsFor(match, runnerUp);

  if (baseOdds !== runnerOdds) {
    return "odds"; // Lower odds
  }

  return "axis"; // Axis order backstop
}

/**
 * Build a single-sentence Danish rationale for a match assignment.
 *
 * Must convey: the vote split, the coverage decision, any deviation from
 * idealCoverage, and — under a U-system — why the base outcome was chosen.
 */
function buildReasoningText(
  match: MatchInput,
  tally: VoteTally,
  coverage: "single" | "half" | "full",
  baseOutcome: PickValue | null,
  idealCov: "single" | "half" | "full",
  rankedOutcomes: PickValue[]
): string {
  // Handle N=0 case specially
  if (tally.total === 0) {
    const coverageLabel =
      coverage === "single" ? "ingen gardering" : coverage === "half" ? "halvgarderet" : "helgarderet";
    return `Ingen stemmer afgivet — ${coverageLabel}.`;
  }

  // Build vote split string (e.g., "5-1-0" or "2-2-2")
  const votes = [tally.HOME, tally.DRAW, tally.AWAY];
  const voteSplit = votes.map((v) => v.toString()).join("-");

  // Coverage label in Danish
  const coverageLabel =
    coverage === "single" ? "ingen gardering" : coverage === "half" ? "halvgarderet" : "helgarderet";

  // Outcomes in glyph order
  const topGlyph = PICK_LABEL[rankedOutcomes[0]];
  const secondGlyph = PICK_LABEL[rankedOutcomes[1]];
  const thirdGlyph = PICK_LABEL[rankedOutcomes[2]];

  // Build the base text depending on coverage
  let text: string;

  if (coverage === "single") {
    if (tally[rankedOutcomes[0]] / tally.total >= 0.8) {
      // Clear consensus — no gardering needed
      text = `${tally[rankedOutcomes[0]]} af ${tally.total} valgte ${topGlyph} — ingen gardering nødvendig.`;
    } else {
      // Single but not ideal
      const uncovered = tally.total - tally[rankedOutcomes[0]];
      text = `Stemmerne er ${voteSplit} — ${uncovered} uden for ${topGlyph} valgt.`;
    }
  } else if (coverage === "half") {
    text = `Delt mellem ${topGlyph} og ${secondGlyph} (${tally[rankedOutcomes[0]]}-${tally[rankedOutcomes[1]]}) — halvgarderet.`;
  } else {
    // full coverage
    text = `Stemmerne er ${voteSplit} — helgarderet.`;
  }

  // Collect clauses to append
  const clauses: string[] = [];

  // Append base outcome info if present (U-system and not single)
  if (baseOutcome) {
    const baseGlyph = PICK_LABEL[baseOutcome];
    const coveredOutcomes =
      coverage === "single"
        ? [baseOutcome]
        : coverage === "half"
          ? [rankedOutcomes[0], rankedOutcomes[1]]
          : PICK_ORDER.slice();

    const rule = whichRuleDecidedBase(baseOutcome, coveredOutcomes, tally, match);
    let baseClause = `Udgangspunkt: ${baseGlyph}`;

    if (rule === "votes") {
      baseClause += " (flest stemmer)";
    } else if (rule === "lean") {
      // Find the third (uncovered for half/full)
      const third = PICK_ORDER.find((o) => !coveredOutcomes.includes(o));
      const thirdGlyph = third ? PICK_LABEL[third] : "";
      baseClause += ` (hælder mod ${thirdGlyph})`;
    } else if (rule === "odds") {
      baseClause += " (lavest odds)";
    }
    // else: axis order — omit parenthetical

    clauses.push(baseClause);
  }

  // Append deviation info if coverage differs from ideal
  if (coverage !== idealCov) {
    const deviationWord = coverage === "full" ? "opgraderet" : "nedgraderet";
    const pluralizeSlots = coverage === "full" ? "flere pladser end nødvendigt" : "ikke nok pladser";
    clauses.push(
      `Ideelt ${
        idealCov === "single"
          ? "ingen gardering"
          : idealCov === "half"
            ? "halvgarderet"
            : "helgarderet"
      }, men systemet har ${pluralizeSlots} — ${deviationWord}`
    );
  }

  // Join clauses and finalize
  if (clauses.length > 0) {
    text = text.replace(/\.$/, ` ${clauses.join(". ")}.`);
  }

  return text;
}
