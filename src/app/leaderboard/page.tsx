"use client";

import { useState, useEffect } from "react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import type { LeaderboardEntry } from "@/types";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(({ data }) => {
        setEntries(data ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-stone-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-stone-900">Leaderboard</h1>

      {entries.length === 0 ? (
        <p className="text-stone-400 text-center py-10">
          No completed rounds yet. Check back after the first round finishes.
        </p>
      ) : (
        <div className="card">
          <LeaderboardTable entries={entries} />
        </div>
      )}

      {/* Round-by-round breakdown */}
      {entries.length > 0 && entries[0].roundScores.length > 0 && (
        <div className="card">
          <h2 className="font-display font-semibold text-stone-800 mb-4">Round by Round</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-2 text-left">Player</th>
                  {entries[0].roundScores.map((r) => (
                    <th key={r.roundNumber} className="py-3 px-2 text-center">
                      R{r.roundNumber}
                    </th>
                  ))}
                  <th className="py-3 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.user.id}
                    className="border-b border-stone-100 hover:bg-stone-50"
                  >
                    <td className="py-3 px-2 font-medium text-stone-800">
                      {entry.user.displayName}
                    </td>
                    {entry.roundScores.map((r) => (
                      <td
                        key={r.roundNumber}
                        className="py-3 px-2 text-center font-mono text-xs"
                      >
                        <span
                          className={
                            r.points >= 10
                              ? "text-pitch-500 font-bold"
                              : r.points >= 7
                              ? "text-stone-700"
                              : "text-stone-400"
                          }
                        >
                          {r.points}
                        </span>
                      </td>
                    ))}
                    <td className="py-3 px-2 text-right font-mono font-bold text-pitch-500">
                      {entry.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
