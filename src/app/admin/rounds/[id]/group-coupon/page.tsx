"use client";

import { Suspense, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PICK_LABEL } from "@/lib/picks";
import { getSystem, SYSTEMS } from "@/lib/coupon-systems";
import { fitSystem, InfeasiblePinsError, type PinnedCoverage } from "@/lib/group-coupon";
import { GroupCouponCard } from "@/components/GroupCouponCard";
import type {
  GroupCouponSuggestionResponse,
  SerializedGroupCouponMatchDetails,
} from "@/types";

interface MatchOverride {
  coverage: "single" | "half" | "full";
  outcomes: ("HOME" | "DRAW" | "AWAY")[];
  baseOutcome: ("HOME" | "DRAW" | "AWAY") | null;
  reasoning: string;
}

function GroupCouponContent() {
  const params = useParams();
  const roundId = params.id as string;

  const [suggestion, setSuggestion] =
    useState<GroupCouponSuggestionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [showMemberView, setShowMemberView] = useState(false);

  const [selectedSystemCode, setSelectedSystemCode] = useState<string | null>(
    null
  );
  const [overrides, setOverrides] = useState<Record<string, MatchOverride>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Load suggestion on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const couponRes = await fetch(`/api/rounds/${roundId}/group-coupon`);
        const couponData = (await couponRes.json()) as GroupCouponSuggestionResponse;

        if (!couponRes.ok) {
          setActionError("Fejl ved indlæsning af fælleskupon");
          setLoading(false);
          return;
        }

        setSuggestion(couponData);

        // If a saved coupon exists, use it as the starting point
        if (couponData.coupon) {
          setSelectedSystemCode(couponData.coupon.systemCode);
          // Seed overrides from matches where isOverridden is true
          const seedOverrides: Record<string, MatchOverride> = {};
          couponData.coupon.matches.forEach((m) => {
            if (m.isOverridden) {
              seedOverrides[m.matchNumber.toString()] = {
                coverage: m.coverage,
                outcomes: m.outcomes,
                baseOutcome: m.baseOutcome,
                reasoning: m.reasoning,
              };
            }
          });
          setOverrides(seedOverrides);
        } else if (
          couponData.suggestion &&
          couponData.suggestion.systems.length > 0
        ) {
          // Auto-select first system if no saved coupon
          setSelectedSystemCode(couponData.suggestion.systems[0].system.code);
        }

        setLoading(false);
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : "Fejl ved indlæsning af fælleskupon"
        );
        setLoading(false);
      }
    };

    fetchData();
  }, [roundId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Fælleskupon
        </h1>
        <div className="text-center py-20 text-muted">Indlæser...</div>
      </div>
    );
  }

  // No suggestion available (deadline not passed yet)
  if (!suggestion) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Fælleskupon
        </h1>
        <div className="card">
          <p className="text-sm text-ink-secondary">
            Fælleskuponen kan først oprettes efter deadline. Vend tilbage når
            runden er låst.
          </p>
        </div>
      </div>
    );
  }

  // Suggestion error
  if (suggestion.suggestionError) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Fælleskupon
        </h1>
        <div className="bg-signal-soft border border-signal text-signal rounded-lg px-4 py-3 text-sm">
          {suggestion.suggestionError}
        </div>
      </div>
    );
  }

  // Must have suggestion data
  if (!suggestion.suggestion || !suggestion.matches || suggestion.matches.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Fælleskupon
        </h1>
        <div className="card">
          <p className="text-sm text-ink-secondary">
            Ingen fælles kupon-forslag fundet.
          </p>
        </div>
      </div>
    );
  }

  if (showMemberView) {
    const serializedCoupon = suggestion.coupon
      ? {
          systemCode: suggestion.coupon.systemCode,
          matches: suggestion.coupon.matches.map((m) => ({
            id: m.id,
            matchNumber: m.matchNumber,
            homeTeam: suggestion.matches?.find(
              (match) => match.matchNumber === m.matchNumber
            )?.homeTeam || "?",
            awayTeam: suggestion.matches?.find(
              (match) => match.matchNumber === m.matchNumber
            )?.awayTeam || "?",
            outcomes: m.outcomes,
            baseOutcome: m.baseOutcome,
          })),
        }
      : null;

    return (
      <div className="space-y-4">
        <button
          onClick={() => setShowMemberView(false)}
          className="text-sm text-brand hover:underline"
        >
          ← Tilbage til byg
        </button>
        {serializedCoupon && (
          <GroupCouponCard
            coupon={serializedCoupon}
            roundNumber={suggestion.roundNumber}
            seasonName={suggestion.seasonName}
          />
        )}
      </div>
    );
  }

  const systems = suggestion.suggestion.systems;
  const selectedSystem = systems.find(
    (s) => s.system.code === selectedSystemCode
  );

  if (!selectedSystem) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Fælleskupon
        </h1>
        <div className="card">
          <p className="text-sm text-ink-secondary">System ikke fundet.</p>
        </div>
      </div>
    );
  }

  const systemDef = getSystem(selectedSystem.system.code);
  if (!systemDef) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Fælleskupon
        </h1>
        <div className="card">
          <p className="text-sm text-ink-secondary">Systemdefinition ikke fundet.</p>
        </div>
      </div>
    );
  }

  // Compute rendered assignments by calling fitSystem with pinned overrides
  let renderedMatches: Array<{
    matchNumber: number;
    coverage: "single" | "half" | "full";
    outcomes: ("HOME" | "DRAW" | "AWAY")[];
    baseOutcome: ("HOME" | "DRAW" | "AWAY") | null;
    reasoning: string;
    isOverridden: boolean;
    tally: { HOME: number; DRAW: number; AWAY: number; total: number };
  }> = [];
  let slotBudgetValid = false;
  let infeasibleError = false;

  try {
    // Build pinned map from overrides
    const pinned: PinnedCoverage = {};
    for (const matchNumber in overrides) {
      pinned[parseInt(matchNumber)] = overrides[matchNumber].coverage;
    }

    // Call fitSystem with pinned overrides
    const fit = fitSystem(
      systemDef,
      suggestion.matches.map((m) => ({
        matchNumber: m.matchNumber,
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw,
        oddsAway: m.oddsAway,
      })),
      suggestion.ballots || [],
      Object.keys(pinned).length > 0 ? pinned : undefined
    );

    // Merge fitted assignments with overrides to get final display
    renderedMatches = fit.assignments.map((assignment) => {
      const override = overrides[assignment.matchNumber.toString()];
      if (override) {
        return {
          matchNumber: assignment.matchNumber,
          coverage: override.coverage,
          outcomes: override.outcomes,
          baseOutcome: override.baseOutcome,
          reasoning: override.reasoning,
          isOverridden: true,
          tally: assignment.tally,
        };
      }
      return {
        matchNumber: assignment.matchNumber,
        coverage: assignment.coverage,
        outcomes: assignment.outcomes,
        baseOutcome: assignment.baseOutcome,
        reasoning: assignment.reasoning,
        isOverridden: false,
        tally: assignment.tally,
      };
    });

    // Calculate slot budget
    const coverageCounts = {
      full: 0,
      half: 0,
      single: 0,
    };
    renderedMatches.forEach((m) => {
      coverageCounts[m.coverage]++;
    });

    slotBudgetValid =
      coverageCounts.full === systemDef.full &&
      coverageCounts.half === systemDef.half &&
      coverageCounts.single === systemDef.single;
  } catch (err) {
    // Catch any error (InfeasiblePinsError or other); render infeasible state
    infeasibleError = true;
    slotBudgetValid = false;
    // Still render current overrides even if infeasible
    renderedMatches = suggestion.matches.map((match) => {
      const override = overrides[match.matchNumber.toString()];
      if (override) {
        return {
          matchNumber: match.matchNumber,
          coverage: override.coverage,
          outcomes: override.outcomes,
          baseOutcome: override.baseOutcome,
          reasoning: override.reasoning,
          isOverridden: true,
          tally: { HOME: 0, DRAW: 0, AWAY: 0, total: 0 },
        };
      }
      return {
        matchNumber: match.matchNumber,
        coverage: "full",
        outcomes: ["HOME", "DRAW", "AWAY"],
        baseOutcome: null,
        reasoning: "",
        isOverridden: false,
        tally: { HOME: 0, DRAW: 0, AWAY: 0, total: 0 },
      };
    });
  }

  // Handler: system selection
  const handleSystemChange = (newCode: string) => {
    setSelectedSystemCode(newCode);
  };

  // Handler: toggle outcome button
  const handleToggleOutcome = (
    matchNumber: number,
    outcome: "HOME" | "DRAW" | "AWAY"
  ) => {
    const current = renderedMatches.find((m) => m.matchNumber === matchNumber);
    if (!current) return;

    const newOutcomes = current.outcomes.includes(outcome)
      ? current.outcomes.filter((o) => o !== outcome)
      : [...current.outcomes, outcome];

    // Ignore toggle if it would empty the set
    if (newOutcomes.length === 0) return;

    // Derive coverage from outcome count
    let newCoverage: "single" | "half" | "full";
    if (newOutcomes.length === 1) {
      newCoverage = "single";
    } else if (newOutcomes.length === 2) {
      newCoverage = "half";
    } else {
      newCoverage = "full";
    }

    // Determine baseOutcome for U-systems
    let newBaseOutcome: "HOME" | "DRAW" | "AWAY" | null = null;
    if (systemDef.requiresBaseRow && newCoverage !== "single") {
      if (newOutcomes.includes(current.baseOutcome || "HOME")) {
        newBaseOutcome = current.baseOutcome;
      } else {
        newBaseOutcome = newOutcomes[0];
      }
    }

    // When creating an override, always set reasoning to admin override text
    const newReasoning = "Manuelt tilpasset af admin.";

    const newOverride: MatchOverride = {
      coverage: newCoverage,
      outcomes: newOutcomes,
      baseOutcome: newBaseOutcome,
      reasoning: newReasoning,
    };

    setOverrides({
      ...overrides,
      [matchNumber.toString()]: newOverride,
    });
  };

  // Handler: reset match override
  const handleResetMatch = (matchNumber: number) => {
    const { [matchNumber.toString()]: _, ...rest } = overrides;
    setOverrides(rest);
  };

  // Handler: save
  const handleSave = async (status: "draft" | "final") => {
    if (!slotBudgetValid) {
      setActionError("Slot-budgettet stemmer ikke overens. Ret tilpasningerne.");
      return;
    }

    setIsSaving(true);
    setActionError("");

    try {
      const matchesPayload = renderedMatches.map((m) => {
        const match = suggestion.matches?.find((match) => match.matchNumber === m.matchNumber);
        return {
          matchId: match?.id || "",
          coverage: m.coverage,
          outcomes: m.outcomes,
          baseOutcome: m.baseOutcome,
          reasoning: m.reasoning,
          isOverridden: m.isOverridden,
        };
      });

      const res = await fetch(`/api/rounds/${roundId}/group-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemCode: selectedSystemCode,
          status,
          matches: matchesPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({
          error: "Fejl ved gemning",
        }));
        setActionError(data.error ?? "Fejl ved gemning af fælleskupon");
        return;
      }

      // Refetch to confirm
      const couponRes = await fetch(`/api/rounds/${roundId}/group-coupon`);
      const updatedData = (await couponRes.json()) as GroupCouponSuggestionResponse;
      setSuggestion(updatedData);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Fejl ved gemning af fælleskupon"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate slot budget for display
  const coverageCounts = {
    full: 0,
    half: 0,
    single: 0,
  };
  renderedMatches.forEach((m) => {
    coverageCounts[m.coverage]++;
  });

  // Get ballots for member list
  const ballots = suggestion.ballots || [];

  return (
    <div className="space-y-0">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-50 bg-paper border-b border-line-card">
        <div className="max-w-[1360px] mx-auto px-7 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-2xl font-bold text-ink">
              Fælleskuponen
            </h1>
            <div className="text-sm text-muted">
              Runde {suggestion.roundNumber} · {suggestion.seasonName}
            </div>
          </div>

          {/* Status pill */}
          <div className="px-3 py-1 rounded-full text-sm font-medium bg-brand-tint text-brand-text">
            {suggestion.coupon
              ? suggestion.coupon.status === "draft"
                ? "KLADDE"
                : "OFFENTLIGGJORT"
              : "KLADDE"}
          </div>

          {/* Slot budget pill */}
          <div
            className={`px-3 py-1 rounded-full font-mono text-xs font-medium ${
              slotBudgetValid
                ? "bg-brand-tint text-brand-text"
                : "bg-signal-soft text-signal"
            }`}
          >
            Hel: {coverageCounts.full}/{systemDef.full} · Halv:{" "}
            {coverageCounts.half}/{systemDef.half}
          </div>

          <button
            onClick={() => setShowMemberView(true)}
            className="text-sm text-brand hover:underline px-3 py-1"
          >
            Se medlemsvisning →
          </button>

          <button
            onClick={() => handleSave("final")}
            className="btn-primary text-sm"
            disabled={isSaving || !slotBudgetValid}
          >
            {isSaving ? "Gemmer…" : "Gem & offentliggør"}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="max-w-[1360px] mx-auto px-7 py-4">
          <div className="border border-signal rounded-lg px-4 py-3 text-sm flex items-center justify-between bg-signal-soft text-signal">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError("")}
              className="ml-4 opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {infeasibleError && (
        <div className="max-w-[1360px] mx-auto px-7 py-4">
          <div className="border border-signal rounded-lg px-4 py-3 text-sm bg-signal-soft text-signal">
            De markerede kampe passer ikke ind i dette system. Tilpas eller nulstil nogle.
          </div>
        </div>
      )}

      {/* Member avatars row */}
      {ballots.length > 0 && (
        <div className="max-w-[1360px] mx-auto px-7 py-4 flex items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted">
            Hvem har stemt
          </span>
          <div className="flex items-center gap-2">
            {ballots.map((ballot) => (
              <div key={ballot.userId} className="flex flex-col items-center gap-1">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-brand"
                  title={ballot.displayName}
                >
                  {ballot.displayName.charAt(0).toUpperCase()}
                </div>
                {ballot.source === "carried" && (
                  <div className="text-xs text-muted text-center whitespace-nowrap">
                    kupon fra runde {ballot.sourceRoundNumber}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column grid */}
      <div className="max-w-[1360px] mx-auto px-7 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* System list (sidebar) */}
        <div className="sticky top-[82px] h-fit">
          <div className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-3">
              13 Systemer · Sorteret efter dækning
            </h2>
            {systems.map((fit) => (
              <button
                key={fit.system.code}
                onClick={() => handleSystemChange(fit.system.code)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm text-ink ${
                  selectedSystemCode === fit.system.code
                    ? "bg-brand-tint border-brand-tintBorder"
                    : "border-line-card"
                }`}
              >
                <div className="font-mono font-semibold text-sm mb-1">
                  {fit.system.code}
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-xs">
                    <span
                      className={
                        fit.coverage >= 80
                          ? "text-brand"
                          : fit.coverage >= 55
                            ? "text-gold"
                            : "text-signal"
                      }
                    >
                      {fit.coverage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {fit.system.rows} rk.
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Match list (main) */}
        <div
          className="overflow-x-auto"
          style={{ minHeight: "fit-content" }}
        >
          <div style={{ minWidth: "720px" }} className="space-y-0">
            {renderedMatches.map((match, idx) => {
              const matchDetails = suggestion.matches?.find(
                (m) => m.matchNumber === match.matchNumber
              );
              const isOverridden = match.isOverridden;

              // Calculate vote distribution for bar
              const total = match.tally.total || 1;
              const homePercent = (match.tally.HOME / total) * 100;
              const drawPercent = (match.tally.DRAW / total) * 100;
              const awayPercent = (match.tally.AWAY / total) * 100;

              return (
                <div
                  key={match.matchNumber}
                  className={`border-b border-line-card py-3 px-4 flex items-start gap-4 text-sm ${
                    isOverridden ? "bg-surface-edited" : ""
                  }`}
                >
                  {/* Match number */}
                  <div className="text-xs font-mono text-muted w-8">
                    {match.matchNumber}
                  </div>

                  {/* Teams and odds */}
                  <div className="w-40 flex-shrink-0">
                    <div className="font-medium text-ink mb-1">
                      {matchDetails?.homeTeam} – {matchDetails?.awayTeam}
                    </div>
                    <div className="text-xs text-muted">
                      {matchDetails?.league}
                    </div>
                    <div className="text-xs font-mono text-muted mt-0.5">
                      {matchDetails?.oddsHome.toFixed(2)} ·{" "}
                      {matchDetails?.oddsDraw.toFixed(2)} ·{" "}
                      {matchDetails?.oddsAway.toFixed(2)}
                    </div>
                  </div>

                  {/* Vote split bar */}
                  <div className="w-24 flex-shrink-0">
                    <div className="flex h-4 rounded-sm overflow-hidden gap-0.5">
                      <div
                        className="bg-brand"
                        style={{
                          width: `${homePercent}%`,
                          minWidth: homePercent > 5 ? "auto" : "2px",
                        }}
                      />
                      <div
                        className="bg-gold"
                        style={{
                          width: `${drawPercent}%`,
                          minWidth: drawPercent > 5 ? "auto" : "2px",
                        }}
                      />
                      <div
                        className="bg-line-card"
                        style={{
                          width: `${awayPercent}%`,
                          minWidth: awayPercent > 5 ? "auto" : "2px",
                        }}
                      />
                    </div>
                    <div className="flex text-xs text-muted font-mono mt-0.5 gap-2">
                      <span>{match.tally.HOME}</span>
                      <span>{match.tally.DRAW}</span>
                      <span>{match.tally.AWAY}</span>
                    </div>
                  </div>

                  {/* Outcome buttons */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {(["HOME", "DRAW", "AWAY"] as const).map((outcome) => (
                      <button
                        key={outcome}
                        onClick={() =>
                          handleToggleOutcome(match.matchNumber, outcome)
                        }
                        className={`w-9 h-9 rounded-lg font-mono font-bold text-sm flex items-center justify-center transition-colors ${
                          match.outcomes.includes(outcome)
                            ? "bg-brand text-white"
                            : "bg-surface text-muted border border-line-pick"
                        }`}
                      >
                        {PICK_LABEL[outcome]}
                      </button>
                    ))}
                  </div>

                  {/* Base outcome for U-systems */}
                  {systemDef.requiresBaseRow && match.coverage !== "single" && (
                    <div className="w-10 flex-shrink-0 text-center">
                      <div className="text-xs text-muted mb-1">Uds.</div>
                      <div className="font-mono font-bold text-sm">
                        {match.baseOutcome
                          ? PICK_LABEL[match.baseOutcome]
                          : "-"}
                      </div>
                    </div>
                  )}

                  {/* Rationale */}
                  <div className="flex-1 min-w-0 text-xs text-muted line-clamp-2">
                    {match.reasoning}
                  </div>

                  {/* Override badge and reset */}
                  {isOverridden && (
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-gold text-white">
                        redigeret
                      </span>
                      <button
                        onClick={() => handleResetMatch(match.matchNumber)}
                        className="text-xs text-signal hover:underline"
                      >
                        nulstil
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save draft button */}
      <div className="max-w-[1360px] mx-auto px-7 py-6 border-t border-line-card">
        <button
          onClick={() => handleSave("draft")}
          className="btn-secondary text-sm"
          disabled={isSaving}
        >
          {isSaving ? "Gemmer…" : "Gem som kladde"}
        </button>
      </div>
    </div>
  );
}

export default function GroupCouponPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <h1 className="font-display text-2xl font-bold text-ink">
            Fælleskupon
          </h1>
          <div className="text-center py-20 text-muted">Indlæser…</div>
        </div>
      }
    >
      <GroupCouponContent />
    </Suspense>
  );
}
