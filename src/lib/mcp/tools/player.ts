/**
 * Player-facing MCP tools: read-only access to rounds, picks, leaderboard.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/prisma";
import { submitPicks } from "@/lib/services/predictions";
import { arePicksStillOpen, arePicksRevealed } from "@/lib/rounds";
import {
  calcMatchFedt,
  calcRoundFedt,
  getFedtLabel,
} from "@/lib/fedt";
import { toFedtInput } from "@/lib/leaderboard";
import { getLeaderboardEntries } from "@/lib/leaderboard-data";
import { getCaller, textResult, errorResult, fromService } from "@/lib/mcp/context";

export function registerPlayerTools(server: McpServer): void {
  server.registerTool(
    "list_rounds",
    {
      title: "List Rounds",
      description:
        "List all rounds for a season (defaults to active season). Returns round metadata and whether the caller has submitted predictions. Newest first.",
      inputSchema: z.object({
        seasonId: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        const caller = getCaller(ctx);

        // Get target season
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

        // Fetch rounds and caller's predictions
        const [rounds, predictions] = await Promise.all([
          prisma.round.findMany({
            where: { seasonId: targetSeasonId },
            include: {
              matches: {
                select: { id: true },
              },
            },
            orderBy: { roundNumber: "desc" },
          }),
          prisma.prediction.findMany({
            where: {
              userId: caller.userId,
              round: { seasonId: targetSeasonId },
            },
            include: { match: { select: { roundId: true } } },
          }),
        ]);

        const callerPredictionsByRound = new Map<string, number>();
        for (const pred of predictions) {
          const count = (callerPredictionsByRound.get(pred.match.roundId) ?? 0) + 1;
          callerPredictionsByRound.set(pred.match.roundId, count);
        }

        const result = rounds.map((round) => ({
          id: round.id,
          roundNumber: round.roundNumber,
          deadline: round.deadline.toISOString(),
          status: round.status,
          matchCount: round.matches.length,
          iHaveSubmitted: (callerPredictionsByRound.get(round.id) ?? 0) === 13,
        }));

        return textResult(result);
      } catch (err) {
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "get_round",
    {
      title: "Get Round",
      description:
        "Fetch a single round with all matches, odds, and implied probabilities. Includes other members' picks (userId, displayName, pick) only if picks are revealed (deadline passed or round locked/completed). Match IDs are needed for submit_picks and preview_fedt.",
      inputSchema: z.object({
        roundId: z.string(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        const caller = getCaller(ctx);

        const round = await prisma.round.findUnique({
          where: { id: input.roundId },
          include: {
            matches: {
              orderBy: { matchNumber: "asc" },
              include: {
                predictions: {
                  include: {
                    user: {
                      select: {
                        displayName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!round) {
          return errorResult("Round not found");
        }

        const picksStillOpen = arePicksStillOpen(round);
        const picksRevealed = arePicksRevealed(round);

        // Fetch caller's picks for this round
        const callerPicks = await prisma.prediction.findMany({
          where: {
            userId: caller.userId,
            roundId: input.roundId,
          },
        });
        const callerPickMap = new Map(
          callerPicks.map((p) => [p.matchId, p.pick])
        );

        const matches = round.matches.map((match) => {
          const matchOdds = toFedtInput(match);
          const impliedProbs = {
            home: calcMatchFedt(matchOdds, "HOME"),
            draw: calcMatchFedt(matchOdds, "DRAW"),
            away: calcMatchFedt(matchOdds, "AWAY"),
          };

          const baseMatch = {
            matchId: match.id,
            matchNumber: match.matchNumber,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            league: match.league,
            kickoff: match.kickoff.toISOString(),
            oddsHome: Number(match.oddsHome),
            oddsDraw: Number(match.oddsDraw),
            oddsAway: Number(match.oddsAway),
            impliedProbabilities: impliedProbs,
            result: match.result ?? null,
            myPick: callerPickMap.get(match.id) ?? null,
          };

          // Include other members' picks only if revealed
          if (picksRevealed) {
            const otherPicks = match.predictions
              .filter((p) => p.userId !== caller.userId)
              .map((p) => ({
                userId: p.userId,
                displayName: p.user.displayName,
                pick: p.pick,
              }));
            return { ...baseMatch, otherPicks };
          }

          return baseMatch;
        });

        return textResult({
          id: round.id,
          roundNumber: round.roundNumber,
          deadline: round.deadline.toISOString(),
          status: round.status,
          picksStillOpen,
          matchCount: matches.length,
          matches,
        });
      } catch (err) {
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "get_my_picks",
    {
      title: "Get My Picks",
      description:
        "Retrieve the caller's picks for a round, along with their fedt score and label.",
      inputSchema: z.object({
        roundId: z.string(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        const caller = getCaller(ctx);

        const round = await prisma.round.findUnique({
          where: { id: input.roundId },
          include: {
            matches: true,
          },
        });

        if (!round) {
          return errorResult("Round not found");
        }

        const predictions = await prisma.prediction.findMany({
          where: {
            userId: caller.userId,
            roundId: input.roundId,
          },
          include: {
            match: true,
          },
          orderBy: { match: { matchNumber: "asc" } },
        });

        if (predictions.length === 0) {
          return textResult({
            roundId: input.roundId,
            picks: [],
            fedt: null,
            fedtLabel: null,
          });
        }

        // Calculate fedt
        const pickInputs = predictions.map((p) => ({
          match: toFedtInput(p.match),
          pick: p.pick,
        }));
        const fedt = calcRoundFedt(pickInputs);
        const fedtLabel = getFedtLabel(fedt);

        const picks = predictions.map((p) => ({
          matchId: p.matchId,
          matchNumber: p.match.matchNumber,
          pick: p.pick,
        }));

        return textResult({
          roundId: input.roundId,
          picks,
          fedt,
          fedtLabel,
        });
      } catch (err) {
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "preview_fedt",
    {
      title: "Preview Fedt",
      description:
        "Preview a fedt score for a hypothetical set of picks without submitting. Validates that match IDs belong to the round. Accepts fewer than 13 picks for exploration. Returns fedt, label, and implied probability of each chosen outcome.",
      inputSchema: z.object({
        roundId: z.string(),
        picks: z.array(
          z.object({
            matchId: z.string(),
            pick: z.enum(["HOME", "DRAW", "AWAY"]),
          })
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        getCaller(ctx); // Just verify auth

        const round = await prisma.round.findUnique({
          where: { id: input.roundId },
          include: {
            matches: true,
          },
        });

        if (!round) {
          return errorResult("Round not found");
        }

        // Validate all matchIds belong to this round
        const roundMatchIds = new Set(round.matches.map((m) => m.id));
        for (const pick of input.picks) {
          if (!roundMatchIds.has(pick.matchId)) {
            return errorResult(
              `Match ${pick.matchId} does not belong to this round`
            );
          }
        }

        // Build match map
        const matchMap = new Map(round.matches.map((m) => [m.id, m]));

        // Calculate fedt
        const pickInputs = input.picks.map((p) => ({
          match: toFedtInput(matchMap.get(p.matchId)!),
          pick: p.pick as "HOME" | "DRAW" | "AWAY",
        }));
        const fedt = calcRoundFedt(pickInputs);
        const fedtLabel = getFedtLabel(fedt);

        // Include implied probabilities for each pick
        const picksWithProbs = input.picks.map((p) => {
          const match = matchMap.get(p.matchId)!;
          const matchOdds = toFedtInput(match);
          const prob = calcMatchFedt(matchOdds, p.pick as "HOME" | "DRAW" | "AWAY");
          return {
            matchId: p.matchId,
            pick: p.pick,
            impliedProbability: prob,
          };
        });

        return textResult({
          fedt,
          fedtLabel,
          picks: picksWithProbs,
        });
      } catch (err) {
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "submit_picks",
    {
      title: "Submit Picks",
      description:
        "Submit exactly 13 predictions for a round. The round must still be open (status open and deadline not passed). Fedt is computed from odds; never supply it. If the caller already has a coupon for this round, the call fails unless replace: true is passed. Match IDs come from get_round.",
      inputSchema: z.object({
        roundId: z.string(),
        picks: z.array(
          z.object({
            matchId: z.string(),
            pick: z.enum(["HOME", "DRAW", "AWAY"]),
          })
        ),
        replace: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async (input, ctx) => {
      try {
        const caller = getCaller(ctx);

        const result = await submitPicks({
          userId: caller.userId,
          roundId: input.roundId,
          picks: input.picks.map((p) => ({
            matchId: p.matchId,
            pick: p.pick,
          })),
          replace: input.replace ?? false,
        });

        return fromService(result);
      } catch (err) {
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );

  server.registerTool(
    "get_leaderboard",
    {
      title: "Get Leaderboard",
      description:
        "Fetch the season leaderboard showing rank, display name, total points, rounds played, average score, and season fedt.",
      inputSchema: z.object({
        seasonId: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) => {
      try {
        getCaller(ctx); // Just verify auth

        const entries = await getLeaderboardEntries(input.seasonId);

        const result = entries.map((entry, index) => ({
          rank: index + 1,
          displayName: entry.user.displayName,
          avatarUrl: entry.user.avatarUrl,
          totalPoints: entry.totalPoints,
          roundsPlayed: entry.roundsPlayed,
          avgScore: entry.avgScore,
          seasonFedt: entry.seasonFedt,
        }));

        return textResult(result);
      } catch (err) {
        return errorResult(`${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  );
}
