import { prisma } from "@/lib/db";

/**
 * Multi-sender rotation system.
 * Picks the next available EmailAccount using round-robin,
 * respecting daily limits and account status.
 * Returns null if no accounts available (falls back to single-sender).
 */

const TODAY_FORMAT = () => new Date().toISOString().split("T")[0];

/** Get the next ACTIVE account with remaining daily capacity (round-robin by lastUsedAt) */
export async function getNextSendingAccount(workspaceId: string) {
  const today = TODAY_FORMAT();

  // Get all active accounts for this workspace
  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { lastUsedAt: "asc" }, // round-robin: least recently used first
  });

  if (accounts.length === 0) return null;

  for (const account of accounts) {
    // Lazy daily reset: if sentTodayDate is not today, reset counter
    if (account.sentTodayDate !== today) {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { sentToday: 0, sentTodayDate: today },
      });
      account.sentToday = 0;
    }

    // Check if under daily limit
    if (account.sentToday < account.dailyLimit) {
      return account;
    }
  }

  // All accounts exhausted their daily limit
  return null;
}

/** Record a send: increment counters, create log entry */
export async function recordAccountSend(accountId: string, activityId?: string) {
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
