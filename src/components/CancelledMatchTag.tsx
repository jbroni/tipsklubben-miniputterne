import { tendensProbabilities } from "@/lib/fedt";

const TOOLTIP =
  "Kampen er aflyst. Udfaldet afgøres ved tendenslodtrækning vægtet efter odds.";

export default function CancelledMatchTag({
  odds,
  className = "",
}: {
  odds?: {
    oddsHome: number;
    oddsDraw: number;
    oddsAway: number;
    fedtHome?: number | null;
    fedtDraw?: number | null;
    fedtAway?: number | null;
  };
  className?: string;
}) {
  const chances = odds ? tendensProbabilities(odds) : null;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[9px] ${className}`}
      title={TOOLTIP}
    >
      <span className="inline-flex items-center px-1.5 py-px rounded-full bg-signal-soft text-signal font-bold uppercase">
        AFLYST · TENDENSLODTRÆKNING
      </span>
      {chances && (
        <span className="text-muted-ghost">
          1 {chances.home}% · X {chances.draw}% · 2 {chances.away}%
        </span>
      )}
    </span>
  );
}
