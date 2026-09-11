import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Create mocks before module imports
const mocks = vi.hoisted(() => ({
  prismaMocks: {
    mcpToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

import {
  generateToken,
  hashToken,
  parseBearer,
  TOKEN_PREFIX,
  verifyMcpToken,
} from "./tokens";

describe("generateToken", () => {
  it("starts with t13_ prefix", () => {
    const { token } = generateToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
  });

  it("tokenPrefix is first 10 chars of token", () => {
    const { token, tokenPrefix } = generateToken();
    expect(tokenPrefix).toBe(token.substring(0, 10));
  });

  it("tokenHash equals hashToken(token)", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toBe(hashToken(token));
  });

  it("successive calls produce different tokens", () => {
    const { token: token1 } = generateToken();
    const { token: token2 } = generateToken();
    expect(token1).not.toBe(token2);
  });

  it("successive calls produce different hashes", () => {
    const { tokenHash: hash1 } = generateToken();
    const { tokenHash: hash2 } = generateToken();
    expect(hash1).not.toBe(hash2);
  });
});

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    const token = "t13_test_token_xyz";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hashToken("t13_token_1");
    const hash2 = hashToken("t13_token_2");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashToken("t13_test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseBearer", () => {
  describe("Bearer header parsing", () => {
    it('extracts token from "Bearer t13_xxx" format', () => {
      const result = parseBearer("Bearer t13_abc123");
      expect(result).toBe("t13_abc123");
    });

    it("is case-insensitive for Bearer prefix", () => {
      expect(parseBearer("bearer t13_abc123")).toBe("t13_abc123");
      expect(parseBearer("BEARER t13_abc123")).toBe("t13_abc123");
      expect(parseBearer("Bearer t13_abc123")).toBe("t13_abc123");
      expect(parseBearer("BeArEr t13_abc123")).toBe("t13_abc123");
    });

    it("tolerates extra whitespace around Bearer prefix", () => {
      expect(parseBearer("Bearer  t13_abc123")).toBe("t13_abc123");
      expect(parseBearer("Bearer   t13_abc123")).toBe("t13_abc123");
    });

    it("trims whitespace from extracted token", () => {
      const result = parseBearer("Bearer t13_abc123 ");
      expect(result).toBe("t13_abc123");
    });
  });

  describe("bare token pass-through", () => {
    it("returns bare token if no Bearer prefix", () => {
      const result = parseBearer("t13_abc123");
      expect(result).toBe("t13_abc123");
    });

    it("returns trimmed bare token", () => {
      const result = parseBearer("  t13_abc123  ");
      expect(result).toBe("t13_abc123");
    });
  });

  describe("null/empty handling", () => {
    it("returns null for null input", () => {
      expect(parseBearer(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseBearer(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseBearer("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(parseBearer("   ")).toBeNull();
    });
  });
});

describe("verifyMcpToken", () => {
  const mockUser: User = {
    id: "user-123",
    authId: "auth-123",
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: "https://example.com/avatar.jpg",
    role: "member",
    createdAt: new Date("2024-01-01"),
  };

  const testToken = "t13_test_secret_token_abc123xyz";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("null/undefined/empty-string input", () => {
    it("returns null for null input without calling findUnique", async () => {
      const result = await verifyMcpToken(null);
      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for undefined input without calling findUnique", async () => {
      const result = await verifyMcpToken(undefined);
      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for empty string without calling findUnique", async () => {
      const result = await verifyMcpToken("");
      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("fast-reject path (invalid prefix)", () => {
    it("returns null for token without t13_ prefix without calling findUnique", async () => {
      const result = await verifyMcpToken("invalid_token_no_prefix");
      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for token with wrong prefix without calling findUnique", async () => {
      const result = await verifyMcpToken("wrong_prefix_test123");
      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).not.toHaveBeenCalled();
    });

    it("works with Bearer prefix but still rejects invalid token prefix", async () => {
      const result = await verifyMcpToken("Bearer invalid_token");
      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("token not found in database", () => {
    it("returns null when findUnique resolves to null", async () => {
      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(null);

      const result = await verifyMcpToken(testToken);

      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.findUnique).toHaveBeenCalled();
    });
  });

  describe("revoked token handling", () => {
    it("returns null when token is revoked (revokedAt is a Date)", async () => {
      const revokedDate = new Date("2024-06-01");
      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue({
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: revokedDate,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      });

      const result = await verifyMcpToken(testToken);

      expect(result).toBeNull();
      expect(mocks.prismaMocks.mcpToken.update).not.toHaveBeenCalled();
    });
  });

  describe("successful token verification", () => {
    it("returns user object when token is valid and not revoked", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockResolvedValue(tokenRecord);

      const result = await verifyMcpToken(testToken);

      expect(result).toEqual(mockUser);
    });

    it("accepts Bearer-prefixed token and still returns user", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockResolvedValue(tokenRecord);

      const result = await verifyMcpToken(`Bearer ${testToken}`);

      expect(result).toEqual(mockUser);
    });
  });

  describe("hash-based lookup (security guard)", () => {
    it("queries by tokenHash, not by the clear token", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockResolvedValue(tokenRecord);

      await verifyMcpToken(testToken);

      expect(mocks.prismaMocks.mcpToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken(testToken) },
        include: { user: true },
      });
    });

    it("does not include raw token in findUnique call", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockResolvedValue(tokenRecord);

      await verifyMcpToken(testToken);

      const callArg = mocks.prismaMocks.mcpToken.findUnique.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty("token");
      expect(callArg.where.tokenHash).toBe(hashToken(testToken));
    });
  });

  describe("lastUsedAt update", () => {
    it("updates lastUsedAt when token is verified", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockResolvedValue({
        ...tokenRecord,
        lastUsedAt: new Date(),
      });

      await verifyMcpToken(testToken);

      expect(mocks.prismaMocks.mcpToken.update).toHaveBeenCalledWith({
        where: { id: "token-123" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("does not update lastUsedAt when token is not found", async () => {
      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(null);

      await verifyMcpToken(testToken);

      expect(mocks.prismaMocks.mcpToken.update).not.toHaveBeenCalled();
    });

    it("does not update lastUsedAt when token is revoked", async () => {
      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue({
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: new Date("2024-06-01"),
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      });

      await verifyMcpToken(testToken);

      expect(mocks.prismaMocks.mcpToken.update).not.toHaveBeenCalled();
    });
  });

  describe("fire-and-forget update behavior", () => {
    it("still returns user even when update rejects", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockRejectedValue(
        new Error("Database write failed")
      );

      const result = await verifyMcpToken(testToken);

      expect(result).toEqual(mockUser);
    });

    it("does not throw when update rejects", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockRejectedValue(
        new Error("Database write failed")
      );

      await expect(verifyMcpToken(testToken)).resolves.toEqual(mockUser);
    });

    it("calls update even if it will reject (fire-and-forget pattern)", async () => {
      const tokenRecord = {
        id: "token-123",
        tokenHash: hashToken(testToken),
        revokedAt: null,
        user: mockUser,
        createdAt: new Date("2024-01-01"),
        lastUsedAt: null,
        userId: mockUser.id,
      };

      mocks.prismaMocks.mcpToken.findUnique.mockResolvedValue(tokenRecord);
      mocks.prismaMocks.mcpToken.update.mockRejectedValue(
        new Error("Database write failed")
      );

      await verifyMcpToken(testToken);

      expect(mocks.prismaMocks.mcpToken.update).toHaveBeenCalled();
    });
  });
});

