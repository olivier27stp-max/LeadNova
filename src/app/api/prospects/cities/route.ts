import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const results = await prisma.prospect.findMany({
      where: {
        city: { not: null },
        archivedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    });

    const cities = results
      .map((r) => r.city)
      .filter((c): c is string => !!c);

    return NextResponse.json(cities);
  } catch (error) {
    console.error("Cities fetch error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
