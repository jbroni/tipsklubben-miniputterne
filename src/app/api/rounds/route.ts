import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentUser } from "@/lib/auth";

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

  if (!seasonId || !roundNumber || !deadline) {
    return NextResponse.json(
      { error: "Season ID, round number, and deadline are required" },
      { status: 400 }
    );
  }

  const round = await prisma.round.create({
    data: {
      seasonId,
      roundNumber,
      deadline: new Date(deadline),
      status: "open",
    },
  });

  return NextResponse.json({ data: round }, { status: 201 });
}
