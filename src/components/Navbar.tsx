"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getLayoutWidthClass } from "@/lib/layout-width";
import { useEffect, useRef, useState } from "react";
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

export function Navbar({
  displayName,
  isAdmin,
}: {
  displayName: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Refresh the page on sign-in (another tab) or sign-out to update server-rendered state.
      // Only refresh on explicit auth events, never on INITIAL_SESSION.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <nav className="border-b border-line-card bg-surface/90 backdrop-blur-xs sticky top-0 z-50">
      <div className={`${getLayoutWidthClass(pathname)} mx-auto px-4`}>
        <div className="flex items-center justify-between h-14">
          <Logo />

          {/* Right side */}
          <div className="flex items-center gap-2">
            {displayName ? (
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
                        {displayName}
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
