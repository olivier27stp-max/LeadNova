import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, canSendEmail, getRandomDelay } from "@/lib/email-sender";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// Template variable substitution
function substituteVariables(
  template: string,
  prospect: { companyName: string; city: string | null; email: string | null }
): string {
  return template
    .replace(/\{\{company_name\}\}/g, prospect.companyName)
    .replace(/\{\{city\}\}/g, prospect.city || "votre ville")
    .replace(/\{\{contact_name\}\}/g, "");
}

// GET: List contacts eligible for follow-up in this campaign
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;

    // Load campaign — verify workspace ownership
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

    // Load automation settings
    const settingsRow = await prisma.appSettings.findFirst({ where: { id: "singleton" } });
    const settings = (settingsRow?.data as Record<string, unknown>) || {};
    const automation = (settings.automation as Record<string, unknown>) || {};
    const followUpDelayDays = (automation.followUpDelayDays as number) || 3;
    const maxFollowUps = (automation.maxFollowUps as number) || 3;
    const stopOnReply = automation.stopOnReply !== false;

    // Find campaign contacts
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

    // Check each contact's email history sequentially (connection_limit=1)
    for (const cc of campaignContacts) {
      const prospect = cc.prospect;
      if (!prospect.email) continue;

      // Count emails sent to this prospect
      const emails = await prisma.emailActivity.findMany({
        where: { prospectId: prospect.id, bounce: false },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, replyReceived: true },
      });

      const emailCount = emails.length;
      if (emailCount === 0) continue; // Never contacted — not eligible for follow-up
      if (emailCount > maxFollowUps) continue; // Already hit max follow-ups

      const hasReply = stopOnReply && emails.some((e) => e.replyReceived);
      if (hasReply) continue; // Got a reply — skip

      const lastEmail = emails[0];
      if (lastEmail.sentAt > cutoffDate) continue; // Too recent — wait

      eligible.push({
        prospectId: prospect.id,
        companyName: prospect.companyName,
        email: prospect.email,
        lastEmailAt: lastEmail.sentAt.toISOString(),
        emailCount,
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
    const { prospectIds } = body; // Optional: send to specific prospects only

    // Load campaign — verify workspace ownership
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

    // Load automation settings
    const settingsRow = await prisma.appSettings.findFirst({ where: { id: "singleton" } });
    const settings = (settingsRow?.data as Record<string, unknown>) || {};
    const automation = (settings.automation as Record<string, unknown>) || {};
    const followUpDelayDays = (automation.followUpDelayDays as number) || 3;
    const maxFollowUps = (automation.maxFollowUps as number) || 3;
    const stopOnReply = automation.stopOnReply !== false;

    // Get campaign contacts
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

      // Check daily limit
      const { allowed } = await canSendEmail();
      if (!allowed) {
        errors.push("Limite journalière atteinte");
        break;
      }

      // Check email history
      const emails = await prisma.emailActivity.findMany({
        where: { prospectId: prospect.id, bounce: false },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, replyReceived: true },
      });

      if (emails.length === 0) { skipped++; continue; }
      if (emails.length > maxFollowUps) { skipped++; continue; }
      if (stopOnReply && emails.some((e) => e.replyReceived)) { skipped++; continue; }
      if (emails[0].sentAt > cutoffDate) { skipped++; continue; }

      // Substitute variables and send
      const subject = substituteVariables(campaign.followUpSubject!, prospect);
      const emailBody = substituteVariables(campaign.followUpBody!, prospect);

      const result = await sendEmail(prospect.id, subject, emailBody, id);

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${prospect.companyName}: ${result.error}`);
      }

      // Delay between emails
      if (sent + failed < campaignContacts.length) {
        await new Promise((resolve) => setTimeout(resolve, getRandomDelay()));
      }
    }

    // Log activity
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
