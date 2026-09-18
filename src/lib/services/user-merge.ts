import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";
import type { ServiceResult } from "./result";
import { isHistoricPlaceholder } from "@/lib/historic-users";

/** Raised when a prediction is inserted for the source user between the move and delete. */
class MergeRaceError extends Error {
  constructor() {
    super("Prediction inserted during merge window");
    this.name = "MergeRaceError";
  }
}

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
  if (isHistoricPlaceholder(targetUser.authId)) {
    return {
      ok: false,
      code: "INVALID_MERGE",
      message: "Målbrugeren kan ikke være en historisk pladsholderkonto",
    };
  }

  // 4. Collision check: ensure both accounts don't have picks in the same matches
  const collisions = await prisma.prediction.findMany({
    where: {
      userId: input.targetUserId,
      match: { predictions: { some: { userId: input.sourceUserId } } },
    },
    select: { round: { select: { roundNumber: true } } },
    distinct: ["roundId"],
  });

  if (collisions.length > 0) {
    const sortedRoundNumbers = collisions
      .map((c) => c.round.roundNumber)
      .sort((a, b) => a - b);

    const roundsText = sortedRoundNumbers.join(", ");
    return {
      ok: false,
      code: "MERGE_COLLISION",
      message: `Begge konti har tips i runde ${roundsText}. Slet den ene kupon først.`,
    };
  }

  // 5. Interactive transaction: reassign records and delete source user
  try {
    const movedPredictions = await prisma.$transaction(
      async (tx) => {
        // Lock the source user row to prevent concurrent inserts that reference it via FK.
        // Concurrent insert operations that take a FOR KEY SHARE lock will block until
        // this transaction commits, then fail their FK check if the row is gone.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.sourceUserId}::uuid FOR UPDATE`;

        const moved = await tx.prediction.updateMany({
          where: { userId: input.sourceUserId },
          data: { userId: input.targetUserId },
        });

        await tx.mcpToken.updateMany({
          where: { userId: input.sourceUserId },
          data: { userId: input.targetUserId },
        });

        await tx.groupCoupon.updateMany({
          where: { createdById: input.sourceUserId },
          data: { createdById: input.targetUserId },
        });

        await tx.userIdentity.updateMany({
          where: { userId: input.sourceUserId },
          data: { userId: input.targetUserId },
        });

        if (!isHistoricPlaceholder(sourceUser.authId)) {
          await tx.userIdentity.create({
            data: {
              authId: sourceUser.authId,
              email: sourceUser.email,
              userId: input.targetUserId,
            },
          });
        }

        // A merge must never destroy an admin role.
        if (sourceUser.role === "admin" && targetUser.role !== "admin") {
          await tx.user.update({
            where: { id: input.targetUserId },
            data: { role: "admin" },
          });
        }

        // Guard: a coupon submitted for the source between the move above and the
        // delete below would be cascade-deleted silently. Abort instead. The FOR UPDATE
        // lock above is what actually closes this window; this count is a backstop.
        const straggling = await tx.prediction.count({
          where: { userId: input.sourceUserId },
        });
        if (straggling > 0) throw new MergeRaceError();

        await tx.user.delete({
          where: { id: input.sourceUserId },
        });

        return moved.count;
      },
      { timeout: 20000 }
    );

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
    // Handle race condition: prediction inserted during merge window
    if (error instanceof MergeRaceError) {
      return {
        ok: false,
        code: "MERGE_RACE",
        message: "Der blev afgivet tips på kontoen under sammenlægningen. Intet blev ændret — prøv igen.",
      };
    }

    // Detect Prisma unique-constraint violation (P2002) and narrow the mapping.
    // error.meta.target can be either an array of column names or a constraint name string.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target;
      const targetText = Array.isArray(target)
        ? target.join(",")
        : String(target ?? "");

      // Check if the violation involves auth_id (user_identities unique constraint)
      if (targetText.includes("auth_id")) {
        return {
          ok: false,
          code: "INVALID_MERGE",
          message: "Det tidligere login er allerede registreret på et andet medlem, så sammenlægningen blev ikke fuldført.",
        };
      }

      // Check if the violation involves prediction columns (unique constraint is on user_id, match_id).
      // Require both to be present to avoid mis-mapping a future unique constraint on different columns.
      if (
        targetText.includes("user_id") &&
        targetText.includes("match_id")
      ) {
        return {
          ok: false,
          code: "MERGE_COLLISION",
          message: "Begge konti har tips på nogle af de samme kampe. Slet den ene kupon først.",
        };
      }

      // Unknown P2002: return a generic error message without rethrowing
      return {
        ok: false,
        code: "MERGE_COLLISION",
        message: "Sammenlægningen kunne ikke gennemføres på grund af en konflikt i databasen. Intet blev ændret.",
      };
    }

    // Rethrow any other error
    throw error;
  }
}
