import { prisma } from "@/lib/prisma";
import { fetchResults } from "@/lib/football-api";
import type { Pick } from "@prisma/client";
import type { ServiceResult } from "./result";

export async function addMatches(input: {
  roundId: string;
  matches: Array<{
    matchNumber?: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
    kickoff: string;
    oddsHome: number;
    oddsDraw: number;
    oddsAway: number;
    externalId?: string;
  }>;
}): Promise<ServiceResult<{ count: number; warnings: string[] }>> {
  if (!Array.isArray(input.matches) || input.matches.length === 0) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Matches array is required",
    };
  }

  const warnings: string[] = [];

  const created = await prisma.match.createMany({
    data: input.matches.map((m, index) => ({
      roundId: input.roundId,
      matchNumber: m.matchNumber ?? index + 1,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      kickoff: new Date(m.kickoff),
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw,
      oddsAway: m.oddsAway,
      externalId: m.externalId ?? null,
    })),
  });

  if (input.matches.length !== 13) {
    warnings.push(`Expected 13 matches, but ${input.matches.length} were provided`);
  }

  return {
    ok: true,
    data: {
      count: created.count,
      warnings,
    },
  };
}

export async function setMatchFedt(input: {
  matchId: string;
  fedtHome: number;
  fedtDraw: number;
  fedtAway: number;
}): Promise<ServiceResult<{ ok: boolean }>> {
  // Validate each is an integer 0-100
  for (const [key, value] of Object.entries({
    fedtHome: input.fedtHome,
    fedtDraw: input.fedtDraw,
    fedtAway: input.fedtAway,
  })) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return {
        ok: false,
        code: "INVALID_FEDT",
        message: `${key} must be an integer between 0 and 100`,
      };
    }
  }

  // Validate they sum to 100
  if (input.fedtHome + input.fedtDraw + input.fedtAway !== 100) {
    return {
      ok: false,
      code: "INVALID_FEDT",
      message: "Fedt values must sum to exactly 100",
    };
  }

  await prisma.match.update({
    where: { id: input.matchId },
    data: {
      fedtHome: input.fedtHome,
      fedtDraw: input.fedtDraw,
      fedtAway: input.fedtAway,
    },
  });

  return {
    ok: true,
    data: { ok: true },
  };
}

export async function setResults(input: {
  roundId: string;
  results: Array<{ matchId: string; result: string }>;
}): Promise<ServiceResult<{ updated: number }>> {
  if (!Array.isArray(input.results)) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Results array is required",
    };
  }

  // Validate each result is a valid Pick value
  const validPicks = new Set(["HOME", "DRAW", "AWAY"]);
  for (const r of input.results) {
    if (!validPicks.has(r.result)) {
      return {
        ok: false,
        code: "BAD_PICK_VALUE",
        message: `Invalid result value: ${r.result}`,
      };
    }
  }

  // Load all matches in this round
  const roundMatches = await prisma.match.findMany({
    where: { roundId: input.roundId },
  });

  const roundMatchIds = new Set(roundMatches.map((m) => m.id));

  // Check all matchIds belong to this round
  for (const r of input.results) {
    if (!roundMatchIds.has(r.matchId)) {
      return {
        ok: false,
        code: "UNKNOWN_MATCH",
        message: `Match ${r.matchId} does not belong to this round`,
      };
    }
  }

  // Update all results
  await Promise.all(
    input.results.map((r) =>
      prisma.match.update({
        where: { id: r.matchId },
        data: { result: r.result as Pick },
      })
    )
  );

  // Check if all matches are now resolved and mark round as completed
  await checkAndCompleteRound(input.roundId);

  return {
    ok: true,
    data: { updated: input.results.length },
  };
}

export async function resolveResultsAuto(input: {
  roundId: string;
}): Promise<
  ServiceResult<{
    updated: number;
    unresolved: { matchId: string; matchNumber: number }[];
  }>
> {
  // Find all matches with externalId that don't yet have results
  const matches = await prisma.match.findMany({
    where: {
      roundId: input.roundId,
      externalId: { not: null },
      result: null,
    },
  });

  const externalIds = matches
    .map((m) => m.externalId)
    .filter(Boolean) as string[];

  if (externalIds.length === 0) {
    return {
      ok: false,
      code: "NO_MATCHES_TO_RESOLVE",
      message: "No matches to auto-resolve",
    };
  }

  const apiResults = await fetchResults(externalIds);

  // Update results
  await Promise.all(
    apiResults.map((r) =>
      prisma.match.updateMany({
        where: { roundId: input.roundId, externalId: r.externalId },
        data: {
          result: r.result === "1" ? "HOME" : r.result === "X" ? "DRAW" : "AWAY",
        },
      })
    )
  );

  // Check if all matches are now resolved and mark round as completed
  await checkAndCompleteRound(input.roundId);

  // Find any unresolved matches
  const stillUnresolved = await prisma.match.findMany({
    where: { roundId: input.roundId, result: null },
  });

  return {
    ok: true,
    data: {
      updated: apiResults.length,
      unresolved: stillUnresolved.map((m) => ({
        matchId: m.id,
        matchNumber: m.matchNumber,
      })),
    },
  };
}

async function checkAndCompleteRound(roundId: string) {
  const unresolved = await prisma.match.count({
    where: { roundId, result: null },
  });

  if (unresolved === 0) {
    await prisma.round.update({
      where: { id: roundId },
      data: { status: "completed" },
    });
  }
}
