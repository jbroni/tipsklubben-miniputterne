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
      <div className="text-center py-20 text-gray-500">
        No active season found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">{season.name}</h1>

      <div className="space-y-3">
        {season.rounds.map((round) => (
          <Link
            key={round.id}
            href={
              round.status === "open"
                ? `/rounds/${round.id}/predict`
                : `/rounds/${round.id}`
            }
            className="card !p-4 flex items-center justify-between hover:border-gray-700 transition-colors block"
          >
            <div>
              <span className="font-display font-semibold">
                Round {round.roundNumber}
              </span>
              <span className="text-gray-500 text-sm ml-3">
                {round.matches.length > 0
                  ? `${round.matches.length} matches`
                  : "No matches yet"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600">
                {Math.floor(round._count.predictions / 13)} submitted
              </span>
              <RoundStatusBadge status={round.status} />
            </div>
          </Link>
        ))}

        {season.rounds.length === 0 && (
          <p className="text-gray-500 text-center py-10">
            No rounds created yet.
          </p>
        )}
      </div>
    </div>
  );
}
