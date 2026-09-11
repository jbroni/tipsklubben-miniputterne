import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { createRound } from "@/lib/services/rounds";
import { codeToStatus } from "@/lib/services/result";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");

  const where = seasonId ? { seasonId } : {};

  const rounds = await prisma.round.findMany({
    where,
    orderBy: { roundNumber: "desc" },
    include: {
      matches: {
        orderBy: { matchNumber: "asc" },
      },
      _count: { select: { predictions: true } },
    },
  });

  return NextResponse.json({ data: rounds });
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json();
  const { seasonId, roundNumber, deadline } = body;

  const result = await createRound({
    seasonId,
    roundNumber,
    deadline,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: codeToStatus[result.code] }
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
