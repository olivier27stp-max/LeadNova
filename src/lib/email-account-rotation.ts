import { prisma } from "@/lib/db";

/**
 * Multi-sender rotation system.
 * Picks the next available EmailAccount using round-robin,
 * respecting daily limits and account status.
 * Returns null if no accounts available (falls back to single-sender).
 */

const TODAY_FORMAT = () => new Date().toISOString().split("T")[0];

/** Get the next available account with remaining daily capacity (round-robin by lastUsedAt).
 *  Supports both ACTIVE and WARMING accounts. WARMING accounts use progressive limits. */
export async function getNextSendingAccount(workspaceId: string) {
  const today = TODAY_FORMAT();

  // Get all sendable accounts (ACTIVE + WARMING) for this workspace
  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId, status: { in: ["ACTIVE", "WARMING"] } },
    orderBy: { lastUsedAt: "asc" }, // round-robin: least recently used first
  });

  if (accounts.length === 0) return null;

  for (const account of accounts) {
    // Lazy daily reset: if sentTodayDate is not today, reset counter
    // For WARMING accounts, also advance warm-up day number
    if (account.sentTodayDate !== today) {
      const updateData: Record<string, unknown> = { sentToday: 0, sentTodayDate: today };
      if (account.status === "WARMING" && account.warmupStartedAt) {
        const daysSinceStart = Math.floor(
          (Date.now() - new Date(account.warmupStartedAt).getTime()) / 86400000
        );
        updateData.warmupDayNumber = daysSinceStart + 1;
        account.warmupDayNumber = daysSinceStart + 1;
      }
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: updateData,
      });
      account.sentToday = 0;
    }

    // Calculate effective daily limit: WARMING uses progressive limits
    const effectiveLimit = account.status === "WARMING"
      ? getWarmupVolume(account.warmupDayNumber || 1, account.dailyLimit)
      : account.dailyLimit;

    // Check if under effective daily limit
    if (account.sentToday < effectiveLimit) {
      return account;
    }
  }

  // All accounts exhausted their daily limit
  return null;
}

/** Record a send: increment counters, create log entry, auto-promote WARMING → ACTIVE */
export async function recordAccountSend(accountId: string, activityId?: string) {
  const today = TODAY_FORMAT();

  const account = await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      sentToday: { increment: 1 },
      totalSent: { increment: 1 },
      sentTodayDate: today,
      lastUsedAt: new Date(),
    },
  });

  // Auto-promote WARMING → ACTIVE when warm-up volume reaches dailyLimit
  if (account.status === "WARMING") {
    const warmupVolume = getWarmupVolume(account.warmupDayNumber || 1, account.dailyLimit);
    if (warmupVolume >= account.dailyLimit) {
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { status: "ACTIVE" },
      });
    }
  }

  await prisma.emailSendLog.create({
    data: {
      emailAccountId: accountId,
      emailActivityId: activityId || null,
      type: "campaign",
    },
  });
}

/** Get total remaining capacity across all active accounts for a workspace */
export async function getRemainingCapacity(workspaceId: string): Promise<number> {
  const today = TODAY_FORMAT();

  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: { dailyLimit: true, sentToday: true, sentTodayDate: true },
  });

  let total = 0;
  for (const a of accounts) {
    const sent = a.sentTodayDate === today ? a.sentToday : 0;
    total += Math.max(0, a.dailyLimit - sent);
  }
  return total;
}

/** Check if workspace has multi-sender enabled (has at least 1 EmailAccount) */
export async function hasMultiSender(workspaceId: string): Promise<boolean> {
  const count = await prisma.emailAccount.count({ where: { workspaceId } });
  return count > 0;
}

/** Get all WARMING accounts for warm-up processing */
export async function getWarmupAccounts(workspaceId: string) {
  return prisma.emailAccount.findMany({
    where: { workspaceId, status: "WARMING" },
    orderBy: { sortOrder: "asc" },
  });
}

/** Record a warm-up send */
export async function recordWarmupSend(accountId: string) {
  const today = TODAY_FORMAT();

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      sentToday: { increment: 1 },
      totalSent: { increment: 1 },
      sentTodayDate: today,
      lastUsedAt: new Date(),
    },
  });

  await prisma.emailSendLog.create({
    data: {
      emailAccountId: accountId,
      type: "warmup",
    },
  });
}

/** Calculate warm-up volume for a given day number */
export function getWarmupVolume(dayNumber: number, dailyLimit: number): number {
  // Day 1: 5, Day 2: 10, Day 3: 15... capped at dailyLimit
  return Math.min(5 * dayNumber, dailyLimit);
}

/** Build SMTP config from an EmailAccount record */
export function buildAccountSmtpConfig(account: {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}) {
  return {
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: {
      user: account.smtpUser,
      pass: account.smtpPass,
    },
  };
}
