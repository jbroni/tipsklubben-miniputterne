import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { DashboardPredictWidget } from "@/components/DashboardPredictWidget";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { calcRoundFedt, calcSeasonFedt } from "@/lib/fedt";
import type { Pick as PickType, RoundStatus } from "@prisma/client";
import type { LeaderboardEntry, SerializedRound } from "@/types";

const PICK_LABEL: Record<PickType, string> = { HOME: "1", DRAW: "X", AWAY: "2" };
const PICK_SELECTED_CLASS: Record<PickType, string> = {
  HOME: "border-pitch-500 bg-pitch-50 text-pitch-600",
  DRAW: "border-amber-500 bg-amber-50 text-amber-700",
  AWAY: "border-coral-500 bg-coral-50 text-coral-600",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-center">
          <span className="text-pitch-500">Tips</span>{" "}
          <span className="text-amber-600">13</span>
        </h1>
        <p className="text-stone-500 text-lg text-center max-w-md">
          Weekly football predictions with friends.
        </p>
      </div>
    );
  }

  // Fetch active season with current round and all predictions
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    include: {
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        include: {
          matches: {
            orderBy: { matchNumber: "asc" },
            include: {
              predictions: { include: { user: true } },
            },
          },
        },
      },
    },
  });

  const currentRound = season?.rounds[0] ?? null;

  // Determine dashboard mode
  const now = new Date();
  const deadlinePassed = currentRound
    ? new Date(currentRound.deadline) <= now
    : false;

  const userPredictions: Record<string, PickType> = {};
  if (currentRound) {
    currentRound.matches.forEach((m) => {
      const pred = m.predictions.find((p) => p.userId === user.id);
      if (pred) userPredictions[m.id] = pred.pick;
    });
  }

  const hasSubmitted =
    !!currentRound &&
    currentRound.matches.length > 0 &&
    currentRound.matches.every((m) =>
      m.predictions.some((p) => p.userId === user.id)
    );

  type Mode = "predict" | "submitted" | "revealed" | "empty";

  let mode: Mode;
  if (!currentRound) {
    mode = "empty";
  } else if (currentRound.status !== "open" || deadlinePassed) {
    mode = "revealed";
  } else if (hasSubmitted) {
    mode = "submitted";
  } else {
    mode = "predict";
  }

  // Serialize round (Decimal → number, Date → string) for client components
  const serializedRound: SerializedRound | null = currentRound
    ? {
        id: currentRound.id,
        roundNumber: currentRound.roundNumber,
        deadline: currentRound.deadline.toISOString(),
        status: currentRound.status,
        seasonName: season!.name,
        matches: currentRound.matches.map((m) => ({
          id: m.id,
          matchNumber: m.matchNumber,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          league: m.league,
          oddsHome: Number(m.oddsHome),
          oddsDraw: Number(m.oddsDraw),
          oddsAway: Number(m.oddsAway),
          result: m.result,
          predictions: m.predictions.map((p) => ({
            userId: p.userId,
            userName: p.user.displayName,
            pick: p.pick,
          })),
        })),
      }
    : null;

  // Collect unique players who submitted for revealed mode
  const playerMap: Record<string, string> = {};
  if (currentRound) {
    currentRound.matches.forEach((m) => {
      m.predictions.forEach((p) => {
        if (!playerMap[p.userId]) {
          playerMap[p.userId] = p.user.displayName.split(" ")[0];
        }
      });
    });
  }
  const submittedPlayerIds = Object.keys(playerMap);

  // For empty mode: compute full leaderboard server-side
  let leaderboardEntries: LeaderboardEntry[] = [];
  if (mode === "empty" && season) {
    const completedRounds = await prisma.round.findMany({
      where: { seasonId: season.id, status: "completed" },
      include: {
        matches: true,
        predictions: { include: { match: true } },
      },
      orderBy: { roundNumber: "asc" },
    });

    const users = await prisma.user.findMany();

    leaderboardEntries = users.map((u) => {
      const roundScores = completedRounds.map((round) => {
        const userPreds = round.predictions.filter((p) => p.userId === u.id);
        const points = userPreds.filter(
          (p) => p.match.result && p.pick === p.match.result
        ).length;
        const fedtPicks = userPreds.map((p) => ({
          match: {
            oddsHome: p.match.oddsHome,
            oddsDraw: p.match.oddsDraw,
            oddsAway: p.match.oddsAway,
          },
          pick: p.pick as PickType,
        }));
        return {
          roundNumber: round.roundNumber,
          points,
          fedt: calcRoundFedt(fedtPicks),
          played: userPreds.length > 0,
        };
      });

      const totalPoints = roundScores.reduce((s, r) => s + r.points, 0);
      const playedRoundScores = roundScores.filter((r) => r.played);
      const roundsPlayed = playedRoundScores.length;
      const avgScore = roundsPlayed > 0 ? totalPoints / roundsPlayed : 0;
      const seasonFedt = calcSeasonFedt(playedRoundScores.map((r) => r.fedt));

      return {
        user: u,
        totalPoints,
        roundsPlayed,
        avgScore,
        seasonFedt,
        roundScores: roundScores.map(({ played: _played, ...r }) => r),
      };
    });

    leaderboardEntries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.seasonFedt - b.seasonFedt;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* ─── Main 2/3 column ─── */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-bold text-stone-900">
            Hey, {user.displayName.split(" ")[0]}
          </h1>
          {season && (
            <p className="text-sm text-stone-400">{season.name}</p>
          )}
        </div>

        {/* ── PREDICT: active round, not yet submitted ── */}
        {mode === "predict" && serializedRound && (
          <DashboardPredictWidget
            round={serializedRound}
            initialPicks={userPredictions}
          />
        )}

        {/* ── SUBMITTED: predictions in, deadline not passed ── */}
        {mode === "submitted" && serializedRound && (
          <div className="space-y-3">
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-400 uppercase tracking-wider font-mono">
                  {serializedRound.seasonName}
                </p>
                <h2 className="font-display text-xl font-bold text-stone-900 mt-0.5">
                  Round {serializedRound.roundNumber}
                </h2>
                <p className="text-sm text-stone-500 mt-1">
                  Deadline:{" "}
                  <span className="text-stone-700 font-medium">
                    {new Date(serializedRound.deadline).toLocaleString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-pitch-500 text-2xl leading-none font-bold">✓</span>
                <span className="text-sm text-pitch-500 font-medium">Submitted</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {serializedRound.matches.map((match) => {
                const pick = userPredictions[match.id];
                return (
                  <div
                    key={match.id}
                    className="bg-white border border-stone-200 rounded-xl px-4 py-3 grid grid-cols-[2rem_1fr_auto] gap-3 items-center shadow-sm"
                  >
                    <span className="font-mono text-xs text-stone-400 font-bold text-right">
                      {match.matchNumber}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">
                        {match.homeTeam}{" "}
                        <span className="text-stone-300">—</span>{" "}
                        {match.awayTeam}
                      </p>
                      <p className="text-xs text-stone-400">{match.league}</p>
                    </div>
                    <div className="flex gap-1">
                      {(["HOME", "DRAW", "AWAY"] as PickType[]).map((p, i) => {
                        const label = ["1", "X", "2"][i];
                        const isSelected = pick === p;
                        return (
                          <div
                            key={p}
                            className={`w-9 h-8 rounded-md font-mono text-sm font-bold border-2 flex items-center justify-center ${
                              isSelected
                                ? PICK_SELECTED_CLASS[p]
                                : "border-stone-200 text-stone-300"
                            }`}
                          >
                            {label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-right">
              <Link
                href={`/rounds/${serializedRound.id}/predict`}
                className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
              >
                Edit predictions →
              </Link>
            </div>
          </div>
        )}

        {/* ── REVEALED: deadline passed — show all bets ── */}
        {mode === "revealed" && serializedRound && (
          <div className="space-y-3">
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-400 uppercase tracking-wider font-mono">
                  {serializedRound.seasonName}
                </p>
                <h2 className="font-display text-xl font-bold text-stone-900 mt-0.5">
                  Round {serializedRound.roundNumber}
                </h2>
                <p className="text-sm text-stone-400 mt-1">
                  {serializedRound.status === "completed"
                    ? "Results available"
                    : "Deadline passed — bets revealed"}
                </p>
              </div>
              <RoundStatusBadge status={serializedRound.status as RoundStatus} />
            </div>

            {/* Player scores summary (completed only) */}
            {serializedRound.status === "completed" &&
              submittedPlayerIds.length > 0 && (
                <div className="card">
                  <p className="text-xs text-stone-400 uppercase tracking-wider font-mono mb-3">
                    Round scores
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {submittedPlayerIds.map((pid) => {
                      const score = serializedRound.matches.filter((m) => {
                        const pred = m.predictions.find((p) => p.userId === pid);
                        return pred && m.result && pred.pick === m.result;
                      }).length;
                      const isMe = pid === user.id;
                      return (
                        <div
                          key={pid}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                            isMe
                              ? "bg-pitch-50 border-pitch-200"
                              : "bg-stone-50 border-stone-100"
                          }`}
                        >
                          <span
                            className={`text-sm font-medium ${
                              isMe ? "text-pitch-600" : "text-stone-700"
                            }`}
                          >
                            {playerMap[pid]}
                          </span>
                          <span className="font-mono font-bold text-pitch-500">
                            {score}/13
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Full coupon grid */}
            <div className="card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50">
                      <th className="py-2.5 px-3 text-left font-mono text-xs text-stone-400 w-8">
                        #
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs text-stone-400 font-normal">
                        Match
                      </th>
                      {submittedPlayerIds.map((pid) => (
                        <th
                          key={pid}
                          className={`py-2.5 px-3 text-center text-xs font-medium whitespace-nowrap ${
                            pid === user.id ? "text-pitch-500" : "text-stone-500"
                          }`}
                        >
                          {playerMap[pid]}
                        </th>
                      ))}
                      {serializedRound.status === "completed" && (
                        <th className="py-2.5 px-3 text-center text-xs text-stone-400 font-normal">
                          Res.
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {serializedRound.matches.map((match) => (
                      <tr
                        key={match.id}
                        className="border-b border-stone-100 hover:bg-stone-50 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-xs text-stone-400">
                          {match.matchNumber}
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-xs text-stone-700 whitespace-nowrap">
                            {match.homeTeam}
                            <span className="text-stone-300 mx-1">—</span>
                            {match.awayTeam}
                          </span>
                        </td>
                        {submittedPlayerIds.map((pid) => {
                          const pred = match.predictions.find(
                            (p) => p.userId === pid
                          );
                          if (!pred) {
                            return (
                              <td
                                key={pid}
                                className="py-2 px-3 text-center font-mono text-xs text-stone-300"
                              >
                                —
                              </td>
                            );
                          }
                          const isCorrect =
                            match.result && pred.pick === match.result;
                          const isWrong =
                            match.result && pred.pick !== match.result;
                          const neutralColor =
                            pred.pick === "HOME"
                              ? "text-pitch-400"
                              : pred.pick === "DRAW"
                              ? "text-amber-400"
                              : "text-coral-400";
                          return (
                            <td
                              key={pid}
                              className={`py-2 px-3 text-center font-mono font-bold text-sm ${
                                isCorrect
                                  ? "text-pitch-500"
                                  : isWrong
                                  ? "text-stone-300"
                                  : neutralColor
                              }`}
                            >
                              {PICK_LABEL[pred.pick]}
                            </td>
                          );
                        })}
                        {serializedRound.status === "completed" && (
                          <td className="py-2 px-3 text-center font-mono font-bold text-xs text-pitch-500">
                            {match.result ? PICK_LABEL[match.result] : "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-right">
              <Link
                href={`/rounds/${serializedRound.id}`}
                className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
              >
                View details →
              </Link>
            </div>
          </div>
        )}

        {/* ── EMPTY: no active round — show full leaderboard ── */}
        {mode === "empty" && (
          <div className="space-y-4">
            <div className="card text-center py-8">
              <p className="font-display text-xl font-semibold text-stone-400">
                No active round
              </p>
              <p className="text-sm text-stone-400 mt-1">A new round is coming soon.</p>
            </div>
            {leaderboardEntries.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold text-stone-800">
                    Standings
                  </h2>
                  <Link
                    href="/leaderboard"
                    className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    Full view →
                  </Link>
                </div>
                <LeaderboardTable entries={leaderboardEntries} />
              </div>
            )}
          </div>
        )}

      </div>

      {/* ─── Sidebar 1/3 ─── */}
      <div>
        <DashboardSidebar currentUserId={user.id} />
      </div>
    </div>
  );
}
