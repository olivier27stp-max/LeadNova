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

async function loadAutomationSettings(workspaceId: string) {
  const settingsRow = await prisma.appSettings.findUnique({ where: { workspaceId } });
  const settings = (settingsRow?.data as Record<string, unknown>) || {};
  const automation = (settings.automation as Record<string, unknown>) || {};
  return {
    followUpDelayDays: (automation.followUpDelayDays as number) || 3,
    maxFollowUps: (automation.maxFollowUps as number) || 3,
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
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { followUpDelayDays, maxFollowUps, stopOnReply } = await loadAutomationSettings(ctx.workspaceId);

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

    const eligible: Array<{
      prospectId: string;
      companyName: string;
      email: string | null;
      lastEmailAt: string | null;
      emailCount: number;
      hasReply: boolean;
    }> = [];

    for (const cc of campaignContacts) {
      const prospect = cc.prospect;
      if (!prospect.email) continue;

      const emails = await prisma.emailActivity.findMany({
        where: { prospectId: prospect.id, bounce: false },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, replyReceived: true },
      });

      if (emails.length === 0) continue;
      if (emails.length > maxFollowUps) continue;
      if (stopOnReply && emails.some((e) => e.replyReceived)) continue;
      if (emails[0].sentAt > cutoffDate) continue;

      eligible.push({
        prospectId: prospect.id,
        companyName: prospect.companyName,
        email: prospect.email,
        lastEmailAt: emails[0].sentAt.toISOString(),
        emailCount: emails.length,
        hasReply: false,
      });
    }

    return NextResponse.json({
      campaignId: id,
      campaignName: campaign.name,
      hasFollowUpTemplate: !!(campaign.followUpSubject && campaign.followUpBody),
      followUpDelayDays,
      maxFollowUps,
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
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!campaign.followUpSubject || !campaign.followUpBody) {
      return NextResponse.json(
        { error: "Aucun template de follow-up configuré pour cette campagne" },
        { status: 400 }
      );
    }

    const { followUpDelayDays, maxFollowUps, stopOnReply, companySettings } = await loadAutomationSettings(ctx.workspaceId);

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

      const emails = await prisma.emailActivity.findMany({
        where: { prospectId: prospect.id, bounce: false },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, replyReceived: true },
      });

      if (emails.length === 0) { skipped++; continue; }
      if (emails.length > maxFollowUps) { skipped++; continue; }
      if (stopOnReply && emails.some((e) => e.replyReceived)) { skipped++; continue; }
      if (emails[0].sentAt > cutoffDate) { skipped++; continue; }

      const subject = interpolate(campaign.followUpSubject!, prospect, companySettings);
      const emailBody = interpolate(campaign.followUpBody!, prospect, companySettings);

      const result = await sendEmail(prospect.id, subject, emailBody, id);

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
