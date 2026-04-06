import type { RoundStatus } from "@prisma/client";

const STATUS_STYLES: Record<RoundStatus, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-pitch-50", text: "text-pitch-500", label: "Open" },
  locked: { bg: "bg-amber-50", text: "text-amber-600", label: "Locked" },
  completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Completed" },
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
