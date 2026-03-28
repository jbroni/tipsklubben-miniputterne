"use client";

import { useState, useEffect } from "react";
import { FedtBadge } from "@/components/FedtBadge";
import { getFedtLabel } from "@/lib/fedt";
import type { LeaderboardEntry } from "@/types";

export default function FedtPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"safest" | "boldest">("boldest");

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(({ data }) => {
        setEntries(data ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>;
  }

  const sorted = [...entries].sort((a, b) =>
    sortBy === "boldest"
      ? a.seasonFedt - b.seasonFedt
      : b.seasonFedt - a.seasonFedt
  );

  // Find extremes
  const boldest = entries.length > 0
    ? entries.reduce((a, b) => (a.seasonFedt < b.seasonFedt ? a : b))
    : null;
  const safest = entries.length > 0
    ? entries.reduce((a, b) => (a.seasonFedt > b.seasonFedt ? a : b))
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">
          Fedt <span className="text-club-gold">Stats</span>
        </h1>
        <p className="text-gray-500 mt-1">
          Who plays it safe and who takes the biggest risks?
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-gray-500 text-center py-10">
          No data yet. Complete some rounds first.
        </p>
      ) : (
        <>
          {/* Highlight cards */}
          <div className="grid grid-cols-2 gap-4">
            {boldest && (
              <div className="card text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                  Boldest Player
                </p>
                <p className="font-display text-lg font-bold text-club-accent">
                  {boldest.user.displayName}
                </p>
                <div className="mt-2">
                  <FedtBadge score={boldest.seasonFedt} />
                </div>
              </div>
            )}
            {safest && (
              <div className="card text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                  Safest Player
                </p>
                <p className="font-display text-lg font-bold text-blue-400">
                  {safest.user.displayName}
                </p>
                <div className="mt-2">
                  <FedtBadge score={safest.seasonFedt} />
                </div>
              </div>
            )}
          </div>

          {/* Sort toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("boldest")}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                sortBy === "boldest"
                  ? "bg-club-accent/15 text-club-accent"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Boldest first
            </button>
            <button
              onClick={() => setSortBy("safest")}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                sortBy === "safest"
                  ? "bg-blue-500/15 text-blue-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Safest first
            </button>
          </div>

          {/* Fedt rankings */}
          <div className="card">
            <div className="space-y-3">
              {sorted.map((entry, i) => (
                <div
                  key={entry.user.id}
                  className="flex items-center justify-between py-3 border-b border-gray-800/50 last:border-0"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-gray-600 w-6">{i + 1}</span>
                    <div>
                      <p className="font-medium">{entry.user.displayName}</p>
                      <p className="text-xs text-gray-500">
                        {getFedtLabel(entry.seasonFedt)} · {entry.roundsPlayed}{" "}
                        rounds
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Fedt bar visualization */}
                    <div className="hidden sm:block w-32 bg-gray-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${entry.seasonFedt}%`,
                          background: `linear-gradient(90deg, #e94560, #d4a017 50%, #3b82f6)`,
                        }}
                      />
                    </div>
                    <FedtBadge score={entry.seasonFedt} size="md" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Round-by-round Fedt */}
          {entries[0]?.roundScores.length > 0 && (
            <div className="card">
              <h2 className="font-display font-semibold mb-4">
                Fedt per Round
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="py-3 px-2 text-left">Player</th>
                      {entries[0].roundScores.map((r) => (
                        <th
                          key={r.roundNumber}
                          className="py-3 px-2 text-center"
                        >
                          R{r.roundNumber}
                        </th>
                      ))}
                      <th className="py-3 px-2 text-right">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((entry) => (
                      <tr
                        key={entry.user.id}
                        className="border-b border-gray-800/50"
                      >
                        <td className="py-3 px-2 font-medium">
                          {entry.user.displayName}
                        </td>
                        {entry.roundScores.map((r) => (
                          <td
                            key={r.roundNumber}
                            className="py-3 px-2 text-center"
                          >
                            <FedtBadge
                              score={r.fedt}
                              size="sm"
                              showLabel={false}
                            />
                          </td>
                        ))}
                        <td className="py-3 px-2 text-right">
                          <FedtBadge
                            score={entry.seasonFedt}
                            size="sm"
                            showLabel={false}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
