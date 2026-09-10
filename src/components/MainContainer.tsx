"use client";

import { usePathname } from "next/navigation";
import { getLayoutWidthClass } from "@/lib/layout-width";

interface MainContainerProps {
  children: React.ReactNode;
}

export function MainContainer({ children }: MainContainerProps) {
  const pathname = usePathname();
  const maxWidthClass = getLayoutWidthClass(pathname);

  return (
    <main className={`flex-1 ${maxWidthClass} mx-auto w-full px-4 py-8`}>
      {children}
    </main>
  );
}
