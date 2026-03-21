import { prisma } from "./db";
import { sendEmail, canSendEmail } from "./email-sender";
import { logActivity } from "./activity";

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
  prospect: { companyName: string; city?: string | null },
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

export async function processScheduledEmails(): Promise<{ processed: number; errors: string[] }> {
  const due = await prisma.scheduledEmail.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: 20,
  });

  let processed = 0;
  const errors: string[] = [];

  for (const scheduled of due) {
    // Mark as processing (optimistic lock — prevents duplicate sends)
    const locked = await prisma.scheduledEmail.updateMany({
      where: { id: scheduled.id, status: "PENDING" },
      data: { status: "SENT" }, // will update with real result below
    });
    if (locked.count === 0) continue; // already processed by another worker

    try {
      if (scheduled.campaignId) {
        // Campaign send
        const campaign = await prisma.campaign.findUnique({
          where: { id: scheduled.campaignId },
          include: {
            contacts: {
              include: {
                prospect: { select: { id: true, companyName: true, email: true, city: true } },
              },
            },
          },
        });

        if (!campaign || !campaign.emailSubject || !campaign.emailBody) {
          await prisma.scheduledEmail.update({
            where: { id: scheduled.id },
            data: { status: "FAILED", error: "Campagne ou message introuvable" },
          });
          errors.push(`${scheduled.id}: Campagne introuvable`);
          continue;
        }

        // Load company settings for template variable interpolation
        const settingsRecord = campaign.workspaceId
          ? await prisma.appSettings.findUnique({ where: { workspaceId: campaign.workspaceId } })
          : await prisma.appSettings.findFirst();
        const settingsData = settingsRecord?.data as Record<string, unknown> | null;
        const companySettings = (settingsData?.company || {}) as CompanySettings;

        const prospects = campaign.contacts.map((c) => c.prospect).filter((p) => p.email);
        let sent = 0;
        let failed = 0;

        for (const prospect of prospects) {
          const { allowed } = await canSendEmail();
          if (!allowed) break;

          const subject = interpolate(campaign.emailSubject, prospect, companySettings);
          const body = interpolate(campaign.emailBody, prospect, companySettings);
          const result = await sendEmail(prospect.id, subject, body);
          if (result.success) sent++;
          else failed++;

          if (prospects.indexOf(prospect) < prospects.length - 1) {
            await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
          }
        }

        await prisma.scheduledEmail.update({
          where: { id: scheduled.id },
          data: { status: "SENT", sentAt: new Date(), sentCount: sent, failedCount: failed },
        });

        await logActivity({
          action: "campaign_sent",
          type: sent > 0 ? "success" : "error",
          title: `Campagne "${campaign.name}" envoyée (planifié)`,
          details: `${sent} envoyé(s), ${failed} échoué(s)`,
          relatedEntityType: "campaign",
          relatedEntityId: campaign.id,
        });

      } else if (scheduled.prospectId && scheduled.subject && scheduled.body) {
        // Individual prospect send
        const { allowed } = await canSendEmail();
        if (!allowed) {
          await prisma.scheduledEmail.update({
            where: { id: scheduled.id },
            data: { status: "FAILED", error: "Limite journalière atteinte" },
          });
          continue;
        }

        const result = await sendEmail(scheduled.prospectId, scheduled.subject, scheduled.body);
        await prisma.scheduledEmail.update({
          where: { id: scheduled.id },
          data: {
            status: result.success ? "SENT" : "FAILED",
            sentAt: result.success ? new Date() : null,
            error: result.error || null,
          },
        });
      }

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      await prisma.scheduledEmail.update({
        where: { id: scheduled.id },
        data: { status: "FAILED", error: msg },
      });
      errors.push(`${scheduled.id}: ${msg}`);
    }
  }

  return { processed, errors };
}

/**
 * Auto follow-up: scans all ACTIVE campaigns that have a follow-up template,
 * finds contacts eligible for follow-up, and sends them automatically.
 * Runs from the cron scheduler.
 */
export async function processAutoFollowUps(): Promise<{ sent: number; errors: string[] }> {
  let totalSent = 0;
  const allErrors: string[] = [];

  // Find all active campaigns with follow-up templates
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      followUpSubject: { not: null },
      followUpBody: { not: null },
    },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      followUpSubject: true,
      followUpBody: true,
    },
  });

  for (const campaign of campaigns) {
    if (!campaign.followUpSubject || !campaign.followUpBody) continue;

    // Load workspace automation + company settings
    const settingsRow = campaign.workspaceId
      ? await prisma.appSettings.findUnique({ where: { workspaceId: campaign.workspaceId } })
      : await prisma.appSettings.findFirst();
    const settings = (settingsRow?.data as Record<string, unknown>) || {};
    const automation = (settings.automation as Record<string, unknown>) || {};
    const companySettings = ((settings.company || {}) as CompanySettings);

    const autoFollowUp = automation.autoFollowUp === true;
    if (!autoFollowUp) continue; // Auto follow-up disabled for this workspace

    const followUpDelayDays = (automation.followUpDelayDays as number) || 3;
    const maxFollowUps = (automation.maxFollowUps as number) || 3;
    const stopOnReply = automation.stopOnReply !== false;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - followUpDelayDays);

    // Get campaign contacts
    const campaignContacts = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id },
      include: {
        prospect: {
          select: { id: true, companyName: true, email: true, city: true },
        },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const cc of campaignContacts) {
      const prospect = cc.prospect;
      if (!prospect.email) continue;

      const { allowed } = await canSendEmail();
      if (!allowed) {
        allErrors.push(`${campaign.name}: Limite journalière atteinte`);
        break;
      }

      const emails = await prisma.emailActivity.findMany({
        where: { prospectId: prospect.id, bounce: false },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true, replyReceived: true },
      });

      if (emails.length === 0) continue;
      if (emails.length > maxFollowUps) continue;
      if (stopOnReply && emails.some((e) => e.replyReceived)) continue;
      if (emails[0].sentAt > cutoffDate) continue;

      const subject = interpolate(campaign.followUpSubject!, prospect, companySettings);
      const body = interpolate(campaign.followUpBody!, prospect, companySettings);
      const result = await sendEmail(prospect.id, subject, body, campaign.id);

      if (result.success) {
        sent++;
      } else {
        failed++;
        allErrors.push(`${campaign.name} → ${prospect.companyName}: ${result.error}`);
      }

      // Delay between sends
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
    }

    if (sent > 0 || failed > 0) {
      await logActivity({
        action: "followup_sent",
        type: sent > 0 ? "success" : "error",
        title: `Relances auto — ${campaign.name}`,
        details: `${sent} envoyé(s), ${failed} échoué(s)`,
        relatedEntityType: "campaign",
        relatedEntityId: campaign.id,
      });
    }

    totalSent += sent;
  }

  return { sent: totalSent, errors: allErrors };
}
