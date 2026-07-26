import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeaderboardEntries } from "@/lib/leaderboard-data";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId") ?? undefined;

  const entries = await getLeaderboardEntries(seasonId);

  return NextResponse.json({ data: entries });
}
