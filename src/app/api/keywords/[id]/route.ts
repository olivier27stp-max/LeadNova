import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const gen = await prisma.keywordGeneration.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!gen) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
    return NextResponse.json(gen);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const gen = await prisma.keywordGeneration.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!gen) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
    await prisma.keywordGeneration.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const gen = await prisma.keywordGeneration.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!gen) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
    const body = await req.json();
    const updated = await prisma.keywordGeneration.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
