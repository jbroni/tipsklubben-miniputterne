import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth";
import { buildBallots, rankSystems } from "@/lib/group-coupon";
import { getSystem, COUPON_SIZE } from "@/lib/coupon-systems";
import type { Prisma, User } from "@prisma/client";
import type {
  SerializedGroupCoupon,
  SerializedGroupCouponMatch,
  GroupCouponSuggestionResponse,
} from "@/types";
import type { PickValue } from "@/lib/picks";

/**
 * Input type for group coupon match POST body
 */
interface GroupCouponMatchInput {
  matchId: string;
  coverage: "single" | "half" | "full";
  outcomes: ("HOME" | "DRAW" | "AWAY")[];
  baseOutcome?: "HOME" | "DRAW" | "AWAY" | null;
  reasoning: string;
  isOverridden?: boolean;
}

// Type for Prisma GroupCoupon with full match relations
type GroupCouponWithMatches = Prisma.GroupCouponGetPayload<{
  include: { matches: { include: { match: true } } };
}>;

/**
 * GET: Retrieve the group coupon for a round.
 *
 * Non-admins see only finalized coupons (status === "final").
 * Admins see all coupons plus a freshly computed suggestion (if deadline has passed).
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireUser();

  // Load round with matches and season
  const round = await prisma.round.findUnique({
    where: { id: params.id },
    include: {
      matches: {
        orderBy: { matchNumber: "asc" },
      },
      season: true,
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Runde ikke fundet" }, { status: 404 });
  }

  // Load the saved coupon if it exists
  const savedCoupon = await prisma.groupCoupon.findUnique({
    where: { roundId: params.id },
    include: {
      matches: {
        orderBy: { match: { matchNumber: "asc" } },
        include: { match: true },
      },
    },
  });

  const isAdmin = user.role === "admin";

  // Non-admin users only see finalized coupons
  if (!isAdmin) {
    if (savedCoupon && savedCoupon.status === "final") {
      const serialized = serializeGroupCoupon(savedCoupon);
      const response: GroupCouponSuggestionResponse = {
        coupon: serialized,
        seasonName: round.season.name,
      };
      return NextResponse.json(response);
    } else {
      const response: GroupCouponSuggestionResponse = {
        coupon: null,
        seasonName: round.season.name,
      };
      return NextResponse.json(response);
    }
  }

  // Admin path: return saved coupon + computed suggestion + match details
  const couponResponse: GroupCouponSuggestionResponse = {
    coupon: savedCoupon ? serializeGroupCoupon(savedCoupon) : null,
    roundNumber: round.roundNumber,
    seasonName: round.season.name,
    matches: round.matches.map((m) => ({
      id: m.id,
      matchNumber: m.matchNumber,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      oddsHome: Number(m.oddsHome),
      oddsDraw: Number(m.oddsDraw),
      oddsAway: Number(m.oddsAway),
    })),
  };

  // Only compute suggestion if deadline has passed
  const now = new Date();
  if (round.status === "open" && now <= round.deadline) {
    // Round is still open, don't compute suggestion
    return NextResponse.json(couponResponse);
  }

  // Deadline has passed, compute suggestion
  try {
    // Fetch all users and their predictions for current round
    const allUsers = await prisma.user.findMany({
      select: { id: true, displayName: true },
    });

    const currentRoundPredictions = await prisma.prediction.findMany({
      where: { roundId: params.id },
      select: {
        userId: true,
        match: { select: { matchNumber: true } },
        pick: true,
      },
    });

    // Fetch all earlier rounds in this season
    const earlierRounds = await prisma.round.findMany({
      where: {
        seasonId: round.seasonId,
        roundNumber: { lt: round.roundNumber },
      },
      select: { id: true, roundNumber: true },
      orderBy: { roundNumber: "asc" },
    });

    // Fetch predictions for earlier rounds
    const priorRoundIds = earlierRounds.map((r) => r.id);
    const priorPredictions = await prisma.prediction.findMany({
      where: { roundId: { in: priorRoundIds } },
      select: {
        userId: true,
        round: { select: { roundNumber: true } },
        match: { select: { matchNumber: true } },
        pick: true,
      },
    });

    // Build ballot data structures
    const currentRoundData = {
      roundNumber: round.roundNumber,
      predictions: currentRoundPredictions.map((p) => ({
        userId: p.userId,
        matchNumber: p.match.matchNumber,
        pick: p.pick as PickValue,
      })),
    };

    const priorRoundsData = earlierRounds.map((er) => ({
      roundNumber: er.roundNumber,
      predictions: priorPredictions
        .filter((p) => p.round.roundNumber === er.roundNumber)
        .map((p) => ({
          userId: p.userId,
          matchNumber: p.match.matchNumber,
          pick: p.pick as PickValue,
        })),
    }));

    // Build ballots
    const ballots = buildBallots({
      users: allUsers,
      currentRound: currentRoundData,
      priorRounds: priorRoundsData,
    });

    // Convert matches to MatchInput format
    const matches = round.matches.map((m) => ({
      matchNumber: m.matchNumber,
      oddsHome: Number(m.oddsHome),
      oddsDraw: Number(m.oddsDraw),
      oddsAway: Number(m.oddsAway),
    }));

    // Compute ranked systems
    const rankedSystems = rankSystems(matches, ballots);

    couponResponse.suggestion = {
      systems: rankedSystems.map((fit) => ({
        system: {
          code: fit.system.code,
          type: fit.system.type,
          full: fit.system.full,
          half: fit.system.half,
          single: fit.system.single,
          rows: fit.system.rows,
          requiresBaseRow: fit.system.requiresBaseRow,
        },
        assignments: fit.assignments.map((a) => ({
          matchNumber: a.matchNumber,
          coverage: a.coverage,
          outcomes: a.outcomes,
          baseOutcome: a.baseOutcome,
          tally: a.tally,
          idealCoverage: a.idealCoverage,
          reasoning: a.reasoning,
        })),
        totalCost: fit.totalCost,
        coverage: fit.coverage,
      })),
    };

    couponResponse.ballots = ballots.map((b) => ({
      userId: b.userId,
      displayName: b.displayName,
      source: b.source,
      sourceRoundNumber: b.sourceRoundNumber,
      picks: b.picks,
    }));
  } catch (error) {
    couponResponse.suggestionError =
      error instanceof Error
        ? error.message
        : "Fejl ved beregning af fælleskupon-forslag";
  }

  return NextResponse.json(couponResponse);
}

/**
 * POST: Create or update the group coupon for a round.
 *
 * Admins only. Validates systemCode, match count, slot distribution, and coverage.
 * Upserts the coupon and its match assignments in a transaction.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin();

  const body = await request.json();
  const { systemCode, status, matches } = body;

  // Load round to verify it exists
  const round = await prisma.round.findUnique({
    where: { id: params.id },
    include: { matches: true, season: true },
  });

  if (!round) {
    return NextResponse.json({ error: "Runde ikke fundet" }, { status: 404 });
  }

  // Validate deadline has passed
  const now = new Date();
  if (round.status === "open" && now <= round.deadline) {
    return NextResponse.json(
      {
        error:
          "Fælleskuponen kan først oprettes efter deadline. Åbn runden først.",
      },
      { status: 400 }
    );
  }

  // Validate systemCode
  if (!systemCode || typeof systemCode !== "string") {
    return NextResponse.json(
      { error: "Systemkode er påkrævet" },
      { status: 400 }
    );
  }

  const system = getSystem(systemCode);
  if (!system) {
    return NextResponse.json(
      { error: `Ukendt systemkode: ${systemCode}` },
      { status: 400 }
    );
  }

  // Validate status
  if (!["draft", "final"].includes(status)) {
    return NextResponse.json(
      { error: "Status skal være 'draft' eller 'final'" },
      { status: 400 }
    );
  }

  // Validate matches array
  if (!Array.isArray(matches)) {
    return NextResponse.json(
      { error: "Matches skal være et array" },
      { status: 400 }
    );
  }

  if (matches.length !== COUPON_SIZE) {
    return NextResponse.json(
      { error: `Præcis ${COUPON_SIZE} kampe er påkrævet, modtog ${matches.length}` },
      { status: 400 }
    );
  }

  // Validate each match and check for duplicates
  const roundMatchIds = new Set(round.matches.map((m) => m.id));
  const seenMatchIds = new Set<string>();

  for (const match of matches) {
    const typedMatch = match as GroupCouponMatchInput;

    if (!typedMatch.matchId || typeof typedMatch.matchId !== "string") {
      return NextResponse.json(
        { error: "Hver kamp skal have en gyldig matchId" },
        { status: 400 }
      );
    }

    if (!roundMatchIds.has(typedMatch.matchId)) {
      return NextResponse.json(
        { error: `Kamp ${typedMatch.matchId} hører ikke til denne runde` },
        { status: 400 }
      );
    }

    if (seenMatchIds.has(typedMatch.matchId)) {
      return NextResponse.json(
        { error: `Kamp ${typedMatch.matchId} er gentaget` },
        { status: 400 }
      );
    }

    seenMatchIds.add(typedMatch.matchId);
  }

  // Validate coverage distribution
  const coverageCount = {
    single: 0,
    half: 0,
    full: 0,
  };

  for (const match of matches) {
    const typedMatch = match as GroupCouponMatchInput;
    const coverage = typedMatch.coverage as
      | "single"
      | "half"
      | "full"
      | undefined;
    if (!coverage || !["single", "half", "full"].includes(coverage)) {
      return NextResponse.json(
        { error: `Ugyldig coverage type: ${coverage}` },
        { status: 400 }
      );
    }
    coverageCount[coverage as "single" | "half" | "full"]++;
  }

  if (coverageCount.single !== system.single) {
    return NextResponse.json(
      {
        error: `Antal 'single'-kampe stemmer ikke: forventet ${system.single}, modtog ${coverageCount.single}`,
      },
      { status: 400 }
    );
  }

  if (coverageCount.half !== system.half) {
    return NextResponse.json(
      {
        error: `Antal 'half'-kampe stemmer ikke: forventet ${system.half}, modtog ${coverageCount.half}`,
      },
      { status: 400 }
    );
  }

  if (coverageCount.full !== system.full) {
    return NextResponse.json(
      {
        error: `Antal 'full'-kampe stemmer ikke: forventet ${system.full}, modtog ${coverageCount.full}`,
      },
      { status: 400 }
    );
  }

  // Validate outcomes and baseOutcome for each match
  for (const match of matches) {
    const typedMatch = match as GroupCouponMatchInput;
    const coverage = typedMatch.coverage as "single" | "half" | "full";
    const outcomes = typedMatch.outcomes as
      | ("HOME" | "DRAW" | "AWAY")[]
      | undefined;
    const baseOutcome = typedMatch.baseOutcome as
      | "HOME"
      | "DRAW"
      | "AWAY"
      | null
      | undefined;
    const reasoning = typedMatch.reasoning as string | undefined;

    // Validate reasoning is provided
    if (
      !reasoning ||
      typeof reasoning !== "string" ||
      reasoning.trim() === ""
    ) {
      return NextResponse.json(
        {
          error: `Kamp ${typedMatch.matchId || "ukendt"}: begrundelse er påkrævet`,
        },
        { status: 400 }
      );
    }

    // Validate outcomes array
    if (!Array.isArray(outcomes) || outcomes.length === 0) {
      return NextResponse.json(
        {
          error: `Kamp ${typedMatch.matchId}: outcomes skal være et ikke-tomt array`,
        },
        { status: 400 }
      );
    }

    // Check for duplicates in outcomes
    if (new Set(outcomes).size !== outcomes.length) {
      return NextResponse.json(
        {
          error: `Kamp ${typedMatch.matchId}: outcomes indeholder dubletter`,
        },
        { status: 400 }
      );
    }

    // Validate outcomes count matches coverage
    const expectedCount =
      coverage === "single" ? 1 : coverage === "half" ? 2 : 3;
    if (outcomes.length !== expectedCount) {
      return NextResponse.json(
        {
          error: `Kamp ${typedMatch.matchId}: ${coverage}-gardering skal have ${expectedCount} udfald, modtog ${outcomes.length}`,
        },
        { status: 400 }
      );
    }

    // Validate baseOutcome
    if (system.requiresBaseRow && coverage !== "single") {
      if (!baseOutcome || !outcomes.includes(baseOutcome)) {
        return NextResponse.json(
          {
            error: `Kamp ${typedMatch.matchId}: baseOutcome skal være et af udfaldene for U-systemer`,
          },
          { status: 400 }
        );
      }
    } else {
      if (baseOutcome !== null && baseOutcome !== undefined) {
        return NextResponse.json(
          {
            error: `Kamp ${typedMatch.matchId}: baseOutcome skal ikke være sat for dette system`,
          },
          { status: 400 }
        );
      }
    }
  }

  // Upsert coupon and matches in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      // Upsert the group coupon
      const coupon = await tx.groupCoupon.upsert({
        where: { roundId: params.id },
        update: {
          systemCode,
          status: status as "draft" | "final",
        },
        create: {
          roundId: params.id,
          systemCode,
          status: status as "draft" | "final",
          createdById: user.id,
        },
      });

      // Delete existing matches
      await tx.groupCouponMatch.deleteMany({
        where: { couponId: coupon.id },
      });

      // Create new matches sequentially to ensure proper enum array handling
      for (const m of matches) {
        const typedMatch = m as GroupCouponMatchInput;
        await tx.groupCouponMatch.create({
          data: {
            couponId: coupon.id,
            matchId: typedMatch.matchId,
            coverage: typedMatch.coverage,
            outcomes: typedMatch.outcomes as ("HOME" | "DRAW" | "AWAY")[],
            baseOutcome: (typedMatch.baseOutcome as
              | "HOME"
              | "DRAW"
              | "AWAY") || null,
            reasoning: typedMatch.reasoning,
            isOverridden: typedMatch.isOverridden || false,
          },
        });
      }
    });
  } catch (error) {
    console.error("Error upserting coupon:", error);
    return NextResponse.json(
      { error: "Fejl ved gemning af fælleskupon" },
      { status: 500 }
    );
  }

  // Fetch and return the created/updated coupon
  const result = await prisma.groupCoupon.findUnique({
    where: { roundId: params.id },
    include: {
      matches: {
        orderBy: { match: { matchNumber: "asc" } },
        include: { match: true },
      },
    },
  });

  if (!result) {
    return NextResponse.json(
      { error: "Fejl ved gemning af fælleskupon" },
      { status: 500 }
    );
  }

  const response: GroupCouponSuggestionResponse = {
    coupon: serializeGroupCoupon(result),
    seasonName: round.season.name,
  };

  return NextResponse.json(response);
}

/**
 * Serialize a GroupCoupon from Prisma to the wire format.
 * Converts Date fields to ISO strings and maintains Pick enums as strings.
 */
function serializeGroupCoupon(
  coupon: GroupCouponWithMatches
): SerializedGroupCoupon {
  return {
    id: coupon.id,
    systemCode: coupon.systemCode,
    status: coupon.status as "draft" | "final",
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
    matches: coupon.matches.map((m) => ({
      id: m.id,
      matchId: m.matchId,
      matchNumber: m.match.matchNumber,
      coverage: m.coverage as "single" | "half" | "full",
      outcomes: m.outcomes as ("HOME" | "DRAW" | "AWAY")[],
      baseOutcome: (m.baseOutcome as "HOME" | "DRAW" | "AWAY") || null,
      reasoning: m.reasoning,
      isOverridden: m.isOverridden,
    } as SerializedGroupCouponMatch)),
  };
}
