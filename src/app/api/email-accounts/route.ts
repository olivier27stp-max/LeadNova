import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { encrypt } from "@/lib/crypto";

// GET — list all email accounts for workspace, grouped by domain
export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();

    const accounts = await prisma.emailAccount.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: [{ domain: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        email: true,
        displayName: true,
        domain: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        imapHost: true,
        imapPort: true,
        imapUser: true,
        dailyLimit: true,
        sentToday: true,
        sentTodayDate: true,
        totalSent: true,
        status: true,
        warmupStartedAt: true,
        warmupDayNumber: true,
        bounceCount: true,
        lastError: true,
        lastUsedAt: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    // Group by domain
    const domains = new Map<string, { accounts: typeof accounts; hasImap: boolean }>();
    for (const a of accounts) {
      if (!domains.has(a.domain)) {
        domains.set(a.domain, { accounts: [], hasImap: false });
      }
      const group = domains.get(a.domain)!;
      group.accounts.push(a);
      if (a.imapHost) group.hasImap = true;
    }

    return NextResponse.json({
      accounts,
      domains: Object.fromEntries(domains),
      total: accounts.length,
    });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST — create a new email account
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const body = await request.json();

    // Validate max 100 accounts per workspace
    const count = await prisma.emailAccount.count({ where: { workspaceId: ctx.workspaceId } });
    if (count >= 100) {
      return NextResponse.json({ error: "Maximum 100 comptes email par workspace" }, { status: 400 });
    }

    const email = (body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    const domain = email.split("@")[1];

    // Check duplicate
    const existing = await prisma.emailAccount.findUnique({
      where: { workspaceId_email: { workspaceId: ctx.workspaceId, email } },
    });
    if (existing) {
      return NextResponse.json({ error: `${email} est déjà configuré` }, { status: 409 });
    }

    // Get next sort order
    const lastAccount = await prisma.emailAccount.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const nextOrder = (lastAccount?.sortOrder ?? -1) + 1;

    const account = await prisma.emailAccount.create({
      data: {
        workspaceId: ctx.workspaceId,
        email,
        displayName: body.displayName || null,
        domain,
        smtpHost: body.smtpHost || "",
        smtpPort: parseInt(body.smtpPort || "587", 10),
        smtpUser: body.smtpUser || email,
        smtpPass: encrypt(body.smtpPass || ""),
        imapHost: body.imapHost || null,
        imapPort: body.imapPort ? parseInt(body.imapPort, 10) : 993,
        imapUser: body.imapUser || null,
        imapPass: body.imapPass ? encrypt(body.imapPass) : null,
        dailyLimit: Math.min(Math.max(parseInt(body.dailyLimit || "100", 10), 1), 500),
        status: body.skipWarmup ? "ACTIVE" : "WARMING",
        warmupStartedAt: body.skipWarmup ? null : new Date(),
        sortOrder: nextOrder,
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
