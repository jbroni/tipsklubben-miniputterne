import { formatDecimal, getFedtLabel } from "@/lib/fedt";

interface FedtBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  variant?: "neutral" | "signal" | "info";
  className?: string;
}

const PILL_VARIANT_STYLES = {
  signal: "border-[#eed7d0] text-signal bg-signal-soft",
  info: "border-line-card text-info bg-info-soft",
};

const PILL_SIZE_CLASSES = {
  sm: "text-[10px] px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
  lg: "text-sm px-3 py-1.5",
};

const TEXT_SIZE_CLASSES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function FedtBadge({
  score,
  size = "md",
  showLabel = true,
  variant = "neutral",
  className,
}: FedtBadgeProps) {
  const label = getFedtLabel(score);
  const value = formatDecimal(score, 1);

  if (variant === "neutral") {
    return (
      <span className={`font-mono font-bold ${TEXT_SIZE_CLASSES[size]} ${className ?? "text-ink"}`}>
        {value}
        {showLabel && (
          <span className="font-body font-normal text-muted-faint ml-1.5">{label}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold border
        ${PILL_SIZE_CLASSES[size]} ${PILL_VARIANT_STYLES[variant]}`}
    >
      {value}
      {showLabel && (
        <span className="font-body font-normal text-muted-faint">{label}</span>
      )}
    </span>
  );
}
