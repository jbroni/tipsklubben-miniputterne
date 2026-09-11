import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addMatches } from "@/lib/services/matches";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const body = await request.json();
  const { matches } = body;

  const result = await addMatches({
    roundId: params.id,
    matches: matches || [],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { data: { count: result.data.count, warnings: result.data.warnings } },
    { status: 201 }
  );
}
