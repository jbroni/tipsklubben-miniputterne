import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentUser } from "@/lib/auth";

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

  // If round is open, filter predictions to only show the current user's
  if (round.status === "open") {
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

  const updateData: Record<string, unknown> = {};
  if (status) updateData.status = status;
  if (deadline) updateData.deadline = new Date(deadline);

  const round = await prisma.round.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: round });
}
