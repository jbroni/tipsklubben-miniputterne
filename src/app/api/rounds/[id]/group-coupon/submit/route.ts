import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMember, canManageGroupCoupon } from "@/lib/auth";
import { submitGroupCoupon } from "@/lib/services/group-coupon-submission";
import { codeToStatus } from "@/lib/services/result";

export const maxDuration = 30;

/**
 * POST: Submit the saved final group coupon of a round to the official tournament site.
 *
 * Managers (admin or the round's delegate) only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentMember();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const round = await prisma.round.findUnique({
    where: { id },
    select: { couponDelegateId: true },
  });

  if (!round) {
    return NextResponse.json({ error: "Runde ikke fundet" }, { status: 404 });
  }

  if (!canManageGroupCoupon(user, round)) {
    return NextResponse.json(
      { error: "Du har ikke adgang til fælleskuponen for denne runde" },
      { status: 403 }
    );
  }

  const result = await submitGroupCoupon(id, user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: codeToStatus[result.code] }
    );
  }

  return NextResponse.json(result.data);
}
