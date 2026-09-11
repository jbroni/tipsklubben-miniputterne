import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { Round } from "@prisma/client";
import type { ServiceResult } from "./result";

export async function createRound(input: {
  seasonId: string;
  roundNumber: number;
  deadline: string;
}): Promise<ServiceResult<Round>> {
  if (!input.seasonId || !input.roundNumber || !input.deadline) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Season ID, round number, and deadline are required",
    };
  }

  try {
    const round = await prisma.round.create({
      data: {
        seasonId: input.seasonId,
        roundNumber: input.roundNumber,
        deadline: new Date(input.deadline),
        status: "open",
      },
    });

    return {
      ok: true,
      data: round,
    };
  } catch (error) {
    // Handle unique constraint violation on [seasonId, roundNumber]
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        code: "ROUND_EXISTS",
        message: "A round with this number already exists for this season",
      };
    }
    throw error;
  }
}

export async function updateRound(input: {
  roundId: string;
  status?: string;
  deadline?: string;
}): Promise<ServiceResult<Round>> {
  // Validate deadline if provided
  if (input.deadline) {
    const deadlineDate = new Date(input.deadline);
    if (isNaN(deadlineDate.getTime())) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "Ugyldigt deadline-format",
      };
    }
  }

  // If setting status to "open", check that effective deadline is in the future
  if (input.status === "open") {
    const round = await prisma.round.findUnique({
      where: { id: input.roundId },
    });

    if (!round) {
      return {
        ok: false,
        code: "ROUND_NOT_FOUND",
        message: "Runde ikke fundet",
      };
    }

    // Determine effective deadline: use provided deadline or current round's deadline
    const effectiveDeadline = input.deadline
      ? new Date(input.deadline)
      : new Date(round.deadline);

    if (effectiveDeadline <= new Date()) {
      return {
        ok: false,
        code: "VALIDATION",
        message:
          "Deadline er passeret – sæt en ny deadline for at genåbne runden",
      };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.status) updateData.status = input.status;
  if (input.deadline) updateData.deadline = new Date(input.deadline);

  const round = await prisma.round.update({
    where: { id: input.roundId },
    data: updateData,
  });

  return {
    ok: true,
    data: round,
  };
}
