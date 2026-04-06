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
    return <div className="text-center py-20 text-stone-400">Loading...</div>;
  }

  const sorted = [...entries].sort((a, b) =>
    sortBy === "boldest"
      ? a.seasonFedt - b.seasonFedt
      : b.seasonFedt - a.seasonFedt
  );

  const boldest = entries.length > 0
    ? entries.reduce((a, b) => (a.seasonFedt < b.seasonFedt ? a : b))
    : null;
  const safest = entries.length > 0
    ? entries.reduce((a, b) => (a.seasonFedt > b.seasonFedt ? a : b))
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900">
          Fedt <span className="text-amber-600">Stats</span>
        </h1>
        <p className="text-stone-500 mt-1">
          Who plays it safe and who takes the biggest risks?
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-stone-400 text-center py-10">
          No data yet. Complete some rounds first.
        </p>
      ) : (
        <>
          {/* Highlight cards */}
          <div className="grid grid-cols-2 gap-4">
            {boldest && (
              <div className="card text-center">
                <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">
                  Boldest Player
                </p>
                <p className="font-display text-lg font-bold text-coral-500">
                  {boldest.user.displayName}
                </p>
                <div className="mt-2">
                  <FedtBadge score={boldest.seasonFedt} />
                </div>
              </div>
            )}
            {safest && (
              <div className="card text-center">
                <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">
                  Safest Player
                </p>
                <p className="font-display text-lg font-bold text-blue-500">
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
                  ? "bg-coral-50 text-coral-500 border border-coral-200"
                  : "text-stone-400 hover:text-stone-600"
              }`}
            >
              Boldest first
            </button>
            <button
              onClick={() => setSortBy("safest")}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                sortBy === "safest"
                  ? "bg-blue-50 text-blue-500 border border-blue-200"
                  : "text-stone-400 hover:text-stone-600"
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
                  className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-stone-300 w-6">{i + 1}</span>
                    <div>
                      <p className="font-medium text-stone-800">{entry.user.displayName}</p>
                      <p className="text-xs text-stone-400">
                        {getFedtLabel(entry.seasonFedt)} · {entry.roundsPlayed}{" "}
                        rounds
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:block w-32 bg-stone-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${entry.seasonFedt}%`,
                          background: `linear-gradient(90deg, #f43f5e, #f59e0b 50%, #3b82f6)`,
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
              <h2 className="font-display font-semibold text-stone-800 mb-4">
                Fedt per Round
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 text-xs uppercase tracking-wider">
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
                        className="border-b border-stone-100"
                      >
                        <td className="py-3 px-2 font-medium text-stone-800">
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
