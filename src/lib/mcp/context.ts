/**
 * Helpers for extracting and validating caller context from MCP request handlers.
 * These functions provide safe narrowing from the loosely-typed ctx parameter
 * that MCP handlers receive.
 */

import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ServiceResult } from "@/lib/services/result";

export type McpCaller = {
  userId: string;
  role: string;
  displayName: string;
};

type McpAuthContext = {
  http?: { authInfo?: { extra?: Record<string, unknown> } };
};

/**
 * Runtime type guard to check if a value conforms to McpAuthContext.
 */
function isMcpAuthContext(value: unknown): value is McpAuthContext {
  return typeof value === "object" && value !== null;
}

/**
 * Extract caller info from MCP context.
 * Throws if authInfo is absent or malformed.
 */
export function getCaller(ctx: unknown): McpCaller {
  if (!isMcpAuthContext(ctx)) {
    throw new Error("Missing auth context");
  }

  const authInfo = ctx.http?.authInfo?.extra;

  if (!authInfo || typeof authInfo !== "object") {
    throw new Error("Missing auth context");
  }

  const userId = authInfo.userId;
  const role = authInfo.role;
  const displayName = authInfo.displayName;

  if (
    typeof userId !== "string" || !userId ||
    typeof role !== "string" || !role ||
    typeof displayName !== "string" || !displayName
  ) {
    throw new Error("Missing required auth fields");
  }

  return {
    userId,
    role,
    displayName,
  };
}

/**
 * Extract and validate that caller is an admin.
 * Throws if not authenticated or not an admin.
 */
export function requireAdminCaller(ctx: unknown): McpCaller {
  const caller = getCaller(ctx);

  if (caller.role !== "admin") {
    throw new Error("Admin role required");
  }

  return caller;
}

/**
 * Format a value as indented JSON text result for MCP response.
 */
export function textResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Format an error message as MCP error response.
 */
export function errorResult(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * Convert a ServiceResult to a CallToolResult.
 * Success responses are formatted as text, errors include code + message.
 */
export function fromService<T>(result: ServiceResult<T>): CallToolResult {
  if (result.ok) {
    return textResult(result.data);
  }

  return errorResult(`${result.code}: ${result.message}`);
}
