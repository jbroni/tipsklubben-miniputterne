"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface LoginButtonProps {
  className?: string;
}

export function LoginButton({ className = "" }: LoginButtonProps) {
  const supabase = createSupabaseBrowserClient();

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      console.error("Sign in error:", error.message);
      alert(`Sign in failed: ${error.message}`);
    }
  };

  return (
    <button onClick={handleSignIn} className={`btn-primary ${className}`.trim()}>
      Log ind med Google
    </button>
  );
}
