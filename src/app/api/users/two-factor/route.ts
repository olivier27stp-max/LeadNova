import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createHmac, randomBytes } from "crypto";

// Generate a base32-encoded secret for TOTP
function generateSecret(): string {
  const buffer = randomBytes(20);
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < buffer.length; i++) {
    secret += base32Chars[buffer[i] % 32];
  }
  return secret;
}

// Generate TOTP code from secret for a given time counter
function generateTOTP(secret: string, counter?: number): string {
  const time = counter ?? Math.floor(Date.now() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(time));

  // Decode base32 secret
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const secretBytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of secret.toUpperCase()) {
    const idx = base32Chars.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      secretBytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  const hmac = createHmac("sha1", Buffer.from(secretBytes));
  hmac.update(buffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return String(code % 1000000).padStart(6, "0");
}

// POST: Setup 2FA - generate secret and return it
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { userId, action, code } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId est requis" }, { status: 400 });
    }

    // Users can only manage their own 2FA
    if (sessionUser.id !== userId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    // Generate new secret
    if (action === "setup") {
      const secret = generateSecret();

      // Store secret temporarily (not yet enabled)
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret },
      });

      // Build otpauth URI for QR code
      const issuer = "FreeLeadsScraper";
      const otpauthUrl = `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;

      return NextResponse.json({
        secret,
        otpauthUrl,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
      });
    }

    // Verify code and enable 2FA
    if (action === "enable") {
      if (!code || !user.twoFactorSecret) {
        return NextResponse.json(
          { error: "Code et secret requis" },
          { status: 400 }
        );
      }

      // Check current, previous, and next time steps for clock skew (±30s)
      const currentTime = Math.floor(Date.now() / 1000 / 30);
      const validCodes = [
        generateTOTP(user.twoFactorSecret, currentTime - 1),
        generateTOTP(user.twoFactorSecret, currentTime),
        generateTOTP(user.twoFactorSecret, currentTime + 1),
      ];

      if (!validCodes.includes(code)) {
        return NextResponse.json(
          { error: "Code invalide. Vérifiez votre application d'authentification." },
          { status: 400 }
        );
      }

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });

      await prisma.activityLog.create({
        data: {
          action: "2fa_enabled",
          details: `Authentification 2FA activée pour ${user.name}`,
          userId: user.id,
        },
      });

      return NextResponse.json({ success: true, enabled: true });
    }

    // Disable 2FA
    if (action === "disable") {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "2fa_disabled",
          details: `Authentification 2FA désactivée pour ${user.name}`,
          userId: user.id,
        },
      });

      return NextResponse.json({ success: true, enabled: false });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (error) {
    console.error("2FA error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur 2FA" },
      { status: 500 }
    );
  }
}
