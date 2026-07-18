import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json();
  const { historicUserId, targetUserId } = body;

  if (!historicUserId || !targetUserId) {
    return NextResponse.json(
      { error: "Både historisk bruger og målbruger er påkrævet" },
      { status: 400 }
    );
  }

  // Validate historic user exists and is a placeholder
  const historicUser = await prisma.user.findUnique({
    where: { id: historicUserId },
  });

  if (!historicUser) {
    return NextResponse.json({ error: "Historisk bruger ikke fundet" }, { status: 404 });
  }

  if (!historicUser.authId.startsWith("historic-")) {
    return NextResponse.json(
      { error: "Brugeren er ikke en historisk placeringsholder" },
      { status: 400 }
    );
  }

  // Validate target user exists and is not a placeholder
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Målbruger ikke fundet" }, { status: 404 });
  }

  if (targetUser.authId.startsWith("historic-")) {
    return NextResponse.json(
      { error: "Målbrugeren kan ikke være en historisk placeringsholder" },
      { status: 400 }
    );
  }

  // Pre-check for collisions: see if targetUser already has predictions in any match
  // that the historic user has predictions for
  const historicPredictions = await prisma.prediction.findMany({
    where: { userId: historicUserId },
    select: { matchId: true },
  });

  if (historicPredictions.length > 0) {
    const matchIds = historicPredictions.map((p) => p.matchId);
    const collisions = await prisma.prediction.findMany({
      where: { userId: targetUserId, matchId: { in: matchIds } },
      select: { matchId: true },
    });

    if (collisions.length > 0) {
      return NextResponse.json(
        {
          error:
            "Målbrugeren har allerede tips på nogle af disse kampe. Kan ikke sammenlægge.",
        },
        { status: 409 }
      );
    }
  }

  // In a transaction: reassign predictions and delete historic user
  try {
    await prisma.$transaction([
      prisma.prediction.updateMany({
        where: { userId: historicUserId },
        data: { userId: targetUserId },
      }),
      prisma.user.delete({
        where: { id: historicUserId },
      }),
    ]);

    return NextResponse.json({ data: targetUser });
  } catch (error) {
    // Detect Prisma unique-constraint violation and return 409 collision response
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Målbrugeren har allerede tips på nogle af disse kampe. Kan ikke sammenlægge.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Fejl ved tilknytning af bruger" },
      { status: 500 }
    );
  }
}
