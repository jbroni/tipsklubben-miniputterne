import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Tips 13 — Football Prediction Club",
  description: "Weekly football prediction game for friends",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-800 py-6 text-center text-sm text-gray-600">
          Tips 13 — Football Prediction Club
        </footer>
      </body>
    </html>
  );
}
