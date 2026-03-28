import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { fetchResults } from "@/lib/football-api";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const body = await request.json();
  const { mode, results } = body;

  if (mode === "auto") {
    // Auto-resolve from football-data.org
    const matches = await prisma.match.findMany({
      where: {
        roundId: params.id,
        externalId: { not: null },
        result: null,
      },
    });

    const externalIds = matches
      .map((m) => m.externalId)
      .filter(Boolean) as string[];

    if (externalIds.length === 0) {
      return NextResponse.json(
        { error: "No matches to auto-resolve" },
        { status: 400 }
      );
    }

    const apiResults = await fetchResults(externalIds);

    const updates = await Promise.all(
      apiResults.map((r) =>
        prisma.match.updateMany({
          where: { roundId: params.id, externalId: r.externalId },
          data: {
            result:
              r.result === "1" ? "HOME" : r.result === "X" ? "DRAW" : "AWAY",
          },
        })
      )
    );

    // Check if all matches have results, then mark round as completed
    await checkAndCompleteRound(params.id);

    return NextResponse.json({ data: { updated: updates.length } });
  }

  // Manual results entry
  if (!Array.isArray(results)) {
    return NextResponse.json(
      { error: "Results array is required" },
      { status: 400 }
    );
  }

  await Promise.all(
    results.map((r: { matchId: string; result: "HOME" | "DRAW" | "AWAY" }) =>
      prisma.match.update({
        where: { id: r.matchId },
        data: { result: r.result },
      })
    )
  );

  await checkAndCompleteRound(params.id);

  return NextResponse.json({ data: { updated: results.length } });
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
