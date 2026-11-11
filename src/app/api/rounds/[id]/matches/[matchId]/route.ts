import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setMatchCancelled } from "@/lib/services/matches";
import { codeToStatus } from "@/lib/services/result";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id, matchId } = await params;
  await requireAdmin();

  const body = await request.json();
  const { cancelled } = body ?? {};

  if (typeof cancelled !== "boolean") {
    return NextResponse.json(
      { error: "cancelled må være true eller false" },
      { status: 400 }
    );
  }

  const result = await setMatchCancelled({
    roundId: id,
    matchId,
    cancelled,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: codeToStatus[result.code] }
    );
  }

  return NextResponse.json({ data: result.data });
}
