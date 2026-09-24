import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => {
  // Transaction mock object that will be passed to the callback
  const txMock = {
    $queryRaw: vi.fn(),
    prediction: {
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    mcpToken: {
      updateMany: vi.fn(),
    },
    groupCoupon: {
      updateMany: vi.fn(),
    },
    userIdentity: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  return {
    prismaMocks: {
      user: {
        findUnique: vi.fn(),
      },
      prediction: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (cbOrArray, options) => {
        // Handle both array form (for deleteMany calls) and callback form (for merge)
        if (Array.isArray(cbOrArray)) {
          return Promise.all(cbOrArray);
        }
        return cbOrArray(txMock);
      }),
    },
    txMock,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

import { mergeUsers } from "./user-merge";

describe("mergeUsers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-establish default tx mock implementations
    mocks.txMock.$queryRaw.mockResolvedValue([]);
    mocks.txMock.prediction.updateMany.mockResolvedValue({ count: 0 });
    mocks.txMock.prediction.count.mockResolvedValue(0);
    mocks.txMock.prediction.deleteMany.mockResolvedValue({ count: 0 });
    mocks.txMock.prediction.findMany.mockResolvedValue([]);
    mocks.txMock.mcpToken.updateMany.mockResolvedValue({ count: 0 });
    mocks.txMock.groupCoupon.updateMany.mockResolvedValue({ count: 0 });
    mocks.txMock.userIdentity.updateMany.mockResolvedValue({ count: 0 });
    mocks.txMock.userIdentity.create.mockResolvedValue({ id: "identity-1" });
    mocks.txMock.user.update.mockResolvedValue({ id: "user-2" });
    mocks.txMock.user.delete.mockResolvedValue({ id: "user-1" });
    // Re-establish top-level prediction mocks
    mocks.prismaMocks.prediction.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
    // Re-establish $transaction to handle both array form and callback form
    mocks.prismaMocks.$transaction.mockImplementation(async (cbOrArray, options) => {
      if (Array.isArray(cbOrArray)) {
        return Promise.all(cbOrArray);
      }
      return cbOrArray(mocks.txMock);
    });
  });

  describe("validation: same id", () => {
    it("returns INVALID_MERGE when source and target are the same", async () => {
      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_MERGE");
        expect(result.message).toContain("kan ikke være den samme");
      }
      // No database queries should be made
      expect(mocks.prismaMocks.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("validation: missing users", () => {
    it("returns USER_NOT_FOUND when source user does not exist", async () => {
      mocks.prismaMocks.user.findUnique.mockResolvedValue(null);

      const result = await mergeUsers({
        sourceUserId: "nonexistent",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("USER_NOT_FOUND");
        expect(result.message).toContain("Kildebrugeren");
      }
    });

    it("returns USER_NOT_FOUND when target user does not exist", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(null);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "nonexistent",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("USER_NOT_FOUND");
        expect(result.message).toContain("Målbrugeren");
      }
    });
  });

  describe("validation: historic target", () => {
    it("returns INVALID_MERGE when target authId starts with historic-", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "historic-placeholder-1",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_MERGE");
        expect(result.message).toContain("historisk");
      }
      // No transaction should be attempted
      expect(mocks.prismaMocks.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("collision detection", () => {
    it("returns MERGE_COLLISION when both users have predictions in same matches", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      // Promise.all calls: target rounds and source real rounds
      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([{ roundId: "round-1" }]) // target rounds
        .mockResolvedValueOnce([{ roundId: "round-1" }]) // source real rounds
        .mockResolvedValueOnce([
          { round: { roundNumber: 1 } },
          { round: { roundNumber: 2 } },
        ]); // collision check

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
        expect(result.message).toContain("1");
        expect(result.message).toContain("2");
      }
    });

    it("names affected round numbers in collision message", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([
        { round: { roundNumber: 5 } },
      ]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("runde 5");
      }
    });

    it("handles P2002 unique constraint error on prediction columns as MERGE_COLLISION", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      // No collisions found in the collision check
      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      // But transaction fails with P2002 on prediction column
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`user_id`,`match_id`,`pick`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: ["user_id", "match_id", "pick"] } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
      }
    });

    it("rethrows non-P2002 errors", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const testError = new Error("Network error");
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(testError);

      await expect(
        mergeUsers({
          sourceUserId: "user-1",
          targetUserId: "user-2",
        })
      ).rejects.toThrow("Network error");
    });

    it("source carried predictions in target rounds are deleted before collision check", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      // Promise.all calls: target rounds and source real rounds
      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([{ roundId: "round-1" }]) // target rounds
        .mockResolvedValueOnce([]) // source real rounds
        .mockResolvedValueOnce([]); // collision check

      mocks.prismaMocks.prediction.deleteMany.mockResolvedValue({ count: 1 });
      mocks.txMock.prediction.updateMany.mockResolvedValue({ count: 2 });
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      // Verify deleteMany called with exact where-clause (guards against deleting real picks)
      const deleteCalls = mocks.prismaMocks.prediction.deleteMany.mock.calls;
      expect(deleteCalls.some(c =>
        JSON.stringify(c[0]) === JSON.stringify({
          where: {
            userId: "user-1",
            carriedFromRoundNumber: { not: null },
            roundId: { in: ["round-1"] },
          },
        })
      )).toBe(true);
    });

    it("target carried predictions in source real rounds are deleted before collision check", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      // Promise.all calls: target rounds and source real rounds
      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([]) // target rounds
        .mockResolvedValueOnce([{ roundId: "round-2" }]) // source real rounds
        .mockResolvedValueOnce([]); // collision check

      mocks.prismaMocks.prediction.deleteMany.mockResolvedValue({ count: 1 });
      mocks.txMock.prediction.updateMany.mockResolvedValue({ count: 1 });
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      // Verify deleteMany called for target's carried picks in source's real rounds
      const deleteCalls = mocks.prismaMocks.prediction.deleteMany.mock.calls;
      expect(deleteCalls.some(c =>
        JSON.stringify(c[0]) === JSON.stringify({
          where: {
            userId: "user-2",
            carriedFromRoundNumber: { not: null },
            roundId: { in: ["round-2"] },
          },
        })
      )).toBe(true);
    });

    it("source non-carried predictions still cause MERGE_COLLISION", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      // Promise.all calls: target rounds and source real rounds
      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([{ roundId: "round-1" }]) // target rounds
        .mockResolvedValueOnce([]) // source real rounds (no real source submissions)
        .mockResolvedValueOnce([{ round: { roundNumber: 1 } }]); // collision check finds collision

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
        expect(result.message).toContain("runde 1");
      }
    });

  });

  describe("successful merge: real source", () => {
    it("returns ok:true with moved predictions count for successful merge", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-real-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]); // No collisions

      mocks.txMock.prediction.updateMany.mockResolvedValue({ count: 3 });
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("user-2");
        expect(result.data.movedPredictions).toBe(3);
      }
    });

    it("includes all table updates in transaction for real source", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-real-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      // Two $transaction calls: array form for deleteMany, then callback form for merge
      expect(mocks.prismaMocks.$transaction).toHaveBeenCalledTimes(2);

      // Verify the updateMany operations have correct where/data
      expect(mocks.txMock.prediction.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });
      expect(mocks.txMock.mcpToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });
      expect(mocks.txMock.groupCoupon.updateMany).toHaveBeenCalledWith({
        where: { createdById: "user-1" },
        data: { createdById: "user-2" },
      });
      expect(mocks.txMock.userIdentity.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });

      // Verify userIdentity.create was called
      expect(mocks.txMock.userIdentity.create).toHaveBeenCalledWith({
        data: {
          authId: "auth-real-1",
          email: "source@example.com",
          userId: "user-2",
        },
      });

      // Verify user.delete was called with source id
      expect(mocks.txMock.user.delete).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });

      // Verify no admin promotion occurred
      expect(mocks.txMock.user.update).not.toHaveBeenCalled();
    });

    it("creates userIdentity with source authId and email", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-real-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      // Verify the userIdentity.create was called with source authId and email, but target userId
      expect(mocks.txMock.userIdentity.create).toHaveBeenCalledWith({
        data: {
          authId: "auth-real-1",
          email: "source@example.com",
          userId: "user-2",
        },
      });
    });
  });

  describe("successful merge: historic source", () => {
    it("succeeds without creating userIdentity for historic source", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "historic-placeholder-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);

      // Verify userIdentity.create was NOT called for historic source
      expect(mocks.txMock.userIdentity.create).not.toHaveBeenCalled();

      // Verify the updateMany and delete operations still happened
      expect(mocks.txMock.prediction.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });
      expect(mocks.txMock.user.delete).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
    });
  });

  describe("admin promotion", () => {
    it("promotes target to admin when source is admin and target is member", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-admin-1",
        email: "admin@example.com",
        displayName: "Admin",
        avatarUrl: null,
        role: "admin",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-member-2",
        email: "member@example.com",
        displayName: "Member",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);
      mocks.txMock.user.update.mockResolvedValue({ id: "user-2", role: "admin" });

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("admin");
      }

      // Verify user.update was called to promote target to admin
      expect(mocks.txMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { role: "admin" },
      });
    });

    it("does not promote target when source is admin but target is already admin", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-admin-1",
        email: "admin1@example.com",
        displayName: "Admin 1",
        avatarUrl: null,
        role: "admin",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-admin-2",
        email: "admin2@example.com",
        displayName: "Admin 2",
        avatarUrl: null,
        role: "admin",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("admin");
      }

      // Verify user.update was NOT called (no redundant promotion)
      expect(mocks.txMock.user.update).not.toHaveBeenCalled();
    });

    it("does not promote target when source is member and target is member", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-member-1",
        email: "member1@example.com",
        displayName: "Member 1",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-member-2",
        email: "member2@example.com",
        displayName: "Member 2",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("member");
      }

      // Verify user.update was NOT called
      expect(mocks.txMock.user.update).not.toHaveBeenCalled();
    });

    it("does not promote target when source is member but target is admin", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-member-1",
        email: "member@example.com",
        displayName: "Member",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-admin-2",
        email: "admin@example.com",
        displayName: "Admin",
        avatarUrl: null,
        role: "admin",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("admin");
      }

      // Verify user.update was NOT called (target already admin)
      expect(mocks.txMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("succeeds when source has zero predictions", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.updateMany.mockResolvedValue({ count: 0 });
      mocks.txMock.prediction.count.mockResolvedValue(0);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.movedPredictions).toBe(0);
      }

      // Three findMany calls: target rounds, source real rounds, collision check
      expect(mocks.prismaMocks.prediction.findMany).toHaveBeenCalledTimes(3);
    });

    it("throws MERGE_RACE when prediction is inserted during merge", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      // Race condition: count returns > 0 after the move
      mocks.txMock.prediction.count.mockResolvedValue(1);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_RACE");
        expect(result.message).toContain("tips på kontoen under sammenlægningen");
      }

      // user.delete should NOT have been called due to race guard
      expect(mocks.txMock.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("P2002 error handling", () => {
    it("returns INVALID_MERGE when P2002 involves auth_id (array form)", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`auth_id`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: ["auth_id"] } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_MERGE");
      }
    });

    it("returns INVALID_MERGE when P2002 involves auth_id (constraint name form)", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      // PostgreSQL often returns constraint name instead of column list
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`auth_id`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: "users_auth_id_key" } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_MERGE");
      }
    });

    it("returns MERGE_COLLISION when P2002 involves user_id and match_id (array form)", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`user_id`,`match_id`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: ["user_id", "match_id"] } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
      }
    });

    it("returns MERGE_COLLISION when P2002 involves user_id and match_id (constraint name form)", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      // PostgreSQL often returns constraint name
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`user_id`,`match_id`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: "predictions_user_id_match_id_key" } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
      }
    });

    it("returns generic error when P2002 target is unrecognised", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      // P2002 with unknown target - should return a generic error, not throw
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`unknown_column`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: ["unknown_column"] } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
      }
    });

    it("returns generic error when P2002 meta.target is absent", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      // P2002 without meta.target - should return generic error, not throw
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "5.0.0" }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
      }
    });

    it("returns generic error when P2002 has user_id but NOT match_id", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      // P2002 with user_id but NOT match_id - should return generic error, not MERGE_COLLISION
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`user_id`)",
        { code: "P2002", clientVersion: "5.0.0", meta: { target: ["user_id"] } }
      );
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(error);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MERGE_COLLISION");
      }
    });

    it("rethrows non-Prisma errors from transaction", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);

      const testError = new Error("Network error");
      mocks.prismaMocks.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }]).mockRejectedValueOnce(testError);

      await expect(
        mergeUsers({
          sourceUserId: "user-1",
          targetUserId: "user-2",
        })
      ).rejects.toThrow("Network error");
    });
  });

  describe("lock ordering and transaction options", () => {
    it("takes FOR UPDATE lock before any mutation in transaction", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-real-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      // Verify $queryRaw was called
      expect(mocks.txMock.$queryRaw).toHaveBeenCalledOnce();

      // Inspect the actual call to verify it's the FOR UPDATE lock
      const callArgs = mocks.txMock.$queryRaw.mock.calls[0];
      expect(callArgs).toBeDefined();

      // First arg is the TemplateStringsArray; join it to verify it contains FOR UPDATE
      const templateStrings = callArgs[0] as any[];
      const joinedTemplate = templateStrings.join("");
      expect(joinedTemplate).toContain("FOR UPDATE");

      // Second arg is the bound value (the sourceUserId), not the targetUserId
      const boundValue = callArgs[1];
      expect(boundValue).toBe("user-1");
      expect(boundValue).not.toBe("user-2");

      // Verify lock precedes mutation by checking invocation call order
      const lockCallOrder = (mocks.txMock.$queryRaw.mock as any).invocationCallOrder[0];
      const updateCallOrder = (mocks.txMock.prediction.updateMany.mock as any).invocationCallOrder[0];

      expect(lockCallOrder).toBeLessThan(updateCallOrder);
    });

    it("passes timeout option to $transaction", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-real-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      // Verify $transaction was called with timeout option
      expect(mocks.prismaMocks.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 20000 }
      );
    });
  });

  describe("collision detection: arguments verification", () => {
    it("calls collision check with correct arguments", async () => {
      const sourceUser: User = {
        id: "user-1",
        authId: "auth-real-1",
        email: "source@example.com",
        displayName: "Source",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const targetUser: User = {
        id: "user-2",
        authId: "auth-real-2",
        email: "target@example.com",
        displayName: "Target",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.prismaMocks.user.findUnique
        .mockResolvedValueOnce(sourceUser)
        .mockResolvedValueOnce(targetUser);

      mocks.prismaMocks.prediction.findMany.mockResolvedValue([]);
      mocks.txMock.prediction.count.mockResolvedValue(0);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      // Verify prediction.findMany was called with correct arguments
      expect(mocks.prismaMocks.prediction.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-2",
          match: { predictions: { some: { userId: "user-1" } } },
        },
        select: { round: { select: { roundNumber: true } } },
        distinct: ["roundId"],
      });
    });
  });

});
