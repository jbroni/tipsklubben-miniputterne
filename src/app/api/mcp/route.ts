export const runtime = "nodejs";
export const maxDuration = 60;

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server";
import { verifyMcpToken } from "@/lib/mcp/tokens";
import { registerPlayerTools } from "@/lib/mcp/tools/player";
import { registerAdminTools } from "@/lib/mcp/tools/admin";

/**
 * Initialize the MCP server with all player and admin tools.
 */
function initializeServer(server: McpServer): void {
  registerPlayerTools(server);
  registerAdminTools(server);
}

/**
 * Verify an MCP token and return auth info for the request context.
 */
async function verifyToken(
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const user = await verifyMcpToken(bearerToken);
  if (!user) {
    return undefined;
  }

  return {
    token: bearerToken!,
    clientId: "tips13-mcp",
    scopes: user.role === "admin" ? ["player", "admin"] : ["player"],
    extra: {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
    },
  };
}

/**
 * Create the MCP handler and wrap it with auth.
 */
const mcpHandler = createMcpHandler(initializeServer, {
  serverInfo: {
    name: "Tips13 MCP Server",
    version: "1.0.0",
  },
});

const authenticatedHandler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
});

/**
 * Export the handler for both GET and POST requests.
 */
export { authenticatedHandler as GET, authenticatedHandler as POST };
