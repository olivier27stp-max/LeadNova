import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const { searchParams } = new URL(request.url);
    if (searchParams.get("count") === "true") {
      const count = await prisma.blacklist.count({
        where: { workspaceId },
      });
      return NextResponse.json({ count });
    }
    const entries = await prisma.blacklist.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("Blacklist fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch blacklist" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const body = await request.json();

    if (!body.email && !body.domain) {
      return NextResponse.json(
        { error: "Either email or domain is required" },
        { status: 400 }
      );
    }

    const entry = await prisma.blacklist.create({
      data: {
        workspaceId,
        email: body.email || null,
        domain: body.domain || null,
        reason: body.reason,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Blacklist create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add to blacklist" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Verify ownership before deleting
    const entry = await prisma.blacklist.findUnique({ where: { id } });
    if (!entry || entry.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.blacklist.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Blacklist delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete from blacklist" },
      { status: 500 }
    );
  }
}
