import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const SECRET = process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token et mot de passe requis" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    // Decode token to get userId
    let decoded: string;
    try {
      decoded = Buffer.from(token, "base64url").toString();
    } catch {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    const lastPipe = decoded.lastIndexOf("|");
    if (lastPipe === -1) {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    const payload = decoded.slice(0, lastPipe);
    const sig = decoded.slice(lastPipe + 1);
    const [userId, expiresStr] = payload.split("|");

    if (!userId || !expiresStr) {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    const expires = parseInt(expiresStr, 36);
    if (isNaN(expires) || Date.now() > expires) {
      return NextResponse.json({ error: "Ce lien a expiré. Demandez un nouveau lien." }, { status: 400 });
    }

    // Fetch user to verify HMAC with current passwordHash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, active: true },
    });

    if (!user || !user.active || !user.passwordHash) {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    // Verify HMAC (includes passwordHash so token is one-time use)
    const expectedSig = createHmac("sha256", SECRET)
      .update(payload + "|" + user.passwordHash)
      .digest("hex")
      .slice(0, 32);

    if (sig !== expectedSig) {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    // Update password
    const newHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
