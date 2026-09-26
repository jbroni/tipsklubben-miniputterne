import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { arePicksStillOpen } from "@/lib/rounds";
import { formatInAppZone } from "@/lib/time";
import { getShortNames } from "@/lib/display-name-data";

export default async function RoundsPage() {
  const currentUser = await requireUser();

  const [season, shortNames] = await Promise.all([
    prisma.season.findFirst({
      where: { isActive: true },
      include: {
        rounds: {
          orderBy: { roundNumber: "asc" },
          include: {
            matches: {
              orderBy: { matchNumber: "asc" },
              include: { predictions: { select: { userId: true, pick: true } } },
            },
          },
        },
      },
    }),
    getShortNames(),
  ]);

  const memberCount = shortNames.size;

  if (!season) {
    return <div className="text-center py-20 text-muted">Ingen aktiv sæson fundet.</div>;
  }

  const userName = (id: string) =>
    shortNames.get(id) ?? "?";

  type Row =
    | { kind: "round"; round: (typeof season.rounds)[number] }
    | { kind: "future"; from: number; to: number };

  const rows: Row[] = [];
  for (const round of season.rounds) {
    if (round.matches.length === 0) {
      const last = rows[rows.length - 1];
      if (last?.kind === "future") {
        last.to = round.roundNumber;
      } else {
        rows.push({ kind: "future", from: round.roundNumber, to: round.roundNumber });
      }
    } else {
      rows.push({ kind: "round", round });
    }
  }
  rows.reverse();

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <h1 className="font-display font-bold text-lg text-ink">Runder</h1>
        <span className="font-mono text-[10px] text-muted border border-line-card rounded-full px-2.5 py-1 bg-surface">
          {season.name} · {season.rounds.length} runder
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          if (row.kind === "future") {
            return (
              <div
                key={`future-${row.from}`}
                className="border-[1.5px] border-dashed border-[#d9d2bf] rounded-card px-4 py-3 text-center text-sm text-muted-faint"
              >
                Runde {row.from === row.to ? row.from : `${row.from}–${row.to}`} · planlagt
              </div>
            );
          }

          const round = row.round;

          if (arePicksStillOpen(round)) {
            const submittedCount = Math.floor(
              round.matches.reduce((sum, m) => sum + m.predictions.length, 0) /
                (round.matches.length || 1)
            );
            return (
              <Link
                key={round.id}
                href={`/rounds/${round.id}/predict?from=rounds`}
                className="bg-surface border-[1.5px] border-brand rounded-card px-4 py-3.5 shadow-card flex items-center gap-3 hover:bg-[#f9f6ec] transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-base text-ink">
                      Runde {round.roundNumber}
                    </span>
                    <span className="font-mono text-[9px] font-bold text-brand bg-brand-tint rounded-full px-2">
                      ÅBEN
                    </span>
                  </div>
                  <div className="text-[13px] text-muted mt-0.5">
                    {round.matches.length} kampe · lukker{" "}
                    {formatInAppZone(round.deadline, {
                      weekday: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {submittedCount}/{memberCount} har tippet
                  </div>
                </div>
                <span className="text-brand text-lg font-bold">→</span>
              </Link>
            );
          }

          // locked or completed
          const isCompleted = round.status === "completed";
          let meta = "Afventer resultat";
          let userWon = false;

          if (isCompleted) {
            const userIds = Array.from(
              new Set(round.matches.flatMap((m) => m.predictions.map((p) => p.userId)))
            );
            const scores = userIds.map((uid) => ({
              userId: uid,
              points: round.matches.filter((m) => {
                const pred = m.predictions.find((p) => p.userId === uid);
                return pred && m.result && pred.pick === m.result;
              }).length,
            }));
            scores.sort((a, b) => b.points - a.points);
            if (scores.length > 0) {
              const winner = scores[0];
              userWon = winner.userId === currentUser.id;
              meta = `${userWon ? "Du" : userName(winner.userId)} vandt · ${
                winner.points
              }/13`;
            }
          }

          return (
            <Link
              key={round.id}
              href={`/rounds/${round.id}`}
              className="bg-surface border border-line-card rounded-card px-4 py-3.5 flex items-center gap-3 hover:bg-[#f9f6ec] transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[15px] text-ink">
                    Runde {round.roundNumber}
                  </span>
                  <span className="font-mono text-[9px] text-muted bg-line-divider rounded-full px-2">
                    {isCompleted ? "AFGJORT" : "LÅST"}
                  </span>
                </div>
                <div
                  className={`text-[13px] mt-0.5 ${
                    userWon ? "text-brand font-semibold" : "text-muted"
                  }`}
                >
                  {meta}
                </div>
              </div>
              <span className="text-muted-ghost text-base">→</span>
            </Link>
          );
        })}

        {rows.length === 0 && (
          <p className="text-muted text-center py-10">Ingen runder oprettet endnu.</p>
        )}
      </div>
    </div>
  );
}
