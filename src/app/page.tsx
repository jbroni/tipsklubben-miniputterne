import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-center">
          <span className="text-pitch-400">Tips</span>{" "}
          <span className="text-club-gold">13</span>
        </h1>
        <p className="text-gray-400 text-lg text-center max-w-md">
          Weekly football prediction game for friends. Sign in with Google to
          get started.
        </p>
      </div>
    );
  }

  // Get active season
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    include: {
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 3,
        include: {
          matches: { orderBy: { matchNumber: "asc" } },
          _count: { select: { predictions: true } },
        },
      },
    },
  });

  // Get current/latest round
  const currentRound = season?.rounds[0];

  // Check if user has submitted predictions for current round
  let hasSubmitted = false;
  if (currentRound) {
    const predCount = await prisma.prediction.count({
      where: { roundId: currentRound.id, userId: user.id },
    });
    hasSubmitted = predCount === 13;
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-display text-3xl font-bold">
          Hej, {user.displayName.split(" ")[0]}!
        </h1>
        <p className="text-gray-500 mt-1">
          {season ? season.name : "No active season"}
        </p>
      </div>

      {/* Current round card */}
      {currentRound && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">
              Round {currentRound.roundNumber}
            </h2>
            <RoundStatusBadge status={currentRound.status} />
          </div>

          {currentRound.status === "open" && (
            <>
              <p className="text-gray-400 text-sm">
                Deadline:{" "}
                <span className="text-gray-200">
                  {new Date(currentRound.deadline).toLocaleString("da-DK", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </p>

              {hasSubmitted ? (
                <div className="flex items-center gap-2 text-pitch-400">
                  <span>✓</span>
                  <span className="text-sm">Predictions submitted</span>
                </div>
              ) : (
                <Link
                  href={`/rounds/${currentRound.id}/predict`}
                  className="btn-primary inline-block text-center"
                >
                  Submit predictions →
                </Link>
              )}
            </>
          )}

          {currentRound.status === "completed" && (
            <Link
              href={`/rounds/${currentRound.id}`}
              className="btn-secondary inline-block text-center"
            >
              View results →
            </Link>
          )}

          {currentRound.matches.length > 0 && (
            <div className="text-sm text-gray-500">
              {currentRound.matches.length} matches ·{" "}
              {currentRound._count.predictions / 13} members submitted
            </div>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/leaderboard" className="card hover:border-gray-700 transition-colors">
          <h3 className="font-display font-semibold text-pitch-400">Leaderboard</h3>
          <p className="text-xs text-gray-500 mt-1">Season standings</p>
        </Link>
        <Link href="/fedt" className="card hover:border-gray-700 transition-colors">
          <h3 className="font-display font-semibold text-club-gold">Fedt Stats</h3>
          <p className="text-xs text-gray-500 mt-1">Bold vs safe</p>
        </Link>
        <Link href="/rounds" className="card hover:border-gray-700 transition-colors">
          <h3 className="font-display font-semibold">All Rounds</h3>
          <p className="text-xs text-gray-500 mt-1">History & results</p>
        </Link>
        <Link href="/profile" className="card hover:border-gray-700 transition-colors">
          <h3 className="font-display font-semibold">My Profile</h3>
          <p className="text-xs text-gray-500 mt-1">Stats & history</p>
        </Link>
      </div>

      {/* Admin link */}
      {user.role === "admin" && (
        <Link
          href="/admin"
          className="card !border-club-accent/20 hover:!border-club-accent/40 transition-colors block"
        >
          <h3 className="font-display font-semibold text-club-accent">Admin Panel</h3>
          <p className="text-xs text-gray-500 mt-1">
            Manage rounds, matches, and members
          </p>
        </Link>
      )}
    </div>
  );
}
