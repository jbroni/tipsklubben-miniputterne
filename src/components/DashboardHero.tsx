import Link from "next/link";
import { CountdownPill } from "@/components/Countdown";
import { AvatarRow } from "@/components/AvatarRow";
import { RoundScoreboard } from "@/components/RoundScoreboard";
import { formatInAppZone } from "@/lib/time";
import type { RoundScore } from "@/lib/round-scores";

interface Member {
  id: string;
  initial: string;
  submitted: boolean;
  avatarUrl?: string | null;
  displayName: string;
}

function formatDeadline(deadline: string): string {
  return formatInAppZone(deadline, {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PredictHero({
  roundNumber,
  matchCount,
  deadline,
  members,
  href,
}: {
  roundNumber: number;
  matchCount: number;
  deadline: string;
  members: Member[];
  href: string;
}) {
  const submittedCount = members.filter((m) => m.submitted).length;
  return (
    <div className="card">
      <div className="flex justify-between items-center">
        <span className="kicker">
          RUNDE {roundNumber} · {matchCount} KAMPE
        </span>
        <CountdownPill deadline={deadline} />
      </div>
      <div className="font-display font-bold text-[23px] mt-2 mb-0.5 text-ink">
        Du mangler at tippe
      </div>
      <div className="text-sm text-muted">
        Deadline {formatDeadline(deadline)}
      </div>
      <div className="my-3.5">
        <AvatarRow
          members={members}
          caption={`${submittedCount} af ${members.length} har afleveret`}
        />
      </div>
      <Link href={href} className="btn-primary w-full block text-center">
        Udfyld kuponen
      </Link>
    </div>
  );
}

export function SubmittedHero({
  roundNumber,
  matchCount,
  deadline,
  fedt,
  members,
  href,
}: {
  roundNumber: number;
  matchCount: number;
  deadline: string;
  fedt: number;
  members: Member[];
  href: string;
}) {
  const missing = members.filter((m) => !m.submitted);
  const caption =
    missing.length === 0
      ? "alle har afleveret"
      : missing.length === 1
      ? `kun ${missing[0].initial} mangler`
      : `${missing.length} mangler stadig`;

  return (
    <div className="card relative">
      <span className="absolute top-3.5 right-3.5 font-mono text-[10px] font-bold text-brand border-2 border-brand rounded-md px-2 py-0.5 rotate-[-5deg] bg-surface">
        AFLEVERET ✓
      </span>
      <span className="kicker">
        RUNDE {roundNumber} · {matchCount} KAMPE
      </span>
      <div className="font-display font-bold text-[23px] mt-2 mb-0.5 text-ink">
        Din kupon er afleveret
      </div>
      <div className="text-sm text-muted">
        Fedt <span className="font-mono font-bold text-ink">{Math.round(fedt)}</span> · du kan rette
        frem til {formatDeadline(deadline)}
      </div>
      <div className="my-3.5">
        <AvatarRow members={members} caption={caption} />
      </div>
      <Link href={href} className="btn-secondary w-full block text-center">
        Se / ret kuponen
      </Link>
    </div>
  );
}

export function RevealedHero({
  roundNumber,
  scores,
  currentUserId,
  href,
}: {
  roundNumber: number;
  scores: RoundScore[];
  currentUserId: string;
  href: string;
}) {
  const winnerName = scores[0]?.user.displayName.split(" ")[0] ?? null;
  const userScore = scores.find((s) => s.user.id === currentUserId)?.points ?? 0;
  const userRankIndex = scores.findIndex((s) => s.user.id === currentUserId);
  const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;

  return (
    <div className="card">
      <div className="flex justify-between items-center">
        <span className="kicker">RUNDE {roundNumber} · AFGJORT</span>
        <span className="font-mono text-[10px] font-bold text-brand bg-brand-tint rounded-full px-2.5 py-1">
          RESULTAT KLAR
        </span>
      </div>
      <div className="font-display font-bold text-[23px] mt-2 mb-0.5 text-ink">
        {winnerName ? `${winnerName} vandt runden` : "Runden er afgjort"}
      </div>
      {userRank !== null && (
        <div className="text-sm text-muted">
          Du fik <span className="font-mono font-bold text-brand">{userScore}</span> og
          blev nr. {userRank}
        </div>
      )}
      {scores.length > 0 && (
        <div className="my-3.5">
          <RoundScoreboard scores={scores} currentUserId={currentUserId} />
        </div>
      )}
      <Link href={href} className="btn-secondary w-full block text-center mt-3.5">
        Se resultat
      </Link>
    </div>
  );
}

export function LockedHero({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="card">
      <span className="kicker">RUNDE {roundNumber} · LÅST</span>
      <div className="font-display font-bold text-[23px] mt-2 mb-0.5 text-ink">
        Runden er låst
      </div>
      <div className="text-sm text-muted">Resultatet er på vej — kom tilbage snart.</div>
    </div>
  );
}
