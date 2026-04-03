import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { decrypt } from "@/lib/crypto";
import * as nodemailer from "nodemailer";

export async function POST(
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

    const transport = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: {
        user: account.smtpUser,
        pass: decrypt(account.smtpPass) || account.smtpPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transport.verify();

    // Clear error on success
    await prisma.emailAccount.update({
      where: { id },
      data: { lastError: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion échouée";

    // Store error on account
    const { id } = await params;
    try {
      await prisma.emailAccount.update({
        where: { id },
        data: { lastError: message, status: "ERROR" },
      });
    } catch { /* ignore */ }

    return handleWorkspaceError(error);
  }
}
