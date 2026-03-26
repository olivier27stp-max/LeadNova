import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, canSendEmail, getRandomDelay } from "@/lib/email-sender";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

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
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function interpolate(
  template: string,
  prospect: { companyName: string; city: string | null; email: string | null },
  company: CompanySettings
): string {
  return template
    .replace(/\{\{company_name\}\}/g, prospect.companyName)
    .replace(/\{\{city\}\}/g, titleCase(prospect.city || "votre région"))
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

interface FollowUpTemplate { subject: string; body: string; }

function buildFollowUpTemplates(campaign: {
  followUps: unknown;
  followUpSubject: string | null;
  followUpBody: string | null;
}): FollowUpTemplate[] {
  const templates: FollowUpTemplate[] = [];
  const raw = campaign.followUps as unknown;
  if (Array.isArray(raw) && raw.length > 0) {
    for (const fu of raw) {
      const f = fu as { subject?: string; body?: string };
      if (f.subject || f.body) templates.push({ subject: f.subject || "", body: f.body || "" });
    }
  }
  // Fall back to legacy single follow-up fields
  if (templates.length === 0 && campaign.followUpSubject && campaign.followUpBody) {
    templates.push({ subject: campaign.followUpSubject, body: campaign.followUpBody });
  }
  return templates;
}

async function loadAutomationSettings(workspaceId: string) {
  const settingsRow = await prisma.appSettings.findUnique({ where: { workspaceId } });
  const settings = (settingsRow?.data as Record<string, unknown>) || {};
  const automation = (settings.automation as Record<string, unknown>) || {};
  return {
    followUpDelayDays: (automation.followUpDelayDays as number) || 3,
    maxFollowUps: (automation.maxFollowUps as number) || 3,
    followUpIntervalDays: (automation.followUpIntervalDays as number) || 5,
    followUpDelays: Array.isArray(automation.followUpDelays) ? (automation.followUpDelays as number[]) : [],
    stopOnReply: automation.stopOnReply !== false,
    companySettings: ((settings.company || {}) as CompanySettings),
  };
}

// GET: List contacts eligible for follow-up in this campaign
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        name: true,
        status: true,
        followUpSubject: true,
        followUpBody: true,
        followUps: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Build follow-up templates: prefer followUps array, fall back to legacy fields
    const followUpTemplates = buildFollowUpTemplates(campaign);

    const { followUpDelayDays, maxFollowUps, stopOnReply, followUpDelays, followUpIntervalDays } = await loadAutomationSettings(ctx.workspaceId);
    const effectiveMaxFollowUps = Math.min(maxFollowUps, followUpTemplates.length);

    const campaignContacts = await prisma.campaignContact.findMany({
      where: { campaignId: id },
      include: {
        prospect: {
          select: {
            id: true,
            companyName: true,
            email: true,
            city: true,
            status: true,
          },
        },
      },
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - followUpDelayDays);

    // Batch fetch all email activities for campaign contacts
    const prospectIds = campaignContacts
      .filter((cc) => cc.prospect.email)
      .map((cc) => cc.prospect.id);

    const allEmails = prospectIds.length > 0
      ? await prisma.emailActivity.findMany({
          where: { prospectId: { in: prospectIds }, campaignId: id, bounce: false },
          orderBy: { sentAt: "desc" },
          select: { prospectId: true, sentAt: true, replyReceived: true },
        })
      : [];

    const emailsByProspect = new Map<string, typeof allEmails>();
    for (const email of allEmails) {
      const list = emailsByProspect.get(email.prospectId) || [];
      list.push(email);
      emailsByProspect.set(email.prospectId, list);
    }

    const eligible: Array<{
      prospectId: string;
      companyName: string;
      email: string | null;
      lastEmailAt: string | null;
      emailCount: number;
      followUpIndex: number;
      hasReply: boolean;
    }> = [];

    for (const cc of campaignContacts) {
      const prospect = cc.prospect;
      if (!prospect.email) continue;

      const emails = emailsByProspect.get(prospect.id) || [];

      if (emails.length === 0) continue;
      const followUpIndex = emails.length - 1;
      if (followUpIndex >= effectiveMaxFollowUps) continue;
      if (stopOnReply && emails.some((e) => e.replyReceived)) continue;

      // Check initial delay
      const firstEmail = emails[emails.length - 1]; // oldest
      if (firstEmail.sentAt > cutoffDate) continue;

      // Check per-follow-up interval delay
      const delayForThis = followUpDelays[followUpIndex] || followUpIntervalDays;
      const intervalCutoff = new Date();
      intervalCutoff.setDate(intervalCutoff.getDate() - delayForThis);
      if (emails[0].sentAt > intervalCutoff) continue;

      eligible.push({
        prospectId: prospect.id,
        companyName: prospect.companyName,
        email: prospect.email,
        lastEmailAt: emails[0].sentAt.toISOString(),
        emailCount: emails.length,
        followUpIndex,
        hasReply: false,
      });
    }

    return NextResponse.json({
      campaignId: id,
      campaignName: campaign.name,
      hasFollowUpTemplate: followUpTemplates.length > 0,
      followUpDelayDays,
      maxFollowUps: effectiveMaxFollowUps,
      eligible,
      total: eligible.length,
    });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST: Send follow-up emails to eligible contacts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = await request.json();
    const { prospectIds } = body;

    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        name: true,
        status: true,
        followUpSubject: true,
        followUpBody: true,
        followUps: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Build follow-up templates: prefer followUps array, fall back to legacy fields
    const followUpTemplates = buildFollowUpTemplates(campaign);

    if (followUpTemplates.length === 0) {
      return NextResponse.json(
        { error: "Aucun template de follow-up configuré pour cette campagne" },
        { status: 400 }
      );
    }

    const { followUpDelayDays, maxFollowUps, stopOnReply, companySettings, followUpDelays, followUpIntervalDays } = await loadAutomationSettings(ctx.workspaceId);
    const effectiveMaxFollowUps = Math.min(maxFollowUps, followUpTemplates.length);

    const whereClause: Record<string, unknown> = { campaignId: id };
    if (prospectIds?.length) {
      whereClause.prospectId = { in: prospectIds };
    }

    const campaignContacts = await prisma.campaignContact.findMany({
      where: whereClause,
      include: {
        prospect: {
          select: {
            id: true,
            companyName: true,
            email: true,
            city: true,
          },
        },
      },
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - followUpDelayDays);

    // Batch fetch all email activities for these contacts
    const postProspectIds = campaignContacts
      .filter((cc) => cc.prospect.email)
      .map((cc) => cc.prospect.id);

    const allPostEmails = postProspectIds.length > 0
      ? await prisma.emailActivity.findMany({
          where: { prospectId: { in: postProspectIds }, campaignId: id, bounce: false },
          orderBy: { sentAt: "desc" },
          select: { prospectId: true, sentAt: true, replyReceived: true },
        })
      : [];

    const postEmailsByProspect = new Map<string, typeof allPostEmails>();
    for (const email of allPostEmails) {
      const list = postEmailsByProspect.get(email.prospectId) || [];
      list.push(email);
      postEmailsByProspect.set(email.prospectId, list);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const cc of campaignContacts) {
      const prospect = cc.prospect;
      if (!prospect.email) {
        skipped++;
        continue;
      }

      const { allowed } = await canSendEmail();
      if (!allowed) {
        errors.push("Limite journalière atteinte");
        break;
      }

      const emails = postEmailsByProspect.get(prospect.id) || [];

      if (emails.length === 0) { skipped++; continue; }
      const followUpIndex = emails.length - 1;
      if (followUpIndex >= effectiveMaxFollowUps) { skipped++; continue; }
      if (stopOnReply && emails.some((e) => e.replyReceived)) { skipped++; continue; }

      // Check initial delay
      const firstEmail = emails[emails.length - 1]; // oldest
      if (firstEmail.sentAt > cutoffDate) { skipped++; continue; }

      // Check per-follow-up interval delay
      const delayForThis = followUpDelays[followUpIndex] || followUpIntervalDays;
      const intervalCutoff = new Date();
      intervalCutoff.setDate(intervalCutoff.getDate() - delayForThis);
      if (emails[0].sentAt > intervalCutoff) { skipped++; continue; }

      const template = followUpTemplates[followUpIndex];
      const subject = interpolate(template.subject, prospect, companySettings);
      const emailBody = interpolate(template.body, prospect, companySettings);

      const result = await sendEmail(prospect.id, subject, emailBody, id, { followUpIndex: followUpIndex + 1 });

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${prospect.companyName}: ${result.error}`);
      }

      if (sent + failed < campaignContacts.length) {
        await new Promise((resolve) => setTimeout(resolve, getRandomDelay()));
      }
    }

    await logActivity({
      action: "followup_sent",
      type: sent > 0 ? "success" : "info",
      title: `Relances envoyées — ${campaign.name}`,
      details: `${sent} envoyé${sent !== 1 ? "s" : ""}, ${skipped} ignoré${skipped !== 1 ? "s" : ""}, ${failed} échoué${failed !== 1 ? "s" : ""}`,
      metadata: { campaignId: id, sent, skipped, failed },
    });

    return NextResponse.json({ sent, skipped, failed, errors });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
