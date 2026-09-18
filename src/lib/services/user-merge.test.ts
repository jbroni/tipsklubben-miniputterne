import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => ({
  prismaMocks: {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    prediction: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
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
    round: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

import { mergeUsers } from "./user-merge";

describe("mergeUsers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Establish default $transaction behavior
    mocks.prismaMocks.$transaction.mockResolvedValue([
      { count: 0 },
      { count: 0 },
      { count: 0 },
      { count: 0 },
      { id: "identity-1" },
      { id: "user-1" },
    ] as unknown[]);
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

      // Source has predictions in matches m1, m2, m3
      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([
          { matchId: "m1", roundId: "round-1" },
          { matchId: "m2", roundId: "round-2" },
          { matchId: "m3", roundId: "round-2" },
        ])
        .mockResolvedValueOnce([
          { matchId: "m1", roundId: "round-1" }, // Collision on m1 in round 1
          { matchId: "m2", roundId: "round-2" }, // Collision on m2 in round 2
        ]);

      mocks.prismaMocks.round.findMany.mockResolvedValue([
        { id: "round-1", roundNumber: 1 },
        { id: "round-2", roundNumber: 2 },
      ]);

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
      // Transaction should not be called
      expect(mocks.prismaMocks.$transaction).not.toHaveBeenCalled();
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([
          { matchId: "m1", roundId: "round-5" },
        ])
        .mockResolvedValueOnce([
          { matchId: "m1", roundId: "round-5" },
        ]);

      mocks.prismaMocks.round.findMany.mockResolvedValue([
        { id: "round-5", roundNumber: 5 },
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

    it("handles P2002 unique constraint error as MERGE_COLLISION", async () => {
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
      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([
          { matchId: "m1", roundId: "round-1" },
        ])
        .mockResolvedValueOnce([]); // No collisions

      // But transaction fails with P2002
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "5.0.0" }
      );
      mocks.prismaMocks.$transaction.mockRejectedValueOnce(error);

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
      mocks.prismaMocks.$transaction.mockRejectedValueOnce(testError);

      await expect(
        mergeUsers({
          sourceUserId: "user-1",
          targetUserId: "user-2",
        })
      ).rejects.toThrow("Network error");
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([
          { matchId: "m1", roundId: "round-1" },
          { matchId: "m2", roundId: "round-1" },
          { matchId: "m3", roundId: "round-1" },
        ])
        .mockResolvedValueOnce([]); // No collisions

      mocks.prismaMocks.$transaction.mockResolvedValue([
        { count: 3 }, // predictions updateMany
        { count: 0 }, // mcpToken updateMany
        { count: 0 }, // groupCoupon updateMany
        { count: 0 }, // userIdentity updateMany
        { id: "identity-1" }, // userIdentity create
        { id: "user-1" }, // user delete
      ]);

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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-1" },
      ] as unknown[]);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(mocks.prismaMocks.$transaction).toHaveBeenCalledOnce();
      const operations = mocks.prismaMocks.$transaction.mock.calls[0][0] as any[];

      // Should have 6 operations for real source (no admin promotion):
      // 1. prediction.updateMany
      // 2. mcpToken.updateMany
      // 3. groupCoupon.updateMany
      // 4. userIdentity.updateMany
      // 5. userIdentity.create
      // 6. user.delete
      expect(Array.isArray(operations)).toBe(true);
      expect(operations.length).toBe(6);

      // Verify the updateMany operations have correct where/data
      expect(mocks.prismaMocks.prediction.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });
      expect(mocks.prismaMocks.mcpToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });
      expect(mocks.prismaMocks.groupCoupon.updateMany).toHaveBeenCalledWith({
        where: { createdById: "user-1" },
        data: { createdById: "user-2" },
      });
      expect(mocks.prismaMocks.userIdentity.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });

      // Verify user.delete was called with source id
      expect(mocks.prismaMocks.user.delete).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });

      // Verify no admin promotion occurred
      expect(mocks.prismaMocks.user.update).not.toHaveBeenCalled();
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-1" },
      ] as unknown[]);

      await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      // Verify the userIdentity.create was called with source authId and email, but target userId
      expect(mocks.prismaMocks.userIdentity.create).toHaveBeenCalledWith({
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "user-1" },
      ] as unknown[]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);

      // For historic source, transaction should have 5 operations (no create)
      const operations = mocks.prismaMocks.$transaction.mock.calls[0][0] as any[];
      expect(operations.length).toBe(5);

      // Verify userIdentity.create was NOT called for historic source
      expect(mocks.prismaMocks.userIdentity.create).not.toHaveBeenCalled();

      // Verify the updateMany and delete operations still happened
      expect(mocks.prismaMocks.prediction.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { userId: "user-2" },
      });
      expect(mocks.prismaMocks.user.delete).toHaveBeenCalledWith({
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-2", role: "admin" },
        { id: "user-1" },
      ] as unknown[]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("admin");
      }

      // Verify user.update was called to promote target to admin
      expect(mocks.prismaMocks.user.update).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { role: "admin" },
      });

      // Transaction should have 7 operations (4 base + create + update + delete)
      const operations = mocks.prismaMocks.$transaction.mock.calls[0][0] as any[];
      expect(operations.length).toBe(7);
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-1" },
      ] as unknown[]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("admin");
      }

      // Verify user.update was NOT called (no redundant promotion)
      expect(mocks.prismaMocks.user.update).not.toHaveBeenCalled();

      // Transaction should have 6 operations (4 base + create, no update + delete)
      const operations = mocks.prismaMocks.$transaction.mock.calls[0][0] as any[];
      expect(operations.length).toBe(6);
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-1" },
      ] as unknown[]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("member");
      }

      // Verify user.update was NOT called
      expect(mocks.prismaMocks.user.update).not.toHaveBeenCalled();

      // Transaction should have 6 operations (4 base + create, no update + delete)
      const operations = mocks.prismaMocks.$transaction.mock.calls[0][0] as any[];
      expect(operations.length).toBe(6);
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

      mocks.prismaMocks.prediction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-1" },
      ] as unknown[]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.role).toBe("admin");
      }

      // Verify user.update was NOT called (target already admin)
      expect(mocks.prismaMocks.user.update).not.toHaveBeenCalled();

      // Transaction should have 6 operations (4 base + create, no update + delete)
      const operations = mocks.prismaMocks.$transaction.mock.calls[0][0] as any[];
      expect(operations.length).toBe(6);
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

      // Source has no predictions
      mocks.prismaMocks.prediction.findMany.mockResolvedValueOnce([]);

      mocks.prismaMocks.$transaction.mockResolvedValueOnce([
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { count: 0 },
        { id: "identity-1" },
        { id: "user-1" },
      ] as unknown[]);

      const result = await mergeUsers({
        sourceUserId: "user-1",
        targetUserId: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.movedPredictions).toBe(0);
      }

      // Collision check should not be performed when source has no predictions
      expect(mocks.prismaMocks.prediction.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
