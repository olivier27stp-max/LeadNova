import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { decrypt } from "@/lib/crypto";

export async function POST() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const record = await prisma.appSettings.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });

    const data = record?.data as Record<string, unknown> | null;
    const emailSettings = data?.email as Record<string, string> | null;
    const provider = emailSettings?.provider || "resend";

    // ── Resend ──
    if (provider === "resend") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          success: false,
          error: "RESEND_API_KEY non configurée sur le serveur.",
        });
      }

      const resend = new Resend(apiKey);
      // Verify by listing domains (lightweight API call)
      const { error } = await resend.domains.list();
      if (error) {
        return NextResponse.json({ success: false, error: error.message });
      }
      return NextResponse.json({ success: true });
    }

    // ── SMTP ──
    const host = emailSettings?.smtpHost || process.env.SMTP_HOST || "";
    const port = parseInt(emailSettings?.smtpPort || process.env.SMTP_PORT || "587", 10);
    const user = emailSettings?.smtpUser || process.env.SMTP_USER || "";
    const pass = decrypt(emailSettings?.smtpPass || "") || process.env.SMTP_PASS || "";

    if (!host || !user || !pass) {
      return NextResponse.json({
        success: false,
        error: "Renseignez le serveur SMTP, l'utilisateur et le mot de passe.",
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
    });

    await transporter.verify();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion échouée";
    return NextResponse.json({ success: false, error: message });
  }
}
