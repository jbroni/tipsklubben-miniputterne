"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useEffect, useState, useRef } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Logo } from "@/components/Logo";
import { LoginButton } from "@/components/LoginButton";

const navLinks = [
  { href: "/", label: "Forside" },
  { href: "/rounds", label: "Runder" },
  { href: "/leaderboard", label: "Stillingen" },
  { href: "/fedt", label: "Fedt" },
  { href: "/historik", label: "Historik" },
  { href: "/profile", label: "Profil" },
];

export function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.auth.getUser().then(({ data }) => setUser(data.user));
      if (!session?.user) setIsAdmin(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(({ data }) => setIsAdmin(data?.role === "admin"))
      .catch(() => {});
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <nav className="border-b border-line-card bg-surface/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Logo />

          {/* Right side */}
          <div className="flex items-center gap-2">
            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
                  aria-label="Menu"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {menuOpen ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>

                {/* Dropdown menu */}
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-surface rounded-xl border border-line-card shadow-card py-2 z-50">
                    <div className="px-4 py-2 border-b border-line-hairline">
                      <p className="text-sm font-medium text-ink truncate">
                        {user.user_metadata?.full_name ?? user.email}
                      </p>
                    </div>

                    {navLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block px-4 py-2.5 text-sm transition-colors ${
                          pathname === link.href
                            ? "text-brand bg-brand-tint font-medium"
                            : "text-ink-tertiary hover:bg-paper"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                    {isAdmin && (
                      <Link
                        href="/admin"
                        className={`block px-4 py-2.5 text-sm transition-colors ${
                          pathname === "/admin"
                            ? "text-signal bg-signal-soft font-medium"
                            : "text-signal hover:bg-paper"
                        }`}
                      >
                        Admin-panel
                      </Link>
                    )}

                    <div className="border-t border-line-hairline mt-1 pt-1">
                      <button
                        onClick={handleSignOut}
                        className="block w-full text-left px-4 py-2.5 text-sm text-muted hover:bg-paper transition-colors"
                      >
                        Log ud
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : pathname !== "/" ? (
              <LoginButton className="text-sm" />
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
