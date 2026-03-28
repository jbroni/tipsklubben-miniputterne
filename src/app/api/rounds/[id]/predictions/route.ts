import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireUser();

  const predictions = await prisma.prediction.findMany({
    where: {
      roundId: params.id,
      userId: user.id,
    },
    include: { match: true },
    orderBy: { match: { matchNumber: "asc" } },
  });

  return NextResponse.json({ data: predictions });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireUser();

  // Check round is still open
  const round = await prisma.round.findUnique({
    where: { id: params.id },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (round.status !== "open") {
    return NextResponse.json(
      { error: "Round is no longer open for predictions" },
      { status: 400 }
    );
  }

  if (new Date() > round.deadline) {
    return NextResponse.json(
      { error: "Prediction deadline has passed" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { predictions } = body;

  if (!Array.isArray(predictions) || predictions.length !== 13) {
    return NextResponse.json(
      { error: "Exactly 13 predictions are required" },
      { status: 400 }
    );
  }

  // Upsert each prediction
  const results = await Promise.all(
    predictions.map(
      async (p: { matchId: string; pick: "HOME" | "DRAW" | "AWAY" }) => {
        return prisma.prediction.upsert({
          where: {
            userId_matchId: {
              userId: user.id,
              matchId: p.matchId,
            },
          },
          update: { pick: p.pick },
          create: {
            roundId: params.id,
            userId: user.id,
            matchId: p.matchId,
            pick: p.pick,
          },
        });
      }
    )
  );

  return NextResponse.json({ data: results });
}
