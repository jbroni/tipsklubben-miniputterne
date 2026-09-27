import { cache } from "react";
import { prisma } from "./prisma";
import { buildShortNames } from "./display-name";

/** Short names for all non-guest users, so a player's name is the same on every page. Deduplicated per request. */
export const getShortNames = cache(async (): Promise<Map<string, string>> => {
  const users = await prisma.user.findMany({
    select: { id: true, displayName: true },
    where: { role: { not: "guest" } },
  });

  return buildShortNames(users);
});
