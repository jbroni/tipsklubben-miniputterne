import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => ({
  prismaMocks: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    userIdentity: {
      findUnique: vi.fn(),
    },
  },
  supabaseMocks: {
    auth: {
      getUser: vi.fn(),
    },
  },
  headersMocks: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

vi.mock("./supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: mocks.supabaseMocks.auth,
  }),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headersMocks,
}));

import { getCurrentUser, getCurrentUserFromHeaders, syncUser } from "./auth";

describe("auth functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCurrentUser", () => {
    it("returns user from active authId match", async () => {
      const user: User = {
        id: "user-1",
        authId: "auth-1",
        email: "user@example.com",
        displayName: "User",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.supabaseMocks.auth.getUser.mockResolvedValue({
        data: { user: { id: "auth-1" } },
      });

      mocks.prismaMocks.user.findUnique.mockResolvedValue(user);

      const result = await getCurrentUser();

      expect(result).toEqual(user);
    });

    it("returns surviving user when authId matches retired identity", async () => {
      const survivingUser: User = {
        id: "user-2",
        authId: "auth-active",
        email: "surviving@example.com",
        displayName: "Surviving",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      mocks.supabaseMocks.auth.getUser.mockResolvedValue({
        data: { user: { id: "auth-retired" } },
      });

      // No active user with auth-retired
      mocks.prismaMocks.user.findUnique.mockResolvedValue(null);

      // But a retired identity exists
      mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue({
        id: "identity-1",
        userId: "user-2",
        authId: "auth-retired",
        email: "retired@example.com",
        createdAt: new Date(),
        user: survivingUser,
      });

      const result = await getCurrentUser();

      expect(result).toEqual(survivingUser);
      expect(result?.id).toBe("user-2");
    });

    it("returns null when no user or identity matches authId", async () => {
      mocks.supabaseMocks.auth.getUser.mockResolvedValue({
        data: { user: { id: "unknown-auth" } },
      });

      mocks.prismaMocks.user.findUnique.mockResolvedValue(null);
      mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);

      const result = await getCurrentUser();

      expect(result).toBeNull();
    });

    it("returns null when not authenticated", async () => {
      mocks.supabaseMocks.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const result = await getCurrentUser();

      expect(result).toBeNull();
      // Should not query database when not authenticated
      expect(mocks.prismaMocks.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentUserFromHeaders", () => {
    it("returns user when x-auth-user-id header matches active authId", async () => {
      const user: User = {
        id: "user-1",
        authId: "auth-1",
        email: "user@example.com",
        displayName: "User",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const headersList = new Map();
      headersList.set("x-auth-user-id", "auth-1");
      mocks.headersMocks.mockReturnValue(headersList);

      mocks.prismaMocks.user.findUnique.mockResolvedValue(user);

      const result = await getCurrentUserFromHeaders();

      expect(result).toEqual(user);
    });

    it("returns surviving user when header authId is retired identity", async () => {
      const survivingUser: User = {
        id: "user-2",
        authId: "auth-active",
        email: "surviving@example.com",
        displayName: "Surviving",
        avatarUrl: null,
        role: "member",
        createdAt: new Date(),
      };

      const headersList = new Map();
      headersList.set("x-auth-user-id", "auth-retired");
      mocks.headersMocks.mockReturnValue(headersList);

      // No active user
      mocks.prismaMocks.user.findUnique.mockResolvedValue(null);

      // But retired identity exists
      mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue({
        id: "identity-1",
        userId: "user-2",
        authId: "auth-retired",
        email: "retired@example.com",
        createdAt: new Date(),
        user: survivingUser,
      });

      const result = await getCurrentUserFromHeaders();

      expect(result).toEqual(survivingUser);
    });

    it("returns null when header is missing", async () => {
      const headersList = new Map();
      mocks.headersMocks.mockReturnValue(headersList);

      const result = await getCurrentUserFromHeaders();

      expect(result).toBeNull();
      // Should not query database when no header
      expect(mocks.prismaMocks.user.findUnique).not.toHaveBeenCalled();
    });

    it("returns null when authId in header does not match any user", async () => {
      const headersList = new Map();
      headersList.set("x-auth-user-id", "unknown-auth");
      mocks.headersMocks.mockReturnValue(headersList);

      mocks.prismaMocks.user.findUnique.mockResolvedValue(null);
      mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);

      const result = await getCurrentUserFromHeaders();

      expect(result).toBeNull();
    });
  });

  describe("syncUser", () => {
    describe("with known active authId", () => {
      it("upserts email and displayName for existing user", async () => {
        const updatedUser: User = {
          id: "user-1",
          authId: "auth-1",
          email: "new@example.com",
          displayName: "New Name",
          avatarUrl: "http://new-avatar.jpg",
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(updatedUser);

        const result = await syncUser({
          id: "auth-1",
          email: "new@example.com",
          user_metadata: {
            full_name: "New Name",
            avatar_url: "http://new-avatar.jpg",
          },
        });

        expect(result.id).toBe("user-1");
        expect(result.email).toBe("new@example.com");
        expect(result.displayName).toBe("New Name");
        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith({
          where: { authId: "auth-1" },
          update: {
            email: "new@example.com",
            displayName: "New Name",
            avatarUrl: "http://new-avatar.jpg",
          },
          create: {
            authId: "auth-1",
            email: "new@example.com",
            displayName: "New Name",
            avatarUrl: "http://new-avatar.jpg",
          },
        });
      });

      it("uses full_name from user_metadata for displayName", async () => {
        const user: User = {
          id: "user-1",
          authId: "auth-1",
          email: "user@example.com",
          displayName: "Full Name",
          avatarUrl: null,
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(user);

        await syncUser({
          id: "auth-1",
          email: "user@example.com",
          user_metadata: {
            full_name: "Full Name",
          },
        });

        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              displayName: "Full Name",
            }),
            create: expect.objectContaining({
              displayName: "Full Name",
            }),
          })
        );
      });

      it("falls back to name when full_name is missing", async () => {
        const user: User = {
          id: "user-1",
          authId: "auth-1",
          email: "user@example.com",
          displayName: "Name Only",
          avatarUrl: null,
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(user);

        await syncUser({
          id: "auth-1",
          email: "user@example.com",
          user_metadata: {
            name: "Name Only",
          },
        });

        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              displayName: "Name Only",
            }),
            create: expect.objectContaining({
              displayName: "Name Only",
            }),
          })
        );
      });

      it("falls back to email local-part when no full_name or name", async () => {
        const user: User = {
          id: "user-1",
          authId: "auth-1",
          email: "john@example.com",
          displayName: "john",
          avatarUrl: null,
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(user);

        await syncUser({
          id: "auth-1",
          email: "john@example.com",
          user_metadata: {},
        });

        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              displayName: "john",
            }),
            create: expect.objectContaining({
              displayName: "john",
            }),
          })
        );
      });
    });

    describe("with retired authId", () => {
      it("returns surviving user unchanged when authId is retired identity", async () => {
        const survivingUser: User = {
          id: "user-surviving",
          authId: "auth-active",
          email: "surviving@example.com",
          displayName: "Original Name",
          avatarUrl: "http://original-avatar.jpg",
          role: "member",
          createdAt: new Date(),
        };

        // No active user with the retired authId
        mocks.prismaMocks.user.findUnique.mockResolvedValue(null);

        // But a retired identity exists
        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue({
          id: "identity-1",
          userId: "user-surviving",
          authId: "auth-retired",
          email: "retired@example.com",
          createdAt: new Date(),
          user: survivingUser,
        });

        const result = await syncUser({
          id: "auth-retired",
          email: "retired-new@example.com",
          user_metadata: {
            full_name: "Retired New Name",
            avatar_url: "http://retired-avatar.jpg",
          },
        });

        expect(result.id).toBe("user-surviving");
        expect(result.email).toBe("surviving@example.com"); // Unchanged
        expect(result.displayName).toBe("Original Name"); // Unchanged
        expect(result.avatarUrl).toBe("http://original-avatar.jpg"); // Unchanged

        // Should not call upsert
        expect(mocks.prismaMocks.user.upsert).not.toHaveBeenCalled();
      });

      it("does not overwrite survivor profile with retired account data", async () => {
        const survivingUser: User = {
          id: "user-2",
          authId: "auth-active",
          email: "survivor@example.com",
          displayName: "Survivor Name",
          avatarUrl: "http://survivor-avatar.jpg",
          role: "member",
          createdAt: new Date(),
        };

        // No active user with the retired authId
        mocks.prismaMocks.user.findUnique.mockResolvedValue(null);

        // But a retired identity exists
        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue({
          id: "identity-1",
          userId: "user-2",
          authId: "auth-retired",
          email: "retired@example.com",
          createdAt: new Date(),
          user: survivingUser,
        });

        await syncUser({
          id: "auth-retired",
          email: "retired@example.com",
          user_metadata: {
            full_name: "Retired Name",
            avatar_url: "http://retired-avatar.jpg",
          },
        });

        // No upsert should happen
        expect(mocks.prismaMocks.user.upsert).not.toHaveBeenCalled();
      });
    });

    describe("with unknown authId", () => {
      it("upserts new user with email, full_name, and avatar_url", async () => {
        const newUser: User = {
          id: "user-3",
          authId: "auth-new",
          email: "new@example.com",
          displayName: "New User",
          avatarUrl: "http://new-avatar.jpg",
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(newUser);

        const result = await syncUser({
          id: "auth-new",
          email: "new@example.com",
          user_metadata: {
            full_name: "New User",
            avatar_url: "http://new-avatar.jpg",
          },
        });

        expect(result.id).toBe("user-3");
        expect(result.email).toBe("new@example.com");
        expect(result.displayName).toBe("New User");
        expect(result.avatarUrl).toBe("http://new-avatar.jpg");

        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith({
          where: { authId: "auth-new" },
          update: {
            email: "new@example.com",
            displayName: "New User",
            avatarUrl: "http://new-avatar.jpg",
          },
          create: {
            authId: "auth-new",
            email: "new@example.com",
            displayName: "New User",
            avatarUrl: "http://new-avatar.jpg",
          },
        });
      });

      it("upserts new user with email local-part as displayName fallback", async () => {
        const newUser: User = {
          id: "user-3",
          authId: "auth-new",
          email: "alice@example.com",
          displayName: "alice",
          avatarUrl: null,
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(newUser);

        const result = await syncUser({
          id: "auth-new",
          email: "alice@example.com",
          user_metadata: {},
        });

        expect(result.displayName).toBe("alice");
        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              displayName: "alice",
            }),
          })
        );
      });

      it("handles missing email gracefully", async () => {
        const newUser: User = {
          id: "user-3",
          authId: "auth-new",
          email: "",
          displayName: "name-from-metadata",
          avatarUrl: null,
          role: "member",
          createdAt: new Date(),
        };

        mocks.prismaMocks.userIdentity.findUnique.mockResolvedValue(null);
        mocks.prismaMocks.user.upsert.mockResolvedValue(newUser);

        await syncUser({
          id: "auth-new",
          user_metadata: {
            name: "name-from-metadata",
          },
        });

        expect(mocks.prismaMocks.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              email: "",
              displayName: "name-from-metadata",
            }),
          })
        );
      });
    });
  });
});
