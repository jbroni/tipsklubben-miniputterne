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
    user: {
      findUnique: vi.fn(),
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
        couponDelegateId: null,
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
        couponDelegateId: null,
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
        couponDelegateId: null,
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
        couponDelegateId: null,
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
        couponDelegateId: null,
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

    it("returns VALIDATION when couponDelegateId is a non-existent user", async () => {
      mocks.prismaMocks.user.findUnique.mockResolvedValue(null);

      const result = await updateRound({
        roundId: "round-1",
        couponDelegateId: "nonexistent-user",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION");
      }
      // Verify user lookup was attempted
      expect(mocks.prismaMocks.user.findUnique).toHaveBeenCalledWith({
        where: { id: "nonexistent-user" },
      });
      // Verify no round update was made
      expect(mocks.prismaMocks.round.update).not.toHaveBeenCalled();
    });
  });

  describe("couponDelegateId update", () => {
    it("writes couponDelegateId to update data when an existing user id is provided", async () => {
      mocks.prismaMocks.user.findUnique.mockResolvedValue({
        id: "delegate-user",
        authId: "auth-delegate",
        email: "delegate@example.com",
        displayName: "Delegate",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      });

      mocks.prismaMocks.round.update.mockResolvedValue({
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "open",
        deadline: new Date(),
        couponDelegateId: "delegate-user",
        createdAt: new Date(),
      });

      const result = await updateRound({
        roundId: "round-1",
        couponDelegateId: "delegate-user",
      });

      expect(result.ok).toBe(true);
      // Verify the update was called with couponDelegateId
      expect(mocks.prismaMocks.round.update).toHaveBeenCalled();
      const updateCall = mocks.prismaMocks.round.update.mock.calls[0];
      expect(updateCall[0].data).toHaveProperty("couponDelegateId", "delegate-user");
    });

    it("clears couponDelegateId when null is explicitly provided", async () => {
      mocks.prismaMocks.round.update.mockResolvedValue({
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "open",
        deadline: new Date(),
        couponDelegateId: null,
        createdAt: new Date(),
      });

      const result = await updateRound({
        roundId: "round-1",
        couponDelegateId: null,
      });

      expect(result.ok).toBe(true);
      // Verify user lookup was skipped for null
      expect(mocks.prismaMocks.user.findUnique).not.toHaveBeenCalled();
      // Verify the update was called with couponDelegateId: null
      expect(mocks.prismaMocks.round.update).toHaveBeenCalled();
      const updateCall = mocks.prismaMocks.round.update.mock.calls[0];
      expect(updateCall[0].data).toHaveProperty("couponDelegateId", null);
    });

    it("leaves couponDelegateId out of update data when undefined", async () => {
      mocks.prismaMocks.round.update.mockResolvedValue({
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "open",
        deadline: new Date(),
        couponDelegateId: "existing-delegate",
        createdAt: new Date(),
      });

      const result = await updateRound({
        roundId: "round-1",
        status: "completed",
        // couponDelegateId is not provided (undefined)
      });

      expect(result.ok).toBe(true);
      // Verify user lookup was not attempted
      expect(mocks.prismaMocks.user.findUnique).not.toHaveBeenCalled();
      // Verify couponDelegateId is not in the update data
      expect(mocks.prismaMocks.round.update).toHaveBeenCalled();
      const updateCall = mocks.prismaMocks.round.update.mock.calls[0];
      expect(updateCall[0].data).not.toHaveProperty("couponDelegateId");
    });

    it("does not use transaction when updating only couponDelegateId", async () => {
      mocks.prismaMocks.user.findUnique.mockResolvedValue({
        id: "delegate-user",
        authId: "auth-delegate",
        email: "delegate@example.com",
        displayName: "Delegate",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      });

      mocks.prismaMocks.round.update.mockResolvedValue({
        id: "round-1",
        seasonId: "season-1",
        roundNumber: 1,
        status: "open",
        deadline: new Date("2099-12-31"),
        createdAt: new Date(),
        couponDelegateId: "delegate-user",
      });

      const result = await updateRound({
        roundId: "round-1",
        couponDelegateId: "delegate-user",
      });

      expect(result.ok).toBe(true);
      // Transaction should NOT be used for delegate-only updates
      expect(mocks.prismaMocks.$transaction).not.toHaveBeenCalled();
      // Direct update should be used
      expect(mocks.prismaMocks.round.update).toHaveBeenCalled();
    });
  });
});
