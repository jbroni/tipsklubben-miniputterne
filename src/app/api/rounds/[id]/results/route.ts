import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setResults, resolveResultsAuto } from "@/lib/services/matches";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const body = await request.json();
  const { mode, results } = body;

  if (mode === "auto") {
    const result = await resolveResultsAuto({
      roundId: params.id,
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
    roundId: params.id,
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
