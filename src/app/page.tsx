import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import {
  PredictHero,
  SubmittedHero,
  RevealedHero,
  LockedHero,
} from "@/components/DashboardHero";
import { calcRoundFedt } from "@/lib/fedt";
import { computeLeaderboard, toFedtInput } from "@/lib/leaderboard";
import type { Pick as PickType, LeaderboardEntry } from "@/types";
import { Logo } from "@/components/Logo";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="scale-150">
          <Logo href="/" />
        </div>
        <p className="text-muted text-lg text-center max-w-md">
          Ugentlig fodboldtipning for venner.
        </p>
      </div>
    );
  }

  const season = await prisma.season.findFirst({
    where: { isActive: true },
    include: {
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 2,
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
  const previousRound = season?.rounds[1] ?? null;

  const now = new Date();
  const deadlinePassed = currentRound ? new Date(currentRound.deadline) <= now : false;

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
  } else if (currentRound.status === "locked" || deadlinePassed) {
    mode = "locked";
  } else if (hasSubmitted) {
    mode = "submitted";
  } else {
    mode = "predict";
  }

  // Members of the season = anyone who has ever predicted, for avatar rows
  let members: { id: string; initial: string; submitted: boolean }[] = [];
  if (currentRound) {
    const allUsers = await prisma.user.findMany();
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
    members = allUsers.map((u) => ({
      id: u.id,
      initial: u.displayName.charAt(0).toUpperCase(),
      submitted: submittedIds.has(u.id),
    }));
  }

  // Round recap (previous completed round)
  let recap: {
    roundNumber: number;
    winnerName: string;
    winnerScore: number;
    userScore: number;
    userRank: number;
    roundId: string;
  } | null = null;
  if (previousRound && previousRound.status === "completed") {
    const scores = (await prisma.user.findMany()).map((u) => {
      const points = previousRound.matches.filter((m) => {
        const pred = m.predictions.find((p) => p.userId === u.id);
        return pred && m.result && pred.pick === m.result;
      }).length;
      return { user: u, points };
    });
    scores.sort((a, b) => b.points - a.points);
    const winner = scores[0];
    const myIndex = scores.findIndex((s) => s.user.id === user.id);
    if (winner && myIndex >= 0) {
      recap = {
        roundNumber: previousRound.roundNumber,
        winnerName: winner.user.displayName.split(" ")[0],
        winnerScore: winner.points,
        userScore: scores[myIndex].points,
        userRank: myIndex + 1,
        roundId: previousRound.id,
      };
    }
  }

  // Revealed mode: winner + user's score/rank for the current (completed) round
  let revealedInfo: { winnerName: string | null; userScore: number; userRank: number } | null =
    null;
  if (mode === "revealed" && currentRound) {
    const scores = (await prisma.user.findMany()).map((u) => {
      const points = currentRound.matches.filter((m) => {
        const pred = m.predictions.find((p) => p.userId === u.id);
        return pred && m.result && pred.pick === m.result;
      }).length;
      return { user: u, points };
    });
    scores.sort((a, b) => b.points - a.points);
    const myIndex = scores.findIndex((s) => s.user.id === user.id);
    revealedInfo = {
      winnerName: scores[0]?.user.displayName.split(" ")[0] ?? null,
      userScore: myIndex >= 0 ? scores[myIndex].points : 0,
      userRank: myIndex + 1,
    };
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

  // Empty mode: full season leaderboard
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

    leaderboardEntries = computeLeaderboard(completedRounds, users);
  }

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

      {mode === "revealed" && currentRound && revealedInfo && (
        <RevealedHero
          roundNumber={currentRound.roundNumber}
          winnerName={revealedInfo.winnerName}
          userScore={revealedInfo.userScore}
          userRank={revealedInfo.userRank}
          href={`/rounds/${currentRound.id}`}
        />
      )}

      {mode === "empty" && (
        <div className="card text-center py-8">
          <p className="font-display text-xl font-semibold text-muted">
            Ingen aktiv runde
          </p>
          <p className="text-sm text-muted mt-1">Der kommer snart en ny runde.</p>
        </div>
      )}

      {recap && (
        <div className="card">
          <div className="kicker mb-2.5">
            RUNDE {recap.roundNumber} · AFGJORT
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[15px] font-semibold text-ink">
              {recap.winnerName} vandt runden
            </span>
            <span className="font-mono font-bold text-brand text-[15px]">
              {recap.winnerScore}/13
            </span>
          </div>
          <div className="flex justify-between items-baseline mt-1 text-muted">
            <span className="text-sm">Du blev nr. {recap.userRank}</span>
            <span className="font-mono font-medium text-sm">{recap.userScore}/13</span>
          </div>
          <Link
            href={`/rounds/${recap.roundId}`}
            className="text-[13.5px] font-semibold text-brand mt-2.5 inline-block"
          >
            Se resultat →
          </Link>
        </div>
      )}

      {mode === "empty" && leaderboardEntries.length > 0 ? (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="kicker">TABELLEN</span>
            <Link href="/leaderboard" className="text-[12.5px] font-semibold text-brand">
              Se alt →
            </Link>
          </div>
          <LeaderboardTable entries={leaderboardEntries} />
        </div>
      ) : (
        <DashboardSidebar currentUserId={user.id} />
      )}
    </div>
  );
}
