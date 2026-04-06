import type { LeaderboardEntry } from "@/types";
import { FedtBadge } from "./FedtBadge";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  compact?: boolean;
}

export function LeaderboardTable({ entries, compact = false }: LeaderboardTableProps) {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.seasonFedt - b.seasonFedt;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-stone-400 text-xs uppercase tracking-wider">
            <th className="py-3 px-2 text-left w-10">#</th>
            <th className="py-3 px-2 text-left">Player</th>
            <th className="py-3 px-2 text-right">Points</th>
            {!compact && (
              <>
                <th className="py-3 px-2 text-right">Rounds</th>
                <th className="py-3 px-2 text-right">Avg</th>
              </>
            )}
            <th className="py-3 px-2 text-right">Fedt</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, index) => (
            <tr
              key={entry.user.id}
              className="border-b border-stone-100 hover:bg-stone-50 transition-colors"
            >
              <td className="py-3 px-2">
                <span
                  className={`font-mono font-bold ${
                    index === 0
                      ? "text-amber-500"
                      : index === 1
                      ? "text-stone-400"
                      : index === 2
                      ? "text-amber-700"
                      : "text-stone-300"
                  }`}
                >
                  {index + 1}
                </span>
              </td>
              <td className="py-3 px-2">
                <div className="flex items-center gap-2">
                  {entry.user.avatarUrl && (
                    <img
                      src={entry.user.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="font-medium text-stone-800">{entry.user.displayName}</span>
                </div>
              </td>
              <td className="py-3 px-2 text-right font-mono font-bold text-pitch-500">
                {entry.totalPoints}
              </td>
              {!compact && (
                <>
                  <td className="py-3 px-2 text-right text-stone-400">
                    {entry.roundsPlayed}
                  </td>
                  <td className="py-3 px-2 text-right text-stone-500 font-mono">
                    {entry.avgScore.toFixed(1)}
                  </td>
                </>
              )}
              <td className="py-3 px-2 text-right">
                <FedtBadge score={entry.seasonFedt} size="sm" showLabel={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
