"use client";

import { useState, useEffect } from "react";
import { MatchRow } from "@/components/MatchRow";
import { FedtBadge } from "@/components/FedtBadge";
import { calcRoundFedt } from "@/lib/fedt";
import type { Match, Pick as PickType } from "@prisma/client";

interface RoundData {
  id: string;
  roundNumber: number;
  deadline: string;
  status: string;
  season: { name: string };
  matches: (Match & { predictions: { pick: PickType }[] })[];
}

interface PredictionFormProps {
  roundId: string;
  compact?: boolean;
}

export function PredictionForm({ roundId, compact = false }: PredictionFormProps) {
  const [round, setRound] = useState<RoundData | null>(null);
  const [picks, setPicks] = useState<Record<string, PickType>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/rounds/${roundId}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setRound(data);
        const existing: Record<string, PickType> = {};
        data.matches.forEach((m: RoundData["matches"][0]) => {
          if (m.predictions.length > 0) {
            existing[m.id] = m.predictions[0].pick;
          }
        });
        setPicks(existing);
      });
  }, [roundId]);

  if (!round) {
    return (
      <div className="text-center py-12 text-stone-400">Loading matches...</div>
    );
  }

  const isOpen = round.status === "open" && new Date(round.deadline) > new Date();
  const allPicked = round.matches.every((m) => picks[m.id]);

  const fedtPicks = round.matches
    .filter((m) => picks[m.id])
    .map((m) => ({
      match: {
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw,
        oddsAway: m.oddsAway,
      },
      pick: picks[m.id],
    }));
  const liveFedt = fedtPicks.length > 0 ? calcRoundFedt(fedtPicks) : null;

  const handlePick = (matchId: string, pick: PickType) => {
    if (!isOpen) return;
    setPicks((prev) => ({ ...prev, [matchId]: pick }));
    setSuccess(false);
  };

  const handleSubmit = async () => {
    if (!allPicked || saving) return;
    setSaving(true);
    setError("");

    const predictions = round.matches.map((m) => ({
      matchId: m.id,
      pick: picks[m.id],
    }));

    try {
      const res = await fetch(`/api/rounds/${roundId}/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictions }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save predictions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      {!compact && (
        <div>
          <p className="text-sm text-stone-400">{round.season.name}</p>
          <h1 className="font-display text-3xl font-bold text-stone-900">
            Round {round.roundNumber}
          </h1>
        </div>
      )}

      <p className="text-sm text-stone-500">
        Deadline:{" "}
        <span className="text-stone-700 font-medium">
          {new Date(round.deadline).toLocaleString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </p>

      {/* Live Fedt preview */}
      {liveFedt !== null && (
        <div className="flex items-center justify-between bg-stone-50 rounded-lg px-4 py-3 border border-stone-100">
          <span className="text-sm text-stone-500">
            Your Fedt ({Object.keys(picks).length}/13)
          </span>
          <FedtBadge score={liveFedt} />
        </div>
      )}

      {/* Matches */}
      <div className="space-y-2">
        {round.matches.map((match) => (
          <MatchRow
            key={match.id}
            match={match}
            selectedPick={picks[match.id] || null}
            onPick={handlePick}
            disabled={!isOpen}
          />
        ))}
      </div>

      {/* Submit */}
      {isOpen && (
        <div className="sticky bottom-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-stone-500">
              {Object.keys(picks).length}/13 picked
            </span>
            <button
              onClick={handleSubmit}
              disabled={!allPicked || saving}
              className="btn-primary"
            >
              {saving
                ? "Saving..."
                : success
                ? "Saved!"
                : "Submit predictions"}
            </button>
          </div>
          {error && (
            <p className="text-coral-500 text-sm mt-2 text-center">{error}</p>
          )}
        </div>
      )}

      {!isOpen && (
        <div className="text-center text-stone-400 py-4 text-sm">
          This round is no longer open for predictions.
        </div>
      )}
    </div>
  );
}
