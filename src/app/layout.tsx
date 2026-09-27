import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getCurrentUserFromHeaders } from "@/lib/auth";
import { firstName } from "@/lib/display-name";
import { MainContainer } from "@/components/MainContainer";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Tipsklubben Miniputterne",
  description: "Ugentlig fodboldtipning for venner",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserFromHeaders();
  const displayName = (user?.displayName && firstName(user.displayName)) || user?.email || null;
  const isAdmin = user?.role === "admin";

  // Query for delegate round if user exists and is not admin
  let delegateRoundId: string | null = null;
  if (user && !isAdmin) {
    const delegateRound = await prisma.round.findFirst({
      where: {
        couponDelegateId: user.id,
        status: { not: "completed" },
        OR: [
          { status: "locked" },
          { deadline: { lte: new Date() } }
        ],
      },
      orderBy: { deadline: "desc" },
      select: { id: true },
    });
    delegateRoundId = delegateRound?.id ?? null;
  }

  return (
    <html lang="da">
      <body className="min-h-screen flex flex-col bg-paper">
        <Navbar displayName={displayName} isAdmin={isAdmin} delegateRoundId={delegateRoundId} />
        <MainContainer>{children}</MainContainer>
        <footer className="border-t border-line-card py-6 text-center text-sm text-muted">
          Tipsklubben Miniputterne · 2013
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
