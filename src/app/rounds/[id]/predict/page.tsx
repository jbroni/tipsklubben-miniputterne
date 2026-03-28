"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

export default function PredictPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [round, setRound] = useState<RoundData | null>(null);
  const [picks, setPicks] = useState<Record<string, PickType>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/rounds/${params.id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setRound(data);
        // Load existing predictions
        const existing: Record<string, PickType> = {};
        data.matches.forEach((m: RoundData["matches"][0]) => {
          if (m.predictions.length > 0) {
            existing[m.id] = m.predictions[0].pick;
          }
        });
        setPicks(existing);
      });
  }, [params.id]);

  if (!round) {
    return (
      <div className="text-center py-20 text-gray-500">Loading round...</div>
    );
  }

  const isOpen = round.status === "open" && new Date(round.deadline) > new Date();
  const allPicked = round.matches.every((m) => picks[m.id]);

  // Calculate live Fedt score
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
      const res = await fetch(`/api/rounds/${params.id}/predictions`, {
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
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">{round.season.name}</p>
        <h1 className="font-display text-3xl font-bold">
          Round {round.roundNumber}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Deadline:{" "}
          {new Date(round.deadline).toLocaleString("da-DK", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Live Fedt preview */}
      {liveFedt !== null && (
        <div className="card !p-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Your Fedt score ({Object.keys(picks).length}/13 picked)
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
          <div className="card !p-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">
              {Object.keys(picks).length}/13 matches picked
            </span>
            <button
              onClick={handleSubmit}
              disabled={!allPicked || saving}
              className="btn-primary"
            >
              {saving
                ? "Saving..."
                : success
                ? "✓ Saved!"
                : "Submit predictions"}
            </button>
          </div>
          {error && (
            <p className="text-club-accent text-sm mt-2 text-center">{error}</p>
          )}
        </div>
      )}

      {!isOpen && (
        <div className="card !p-4 text-center text-gray-500">
          This round is no longer open for predictions.
        </div>
      )}
    </div>
  );
}
