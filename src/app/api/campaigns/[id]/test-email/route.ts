import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { wrapInEmailTemplate, getTextFooter, getLogoAttachment, type CompanyInfo } from "@/lib/email-template";
import { decrypt } from "@/lib/crypto";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import fs from "fs";
import pathMod from "path";

// ─── Types ───────────────────────────────────────────────

interface CompanySettings {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  emailSignature?: string;
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function interpolate(
  template: string,
  company: CompanySettings
): string {
  return template
    .replace(/\{\{company_name\}\}/g, "Acme Corp")
    .replace(/\{\{city\}\}/g, titleCase("Montréal"))
    .replace(/\{\{contact_name\}\}/g, "Madame, Monsieur")
    .replace(/\{\{company_email\}\}/g, company.email || "")
    .replace(/\{\{company_phone\}\}/g, company.phone || "")
    .replace(/\{\{company_website\}\}/g, company.website || "")
    .replace(/\{\{company_address\}\}/g, company.address || "")
    .replace(/\{\{company_city\}\}/g, company.city || "")
    .replace(/\{\{company_province\}\}/g, company.province || "")
    .replace(/\{\{company_postal_code\}\}/g, company.postalCode || "")
    .replace(/\{\{company_country\}\}/g, company.country || "")
    .replace(/\{\{sender_name\}\}/g, company.name || "");
}

// POST /api/campaigns/[id]/test-email
// Body: { to: string, type: "main" | "followup" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const { to, type } = await req.json();

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
    }

    // Fetch campaign
    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    const subject = type === "followup" ? campaign.followUpSubject : campaign.emailSubject;
    const body = type === "followup" ? campaign.followUpBody : campaign.emailBody;

    if (!subject || !body) {
      return NextResponse.json(
        { error: type === "followup" ? "Le follow-up n'est pas configuré" : "Le message principal n'est pas configuré" },
        { status: 400 }
      );
    }

    // Load settings
    const settingsRecord = await prisma.appSettings.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });
    const settingsData = settingsRecord?.data as Record<string, unknown> | null;
    const companySettings = (settingsData?.company || {}) as CompanySettings;
    const emailSettings = (settingsData?.email || {}) as Record<string, string>;

    // Interpolate with sample data
    const interpolatedSubject = "[TEST] " + interpolate(subject, companySettings);
    const interpolatedBody = interpolate(body, companySettings);

    // Build company info for template
    const companyInfo: CompanyInfo = {
      name: companySettings.name || undefined,
      email: companySettings.email || undefined,
      phone: companySettings.phone || undefined,
      website: companySettings.website || undefined,
      address: companySettings.address || undefined,
      city: companySettings.city || undefined,
      province: companySettings.province || undefined,
      postalCode: companySettings.postalCode || undefined,
      country: companySettings.country || undefined,
      emailSignature: companySettings.emailSignature || undefined,
    };

    const logoUrl = emailSettings?.logoUrl || undefined;
    const logoEnabled = emailSettings?.logoEnabled !== undefined
      ? String(emailSettings.logoEnabled) !== "false"
      : true;

    const html = wrapInEmailTemplate(interpolatedBody, companyInfo, undefined, undefined, logoEnabled);
    const text = interpolatedBody + getTextFooter(companyInfo, undefined);

    // Determine sender info
    const contactEmail = companySettings.email || "";
    const smtpHost = emailSettings?.smtpHost || process.env.SMTP_HOST || "";
    const smtpPort = parseInt(emailSettings?.smtpPort || process.env.SMTP_PORT || "587", 10);
    const smtpUser = emailSettings?.smtpUser || process.env.SMTP_USER || "";
    const smtpPass = decrypt(emailSettings?.smtpPass || "") || process.env.SMTP_PASS || "";
    const fromName = companySettings.name || process.env.COMPANY_NAME || "";
    const fromEmail = contactEmail || emailSettings?.senderEmail || smtpUser || process.env.SMTP_FROM || "";
    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    // Provider detection
    const rawProvider = emailSettings?.provider || "";
    let provider: "resend" | "smtp" = "smtp";
    let finalSmtpHost = smtpHost;

    if (rawProvider === "gmail") {
      finalSmtpHost = "smtp.gmail.com";
    } else if (rawProvider === "outlook") {
      finalSmtpHost = "smtp.office365.com";
    } else if (rawProvider === "resend" || (!smtpHost && process.env.RESEND_API_KEY)) {
      provider = "resend";
    }

    if (rawProvider === "gmail" || rawProvider === "outlook" || (rawProvider === "smtp" && finalSmtpHost)) {
      provider = "smtp";
    }

    if (provider === "resend") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "RESEND_API_KEY non configurée" }, { status: 500 });
      }
      const resend = new Resend(apiKey);

      // Handle logo for Resend (public URL approach)
      let finalHtml = html;
      if (logoEnabled && logoUrl) {
        const appUrl = process.env.APP_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
        if (appUrl) {
          const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
          const path = logoUrl.startsWith("/") ? logoUrl : `/${logoUrl}`;
          finalHtml = html.replace(/src="cid:company-logo"/g, `src="${base}${path}"`);
        }
      }

      const freeMailDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "aol.com"];
      const domain = contactEmail.split("@")[1] || "";
      const isFreeMail = !contactEmail || freeMailDomains.includes(domain.toLowerCase());
      const resendFrom = isFreeMail
        ? `${fromName || "LeadNova"} <onboarding@resend.dev>`
        : from;

      await resend.emails.send({
        from: resendFrom,
        to,
        subject: interpolatedSubject,
        html: finalHtml,
        text,
        replyTo: contactEmail || undefined,
      });
    } else {
      // SMTP
      const transporter = nodemailer.createTransport({
        host: finalSmtpHost || smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      let finalHtml = html;
      const attachments: object[] = [];

      if (logoEnabled && logoUrl) {
        const logoAttachment = getLogoAttachment(logoUrl);
        if (logoAttachment) {
          attachments.push(logoAttachment);
        }
      }

      await transporter.sendMail({
        from,
        replyTo: contactEmail || undefined,
        to,
        subject: interpolatedSubject,
        text,
        html: finalHtml,
        attachments,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Test email error:", error);
    return handleWorkspaceError(error);
  }
}
