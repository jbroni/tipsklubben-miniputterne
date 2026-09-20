import { describe, it, expect } from "vitest";
import { computeRoundScores } from "./round-scores";
import { calcRoundFedt } from "./fedt";
import type { Decimal } from "@prisma/client/runtime/library";
import type { Pick as PickType } from "@prisma/client";

const H: PickType = "HOME";
const D: PickType = "DRAW";
const A: PickType = "AWAY";

// Helper to create a match fixture
function createMatch(
  result: PickType | null,
  oddsHome: number = 2.0,
  oddsDraw: number = 3.0,
  oddsAway: number = 4.0,
  predictions: Array<{ userId: string; pick: PickType | null }> = []
) {
  return {
    result,
    oddsHome: oddsHome as unknown as Decimal,
    oddsDraw: oddsDraw as unknown as Decimal,
    oddsAway: oddsAway as unknown as Decimal,
    fedtHome: 50,
    fedtDraw: 30,
    fedtAway: 20,
    predictions,
  };
}

// Helper to create a user fixture
function createUser(id: string, displayName: string) {
  return { id, displayName };
}

describe("computeRoundScores", () => {
  describe("filtering users with no predictions", () => {
    it("excludes users who made no predictions", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(D, 2.0, 3.0, 4.0, [{ userId: "user1", pick: D }]),
      ];

      const users = [
        createUser("user1", "Player 1"),
        createUser("user2", "Player 2"), // No predictions
      ];

      const scores = computeRoundScores(matches, users);

      expect(scores.length).toBe(1);
      expect(scores[0].user.id).toBe("user1");
    });

    it("returns empty array when all users have no predictions", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, []),
        createMatch(D, 2.0, 3.0, 4.0, []),
      ];

      const users = [
        createUser("user1", "Player 1"),
        createUser("user2", "Player 2"),
      ];

      const scores = computeRoundScores(matches, users);

      expect(scores.length).toBe(0);
    });
  });

  describe("correct pick counting", () => {
    it("counts correct picks when result matches pick", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(D, 2.0, 3.0, 4.0, [{ userId: "user1", pick: D }]),
        createMatch(A, 2.0, 3.0, 4.0, [{ userId: "user1", pick: A }]),
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].points).toBe(3);
    });

    it("counts correct picks, ignoring incorrect picks", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(D, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]), // Wrong
        createMatch(A, 2.0, 3.0, 4.0, [{ userId: "user1", pick: A }]),
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].points).toBe(2);
    });

    it("does not count points when result is null", () => {
      const matches = [
        createMatch(null, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].points).toBe(1);
    });

    it("handles mixed null and non-null results correctly", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(null, 2.0, 3.0, 4.0, [{ userId: "user1", pick: D }]),
        createMatch(A, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]), // Wrong
        createMatch(null, 2.0, 3.0, 4.0, [{ userId: "user1", pick: A }]),
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].points).toBe(1);
    });
  });

  describe("fedt calculation", () => {
    it("calculates fedt over only the matches the user predicted", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(D, 2.0, 3.0, 4.0, [{ userId: "user1", pick: D }]),
        createMatch(A, 2.0, 3.0, 4.0, []), // No prediction from user1
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      const expectedFedt = calcRoundFedt([
        { match: matches[0], pick: H },
        { match: matches[1], pick: D },
      ]);
      expect(scores[0].fedt).toBe(expectedFedt);
    });
  });

  describe("tiebreak by fedt ascending", () => {
    it("orders users by fedt ascending when points are equal", () => {
      const boldMatches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
      ];
      boldMatches[0].fedtHome = 20;
      boldMatches[0].fedtDraw = 40;
      boldMatches[0].fedtAway = 40;
      boldMatches[1].fedtHome = 20;
      boldMatches[1].fedtDraw = 40;
      boldMatches[1].fedtAway = 40;

      const safeMatches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user2", pick: H }]),
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user2", pick: H }]),
      ];
      safeMatches[0].fedtHome = 80;
      safeMatches[0].fedtDraw = 10;
      safeMatches[0].fedtAway = 10;
      safeMatches[1].fedtHome = 80;
      safeMatches[1].fedtDraw = 10;
      safeMatches[1].fedtAway = 10;

      // Combine matches
      const allMatches = [
        boldMatches[0],
        boldMatches[1],
        safeMatches[0],
        safeMatches[1],
      ];

      const users = [
        createUser("user1", "Bold Player"),
        createUser("user2", "Safe Player"),
      ];

      const scores = computeRoundScores(allMatches, users);

      expect(scores[0].points).toBe(2);
      expect(scores[1].points).toBe(2);

      // But user1 (bold) should come first because they have lower fedt
      expect(scores[0].user.id).toBe("user1");
      expect(scores[1].user.id).toBe("user2");
      expect(scores[0].fedt).toBeLessThan(scores[1].fedt);
    });
  });

  describe("partial coupon (some matches unpredicted)", () => {
    it("computes points over all matches, including unpredicted ones", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(D, 2.0, 3.0, 4.0, []), // No prediction from user1
        createMatch(A, 2.0, 3.0, 4.0, [{ userId: "user1", pick: A }]),
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      // Both predicted matches are correct, so 2 points
      expect(scores[0].points).toBe(2);
    });

    it("computes fedt over only predicted matches", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
        createMatch(D, 2.0, 3.0, 4.0, []), // No prediction from user1
        createMatch(A, 2.0, 3.0, 4.0, [{ userId: "user1", pick: A }]),
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      const expectedFedt = calcRoundFedt([
        { match: matches[0], pick: H },
        { match: matches[2], pick: A },
      ]);
      expect(scores[0].fedt).toBe(expectedFedt);
    });
  });

  describe("empty inputs", () => {
    it("returns empty array when matches array is empty", () => {
      const matches: any[] = [];
      const users = [createUser("user1", "Player 1")];

      const scores = computeRoundScores(matches, users);

      expect(scores.length).toBe(0);
    });

    it("returns empty array when users array is empty", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
      ];
      const users: any[] = [];

      const scores = computeRoundScores(matches, users);

      expect(scores.length).toBe(0);
    });

    it("returns empty array when both arrays are empty", () => {
      const matches: any[] = [];
      const users: any[] = [];

      const scores = computeRoundScores(matches, users);

      expect(scores.length).toBe(0);
    });
  });

  describe("sorting and output structure", () => {
    it("returns scores in descending order by points", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [
          { userId: "user1", pick: H },
          { userId: "user2", pick: H },
          { userId: "user3", pick: D },
        ]),
        createMatch(D, 2.0, 3.0, 4.0, [
          { userId: "user1", pick: D },
          { userId: "user2", pick: H },
          { userId: "user3", pick: D },
        ]),
        createMatch(A, 2.0, 3.0, 4.0, [
          { userId: "user1", pick: A },
          { userId: "user2", pick: A },
          { userId: "user3", pick: A },
        ]),
      ];

      const users = [
        createUser("user1", "Player 1"),
        createUser("user2", "Player 2"),
        createUser("user3", "Player 3"),
      ];

      const scores = computeRoundScores(matches, users);

      // user1: 3 correct (H, D, A)
      // user2: 2 correct (H, A)
      // user3: 2 correct (D, A)
      expect(scores[0].points).toBe(3);
      expect(scores[1].points).toBe(2);
      expect(scores[2].points).toBe(2);
    });

    it("includes user and points in result", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
      ];

      const users = [createUser("user1", "Alice Johnson")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].user.id).toBe("user1");
      expect(scores[0].user.displayName).toBe("Alice Johnson");
      expect(scores[0].points).toBe(1);
      expect(typeof scores[0].fedt).toBe("number");
    });
  });

  describe("multiple users with no predictions", () => {
    it("includes only users with at least one prediction", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]),
      ];

      const users = [
        createUser("user1", "Player 1"),
        createUser("user2", "Player 2"),
        createUser("user3", "Player 3"),
      ];

      const scores = computeRoundScores(matches, users);

      expect(scores.length).toBe(1);
      expect(scores[0].user.id).toBe("user1");
    });
  });

  describe("user with prediction on one match only", () => {
    it("counts 0 points if they predicted but got it wrong", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: D }]), // Wrong
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].points).toBe(0);
    });

    it("counts 1 point if they predicted and got it right", () => {
      const matches = [
        createMatch(H, 2.0, 3.0, 4.0, [{ userId: "user1", pick: H }]), // Correct
      ];

      const users = [createUser("user1", "Player 1")];
      const scores = computeRoundScores(matches, users);

      expect(scores[0].points).toBe(1);
    });
  });
});
