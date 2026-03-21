import nodemailer from "nodemailer";
import { Resend } from "resend";
import fs from "fs";
import pathMod from "path";
import { prisma } from "./db";
import { DAILY_EMAIL_LIMIT, EMAIL_DELAY_MIN_SECONDS, EMAIL_DELAY_MAX_SECONDS } from "./config";
import { wrapInEmailTemplate, getTextFooter, getLogoAttachment, type CompanyInfo } from "./email-template";
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
  logoEnabled: boolean;
  provider: "resend" | "smtp";
  smtp: SmtpConfig;
  companyInfo: CompanyInfo;
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

  try {
    const record = workspaceId
      ? await prisma.appSettings.findUnique({ where: { workspaceId } })
      : await prisma.appSettings.findFirst();
    const data = record?.data as Record<string, unknown> | null;
    const emailSettings = data?.email as Record<string, string> | null;
    const companySettings = data?.company as Record<string, string> | null;

    const smtp = buildSmtpConfig(emailSettings);

    // Contact email from Settings → Company → Contact Email (source of truth)
    const contactEmail = companySettings?.email || "";

    // FROM email: contactEmail > senderEmail override > SMTP user > env fallback
    const fromEmail = contactEmail
      || emailSettings?.senderEmail
      || smtp.auth.user
      || process.env.SMTP_FROM
      || process.env.SMTP_USER
      || "";

    // FROM name: company name > env fallback
    const fromName = companySettings?.name || process.env.COMPANY_NAME || "";
    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    // Reply-To = always the Contact Email from Settings (not SMTP user or fallbacks)
    const replyTo = contactEmail || fromEmail || undefined;

    const logoUrl = emailSettings?.logoUrl || undefined;
    const logoEnabled = emailSettings?.logoEnabled !== undefined
      ? String(emailSettings.logoEnabled) !== "false"
      : true;

    // Provider detection — "gmail" and "outlook" are SMTP with pre-configured hosts
    const rawProvider = emailSettings?.provider || "";
    let smtpHost = emailSettings?.smtpHost || process.env.SMTP_HOST || "";
    if (rawProvider === "gmail") {
      smtpHost = "smtp.gmail.com";
      smtp.host = "smtp.gmail.com";
      smtp.port = 587;
      smtp.secure = false;
    } else if (rawProvider === "outlook") {
      smtpHost = "smtp.office365.com";
      smtp.host = "smtp.office365.com";
      smtp.port = 587;
      smtp.secure = false;
    }

    let provider: "resend" | "smtp";
    if (rawProvider === "gmail" || rawProvider === "outlook") {
      provider = "smtp";
    } else if (emailSettings?.provider === "resend") {
      provider = "resend";
    } else if (emailSettings?.provider === "smtp" && smtpHost && !smtpHost.includes("localhost") && !smtpHost.includes("127.0.0.1")) {
      provider = "smtp";
    } else if (process.env.RESEND_API_KEY) {
      provider = "resend";
    } else if (smtpHost) {
      provider = "smtp";
    } else {
      provider = fallbackProvider;
    }

    // Build company info from DB settings — source of truth for templates
    const companyInfo: CompanyInfo = {
      name: companySettings?.name || undefined,
      email: companySettings?.email || undefined,
      phone: companySettings?.phone || undefined,
      website: companySettings?.website || undefined,
      address: companySettings?.address || undefined,
      city: companySettings?.city || undefined,
      province: companySettings?.province || undefined,
      postalCode: companySettings?.postalCode || undefined,
      country: companySettings?.country || undefined,
      emailSignature: companySettings?.emailSignature || undefined,
    };

    return { from, replyTo, logoUrl, logoEnabled, provider, smtp, companyInfo };
  } catch {
    const fallbackFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "";
    return { from: fallbackFrom, provider: fallbackProvider, smtp: fallbackSmtp, logoEnabled: true, companyInfo: {} };
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

  // Logo strategy for Resend:
  // 1. Best: public URL (works everywhere including Gmail) — requires APP_URL
  // 2. Fallback: read file from disk + embed as base64 data URI
  //    (won't show in Gmail but works in Apple Mail, Outlook, etc. — acceptable for local dev)
  let finalHtml = html;
  let attachments: Array<{ filename: string; content: Buffer; content_type: string }> | undefined;

  if (senderInfo.logoEnabled && senderInfo.logoUrl) {
    const publicLogoUrl = resolvePublicLogoUrl(senderInfo.logoUrl);
    if (publicLogoUrl) {
      finalHtml = html.replace(/src="cid:company-logo"/g, `src="${publicLogoUrl}"`);
    } else {
      // Local dev fallback: read file from disk and embed as base64
      const logoFile = readLogoFromDisk(senderInfo.logoUrl);
      if (logoFile) {
        const base64 = logoFile.content.toString("base64");
        const dataUri = `data:${logoFile.contentType};base64,${base64}`;
        finalHtml = html.replace(/src="cid:company-logo"/g, `src="${dataUri}"`);
        // Also attach the file so email clients that support attachments can reference it
        attachments = [{
          filename: logoFile.filename,
          content: logoFile.content,
          content_type: logoFile.contentType,
        }];
      }
    }
  }

  // Resend requires a verified domain for From.
  // Free mail domains (gmail, hotmail, etc.) cannot be used as From.
  // Strategy: use company name + verified domain as From, contactEmail as Reply-To.
  const contactEmail = senderInfo.replyTo
    || senderInfo.from.match(/<(.+)>/)?.[1]
    || senderInfo.from;
  const contactDomain = contactEmail.split("@")[1] || "";
  const freeMailDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "aol.com"];
  const isFreeMail = !contactEmail || freeMailDomains.includes(contactDomain.toLowerCase());
  const companyName = senderInfo.companyInfo.name || "LeadNova";

  // If the contactEmail domain is verified on Resend, use it directly.
  // Otherwise, use onboarding@resend.dev with the company name as display name.
  const resendFrom = isFreeMail
    ? `${companyName} <onboarding@resend.dev>`
    : senderInfo.from;

  await resend.emails.send({
    from: resendFrom,
    to,
    subject,
    html: finalHtml,
    text,
    attachments,
    // Reply-To always points to the real contactEmail from Settings
    replyTo: contactEmail || undefined,
    headers: unsubscribeUrl ? {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    } : undefined,
  });
}

/**
 * Reads a logo file from disk (public/ directory).
 */
function readLogoFromDisk(logoUrl: string): { filename: string; content: Buffer; contentType: string } | null {
  try {
    let filePath: string;
    if (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) {
      filePath = pathMod.join(process.cwd(), "public", logoUrl.slice(1));
    } else {
      filePath = pathMod.join(process.cwd(), "public", "leadnova-logo.png");
    }
    if (!fs.existsSync(filePath)) return null;
    const ext = pathMod.extname(filePath).slice(1).toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    };
    return {
      filename: `logo.${ext}`,
      content: fs.readFileSync(filePath),
      contentType: mimeMap[ext] || "image/png",
    };
  } catch {
    return null;
  }
}

/**
 * Resolves a logo path (e.g. "/upload-123.jpeg") to a fully public URL.
 * Required because email clients (especially Gmail) strip base64 data URIs
 * and CID attachments don't work with Resend.
 */
function resolvePublicLogoUrl(logoUrl: string): string | null {
  if (!logoUrl) return null;
  // Already a full URL
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;
  // Local path like "/upload-123.jpeg" — prepend APP_URL
  const appUrl = process.env.APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!appUrl) return null;
  const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  const path = logoUrl.startsWith("/") ? logoUrl : `/${logoUrl}`;
  return `${base}${path}`;
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  text: string,
  senderInfo: SenderInfo,
  unsubscribeUrl?: string
): Promise<void> {
  const transporter = nodemailer.createTransport(senderInfo.smtp);

  // SMTP: use CID inline attachment (file embedded in email — works offline, no public URL needed).
  // Nodemailer natively supports CID, and the template already uses src="cid:company-logo".
  let finalHtml = html;
  let attachments: object[] = [];

  if (senderInfo.logoEnabled && senderInfo.logoUrl) {
    const logoAttachment = getLogoAttachment(senderInfo.logoUrl);
    if (logoAttachment) {
      // Keep src="cid:company-logo" as-is — nodemailer resolves it via the attachment CID
      attachments = [logoAttachment];
    }
  }

  await transporter.sendMail({
    from: senderInfo.from,
    ...(senderInfo.replyTo ? { replyTo: senderInfo.replyTo } : {}),
    to,
    subject,
    text,
    html: finalHtml,
    attachments,
    ...(unsubscribeUrl ? {
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    } : {}),
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

async function isBlacklisted(email: string, workspaceId?: string | null): Promise<boolean> {
  const domain = email.split("@")[1];

  const match = await prisma.blacklist.findFirst({
    where: {
      OR: [{ email }, { domain }],
      ...(workspaceId ? { workspaceId } : {}),
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

  if (await isBlacklisted(prospect.email, prospect.workspaceId)) {
    return { success: false, error: "Email is blacklisted" };
  }

  const { allowed, reason } = await canSendEmail();
  if (!allowed) {
    return { success: false, error: reason };
  }

  const senderInfo = await getSenderInfo(prospect.workspaceId);

  // Block if no sender email configured
  const senderEmail = senderInfo.replyTo || senderInfo.from.match(/<(.+)>/)?.[1] || senderInfo.from;
  if (!senderEmail || !senderEmail.includes("@")) {
    return { success: false, error: "Aucun email de contact configuré. Allez dans Paramètres → Entreprise." };
  }

  // Auto-detect campaign if not provided
  let resolvedCampaignId = campaignId || null;
  if (!resolvedCampaignId) {
    const campaignContact = await prisma.campaignContact.findFirst({
      where: { prospectId },
      orderBy: { createdAt: "desc" },
      select: { campaignId: true },
    });
    if (campaignContact) resolvedCampaignId = campaignContact.campaignId;
  }

  const activity = await prisma.emailActivity.create({
    data: {
      prospectId,
      campaignId: resolvedCampaignId,
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

  const html = wrapInEmailTemplate(body, senderInfo.companyInfo, trackingPixelUrl, unsubscribeUrl, senderInfo.logoEnabled);
  const text = body + getTextFooter(senderInfo.companyInfo, unsubscribeUrl);

  try {
    if (senderInfo.provider === "resend") {
      await sendViaResend(prospect.email, subject, html, text, senderInfo, unsubscribeUrl);
    } else {
      await sendViaSmtp(prospect.email, subject, html, text, senderInfo, unsubscribeUrl);
    }

    await prisma.prospect.update({
      where: { id: prospectId },
      data: { status: "CONTACTED" },
    });

    // Update campaign lastSentAt so follow-ups appear in calendar (section 2a)
    if (resolvedCampaignId) {
      await prisma.campaign.update({
        where: { id: resolvedCampaignId },
        data: { lastSentAt: new Date(), status: "ACTIVE" },
      });
    }

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
