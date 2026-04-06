"use client";

import { useState, useEffect } from "react";
import { FedtBadge } from "@/components/FedtBadge";
import type { LeaderboardEntry } from "@/types";

interface Props {
  currentUserId: string;
}

export function DashboardSidebar({ currentUserId }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(({ data }) => setEntries(data ?? []));
  }, []);

  if (!entries) {
    return (
      <div className="space-y-4">
        <div className="card h-64 animate-pulse bg-stone-100" />
        <div className="card h-28 animate-pulse bg-stone-100" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-stone-400 text-sm">No players yet</p>
      </div>
    );
  }

  const boldest = [...entries].sort((a, b) => a.seasonFedt - b.seasonFedt)[0];
  const safest = [...entries].sort((a, b) => b.seasonFedt - a.seasonFedt)[0];
  const showFedtSpotlight =
    entries.length >= 2 &&
    boldest &&
    safest &&
    boldest.user.id !== safest.user.id;

  return (
    <div className="space-y-4">
      {/* Compact leaderboard */}
      <div className="card">
        <h2 className="font-display text-xs uppercase tracking-wider text-stone-400 font-semibold mb-3">
          Standings
        </h2>
        <div className="space-y-0.5">
          {entries.map((entry, i) => {
            const isMe = entry.user.id === currentUserId;
            const rankColor =
              i === 0
                ? "text-amber-500"
                : i === 1
                ? "text-stone-400"
                : i === 2
                ? "text-amber-700"
                : "text-stone-300";

            return (
              <div
                key={entry.user.id}
                className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${
                  isMe
                    ? "bg-pitch-50 border border-pitch-100"
                    : "hover:bg-stone-50"
                }`}
              >
                <span
                  className={`font-mono font-bold text-xs w-4 text-right shrink-0 ${rankColor}`}
                >
                  {i + 1}
                </span>
                {entry.user.avatarUrl && (
                  <img
                    src={entry.user.avatarUrl}
                    alt=""
                    className="w-5 h-5 rounded-full shrink-0"
                  />
                )}
                <span
                  className={`flex-1 text-sm truncate ${
                    isMe ? "font-semibold text-pitch-600" : "text-stone-700"
                  }`}
                >
                  {entry.user.displayName.split(" ")[0]}
                </span>
                <span className="font-mono font-bold text-pitch-500 text-sm shrink-0">
                  {entry.totalPoints}
                </span>
                <div className="shrink-0">
                  <FedtBadge score={entry.seasonFedt} size="sm" showLabel={false} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fedt spotlight */}
      {showFedtSpotlight && (
        <div className="card">
          <h2 className="font-display text-xs uppercase tracking-wider text-stone-400 font-semibold mb-3">
            Fedt Spotlight
          </h2>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-0.5">
                  Boldest
                </p>
                <p className="text-sm font-medium text-coral-500">
                  {boldest!.user.displayName.split(" ")[0]}
                </p>
              </div>
              <FedtBadge score={boldest!.seasonFedt} size="sm" />
            </div>
            <div className="h-px bg-stone-100" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-0.5">
                  Safest
                </p>
                <p className="text-sm font-medium text-blue-500">
                  {safest!.user.displayName.split(" ")[0]}
                </p>
              </div>
              <FedtBadge score={safest!.seasonFedt} size="sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
