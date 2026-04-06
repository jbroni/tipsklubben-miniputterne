import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import Link from "next/link";

export default async function RoundsPage() {
  await requireUser();

  const season = await prisma.season.findFirst({
    where: { isActive: true },
    include: {
      rounds: {
        orderBy: { roundNumber: "desc" },
        include: {
          matches: { orderBy: { matchNumber: "asc" } },
          _count: { select: { predictions: true } },
        },
      },
    },
  });

  if (!season) {
    return (
      <div className="text-center py-20 text-stone-400">
        No active season found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-stone-900">{season.name}</h1>

      <div className="space-y-3">
        {season.rounds.map((round) => (
          <Link
            key={round.id}
            href={
              round.status === "open"
                ? `/rounds/${round.id}/predict`
                : `/rounds/${round.id}`
            }
            className="card !p-4 flex items-center justify-between hover:border-stone-300 transition-colors block"
          >
            <div>
              <span className="font-display font-semibold text-stone-800">
                Round {round.roundNumber}
              </span>
              <span className="text-stone-400 text-sm ml-3">
                {round.matches.length > 0
                  ? `${round.matches.length} matches`
                  : "No matches yet"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-400">
                {Math.floor(round._count.predictions / 13)} submitted
              </span>
              <RoundStatusBadge status={round.status} />
            </div>
          </Link>
        ))}

        {season.rounds.length === 0 && (
          <p className="text-stone-400 text-center py-10">
            No rounds created yet.
          </p>
        )}
      </div>
    </div>
  );
}
