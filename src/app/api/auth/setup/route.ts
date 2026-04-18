import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { setWorkspaceCookie } from "@/lib/workspace";
import { hasPaidAccess } from "@/lib/payment";

// GET — check if any users exist
export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ hasUsers: count > 0 });
}

// POST — create first admin account (only if no users exist)
export async function POST(request: NextRequest) {
  try {
    if (!(await hasPaidAccess())) {
      return NextResponse.json(
        {
          error:
            "Paiement requis. Souscrivez au plan Enterprise avant de créer un compte.",
        },
        { status: 402 }
      );
    }

    const count = await prisma.user.count();
    if (count > 0) {
      return NextResponse.json(
        { error: "Un compte existe déjà. Utilisez l'inscription." },
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

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role: "ADMIN",
        active: true,
      },
    });

    // Create default workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
      },
    });

    // Add user as workspace owner
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    // Create default settings
    await prisma.appSettings.create({
      data: {
        workspaceId: workspace.id,
        data: {},
      },
    });

    await prisma.activityLog.create({
      data: {
        workspaceId: workspace.id,
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
    setWorkspaceCookie(res, workspace.id);
    return res;
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
