import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";
import type { ServiceResult } from "./result";

export async function mergeUsers(input: {
  sourceUserId: string;
  targetUserId: string;
}): Promise<ServiceResult<{ user: User; movedPredictions: number }>> {
  // 1. Check if sourceUserId and targetUserId are different
  if (input.sourceUserId === input.targetUserId) {
    return {
      ok: false,
      code: "INVALID_MERGE",
      message: "Kilde- og målbrugeren kan ikke være den samme",
    };
  }

  // 2. Load both users
  const sourceUser = await prisma.user.findUnique({
    where: { id: input.sourceUserId },
  });

  if (!sourceUser) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "Kildebrugeren blev ikke fundet",
    };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: input.targetUserId },
  });

  if (!targetUser) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "Målbrugeren blev ikke fundet",
    };
  }

  // 3. Check if target user is a historic placeholder
  if (targetUser.authId.startsWith("historic-")) {
    return {
      ok: false,
      code: "INVALID_MERGE",
      message: "Målbrugeren kan ikke være en historisk placeringsholder",
    };
  }

  // 4. Collision check: ensure both accounts don't have picks in the same matches
  const sourcePredictions = await prisma.prediction.findMany({
    where: { userId: input.sourceUserId },
    select: { matchId: true, roundId: true },
  });

  if (sourcePredictions.length > 0) {
    const matchIds = sourcePredictions.map((p) => p.matchId);
    const targetCollisions = await prisma.prediction.findMany({
      where: {
        userId: input.targetUserId,
        matchId: { in: matchIds },
      },
      select: { roundId: true },
    });

    if (targetCollisions.length > 0) {
      // Get distinct round numbers where collisions exist
      const collisionRoundIds = Array.from(
        new Set(targetCollisions.map((p) => p.roundId))
      );

      const roundNumbers = await prisma.round.findMany({
        where: { id: { in: collisionRoundIds } },
        select: { roundNumber: true },
      });

      const sortedRoundNumbers = roundNumbers
        .map((r) => r.roundNumber)
        .sort((a, b) => a - b);

      const roundsText = sortedRoundNumbers.join(", ");
      return {
        ok: false,
        code: "MERGE_COLLISION",
        message: `Begge konti har tips i runde ${roundsText}. Slet den ene kupon først.`,
      };
    }
  }

  // 5. Transaction: reassign records and delete source user
  try {
    // Build operations array with conditional identity creation and admin promotion
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.prediction.updateMany({
        where: { userId: input.sourceUserId },
        data: { userId: input.targetUserId },
      }),
      prisma.mcpToken.updateMany({
        where: { userId: input.sourceUserId },
        data: { userId: input.targetUserId },
      }),
      prisma.groupCoupon.updateMany({
        where: { createdById: input.sourceUserId },
        data: { createdById: input.targetUserId },
      }),
      prisma.userIdentity.updateMany({
        where: { userId: input.sourceUserId },
        data: { userId: input.targetUserId },
      }),
      ...(sourceUser.authId.startsWith("historic-")
        ? []
        : [
            prisma.userIdentity.create({
              data: {
                authId: sourceUser.authId,
                email: sourceUser.email,
                userId: input.targetUserId,
              },
            }),
          ]),
      // Promote target to admin if source is admin and target is not.
      // A merge must never destroy an admin role.
      ...(sourceUser.role === "admin" && targetUser.role !== "admin"
        ? [
            prisma.user.update({
              where: { id: input.targetUserId },
              data: { role: "admin" },
            }),
          ]
        : []),
      prisma.user.delete({
        where: { id: input.sourceUserId },
      }),
    ];

    const result = await prisma.$transaction(operations);

    // prediction.updateMany must remain the first operation
    const predictionUpdateResult = result[0] as Prisma.BatchPayload;
    const movedPredictions = predictionUpdateResult.count;

    // Reflect any admin promotion in the response
    const finalUser =
      sourceUser.role === "admin" && targetUser.role !== "admin"
        ? { ...targetUser, role: "admin" as const }
        : targetUser;

    return {
      ok: true,
      data: {
        user: finalUser,
        movedPredictions,
      },
    };
  } catch (error) {
    // Detect Prisma unique-constraint violation (P2002) and return collision response
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        code: "MERGE_COLLISION",
        message: "Begge konti har tips på nogle af de samme kampe. Slet den ene kupon først.",
      };
    }
    // Rethrow any other error
    throw error;
  }
}
