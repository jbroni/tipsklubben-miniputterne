import { FedtBadge } from "@/components/FedtBadge";
import type { RoundScore } from "@/lib/round-scores";

const RANK_COLORS = ["text-rank-1", "text-rank-2", "text-rank-3"];
const GRID_TEMPLATE = "24px 1fr 70px 70px";

interface RoundScoreboardProps {
  scores: RoundScore[];
  currentUserId: string;
  kicker?: string;
}

export function RoundScoreboard({
  scores,
  currentUserId,
  kicker,
}: RoundScoreboardProps) {
  return (
    <>
      {kicker && <div className="kicker mb-2.5">{kicker}</div>}
      <div className="grid items-center mb-1.5 px-1" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
        <div />
        <div />
        <div className="kicker text-center">FEDT</div>
        <div className="kicker text-right">RESULTAT</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {scores.map((score, i) => {
          const isMe = score.user.id === currentUserId;
          return (
            <div
              key={score.user.id}
              className={`grid items-center ${
                isMe ? "px-1 -mx-1 bg-brand-tint rounded-lg" : ""
              }`}
              style={{ gridTemplateColumns: GRID_TEMPLATE }}
            >
              <span
                className={`font-mono font-bold text-xs text-right shrink-0 ${
                  RANK_COLORS[i] ?? "text-muted-ghost"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-[14.5px] truncate min-w-0 ${
                  isMe ? "font-bold text-brand-text" : "font-medium text-ink"
                }`}
              >
                {score.user.displayName}
              </span>
              <div className="flex justify-center">
                <FedtBadge score={score.fedt} size="sm" showLabel={false} />
              </div>
              <span className="font-mono font-bold text-brand text-sm text-right">
                {score.points}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
