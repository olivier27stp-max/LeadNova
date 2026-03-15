import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { setWorkspaceCookie } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nom, email et mot de passe requis" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email" },
        { status: 409 }
      );
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        passwordHash,
        role: "USER",
        active: true,
      },
    });

    // Create default workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: `${trimmedName}`,
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

    // Create default settings for workspace
    await prisma.appSettings.create({
      data: {
        workspaceId: workspace.id,
        data: {},
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        workspaceId: workspace.id,
        action: "user_registered",
        title: "Nouveau compte créé",
        type: "success",
        details: `${trimmedName} (${trimmedEmail}) a créé un compte`,
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
    console.error("Register error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
