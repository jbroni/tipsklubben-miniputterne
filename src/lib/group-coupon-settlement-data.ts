import { prisma } from "./prisma";
import { settleGroupCoupon, type SettlementResult } from "./group-coupon-settlement";
import type { CouponSlot } from "./system-keys/conventions";
import type { PickValue } from "./picks";
import type { Prisma } from "@prisma/client";

/**
 * Load group coupon settlement from Prisma data for a given round.
 * Computes settlement on read — no schema change required.
 */
type GroupCouponPayload = Prisma.GroupCouponGetPayload<{
  include: { matches: { include: { match: true } } };
}>;

export function settleFromPrisma(
  coupon: GroupCouponPayload,
  roundStatus: string
): SettlementResult {
  // Detect malformed coupon (must have exactly 13 matches)
  if (coupon.matches.length !== 13) {
    return {
      status: "error",
      message: `Coupon has ${coupon.matches.length} matches but expected 13`,
    };
  }

  // Map coupon matches to CouponSlot[] shape
  const slots: CouponSlot[] = coupon.matches.map((m) => ({
    matchNumber: m.match.matchNumber,
    coverage: m.coverage as "single" | "half" | "full",
    outcomes: m.outcomes as PickValue[],
    baseOutcome: (m.baseOutcome as PickValue | null) ?? null,
  }));

  // Build results record keyed by matchNumber
  const results: Record<number, PickValue | null> = {};
  for (const m of coupon.matches) {
    results[m.match.matchNumber] = (m.match.result as PickValue | null) ?? null;
  }

  // Settle the coupon
  return settleGroupCoupon({
    systemCode: coupon.systemCode,
    slots,
    results,
    roundCompleted: roundStatus === "completed",
  });
}
