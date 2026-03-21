import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail, canSendEmail } from "@/lib/email-sender";
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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const ctx = await requireWorkspaceContext();
  const { id } = await params;

  // Fetch campaign — verify workspace ownership
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
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

  // Load company settings (source of truth for template variables)
  const settingsRecord = await prisma.appSettings.findUnique({
    where: { workspaceId: ctx.workspaceId },
  });
  const settingsData = settingsRecord?.data as Record<string, unknown> | null;
  const companySettings = (settingsData?.company || {}) as CompanySettings;

  // Block sending if contact email is not configured
  if (!companySettings.email) {
    return NextResponse.json(
      { error: "Aucun email de contact configuré. Allez dans Paramètres → Entreprise pour renseigner votre email avant d'envoyer." },
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

    const subject = interpolate(campaign.emailSubject, prospect, companySettings);
    const body = interpolate(campaign.emailBody, prospect, companySettings);

    const result = await sendEmail(prospect.id, subject, body, id);

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

  // Update campaign: mark as ACTIVE and record last sent time (used for follow-up scheduling)
  if (sent > 0) {
    await prisma.campaign.update({
      where: { id },
      data: {
        lastSentAt: new Date(),
        status: "ACTIVE",
      },
    });
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
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
