import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { computeLeaderboard } from "@/lib/leaderboard";
import { FedtBadge } from "@/components/FedtBadge";
import { withShortName } from "@/lib/display-name";
import { getShortNames } from "@/lib/display-name-data";
import type { LeaderboardEntry } from "@/types";

const RANK_COLORS = ["text-rank-1", "text-rank-2", "text-rank-3"];

export default async function HistorikPage() {
  await requireUser();

  // Get all seasons and users concurrently
  const [seasons, rawUsers, shortNames] = await Promise.all([
    prisma.season.findMany({
      orderBy: { startDate: "desc" },
      include: {
        rounds: {
          orderBy: { roundNumber: "asc" },
          include: {
            matches: {
              orderBy: { matchNumber: "asc" },
            },
            predictions: {
              include: { match: true },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      select: { id: true, displayName: true, avatarUrl: true },
    }),
    getShortNames(),
  ]);

  const users = rawUsers.map((u) => withShortName(u, shortNames));

  // Filter seasons that have at least one completed round
  const completedRoundSeasons = seasons.filter((s) =>
    s.rounds.some((r) => r.status === "completed")
  );

  if (completedRoundSeasons.length === 0) {
    return (
      <div className="max-w-lg mx-auto space-y-2.5 py-10">
        <div className="text-center text-muted">Ingen historik fundet endnu.</div>
      </div>
    );
  }

  // Build all-time leaderboard: aggregate across all seasons with ≥1 completed round
  interface AllTimeStats {
    userId: string;
    titles: number;
    totalPoints: number;
    roundsPlayed: number;
    roundWins: number;
    allRoundFedts: number[];
  }

  const allTimeStatsMap = new Map<string, AllTimeStats>();

  // Initialize all users
  for (const user of users) {
    allTimeStatsMap.set(user.id, {
      userId: user.id,
      titles: 0,
      totalPoints: 0,
      roundsPlayed: 0,
      roundWins: 0,
      allRoundFedts: [],
    });
  }

  // Precompute season leaderboards (using only completed rounds)
  const seasonLeaderboards: Array<{ season: typeof completedRoundSeasons[0]; entries: LeaderboardEntry[] }> = [];

  // Process each season with completed rounds
  for (const season of completedRoundSeasons) {
    // Filter to only completed rounds for leaderboard computation
    const completedRounds = season.rounds.filter((r) => r.status === "completed");

    // Get leaderboard for this season (using only completed rounds)
    const entries = computeLeaderboard(completedRounds, users);
    seasonLeaderboards.push({ season, entries });

    // Award title to #1 (if any entries exist and season qualifies)
    // A season qualifies for titles if: it's historic (isActive=false) OR all rounds are completed
    const allRoundsCompleted = season.rounds.every((r) => r.status === "completed");
    const awardsTitles = !season.isActive || allRoundsCompleted;

    if (awardsTitles && entries.length > 0) {
      const winner = entries[0];
      const stats = allTimeStatsMap.get(winner.user.id);
      if (stats) {
        stats.titles += 1;
      }
    }

    // Aggregate stats for all participants in this season
    for (const entry of entries) {
      const stats = allTimeStatsMap.get(entry.user.id);
      if (stats) {
        stats.totalPoints += entry.totalPoints;
        stats.roundsPlayed += entry.roundsPlayed;
        // Only aggregate fedts for rounds that were played (played: true)
        stats.allRoundFedts.push(...entry.roundScores.filter((r) => r.played).map((r) => r.fedt));
      }
    }

    // Count round wins by computing winner for each completed round once
    for (const round of completedRounds) {
      // Get users who participated in this round
      const participantUserIds = Array.from(
        new Set(round.predictions.map((p) => p.userId))
      );
      const roundUsers = users.filter((u) => participantUserIds.includes(u.id));

      if (roundUsers.length > 0) {
        // Compute leaderboard for just this round to find the winner
        const roundEntries = computeLeaderboard([round], roundUsers);
        if (roundEntries.length > 0) {
          const winner = roundEntries[0];
          const stats = allTimeStatsMap.get(winner.user.id);
          if (stats) {
            stats.roundWins += 1;
          }
        }
      }
    }
  }

  // Convert to array and filter to users with ≥1 prediction
  const allTimeLeaderboard = Array.from(allTimeStatsMap.values())
    .filter((stats) => stats.roundsPlayed > 0)
    .map((stats) => ({
      user: users.find((u) => u.id === stats.userId)!,
      titles: stats.titles,
      totalPoints: stats.totalPoints,
      roundsPlayed: stats.roundsPlayed,
      roundWins: stats.roundWins,
      avgFedt:
        stats.allRoundFedts.length > 0
          ? Math.round(
              (stats.allRoundFedts.reduce((a, b) => a + b, 0) / stats.allRoundFedts.length) * 100
            ) / 100
          : 50,
    }));

  // Sort: titles desc, then totalPoints desc
  allTimeLeaderboard.sort((a, b) => {
    if (b.titles !== a.titles) return b.titles - a.titles;
    return b.totalPoints - a.totalPoints;
  });

  // Reuse precomputed season leaderboards and filter to participants
  const seasonCards = seasonLeaderboards.map(({ season, entries }) => ({
    season,
    entries: entries.filter((e) => e.roundsPlayed > 0),
  }));

  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* All-time stats section */}
      <div className="px-0.5">
        <h1 className="font-display font-bold text-lg text-ink mb-3">ALLE TIDER</h1>
      </div>

      <div className="card">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted font-mono tracking-[1.2px] uppercase pb-2.5 border-b border-line-card px-3 py-2">
            <span className="w-8">#</span>
            <span className="flex-1">Spiller</span>
            <span className="w-12 text-right">Titler</span>
            <span className="w-12 text-right">Point</span>
            <span className="w-12 text-right">Sejre</span>
            <span className="w-12 text-right">Fedt</span>
          </div>

          {allTimeLeaderboard.map((entry, index) => (
            <div
              key={entry.user.id}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm border-b border-line-hairline last:border-0"
            >
              <span
                className={`font-mono font-bold text-xs w-8 shrink-0 ${
                  RANK_COLORS[index] ?? "text-muted-ghost"
                }`}
              >
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink truncate">{entry.user.displayName}</p>
              </div>
              <span className="font-mono font-bold text-xs w-12 text-right text-ink">
                {entry.titles}
              </span>
              <span className="font-mono font-bold text-xs w-12 text-right text-brand">
                {entry.totalPoints}
              </span>
              <span className="font-mono font-bold text-xs w-12 text-right text-ink">
                {entry.roundWins}
              </span>
              <div className="w-12 text-right">
                <FedtBadge score={entry.avgFedt} size="sm" showLabel={false} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seasons section */}
      <div className="px-0.5 mt-5">
        <h2 className="font-display font-bold text-lg text-ink mb-3">SÆSONER</h2>
      </div>

      <div className="space-y-2.5">
        {seasonCards.map(({ season, entries }) => (
          <Link
            key={season.id}
            href={`/historik/${season.id}`}
            className="card block hover:bg-[#f9f6ec] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-display font-bold text-lg text-ink">Sæson {season.name}</h3>
                <p className="text-xs text-muted">
                  {season.rounds.length} runder · {entries.length} {entries.length === 1 ? "deltager" : "deltagere"}
                </p>
              </div>
              <span className="text-brand text-lg">→</span>
            </div>

            {/* Podium */}
            {entries.length > 0 && (
              <div className="flex gap-2">
                {entries.slice(0, 3).map((entry, index) => (
                  <div
                    key={entry.user.id}
                    className={`flex-1 rounded-lg p-2.5 text-center ${
                      index === 0
                        ? "bg-rank-1/10 border border-rank-1/20"
                        : index === 1
                        ? "bg-rank-2/10 border border-rank-2/20"
                        : "bg-rank-3/10 border border-rank-3/20"
                    }`}
                  >
                    <div className="text-[10px] font-mono text-muted uppercase tracking-[0.8px] mb-1.5">
                      #{index + 1}
                    </div>
                    <div className="text-xs font-medium text-ink truncate mb-1.5">
                      {entry.user.displayName}
                    </div>
                    <div className="font-mono font-bold text-sm text-brand">
                      {entry.totalPoints}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
