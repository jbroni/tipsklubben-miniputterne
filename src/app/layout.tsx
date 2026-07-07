import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Tips 13 — Fodboldtipning for venner",
  description: "Ugentlig fodboldtipning for venner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body className="min-h-screen flex flex-col bg-paper">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-line-card py-6 text-center text-sm text-muted">
          Tips 13
        </footer>
      </body>
    </html>
  );
}
