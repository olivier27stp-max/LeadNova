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

/** If date falls on Saturday or Sunday, push to the next Monday */
function skipWeekend(date: Date): Date {
  const day = date.getDay();
  if (day === 6) date.setDate(date.getDate() + 2); // Saturday → Monday
  else if (day === 0) date.setDate(date.getDate() + 1); // Sunday → Monday
  return date;
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
  // Recovery: reset emails stuck in PROCESSING for more than 10 minutes (crashed previous run)
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const recovered = await prisma.scheduledEmail.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lte: stuckCutoff },
    },
    data: { status: "PENDING" },
  });
  if (recovered.count > 0) {
    console.log(`[cron] Recovered ${recovered.count} stuck PROCESSING email(s)`);
  }

  const due = await prisma.scheduledEmail.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: 10,
  });

  if (due.length > 0) {
    console.log(`[cron] Found ${due.length} scheduled email(s) to process`);
  }

  let processed = 0;
  const errors: string[] = [];

  for (const scheduled of due) {
    // Mark as PROCESSING (optimistic lock — prevents duplicate sends)
    const locked = await prisma.scheduledEmail.updateMany({
      where: { id: scheduled.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (locked.count === 0) continue; // already picked up by another worker

    try {
      if (scheduled.campaignId) {
        // Campaign send
        const campaign = await prisma.campaign.findUnique({
          where: { id: scheduled.campaignId },
          select: {
            id: true,
            name: true,
            workspaceId: true,
            emailSubject: true,
            emailBody: true,
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

        // Use snapshot prospect IDs (saved at schedule time) — fall back to live campaign contacts
        let prospectIds: string[] = scheduled.snapshotProspectIds || [];
        if (prospectIds.length === 0) {
          const contacts = await prisma.campaignContact.findMany({
            where: { campaignId: scheduled.campaignId },
            select: { prospectId: true },
          });
          prospectIds = contacts.map((c) => c.prospectId);
        }

        if (prospectIds.length === 0) {
          await prisma.scheduledEmail.update({
            where: { id: scheduled.id },
            data: { status: "FAILED", error: "Aucun contact dans la campagne" },
          });
          errors.push(`${scheduled.id}: Aucun contact`);
          continue;
        }

        // Load prospects from snapshot IDs
        const allProspects = await prisma.prospect.findMany({
          where: { id: { in: prospectIds } },
          select: { id: true, companyName: true, email: true, city: true },
        });
        const withEmail = allProspects.filter((p) => p.email);

        // Skip prospects already emailed in this campaign (prevents duplicates across batches)
        const alreadySentIds = new Set<string>();
        for (const p of withEmail) {
          const existing = await prisma.emailActivity.findFirst({
            where: { prospectId: p.id, campaignId: campaign.id },
            select: { id: true },
          });
          if (existing) alreadySentIds.add(p.id);
        }
        const prospects = withEmail.filter((p) => !alreadySentIds.has(p.id));

        let sent = 0;
        let failed = 0;

        for (const prospect of prospects) {
          const { allowed } = await canSendEmail();
          if (!allowed) break;

          const subject = interpolate(campaign.emailSubject, prospect, companySettings);
          const body = interpolate(campaign.emailBody, prospect, companySettings);
          const result = await sendEmail(prospect.id, subject, body, campaign.id);
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

        // Update campaign lastSentAt so follow-ups can be scheduled correctly
        if (sent > 0) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { lastSentAt: new Date(), status: "ACTIVE" },
          });
        }

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

  // Find all active campaigns with follow-up templates (legacy or new array)
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      followUpSubject: true,
      followUpBody: true,
      followUps: true,
    },
  });

  for (const campaign of campaigns) {
    // Build ordered follow-up templates: prefer new followUps array, fall back to legacy fields
    interface FollowUpTemplate { subject: string; body: string; }
    const followUpTemplates: FollowUpTemplate[] = [];
    const rawFollowUps = campaign.followUps as unknown;
    if (Array.isArray(rawFollowUps) && rawFollowUps.length > 0) {
      for (const fu of rawFollowUps) {
        const f = fu as { subject?: string; body?: string };
        if (f.subject || f.body) followUpTemplates.push({ subject: f.subject || "", body: f.body || "" });
      }
    }
    // Fall back to legacy single follow-up fields
    if (followUpTemplates.length === 0 && campaign.followUpSubject && campaign.followUpBody) {
      followUpTemplates.push({ subject: campaign.followUpSubject, body: campaign.followUpBody });
    }
    if (followUpTemplates.length === 0) continue; // No follow-up configured

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
    const maxFollowUps = Math.min((automation.maxFollowUps as number) || 3, followUpTemplates.length);
    const followUpDelays = Array.isArray(automation.followUpDelays) ? (automation.followUpDelays as number[]) : [];
    const followUpIntervalDays = (automation.followUpIntervalDays as number) || 5;
    const stopOnReply = automation.stopOnReply !== false;
    const shouldSkipWeekends = automation.skipWeekends !== false;

    // If skipWeekends is enabled and today is a weekend, skip this campaign entirely
    const todayDay = new Date().getDay();
    if (shouldSkipWeekends && (todayDay === 0 || todayDay === 6)) continue;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - followUpDelayDays);

    // Get campaign contacts
    const campaignContacts = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id },
      include: {
        prospect: {
          select: { id: true, companyName: true, email: true, city: true, status: true },
        },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const cc of campaignContacts) {
      const prospect = cc.prospect;
      if (!prospect.email) continue;
      if (prospect.status === "BOUNCED") continue;

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

      if (emails.length === 0) continue; // No initial email sent yet
      if (stopOnReply && emails.some((e) => e.replyReceived)) continue;

      // Determine which follow-up number this would be
      // emails.length = 1 → need follow-up #1 (index 0), emails.length = 2 → follow-up #2 (index 1), etc.
      const followUpIndex = emails.length - 1;
      if (followUpIndex >= maxFollowUps) continue; // Already sent all follow-ups
      if (followUpIndex >= followUpTemplates.length) continue; // No template for this follow-up

      // First email must be older than followUpDelayDays (initial delay before any follow-up starts)
      const firstEmail = emails[emails.length - 1]; // oldest (ordered desc)
      if (firstEmail.sentAt > cutoffDate) continue;

      // Per-follow-up delay: use followUpDelays[followUpIndex] if available, else fallback to followUpIntervalDays
      const delayForThisFollowUp = followUpDelays[followUpIndex] || followUpIntervalDays;
      const intervalCutoff = new Date();
      intervalCutoff.setDate(intervalCutoff.getDate() - delayForThisFollowUp);
      // Last email must be older than the interval for this follow-up
      if (emails[0].sentAt > intervalCutoff) continue;

      const template = followUpTemplates[followUpIndex];
      const subject = interpolate(template.subject, prospect, companySettings);
      const body = interpolate(template.body, prospect, companySettings);
      const result = await sendEmail(prospect.id, subject, body, campaign.id, { followUpIndex: followUpIndex + 1 });

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
