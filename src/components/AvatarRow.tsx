interface Member {
  id: string;
  initial: string;
  submitted: boolean;
}

export function AvatarRow({ members, caption }: { members: Member[]; caption: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {members.map((m) => (
        <span
          key={m.id}
          className={
            m.submitted
              ? "w-[26px] h-[26px] rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center"
              : "w-[26px] h-[26px] rounded-full border-[1.5px] border-dashed border-muted-ghost text-muted-faint text-[11px] font-semibold flex items-center justify-center"
          }
        >
          {m.initial}
        </span>
      ))}
      <span className="text-[12.5px] text-muted ml-1">{caption}</span>
    </div>
  );
}
