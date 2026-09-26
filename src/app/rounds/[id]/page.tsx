import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { RoundStatusBadge } from "@/components/RoundStatusBadge";
import { GroupCouponCard } from "@/components/GroupCouponCard";
import { PredictionGrid } from "@/components/PredictionGrid";
import { RoundScoreboard } from "@/components/RoundScoreboard";
import { resolveRoundBackHref } from "@/lib/back-href";
import { arePicksRevealed } from "@/lib/rounds";
import { settleFromPrisma } from "@/lib/group-coupon-settlement-data";
import { computeRoundScores } from "@/lib/round-scores";
import { carryOverMissingCoupons } from "@/lib/services/carry-over";
import { withShortName } from "@/lib/display-name";
import { getShortNames } from "@/lib/display-name-data";
import { notFound } from "next/navigation";
import Link from "next/link";

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

  // Apply carry-overs before loading the round
  await carryOverMissingCoupons();

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

  const [rawUsers, shortNames] = await Promise.all([
    prisma.user.findMany(),
    getShortNames(),
  ]);

  const users = rawUsers.map((u) => withShortName(u, shortNames));

  const usersWithPredictions = users.filter((u) =>
    round.matches.some((m) => m.predictions.some((p) => p.userId === u.id))
  );

  const userScores = computeRoundScores(round.matches, users);

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
          <RoundScoreboard scores={userScores} currentUserId={currentUser.id} kicker="RUNDENS SCORER" />
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
            carriedFromRoundNumber: p.carriedFromRoundNumber,
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
