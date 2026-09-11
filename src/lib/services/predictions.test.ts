import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Round, Match } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => ({
  prismaMocks: {
    round: {
      findUnique: vi.fn(),
    },
    prediction: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((ops: any[]) => Promise.resolve(ops.map((_, i) => ({
      id: `p${i + 1}`,
      userId: "user-1",
      matchId: `m${i + 1}`,
      pick: "HOME",
    })))),
  },
  fedtMocks: {
    calcRoundFedt: vi.fn().mockReturnValue(42.5),
    getFedtLabel: vi.fn().mockReturnValue("Neutral"),
  },
  leaderboardMocks: {
    toFedtInput: vi.fn().mockImplementation((match: any) => ({
      oddsHome: match.oddsHome,
      oddsDraw: match.oddsDraw,
      oddsAway: match.oddsAway,
    })),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

vi.mock("@/lib/fedt", () => ({
  calcRoundFedt: mocks.fedtMocks.calcRoundFedt,
  getFedtLabel: mocks.fedtMocks.getFedtLabel,
}));

vi.mock("@/lib/leaderboard", () => ({
  toFedtInput: mocks.leaderboardMocks.toFedtInput,
}));

import { submitPicks } from "./predictions";

describe("submitPicks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fedtMocks.calcRoundFedt.mockReturnValue(42.5);
    mocks.fedtMocks.getFedtLabel.mockReturnValue("Neutral");
    mocks.leaderboardMocks.toFedtInput.mockImplementation((match: any) => ({
      oddsHome: match.oddsHome,
      oddsDraw: match.oddsDraw,
      oddsAway: match.oddsAway,
    }));
  });

  describe("validation order and ROUND_NOT_FOUND", () => {
    it("returns ROUND_NOT_FOUND when round does not exist", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(null);

      const result = await submitPicks({
        userId: "user-1",
        roundId: "nonexistent",
        picks: Array(13).fill({ matchId: "m1", pick: "HOME" }),
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("ROUND_NOT_FOUND");
          expect(result.message).toBe("Round not found");
      }
    });
  });

  describe("ROUND_CLOSED validation", () => {
    it("returns ROUND_CLOSED when status is not open", async () => {
      const round: Partial<Round & { matches: Match[] }> = {
        id: "round-1",
        status: "locked",
        deadline: new Date("2099-01-01"),
        matches: Array(13).fill({ id: "m1", matchNumber: 1 }),
      };

      mocks.prismaMocks.round.findUnique.mockResolvedValue(round as any);

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks: Array(13).fill({ matchId: "m1", pick: "HOME" }),
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("ROUND_CLOSED");
        expect(result.message).toBe("Round is no longer open for predictions");
      }
    });
  });

  describe("DEADLINE_PASSED validation", () => {
    it("returns DEADLINE_PASSED when status is open but deadline is in past", async () => {
      const round: Partial<Round & { matches: Match[] }> = {
        id: "round-1",
        status: "open",
        deadline: new Date("2020-01-01"),
        matches: Array(13).fill({ id: "m1", matchNumber: 1 }),
      };

      mocks.prismaMocks.round.findUnique.mockResolvedValue(round as any);

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks: Array(13).fill({ matchId: "m1", pick: "HOME" }),
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("DEADLINE_PASSED");
        expect(result.message).toBe("Prediction deadline has passed");
      }
    });
  });

  describe("BAD_PICK_COUNT validation", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
        } as Match)),
    };

    it("returns BAD_PICK_COUNT for 0 picks", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks: [],
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("BAD_PICK_COUNT");
        expect(result.message).toBe("Exactly 13 predictions are required");
      }
    });

    it("returns BAD_PICK_COUNT for 12 picks", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks: Array(12)
          .fill(0)
          .map((_, i) => ({ matchId: `m${i + 1}`, pick: "HOME" })),
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("BAD_PICK_COUNT");
      }
    });

    it("returns BAD_PICK_COUNT for 14 picks", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks: Array(14)
          .fill(0)
          .map((_, i) => ({ matchId: `m${i + 1}`, pick: "HOME" })),
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("BAD_PICK_COUNT");
      }
    });
  });

  describe("DUPLICATE_MATCH validation", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
        } as Match)),
    };

    it("returns DUPLICATE_MATCH when same matchId appears twice", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({ matchId: i < 12 ? `m${i + 1}` : "m1", pick: "HOME" }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("DUPLICATE_MATCH");
        expect(result.message).toBe("Duplicate match IDs in picks");
      }
    });
  });

  describe("BAD_PICK_VALUE validation", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
        } as Match)),
    };

    it("returns BAD_PICK_VALUE for invalid pick string", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: i === 5 ? "INVALID" : "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("BAD_PICK_VALUE");
        expect(result.message).toContain("INVALID");
      }
    });
  });

  describe("UNKNOWN_MATCH validation", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
        } as Match)),
    };

    it("returns UNKNOWN_MATCH when matchId is not in round", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: i === 5 ? "unknown_match" : `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("UNKNOWN_MATCH");
        expect(result.message).toContain("unknown_match");
      }
    });
  });

  describe("COUPON_EXISTS validation", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
        } as Match)),
    };

    it("returns COUPON_EXISTS when predictions exist and replace is false", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([
        {
          id: "p1",
          userId: "user-1",
          matchId: "m1",
          pick: "HOME",
          match: { matchNumber: 1 },
        },
      ] as any);

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("COUPON_EXISTS");
        expect(result.message).toContain("Set replace to true");
      }
    });
  });

  describe("successful submission (first time, created: true)", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
          oddsHome: 2.0,
          oddsDraw: 3.0,
          oddsAway: 4.0,
        } as any)),
    };

    it("returns ok: true with created: true for first submission", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: "HOME",
          }))
      );

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.created).toBe(true);
      }
    });

    it("returns changed array with from: null for new picks", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: "HOME",
          }))
      );

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      if (result.ok) {
        expect(result.data.changed).toHaveLength(13);
        result.data.changed.forEach((change) => {
          expect(change.from).toBeNull();
          expect(change.to).toBe("HOME");
        });
      }
    });
  });

  describe("successful replacement (replace: true)", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
          oddsHome: 2.0,
          oddsDraw: 3.0,
          oddsAway: 4.0,
        } as any)),
    };

    it("returns ok: true with created: false when replacing", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([
        {
          id: "p1",
          userId: "user-1",
          matchId: "m1",
          pick: "AWAY",
          match: { matchNumber: 1 },
        },
        ...Array(12)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 2}`,
            userId: "user-1",
            matchId: `m${i + 2}`,
            pick: "HOME",
            match: { matchNumber: i + 2 },
          })),
      ] as any);

      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: "HOME",
          }))
      );

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.created).toBe(false);
      }
    });

    it("shows from/to diff in changed array when replacing", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([
        {
          id: "p1",
          userId: "user-1",
          matchId: "m1",
          pick: "AWAY",
          match: { matchNumber: 1 },
        },
        {
          id: "p2",
          userId: "user-1",
          matchId: "m2",
          pick: "HOME",
          match: { matchNumber: 2 },
        },
        ...Array(11)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 3}`,
            userId: "user-1",
            matchId: `m${i + 3}`,
            pick: "HOME",
            match: { matchNumber: i + 3 },
          })),
      ] as any);

      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: i === 1 ? "DRAW" : "HOME",
          }))
      );

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: i === 1 ? "DRAW" : "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: true,
      });

      if (result.ok) {
        const match1Change = result.data.changed.find((c) => c.matchNumber === 1);
        expect(match1Change).toEqual({
          matchId: "m1",
          matchNumber: 1,
          from: "AWAY",
          to: "HOME",
        });

        const match2Change = result.data.changed.find((c) => c.matchNumber === 2);
        expect(match2Change).toEqual({
          matchId: "m2",
          matchNumber: 2,
          from: "HOME",
          to: "DRAW",
        });
      }
    });
  });

  describe("transaction usage", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
          oddsHome: 2.0,
          oddsDraw: 3.0,
          oddsAway: 4.0,
        } as any)),
    };

    it("uses prisma.$transaction to wrap upserts", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: "HOME",
          }))
      );

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(true);
      expect(mocks.prismaMocks.$transaction).toHaveBeenCalled();
      const transactionArg = mocks.prismaMocks.$transaction.mock.calls[0][0];
      expect(Array.isArray(transactionArg)).toBe(true);
      expect(transactionArg.length).toBe(13);
    });
  });

  describe("changed array ordering", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
          oddsHome: 2.0,
          oddsDraw: 3.0,
          oddsAway: 4.0,
        } as any)),
    };

    it("orders changed array by matchNumber (not by input order)", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: "HOME",
          }))
      );

      // Submit picks in reverse order to test sorting
      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${13 - i}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      if (result.ok) {
        const matchNumbers = result.data.changed.map((c) => c.matchNumber);
        expect(matchNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      }
    });
  });

  describe("fedt calculation", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
          oddsHome: 2.0,
          oddsDraw: 3.0,
          oddsAway: 4.0,
        } as any)),
    };

    it("calculates fedt and fedtLabel for the submission", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.prismaMocks.$transaction.mockResolvedValue(
        Array(13)
          .fill(0)
          .map((_, i) => ({
            id: `p${i + 1}`,
            userId: "user-1",
            matchId: `m${i + 1}`,
            pick: "HOME",
          }))
      );

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.fedt).toBe(42.5);
        expect(result.data.fedtLabel).toBe("Neutral");
      }
    });
  });

  describe("predictions array in response", () => {
    const validRound: Partial<Round & { matches: Match[] }> = {
      id: "round-1",
      status: "open",
      deadline: new Date("2099-01-01"),
      matches: Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `m${i + 1}`,
          matchNumber: i + 1,
          oddsHome: 2.0,
          oddsDraw: 3.0,
          oddsAway: 4.0,
        } as any)),
    };

    it("returns predictions from transaction result", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(validRound as any);
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      const transactionPredictions = Array(13)
        .fill(0)
        .map((_, i) => ({
          id: `p${i + 1}`,
          userId: "user-1",
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      mocks.prismaMocks.$transaction.mockResolvedValue(transactionPredictions);

      const picks = Array(13)
        .fill(0)
        .map((_, i) => ({
          matchId: `m${i + 1}`,
          pick: "HOME",
        }));

      const result = await submitPicks({
        userId: "user-1",
        roundId: "round-1",
        picks,
        replace: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.predictions).toEqual(transactionPredictions);
      }
    });
  });
});
