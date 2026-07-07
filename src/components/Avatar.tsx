"use client";

import { useState } from "react";
import Image from "next/image";

interface AvatarProps {
  avatarUrl?: string | null;
  displayName: string;
  size?: number;
  className?: string;
}

export function Avatar({ avatarUrl, displayName, size = 24, className = "" }: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const dimension = { width: size, height: size };

  if (avatarUrl && !errored) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <span
      style={{ ...dimension, fontSize: size * 0.42 }}
      className={`rounded-full bg-brand text-white font-semibold flex items-center justify-center shrink-0 ${className}`}
    >
      {initial}
    </span>
  );
}
