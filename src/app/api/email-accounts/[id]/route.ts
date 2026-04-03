import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { encrypt } from "@/lib/crypto";

// PATCH — update an email account
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = await request.json();

    const account = await prisma.emailAccount.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    });
    if (!account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (body.displayName !== undefined) data.displayName = body.displayName || null;
    if (body.smtpHost !== undefined) data.smtpHost = body.smtpHost;
    if (body.smtpPort !== undefined) data.smtpPort = parseInt(body.smtpPort, 10);
    if (body.smtpUser !== undefined) data.smtpUser = body.smtpUser;
    if (body.smtpPass !== undefined && body.smtpPass !== "") data.smtpPass = encrypt(body.smtpPass);
    if (body.imapHost !== undefined) data.imapHost = body.imapHost || null;
    if (body.imapPort !== undefined) data.imapPort = body.imapPort ? parseInt(body.imapPort, 10) : 993;
    if (body.imapUser !== undefined) data.imapUser = body.imapUser || null;
    if (body.imapPass !== undefined && body.imapPass !== "") data.imapPass = encrypt(body.imapPass);
    if (body.dailyLimit !== undefined) data.dailyLimit = Math.min(Math.max(parseInt(body.dailyLimit, 10), 1), 500);

    if (body.status !== undefined) {
      const valid = ["WARMING", "ACTIVE", "PAUSED"];
      if (valid.includes(body.status)) {
        data.status = body.status;
        if (body.status === "WARMING" && account.status !== "WARMING") {
          data.warmupStartedAt = new Date();
          data.warmupDayNumber = 0;
        }
      }
    }

    const updated = await prisma.emailAccount.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// DELETE — remove an email account
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;

    const account = await prisma.emailAccount.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    });
    if (!account) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
    }

    await prisma.emailSendLog.deleteMany({ where: { emailAccountId: id } });
    await prisma.emailAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
