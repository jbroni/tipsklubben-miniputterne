"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { PICK_LABEL } from "@/lib/picks";
import { getSystem } from "@/lib/coupon-systems";
import { fitSystem } from "@/lib/group-coupon";
import {
  cycleOutcome,
  isRowEdited,
  countCoverage,
  validateCoupon,
  ADMIN_OVERRIDE_REASONING,
  type EditableRow,
} from "@/lib/group-coupon-editor";
import { GroupCouponCard } from "@/components/GroupCouponCard";
import type {
  GroupCouponSuggestionResponse,
  SerializedGroupCouponMatchDetails,
} from "@/types";

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
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [needsPrefill, setNeedsPrefill] = useState(false);
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
          // Pre-fill rows from saved coupon
          setRows(
            couponData.coupon.matches.map((m) => ({
              matchNumber: m.matchNumber,
              coverage: m.coverage,
              outcomes: m.outcomes,
              baseOutcome: m.baseOutcome,
              reasoning: m.reasoning,
            }))
          );
          setNeedsPrefill(false);
        } else if (
          couponData.suggestion &&
          couponData.suggestion.systems.length > 0
        ) {
          // Auto-select first system and pre-fill from its baseline fit
          const firstSystem = couponData.suggestion.systems[0].system.code;
          setSelectedSystemCode(firstSystem);
          setNeedsPrefill(true);
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

  // Compute baseline fit for the selected system (no pins)
  const baseline = useMemo(() => {
    if (!selectedSystemCode || !suggestion?.suggestion || !suggestion?.matches) {
      return null;
    }
    const systemDef = getSystem(selectedSystemCode);
    if (!systemDef) return null;

    try {
      const fit = fitSystem(
        systemDef,
        suggestion.matches.map((m) => ({
          matchNumber: m.matchNumber,
          oddsHome: m.oddsHome,
          oddsDraw: m.oddsDraw,
          oddsAway: m.oddsAway,
        })),
        suggestion.ballots || []
      );
      // Convert to EditableRow format
      return fit.assignments.map((a) => ({
        matchNumber: a.matchNumber,
        coverage: a.coverage,
        outcomes: a.outcomes,
        baseOutcome: a.baseOutcome,
        reasoning: a.reasoning,
      }));
    } catch (err) {
      console.error("Error fitting system:", err);
      return null;
    }
  }, [selectedSystemCode, suggestion]);

  // Prefill rows from baseline when needed
  useEffect(() => {
    if (needsPrefill && baseline) {
      setRows(baseline);
      setNeedsPrefill(false);
    }
  }, [needsPrefill, baseline]);

  // Compute ballot tallies for display
  const ballotTallies = useMemo(() => {
    const tallies: Record<number, { HOME: number; DRAW: number; AWAY: number; total: number }> = {};
    if (!suggestion || !suggestion.ballots || !suggestion.matches) return tallies;
    for (const match of suggestion.matches) {
      tallies[match.matchNumber] = { HOME: 0, DRAW: 0, AWAY: 0, total: 0 };
      for (const ballot of suggestion.ballots) {
        const pick = ballot.picks[match.matchNumber];
        if (pick) {
          const count = tallies[match.matchNumber];
          count[pick as "HOME" | "DRAW" | "AWAY"]++;
          count.total++;
        }
      }
    }
    return tallies;
  }, [suggestion]);

  // Check if any rows are edited
  const anyRowEdited = useMemo(() => {
    if (!baseline) return false;
    return rows.some((row) => {
      const baselineRow = baseline.find((b) => b.matchNumber === row.matchNumber);
      return baselineRow && isRowEdited(row, baselineRow);
    });
  }, [rows, baseline]);

  // Early returns - all hooks must be above these
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
    const serializedCoupon = {
      systemCode: selectedSystemCode ?? "",
      matches: rows.map((row) => {
        const matchDetails = suggestion.matches?.find(
          (m) => m.matchNumber === row.matchNumber
        );
        return {
          id: matchDetails?.id || "",
          matchNumber: row.matchNumber,
          homeTeam: matchDetails?.homeTeam || "?",
          awayTeam: matchDetails?.awayTeam || "?",
          outcomes: row.outcomes,
          baseOutcome: row.baseOutcome,
        };
      }),
    };

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

  // Handler: system selection with confirmation
  const handleSystemChange = (newCode: string) => {
    if (newCode === selectedSystemCode) return;
    if (anyRowEdited && !window.confirm("Skift system? Dine manuelle rettelser nulstilles.")) return;
    setSelectedSystemCode(newCode);
    // R/M systems have no U-sign; clear it right away so stale U-signs never survive
    // (e.g. if the new system's baseline fit fails and the old rows stay on screen).
    if (!getSystem(newCode)?.requiresBaseRow) {
      setRows((prev) => prev.map((r) => ({ ...r, baseOutcome: null })));
    }
    setNeedsPrefill(true);
  };

  // Handler: cycle outcome button on a single row
  const handleToggleOutcome = (
    matchNumber: number,
    outcome: "HOME" | "DRAW" | "AWAY"
  ) => {
    const rowIdx = rows.findIndex((r) => r.matchNumber === matchNumber);
    if (rowIdx === -1) return;

    const newRow = cycleOutcome(rows[rowIdx], outcome, systemDef.requiresBaseRow);
    if (newRow === rows[rowIdx]) {
      // No change (would have emptied the set or invalid operation)
      return;
    }

    setRows([...rows.slice(0, rowIdx), newRow, ...rows.slice(rowIdx + 1)]);
  };

  // Handler: reset a match to its baseline
  const handleResetMatch = (matchNumber: number) => {
    if (!baseline) return;
    const baselineRow = baseline.find((b) => b.matchNumber === matchNumber);
    if (!baselineRow) return;

    const rowIdx = rows.findIndex((r) => r.matchNumber === matchNumber);
    if (rowIdx === -1) return;

    setRows([
      ...rows.slice(0, rowIdx),
      baselineRow,
      ...rows.slice(rowIdx + 1),
    ]);
  };

  // Handler: save
  const handleSave = async (status: "draft" | "final") => {
    // Validate coupon
    const issues = validateCoupon(rows, systemDef);
    if (issues.length > 0) {
      setActionError(issues.map((i) => i.message).join("\n"));
      return;
    }

    setIsSaving(true);
    setActionError("");

    try {
      const matchesPayload = rows.map((row) => {
        const match = suggestion.matches?.find(
          (m) => m.matchNumber === row.matchNumber
        );
        const baselineRow = baseline?.find(
          (b) => b.matchNumber === row.matchNumber
        );
        const isOverridden = baselineRow ? isRowEdited(row, baselineRow) : false;

        return {
          matchId: match?.id || "",
          coverage: row.coverage,
          outcomes: row.outcomes,
          baseOutcome: systemDef.requiresBaseRow && row.coverage !== "single" ? row.baseOutcome : null,
          reasoning: (isOverridden ? ADMIN_OVERRIDE_REASONING : baselineRow?.reasoning || row.reasoning) || ADMIN_OVERRIDE_REASONING,
          isOverridden,
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
  const coverageCounts = countCoverage(rows);
  const slotBudgetValid =
    coverageCounts.full === systemDef.full &&
    coverageCounts.half === systemDef.half &&
    coverageCounts.single === systemDef.single;

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
            disabled={isSaving}
          >
            {isSaving ? "Gemmer…" : "Gem & offentliggør"}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="max-w-[1360px] mx-auto px-7 py-4">
          <div className="border border-signal rounded-lg px-4 py-3 text-sm bg-signal-soft text-signal">
            <div className="flex items-center justify-between">
              <div className="whitespace-pre-line">{actionError}</div>
              <button
                onClick={() => setActionError("")}
                className="ml-4 opacity-60 hover:opacity-100 shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSystemCode && baseline === null && (
        <div className="max-w-[1360px] mx-auto px-7 py-4">
          <div className="border border-signal rounded-lg px-4 py-3 text-sm bg-signal-soft text-signal">
            Kunne ikke beregne forslag for system {selectedSystemCode}.
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
      <div className="max-w-[1360px] mx-auto px-7 py-6 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5">
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
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-sm text-ink flex items-center gap-2 ${
                  selectedSystemCode === fit.system.code
                    ? "bg-brand-tint border-brand-tintBorder"
                    : "border-line-card"
                }`}
              >
                <div className="font-mono font-semibold text-sm">
                  {fit.system.code}
                </div>
                <div className="text-xs">
                  <span
                    className={
                      fit.missedOutcomes <= 1
                        ? "text-brand"
                        : fit.missedOutcomes <= 3
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
              </button>
            ))}
          </div>
        </div>

        {/* Match list (main) */}
        <div
          className="overflow-x-auto"
          style={{ minHeight: "fit-content" }}
        >
          <div className="space-y-0">
            {rows.map((row) => {
              const matchDetails = suggestion.matches?.find(
                (m) => m.matchNumber === row.matchNumber
              );
              const baselineRow = baseline?.find(
                (b) => b.matchNumber === row.matchNumber
              );
              const edited = baselineRow ? isRowEdited(row, baselineRow) : false;
              const tally = ballotTallies[row.matchNumber] || {
                HOME: 0,
                DRAW: 0,
                AWAY: 0,
                total: 0,
              };

              // Calculate vote distribution for bar
              const total = tally.total || 1;
              const homePercent = (tally.HOME / total) * 100;
              const drawPercent = (tally.DRAW / total) * 100;
              const awayPercent = (tally.AWAY / total) * 100;

              // Check if this row is missing a base outcome
              const missingBaseOutcome =
                systemDef.requiresBaseRow &&
                row.coverage !== "single" &&
                (!row.baseOutcome || !row.outcomes.includes(row.baseOutcome));

              return (
                <div
                  key={row.matchNumber}
                  className={`border-b border-line-card py-3 px-4 ${
                    edited ? "bg-surface-edited" : ""
                  }`}
                >
                  {/* Top line: match number, teams, vote bar, buttons, U-sign, controls */}
                  <div className="flex items-start gap-4 text-sm mb-2">
                    {/* Match number */}
                    <div className="text-xs font-mono text-muted w-8">
                      {row.matchNumber}
                    </div>

                    {/* Teams and odds - now flexible */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink truncate mb-1">
                        {matchDetails?.homeTeam} – {matchDetails?.awayTeam}
                      </div>
                      <div className="text-xs text-muted hidden xl:block">
                        {matchDetails?.league}
                      </div>
                      <div className="text-xs font-mono text-muted mt-0.5 hidden xl:block">
                        {matchDetails?.oddsHome.toFixed(2)} ·{" "}
                        {matchDetails?.oddsDraw.toFixed(2)} ·{" "}
                        {matchDetails?.oddsAway.toFixed(2)}
                      </div>
                    </div>

                    {/* Vote split bar */}
                    <div className="w-24 shrink-0">
                      <div className="flex h-4 rounded-xs overflow-hidden gap-0.5">
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
                        <span>{tally.HOME}</span>
                        <span>{tally.DRAW}</span>
                        <span>{tally.AWAY}</span>
                      </div>
                    </div>

                    {/* Outcome buttons */}
                    <div
                      className={`flex gap-1.5 shrink-0 ${
                        missingBaseOutcome
                          ? "rounded-lg ring-1 ring-signal ring-offset-2"
                          : ""
                      }`}
                      title={
                        missingBaseOutcome
                          ? "Mangler udgangstegn – klik på et valgt udfald"
                          : undefined
                      }
                    >
                      {(["HOME", "DRAW", "AWAY"] as const).map((outcome) => {
                        const covered = row.outcomes.includes(outcome);
                        const isUSign =
                          systemDef.requiresBaseRow &&
                          row.baseOutcome === outcome;
                        return (
                          <button
                            key={outcome}
                            onClick={() =>
                              handleToggleOutcome(row.matchNumber, outcome)
                            }
                            aria-pressed={covered}
                            aria-label={`${PICK_LABEL[outcome]}${isUSign ? " (udgangstegn)" : ""}`}
                            title={
                              systemDef.requiresBaseRow
                                ? "Klik: vælg · igen: udgangstegn · igen: fravælg"
                                : undefined
                            }
                            className={`w-9 h-9 rounded-lg font-mono font-bold text-sm flex items-center justify-center transition-colors ${
                              covered
                                ? "bg-brand text-white"
                                : "bg-surface text-muted border border-line-pick"
                            } ${isUSign ? "relative ring-2 ring-gold ring-offset-1" : ""}`}
                          >
                            {PICK_LABEL[outcome]}
                            {isUSign && (
                              <span className="absolute -top-1.5 -right-1.5 rounded-full bg-gold text-white text-[9px] leading-none px-1 py-0.5 font-mono">
                                U
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Edit badge and reset */}
                    {edited && (
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="px-2 py-1 rounded-sm text-xs font-medium bg-gold text-white">
                          redigeret
                        </span>
                        <button
                          onClick={() => handleResetMatch(row.matchNumber)}
                          className="text-xs text-signal hover:underline"
                        >
                          nulstil
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bottom line: Reasoning text (full width) */}
                  {row.reasoning && (
                    <div className="text-xs text-muted line-clamp-2 pl-12">
                      {row.reasoning}
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
