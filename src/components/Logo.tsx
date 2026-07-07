import Link from "next/link";

const SIZES = {
  default: {
    gap: "gap-2.5",
    box: "w-[11px] h-[14px]",
    boxLetter: "text-[7px]",
    boxLetterMid: "text-[8px]",
    line1: "text-[11.5px]",
    line2: "text-[17px]",
  },
  compact: {
    gap: "gap-[9px]",
    box: "w-[11px] h-[14px]",
    boxLetter: "text-[7px]",
    boxLetterMid: "text-[8px]",
    line1: "text-[10.5px]",
    line2: "text-[16px]",
  },
} as const;

function LogoIcon({ size }: { size: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <div className="flex gap-[2px] shrink-0">
      <span
        className={`${s.box} rounded-[3px] border-[1.5px] border-line-pick bg-surface-coupon flex items-center justify-center font-mono font-bold text-muted ${s.boxLetter}`}
      >
        1
      </span>
      <span
        className={`${s.box} rounded-[3px] border-[1.5px] border-brand bg-brand flex items-center justify-center font-mono font-bold text-white ${s.boxLetterMid}`}
      >
        X
      </span>
      <span
        className={`${s.box} rounded-[3px] border-[1.5px] border-line-pick bg-surface-coupon flex items-center justify-center font-mono font-bold text-muted ${s.boxLetter}`}
      >
        2
      </span>
    </div>
  );
}

export function Logo({
  size = "default",
  href = "/",
}: {
  size?: keyof typeof SIZES;
  href?: string;
}) {
  const s = SIZES[size];
  const wordmark = (
    <div className="flex flex-col justify-center leading-none">
      <span className={`font-display font-bold text-ink-secondary ${s.line1}`} style={{ lineHeight: 1.15 }}>
        Tipsklubben
      </span>
      <span className={`font-display font-extrabold text-ink ${s.line2}`} style={{ lineHeight: 1.05 }}>
        Miniputterne
      </span>
    </div>
  );

  return (
    <Link href={href} className={`flex items-center ${s.gap}`}>
      <LogoIcon size={size} />
      {wordmark}
    </Link>
  );
}
