import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/mcp/tokens";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tokens = await prisma.mcpToken.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: tokens });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name } = body;

  // Trim and validate name
  const trimmedName = (name || "").trim();
  if (!trimmedName || trimmedName.length > 60) {
    return NextResponse.json(
      { error: "Navn skal være mellem 1 og 60 tegn" },
      { status: 400 }
    );
  }

  // Generate token
  const { token, tokenHash, tokenPrefix } = generateToken();

  // Store in database
  const mcpToken = await prisma.mcpToken.create({
    data: {
      userId: user.id,
      name: trimmedName,
      tokenHash,
      tokenPrefix,
    },
  });

  // Return clear token exactly once. This is the only time the clear token
  // exists outside the client — never log or persist it further.
  return NextResponse.json({
    data: {
      token,
      id: mcpToken.id,
      name: mcpToken.name,
      tokenPrefix: mcpToken.tokenPrefix,
      createdAt: mcpToken.createdAt,
    },
  });
}
