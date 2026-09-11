import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { arePicksRevealed } from "@/lib/rounds";
import { updateRound } from "@/lib/services/rounds";
import { codeToStatus } from "@/lib/services/result";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const round = await prisma.round.findUnique({
    where: { id: params.id },
    include: {
      matches: {
        orderBy: { matchNumber: "asc" },
        include: {
          predictions:
            // Only show others' predictions if round is locked or completed
            true,
        },
      },
      season: true,
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // If picks are not yet revealed, filter predictions to only show the current user's
  if (!arePicksRevealed(round)) {
    round.matches = round.matches.map((match) => ({
      ...match,
      predictions: match.predictions.filter((p) => p.userId === user.id),
    }));
  }

  return NextResponse.json({ data: round });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const body = await request.json();
  const { status, deadline } = body;

  const result = await updateRound({
    roundId: params.id,
    status,
    deadline,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: codeToStatus[result.code] }
    );
  }

  return NextResponse.json({ data: result.data });
}
