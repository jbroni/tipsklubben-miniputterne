import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { mergeUsers } from "@/lib/services/user-merge";
import { codeToStatus } from "@/lib/services/result";

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json();
  const { sourceUserId, targetUserId } = body;

  if (!sourceUserId || !targetUserId) {
    return NextResponse.json(
      { error: "Både kilde- og målbrugeren er påkrævet" },
      { status: 400 }
    );
  }

  const result = await mergeUsers({ sourceUserId, targetUserId });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: codeToStatus[result.code] }
    );
  }

  return NextResponse.json({ data: result.data.user });
}
