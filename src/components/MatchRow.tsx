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
    <div
      className={`bg-white border rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center gap-3 transition-colors ${
        isCorrect
          ? "border-pitch-400 bg-pitch-50"
          : isWrong
          ? "border-coral-300 bg-coral-50"
          : "border-stone-200"
      }`}
    >
      {/* Match number */}
      <span className="text-xs font-mono text-stone-400 w-6 text-center shrink-0">
        {match.matchNumber}
      </span>

      {/* Teams */}
      <div className="flex-1 text-center sm:text-left">
        <div className="text-sm font-medium text-stone-800">
          <span className={match.result === "HOME" && showResult ? "text-pitch-500" : ""}>
            {match.homeTeam}
          </span>
          <span className="text-stone-300 mx-2">vs</span>
          <span className={match.result === "AWAY" && showResult ? "text-pitch-500" : ""}>
            {match.awayTeam}
          </span>
        </div>
        <span className="text-xs text-stone-400">{match.league}</span>
      </div>

      {/* Pick buttons */}
      <div className="flex gap-2">
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

      {/* Result indicator */}
      {showResult && match.result && (
        <div className="shrink-0 w-8 text-center">
          {isCorrect ? (
            <span className="text-pitch-500 text-lg font-bold">+</span>
          ) : (
            <span className="text-coral-400 text-lg">-</span>
          )}
        </div>
      )}
    </div>
  );
}
