import type { Pick } from "@prisma/client";
import { PICK_LABEL, type PickValue, PICK_ORDER } from "@/lib/picks";
import { getSystem } from "@/lib/coupon-systems";
import type { SettlementResult } from "@/lib/group-coupon-settlement";
import { GroupCouponResult } from "./GroupCouponResult";

interface SerializedCouponMatch {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  outcomes: ("HOME" | "DRAW" | "AWAY")[];
  baseOutcome: ("HOME" | "DRAW" | "AWAY") | null;
  result?: ("HOME" | "DRAW" | "AWAY") | null;
}

interface GroupCouponCardProps {
  coupon: {
    systemCode: string;
    matches: SerializedCouponMatch[];
  };
  roundNumber?: number;
  seasonName: string;
  settlement?: SettlementResult | null;
}

export function GroupCouponCard({
  coupon,
  roundNumber,
  seasonName,
  settlement,
}: GroupCouponCardProps) {
  const system = getSystem(coupon.systemCode);

  // Sort matches by match number
  const sortedMatches = [...coupon.matches].sort(
    (a, b) => a.matchNumber - b.matchNumber
  );

  return (
    <div className="max-w-[560px] mx-auto">
      <div className="card p-0! overflow-hidden">
        {/* Header with tear-line */}
        <div className="px-[22px] py-5 border-b-2 border-dashed border-line-tear flex justify-between items-baseline">
          <span className="kicker">
            {seasonName} · FÆLLESKUPON RUNDE {roundNumber || "?"}
          </span>
          <span className="font-mono text-[10px] font-bold bg-brand-tint text-brand-text rounded-full px-2.5 py-1 whitespace-nowrap">
            AFLEVERET
          </span>
        </div>

        {/* Main content */}
        <div className="px-[22px] py-[22px] flex flex-col gap-4">
          {/* System code and row count */}
          <div className="flex justify-between items-center">
            <div className="font-display text-[26px] font-black text-ink">
              {coupon.systemCode}
            </div>
            {system && (
              <div className="text-right">
                <div className="font-mono text-[22px] font-bold text-gold">
                  {system.rows}
                </div>
                <div className="text-xs text-muted">rækker</div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-line-divider"></div>

          {/* Coverage section header */}
          <div className="font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
            DÆKNING PR. KAMP
          </div>

          {/* Matches list */}
          <div className="flex flex-col gap-1.5">
            {sortedMatches.map((couponMatch) => (
              <div
                key={couponMatch.id}
                className="flex items-center gap-2.5 py-1.5"
              >
                {/* Match number */}
                <span className="font-mono text-[10px] text-muted-ghost w-4 text-right shrink-0">
                  {couponMatch.matchNumber}
                </span>

                {/* Team names */}
                <span className="text-sm text-ink flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  {couponMatch.homeTeam}–{couponMatch.awayTeam}
                </span>

                {/* Outcome chips */}
                <div className="flex gap-1 shrink-0">
                  {PICK_ORDER.map((pickValue) => {
                    const isCovered = couponMatch.outcomes.includes(
                      pickValue as Pick
                    );
                    const isBase =
                      couponMatch.baseOutcome === (pickValue as Pick);
                    const isResult = couponMatch.result === pickValue;
                    const resultWasCovered =
                      couponMatch.result && isCovered && isResult;
                    const resultWasNotCovered =
                      couponMatch.result && !isCovered && isResult;

                    // Six mutually distinguishable states:
                    // 1. base + result: bg-result-ink + ring-brand
                    // 2. result only (covered): bg-result-ink
                    // 3. base only: bg-brand + ring-brand
                    // 4. covered only: bg-brand
                    // 5. result but uncovered: bg-line-divider + ring-signal
                    // 6. uncovered: bg-line-divider

                    return (
                      <div
                        key={pickValue}
                        className={`w-[26px] h-[26px] rounded-[7px] flex items-center justify-center font-mono font-bold text-xs transition-colors ${
                          resultWasCovered
                            ? `bg-result-ink text-white ${isBase ? "ring-2 ring-offset-1 ring-brand" : ""}`
                            : isCovered
                              ? `${isBase ? "bg-brand text-white ring-2 ring-offset-1 ring-brand" : "bg-brand text-white"}`
                              : `bg-line-divider text-muted-ghost ${resultWasNotCovered ? "ring-2 ring-offset-1 ring-signal" : ""}`
                        }`}
                      >
                        {PICK_LABEL[pickValue]}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-line-divider"></div>

          {/* Settlement result or placeholder footer */}
          {settlement ? (
            <GroupCouponResult settlement={settlement} />
          ) : (
            <div className="text-xs text-muted leading-relaxed">
              Resultatopgørelse for fælleskuponen kommer, når runden er afgjort.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
