import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";

const SECRET = process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateResetToken(userId: string, passwordHash: string): string {
  const expires = (Date.now() + TOKEN_TTL_MS).toString(36);
  const payload = `${userId}|${expires}`;
  // Include passwordHash in HMAC so token is invalidated once password changes
  const sig = createHmac("sha256", SECRET)
    .update(payload + "|" + passwordHash)
    .digest("hex")
    .slice(0, 32);
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, passwordHash: true, active: true },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.active || !user.passwordHash) {
      return NextResponse.json({ success: true });
    }

    const token = generateResetToken(user.id, user.passwordHash);
    const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    // Send reset email via Resend or SMTP
    try {
      const { sendResetEmail } = await import("@/lib/email-sender-system");
      await sendResetEmail(user.email, user.name, resetUrl);
    } catch (err) {
      console.error("[forgot-password] Failed to send email:", err);
      return NextResponse.json(
        { error: "Impossible d'envoyer l'email. Vérifiez la configuration email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
