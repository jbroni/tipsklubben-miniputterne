"use client";

import type { Match, Pick as PickType } from "@prisma/client";
import { PickButton } from "./PickButton";

interface MatchRowProps {
  match: Match;
  selectedPick: PickType | null;
  onPick: (matchId: string, pick: PickType) => void;
  disabled?: boolean;
  showResult?: boolean;
}

export function MatchRow({
  match,
  selectedPick,
  onPick,
  disabled = false,
  showResult = false,
}: MatchRowProps) {
  const isCorrect = showResult && match.result && selectedPick === match.result;
  const isWrong = showResult && match.result && selectedPick && selectedPick !== match.result;

  return (
    <div className="grid grid-cols-[20px_1fr_44px_44px_44px] gap-1.5 items-center py-1.5 border-t border-line-divider first:border-t-0">
      <span className="font-mono text-[11px] text-muted-faint text-right">
        {match.matchNumber}
      </span>

      <div>
        <div className="text-[13.5px] font-medium leading-tight text-ink">
          {match.homeTeam} – {match.awayTeam}
        </div>
        <div className="font-mono text-[9px] text-muted-ghost mt-px flex items-center gap-1">
          {match.league}
          {showResult && match.result && (
            <span
              className={`ml-1 font-bold ${
                isCorrect ? "text-brand" : isWrong ? "text-muted-ghost" : ""
              }`}
            >
              {isCorrect ? "korrekt" : isWrong ? "forkert" : ""}
            </span>
          )}
        </div>
      </div>

      {(["HOME", "DRAW", "AWAY"] as PickType[]).map((pick) => (
        <PickButton
          key={pick}
          pick={pick}
          selected={selectedPick === pick}
          odds={Number(
            pick === "HOME"
              ? match.oddsHome
              : pick === "DRAW"
              ? match.oddsDraw
              : match.oddsAway
          )}
          onClick={() => onPick(match.id, pick)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
