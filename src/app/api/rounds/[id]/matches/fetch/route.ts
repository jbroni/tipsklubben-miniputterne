import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchFixtures } from "@/lib/football-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();

  const body = await request.json();
  const { league, dateFrom, dateTo } = body;

  if (!league || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "League, dateFrom, and dateTo are required" },
      { status: 400 }
    );
  }

  try {
    const fixtures = await fetchFixtures(league, dateFrom, dateTo);
    return NextResponse.json({ data: fixtures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch fixtures";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
