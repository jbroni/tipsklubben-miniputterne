import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import { FedtBadge } from "@/components/FedtBadge";
import { calcRoundFedt } from "@/lib/fedt";
import { toFedtInput } from "@/lib/leaderboard";
import { resolveRoundBackHref } from "@/lib/back-href";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Pick as PickType } from "@prisma/client";

const PICK_LABEL: Record<PickType, string> = {
  HOME: "1",
  DRAW: "X",
  AWAY: "2",
};

const RANK_COLORS = ["text-rank-1", "text-rank-2", "text-rank-3"];

export default async function RoundDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string | string[] };
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
        match: m,
        pick: pred?.pick as PickType,
        correct: pred && m.result ? pred.pick === m.result : false,
      };
    });

    const points = picks.filter((p) => p.correct).length;
    const fedt = calcRoundFedt(
      picks.filter((p) => p.pick).map((p) => ({ match: toFedtInput(p.match), pick: p.pick }))
    );

    return { user: u, points, fedt };
  });

  userScores.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.fedt - b.fedt;
  });

  const isRevealed = round.status !== "open";
  const gridCols = `16px 1fr repeat(${usersWithPredictions.length}, 26px) 30px`;
  const backHref = resolveRoundBackHref(
    searchParams.from,
    round.seasonId,
    round.season.isActive
  );

  return (
    <div className="max-w-lg mx-auto space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2.5">
          <Link href={backHref} className="text-muted text-lg">
            ←
          </Link>
          <span className="font-display font-bold text-lg text-ink">
            Runde {round.roundNumber} · Resultat
          </span>
        </div>
        <RoundStatusBadge status={round.status} />
      </div>

      {isRevealed && userScores.length > 0 && (
        <div className="card">
          <div className="kicker mb-2.5">RUNDENS SCORER</div>
          <div className="flex flex-col gap-1.5">
            {userScores.map((us, i) => {
              const isMe = us.user.id === currentUser.id;
              return (
                <div
                  key={us.user.id}
                  className={`flex items-center gap-2.5 ${
                    isMe ? "bg-brand-tint rounded-lg px-1 -mx-1" : ""
                  }`}
                >
                  <span
                    className={`font-mono font-bold text-xs w-3 text-right shrink-0 ${
                      RANK_COLORS[i] ?? "text-muted-ghost"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`flex-1 text-[14.5px] ${
                      isMe ? "font-bold text-brand-text" : "font-medium text-ink"
                    }`}
                  >
                    {us.user.displayName}
                  </span>
                  <FedtBadge score={us.fedt} size="sm" showLabel={false} />
                  <span className="font-mono font-bold text-brand text-sm">
                    {us.points}/13
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card !p-3 font-mono overflow-x-auto">
        <div
          className="grid gap-0.5 text-[9px] text-muted-faint text-center pb-1.5 border-b border-line-divider"
          style={{ gridTemplateColumns: gridCols }}
        >
          <span>#</span>
          <span className="text-left font-body text-[10px]">KAMP</span>
          {usersWithPredictions.map((u) => (
            <span
              key={u.id}
              className={u.id === currentUser.id ? "text-brand font-bold" : ""}
            >
              {u.displayName.slice(0, 3).toUpperCase()}
            </span>
          ))}
          <span>RES</span>
        </div>
        {round.matches.map((match) => (
          <div
            key={match.id}
            className="grid gap-0.5 items-center text-center py-1.5 border-b border-line-hairline last:border-0"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span className="text-[9.5px] text-muted-ghost">{match.matchNumber}</span>
            <span className="text-left font-body text-xs text-ink-secondary whitespace-nowrap overflow-hidden text-ellipsis">
              {match.homeTeam}–{match.awayTeam}
            </span>
            {usersWithPredictions.map((u) => {
              const pred = match.predictions.find((p) => p.userId === u.id);
              if (!pred) return <span key={u.id} className="text-muted-ghost">—</span>;
              const isCorrect = match.result && pred.pick === match.result;
              return (
                <b
                  key={u.id}
                  className={`text-xs ${isCorrect ? "text-brand" : "text-muted-ghost"}`}
                >
                  {PICK_LABEL[pred.pick]}
                </b>
              );
            })}
            <span className="flex justify-center">
              {match.result ? (
                <span className="w-5 h-5 rounded-[5px] bg-result-ink text-white text-[11px] font-bold flex items-center justify-center">
                  {PICK_LABEL[match.result]}
                </span>
              ) : (
                <span className="text-muted-ghost">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
