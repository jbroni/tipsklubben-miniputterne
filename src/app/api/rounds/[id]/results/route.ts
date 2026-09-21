import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setResults, resolveResultsAuto } from "@/lib/services/matches";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await requireAdmin();

  const body = await request.json();
  const { mode, results } = body;

  if (mode === "auto") {
    const result = await resolveResultsAuto({
      roundId: id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        updated: result.data.updated,
        unresolved: result.data.unresolved,
      },
    });
  }

  // Manual results entry
  const result = await setResults({
    roundId: id,
    results: results || [],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ data: { updated: result.data.updated } });
}
