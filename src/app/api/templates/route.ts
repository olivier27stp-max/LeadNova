import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const templates = await prisma.emailTemplate.findMany({
      where: { archived: false, workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(templates);
  } catch (error) {
    console.error("Templates fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // If setting as default, unset others in this workspace
    if (body.isDefault) {
      await prisma.emailTemplate.updateMany({
        where: { isDefault: true, workspaceId },
        data: { isDefault: false },
      });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        workspaceId,
        name: body.name,
        type: body.type || "custom",
        subject: body.subject || "",
        body: body.body || "",
        isDefault: body.isDefault || false,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Template create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (data.isDefault) {
      await prisma.emailTemplate.updateMany({
        where: { isDefault: true, workspaceId, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // Only allow safe fields
    const { name, subject, body: templateBody, type, isDefault } = data;
    const template = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(subject !== undefined && { subject }),
        ...(templateBody !== undefined && { body: templateBody }),
        ...(type !== undefined && { type }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Template update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template" },
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
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Soft-delete (archive)
    await prisma.emailTemplate.update({
      where: { id },
      data: { archived: true },
    });

    return NextResponse.json({ archived: true });
  } catch (error) {
    console.error("Template delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to archive template" },
      { status: 500 }
    );
  }
}
