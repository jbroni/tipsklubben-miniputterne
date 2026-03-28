import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const body = await request.json();
  const { matches } = body;

  if (!Array.isArray(matches) || matches.length === 0) {
    return NextResponse.json(
      { error: "Matches array is required" },
      { status: 400 }
    );
  }

  const created = await prisma.match.createMany({
    data: matches.map(
      (
        m: {
          matchNumber: number;
          homeTeam: string;
          awayTeam: string;
          league: string;
          kickoff: string;
          oddsHome: number;
          oddsDraw: number;
          oddsAway: number;
          externalId?: string;
        },
        index: number
      ) => ({
        roundId: params.id,
        matchNumber: m.matchNumber ?? index + 1,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        league: m.league,
        kickoff: new Date(m.kickoff),
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw,
        oddsAway: m.oddsAway,
        externalId: m.externalId ?? null,
      })
    ),
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
