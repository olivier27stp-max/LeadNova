import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";

const SECRET = process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Rate limiting (in-memory, per IP) ────────────────────
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 5; // max 5 requests per window
const rateMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS;
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 10 * 60 * 1000);

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
    // Rate limiting by IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    if (isRateLimited(ip)) {
      // Still return success to prevent enumeration — but don't send email
      return NextResponse.json({ success: true });
    }

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
