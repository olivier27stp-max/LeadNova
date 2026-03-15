import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, canSendEmail } from "@/lib/email-sender";
import { logActivity } from "@/lib/activity";

function interpolate(template: string, prospect: { companyName: string; city?: string | null }): string {
  return template
    .replace(/\{\{company_name\}\}/g, prospect.companyName)
    .replace(/\{\{city\}\}/g, prospect.city || "votre région")
    .replace(/\{\{contact_name\}\}/g, "Madame, Monsieur");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // SMTP can be configured in Settings > Email or via env vars — validated at send time

  // Fetch campaign with selected contacts
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      contacts: {
        include: {
          prospect: {
            select: { id: true, companyName: true, email: true, city: true },
          },
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  }
  if (!campaign.emailSubject || !campaign.emailBody) {
    return NextResponse.json(
      { error: "Le message de la campagne n'est pas configuré. Renseignez le sujet et le corps de l'email." },
      { status: 400 }
    );
  }

  const prospects = campaign.contacts.map((c) => c.prospect);
  const withEmail = prospects.filter((p) => p.email);
  const skippedNoEmail = prospects.length - withEmail.length;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const prospect of withEmail) {
    const { allowed, reason } = await canSendEmail();
    if (!allowed) {
      errors.push(`Limite journalière atteinte: ${reason}`);
      break;
    }

    const subject = interpolate(campaign.emailSubject, prospect);
    const body = interpolate(campaign.emailBody, prospect);

    const result = await sendEmail(prospect.id, subject, body);

    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`${prospect.companyName}: ${result.error}`);
    }

    // Small delay between sends (2-5 seconds)
    if (withEmail.indexOf(prospect) < withEmail.length - 1) {
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
    }
  }

  await logActivity({
    action: "campaign_sent",
    type: sent > 0 ? "success" : "error",
    title: `Campagne "${campaign.name}" envoyée`,
    details: `${sent} envoyé(s), ${failed} échoué(s), ${skippedNoEmail} sans email`,
    relatedEntityType: "campaign",
    relatedEntityId: id,
  });

  return NextResponse.json({ sent, failed, skippedNoEmail, errors });
}
