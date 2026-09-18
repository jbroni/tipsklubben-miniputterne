import { Avatar } from "./Avatar";

interface MemberLegendProps {
  members: Array<{
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  }>;
  currentUserId: string;
}

export function MemberLegend({ members, currentUserId }: MemberLegendProps) {
  return (
    <div className="flex flex-wrap gap-2 pb-1.5 border-b border-line-divider">
      {members.map((m) => {
        const isCurrentUser = m.id === currentUserId;
        return (
          <div
            key={m.id}
            className={`flex items-center gap-1 text-[11px] ${
              isCurrentUser ? "text-brand font-bold" : "text-muted"
            }`}
          >
            <Avatar
              avatarUrl={m.avatarUrl}
              displayName={m.displayName}
              size={20}
              label={m.displayName}
            />
            <span>{m.displayName}</span>
          </div>
        );
      })}
    </div>
  );
}
