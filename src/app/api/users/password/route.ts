import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

// POST: Set or change password
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { userId, currentPassword, newPassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json(
        { error: "userId et newPassword sont requis" },
        { status: 400 }
      );
    }

    // Users can only change their own password (admins can change any)
    if (sessionUser.id !== userId && sessionUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    // If user already has a password, verify the current one
    if (user.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Le mot de passe actuel est requis" },
          { status: 400 }
        );
      }
      // Support both legacy SHA-256 and bcrypt hashes
      const isBcrypt = user.passwordHash.startsWith("$2");
      const isValid = isBcrypt
        ? await bcrypt.compare(currentPassword, user.passwordHash)
        : createHash("sha256").update(currentPassword).digest("hex") === user.passwordHash;
      if (!isValid) {
        return NextResponse.json(
          { error: "Mot de passe actuel incorrect" },
          { status: 403 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });

    await prisma.activityLog.create({
      data: {
        action: "password_changed",
        details: `Mot de passe modifié pour ${user.name}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password change error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors du changement de mot de passe" },
      { status: 500 }
    );
  }
}
