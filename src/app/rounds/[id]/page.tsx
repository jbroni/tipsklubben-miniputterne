import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import { FedtBadge } from "@/components/FedtBadge";
import { GroupCouponCard } from "@/components/GroupCouponCard";
import { PredictionGrid } from "@/components/PredictionGrid";
import { calcRoundFedt } from "@/lib/fedt";
import { toFedtInput } from "@/lib/leaderboard";
import { resolveRoundBackHref } from "@/lib/back-href";
import { arePicksRevealed } from "@/lib/rounds";
import { settleFromPrisma } from "@/lib/group-coupon-settlement-data";
import { PICK_LABEL, type PickValue } from "@/lib/picks";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Pick as PickType } from "@prisma/client";

const RANK_COLORS = ["text-rank-1", "text-rank-2", "text-rank-3"];

export default async function RoundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const awaitedSearchParams = await searchParams;
  const currentUser = await requireUser();

  const round = await prisma.round.findUnique({
    where: { id },
    include: {
      season: true,
      matches: {
        orderBy: { matchNumber: "asc" },
        include: { predictions: { include: { user: true } } },
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
  });

  if (!round) notFound();

  // Map Prisma groupCoupon to serialized shape for GroupCouponCard
  const serializedGroupCoupon = round.groupCoupon
    ? {
        systemCode: round.groupCoupon.systemCode,
        matches: round.groupCoupon.matches.map((m) => ({
          id: m.id,
          matchNumber: m.match.matchNumber,
          homeTeam: m.match.homeTeam,
          awayTeam: m.match.awayTeam,
          outcomes: m.outcomes as ("HOME" | "DRAW" | "AWAY")[],
          baseOutcome: m.baseOutcome as ("HOME" | "DRAW" | "AWAY") | null,
          result: m.match.result as ("HOME" | "DRAW" | "AWAY") | null,
        })),
      }
    : null;

  // Compute group coupon settlement
  const settlement = round.groupCoupon
    ? settleFromPrisma(round.groupCoupon, round.status)
    : null;

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

  const isRevealed = arePicksRevealed(round);
  const backHref = resolveRoundBackHref(
    awaitedSearchParams.from,
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

      <PredictionGrid
        matches={round.matches.map((m) => ({
          id: m.id,
          matchNumber: m.matchNumber,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          result: m.result,
          predictions: m.predictions.map((p) => ({
            userId: p.userId,
            pick: p.pick,
          })),
        }))}
        users={usersWithPredictions}
        currentUserId={currentUser.id}
      />

      {serializedGroupCoupon && round.groupCoupon?.status === "final" && (
        <GroupCouponCard
          coupon={serializedGroupCoupon}
          roundNumber={round.roundNumber}
          seasonName={round.season.name}
          settlement={settlement}
        />
      )}
    </div>
  );
}
