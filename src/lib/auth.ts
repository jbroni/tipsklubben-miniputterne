import { createSupabaseServerClient } from "./supabase-server";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

export async function getSession() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { authId: session.user.id },
  });

  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function syncUser(authUser: {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string; name?: string };
}): Promise<User> {
  const email = authUser.email ?? "";
  const displayName =
    authUser.user_metadata?.full_name ??
    authUser.user_metadata?.name ??
    email.split("@")[0];
  const avatarUrl = authUser.user_metadata?.avatar_url ?? null;

  const user = await prisma.user.upsert({
    where: { authId: authUser.id },
    update: {
      email,
      displayName,
      avatarUrl,
    },
    create: {
      authId: authUser.id,
      email,
      displayName,
      avatarUrl,
    },
  });

  return user;
}
