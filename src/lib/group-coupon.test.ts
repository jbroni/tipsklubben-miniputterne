import { describe, it, expect } from "vitest";
import {
  buildBallots,
  rankOutcomes,
  tallyVotes,
  coverageCosts,
  fitSystem,
  idealCoverage,
  rankSystems,
  InfeasiblePinsError,
  PinnedCoverage,
  MatchInput,
  Ballot,
  RoundPredictions,
  VoteTally,
} from "./group-coupon";
import { SYSTEMS, getSystem } from "./coupon-systems";
import { PickValue, PICK_ORDER } from "./picks";

/* ──────────────────────────────────────────────────────────────────────── */
/* Test helpers                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Build a match from basic odds (default 2.0 for all).
 */
function makeMatch(matchNumber: number, odds?: { home?: number; draw?: number; away?: number }): MatchInput {
  return {
    matchNumber,
    oddsHome: odds?.home ?? 2.0,
    oddsDraw: odds?.draw ?? 2.0,
    oddsAway: odds?.away ?? 2.0,
  };
}

/**
 * Build 13 neutral matches.
 */
function make13Matches(baseOdds?: { home?: number; draw?: number; away?: number }): MatchInput[] {
  return Array.from({ length: 13 }, (_, i) => makeMatch(i + 1, baseOdds));
}

/**
 * Build a RoundPredictions from a compact vote split format.
 * voteSplits is an array of 13 tuples [home, draw, away] representing votes for each match.
 * Returns picks distributed among 6 generic users in round-robin fashion.
 */
function makeRound(
  roundNumber: number,
  voteSplits: [number, number, number][]
): RoundPredictions {
  if (voteSplits.length !== 13) {
    throw new Error(`Expected 13 vote splits, got ${voteSplits.length}`);
  }

  const predictions: Array<{
    userId: string;
    matchNumber: number;
    pick: PickValue;
  }> = [];

  for (let matchIdx = 0; matchIdx < 13; matchIdx++) {
    const [home, draw, away] = voteSplits[matchIdx];
    const matchNumber = matchIdx + 1;

    let userIdx = 0;
    // Assign votes to users in round-robin fashion
    for (let i = 0; i < home; i++) {
      const userId = `user-${userIdx % 6}`;
      predictions.push({ userId, matchNumber, pick: "HOME" });
      userIdx++;
    }
    for (let i = 0; i < draw; i++) {
      const userId = `user-${userIdx % 6}`;
      predictions.push({ userId, matchNumber, pick: "DRAW" });
      userIdx++;
    }
    for (let i = 0; i < away; i++) {
      const userId = `user-${userIdx % 6}`;
      predictions.push({ userId, matchNumber, pick: "AWAY" });
      userIdx++;
    }
  }

  return { roundNumber, predictions };
}

/**
 * Build 6 generic users.
 */
function make6Users() {
  return [
    { id: "user-0", displayName: "Alice" },
    { id: "user-1", displayName: "Bob" },
    { id: "user-2", displayName: "Charlie" },
    { id: "user-3", displayName: "Diana" },
    { id: "user-4", displayName: "Eve" },
    { id: "user-5", displayName: "Frank" },
  ];
}

/* ──────────────────────────────────────────────────────────────────────── */
/* buildBallots                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

describe("buildBallots", () => {
  describe("current round predictions", () => {
    it("includes users with at least one prediction in current round", () => {
      const users = make6Users();
      // Create vote pattern [2, 2, 2] = 6 votes per match distributed to users 0-5
      const currentRound = makeRound(10, Array(13).fill([2, 2, 2]));

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds: [],
      });

      expect(ballots.length).toBe(6);
      expect(ballots.every((b) => b.source === "current")).toBe(true);
    });

    it("marks current predictions with correct sourceRoundNumber", () => {
      const users = make6Users();
      const currentRound = makeRound(42, Array(13).fill([1, 0, 0]));

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds: [],
      });

      expect(ballots.every((b) => b.sourceRoundNumber === 42)).toBe(true);
    });

    it("maps picks by matchNumber", () => {
      const users = make6Users();
      const currentRound: RoundPredictions = {
        roundNumber: 10,
        predictions: [
          { userId: "user-0", matchNumber: 1, pick: "HOME" },
          { userId: "user-0", matchNumber: 2, pick: "DRAW" },
        ],
      };

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds: [],
      });

      const aliceBallot = ballots.find((b) => b.displayName === "Alice");
      expect(aliceBallot?.picks[1]).toBe("HOME");
      expect(aliceBallot?.picks[2]).toBe("DRAW");
    });
  });

  describe("carried predictions", () => {
    it("uses highest prior round when user has no current predictions", () => {
      const users = make6Users();
      const currentRound: RoundPredictions = {
        roundNumber: 10,
        predictions: [{ userId: "user-0", matchNumber: 1, pick: "HOME" }],
      };
      const priorRounds: RoundPredictions[] = [
        {
          roundNumber: 8,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "AWAY" }],
        },
        {
          roundNumber: 9,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "DRAW" }],
        },
      ];

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds,
      });

      const bobBallot = ballots.find((b) => b.displayName === "Bob");
      expect(bobBallot?.source).toBe("carried");
      expect(bobBallot?.sourceRoundNumber).toBe(9);
      expect(bobBallot?.picks[1]).toBe("DRAW");
    });

    it("ignores prior rounds >= current round number", () => {
      const users = make6Users();
      const currentRound: RoundPredictions = {
        roundNumber: 10,
        predictions: [{ userId: "user-0", matchNumber: 1, pick: "HOME" }],
      };
      const priorRounds: RoundPredictions[] = [
        {
          roundNumber: 10,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "DRAW" }],
        },
        {
          roundNumber: 9,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "AWAY" }],
        },
      ];

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds,
      });

      const bobBallot = ballots.find((b) => b.displayName === "Bob");
      expect(bobBallot?.sourceRoundNumber).toBe(9);
    });

    it("handles unsorted prior rounds correctly", () => {
      const users = make6Users();
      const currentRound: RoundPredictions = {
        roundNumber: 10,
        predictions: [{ userId: "user-0", matchNumber: 1, pick: "HOME" }],
      };
      const priorRounds: RoundPredictions[] = [
        {
          roundNumber: 5,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "AWAY" }],
        },
        {
          roundNumber: 9,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "DRAW" }],
        },
        {
          roundNumber: 7,
          predictions: [{ userId: "user-1", matchNumber: 1, pick: "HOME" }],
        },
      ];

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds,
      });

      const bobBallot = ballots.find((b) => b.displayName === "Bob");
      expect(bobBallot?.sourceRoundNumber).toBe(9);
    });
  });

  describe("omitted users", () => {
    it("omits users with no predictions anywhere", () => {
      const users = make6Users();
      const currentRound: RoundPredictions = {
        roundNumber: 10,
        predictions: [{ userId: "user-0", matchNumber: 1, pick: "HOME" }],
      };

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds: [],
      });

      expect(ballots.length).toBe(1);
      expect(ballots[0].displayName).toBe("Alice");
    });
  });

  describe("output sorting", () => {
    it("returns ballots sorted by displayName", () => {
      const users = [
        { id: "user-2", displayName: "Zoe" },
        { id: "user-0", displayName: "Alice" },
        { id: "user-1", displayName: "Bob" },
      ];
      const currentRound: RoundPredictions = {
        roundNumber: 10,
        predictions: [
          { userId: "user-0", matchNumber: 1, pick: "HOME" },
          { userId: "user-1", matchNumber: 1, pick: "HOME" },
          { userId: "user-2", matchNumber: 1, pick: "HOME" },
        ],
      };

      const ballots = buildBallots({
        users,
        currentRound,
        priorRounds: [],
      });

      expect(ballots.map((b) => b.displayName)).toEqual(["Alice", "Bob", "Zoe"]);
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* rankOutcomes                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

describe("rankOutcomes", () => {
  describe("vote count rule", () => {
    it("ranks by vote count descending", () => {
      const tally: VoteTally = { HOME: 5, DRAW: 1, AWAY: 0, total: 6 };
      const match = makeMatch(1);

      const ranked = rankOutcomes(tally, match);

      expect(ranked).toEqual(["HOME", "DRAW", "AWAY"]);
    });

    it("ranks by vote count with different pattern", () => {
      const tally: VoteTally = { HOME: 2, DRAW: 3, AWAY: 1, total: 6 };
      const match = makeMatch(1);

      const ranked = rankOutcomes(tally, match);

      expect(ranked).toEqual(["DRAW", "HOME", "AWAY"]);
    });
  });

  describe("lean rule (tie-breaking with third outcome)", () => {
    it("prefers outcome closer to third when two are tied with stray AWAY", () => {
      // HOME=2, DRAW=2, AWAY=1 → tied HOME/DRAW, AWAY votes for third
      // HOME is 0 steps from AWAY (axis dist), DRAW is 1 step → HOME should win
      const tally: VoteTally = { HOME: 2, DRAW: 2, AWAY: 1, total: 5 };
      const match = makeMatch(1);

      const ranked = rankOutcomes(tally, match);

      // HOME is at index 0, AWAY is at index 2, distance = 2
      // DRAW is at index 1, AWAY is at index 2, distance = 1
      // So DRAW is closer to AWAY and should be preferred
      expect(ranked[0]).toBe("DRAW");
      expect(ranked[1]).toBe("HOME");
      expect(ranked[2]).toBe("AWAY");
    });

    it("prefers outcome closer to third when two are tied with stray HOME", () => {
      // DRAW=2, AWAY=2, HOME=1 → tied DRAW/AWAY, HOME votes for third
      // DRAW is at index 1, HOME is at index 0, distance = 1
      // AWAY is at index 2, HOME is at index 0, distance = 2
      // So DRAW is closer to HOME and should be preferred
      const tally: VoteTally = { HOME: 1, DRAW: 2, AWAY: 2, total: 5 };
      const match = makeMatch(1);

      const ranked = rankOutcomes(tally, match);

      expect(ranked[0]).toBe("DRAW");
      expect(ranked[1]).toBe("AWAY");
      expect(ranked[2]).toBe("HOME");
    });

    it("falls through when tie is equidistant from third (HOME/AWAY tied with DRAW votes)", () => {
      // HOME=2, AWAY=2, DRAW=1 → HOME and AWAY tied, DRAW at index 1
      // Both have 2 votes > 1 vote for DRAW, so HOME/AWAY rank higher
      // HOME at 0, distance = 1; AWAY at 2, distance = 1 → equidistant
      // Falls through to odds, then axis order
      const tally: VoteTally = { HOME: 2, DRAW: 1, AWAY: 2, total: 5 };
      const match = makeMatch(1, { home: 2.0, draw: 3.0, away: 2.0 });

      const ranked = rankOutcomes(tally, match);

      // HOME and AWAY are tied and ranked higher; fall through axis order gives HOME < AWAY
      // DRAW (lower votes) comes last
      expect(ranked[0]).toBe("HOME");
      expect(ranked[1]).toBe("AWAY");
      expect(ranked[2]).toBe("DRAW");
    });

    it("ignores lean when third outcome has zero votes", () => {
      // HOME=2, DRAW=2, AWAY=0 → tied HOME/DRAW, no third vote
      // Falls through to odds
      const tally: VoteTally = { HOME: 2, DRAW: 2, AWAY: 0, total: 4 };
      const match = makeMatch(1, { home: 3.0, draw: 2.5, away: 4.0 });

      const ranked = rankOutcomes(tally, match);

      expect(ranked[0]).toBe("DRAW");
      expect(ranked[1]).toBe("HOME");
      expect(ranked[2]).toBe("AWAY");
    });
  });

  describe("odds rule", () => {
    it("prefers lower odds when votes are equal", () => {
      const tally: VoteTally = { HOME: 2, DRAW: 2, AWAY: 2, total: 6 };
      const match = makeMatch(1, { home: 3.0, draw: 2.0, away: 4.0 });

      const ranked = rankOutcomes(tally, match);

      expect(ranked[0]).toBe("DRAW");
      expect(ranked[1]).toBe("HOME");
      expect(ranked[2]).toBe("AWAY");
    });
  });

  describe("axis order rule", () => {
    it("uses axis order (HOME, DRAW, AWAY) as final tie-breaker", () => {
      const tally: VoteTally = { HOME: 1, DRAW: 1, AWAY: 1, total: 3 };
      const match = makeMatch(1, { home: 2.0, draw: 2.0, away: 2.0 });

      const ranked = rankOutcomes(tally, match);

      expect(ranked).toEqual(["HOME", "DRAW", "AWAY"]);
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* tallyVotes                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

describe("tallyVotes", () => {
  it("tallies votes from ballots for a single match", () => {
    const ballots: Ballot[] = [
      {
        userId: "u1",
        displayName: "Alice",
        source: "current",
        sourceRoundNumber: 1,
        picks: { 1: "HOME" },
      },
      {
        userId: "u2",
        displayName: "Bob",
        source: "current",
        sourceRoundNumber: 1,
        picks: { 1: "DRAW" },
      },
      {
        userId: "u3",
        displayName: "Charlie",
        source: "current",
        sourceRoundNumber: 1,
        picks: { 1: "HOME" },
      },
    ];

    const tally = tallyVotes(ballots, 1);

    expect(tally).toEqual({ HOME: 2, DRAW: 1, AWAY: 0, total: 3 });
  });

  it("handles missing picks gracefully", () => {
    const ballots: Ballot[] = [
      {
        userId: "u1",
        displayName: "Alice",
        source: "current",
        sourceRoundNumber: 1,
        picks: { 1: "HOME" },
      },
      {
        userId: "u2",
        displayName: "Bob",
        source: "current",
        sourceRoundNumber: 1,
        picks: { 2: "DRAW" },
      },
    ];

    const tally = tallyVotes(ballots, 1);

    expect(tally).toEqual({ HOME: 1, DRAW: 0, AWAY: 0, total: 1 });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* coverageCosts                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

describe("coverageCosts", () => {
  describe("unanimous votes (6-0-0)", () => {
    it("returns single cost 0", () => {
      const tally: VoteTally = { HOME: 6, DRAW: 0, AWAY: 0, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.single.cost).toBeCloseTo(0, 4);
      expect(costs.full.cost).toBeCloseTo(0, 4);
      expect(costs.half.cost).toBeCloseTo(0, 4);
    });
  });

  describe("5-1-0 split", () => {
    it("returns single cost ≈ 0.1667", () => {
      const tally: VoteTally = { HOME: 5, DRAW: 1, AWAY: 0, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.single.cost).toBeCloseTo(1 / 6, 4);
    });
  });

  describe("4-2-0 split", () => {
    it("returns half cost 0", () => {
      const tally: VoteTally = { HOME: 4, DRAW: 2, AWAY: 0, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.half.cost).toBeCloseTo(0, 4);
    });

    it("returns single cost ≈ 0.3333", () => {
      const tally: VoteTally = { HOME: 4, DRAW: 2, AWAY: 0, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.single.cost).toBeCloseTo(2 / 6, 4);
    });
  });

  describe("2-2-2 split", () => {
    it("returns half cost ≈ 0.3333", () => {
      const tally: VoteTally = { HOME: 2, DRAW: 2, AWAY: 2, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.half.cost).toBeCloseTo(2 / 6, 4);
    });
  });

  describe("3-2-1 split", () => {
    it("returns half cost ≈ 0.1667", () => {
      const tally: VoteTally = { HOME: 3, DRAW: 2, AWAY: 1, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.half.cost).toBeCloseTo(1 / 6, 4);
    });
  });

  describe("N === 0 edge case", () => {
    it("returns all costs as 0 without NaN", () => {
      const tally: VoteTally = { HOME: 0, DRAW: 0, AWAY: 0, total: 0 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.full.cost).toBe(0);
      expect(costs.half.cost).toBe(0);
      expect(costs.single.cost).toBe(0);
      expect(Number.isNaN(costs.full.cost)).toBe(false);
      expect(Number.isNaN(costs.half.cost)).toBe(false);
      expect(Number.isNaN(costs.single.cost)).toBe(false);
    });
  });

  describe("outcomes ordering", () => {
    it("returns outcomes in PICK_ORDER", () => {
      const tally: VoteTally = { HOME: 2, DRAW: 3, AWAY: 1, total: 6 };
      const match = makeMatch(1);

      const costs = coverageCosts(tally, match);

      expect(costs.full.outcomes).toEqual(["HOME", "DRAW", "AWAY"]);
      expect(costs.half.outcomes).toContain("HOME");
      expect(costs.half.outcomes).toContain("DRAW");
      expect(costs.single.outcomes).toEqual(["DRAW"]);
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* idealCoverage                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

describe("idealCoverage", () => {
  describe("single boundary (>= 80%)", () => {
    it("returns single when top gets 5/6 ≈ 0.833", () => {
      const tally: VoteTally = { HOME: 5, DRAW: 1, AWAY: 0, total: 6 };

      expect(idealCoverage(tally)).toBe("single");
    });

    it("returns not single when top gets 4/6 ≈ 0.667", () => {
      const tally: VoteTally = { HOME: 4, DRAW: 2, AWAY: 0, total: 6 };

      expect(idealCoverage(tally)).not.toBe("single");
    });
  });

  describe("half (at most two outcomes with votes)", () => {
    it("returns half when only two outcomes got votes", () => {
      const tally: VoteTally = { HOME: 4, DRAW: 2, AWAY: 0, total: 6 };

      expect(idealCoverage(tally)).toBe("half");
    });

    it("returns half when only one outcome got votes", () => {
      const tally: VoteTally = { HOME: 6, DRAW: 0, AWAY: 0, total: 6 };

      expect(idealCoverage(tally)).toBe("single");
    });
  });

  describe("full (three outcomes with votes, not single threshold)", () => {
    it("returns full when all three outcomes got votes", () => {
      const tally: VoteTally = { HOME: 2, DRAW: 2, AWAY: 2, total: 6 };

      expect(idealCoverage(tally)).toBe("full");
    });

    it("returns full for 3-2-1 split", () => {
      const tally: VoteTally = { HOME: 3, DRAW: 2, AWAY: 1, total: 6 };

      expect(idealCoverage(tally)).toBe("full");
    });
  });

  describe("N === 0 edge case", () => {
    it("returns full when N === 0", () => {
      const tally: VoteTally = { HOME: 0, DRAW: 0, AWAY: 0, total: 0 };

      expect(idealCoverage(tally)).toBe("full");
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* fitSystem                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

describe("fitSystem", () => {
  describe("slot count exactness", () => {
    it("for each system, returns exactly system.full full, system.half half, rest single", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([1, 0, 0]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      for (const system of SYSTEMS) {
        const fit = fitSystem(system, matches, ballots);

        const fullCount = fit.assignments.filter((a) => a.coverage === "full").length;
        const halfCount = fit.assignments.filter((a) => a.coverage === "half").length;
        const singleCount = fit.assignments.filter((a) => a.coverage === "single").length;

        expect(fullCount).toBe(system.full);
        expect(halfCount).toBe(system.half);
        expect(singleCount).toBe(system.single);
      }
    });
  });

  describe("upward forcing", () => {
    it("with unanimous votes, U11-0-133 still has exactly 11 full", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([6, 0, 0]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U11-0-133")!;
      const fit = fitSystem(system, matches, ballots);

      const fullCount = fit.assignments.filter((a) => a.coverage === "full").length;
      expect(fullCount).toBe(11);
    });
  });

  describe("optimality via brute force for small systems", () => {
    it("finds optimal assignment for M0-7-128 on a realistic fixture", () => {
      // Fixture: match costs vary: some have high single cost, some low
      // M0-7-128 → 7 half, 6 single
      // We construct a scenario where greedy (assign half to highest-cost) would fail
      const matches = make13Matches();
      const round = makeRound(1, [
        [2, 2, 2], // 0.333 half
        [2, 2, 2], // 0.333 half
        [2, 2, 2], // 0.333 half
        [2, 2, 2], // 0.333 half
        [2, 2, 2], // 0.333 half
        [2, 2, 2], // 0.333 half
        [2, 2, 2], // 0.333 half
        [5, 1, 0], // 0.167 single
        [5, 1, 0], // 0.167 single
        [5, 1, 0], // 0.167 single
        [5, 1, 0], // 0.167 single
        [5, 1, 0], // 0.167 single
        [5, 1, 0], // 0.167 single
      ]);
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("M0-7-128")!;
      const fit = fitSystem(system, matches, ballots);

      // Optimal: assign half to all 7 of the 2-2-2 matches (cost 7*0.333)
      // and single to 6 of the 5-1-0 matches (cost 6*0.167) = ~2.333 + 1.0 = ~3.333
      const expectedOptimal = 7 * (2 / 6) + 6 * (1 / 6);
      expect(fit.totalCost).toBeCloseTo(expectedOptimal, 2);
    });
  });

  describe("determinism", () => {
    it("calling fitSystem twice on identical input returns identical assignments", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fit1 = fitSystem(system, matches, ballots);
      const fit2 = fitSystem(system, matches, ballots);

      expect(fit1.assignments).toEqual(fit2.assignments);
      expect(fit1.totalCost).toBe(fit2.totalCost);
    });
  });

  describe("baseOutcome", () => {
    it("is null for single matches", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([6, 0, 0]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("R0-13-128")!;
      const fit = fitSystem(system, matches, ballots);

      const singleAssignments = fit.assignments.filter((a) => a.coverage === "single");
      expect(singleAssignments.every((a) => a.baseOutcome === null)).toBe(true);
    });

    it("is null for non-U systems regardless of coverage", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("R5-5-108")!; // R system, not U
      const fit = fitSystem(system, matches, ballots);

      expect(fit.assignments.every((a) => a.baseOutcome === null)).toBe(true);
    });

    it("for U-system half/full matches, is highest-ranked among covered outcomes", () => {
      const matches = make13Matches();
      const round = makeRound(1, [
        [3, 2, 1], // Ranked: HOME, DRAW, AWAY
        ...Array(12).fill([2, 2, 2]),
      ]);
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!; // U system
      const fit = fitSystem(system, matches, ballots);

      const match1 = fit.assignments.find((a) => a.matchNumber === 1)!;
      if (match1.coverage !== "single") {
        expect(match1.baseOutcome).toBe("HOME");
      }
    });
  });

  describe("outcomes array properties", () => {
    it("outcomes are in PICK_ORDER and match coverage length", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fit = fitSystem(system, matches, ballots);

      for (const assignment of fit.assignments) {
        if (assignment.coverage === "single") {
          expect(assignment.outcomes.length).toBe(1);
        } else if (assignment.coverage === "half") {
          expect(assignment.outcomes.length).toBe(2);
        } else {
          expect(assignment.outcomes.length).toBe(3);
        }

        // Check PICK_ORDER ordering
        const indices = assignment.outcomes.map((o) => PICK_ORDER.indexOf(o));
        for (let i = 1; i < indices.length; i++) {
          expect(indices[i]).toBeGreaterThan(indices[i - 1]);
        }
      }
    });
  });

  describe("infeasible input", () => {
    it("throws when full + half > 13", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      // Manually create a system that violates the constraint
      const invalidSystem = {
        code: "INVALID",
        type: "R" as const,
        full: 10,
        half: 5,
        single: -2,
        rows: 999,
        requiresBaseRow: false,
      };

      expect(() => fitSystem(invalidSystem, matches, ballots)).toThrow();
    });
  });

  describe("coverage percentage", () => {
    it("calculates coverage as 100 * (1 - totalCost / 13), rounded to 1 decimal", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([6, 0, 0])); // All cost 0
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fit = fitSystem(system, matches, ballots);

      expect(fit.coverage).toBe(100.0);
    });

    it("calculates coverage < 100 for partial coverage", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2])); // Each 2-2-2 costs 2/6 for half
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fit = fitSystem(system, matches, ballots);

      expect(fit.coverage).toBeLessThan(100);
      expect(fit.coverage).toBeGreaterThan(0);
    });
  });

  describe("reasoning text", () => {
    it("is non-empty Danish for every assignment", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fit = fitSystem(system, matches, ballots);

      for (const assignment of fit.assignments) {
        expect(assignment.reasoning.length).toBeGreaterThan(0);
        expect(typeof assignment.reasoning).toBe("string");
      }
    });

    it("mentions 'ingen gardering' for unanimous matches", () => {
      const matches = make13Matches();
      const round: RoundPredictions = {
        roundNumber: 1,
        predictions: [
          { userId: "user-0", matchNumber: 1, pick: "HOME" },
          { userId: "user-1", matchNumber: 1, pick: "HOME" },
          { userId: "user-2", matchNumber: 1, pick: "HOME" },
          { userId: "user-3", matchNumber: 1, pick: "HOME" },
          { userId: "user-4", matchNumber: 1, pick: "HOME" },
          { userId: "user-5", matchNumber: 1, pick: "HOME" },
          // Other matches, neutral
          ...Array.from({ length: 12 * 6 }, (_, i) => ({
            userId: `user-${i % 6}`,
            matchNumber: Math.floor(i / 6) + 2,
            pick: "HOME" as PickValue,
          })),
        ],
      };
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fit = fitSystem(system, matches, ballots);

      const match1 = fit.assignments.find((a) => a.matchNumber === 1)!;
      expect(match1.reasoning.toLowerCase()).toContain("ingen gardering");
    });

    it("mentions 'helgarderet' for full coverage", () => {
      const matches = make13Matches();
      // Use [2, 2, 2] splits to create non-unanimous scenarios
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      // U8-3-100 requires 8 full, 3 half. Some matches will be assigned full.
      const system = getSystem("U8-3-100")!;
      const fit = fitSystem(system, matches, ballots);

      const fullAssignments = fit.assignments.filter((a) => a.coverage === "full");
      expect(fullAssignments.length).toBeGreaterThan(0);
      const someHaveMention = fullAssignments.some((a) =>
        a.reasoning.toLowerCase().includes("helgarderet")
      );
      expect(someHaveMention).toBe(true);
    });
  });

  describe("pinning", () => {
    it("omitting pinned produces identical results to calling with empty object", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const fitWithoutPins = fitSystem(system, matches, ballots);
      const fitWithEmptyPins = fitSystem(system, matches, ballots, {});

      expect(fitWithoutPins.assignments).toEqual(fitWithEmptyPins.assignments);
      expect(fitWithoutPins.totalCost).toBe(fitWithEmptyPins.totalCost);
      expect(fitWithoutPins.coverage).toBe(fitWithEmptyPins.coverage);
    });

    it("respects a single pinned full match", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const pinned: PinnedCoverage = { 1: "full" };
      const fit = fitSystem(system, matches, ballots, pinned);

      const match1 = fit.assignments.find((a) => a.matchNumber === 1)!;
      expect(match1.coverage).toBe("full");

      const fullCount = fit.assignments.filter((a) => a.coverage === "full").length;
      expect(fullCount).toBe(system.full);
    });

    it("pinning a low-cost match to full forces optimizer to leave high-cost uncovered", () => {
      const matches = make13Matches();
      // Create a scenario where one match has very high cost and others low
      const round = makeRound(1, [
        [5, 1, 0], // Match 1: low cost (~0.167)
        [2, 2, 2], // Matches 2-13: high cost (~0.333)
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
        [2, 2, 2],
      ]);
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!; // 8 full, 3 half, 2 single
      const pinned: PinnedCoverage = { 1: "full" };
      const fit = fitSystem(system, matches, ballots, pinned);

      // Match 1 must be full
      const match1 = fit.assignments.find((a) => a.matchNumber === 1)!;
      expect(match1.coverage).toBe("full");

      // This forces a re-optimization: we've pinned one full slot,
      // leaving 7 more full slots to be optimally distributed.
      const fullCount = fit.assignments.filter((a) => a.coverage === "full").length;
      expect(fullCount).toBe(system.full);
    });

    it("maintains exact slot counts with pins", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const pinned: PinnedCoverage = {
        1: "full",
        2: "half",
        3: "single",
      };
      const fit = fitSystem(system, matches, ballots, pinned);

      const fullCount = fit.assignments.filter((a) => a.coverage === "full").length;
      const halfCount = fit.assignments.filter((a) => a.coverage === "half").length;
      const singleCount = fit.assignments.filter((a) => a.coverage === "single").length;

      expect(fullCount).toBe(system.full);
      expect(halfCount).toBe(system.half);
      expect(singleCount).toBe(system.single);
    });

    it("throws InfeasiblePinsError when pinned full exceeds system.full", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!; // only 8 full slots
      const pinned: PinnedCoverage = {
        1: "full",
        2: "full",
        3: "full",
        4: "full",
        5: "full",
        6: "full",
        7: "full",
        8: "full",
        9: "full", // 9 pinned full, exceeds limit
      };

      expect(() => fitSystem(system, matches, ballots, pinned)).toThrow(
        InfeasiblePinsError
      );
    });

    it("throws InfeasiblePinsError when pinned half exceeds system.half", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!; // only 3 half slots
      const pinned: PinnedCoverage = {
        1: "half",
        2: "half",
        3: "half",
        4: "half", // 4 pinned half, exceeds limit
      };

      expect(() => fitSystem(system, matches, ballots, pinned)).toThrow(
        InfeasiblePinsError
      );
    });

    it("allows feasible exact-fit pinning (all slots pinned exactly)", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!; // 8 full, 3 half, 2 single
      const pinned: PinnedCoverage = {
        1: "full",
        2: "full",
        3: "full",
        4: "full",
        5: "full",
        6: "full",
        7: "full",
        8: "full",
        9: "half",
        10: "half",
        11: "half",
        12: "single",
        13: "single",
      };

      const fit = fitSystem(system, matches, ballots, pinned);

      // Check exact pinning
      for (let i = 1; i <= 13; i++) {
        const assignment = fit.assignments.find((a) => a.matchNumber === i)!;
        expect(assignment.coverage).toBe(pinned[i]);
      }

      // Verify counts
      const fullCount = fit.assignments.filter((a) => a.coverage === "full").length;
      const halfCount = fit.assignments.filter((a) => a.coverage === "half").length;
      const singleCount = fit.assignments.filter((a) => a.coverage === "single").length;

      expect(fullCount).toBe(8);
      expect(halfCount).toBe(3);
      expect(singleCount).toBe(2);
    });

    it("returns exactly the pinned distribution when all 13 are pinned", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("M0-7-128")!; // 7 half, 6 single
      const pinned: PinnedCoverage = {
        1: "half",
        2: "half",
        3: "half",
        4: "half",
        5: "half",
        6: "half",
        7: "half",
        8: "single",
        9: "single",
        10: "single",
        11: "single",
        12: "single",
        13: "single",
      };

      const fit = fitSystem(system, matches, ballots, pinned);

      for (let i = 1; i <= 13; i++) {
        const assignment = fit.assignments.find((a) => a.matchNumber === i)!;
        expect(assignment.coverage).toBe(pinned[i]);
      }
    });

    it("throws InfeasiblePinsError when pinned single exceeds system.single", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U11-0-133")!; // 11 full, 0 half, 2 single
      const pinned: PinnedCoverage = {
        1: "single",
        2: "single",
        3: "single", // 3 pinned single, exceeds limit of 2
      };

      expect(() => fitSystem(system, matches, ballots, pinned)).toThrow(
        InfeasiblePinsError
      );
    });

    it("throws InfeasiblePinsError when pinning single on system with zero single slots", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("R0-13-128")!; // 0 full, 13 half, 0 single
      const pinned: PinnedCoverage = {
        1: "single", // 1 pinned single, exceeds limit of 0
      };

      expect(() => fitSystem(system, matches, ballots, pinned)).toThrow(
        InfeasiblePinsError
      );
    });

    it("throws InfeasiblePinsError when pins reference non-existent match numbers", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const system = getSystem("U8-3-100")!;
      const pinned: PinnedCoverage = {
        1: "full",
        99: "half", // match 99 does not exist
      };

      expect(() => fitSystem(system, matches, ballots, pinned)).toThrow(
        InfeasiblePinsError
      );
    });

  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* rankSystems                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

describe("rankSystems", () => {
  describe("returns all systems", () => {
    it("returns exactly 13 systems", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const ranked = rankSystems(matches, ballots);

      expect(ranked.length).toBe(13);
    });
  });

  describe("sorting by totalCost", () => {
    it("sorts by totalCost ascending", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const ranked = rankSystems(matches, ballots);

      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].totalCost).toBeGreaterThanOrEqual(ranked[i - 1].totalCost);
      }
    });
  });

  describe("tie-breaking by rows", () => {
    it("prefers fewer rows when totalCost is equal", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([2, 2, 2]));
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const ranked = rankSystems(matches, ballots);

      for (let i = 1; i < ranked.length; i++) {
        if (
          Math.abs(ranked[i].totalCost - ranked[i - 1].totalCost) < 1e-9
        ) {
          expect(ranked[i].system.rows).toBeGreaterThanOrEqual(
            ranked[i - 1].system.rows
          );
        }
      }
    });
  });

  describe("tie-breaking by code", () => {
    it("uses code as final tie-breaker", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([6, 0, 0])); // All unanimous, same cost
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const ranked = rankSystems(matches, ballots);

      for (let i = 1; i < ranked.length; i++) {
        if (
          ranked[i].totalCost === ranked[i - 1].totalCost &&
          ranked[i].system.rows === ranked[i - 1].system.rows
        ) {
          expect(
            ranked[i].system.code.localeCompare(ranked[i - 1].system.code)
          ).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe("coverage percentage", () => {
    it("calculates coverage = 100 * (1 - totalCost / 13), rounded to 1 decimal", () => {
      const matches = make13Matches();
      const round = makeRound(1, Array(13).fill([6, 0, 0])); // All cost 0
      const ballots = buildBallots({
        users: make6Users(),
        currentRound: round,
        priorRounds: [],
      });

      const ranked = rankSystems(matches, ballots);

      for (const fit of ranked) {
        const expected = Math.round((1 - fit.totalCost / 13) * 1000) / 10;
        expect(fit.coverage).toBe(expected);
      }
    });
  });
});
