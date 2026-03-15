import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// GET — check if any users exist
export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ hasUsers: count > 0 });
}

// POST — create first admin account (only if no users exist)
export async function POST(request: NextRequest) {
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      return NextResponse.json(
        { error: "Un compte existe déjà. Contactez un administrateur." },
        { status: 403 }
      );
    }

    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nom, email et mot de passe requis" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash: hashPassword(password),
        role: "ADMIN",
        active: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "user_created",
        title: "Premier compte créé",
        type: "success",
        details: `Compte administrateur créé: ${user.name} (${user.email})`,
        userId: user.id,
      },
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
    console.error("Setup error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
