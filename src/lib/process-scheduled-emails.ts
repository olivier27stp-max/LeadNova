import { prisma } from "./db";
import { sendEmail, canSendEmail } from "./email-sender";
import { logActivity } from "./activity";

function interpolate(template: string, prospect: { companyName: string; city?: string | null }): string {
  return template
    .replace(/\{\{company_name\}\}/g, prospect.companyName)
    .replace(/\{\{city\}\}/g, prospect.city || "votre région")
    .replace(/\{\{contact_name\}\}/g, "Madame, Monsieur");
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

        const prospects = campaign.contacts.map((c) => c.prospect).filter((p) => p.email);
        let sent = 0;
        let failed = 0;

        for (const prospect of prospects) {
          const { allowed } = await canSendEmail();
          if (!allowed) break;

          const subject = interpolate(campaign.emailSubject, prospect);
          const body = interpolate(campaign.emailBody, prospect);
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
