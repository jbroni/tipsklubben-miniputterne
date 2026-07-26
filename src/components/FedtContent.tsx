"use client";

import { useState } from "react";
import { FedtBadge } from "@/components/FedtBadge";
import { getFedtLabel } from "@/lib/fedt";
import type { LeaderboardEntry } from "@/types";

export function FedtContent({ entries }: { entries: LeaderboardEntry[] }) {
  const [sortBy, setSortBy] = useState<"safest" | "boldest">("boldest");

  const sorted = [...entries].sort((a, b) =>
    sortBy === "boldest" ? a.seasonFedt - b.seasonFedt : b.seasonFedt - a.seasonFedt
  );

  const boldest =
    entries.length > 0 ? entries.reduce((a, b) => (a.seasonFedt < b.seasonFedt ? a : b)) : null;
  const safest =
    entries.length > 0 ? entries.reduce((a, b) => (a.seasonFedt > b.seasonFedt ? a : b)) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Fedt-statistik</h1>
        <p className="text-muted mt-1">Hvem spiller sikkert, og hvem tør mest?</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted text-center py-10">
          Ingen data endnu. Gennemfør nogle runder først.
        </p>
      ) : (
        <>
          {/* Highlight cards */}
          <div className="grid grid-cols-2 gap-4">
            {boldest && (
              <div className="card text-center">
                <p className="text-xs text-muted uppercase tracking-wider mb-2">Mindst fedtet</p>
                <p className="font-display text-lg font-bold text-signal">
                  {boldest.user.displayName}
                </p>
                <div className="mt-2">
                  <FedtBadge score={boldest.seasonFedt} variant="signal" />
                </div>
              </div>
            )}
            {safest && (
              <div className="card text-center">
                <p className="text-xs text-muted uppercase tracking-wider mb-2">Mest fedtet</p>
                <p className="font-display text-lg font-bold text-info">
                  {safest.user.displayName}
                </p>
                <div className="mt-2">
                  <FedtBadge score={safest.seasonFedt} variant="info" />
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
                  ? "bg-signal-soft text-signal border border-[#eed7d0]"
                  : "text-muted hover:text-ink"
              }`}
            >
              Mindst fedtet først
            </button>
            <button
              onClick={() => setSortBy("safest")}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                sortBy === "safest"
                  ? "bg-info-soft text-info border border-line-card"
                  : "text-muted hover:text-ink"
              }`}
            >
              Mest fedtet først
            </button>
          </div>

          {/* Fedt rankings */}
          <div className="card">
            <div className="space-y-3">
              {sorted.map((entry, i) => (
                <div
                  key={entry.user.id}
                  className="grid items-center py-3 border-b border-line-hairline last:border-0"
                  style={{ gridTemplateColumns: "24px 1fr 128px 88px" }}
                >
                  <span className="font-mono text-muted-ghost">{i + 1}</span>
                  <div>
                    <p className="font-medium text-ink">{entry.user.displayName}</p>
                    <p className="text-xs text-muted">
                      {getFedtLabel(entry.seasonFedt)} · {entry.roundsPlayed} runder
                    </p>
                  </div>
                  <div className="hidden sm:block w-32 bg-line-divider rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${entry.seasonFedt}%`,
                        background: `linear-gradient(90deg, #c23a2c, #b07c15 50%, #3a6ea5)`,
                      }}
                    />
                  </div>
                  <div className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <FedtBadge score={entry.seasonFedt} size="md" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Round-by-round Fedt */}
          {entries[0]?.roundScores.length > 0 && (
            <div className="card">
              <h2 className="font-display font-semibold text-ink mb-4">Fedt per runde</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-card text-muted text-xs uppercase tracking-wider">
                      <th className="py-3 px-2 text-left">Spiller</th>
                      {entries[0].roundScores.map((r) => (
                        <th key={r.roundNumber} className="py-3 px-2 w-20 text-center">
                          R{r.roundNumber}
                        </th>
                      ))}
                      <th className="py-3 px-2 text-right">Snit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((entry) => (
                      <tr key={entry.user.id} className="border-b border-line-hairline">
                        <td className="py-3 px-2 font-medium text-ink">
                          {entry.user.displayName}
                        </td>
                        {entry.roundScores.map((r) => (
                          <td key={r.roundNumber} className="py-3 px-2 w-20 text-center">
                            <FedtBadge score={r.fedt} size="sm" showLabel={false} />
                          </td>
                        ))}
                        <td className="py-3 px-2 text-right">
                          <FedtBadge score={entry.seasonFedt} size="sm" showLabel={false} />
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
