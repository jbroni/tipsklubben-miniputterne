import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeLeaderboard, toFedtInput } from "./leaderboard";
import type { User, Round, Match, Prediction, Role, Pick as PickType } from "@prisma/client";

type RoundWithMatches = Round & {
  matches: Match[];
  predictions: (Prediction & { match: Match })[];
};

// Helper to create mock user
function mockUser(id: string, displayName: string): User {
  return {
    id,
    authId: `auth-${id}`,
    email: `${displayName}@example.com`,
    displayName,
    avatarUrl: null,
    role: "member" as Role,
    createdAt: new Date(),
  };
}

// Helper to create mock match
function mockMatch(
  id: string,
  matchNumber: number,
  result: "HOME" | "DRAW" | "AWAY" | null = null,
  fedtHome: number | null = null,
  fedtDraw: number | null = null,
  fedtAway: number | null = null
): Match {
  return {
    id,
    roundId: "round-1",
    matchNumber,
    homeTeam: `Home ${matchNumber}`,
    awayTeam: `Away ${matchNumber}`,
    league: "Test League",
    kickoff: new Date(),
    oddsHome: new Decimal(2.0),
    oddsDraw: new Decimal(3.0),
    oddsAway: new Decimal(4.0),
    result: result as PickType | null,
    externalId: null,
    fedtHome,
    fedtDraw,
    fedtAway,
  };
}

// Helper to create mock prediction
function mockPrediction(
  id: string,
  userId: string,
  match: Match,
  pick: "HOME" | "DRAW" | "AWAY"
): Prediction & { match: Match } {
  return {
    id,
    roundId: "round-1",
    userId,
    matchId: match.id,
    pick: pick as PickType,
    createdAt: new Date(),
    updatedAt: new Date(),
    match,
  };
}

// Helper to create mock round
function mockRound(
  id: string,
  roundNumber: number,
  matches: Match[],
  predictions: (Prediction & { match: Match })[]
): RoundWithMatches {
  return {
    id,
    seasonId: "season-1",
    roundNumber,
    deadline: new Date(),
    status: "open",
    createdAt: new Date(),
    matches,
    predictions,
  };
}

describe("computeLeaderboard", () => {
  describe("points calculation", () => {
    it("counts correct predictions as 1 point each", () => {
      const users = [mockUser("user1", "Alice")];

      const match1 = mockMatch("match1", 1, "HOME");
      const match2 = mockMatch("match2", 2, "DRAW");
      const match3 = mockMatch("match3", 3, "AWAY");

      const predictions = [
        mockPrediction("pred1", "user1", match1, "HOME"),
        mockPrediction("pred2", "user1", match2, "DRAW"),
        mockPrediction("pred3", "user1", match3, "HOME"), // Wrong pick
      ];

      const rounds = [mockRound("round1", 1, [match1, match2, match3], predictions)];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].totalPoints).toBe(2); // 2 correct, 1 wrong
    });

    it("does not award points for matches with null result", () => {
      const users = [mockUser("user1", "Alice")];

      const match1 = mockMatch("match1", 1, null); // Result not yet available

      const predictions = [mockPrediction("pred1", "user1", match1, "HOME")];

      const rounds = [mockRound("round1", 1, [match1], predictions)];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard[0].totalPoints).toBe(0);
    });

    it("computes points correctly across multiple rounds", () => {
      const users = [mockUser("user1", "Alice")];

      // Round 1
      const round1Match1 = mockMatch("m1", 1, "HOME");
      const round1Match2 = mockMatch("m2", 2, "DRAW");
      const round1Predictions = [
        mockPrediction("p1", "user1", round1Match1, "HOME"),
        mockPrediction("p2", "user1", round1Match2, "HOME"), // Wrong
      ];

      // Round 2
      const round2Match1 = mockMatch("m3", 1, "AWAY");
      const round2Match2 = mockMatch("m4", 2, "AWAY");
      const round2Predictions = [
        mockPrediction("p3", "user1", round2Match1, "AWAY"),
        mockPrediction("p4", "user1", round2Match2, "AWAY"),
      ];

      const rounds = [
        mockRound("round1", 1, [round1Match1, round1Match2], round1Predictions),
        mockRound("round2", 2, [round2Match1, round2Match2], round2Predictions),
      ];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard[0].totalPoints).toBe(3); // 1 + 2
    });
  });

  describe("rounds played", () => {
    it("counts rounds with at least 1 prediction as played", () => {
      const users = [mockUser("user1", "Alice")];

      const match1 = mockMatch("m1", 1, "HOME");
      const match2 = mockMatch("m2", 2, "DRAW");

      const round1Predictions = [mockPrediction("p1", "user1", match1, "HOME")];
      const round2Predictions: (Prediction & { match: Match })[] = []; // No predictions in round 2

      const rounds = [
        mockRound("round1", 1, [match1], round1Predictions),
        mockRound("round2", 2, [match2], round2Predictions),
      ];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard[0].roundsPlayed).toBe(1);
    });

    it("does not count rounds with zero predictions", () => {
      const users = [mockUser("user1", "Alice")];

      const match1 = mockMatch("m1", 1, "HOME");
      const match2 = mockMatch("m2", 2, "DRAW");
      const match3 = mockMatch("m3", 3, "AWAY");

      const round1Predictions = [mockPrediction("p1", "user1", match1, "HOME")];
      const round2Predictions: (Prediction & { match: Match })[] = []; // No predictions
      const round3Predictions = [mockPrediction("p2", "user1", match3, "AWAY")];

      const rounds = [
        mockRound("round1", 1, [match1], round1Predictions),
        mockRound("round2", 2, [match2], round2Predictions),
        mockRound("round3", 3, [match3], round3Predictions),
      ];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard[0].roundsPlayed).toBe(2);
    });
  });

  describe("average score", () => {
    it("calculates avg score as totalPoints / roundsPlayed", () => {
      const users = [mockUser("user1", "Alice")];

      const m1 = mockMatch("m1", 1, "HOME");
      const m2 = mockMatch("m2", 2, "DRAW");
      const m3 = mockMatch("m3", 1, "AWAY");

      // Round 1: 2 points from 2 predictions
      const round1Preds = [
        mockPrediction("p1", "user1", m1, "HOME"),
        mockPrediction("p2", "user1", m2, "DRAW"),
      ];

      // Round 2: 1 point from 1 prediction
      const round2Preds = [mockPrediction("p3", "user1", m3, "AWAY")];

      const rounds = [
        mockRound("round1", 1, [m1, m2], round1Preds),
        mockRound("round2", 2, [m3], round2Preds),
      ];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard[0].totalPoints).toBe(3);
      expect(leaderboard[0].roundsPlayed).toBe(2);
      expect(leaderboard[0].avgScore).toBeCloseTo(1.5, 2);
    });

    it("returns 0 for avgScore when no rounds played", () => {
      const users = [mockUser("user1", "Alice")];

      const match1 = mockMatch("m1", 1, "HOME");
      const round1Predictions: (Prediction & { match: Match })[] = []; // No predictions

      const rounds = [mockRound("round1", 1, [match1], round1Predictions)];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard[0].avgScore).toBe(0);
    });
  });

  describe("fedt calculation with missing picks", () => {
    it("computes fedt over remaining picks when one is missing from a round", () => {
      const users = [mockUser("user1", "Alice")];

      // 3 matches in the round, but user only predicts on 2
      const m1 = mockMatch("m1", 1, "HOME", 79, 13, 8);
      const m2 = mockMatch("m2", 2, "DRAW", 50, 30, 20);
      const m3 = mockMatch("m3", 3, "AWAY", 40, 30, 30); // No prediction on this one

      const predictions = [
        mockPrediction("p1", "user1", m1, "HOME"), // fedt: 79
        mockPrediction("p2", "user1", m2, "DRAW"), // fedt: 30
        // No prediction for m3
      ];

      const rounds = [mockRound("round1", 1, [m1, m2, m3], predictions)];

      const leaderboard = computeLeaderboard(rounds, users);

      // Fedt should be calculated over just the 2 picks
      // sumChosen = 79 + 30 = 109
      // sumMin = min(79,13,8) + min(50,30,20) = 8 + 20 = 28
      // sumMax = max(79,13,8) + max(50,30,20) = 79 + 50 = 129
      // fedt = (109 - 28) / (129 - 28) * 100 = 81/101 * 100 ≈ 80.20
      expect(leaderboard[0].roundScores[0].fedt).toBeCloseTo(80.20, 1);
    });

    it("does not contribute fedt to missing predictions in a round", () => {
      const users = [mockUser("user1", "Alice"), mockUser("user2", "Bob")];

      const m1 = mockMatch("m1", 1, "HOME", 60, 20, 20);
      const m2 = mockMatch("m2", 2, "DRAW", 50, 25, 25);

      // User1 predicts on both, User2 only on first
      const predictions = [
        mockPrediction("p1", "user1", m1, "HOME"),
        mockPrediction("p2", "user1", m2, "DRAW"),
        mockPrediction("p3", "user2", m1, "HOME"),
        // User2 has no prediction for m2
      ];

      const rounds = [mockRound("round1", 1, [m1, m2], predictions)];

      const leaderboard = computeLeaderboard(rounds, users);

      // User1 should have fedt over 2 picks
      expect(leaderboard.find((e) => e.user.id === "user1")!.roundScores[0].fedt).toBeDefined();

      // User2 should have fedt over 1 pick
      expect(leaderboard.find((e) => e.user.id === "user2")!.roundScores[0].fedt).toBeDefined();
    });
  });

  describe("season fedt", () => {
    it("calculates season fedt as average of round fedts for played rounds only", () => {
      const users = [mockUser("user1", "Alice")];

      const m1 = mockMatch("m1", 1, "HOME", 60, 20, 20);
      const m2 = mockMatch("m2", 2, "DRAW", 50, 25, 25);
      const m3 = mockMatch("m3", 1, "HOME", 70, 15, 15);

      // Round 1: 1 prediction
      const round1Preds = [mockPrediction("p1", "user1", m1, "HOME")];

      // Round 2: 0 predictions (not played)
      const round2Preds = [] as any[];

      // Round 3: 1 prediction
      const round3Preds = [mockPrediction("p2", "user1", m3, "HOME")];

      const rounds = [
        mockRound("round1", 1, [m1], round1Preds),
        mockRound("round2", 2, [m2], round2Preds),
        mockRound("round3", 3, [m3], round3Preds),
      ];

      const leaderboard = computeLeaderboard(rounds, users);

      // seasonFedt should only include rounds 1 and 3 (not round 2)
      const entry = leaderboard[0];
      expect(entry.roundsPlayed).toBe(2);
      expect(entry.seasonFedt).toBeDefined();
    });
  });

  describe("sorting and tie-breaking", () => {
    it("sorts by totalPoints descending, then by seasonFedt ascending", () => {
      const users = [
        mockUser("user1", "Alice"),
        mockUser("user2", "Bob"),
        mockUser("user3", "Charlie"),
      ];

      // All users play same rounds but with different points
      const m1 = mockMatch("m1", 1, "HOME", 60, 20, 20);
      const m2 = mockMatch("m2", 2, "DRAW", 50, 30, 20);
      const m3 = mockMatch("m3", 3, "AWAY", 30, 30, 40);

      // Alice: 2 points
      const alicePreds = [
        mockPrediction("p1", "user1", m1, "HOME"), // correct, 60
        mockPrediction("p2", "user1", m2, "DRAW"), // correct, 30
        mockPrediction("p7", "user1", m3, "AWAY"), // correct, 40
      ];

      // Bob: 1 point with bold picks (lower fedt)
      const bobPreds = [
        mockPrediction("p3", "user2", m1, "AWAY"), // wrong, 20
        mockPrediction("p4", "user2", m2, "AWAY"), // wrong, 20
        mockPrediction("p8", "user2", m3, "AWAY"), // correct, 40
      ];

      // Charlie: 1 point with safe picks (higher fedt)
      const charliePreds = [
        mockPrediction("p5", "user3", m1, "HOME"), // correct, 60
        mockPrediction("p6", "user3", m2, "HOME"), // wrong, 50
        mockPrediction("p9", "user3", m3, "HOME"), // wrong, 30
      ];

      const rounds = [mockRound("round1", 1, [m1, m2, m3], [...alicePreds, ...bobPreds, ...charliePreds])];

      const leaderboard = computeLeaderboard(rounds, users);

      // Alice should be first (3 points)
      expect(leaderboard[0].user.id).toBe("user1");
      expect(leaderboard[0].totalPoints).toBe(3);

      // Bob and Charlie both have 1 point; the one with lower fedt (bolder) should rank first
      expect(leaderboard[1].totalPoints).toBe(1);
      expect(leaderboard[2].totalPoints).toBe(1);

      // The person with lower fedt should come first (bold picks)
      const bobEntry = leaderboard.find((e) => e.user.id === "user2");
      const charlieEntry = leaderboard.find((e) => e.user.id === "user3");

      expect(bobEntry).toBeDefined();
      expect(charlieEntry).toBeDefined();

      if (bobEntry && charlieEntry) {
        // Bob picked bolder: AWAY (20), AWAY (20), AWAY (40) = low fedt
        // Charlie picked: HOME (60), HOME (50), HOME (30) = high fedt
        expect(bobEntry.seasonFedt).toBeLessThan(charlieEntry.seasonFedt);
        // So Bob should rank higher in the leaderboard
        expect(leaderboard[1].user.id).toBe("user2");
        expect(leaderboard[2].user.id).toBe("user3");
      }
    });

    it("places higher-point players before lower-point players regardless of fedt", () => {
      const users = [mockUser("user1", "Alice"), mockUser("user2", "Bob")];

      const m1 = mockMatch("m1", 1, "HOME", 79, 13, 8);

      // Alice: 1 point (bold pick, low fedt)
      const alicePreds = [mockPrediction("p1", "user1", m1, "AWAY")]; // bold, correct: 8

      // Bob: 2 points (safe picks, high fedt)
      const match2 = mockMatch("m2", 1, "HOME", 79, 13, 8);
      const bobMatch2 = mockMatch("m2-2", 2, "HOME", 79, 13, 8);
      const bobPreds = [
        mockPrediction("p2", "user2", match2, "HOME"), // safe, correct: 79
        mockPrediction("p3", "user2", bobMatch2, "HOME"), // safe, correct: 79
      ];

      const rounds = [
        mockRound("round1", 1, [m1, match2, bobMatch2], [...alicePreds, ...bobPreds]),
      ];

      const leaderboard = computeLeaderboard(rounds, users);

      // Bob should rank first (2 points) even if his fedt is higher (safer)
      expect(leaderboard[0].user.id).toBe("user2");
      expect(leaderboard[1].user.id).toBe("user1");
    });
  });

  describe("toFedtInput", () => {
    it("passes through fedt fields and odds to fedt input format", () => {
      const match: Match = {
        id: "m1",
        roundId: "r1",
        matchNumber: 1,
        homeTeam: "Home",
        awayTeam: "Away",
        league: "League",
        kickoff: new Date(),
        oddsHome: new Decimal(2.5),
        oddsDraw: new Decimal(3.0),
        oddsAway: new Decimal(2.8),
        result: null,
        externalId: null,
        fedtHome: 45,
        fedtDraw: 30,
        fedtAway: 25,
      };

      const input = toFedtInput(match);

      expect(input.oddsHome).toBe(2.5);
      expect(input.oddsDraw).toBe(3.0);
      expect(input.oddsAway).toBe(2.8);
      expect(input.fedtHome).toBe(45);
      expect(input.fedtDraw).toBe(30);
      expect(input.fedtAway).toBe(25);
    });

    it("converts Decimal odds to numbers", () => {
      const match: Match = {
        id: "m1",
        roundId: "r1",
        matchNumber: 1,
        homeTeam: "Home",
        awayTeam: "Away",
        league: "League",
        kickoff: new Date(),
        oddsHome: new Decimal(2.5),
        oddsDraw: new Decimal(3.0),
        oddsAway: new Decimal(2.8),
        result: null,
        externalId: null,
        fedtHome: null,
        fedtDraw: null,
        fedtAway: null,
      };

      const input = toFedtInput(match);

      expect(typeof input.oddsHome).toBe("number");
      expect(typeof input.oddsDraw).toBe("number");
      expect(typeof input.oddsAway).toBe("number");
    });

    it("preserves null fedt values", () => {
      const match: Match = {
        id: "m1",
        roundId: "r1",
        matchNumber: 1,
        homeTeam: "Home",
        awayTeam: "Away",
        league: "League",
        kickoff: new Date(),
        oddsHome: new Decimal(2.5),
        oddsDraw: new Decimal(3.0),
        oddsAway: new Decimal(2.8),
        result: null,
        externalId: null,
        fedtHome: null,
        fedtDraw: null,
        fedtAway: null,
      };

      const input = toFedtInput(match);

      expect(input.fedtHome).toBeNull();
      expect(input.fedtDraw).toBeNull();
      expect(input.fedtAway).toBeNull();
    });
  });

  describe("multiple users", () => {
    it("includes all users in leaderboard even with no plays", () => {
      const users = [
        mockUser("user1", "Alice"),
        mockUser("user2", "Bob"),
        mockUser("user3", "Charlie"),
      ];

      const match1 = mockMatch("m1", 1, "HOME");

      // Only user1 makes a prediction
      const predictions = [mockPrediction("p1", "user1", match1, "HOME")];

      const rounds = [mockRound("round1", 1, [match1], predictions)];

      const leaderboard = computeLeaderboard(rounds, users);

      expect(leaderboard).toHaveLength(3);

      const bob = leaderboard.find((e) => e.user.id === "user2");
      expect(bob).toBeDefined();
      expect(bob!.totalPoints).toBe(0);
      expect(bob!.roundsPlayed).toBe(0);
    });
  });
});
