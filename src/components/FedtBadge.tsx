import { getFedtLabel, getFedtColor } from "@/lib/fedt";

interface FedtBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function FedtBadge({ score, size = "md", showLabel = true }: FedtBadgeProps) {
  const label = getFedtLabel(score);
  const colorClass = getFedtColor(score);

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 min-w-[4rem] justify-center",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold
        bg-stone-100 border border-stone-200 ${sizeClasses[size]} ${colorClass}`}
    >
      {score}
      {showLabel && (
        <span className="font-body font-normal text-stone-400 text-xs">
          {label}
        </span>
      )}
    </span>
  );
}
