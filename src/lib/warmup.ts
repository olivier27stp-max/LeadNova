import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import * as nodemailer from "nodemailer";
import { getWarmupVolume, recordWarmupSend } from "@/lib/email-account-rotation";

// ─── Warm-up email templates (randomized for human-like behavior) ─────

const WARMUP_SUBJECTS = [
  "Quick question about our meeting",
  "Following up on our conversation",
  "Re: Project update",
  "Availability this week?",
  "Just checking in",
  "Re: Next steps",
  "Quick update for you",
  "Thoughts on this?",
  "Are we still on for Thursday?",
  "Re: Budget proposal",
  "Thanks for the info!",
  "One more thing",
  "Can you take a look?",
  "Lunch tomorrow?",
  "Re: Quick favor",
];

const WARMUP_BODIES = [
  "Hey, just wanted to follow up on what we discussed last time. Let me know if you have any questions!",
  "Thanks for getting back to me. I'll review the details and circle back by end of day.",
  "Sounds good! I'll prepare the documents and send them over shortly.",
  "Great, I think we're on the same page. Let me know if anything changes.",
  "Just checking in to see if you had a chance to look at what I sent over. No rush!",
  "Appreciate you taking the time. Looking forward to connecting again soon.",
  "Perfect, that works for me. I'll block the time on my calendar.",
  "Thanks for the heads up. I'll adjust my schedule accordingly.",
  "Got it, makes sense. Let me know if there's anything else you need from my end.",
  "Sure thing! I'll have that ready for you by tomorrow morning.",
];

const WARMUP_REPLIES = [
  "Got it, thanks!",
  "Sounds good, I'll take a look.",
  "Thanks for the update!",
  "Perfect, let me know if you need anything else.",
  "Will do, thanks for following up.",
  "Great, I appreciate it!",
  "Sure, I'll get back to you on that.",
  "Thanks for letting me know.",
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main warm-up processor ─────────────────────────────────

export async function processWarmup(): Promise<{ sent: number; promoted: number; errors: string[] }> {
  let totalSent = 0;
  let totalPromoted = 0;
  const allErrors: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  // Find all workspaces with WARMING accounts
  const warmingAccounts = await prisma.emailAccount.findMany({
    where: { status: "WARMING" },
    orderBy: { workspaceId: "asc" },
  });

  if (warmingAccounts.length === 0) return { sent: 0, promoted: 0, errors: [] };

  // Group by workspace
  const byWorkspace = new Map<string, typeof warmingAccounts>();
  for (const a of warmingAccounts) {
    const list = byWorkspace.get(a.workspaceId) || [];
    list.push(a);
    byWorkspace.set(a.workspaceId, list);
  }

  for (const [, accounts] of byWorkspace) {
    // Need at least 2 accounts in the workspace (warming or active) to exchange emails
    const allAccounts = await prisma.emailAccount.findMany({
      where: { workspaceId: accounts[0].workspaceId, status: { in: ["WARMING", "ACTIVE"] } },
    });
    if (allAccounts.length < 2) continue;

    for (const account of accounts) {
      // Lazy daily reset & day increment
      if (account.sentTodayDate !== today) {
        const newDay = account.warmupDayNumber + 1;
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { sentToday: 0, sentTodayDate: today, warmupDayNumber: newDay },
        });
        account.sentToday = 0;
        account.warmupDayNumber = newDay;
      }

      // Calculate volume for today
      const volume = getWarmupVolume(account.warmupDayNumber, account.dailyLimit);
      const remaining = volume - account.sentToday;
      if (remaining <= 0) continue;

      // Auto-promote if warm-up is complete (volume >= dailyLimit)
      if (5 * account.warmupDayNumber >= account.dailyLimit) {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { status: "ACTIVE" },
        });
        totalPromoted++;
        continue;
      }

      // Pick random recipients from other accounts in this workspace
      const recipients = allAccounts.filter((a) => a.id !== account.id);

      for (let i = 0; i < remaining; i++) {
        const recipient = randomPick(recipients);

        try {
          const transport = nodemailer.createTransport({
            host: account.smtpHost,
            port: account.smtpPort,
            secure: account.smtpPort === 465,
            auth: {
              user: account.smtpUser,
              pass: decrypt(account.smtpPass) || account.smtpPass,
            },
          });

          await transport.sendMail({
            from: account.displayName
              ? `"${account.displayName}" <${account.email}>`
              : account.email,
            to: recipient.email,
            subject: randomPick(WARMUP_SUBJECTS),
            text: randomPick(WARMUP_BODIES),
            headers: { "X-LN-Warmup": account.id },
          });

          await recordWarmupSend(account.id);
          totalSent++;

          // Human-like delay between sends (3-8 seconds)
          await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000));
        } catch (error) {
          allErrors.push(`${account.email}: ${error instanceof Error ? error.message : "Send failed"}`);
          break; // Stop sending from this account on error
        }
      }
    }
  }

  return { sent: totalSent, promoted: totalPromoted, errors: allErrors };
}
