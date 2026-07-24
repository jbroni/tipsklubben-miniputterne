import { Avatar } from "./Avatar";

interface Member {
  id: string;
  initial: string;
  submitted: boolean;
  avatarUrl?: string | null;
}

export function AvatarRow({ members, caption }: { members: Member[]; caption: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {members.map((m) =>
        m.submitted ? (
          <Avatar
            key={m.id}
            avatarUrl={m.avatarUrl}
            displayName={m.initial}
            size={26}
          />
        ) : (
          <span
            key={m.id}
            className="w-[26px] h-[26px] rounded-full border-[1.5px] border-dashed border-muted-ghost flex items-center justify-center"
          >
            <Avatar
              avatarUrl={m.avatarUrl}
              displayName={m.initial}
              size={22}
              className="opacity-40 grayscale"
            />
          </span>
        )
      )}
      <span className="text-[12.5px] text-muted ml-1">{caption}</span>
    </div>
  );
}
