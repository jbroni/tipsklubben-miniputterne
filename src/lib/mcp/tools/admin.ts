/**
 * Admin-facing MCP tools: create rounds, manage matches, set results.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/prisma";
import { createRound, updateRound } from "@/lib/services/rounds";
import {
  addMatches,
  setMatchFedt,
  setResults,
  resolveResultsAuto,
} from "@/lib/services/matches";
import {
  fetchFixtures,
  getAvailableLeagues,
} from "@/lib/football-api";
import {
  requireAdminCaller,
  textResult,
  errorResult,
  fromService,
} from "@/lib/mcp/context";

export function registerAdminTools(server: McpServer): void {
  server.registerTool(
    "create_round",
    {
      title: "Create Round",
      description:
        "Create a new round for a season. Defaults to the active season if seasonId is omitted. Deadline must be a valid ISO 8601 datetime string.",
      inputSchema: z.object({
        seasonId: z.string().optional(),
        roundNumber: z.number().int().positive(),
        deadline: z.string(),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        // Get active season if not provided
        let targetSeasonId = input.seasonId;
        if (!targetSeasonId) {
          const activeSeason = await prisma.season.findFirst({
            where: { isActive: true },
          });
          if (!activeSeason) {
            return errorResult("No active season found");
          }
          targetSeasonId = activeSeason.id;
        }

        const result = await createRound({
          seasonId: targetSeasonId,
          roundNumber: input.roundNumber,
          deadline: input.deadline,
        });

        return fromService(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "update_round",
    {
      title: "Update Round",
      description:
        "Update a round's status (open/locked/completed) or deadline. Pass only the fields you want to change.",
      inputSchema: z.object({
        roundId: z.string(),
        status: z.enum(["open", "locked", "completed"]).optional(),
        deadline: z.string().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        const result = await updateRound({
          roundId: input.roundId,
          status: input.status,
          deadline: input.deadline,
        });

        return fromService(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "fetch_fixtures",
    {
      title: "Fetch Fixtures",
      description: `Fetch fixtures from football-data.org for a league and date range. Supported leagues: ${getAvailableLeagues().join(
        ", "
      )}. Note: The Danish Superliga is not available on the free tier. Dates must be YYYY-MM-DD format. Returns fixtures with externalId values for use in add_matches.`,
      inputSchema: z.object({
        league: z.string().refine(
          (val) => getAvailableLeagues().includes(val),
          "Unsupported league"
        ),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        const fixtures = await fetchFixtures(input.league, input.dateFrom, input.dateTo);
        return textResult(fixtures);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "add_matches",
    {
      title: "Add Matches",
      description:
        "Add matches to a round. Odds must be provided by the caller (not available from football-data.org). The externalId field is optional and used only as a passthrough for reference; match IDs are generated on insert. A Tips 13 round is typically exactly 13 matches; any other count is accepted but a warning is returned.",
      inputSchema: z.object({
        roundId: z.string(),
        matches: z.array(
          z.object({
            matchNumber: z.number().int().optional(),
            homeTeam: z.string(),
            awayTeam: z.string(),
            league: z.string(),
            kickoff: z.string(),
            oddsHome: z.number().positive(),
            oddsDraw: z.number().positive(),
            oddsAway: z.number().positive(),
            externalId: z.string().optional(),
          })
        ),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        const result = await addMatches({
          roundId: input.roundId,
          matches: input.matches,
        });

        return fromService(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "set_match_fedt",
    {
      title: "Set Match Fedt",
      description:
        "Set or override the fedt (implied probability) percentages for a single match. Each value must be 0–100, and they must sum to exactly 100.",
      inputSchema: z.object({
        matchId: z.string(),
        fedtHome: z.number().int().min(0).max(100),
        fedtDraw: z.number().int().min(0).max(100),
        fedtAway: z.number().int().min(0).max(100),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        const result = await setMatchFedt({
          matchId: input.matchId,
          fedtHome: input.fedtHome,
          fedtDraw: input.fedtDraw,
          fedtAway: input.fedtAway,
        });

        return fromService(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "set_results",
    {
      title: "Set Results",
      description:
        "Manually set results for one or more matches in a round. Results must be HOME, DRAW, or AWAY. When all matches in a round have results, the round is automatically marked completed. Match IDs come from get_round.",
      inputSchema: z.object({
        roundId: z.string(),
        results: z.array(
          z.object({
            matchId: z.string(),
            result: z.enum(["HOME", "DRAW", "AWAY"]),
          })
        ),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        const result = await setResults({
          roundId: input.roundId,
          results: input.results,
        });

        return fromService(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "resolve_results_auto",
    {
      title: "Resolve Results Auto",
      description:
        "Fetch results from football-data.org for all matches with externalIds in a round. Returns the number of matches updated and a list of any matches that could not be resolved. The round is automatically marked completed once all matches have results.",
      inputSchema: z.object({
        roundId: z.string(),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        requireAdminCaller(ctx);

        const result = await resolveResultsAuto({
          roundId: input.roundId,
        });

        return fromService(result);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Admin role required")) {
          return errorResult("Admin authorization required");
        }
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );
}
