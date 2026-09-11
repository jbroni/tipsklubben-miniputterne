import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { User } from "@prisma/client";

export const TOKEN_PREFIX = "t13_";

/**
 * Generates a new MCP token with its hash and prefix for storage.
 * Returns the clear token (shown once to the user), its SHA-256 hash for DB storage,
 * and the prefix (first 10 chars) for display in token lists.
 */
export function generateToken(): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const randomPart = randomBytes(32).toString("base64url");
  const token = TOKEN_PREFIX + randomPart;
  const tokenHash = hashToken(token);
  const tokenPrefix = token.substring(0, 10);

  return {
    token,
    tokenHash,
    tokenPrefix,
  };
}

/**
 * Hashes a token using SHA-256. Deterministic with no salt;
 * the token already contains 256 bits of entropy.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Extracts a token from an Authorization header or bare token string.
 * Accepts either "Bearer <token>" or a raw token.
 * Returns the trimmed token if non-empty, else null.
 */
export function parseBearer(
  header: string | null | undefined
): string | null {
  if (!header) return null;

  const trimmed = header.trim();

  // Check for "Bearer " prefix (case-insensitive)
  const bearerMatch = trimmed.match(/^bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1].trim();
  }

  // Return as-is if non-empty
  return trimmed || null;
}

/**
 * Verifies an MCP token by parsing, hashing, and looking it up in the database.
 * Returns the full User row (including role) so callers can authorize,
 * or null if the token is invalid, revoked, or not found.
 *
 * Unlike getCurrentUser() in src/lib/auth.ts, this makes no Supabase network call —
 * it queries the database directly via Prisma.
 *
 * Updates lastUsedAt on success without blocking the request on write failure.
 */
export async function verifyMcpToken(
  bearer: string | null | undefined
): Promise<User | null> {
  const token = parseBearer(bearer);
  if (!token) return null;

  // Fast reject: if token doesn't start with the expected prefix, skip DB lookup
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(token);

  const record = await prisma.mcpToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt !== null) {
    return null;
  }

  // Update lastUsedAt without blocking on failure
  prisma.mcpToken
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Silently ignore write failures so they don't block auth
    });

  return record.user;
}
