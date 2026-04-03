import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { encrypt } from "@/lib/crypto";

// POST — bulk import email accounts
// Accepts lines in format: email:password or email:password:host:port
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const { lines, smtpHost, smtpPort } = await request.json();

    if (!lines || typeof lines !== "string") {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }

    // Check current count
    const currentCount = await prisma.emailAccount.count({ where: { workspaceId: ctx.workspaceId } });

    const parsed = lines
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l && l.includes(":"));

    if (currentCount + parsed.length > 100) {
      return NextResponse.json({
        error: `Maximum 100 comptes. Vous en avez ${currentCount}, impossible d'en ajouter ${parsed.length}.`,
      }, { status: 400 });
    }

    // Get last sort order
    const lastAccount = await prisma.emailAccount.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextOrder = (lastAccount?.sortOrder ?? -1) + 1;

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const line of parsed) {
      const parts = line.split(":");
      const email = (parts[0] || "").trim().toLowerCase();
      const password = (parts[1] || "").trim();
      const host = (parts[2] || smtpHost || "").trim();
      const port = parseInt(parts[3] || smtpPort || "587", 10);

      if (!email || !email.includes("@") || !password) {
        errors.push(`${email || "?"}: format invalide`);
        skipped++;
        continue;
      }

      const domain = email.split("@")[1];

      // Check duplicate
      const existing = await prisma.emailAccount.findUnique({
        where: { workspaceId_email: { workspaceId: ctx.workspaceId, email } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.emailAccount.create({
        data: {
          workspaceId: ctx.workspaceId,
          email,
          domain,
          smtpHost: host,
          smtpPort: port,
          smtpUser: email,
          smtpPass: encrypt(password),
          dailyLimit: 100,
          status: "WARMING",
          warmupStartedAt: new Date(),
          sortOrder: nextOrder++,
        },
      });
      created++;
    }

    return NextResponse.json({ created, skipped, errors, total: currentCount + created });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
