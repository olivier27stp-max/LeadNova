import nodemailer from "nodemailer";
import { Resend } from "resend";
import { prisma } from "./db";
import { DAILY_EMAIL_LIMIT, EMAIL_DELAY_MIN_SECONDS, EMAIL_DELAY_MAX_SECONDS } from "./config";
import { wrapInEmailTemplate, getTextFooter, getLogoAttachment } from "./email-template";
import { decrypt } from "./crypto";

// ─── Types ───────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

interface SenderInfo {
  from: string;
  replyTo?: string;
  logoUrl?: string;
  provider: "resend" | "smtp";
  smtp: SmtpConfig;
}

// ─── Config builders ─────────────────────────────────────

function buildSmtpConfig(emailSettings: Record<string, string> | null): SmtpConfig {
  const host = emailSettings?.smtpHost || process.env.SMTP_HOST || "";
  const port = parseInt(emailSettings?.smtpPort || process.env.SMTP_PORT || "587", 10);
  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user: emailSettings?.smtpUser || process.env.SMTP_USER || "",
      pass: decrypt(emailSettings?.smtpPass || "") || process.env.SMTP_PASS || "",
    },
  };
}

async function getSenderInfo(workspaceId?: string | null): Promise<SenderInfo> {
  const fallbackSmtp = buildSmtpConfig(null);
  const fallbackProvider = process.env.RESEND_API_KEY ? "resend" : "smtp";
  // Platform-level "from" address — emails are sent from this address for all users
  const platformFrom = process.env.PLATFORM_FROM_EMAIL || "noreply@leadnova.one";
  const platformFromName = process.env.PLATFORM_FROM_NAME || "LeadNova";

  try {
    const record = workspaceId
      ? await prisma.appSettings.findUnique({ where: { workspaceId } })
      : await prisma.appSettings.findFirst();
    const data = record?.data as Record<string, unknown> | null;
    const emailSettings = data?.email as Record<string, string> | null;
    const companySettings = data?.company as Record<string, string> | null;

    // "From" uses company name but platform email (like Jobber)
    const companyName = companySettings?.name || platformFromName;
    const from = `"${companyName}" <${platformFrom}>`;

    // Reply-to = the user's company email so responses go to them
    const replyTo = companySettings?.email || emailSettings?.replyToEmail || undefined;

    const logoUrl = emailSettings?.logoUrl || undefined;
    const provider = (emailSettings?.provider === "resend" || emailSettings?.provider === "smtp")
      ? emailSettings.provider
      : fallbackProvider;
    const smtp = buildSmtpConfig(emailSettings);
    return { from, replyTo, logoUrl, provider, smtp };
  } catch {
    return { from: `"${platformFromName}" <${platformFrom}>`, provider: fallbackProvider, smtp: fallbackSmtp };
  }
}

// ─── Send implementations ────────────────────────────────

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
  senderInfo: SenderInfo,
  unsubscribeUrl?: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY non configurée");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: senderInfo.from,
    to,
    subject,
    html,
    text,
    ...(senderInfo.replyTo ? { replyTo: senderInfo.replyTo } : {}),
    headers: unsubscribeUrl ? {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    } : undefined,
  });
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  text: string,
  senderInfo: SenderInfo
): Promise<void> {
  const transporter = nodemailer.createTransport(senderInfo.smtp);
  const logoAttachment = getLogoAttachment(senderInfo.logoUrl);
  await transporter.sendMail({
    from: senderInfo.from,
    ...(senderInfo.replyTo ? { replyTo: senderInfo.replyTo } : {}),
    to,
    subject,
    text,
    html,
    attachments: logoAttachment ? [logoAttachment] : [],
  });
}

// ─── Helpers ─────────────────────────────────────────────

async function getTodaySentCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.emailActivity.count({
    where: {
      sentAt: { gte: startOfDay },
      bounce: false,
    },
  });
}

async function isBlacklisted(email: string): Promise<boolean> {
  const domain = email.split("@")[1];

  const match = await prisma.blacklist.findFirst({
    where: {
      OR: [{ email }, { domain }],
    },
  });

  return !!match;
}

export async function canSendEmail(): Promise<{
  allowed: boolean;
  reason?: string;
  sentToday: number;
}> {
  const sentToday = await getTodaySentCount();

  if (sentToday >= DAILY_EMAIL_LIMIT) {
    return {
      allowed: false,
      reason: `Daily limit reached (${sentToday}/${DAILY_EMAIL_LIMIT})`,
      sentToday,
    };
  }

  return { allowed: true, sentToday };
}

// ─── Main send function ──────────────────────────────────

export async function sendEmail(
  prospectId: string,
  subject: string,
  body: string,
  campaignId?: string
): Promise<{ success: boolean; error?: string }> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
  });

  if (!prospect?.email) {
    return { success: false, error: "Prospect has no email address" };
  }

  if (await isBlacklisted(prospect.email)) {
    return { success: false, error: "Email is blacklisted" };
  }

  const { allowed, reason } = await canSendEmail();
  if (!allowed) {
    return { success: false, error: reason };
  }

  const senderInfo = await getSenderInfo();

  const activity = await prisma.emailActivity.create({
    data: {
      prospectId,
      campaignId: campaignId || null,
      emailSubject: subject,
      emailBody: body,
      sentAt: new Date(),
    },
  });

  const appUrl = process.env.APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  const trackingPixelUrl = appUrl
    ? `${appUrl}/api/track/open/${activity.id}`
    : undefined;
  const unsubscribeUrl = appUrl
    ? `${appUrl}/api/track/unsubscribe/${activity.id}`
    : undefined;

  const html = wrapInEmailTemplate(body, trackingPixelUrl, unsubscribeUrl);
  const text = body + getTextFooter(unsubscribeUrl);

  try {
    if (senderInfo.provider === "resend") {
      await sendViaResend(prospect.email, subject, html, text, senderInfo, unsubscribeUrl);
    } else {
      await sendViaSmtp(prospect.email, subject, html, text, senderInfo);
    }

    await prisma.prospect.update({
      where: { id: prospectId },
      data: { status: "CONTACTED" },
    });

    return { success: true };
  } catch (error) {
    await prisma.emailActivity.update({
      where: { id: activity.id },
      data: { bounce: true },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Send failed",
    };
  }
}

export function getRandomDelay(): number {
  return (
    (Math.floor(
      Math.random() * (EMAIL_DELAY_MAX_SECONDS - EMAIL_DELAY_MIN_SECONDS)
    ) +
      EMAIL_DELAY_MIN_SECONDS) *
    1000
  );
}

export async function sendBatch(
  prospectIds: string[],
  generateEmail: (prospectId: string) => Promise<{ subject: string; body: string }>
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const id of prospectIds) {
    const { allowed } = await canSendEmail();
    if (!allowed) {
      errors.push("Daily limit reached, stopping batch");
      break;
    }

    try {
      const { subject, body } = await generateEmail(id);
      const result = await sendEmail(id, subject, body);

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${id}: ${result.error}`);
      }
    } catch (error) {
      failed++;
      errors.push(
        `${id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Wait between emails
    if (prospectIds.indexOf(id) < prospectIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, getRandomDelay()));
    }
  }

  return { sent, failed, errors };
}
