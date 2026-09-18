import { createSupabaseServerClient } from "./supabase-server";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { User } from "@prisma/client";

async function findUserByAuthId(authId: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { authId } });
  if (user) return user;
  const identity = await prisma.userIdentity.findUnique({
    where: { authId },
    include: { user: true },
  });
  return identity?.user ?? null;
}

export async function getCurrentUserFromHeaders(): Promise<User | null> {
  const authId = headers().get("x-auth-user-id");
  if (!authId) return null;

  // The x-auth-user-id header is set by middleware from a network-verified
  // getUser() result and is stripped from inbound requests, so it is trustworthy.
  // ONLY safe in page/layout server components on routes covered by the
  // middleware matcher. NEVER use in a route handler or Server Action
  // (where middleware does not populate this header).
  const user = await findUserByAuthId(authId);

  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  // Network-verified user fetch. Always makes a network call to Supabase auth
  // server to cryptographically verify the JWT signature. Safe to use anywhere:
  // page/layout server components, route handlers, and Server Actions.
  const user = await findUserByAuthId(authUser.id);

  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
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

  // Check if this authId is a retired identity (aliased to another user).
  // A merge creates a user_identity record first within a transaction, then deletes
  // the source user's row, so auth_id is unique in user_identities. The two lookups
  // below cannot both succeed, making this ordering safe and atomic.
  const identity = await prisma.userIdentity.findUnique({
    where: { authId: authUser.id },
    include: { user: true },
  });
  if (identity) {
    // Return the surviving user unchanged; do not overwrite its profile
    // with data from the retired account.
    return identity.user;
  }

  // Upsert the user atomically: update if exists by authId, otherwise create.
  // This avoids a race condition where two concurrent first-logins for the same
  // authId could both see no existing user and attempt to create.
  return prisma.user.upsert({
    where: { authId: authUser.id },
    update: { email, displayName, avatarUrl },
    create: { authId: authUser.id, email, displayName, avatarUrl },
  });
}
