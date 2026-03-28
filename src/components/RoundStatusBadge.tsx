import type { RoundStatus } from "@prisma/client";

const STATUS_STYLES: Record<RoundStatus, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-pitch-500/15", text: "text-pitch-400", label: "Open" },
  locked: { bg: "bg-club-gold/15", text: "text-club-gold", label: "Locked" },
  completed: { bg: "bg-gray-700/30", text: "text-gray-400", label: "Completed" },
};

export function RoundStatusBadge({ status }: { status: RoundStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
        ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
