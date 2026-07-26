import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getCurrentUserFromHeaders } from "@/lib/auth";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
  const displayName = user?.displayName || user?.email || null;
  const isAdmin = user?.role === "admin";

  return (
    <html lang="da">
      <body className="min-h-screen flex flex-col bg-paper">
        <Navbar displayName={displayName} isAdmin={isAdmin} />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-line-card py-6 text-center text-sm text-muted">
          Tipsklubben Miniputterne · 2013
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
