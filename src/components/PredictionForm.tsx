"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MatchRow } from "@/components/MatchRow";
import { calcRoundFedt, getFedtLabel } from "@/lib/fedt";
import { arePicksStillOpen } from "@/lib/rounds";
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
  backHref?: string;
}

function draftKey(roundId: string) {
  return `tips13-draft-${roundId}`;
}

export function PredictionForm({
  roundId,
  compact = false,
  backHref = "/",
}: PredictionFormProps) {
  const router = useRouter();
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
        if (Object.keys(existing).length === 0) {
          try {
            const draft = localStorage.getItem(draftKey(roundId));
            if (draft) Object.assign(existing, JSON.parse(draft));
          } catch {
            // ignore malformed draft
          }
        }
        setPicks(existing);
      });
  }, [roundId]);

  if (!round) {
    return <div className="text-center py-12 text-muted">Indlæser kampe...</div>;
  }

  const isOpen = arePicksStillOpen(round);
  const allPicked = round.matches.every((m) => picks[m.id]);
  const pickedCount = Object.keys(picks).length;

  const fedtPicks = round.matches
    .filter((m) => picks[m.id])
    .map((m) => ({
      match: {
        oddsHome: m.oddsHome,
        oddsDraw: m.oddsDraw,
        oddsAway: m.oddsAway,
        fedtHome: m.fedtHome,
        fedtDraw: m.fedtDraw,
        fedtAway: m.fedtAway,
      },
      pick: picks[m.id],
    }));
  const liveFedt = fedtPicks.length > 0 ? calcRoundFedt(fedtPicks) : 0;

  const handlePick = (matchId: string, pick: PickType) => {
    if (!isOpen) return;
    setPicks((prev) => {
      const next = { ...prev };
      if (next[matchId] === pick) {
        delete next[matchId];
      } else {
        next[matchId] = pick;
      }
      try {
        localStorage.setItem(draftKey(roundId), JSON.stringify(next));
      } catch {
        // storage unavailable — draft simply won't persist
      }
      return next;
    });
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
      if (!res.ok) throw new Error(data.error || "Kunne ikke gemme");
      setSuccess(true);
      try {
        localStorage.removeItem(draftKey(roundId));
      } catch {
        // ignore
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme dine tips");
    } finally {
      setSaving(false);
    }
  };

  const deadlineDate = new Date(round.deadline);
  const dayLabel = deadlineDate
    .toLocaleDateString("da-DK", { weekday: "short" })
    .toUpperCase()
    .replace(".", "");
  const timeLabel = deadlineDate.toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="max-w-lg mx-auto pb-28">
      {!compact && (
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div className="flex items-center gap-2.5">
            <Link href={backHref} className="text-muted text-lg">
              ←
            </Link>
            <span className="font-display font-bold text-lg text-ink">
              Kupon · Runde {round.roundNumber}
            </span>
          </div>
          <span className="font-mono text-[11px] font-bold text-brand bg-brand-tint rounded-full px-2.5 py-1">
            {pickedCount}/13
          </span>
        </div>
      )}

      <div className="bg-surface-coupon border border-line-card rounded-t-card rounded-b-none px-3.5 pt-3.5 pb-1">
        <div className="flex justify-between items-baseline pb-2 border-b-2 border-dashed border-line-tear">
          <span className="kicker">
            {round.season.name.toUpperCase()} · TIPS 13 {dayLabel}
          </span>
          <span className="font-mono text-[10px] font-bold text-signal">
            {dayLabel} {timeLabel}
          </span>
        </div>
        <div className="grid grid-cols-[20px_1fr_44px_44px_44px] gap-1.5 pt-2 pb-1 font-mono text-[9.5px] text-muted-faint text-center">
          <span />
          <span className="text-left">KAMP</span>
          <span>1</span>
          <span>X</span>
          <span>2</span>
        </div>

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

      {isOpen ? (
        <div className={compact ? "mt-3" : "fixed bottom-0 left-0 right-0 z-40 px-4 pb-4"}>
          <div
            className={
              (compact
                ? ""
                : "max-w-lg mx-auto ") +
              "bg-surface border border-line-card border-t-2 border-t-dashed border-t-line-tear rounded-b-card shadow-submit-bar px-3.5 py-3 flex items-center gap-3.5"
            }
          >
            <div className="flex-1">
              <div className="flex justify-between items-baseline">
                <span className="font-mono text-[9.5px] tracking-[1.2px] text-muted">
                  FEDT-METER
                </span>
                <span className="font-mono text-xs font-bold text-ink">
                  {Math.round(liveFedt)}{" "}
                  <span className="font-normal text-muted text-[10px]">
                    {getFedtLabel(liveFedt)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 bg-line-divider rounded-full mt-1.5 relative">
                <span
                  className="absolute left-0 top-0 bottom-0 rounded-full"
                  style={{
                    width: `${liveFedt}%`,
                    background: "linear-gradient(90deg,#c23a2c,#b07c15)",
                  }}
                />
                <span
                  className="absolute -top-[3px] w-[2px] h-3 bg-ink rounded-sm"
                  style={{ left: `${liveFedt}%` }}
                />
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!allPicked || saving}
              className="btn-primary whitespace-nowrap !py-3 !px-4.5"
            >
              {saving ? "Gemmer..." : success ? "Gemt!" : "Indlevér"}
            </button>
          </div>
          {error && <p className="text-signal text-xs mt-1.5 text-center">{error}</p>}
        </div>
      ) : (
        <div className="text-center text-muted py-4 text-sm border border-t-0 border-line-card rounded-b-card bg-surface">
          Runden er ikke længere åben for tips.
        </div>
      )}
    </div>
  );
}
