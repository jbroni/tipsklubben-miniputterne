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
    return <div className="text-center py-20 text-muted">Indlæser...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Stillingen</h1>

      {entries.length === 0 ? (
        <p className="text-muted text-center py-10">
          Ingen afgjorte runder endnu. Kig forbi igen når første runde er slut.
        </p>
      ) : (
        <div className="card">
          <LeaderboardTable entries={entries} />
        </div>
      )}

      {/* Round-by-round breakdown */}
      {entries.length > 0 && entries[0].roundScores.length > 0 && (
        <div className="card">
          <h2 className="font-display font-semibold text-ink mb-4">Runde for runde</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-card text-muted text-xs uppercase tracking-wider">
                  <th className="py-3 px-2 text-left">Spiller</th>
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
                    className="border-b border-line-hairline hover:bg-[#f9f6ec]"
                  >
                    <td className="py-3 px-2 font-medium text-ink">
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
                              ? "text-brand font-bold"
                              : r.points >= 7
                              ? "text-ink-secondary"
                              : "text-muted"
                          }
                        >
                          {r.points}
                        </span>
                      </td>
                    ))}
                    <td className="py-3 px-2 text-right font-mono font-bold text-brand">
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
