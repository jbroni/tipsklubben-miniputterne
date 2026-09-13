import type { SettlementResult } from "@/lib/group-coupon-settlement";

interface GroupCouponResultProps {
  settlement: SettlementResult;
}

/**
 * Format a list of match numbers into Danish text.
 * E.g., [4] → "Kamp 4", [4, 9] → "Kamp 4 og 9", [4, 7, 9] → "Kamp 4, 7 og 9"
 */
function formatMatchNumbers(nums: number[]): string {
  if (nums.length === 0) return "";
  if (nums.length === 1) return `Kamp ${nums[0]}`;
  if (nums.length === 2) return `Kamp ${nums[0]} og ${nums[1]}`;
  // 3+ matches: "Kamp 4, 7 og 9"
  const all = nums.map((n) => String(n));
  const last = all.pop();
  return `Kamp ${all.join(", ")} og ${last}`;
}

export function GroupCouponResult({ settlement }: GroupCouponResultProps) {
  if (settlement.status === "pending") {
    return (
      <div className="text-xs text-muted leading-relaxed">
        Resultatopgørelse for fælleskuponen kommer, når runden er afgjort.
      </div>
    );
  }

  if (settlement.status === "error") {
    return (
      <div className="text-xs text-muted leading-relaxed">
        Fælleskuponen kunne ikke gøres op — kontakt en administrator.
      </div>
    );
  }

  if (settlement.status === "partial") {
    return (
      <div className="text-xs text-muted leading-relaxed space-y-1.5">
        <div>
          {settlement.ceiling} af 13 resultater var dækket.
        </div>
        <div>
          {settlement.reason === "no-key" ? (
            <>Vi har ikke rækkesættet for {settlement.systemCode}, så den præcise opgørelse mangler.</>
          ) : (
            <>Fælleskuponen kan ikke gøres op — opsætningen passer ikke til systemet.</>
          )}
        </div>
      </div>
    );
  }

  // status === "settled"
  const { tierCounts, bestRow, bestRowCount, fullyCovered, reductionCost, missedMatches, baseRowCorrect } =
    settlement;

  // Build tier line: "13: X · 12: Y · 11: Z · 10: W"
  // Omit tiers ABOVE the highest non-zero one
  let highestNonZeroTier = -1;
  for (const tier of [13, 12, 11, 10]) {
    if (tierCounts[tier as 13 | 12 | 11 | 10] > 0) {
      highestNonZeroTier = tier;
      break;
    }
  }

  let tierLine = "";
  if (highestNonZeroTier === -1) {
    // All zero
    tierLine = "Ingen præmierække denne gang.";
  } else {
    // Build the tier line from 13 down to the highest non-zero (or 10, whichever comes first)
    const tierParts: string[] = [];
    for (const tier of [13, 12, 11, 10]) {
      if (tier <= highestNonZeroTier) {
        tierParts.push(`${tier}: ${tierCounts[tier as 13 | 12 | 11 | 10]}`);
      }
    }
    tierLine = tierParts.join(" · ");
  }

  // Build explanation sentence
  let explanation = "";
  if (bestRow.correct === 13) {
    explanation = "13 rigtige — fuld plade!";
  } else if (fullyCovered && reductionCost > 0) {
    explanation = `Alle 13 resultater var dækket, men systemet er reduceret — bedste række ramte ${bestRow.correct}.`;
  } else if (!fullyCovered) {
    const matchStr = formatMatchNumbers(missedMatches);
    explanation = `${matchStr} faldt uden for garderingen.`;
  }

  // Build base row note if applicable
  let baseRowNote = "";
  if (baseRowCorrect !== null) {
    baseRowNote = ` Udgangsrækken ramte ${baseRowCorrect}.`;
  }

  return (
    <div className="text-xs text-muted leading-relaxed space-y-2">
      {/* Best row score */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-mono text-muted uppercase tracking-[0.08em]">
          BEDSTE RÆKKE
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] font-bold text-gold">
            {bestRow.correct}
          </span>
          <span className="font-mono text-sm font-bold text-ink">/13</span>
          {bestRowCount > 1 && (
            <span className="font-mono text-xs text-muted-ghost">
              ({bestRowCount} rækker)
            </span>
          )}
        </div>
      </div>

      {/* Tier line */}
      <div className="font-mono text-[10px] text-ink-secondary">
        {tierLine}
      </div>

      {/* Explanation + base row note */}
      {explanation && (
        <div>
          {explanation}
          {baseRowNote}
        </div>
      )}
    </div>
  );
}
