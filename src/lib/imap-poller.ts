import { ImapFlow } from "imapflow";
import { prisma } from "./db";
import { logActivity } from "./activity";
import { decrypt, isEncrypted } from "./crypto";

// ─── IMAP host mapping from SMTP host ────────────────────

const SMTP_TO_IMAP: Record<string, { host: string; port: number }> = {
  "smtp.gmail.com": { host: "imap.gmail.com", port: 993 },
  "smtp.office365.com": { host: "outlook.office365.com", port: 993 },
  "smtp.outlook.com": { host: "outlook.office365.com", port: 993 },
  "smtp.mail.yahoo.com": { host: "imap.mail.yahoo.com", port: 993 },
  "smtp.zoho.com": { host: "imap.zoho.com", port: 993 },
};

function resolveImapConfig(emailSettings: Record<string, string>) {
  const smtpHost = emailSettings.smtpHost || "";
  const mapped = SMTP_TO_IMAP[smtpHost];

  const imapHost = emailSettings.imapHost || mapped?.host || smtpHost.replace("smtp.", "imap.");
  const imapPort = parseInt(emailSettings.imapPort || String(mapped?.port || 993), 10);
  const rawPass = emailSettings.smtpPass || "";
  const pass = isEncrypted(rawPass) ? decrypt(rawPass) : rawPass;

  return {
    host: imapHost,
    port: imapPort,
    user: emailSettings.smtpUser || "",
    pass,
  };
}

// ─── Bounce detection ────────────────────────────────────

const BOUNCE_SENDERS = [
  "mailer-daemon",
  "postmaster",
  "mail-daemon",
];

const BOUNCE_SUBJECTS = [
  "delivery status notification",
  "undeliverable",
  "undelivered",
  "returned mail",
  "delivery failure",
  "mail delivery failed",
  "failure notice",
  "non remis",
  "non livré",
  "échec de livraison",
];

function isBounceEmail(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  if (BOUNCE_SENDERS.some((s) => fromLower.includes(s))) return true;
  if (BOUNCE_SUBJECTS.some((s) => subjectLower.includes(s))) return true;
  return false;
}

// ─── Main polling function ───────────────────────────────

export async function pollImapForUpdates(workspaceId: string): Promise<{
  replies: number;
  bounces: number;
  opens: number;
  errors: string[];
}> {
  const settingsRow = await prisma.appSettings.findUnique({ where: { workspaceId } });
  if (!settingsRow) return { replies: 0, bounces: 0, opens: 0, errors: ["No settings found"] };

  const data = settingsRow.data as Record<string, unknown>;
  const emailSettings = (data?.email || {}) as Record<string, string>;

  // Skip if gmail_oauth (handled by gmail.ts polling)
  if (emailSettings.provider === "gmail_oauth") {
    return { replies: 0, bounces: 0, opens: 0, errors: [] };
  }

  const imap = resolveImapConfig(emailSettings);
  if (!imap.host || !imap.user || !imap.pass) {
    return { replies: 0, bounces: 0, opens: 0, errors: ["IMAP credentials missing"] };
  }

  // Load recent sent email activities for matching (last 30 days)
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const recentActivities = await prisma.emailActivity.findMany({
    where: {
      sentAt: { gte: since },
      campaign: { workspaceId },
    },
    select: {
      id: true,
      emailSubject: true,
      prospectId: true,
      replyReceived: true,
      openedAt: true,
      bounce: true,
      prospect: { select: { email: true } },
    },
  });

  // Build lookup maps: prospect email → activities, domain → activities
  const emailToActivities = new Map<string, typeof recentActivities>();
  const domainToActivities = new Map<string, typeof recentActivities>();
  for (const a of recentActivities) {
    if (a.prospect.email) {
      const emailKey = a.prospect.email.toLowerCase();
      const existing = emailToActivities.get(emailKey) || [];
      existing.push(a);
      emailToActivities.set(emailKey, existing);

      const domain = emailKey.split("@")[1];
      if (domain && !domain.includes("gmail") && !domain.includes("hotmail") && !domain.includes("yahoo") && !domain.includes("outlook")) {
        const domainExisting = domainToActivities.get(domain) || [];
        domainExisting.push(a);
        domainToActivities.set(domain, domainExisting);
      }
    }
  }

  let replies = 0;
  let bounces = 0;
  const errors: string[] = [];

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.port === 993,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });

  try {
    await client.connect();

    // Poll INBOX for replies & bounces (last 3 days)
    const inboxSince = new Date();
    inboxSince.setDate(inboxSince.getDate() - 3);

    const lock = await client.getMailboxLock("INBOX");
    const bounceUids: number[] = [];
    try {
      // ── Pass 1: scan envelopes for replies & collect bounce UIDs ──
      const messages = client.fetch(
        { since: inboxSince },
        { envelope: true, uid: true }
      );

      for await (const msg of messages) {
        const envelope = msg.envelope;
        if (!envelope) continue;

        const fromAddr = envelope.from?.[0]?.address?.toLowerCase() || "";
        const msgDate = envelope.date || new Date();
        const subject = envelope.subject || "";

        if (msgDate < inboxSince) continue;

        // Collect bounce UIDs for second pass (body analysis)
        if (isBounceEmail(fromAddr, subject)) {
          bounceUids.push(msg.uid);
          continue;
        }

        // Match reply: 1) exact email, 2) same domain (company replied from different address)
        let matched = emailToActivities.get(fromAddr) || [];

        if (matched.length === 0) {
          const senderDomain = fromAddr.split("@")[1];
          if (senderDomain) {
            matched = domainToActivities.get(senderDomain) || [];
          }
        }


        for (const activity of matched) {
          if (!activity.replyReceived) {
            await prisma.emailActivity.update({
              where: { id: activity.id },
              data: { replyReceived: true, openedAt: activity.openedAt ?? new Date() },
            });
            await prisma.prospect.updateMany({
              where: { id: activity.prospectId, status: { notIn: ["REPLIED", "QUALIFIED"] } },
              data: { status: "REPLIED" },
            });
            activity.replyReceived = true;
            replies++;
          }
        }
      }

      // ── Pass 2: fetch bounce bodies to extract failing email ──
      for (const uid of bounceUids) {
        try {
          const fetched = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!fetched) continue;
          const rawSource = (fetched as unknown as { source?: Buffer }).source;
          if (!rawSource) continue;

          const body = rawSource.toString().toLowerCase();
          for (const [email] of emailToActivities) {
            if (body.includes(email)) {
              const activities = emailToActivities.get(email) || [];
              for (const activity of activities) {
                if (!activity.bounce) {
                  await prisma.emailActivity.update({
                    where: { id: activity.id },
                    data: { bounce: true },
                  });
                  await prisma.prospect.updateMany({
                    where: { id: activity.prospectId, status: { notIn: ["REPLIED", "QUALIFIED"] } },
                    data: { status: "BOUNCED" },
                  });
                  activity.bounce = true;
                  bounces++;
                }
              }
            }
          }
        } catch {
          // Skip individual bounce parsing errors
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "IMAP error";
    errors.push(msg);
    try { await client.logout(); } catch { /* ignore */ }
  }

  if (replies > 0 || bounces > 0) {
    console.log(`[imap-poller] ${replies} réponse(s), ${bounces} bounce(s) détecté(s)`);
    await logActivity({
      action: "imap_poll",
      type: "success",
      title: "Détection email IMAP",
      details: `${replies} réponse(s), ${bounces} bounce(s) détecté(s)`,
    });
  }

  return { replies, bounces, opens: 0, errors };
}
