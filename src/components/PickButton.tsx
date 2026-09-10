"use client";

import type { Pick as PickType } from "@prisma/client";
import { formatDecimal } from "@/lib/fedt";
import { PICK_LABEL, type PickValue } from "@/lib/picks";

interface PickButtonProps {
  pick: PickType;
  selected: boolean;
  odds: number;
  onClick: () => void;
  disabled?: boolean;
}

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
      className={`w-11 shrink-0 ${
        selected ? "pick-btn-selected" : "pick-btn-unselected"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className="text-sm">{PICK_LABEL[pick as PickValue]}</span>
      <span
        className={`text-[8.5px] font-body font-normal ${
          selected ? "opacity-75" : "text-muted-ghost"
        }`}
      >
        {formatDecimal(odds, 2)}
      </span>
    </button>
  );
}
