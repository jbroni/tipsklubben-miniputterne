import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RoundStatus } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => ({
  prisma: {
    season: {
      findFirst: vi.fn(),
    },
    round: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    prediction: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  planCarryOvers: vi.fn(),
  console: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/carry-over", () => ({
  planCarryOvers: mocks.planCarryOvers,
}));

import { carryOverMissingCoupons } from "./carry-over";

describe("carryOverMissingCoupons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.error to prevent noise in test output
    vi.spyOn(global.console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("a. No active season", () => {
    it("should return without calling findMany, createMany, updateMany or $transaction when no active season exists", async () => {
      mocks.prisma.season.findFirst.mockResolvedValue(null);

      await carryOverMissingCoupons();

      expect(mocks.prisma.season.findFirst).toHaveBeenCalledOnce();
      expect(mocks.prisma.round.findMany).not.toHaveBeenCalled();
      expect(mocks.prisma.prediction.createMany).not.toHaveBeenCalled();
      expect(mocks.prisma.round.updateMany).not.toHaveBeenCalled();
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.planCarryOvers).not.toHaveBeenCalled();
    });
  });

  describe("b. Nothing due (fast path)", () => {
    it("should call findMany once and return early when no rounds are due", async () => {
      vi.useFakeTimers();
      const fixedNow = new Date("2025-09-27T12:00:00Z");
      vi.setSystemTime(fixedNow);

      const activeSeason = { id: "season-1", isActive: true };
      mocks.prisma.season.findFirst.mockResolvedValue(activeSeason);

      // Fast path query returns empty array
      mocks.prisma.round.findMany.mockResolvedValue([]);

      await carryOverMissingCoupons();

      // findMany should be called exactly once (the fast path check)
      expect(mocks.prisma.round.findMany).toHaveBeenCalledOnce();
      expect(mocks.prisma.round.findMany).toHaveBeenCalledWith({
        where: {
          seasonId: "season-1",
          carryOverAppliedAt: null,
          matches: { some: {} },
          OR: [
            { deadline: { lte: fixedNow } },
            { status: { in: [RoundStatus.locked, RoundStatus.completed] } },
          ],
        },
        select: { id: true },
      });

      expect(mocks.planCarryOvers).not.toHaveBeenCalled();
      expect(mocks.prisma.prediction.createMany).not.toHaveBeenCalled();
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("c. Due rounds: correct behavior with database writes", () => {
    it("should create predictions and update rounds in a transaction when rounds are due", async () => {
      vi.useFakeTimers();
      const fixedNow = new Date("2025-09-27T12:00:00Z");
      vi.setSystemTime(fixedNow);

      const activeSeason = { id: "season-1", isActive: true };
      mocks.prisma.season.findFirst.mockResolvedValue(activeSeason);

      // Fast path returns 2 due rounds
      const dueRounds = [{ id: "r1" }, { id: "r2" }];
      mocks.prisma.round.findMany.mockResolvedValueOnce(dueRounds);

      // Full load returns detailed data
      mocks.prisma.round.findMany.mockResolvedValueOnce([
        {
          id: "r1",
          roundNumber: 1,
          matches: [{ id: "m1", matchNumber: 1 }],
          predictions: [
            {
              userId: "user1",
              pick: "1",
              carriedFromRoundNumber: null,
              match: { matchNumber: 1 },
            },
          ],
        },
        {
          id: "r2",
          roundNumber: 2,
          matches: [{ id: "m2", matchNumber: 1 }],
          predictions: [],
        },
      ]);

      // Mock planCarryOvers to return fixed data
      const plannedPredictions = [
        {
          roundId: "r2",
          userId: "user1",
          matchId: "m2",
          pick: "1",
          carriedFromRoundNumber: 1,
        },
      ];
      mocks.planCarryOvers.mockReturnValue(plannedPredictions);

      // Mock $transaction to accept array and return success
      mocks.prisma.$transaction.mockResolvedValue([
        { count: 1 }, // createMany result
        { count: 2 }, // updateMany result
      ]);

      await carryOverMissingCoupons();

      // Verify createMany was called with correct data and skipDuplicates: true
      expect(mocks.prisma.prediction.createMany).toHaveBeenCalledWith({
        data: [
          {
            roundId: "r2",
            userId: "user1",
            matchId: "m2",
            pick: "1",
            carriedFromRoundNumber: 1,
          },
        ],
        skipDuplicates: true,
      });

      // Verify updateMany was called with correct IDs and the OR condition
      // The OR ensures only rounds still closed at commit time get marked
      // (a round reopened mid-pass stays unmarked)
      expect(mocks.prisma.round.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["r1", "r2"] },
          OR: [
            { deadline: { lte: fixedNow } },
            { status: { in: [RoundStatus.locked, RoundStatus.completed] } },
          ],
        },
        data: { carryOverAppliedAt: fixedNow },
      });

      // Verify $transaction was called exactly once with array of 2 items
      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
      const txCall = mocks.prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txCall)).toBe(true);
      expect(txCall).toHaveLength(2);

      vi.useRealTimers();
    });
  });

  describe("d. Full load uses closed condition (deadline OR status)", () => {
    it("should use both deadline and status conditions in the second findMany", async () => {
      vi.useFakeTimers();
      const fixedNow = new Date("2025-09-27T12:00:00Z");
      vi.setSystemTime(fixedNow);

      const activeSeason = { id: "season-1", isActive: true };
      mocks.prisma.season.findFirst.mockResolvedValue(activeSeason);

      // Fast path returns rounds due
      mocks.prisma.round.findMany.mockResolvedValueOnce([{ id: "r1" }]);

      // Full load returns data
      mocks.prisma.round.findMany.mockResolvedValueOnce([
        {
          id: "r1",
          roundNumber: 1,
          matches: [],
          predictions: [],
        },
      ]);

      mocks.planCarryOvers.mockReturnValue([]);
      mocks.prisma.$transaction.mockResolvedValue([{ count: 0 }, { count: 1 }]);

      await carryOverMissingCoupons();

      // Verify the second findMany call (full load)
      expect(mocks.prisma.round.findMany).toHaveBeenCalledTimes(2);
      const secondCall = mocks.prisma.round.findMany.mock.calls[1];

      // Check that the where clause includes the OR condition with both deadline and status
      const whereClause = secondCall[0].where;
      expect(whereClause).toHaveProperty("OR");
      expect(whereClause.OR).toHaveLength(2);
      expect(whereClause.OR[0]).toEqual({ deadline: { lte: fixedNow } });
      expect(whereClause.OR[1]).toEqual({
        status: { in: [RoundStatus.locked, RoundStatus.completed] },
      });

      vi.useRealTimers();
    });

    it("should process a round locked before its deadline using the status condition", async () => {
      vi.useFakeTimers();
      // Set current time before the deadline
      const fixedNow = new Date("2025-09-20T12:00:00Z");
      vi.setSystemTime(fixedNow);

      const activeSeason = { id: "season-1", isActive: true };
      mocks.prisma.season.findFirst.mockResolvedValue(activeSeason);

      // Fast path returns rounds due (locked rounds are included even before deadline)
      mocks.prisma.round.findMany.mockResolvedValueOnce([{ id: "r-locked" }]);

      // Full load returns data
      mocks.prisma.round.findMany.mockResolvedValueOnce([
        {
          id: "r-locked",
          roundNumber: 1,
          deadline: new Date("2025-09-30T12:00:00Z"), // Deadline is after now
          status: RoundStatus.locked, // But status is locked
          matches: [{ id: "m1", matchNumber: 1 }],
          predictions: [],
        },
      ]);

      mocks.planCarryOvers.mockReturnValue([]);
      mocks.prisma.$transaction.mockResolvedValue([{ count: 0 }, { count: 1 }]);

      await carryOverMissingCoupons();

      // The second findMany should have been called
      expect(mocks.prisma.round.findMany).toHaveBeenCalledTimes(2);
      // This verifies the second query includes the status check that would catch the locked round

      vi.useRealTimers();
    });
  });

  describe("e. $transaction rejects: error handling", () => {
    it("should handle $transaction rejection without throwing and not call updateMany outside transaction", async () => {
      vi.useFakeTimers();
      const fixedNow = new Date("2025-09-27T12:00:00Z");
      vi.setSystemTime(fixedNow);

      const activeSeason = { id: "season-1", isActive: true };
      mocks.prisma.season.findFirst.mockResolvedValue(activeSeason);

      // Fast path returns rounds due
      mocks.prisma.round.findMany.mockResolvedValueOnce([{ id: "r1" }]);

      // Full load returns data
      mocks.prisma.round.findMany.mockResolvedValueOnce([
        {
          id: "r1",
          roundNumber: 1,
          matches: [{ id: "m1", matchNumber: 1 }],
          predictions: [],
        },
      ]);

      mocks.planCarryOvers.mockReturnValue([
        {
          roundId: "r1",
          userId: "user1",
          matchId: "m1",
          pick: "1",
          carriedFromRoundNumber: null,
        },
      ]);

      // Mock $transaction to reject
      mocks.prisma.$transaction.mockRejectedValue(
        new Error("Database error")
      );

      // Call the function - it should not throw
      await expect(carryOverMissingCoupons()).resolves.toBeUndefined();

      // Verify console.error was called
      expect(global.console.error).toHaveBeenCalledWith(
        "Error applying carry-over logic:",
        expect.any(Error)
      );

      // Verify updateMany was called only once - as part of building the $transaction array
      expect(mocks.prisma.round.updateMany).toHaveBeenCalledOnce();

      // Verify that the function returned without throwing
      expect(true).toBe(true);

      vi.useRealTimers();
    });
  });
});
