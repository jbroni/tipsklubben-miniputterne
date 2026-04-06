"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { calcRoundFedt } from "@/lib/fedt";
import { FedtBadge } from "@/components/FedtBadge";
import { PickButton } from "@/components/PickButton";
import type { Pick as PickType } from "@prisma/client";
import type { SerializedRound } from "@/types";

interface Props {
  round: SerializedRound;
  initialPicks: Record<string, PickType>;
}

export function DashboardPredictWidget({ round, initialPicks }: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, PickType>>(initialPicks);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const deadline = new Date(round.deadline);
  const isOpen = new Date() < deadline;
  const pickedCount = Object.keys(picks).length;
  const allPicked = pickedCount === round.matches.length;

  const fedtPicks = round.matches
    .filter((m) => picks[m.id])
    .map((m) => ({
      match: { oddsHome: m.oddsHome, oddsDraw: m.oddsDraw, oddsAway: m.oddsAway },
      pick: picks[m.id],
    }));
  const liveFedt = fedtPicks.length > 0 ? calcRoundFedt(fedtPicks) : null;

  const handlePick = (matchId: string, pick: PickType) => {
    if (!isOpen) return;
    setPicks((prev) => ({ ...prev, [matchId]: pick }));
    setSaved(false);
  };

  const handleSubmit = async () => {
    if (!allPicked || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/rounds/${round.id}/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          predictions: round.matches.map((m) => ({
            matchId: m.id,
            pick: picks[m.id],
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Round header */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-400 uppercase tracking-wider font-mono">
            {round.seasonName}
          </p>
          <h2 className="font-display text-xl font-bold text-stone-900 mt-0.5">
            Round {round.roundNumber}
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            Deadline:{" "}
            <span className="text-stone-700 font-medium">
              {deadline.toLocaleString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
        </div>
        {liveFedt !== null ? (
          <FedtBadge score={liveFedt} size="lg" />
        ) : (
          <div className="text-right">
            <p className="font-mono text-2xl font-bold text-stone-300">
              {pickedCount}
              <span className="text-sm">/13</span>
            </p>
            <p className="text-xs text-stone-400">picked</p>
          </div>
        )}
      </div>

      {/* Match rows */}
      <div className="space-y-1.5">
        {round.matches.map((match) => (
          <div
            key={match.id}
            className="bg-white border border-stone-200 rounded-xl px-4 py-3 grid grid-cols-[2rem_1fr_auto] gap-3 items-center shadow-sm"
          >
            <span className="font-mono text-xs text-stone-400 font-bold text-right">
              {match.matchNumber}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800 leading-tight truncate">
                {match.homeTeam}{" "}
                <span className="text-stone-300">—</span>{" "}
                {match.awayTeam}
              </p>
              <p className="text-xs text-stone-400">{match.league}</p>
            </div>
            <div className="flex gap-1">
              {(["HOME", "DRAW", "AWAY"] as PickType[]).map((pick) => (
                <PickButton
                  key={pick}
                  pick={pick}
                  selected={picks[match.id] === pick}
                  odds={
                    pick === "HOME"
                      ? match.oddsHome
                      : pick === "DRAW"
                      ? match.oddsDraw
                      : match.oddsAway
                  }
                  onClick={() => handlePick(match.id, pick)}
                  disabled={!isOpen}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Submit bar */}
      <div className="sticky bottom-4">
        <div className="bg-white rounded-xl border border-stone-200 shadow-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-0.5">
              {round.matches.map((m) => (
                <div
                  key={m.id}
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
                    picks[m.id] ? "bg-pitch-500" : "bg-stone-200"
                  }`}
                />
              ))}
            </div>
            <span className="font-mono text-sm text-stone-500">
              {pickedCount}/13
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!allPicked || saving}
            className="btn-primary !text-sm !py-2 !px-4"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Submit predictions"}
          </button>
        </div>
        {error && (
          <p className="text-coral-500 text-xs mt-1 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
