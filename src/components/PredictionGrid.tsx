import { PICK_LABEL, type PickValue } from "@/lib/picks";
import { isShadedRow } from "@/lib/grid-shading";
import { Avatar } from "./Avatar";
import { MemberLegend } from "./MemberLegend";

interface PredictionGridProps {
  matches: Array<{
    id: string;
    matchNumber: number;
    homeTeam: string;
    awayTeam: string;
    result: "HOME" | "DRAW" | "AWAY" | null;
    predictions: Array<{
      userId: string;
      pick: "HOME" | "DRAW" | "AWAY";
      carriedFromRoundNumber?: number | null;
    }>;
  }>;
  users: Array<{ id: string; displayName: string; avatarUrl?: string | null }>;
  currentUserId: string;
}

export function PredictionGrid({
  matches,
  users,
  currentUserId,
}: PredictionGridProps) {
  // Derive users with predictions
  const usersWithPredictions = users.filter((u) =>
    matches.some((m) => m.predictions.some((p) => p.userId === u.id))
  );

  // Derive per-user carried state: user is "carried" if all their predictions share one non-null carriedFromRoundNumber
  const userCarriedFromRound = new Map<string, number | null>();
  for (const user of usersWithPredictions) {
    const userPreds = matches.flatMap((m) => m.predictions.filter((p) => p.userId === user.id));
    if (userPreds.length === 0) {
      userCarriedFromRound.set(user.id, null);
      continue;
    }

    // Only mark as carried if all predictions have the same non-null carriedFromRoundNumber
    const first = userPreds[0]?.carriedFromRoundNumber;
    const allCarried =
      userPreds.length > 0 &&
      first != null &&
      userPreds.every((p) => p.carriedFromRoundNumber === first);
    userCarriedFromRound.set(user.id, allCarried ? first : null);
  }

  // Build grid template columns
  const gridCols = `16px 1fr repeat(${usersWithPredictions.length}, 26px) 30px`;

  return (
    <div className="card p-3! font-mono overflow-x-auto">
      <MemberLegend members={usersWithPredictions} currentUserId={currentUserId} />
      <div
        className="grid gap-0.5 text-[9px] text-muted-faint text-center pb-1.5 border-b border-line-divider"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span>#</span>
        <span className="text-left font-body text-[10px]">KAMP</span>
        {usersWithPredictions.map((u) => {
          const isCurrentUser = u.id === currentUserId;
          const carriedFrom = userCarriedFromRound.get(u.id);
          if (u.avatarUrl) {
            return (
              <div key={u.id} className="flex flex-col justify-center items-center gap-0.5 relative">
                <Avatar
                  avatarUrl={u.avatarUrl}
                  displayName={u.displayName}
                  size={20}
                  className={isCurrentUser ? "ring-1 ring-brand" : ""}
                  label={u.displayName}
                />
                {carriedFrom != null && (
                  <span
                    className="text-[9px] text-muted-faint"
                    title={`genbrugt fra runde ${carriedFrom}`}
                    aria-label={`genbrugt fra runde ${carriedFrom}`}
                  >
                    ↻R{carriedFrom}
                  </span>
                )}
              </div>
            );
          }
          return (
            <div key={u.id} className="flex flex-col justify-center items-center gap-0.5">
              <span
                className={isCurrentUser ? "text-brand font-bold" : ""}
                title={u.displayName}
              >
                {u.displayName.slice(0, 3).toUpperCase()}
              </span>
              {carriedFrom != null && (
                <span
                  className="text-[9px] text-muted-faint"
                  title={`genbrugt fra runde ${carriedFrom}`}
                  aria-label={`genbrugt fra runde ${carriedFrom}`}
                >
                  ↻R{carriedFrom}
                </span>
              )}
            </div>
          );
        })}
        <span>RES</span>
      </div>
      {matches.map((match) => (
        <div
          key={match.id}
          className={`grid gap-0.5 items-center text-center py-1.5 border-b border-line-hairline last:border-0 ${
            isShadedRow(match.matchNumber) ? "bg-paper" : ""
          }`}
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
                {PICK_LABEL[pred.pick as PickValue]}
              </b>
            );
          })}
          <span className="flex justify-center">
            {match.result ? (
              <span className="w-5 h-5 rounded-[5px] bg-result-ink text-white text-[11px] font-bold flex items-center justify-center">
                {PICK_LABEL[match.result as PickValue]}
              </span>
            ) : (
              <span className="text-muted-ghost">—</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
