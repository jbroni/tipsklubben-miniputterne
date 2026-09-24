import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Round } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => ({
  prismaMocks: {
    round: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    prediction: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(
      {
        prediction: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        round: {
          update: vi.fn().mockResolvedValue({
            id: "round-1",
            seasonId: "season-1",
            roundNumber: 1,
            status: "open",
            deadline: new Date(),
          }),
        },
      }
    )),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

vi.mock("@/lib/time", () => ({
  parseAppZonedDateTime: (dateStr: string) => new Date(dateStr),
}));

import { updateRound } from "./rounds";

describe("updateRound", () => {
  let txMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create transaction mock
    txMock = {
      prediction: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      round: {
        update: vi.fn().mockResolvedValue({
          id: "round-1",
          seasonId: "season-1",
          roundNumber: 1,
          status: "open",
          deadline: new Date("2099-12-31"),
        }),
      },
    };

    // Setup $transaction to return the tx mock
    mocks.prismaMocks.$transaction.mockImplementation(async (cb) => cb(txMock));
  });

  describe("reopen round", () => {
    it("deletes carried predictions when reopening with status='open'", async () => {
      const round: Round = {
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "locked",
        deadline: new Date("2099-12-31"),
        createdAt: new Date(),
      };

      mocks.prismaMocks.round.findUnique.mockResolvedValue(round);

      const result = await updateRound({
        roundId: "round-1",
        status: "open",
      });

      expect(result.ok).toBe(true);
      // Verify transaction was used
      expect(mocks.prismaMocks.$transaction).toHaveBeenCalled();
      // Verify deleteMany was called with correct filter
      expect(txMock.prediction.deleteMany).toHaveBeenCalledWith({
        where: {
          roundId: "round-1",
          carriedFromRoundNumber: { not: null },
        },
      });
    });

    it("deletes carried predictions when moving deadline into the future", async () => {
      const round: Round = {
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "locked",
        deadline: new Date("2020-01-01"),
        createdAt: new Date(),
      };

      mocks.prismaMocks.round.findUnique.mockResolvedValue(round);

      const result = await updateRound({
        roundId: "round-1",
        deadline: "2099-12-31T23:59:59Z",
      });

      expect(result.ok).toBe(true);
      // Verify transaction was used
      expect(mocks.prismaMocks.$transaction).toHaveBeenCalled();
      // Verify deleteMany was called
      expect(txMock.prediction.deleteMany).toHaveBeenCalledWith({
        where: {
          roundId: "round-1",
          carriedFromRoundNumber: { not: null },
        },
      });
    });
  });

  describe("non-reopening update", () => {
    it("does not delete carried predictions when changing other fields", async () => {
      const round: Round = {
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "open",
        deadline: new Date("2099-12-31"),
        createdAt: new Date(),
      };

      mocks.prismaMocks.round.update.mockResolvedValue(round);

      // Update without using transaction (non-reopening)
      const result = await updateRound({
        roundId: "round-1",
        status: "completed",
      });

      expect(result.ok).toBe(true);
      // Transaction should NOT be used for non-reopening updates
      expect(mocks.prismaMocks.$transaction).not.toHaveBeenCalled();
      // Direct update should be used instead
      expect(mocks.prismaMocks.round.update).toHaveBeenCalled();
    });

    it("does not use transaction when just updating status to non-open value", async () => {
      const round: Round = {
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "open",
        deadline: new Date("2099-12-31"),
        createdAt: new Date(),
      };

      mocks.prismaMocks.round.update.mockResolvedValue({
        ...round,
        status: "completed",
      });

      const result = await updateRound({
        roundId: "round-1",
        status: "completed",
      });

      expect(result.ok).toBe(true);
      // Transaction should NOT be used
      expect(mocks.prismaMocks.$transaction).not.toHaveBeenCalled();
      // Direct update should be used
      expect(mocks.prismaMocks.round.update).toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("returns ROUND_NOT_FOUND when reopening non-existent round", async () => {
      mocks.prismaMocks.round.findUnique.mockResolvedValue(null);

      const result = await updateRound({
        roundId: "nonexistent",
        status: "open",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("ROUND_NOT_FOUND");
      }
    });

    it("returns VALIDATION when reopening with deadline in the past", async () => {
      const round: Round = {
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "locked",
        deadline: new Date("2020-01-01"),
        createdAt: new Date(),
      };

      mocks.prismaMocks.round.findUnique.mockResolvedValue(round);

      const result = await updateRound({
        roundId: "round-1",
        status: "open",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION");
      }
    });

    it("returns VALIDATION when deadline format is invalid", async () => {
      const result = await updateRound({
        roundId: "round-1",
        deadline: "invalid-date",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION");
      }
    });
  });
});
