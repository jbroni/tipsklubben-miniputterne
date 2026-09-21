import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { computeLeaderboard } from "@/lib/leaderboard";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { formatInAppZone } from "@/lib/time";

export default async function SeasonDetailPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  await requireUser();

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
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
  });

  if (!season) notFound();

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, displayName: true, avatarUrl: true },
  });

  // Filter to only completed rounds for leaderboard computation
  const completedRounds = season.rounds.filter((r) => r.status === "completed");

  // Compute leaderboard for this season (using only completed rounds)
  const allEntries = computeLeaderboard(completedRounds, users);
  // Filter to participants (roundsPlayed > 0)
  const entries = allEntries.filter((e) => e.roundsPlayed > 0);

  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-0.5 py-3">
        <Link href="/historik" className="text-muted text-lg">
          ←
        </Link>
        <div className="flex-1">
          <h1 className="font-display font-bold text-lg text-ink">Sæson {season.name}</h1>
          <p className="text-xs text-muted mt-0.5">{season.rounds.length} runder</p>
        </div>
      </div>

      {/* Final standings */}
      {entries.length > 0 && (
        <div className="card p-3!">
          <div className="kicker mb-2.5">ENDELIG STILLING</div>
          <LeaderboardTable entries={entries} />
        </div>
      )}

      {/* Rounds list */}
      <div className="px-0.5">
        <h2 className="font-display font-bold text-base text-ink mb-2.5">RUNDER</h2>
      </div>

      <div className="space-y-2.5">
        {season.rounds.map((round) => {
          const isCompleted = round.status === "completed";
          // Only compute leaderboard for completed rounds
          const roundEntries = isCompleted
            ? computeLeaderboard([round], users).filter((e) => e.roundsPlayed > 0)
            : [];
          const winner = roundEntries.length > 0 ? roundEntries[0] : null;

          const dateStr = formatInAppZone(round.deadline, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          return (
            <Link
              key={round.id}
              href={`/rounds/${round.id}?from=historik`}
              className="card block hover:bg-[#f9f6ec] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-base text-ink">
                      Runde {round.roundNumber}
                    </span>
                    <span className="text-[10px] text-muted font-mono">{dateStr}</span>
                  </div>
                  {winner && isCompleted && (
                    <div className="text-xs text-muted mt-1.5">
                      Vinder: <span className="font-medium text-ink">{winner.user.displayName}</span>{" "}
                      · {winner.totalPoints}/13
                    </div>
                  )}
                  {!isCompleted && (
                    <div className="text-xs text-muted-faint mt-1.5">Ikke afgjort</div>
                  )}
                </div>
                <span className="text-brand">→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
