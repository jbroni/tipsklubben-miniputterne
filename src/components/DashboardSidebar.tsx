"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FedtBadge } from "@/components/FedtBadge";
import type { LeaderboardEntry } from "@/types";

interface Props {
  currentUserId: string;
}

const RANK_COLORS = ["text-rank-1", "text-rank-2", "text-rank-3"];

function computeMovements(entries: LeaderboardEntry[]) {
  const withPrevTotal = entries.map((e) => {
    const last = e.roundScores[e.roundScores.length - 1];
    return { id: e.user.id, prevTotal: e.totalPoints - (last?.points ?? 0) };
  });
  const currRanked = [...entries]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((e) => e.user.id);
  const prevRanked = [...withPrevTotal]
    .sort((a, b) => b.prevTotal - a.prevTotal)
    .map((e) => e.id);

  const movement: Record<string, number> = {};
  const hasHistory = entries.some((e) => e.roundScores.length > 0);
  if (hasHistory) {
    for (const id of currRanked) {
      movement[id] = prevRanked.indexOf(id) - currRanked.indexOf(id);
    }
  }
  return movement;
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
      <div className="space-y-2.5">
        <div className="card h-64 animate-pulse bg-line-hairline" />
        <div className="card h-24 animate-pulse bg-line-hairline" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-muted text-sm">Ingen spillere endnu</p>
      </div>
    );
  }

  const movement = computeMovements(entries);
  const top = entries.slice(0, 4);

  const boldest = [...entries].sort((a, b) => a.seasonFedt - b.seasonFedt)[0];
  const safest = [...entries].sort((a, b) => b.seasonFedt - a.seasonFedt)[0];
  const showFedtSpotlight =
    entries.length >= 2 && boldest && safest && boldest.user.id !== safest.user.id;

  return (
    <div className="space-y-2.5">
      {/* Tabellen */}
      <div className="card">
        <div className="flex justify-between items-baseline mb-2.5">
          <span className="kicker">TABELLEN</span>
          <Link href="/leaderboard" className="text-[12.5px] font-semibold text-brand">
            Se alt →
          </Link>
        </div>
        <div className="flex flex-col gap-0.5">
          {top.map((entry, i) => {
            const isMe = entry.user.id === currentUserId;
            const mv = movement[entry.user.id];
            return (
              <div
                key={entry.user.id}
                className={`flex items-center gap-2.5 py-1.5 px-2 rounded-[10px] ${
                  isMe ? "bg-brand-tint" : ""
                }`}
              >
                <span
                  className={`font-mono font-bold text-xs w-3 text-right shrink-0 ${
                    RANK_COLORS[i] ?? "text-muted-ghost"
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  className={`flex-1 text-[14.5px] truncate ${
                    isMe ? "font-bold text-brand-text" : "font-medium text-ink"
                  }`}
                >
                  {entry.user.displayName.split(" ")[0]}
                </span>
                <span className="text-[10px] w-5 text-center shrink-0">
                  {mv === undefined || mv === 0 ? (
                    <span className="text-muted-faint">–</span>
                  ) : mv > 0 ? (
                    <span className="text-brand">▲{mv}</span>
                  ) : (
                    <span className="text-signal">▼{Math.abs(mv)}</span>
                  )}
                </span>
                <span className="font-mono font-bold text-brand text-sm shrink-0">
                  {entry.totalPoints}
                </span>
                <div className="shrink-0">
                  <FedtBadge score={entry.seasonFedt} size="sm" showLabel={false} className="text-muted" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fedt corner */}
      {showFedtSpotlight && (
        <div className="card flex gap-4">
          <div className="flex-1">
            <p className="font-mono text-[9.5px] tracking-[1.2px] text-muted uppercase">
              MINDST FEDTET
            </p>
            <div className="flex justify-between items-baseline mt-0.5">
              <span className="text-sm font-semibold text-signal">
                {boldest!.user.displayName.split(" ")[0]}
              </span>
              <FedtBadge score={boldest!.seasonFedt} size="sm" showLabel={false} variant="signal" />
            </div>
          </div>
          <div className="w-px bg-line-card" />
          <div className="flex-1">
            <p className="font-mono text-[9.5px] tracking-[1.2px] text-muted uppercase">
              MEST FEDTET
            </p>
            <div className="flex justify-between items-baseline mt-0.5">
              <span className="text-sm font-semibold text-info">
                {safest!.user.displayName.split(" ")[0]}
              </span>
              <FedtBadge score={safest!.seasonFedt} size="sm" showLabel={false} variant="info" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
