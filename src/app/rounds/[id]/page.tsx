import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import { FedtBadge } from "@/components/FedtBadge";
import { calcRoundFedt } from "@/lib/fedt";
import { notFound } from "next/navigation";
import type { Pick as PickType } from "@prisma/client";

const PICK_LABEL: Record<PickType, string> = {
  HOME: "1",
  DRAW: "X",
  AWAY: "2",
};

export default async function RoundDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const currentUser = await requireUser();

  const round = await prisma.round.findUnique({
    where: { id: params.id },
    include: {
      season: true,
      matches: {
        orderBy: { matchNumber: "asc" },
        include: { predictions: { include: { user: true } } },
      },
    },
  });

  if (!round) notFound();

  const users = await prisma.user.findMany();
  const usersWithPredictions = users.filter((u) =>
    round.matches.some((m) => m.predictions.some((p) => p.userId === u.id))
  );

  const userScores = usersWithPredictions.map((u) => {
    const picks = round.matches.map((m) => {
      const pred = m.predictions.find((p) => p.userId === u.id);
      return {
        match: {
          oddsHome: m.oddsHome,
          oddsDraw: m.oddsDraw,
          oddsAway: m.oddsAway,
        },
        pick: pred?.pick as PickType,
        correct: pred && m.result ? pred.pick === m.result : false,
      };
    });

    const points = picks.filter((p) => p.correct).length;
    const fedt = calcRoundFedt(
      picks.filter((p) => p.pick).map((p) => ({ match: p.match, pick: p.pick }))
    );

    return { user: u, points, fedt };
  });

  userScores.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.fedt - b.fedt;
  });

  const isRevealed = round.status !== "open";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-400">{round.season.name}</p>
          <h1 className="font-display text-3xl font-bold text-stone-900">
            Round {round.roundNumber}
          </h1>
        </div>
        <RoundStatusBadge status={round.status} />
      </div>

      {/* Scores summary */}
      {isRevealed && userScores.length > 0 && (
        <div className="card">
          <h2 className="font-display font-semibold text-stone-800 mb-4">Round Scores</h2>
          <div className="space-y-2">
            {userScores.map((us, i) => (
              <div
                key={us.user.id}
                className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono font-bold w-6 ${
                      i === 0
                        ? "text-amber-500"
                        : i === 1
                        ? "text-stone-400"
                        : "text-stone-300"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium text-stone-800">{us.user.displayName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-pitch-500">
                    {us.points}/13
                  </span>
                  <FedtBadge score={us.fedt} size="sm" showLabel={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match results grid */}
      <div className="space-y-3">
        <h2 className="font-display font-semibold text-stone-800">Matches</h2>
        {round.matches.map((match) => (
          <div key={match.id} className="card !p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-xs text-stone-400 w-5">
                {match.matchNumber}
              </span>
              <div className="flex-1">
                <span className="font-medium text-stone-800">{match.homeTeam}</span>
                <span className="text-stone-300 mx-2">vs</span>
                <span className="font-medium text-stone-800">{match.awayTeam}</span>
                <span className="text-xs text-stone-400 ml-2">
                  {match.league}
                </span>
              </div>
              {match.result && (
                <span className="font-mono font-bold text-pitch-500">
                  {PICK_LABEL[match.result]}
                </span>
              )}
            </div>

            {/* Odds */}
            <div className="flex gap-4 text-xs text-stone-400 mb-2 ml-8">
              <span>1: {Number(match.oddsHome).toFixed(2)}</span>
              <span>X: {Number(match.oddsDraw).toFixed(2)}</span>
              <span>2: {Number(match.oddsAway).toFixed(2)}</span>
            </div>

            {/* Predictions (revealed) */}
            {isRevealed && match.predictions.length > 0 && (
              <div className="flex flex-wrap gap-2 ml-8">
                {match.predictions.map((pred) => {
                  const isCorrect = match.result && pred.pick === match.result;
                  return (
                    <span
                      key={pred.id}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
                        isCorrect
                          ? "bg-pitch-50 text-pitch-500 border border-pitch-200"
                          : "bg-stone-50 text-stone-400 border border-stone-100"
                      }`}
                    >
                      <span className="font-medium">
                        {pred.user.displayName.split(" ")[0]}
                      </span>
                      <span className="font-mono">{PICK_LABEL[pred.pick]}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
