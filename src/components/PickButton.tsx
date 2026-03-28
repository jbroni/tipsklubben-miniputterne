"use client";

import type { Pick as PickType } from "@prisma/client";

interface PickButtonProps {
  pick: PickType;
  selected: boolean;
  odds: number;
  onClick: () => void;
  disabled?: boolean;
}

const PICK_LABELS: Record<PickType, string> = {
  HOME: "1",
  DRAW: "X",
  AWAY: "2",
};

const PICK_STYLES: Record<PickType, string> = {
  HOME: "pick-btn-home",
  DRAW: "pick-btn-draw",
  AWAY: "pick-btn-away",
};

export function PickButton({
  pick,
  selected,
  odds,
  onClick,
  disabled = false,
}: PickButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 min-w-[3.5rem] ${
        selected ? PICK_STYLES[pick] : "pick-btn-unselected"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className="text-base">{PICK_LABELS[pick]}</span>
      <span className="text-[10px] font-body font-normal opacity-70">
        {odds.toFixed(2)}
      </span>
    </button>
  );
}
