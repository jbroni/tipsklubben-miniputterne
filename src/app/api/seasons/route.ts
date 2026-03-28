import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const seasons = await prisma.season.findMany({
    orderBy: { startDate: "desc" },
    include: {
      rounds: {
        select: { id: true, roundNumber: true, status: true },
        orderBy: { roundNumber: "asc" },
      },
    },
  });

  return NextResponse.json({ data: seasons });
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = await request.json();
  const { name, startDate, numRounds = 12 } = body;

  if (!name || !startDate) {
    return NextResponse.json(
      { error: "Name and start date are required" },
      { status: 400 }
    );
  }

  // Deactivate other seasons
  await prisma.season.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  const season = await prisma.season.create({
    data: {
      name,
      startDate: new Date(startDate),
      numRounds,
      isActive: true,
    },
  });

  return NextResponse.json({ data: season }, { status: 201 });
}
