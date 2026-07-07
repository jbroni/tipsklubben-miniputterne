import type { LeaderboardEntry } from "@/types";
import { FedtBadge } from "./FedtBadge";
import { Avatar } from "./Avatar";
import { formatDecimal } from "@/lib/fedt";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  compact?: boolean;
}

const RANK_COLORS = ["text-rank-1", "text-rank-2", "text-rank-3"];

export function LeaderboardTable({ entries, compact = false }: LeaderboardTableProps) {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.seasonFedt - b.seasonFedt;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line-card text-muted text-[10px] font-mono tracking-[1.2px] uppercase">
            <th className="py-3 px-2 text-left w-10">#</th>
            <th className="py-3 px-2 text-left">Spiller</th>
            <th className="py-3 px-2 text-right">Point</th>
            {!compact && (
              <>
                <th className="py-3 px-2 text-right">Runder</th>
                <th className="py-3 px-2 text-right">Snit</th>
              </>
            )}
            <th className="py-3 px-2 text-right">Fedt</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, index) => (
            <tr
              key={entry.user.id}
              className="border-b border-line-hairline hover:bg-[#f9f6ec] transition-colors"
            >
              <td className="py-3 px-2">
                <span
                  className={`font-mono font-bold ${
                    RANK_COLORS[index] ?? "text-muted-ghost"
                  }`}
                >
                  {index + 1}
                </span>
              </td>
              <td className="py-3 px-2">
                <div className="flex items-center gap-2">
                  <Avatar
                    avatarUrl={entry.user.avatarUrl}
                    displayName={entry.user.displayName}
                    size={24}
                  />
                  <span className="font-medium text-ink">{entry.user.displayName}</span>
                </div>
              </td>
              <td className="py-3 px-2 text-right font-mono font-bold text-brand">
                {entry.totalPoints}
              </td>
              {!compact && (
                <>
                  <td className="py-3 px-2 text-right text-muted">
                    {entry.roundsPlayed}
                  </td>
                  <td className="py-3 px-2 text-right text-ink-tertiary font-mono">
                    {formatDecimal(entry.avgScore, 1)}
                  </td>
                </>
              )}
              <td className="py-3 px-2 text-right">
                <FedtBadge score={entry.seasonFedt} size="sm" showLabel={false} className="text-muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
