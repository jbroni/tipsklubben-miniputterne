import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { submitPicks } from "@/lib/services/predictions";
import { codeToStatus } from "@/lib/services/result";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const predictions = await prisma.prediction.findMany({
    where: {
      roundId: id,
      userId: user.id,
    },
    include: { match: true },
    orderBy: { match: { matchNumber: "asc" } },
  });

  return NextResponse.json({ data: predictions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const body = await request.json();
  const { predictions } = body;

  const result = await submitPicks({
    userId: user.id,
    roundId: id,
    picks: predictions || [],
    replace: true, // Web UI always does unconditional upsert
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: codeToStatus[result.code] }
    );
  }

  return NextResponse.json({ data: result.data.predictions });
}
