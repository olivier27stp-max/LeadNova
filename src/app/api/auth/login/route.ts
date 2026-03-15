import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.active) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Aucun mot de passe configuré pour ce compte. Contactez un administrateur." },
        { status: 401 }
      );
    }

    // Check password: support both bcrypt and legacy SHA-256
    let passwordValid = false;
    const isBcrypt = user.passwordHash.startsWith("$2");

    if (isBcrypt) {
      passwordValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      // Legacy SHA-256 hash (64 hex chars)
      const sha256Hash = createHash("sha256").update(password).digest("hex");
      passwordValid = sha256Hash === user.passwordHash;

      // Migrate to bcrypt on successful login
      if (passwordValid) {
        const bcryptHash = await bcrypt.hash(password, 12);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: bcryptHash },
        });
      }
    }

    if (!passwordValid) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    const res = NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    setSessionCookie(res, user.id);
    return res;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
