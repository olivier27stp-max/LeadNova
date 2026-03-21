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

    const seen = new Map<string, string>();
    for (const r of results) {
      if (!r.city) continue;
      const key = r.city.toLowerCase().trim();
      if (!seen.has(key)) seen.set(key, r.city);
    }
    const cities = Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );

    return NextResponse.json(cities);
  } catch (error) {
    console.error("Cities fetch error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
