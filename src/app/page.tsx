import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { carryOverMissingCoupons } from "@/lib/services/carry-over";
import Link from "next/link";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import {
  PredictHero,
  SubmittedHero,
  RevealedHero,
  LockedHero,
} from "@/components/DashboardHero";
import { GroupCouponCard } from "@/components/GroupCouponCard";
import { PredictionGrid } from "@/components/PredictionGrid";
import { calcRoundFedt } from "@/lib/fedt";
import { toFedtInput } from "@/lib/leaderboard";
import { computeRoundScores } from "@/lib/round-scores";
import { getLeaderboardEntries } from "@/lib/leaderboard-data";
import { arePicksRevealed } from "@/lib/rounds";
import { settleFromPrisma } from "@/lib/group-coupon-settlement-data";
import type { Pick as PickType } from "@/types";
import { Logo } from "@/components/Logo";
import { LoginButton } from "@/components/LoginButton";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="scale-150">
          <Logo href="/" />
        </div>
        <LoginButton className="text-sm" />
      </div>
    );
  }

  // Apply carry-overs before fetching current round data
  await carryOverMissingCoupons();

  const [season, users, leaderboardEntries] = await Promise.all([
    prisma.season.findFirst({
      where: { isActive: true },
      include: {
        rounds: {
          orderBy: { roundNumber: "desc" },
          take: 1,
          include: {
            matches: {
              orderBy: { matchNumber: "asc" },
              include: {
                predictions: { select: { userId: true, pick: true, carriedFromRoundNumber: true } },
              },
            },
            groupCoupon: {
              include: {
                matches: {
                  orderBy: { match: { matchNumber: "asc" } },
                  include: { match: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany(),
    getLeaderboardEntries(),
  ]);

  const currentRound = season?.rounds[0] ?? null;

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
    currentRound.matches.every((m) => m.predictions.some((p) => p.userId === user.id));

  type Mode = "predict" | "submitted" | "revealed" | "locked" | "empty";

  let mode: Mode;
  if (!currentRound) {
    mode = "empty";
  } else if (currentRound.status === "completed") {
    mode = "revealed";
  } else if (arePicksRevealed(currentRound)) {
    mode = "locked";
  } else if (hasSubmitted) {
    mode = "submitted";
  } else {
    mode = "predict";
  }

  // Members of the season = anyone who has ever predicted, for avatar rows
  let members: { id: string; initial: string; submitted: boolean; avatarUrl?: string | null; displayName: string }[] = [];
  if (currentRound) {
    const submittedIds = new Set(
      currentRound.matches
        .flatMap((m) => m.predictions)
        .filter(
          (p, i, arr) => arr.findIndex((x) => x.userId === p.userId) === i
        )
        .filter((p) =>
          currentRound.matches.every((m) =>
            m.predictions.some((pp) => pp.userId === p.userId)
          )
        )
        .map((p) => p.userId)
    );
    members = users.map((u) => ({
      id: u.id,
      initial: u.displayName.charAt(0).toUpperCase(),
      submitted: submittedIds.has(u.id),
      avatarUrl: u.avatarUrl,
      displayName: u.displayName,
    }));
  }

  // Revealed mode: compute round scores using the imported utility
  let roundScores: Awaited<ReturnType<typeof computeRoundScores>> = [];
  if (mode === "revealed" && currentRound) {
    roundScores = computeRoundScores(
      currentRound.matches,
      users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
      }))
    );
  }

  // Submitted mode: user's own live fedt score
  let userFedt = 50;
  if (mode === "submitted" && currentRound) {
    const picks = currentRound.matches
      .filter((m) => userPredictions[m.id])
      .map((m) => ({
        match: toFedtInput(m),
        pick: userPredictions[m.id],
      }));
    userFedt = calcRoundFedt(picks);
  }

  // Compute group coupon settlement
  const settlement = currentRound && currentRound.groupCoupon
    ? settleFromPrisma(currentRound.groupCoupon, currentRound.status)
    : null;

  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      <div className="flex items-baseline justify-between px-0.5">
        <h1 className="font-display text-xl font-bold text-ink">
          Hej, {user.displayName.split(" ")[0]}
        </h1>
        {season && (
          <span className="font-mono text-[10px] text-muted border border-line-card rounded-full px-2.5 py-1 bg-surface">
            {season.name}
          </span>
        )}
      </div>

      {mode === "predict" && currentRound && (
        <PredictHero
          roundNumber={currentRound.roundNumber}
          matchCount={currentRound.matches.length}
          deadline={currentRound.deadline.toISOString()}
          members={members}
          href={`/rounds/${currentRound.id}/predict`}
        />
      )}

      {mode === "submitted" && currentRound && (
        <SubmittedHero
          roundNumber={currentRound.roundNumber}
          matchCount={currentRound.matches.length}
          deadline={currentRound.deadline.toISOString()}
          fedt={userFedt}
          members={members}
          href={`/rounds/${currentRound.id}/predict`}
        />
      )}

      {mode === "locked" && currentRound && (
        <LockedHero roundNumber={currentRound.roundNumber} />
      )}

      {mode === "revealed" && currentRound && (
        <RevealedHero
          roundNumber={currentRound.roundNumber}
          scores={roundScores}
          currentUserId={user.id}
          href={`/rounds/${currentRound.id}?from=hjem`}
        />
      )}

      {(mode === "locked" || mode === "revealed") && currentRound && (
        <>
          {currentRound.groupCoupon?.status === "final" && (
            <GroupCouponCard
              coupon={{
                systemCode: currentRound.groupCoupon.systemCode,
                matches: currentRound.groupCoupon.matches.map((m) => ({
                  id: m.id,
                  matchNumber: m.match.matchNumber,
                  homeTeam: m.match.homeTeam,
                  awayTeam: m.match.awayTeam,
                  outcomes: m.outcomes as ("HOME" | "DRAW" | "AWAY")[],
                  baseOutcome: m.baseOutcome as ("HOME" | "DRAW" | "AWAY") | null,
                  result: m.match.result as ("HOME" | "DRAW" | "AWAY") | null,
                })),
              }}
              roundNumber={currentRound.roundNumber}
              seasonName={season?.name ?? ""}
              settlement={settlement}
            />
          )}
          <PredictionGrid
            matches={currentRound.matches.map((m) => ({
              id: m.id,
              matchNumber: m.matchNumber,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              result: m.result,
              predictions: m.predictions.map((p) => ({
                userId: p.userId,
                pick: p.pick,
                carriedFromRoundNumber: p.carriedFromRoundNumber,
              })),
            }))}
            users={users}
            currentUserId={user.id}
          />
        </>
      )}

      {mode === "empty" && (
        <div className="card text-center py-8">
          <p className="font-display text-xl font-semibold text-muted">
            Ingen aktiv runde
          </p>
          <p className="text-sm text-muted mt-1">Der kommer snart en ny runde.</p>
        </div>
      )}

      {/* Season table - always show if entries exist */}
      {leaderboardEntries.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="kicker">TABELLEN</span>
            <Link href="/leaderboard" className="text-[12.5px] font-semibold text-brand">
              Se alt →
            </Link>
          </div>
          <LeaderboardTable entries={leaderboardEntries} />
        </div>
      )}
    </div>
  );
}
