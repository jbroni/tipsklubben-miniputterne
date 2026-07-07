"use client";

import { useEffect, useState } from "react";

function formatRemaining(deadline: Date, now: Date): string {
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return "0T";
  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}D ${hours}T`;
  if (hours > 0) return `${hours}T ${minutes}M`;
  return `${minutes}M`;
}

export function useCountdown(deadline: string) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(deadline);
  if (!now) return { label: formatRemaining(target, new Date(0)), expired: false };
  return {
    label: formatRemaining(target, now),
    expired: target.getTime() <= now.getTime(),
  };
}

export function CountdownPill({ deadline }: { deadline: string }) {
  const { label, expired } = useCountdown(deadline);
  if (expired) return null;
  return (
    <span className="font-mono text-[10px] font-bold text-signal bg-signal-soft rounded-full px-2.5 py-1 whitespace-nowrap">
      LUKKER OM {label}
    </span>
  );
}
