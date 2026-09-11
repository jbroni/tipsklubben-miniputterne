import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership: fetch token to check it belongs to this user
  const token = await prisma.mcpToken.findUnique({
    where: { id: params.id },
  });

  // Return 404 in both cases (not found or wrong owner) so the endpoint
  // cannot be used to probe for other users' token IDs
  if (!token || token.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft revoke: set revokedAt timestamp
  await prisma.mcpToken.update({
    where: { id: params.id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ data: { id: params.id } });
}
