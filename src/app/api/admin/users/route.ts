import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    include: { identities: { select: { id: true, authId: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: users });
}

export async function PATCH(request: Request) {
  await requireAdmin();

  const body = await request.json();
  const { userId, role } = body;

  if (!userId || !role) {
    return NextResponse.json(
      { error: "User ID and role are required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  return NextResponse.json({ data: user });
}
