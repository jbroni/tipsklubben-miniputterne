import { prisma } from "@/lib/prisma";
import { calcRoundFedt, getFedtLabel } from "@/lib/fedt";
import { toFedtInput } from "@/lib/leaderboard";
import { arePicksStillOpen } from "@/lib/rounds";
import type { Prediction, Pick } from "@prisma/client";
import type { ServiceResult } from "./result";

export async function submitPicks(input: {
  userId: string;
  roundId: string;
  picks: { matchId: string; pick: string }[];
  replace: boolean;
}): Promise<
  ServiceResult<{
    fedt: number;
    fedtLabel: string;
    created: boolean;
    changed: { matchId: string; matchNumber: number; from: Pick | null; to: Pick }[];
    predictions: Prediction[];
  }>
> {
  // 1. Load round with matches
  const round = await prisma.round.findUnique({
    where: { id: input.roundId },
    include: { matches: true },
  });

  if (!round) {
    return {
      ok: false,
      code: "ROUND_NOT_FOUND",
      message: "Round not found",
    };
  }

  // 2. Check if picks are still open (uses both status and deadline)
  if (!arePicksStillOpen(round)) {
    if (round.status !== "open") {
      return {
        ok: false,
        code: "ROUND_CLOSED",
        message: "Round is no longer open for predictions",
      };
    }
    // deadline has passed
    return {
      ok: false,
      code: "DEADLINE_PASSED",
      message: "Prediction deadline has passed",
    };
  }

  // 3. Validate exactly 13 picks
  if (!Array.isArray(input.picks) || input.picks.length !== 13) {
    return {
      ok: false,
      code: "BAD_PICK_COUNT",
      message: "Exactly 13 predictions are required",
    };
  }

  // 4. Check no duplicate matchIds
  const matchIds = input.picks.map((p) => p.matchId);
  const uniqueMatchIds = new Set(matchIds);
  if (uniqueMatchIds.size !== 13) {
    return {
      ok: false,
      code: "DUPLICATE_MATCH",
      message: "Duplicate match IDs in picks",
    };
  }

  // 5. Validate each pick value is a valid Pick enum
  const validPicks = new Set(["HOME", "DRAW", "AWAY"]);
  for (const p of input.picks) {
    if (!validPicks.has(p.pick)) {
      return {
        ok: false,
        code: "BAD_PICK_VALUE",
        message: `Invalid pick value: ${p.pick}`,
      };
    }
  }

  // 6. Check all matchIds belong to this round
  const roundMatchIds = new Set(round.matches.map((m) => m.id));
  for (const matchId of matchIds) {
    if (!roundMatchIds.has(matchId)) {
      return {
        ok: false,
        code: "UNKNOWN_MATCH",
        message: `Match ${matchId} does not belong to this round`,
      };
    }
  }

  // 7. Load user's existing predictions for this round
  const existingPredictions = await prisma.prediction.findMany({
    where: {
      userId: input.userId,
      roundId: input.roundId,
    },
    include: { match: true },
    orderBy: { match: { matchNumber: "asc" } },
  });

  const created = existingPredictions.length === 0;

  if (existingPredictions.length > 0 && !input.replace) {
    const existingPicksText = existingPredictions
      .map((p) => `Match ${p.match.matchNumber}: ${p.pick}`)
      .join(", ");
    return {
      ok: false,
      code: "COUPON_EXISTS",
      message: `A coupon already exists for this round. Set replace to true to overwrite. Existing picks: ${existingPicksText}`,
    };
  }

  // 8. Build map of existing picks for comparison
  const existingPickMap = new Map<string, Pick>();
  for (const pred of existingPredictions) {
    existingPickMap.set(pred.matchId, pred.pick);
  }

  // 9. Wrap upserts in transaction
  const predictions = await prisma.$transaction(
    input.picks.map((p) =>
      prisma.prediction.upsert({
        where: {
          userId_matchId: {
            userId: input.userId,
            matchId: p.matchId,
          },
        },
        update: { pick: p.pick as Pick },
        create: {
          roundId: input.roundId,
          userId: input.userId,
          matchId: p.matchId,
          pick: p.pick as Pick,
        },
      })
    )
  );

  // 10. Compute fedt and fedtLabel
  const pickInputs = input.picks.map((p) => {
    const match = round.matches.find((m) => m.id === p.matchId)!;
    return {
      match: toFedtInput(match),
      pick: p.pick as Pick,
    };
  });

  const fedt = calcRoundFedt(pickInputs);
  const fedtLabel = getFedtLabel(fedt);

  // 11. Build changed array (ordered by matchNumber)
  const matchMap = new Map(round.matches.map((m) => [m.id, m]));
  const changed = input.picks
    .map((p) => {
      const match = matchMap.get(p.matchId)!;
      const from = existingPickMap.get(p.matchId) || null;
      return {
        matchId: p.matchId,
        matchNumber: match.matchNumber,
        from,
        to: p.pick as Pick,
      };
    })
    .sort((a, b) => a.matchNumber - b.matchNumber);

  return {
    ok: true,
    data: {
      fedt,
      fedtLabel,
      created,
      changed,
      predictions,
    },
  };
}
