import { describe, it, expect } from "vitest";
import {
  planCarryOvers,
  CarryOverRound,
  CarriedPrediction,
} from "./carry-over";
import type { PickValue } from "./picks";

/* ──────────────────────────────────────────────────────────────────────── */
/* Test helpers                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Build a CarryOverRound with basic defaults.
 */
function makeRound(
  roundNumber: number,
  roundId: string,
  matchCount: number = 13,
  predictions: Array<{
    userId: string;
    matchNumber: number;
    pick: PickValue;
    carriedFromRoundNumber?: number | null;
  }> = []
): CarryOverRound {
  const matches = Array.from({ length: matchCount }, (_, i) => ({
    id: `match-${roundId}-${i + 1}`,
    matchNumber: i + 1,
  }));

  // Default carriedFromRoundNumber to null for predictions that don't specify it
  const normalizedPredictions = predictions.map(p => ({
    ...p,
    carriedFromRoundNumber: p.carriedFromRoundNumber ?? null,
  }));

  return {
    roundId,
    roundNumber,
    matches,
    predictions: normalizedPredictions as Array<{
      userId: string;
      matchNumber: number;
      pick: PickValue;
      carriedFromRoundNumber: number | null;
    }>,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Basic carry-over                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

describe("planCarryOvers", () => {
  describe("basic carry-over", () => {
    it("copies picks from earlier round when user has zero predictions in current round", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-1", matchNumber: 2, pick: "DRAW" },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const result = planCarryOvers([round1, round2]);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        roundId: "r2",
        userId: "user-1",
        matchId: "match-r2-1",
        pick: "HOME",
        carriedFromRoundNumber: 1,
      });
      expect(result[1]).toMatchObject({
        roundId: "r2",
        userId: "user-1",
        matchId: "match-r2-2",
        pick: "DRAW",
        carriedFromRoundNumber: 1,
      });
    });

    it("skips user if they have any prediction in target round", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-1", matchNumber: 2, pick: "DRAW" },
      ]);

      const round2 = makeRound(2, "r2", 13, [
        { userId: "user-1", matchNumber: 1, pick: "AWAY" },
      ]);

      const result = planCarryOvers([round1, round2]);

      expect(result).toHaveLength(0);
    });

    it("skips user if they have no history in earlier rounds", () => {
      const round1 = makeRound(1, "r1", 13, []);

      const round2 = makeRound(2, "r2", 13, []);

      const result = planCarryOvers([round1, round2]);

      expect(result).toHaveLength(0);
    });
  });

  describe("highest earlier round selection", () => {
    it("uses the highest-numbered earlier round with user predictions", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      const round2 = makeRound(2, "r2", 13, [
        { userId: "user-1", matchNumber: 1, pick: "DRAW" },
      ]);

      const round3 = makeRound(3, "r3", 13, []);

      const result = planCarryOvers([round1, round2, round3]);

      expect(result).toHaveLength(1);
      expect(result[0].pick).toBe("DRAW");
      expect(result[0].carriedFromRoundNumber).toBe(2);
    });

    it("skips rounds with roundNumber >= current round", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      const round2 = makeRound(2, "r2", 13, [
        { userId: "user-1", matchNumber: 1, pick: "DRAW" },
      ]);

      const round3 = makeRound(3, "r3", 13, [
        { userId: "user-1", matchNumber: 1, pick: "AWAY" },
      ]);

      // Query for round 3, should use round 2, not round 3
      const result = planCarryOvers([round1, round2, round3]);

      // Round 3 has user prediction, so no carry-over needed
      expect(result).toHaveLength(0);
    });
  });

  describe("chaining across multiple rounds", () => {
    it("carries picks from round N as source for round N+1 in same call", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME", carriedFromRoundNumber: null },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const round3 = makeRound(3, "r3", 13, []);

      const result = planCarryOvers([round1, round2, round3]);

      // User-1 should have picks in both round2 and round3
      const round2Picks = result.filter((p) => p.roundId === "r2");
      const round3Picks = result.filter((p) => p.roundId === "r3");

      expect(round2Picks).toHaveLength(1);
      expect(round3Picks).toHaveLength(1);

      // Both should have carriedFromRoundNumber = 1 (original source)
      expect(round2Picks[0].carriedFromRoundNumber).toBe(1);
      expect(round3Picks[0].carriedFromRoundNumber).toBe(1);
    });

    it("uses carries planned in earlier rounds as source for later rounds", () => {
      // Round 1: user-1 submits matchNumber 1
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME", carriedFromRoundNumber: null },
      ]);

      // Round 2: no predictions (will be filled with carries from round1)
      const round2 = makeRound(2, "r2", 13, []);

      // Round 3: no predictions (will be filled with carries from round2)
      const round3 = makeRound(3, "r3", 13, []);

      // Round 4: no predictions (will be filled with carries from round3)
      const round4 = makeRound(4, "r4", 13, []);

      const result = planCarryOvers([round1, round2, round3, round4]);

      // Check that all rounds have the carry
      const round2Carries = result.filter((p) => p.roundId === "r2");
      const round3Carries = result.filter((p) => p.roundId === "r3");
      const round4Carries = result.filter((p) => p.roundId === "r4");

      expect(round2Carries).toHaveLength(1);
      expect(round3Carries).toHaveLength(1);
      expect(round4Carries).toHaveLength(1);

      // All should track back to round 1 as the original source
      expect(round2Carries[0].carriedFromRoundNumber).toBe(1);
      expect(round3Carries[0].carriedFromRoundNumber).toBe(1);
      expect(round4Carries[0].carriedFromRoundNumber).toBe(1);
    });

    it("propagates original carriedFromRoundNumber through chain", () => {
      // Round 1: user-1 submits directly
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      // Round 2: user-1 missed, picks carried from round 1
      const round2 = makeRound(2, "r2", 13, []);

      // Round 3: user-1 missed, should carry from round 1 through round 2
      const round3 = makeRound(3, "r3", 13, []);

      const result = planCarryOvers([round1, round2, round3]);

      // All three picks (one per round, but round2 and round3 are carries) should
      // originate from round 1
      const allCarries = result.filter((p) => p.userId === "user-1");
      expect(allCarries.every((p) => p.carriedFromRoundNumber === 1)).toBe(true);
    });

    it("preserves carriedFromRoundNumber when applying to existing carried predictions", () => {
      // Round 1: original submission
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      // Round 2: carry applied (pre-existing)
      const round2 = makeRound(2, "r2", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME", carriedFromRoundNumber: 1 },
      ]);

      // Round 3: no predictions, should use round 2's carries but track original source
      const round3 = makeRound(3, "r3", 13, []);

      const result = planCarryOvers([round1, round2, round3]);

      // Only round 3 should have new carries
      const round3Carries = result.filter((p) => p.roundId === "r3");
      expect(round3Carries[0].carriedFromRoundNumber).toBe(1);
    });
  });

  describe("matchNumber mapping", () => {
    it("maps picks by matchNumber across rounds", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 3, pick: "HOME" },
        { userId: "user-1", matchNumber: 5, pick: "DRAW" },
        { userId: "user-1", matchNumber: 7, pick: "AWAY" },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const result = planCarryOvers([round1, round2]);

      expect(result).toHaveLength(3);
      const picksByMatchId = Object.fromEntries(
        result.map((p) => [p.matchId, p.pick])
      );

      expect(picksByMatchId["match-r2-3"]).toBe("HOME");
      expect(picksByMatchId["match-r2-5"]).toBe("DRAW");
      expect(picksByMatchId["match-r2-7"]).toBe("AWAY");
    });

    it("skips matchNumbers absent in target round", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-1", matchNumber: 5, pick: "DRAW" },
      ]);

      // Round 2 has only 5 matches
      const round2 = makeRound(2, "r2", 5, []);

      const result = planCarryOvers([round1, round2]);

      // Only matchNumber 1 and 5 from round1, but only 1-5 exist in round2
      // So we should get both, since both are in range [1..5]
      expect(result).toHaveLength(2);

      // But if round1 had matchNumber 10, it would be skipped for round2
      const round1b = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-1", matchNumber: 10, pick: "DRAW" },
      ]);

      const round2b = makeRound(2, "r2", 5, []);

      const resultb = planCarryOvers([round1b, round2b]);

      // Only matchNumber 1 should be carried (10 doesn't exist in round2)
      expect(resultb).toHaveLength(1);
      expect(resultb[0].pick).toBe("HOME");
    });
  });

  describe("unsorted input", () => {
    it("processes rounds in ascending order by roundNumber", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const round3 = makeRound(3, "r3", 13, []);

      // Pass in scrambled order
      const result = planCarryOvers([round3, round1, round2]);

      // Should still chain properly
      const allPicks = result.filter((p) => p.userId === "user-1");
      expect(allPicks).toHaveLength(2);
      expect(allPicks[0].roundId).toBe("r2");
      expect(allPicks[1].roundId).toBe("r3");
    });

    it("maintains deterministic output regardless of input order", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-2", matchNumber: 1, pick: "HOME" },
        { userId: "user-1", matchNumber: 2, pick: "DRAW" },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const result1 = planCarryOvers([round1, round2]);
      const result2 = planCarryOvers([round2, round1]);

      expect(result1).toEqual(result2);
    });
  });

  describe("skip conditions", () => {
    it("skips rounds with zero matches", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      const round2 = makeRound(2, "r2", 0, []);

      const result = planCarryOvers([round1, round2]);

      expect(result).toHaveLength(0);
    });

    it("skips users with no history", () => {
      // round1 has only user-1
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      // round2 is empty (no submissions)
      const round2 = makeRound(2, "r2", 13, []);

      // round3 has user-2 (who has NO history before round3)
      const round3 = makeRound(3, "r3", 13, [
        { userId: "user-2", matchNumber: 1, pick: "DRAW" },
      ]);

      const result = planCarryOvers([round1, round2, round3]);

      // user-2 has no earlier history, so no carry-over for them
      // user-1 should be carried to round2 and round3
      expect(result).toHaveLength(2);
      const user1Carries = result.filter(p => p.userId === "user-1");
      expect(user1Carries).toHaveLength(2);
    });

    it("skips user with any prediction in target round (idempotent)", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-1", matchNumber: 2, pick: "DRAW" },
      ]);

      // User has partial prediction (only 1 match in round2)
      const round2 = makeRound(2, "r2", 13, [
        { userId: "user-1", matchNumber: 1, pick: "AWAY" },
      ]);

      const result = planCarryOvers([round1, round2]);

      // User has at least one prediction in round2, so no carry-over (idempotent)
      expect(result).toHaveLength(0);
    });
  });

  describe("idempotency", () => {
    it("running twice on output-applied data yields nothing", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const firstRun = planCarryOvers([round1, round2]);
      expect(firstRun).toHaveLength(1);

      // Simulate applying the results: update round2 with the carried predictions
      const appliedRound2: CarryOverRound = {
        roundId: "r2",
        roundNumber: 2,
        matches: round2.matches,
        predictions: [
          {
            userId: "user-1",
            matchNumber: 1,
            pick: "HOME",
            carriedFromRoundNumber: 1,
          },
        ],
      };

      // Run again with the applied results
      const secondRun = planCarryOvers([round1, appliedRound2]);
      expect(secondRun).toHaveLength(0);
    });
  });

  describe("deterministic output ordering", () => {
    it("returns deterministic results (same input yields same output)", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "alice", matchNumber: 5, pick: "HOME", carriedFromRoundNumber: null },
        { userId: "bob", matchNumber: 3, pick: "DRAW", carriedFromRoundNumber: null },
        { userId: "alice", matchNumber: 2, pick: "AWAY", carriedFromRoundNumber: null },
      ]);

      const round2 = makeRound(2, "r2", 13, []);
      const round3 = makeRound(3, "r3", 13, []);

      // Run twice with same input in different order
      const result1 = planCarryOvers([round1, round2, round3]);
      const result2 = planCarryOvers([round3, round1, round2]);

      // Results should be identical
      expect(result1).toEqual(result2);
    });
  });

  describe("multiple users and rounds", () => {
    it("handles multiple users independently", () => {
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-2", matchNumber: 1, pick: "DRAW" },
        { userId: "user-3", matchNumber: 1, pick: "AWAY" },
      ]);

      const round2 = makeRound(2, "r2", 13, []);

      const result = planCarryOvers([round1, round2]);

      expect(result).toHaveLength(3);
      const resultsByUser = Object.fromEntries(
        result.map((r) => [r.userId, r])
      );

      expect(resultsByUser["user-1"].pick).toBe("HOME");
      expect(resultsByUser["user-2"].pick).toBe("DRAW");
      expect(resultsByUser["user-3"].pick).toBe("AWAY");
    });

    it("complex scenario: selective carries with chaining", () => {
      // Round 1: three users submit
      const round1 = makeRound(1, "r1", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
        { userId: "user-2", matchNumber: 1, pick: "DRAW" },
        { userId: "user-3", matchNumber: 1, pick: "AWAY" },
      ]);

      // Round 2: only user-1 submits, user-2 and user-3 are carried
      const round2 = makeRound(2, "r2", 13, [
        { userId: "user-1", matchNumber: 1, pick: "HOME" },
      ]);

      // Round 3: no submissions, all should be carried
      const round3 = makeRound(3, "r3", 13, []);

      const result = planCarryOvers([round1, round2, round3]);

      // Expect carries for: user-2 r2, user-3 r2, user-1 r3, user-2 r3, user-3 r3
      expect(result).toHaveLength(5);

      const round2Carries = result.filter((p) => p.roundId === "r2");
      const round3Carries = result.filter((p) => p.roundId === "r3");

      expect(round2Carries).toHaveLength(2);
      expect(round3Carries).toHaveLength(3);
    });
  });
});
