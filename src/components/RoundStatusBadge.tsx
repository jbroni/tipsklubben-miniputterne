import type { RoundStatus } from "@prisma/client";

const STATUS_STYLES: Record<RoundStatus, { className: string; label: string }> = {
  open: {
    className: "bg-brand-tint text-brand font-bold",
    label: "ÅBEN",
  },
  locked: {
    className: "bg-signal-soft text-signal font-bold",
    label: "LÅST",
  },
  completed: {
    className: "bg-line-divider text-muted",
    label: "AFGJORT",
  },
};

export function RoundStatusBadge({ status }: { status: RoundStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-[10px] ${style.className}`}
    >
      {style.label}
    </span>
  );
}
