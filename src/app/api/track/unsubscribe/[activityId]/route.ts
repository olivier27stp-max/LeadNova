import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";

const PAGE_STYLE = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    .card { text-align: center; padding: 48px 32px; max-width: 420px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 15px; color: #6b7280; margin: 0; line-height: 1.6; }
    button { margin-top: 24px; font-size: 15px; padding: 10px 20px; border-radius: 8px; border: none; background: #111827; color: #fff; cursor: pointer; }`;

/**
 * GET : page de confirmation avec un bouton (les antivirus / aperçus de liens
 * qui ouvrent le lien ne désabonnent donc personne).
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Se désabonner</title>
  <style>${PAGE_STYLE}
  </style>
</head>
<body>
  <div class="card">
    <h1>Se désabonner</h1>
    <p>Confirmez pour ne plus recevoir nos courriels.</p>
    <form method="POST">
      <input type="hidden" name="List-Unsubscribe" value="One-Click">
      <button type="submit">Confirmer le désabonnement</button>
    </form>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * POST : désabonnement réel — bouton de la page ci-dessus, ou désabonnement
 * en un clic de Gmail / Yahoo (en-tête List-Unsubscribe-Post: One-Click).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await params;

  try {
    // Find the email activity to get the prospect's email
    const activity = await prisma.emailActivity.findUnique({
      where: { id: activityId },
      include: { prospect: { select: { email: true, companyName: true, workspaceId: true } } },
    });

    if (activity?.prospect?.email && activity.prospect.workspaceId) {
      const wsId = activity.prospect.workspaceId;

      // Mark this activity as unsubscribed
      await prisma.emailActivity.update({
        where: { id: activityId },
        data: { unsubscribed: true },
      });

      // Add to blacklist so no future emails are sent
      await prisma.blacklist.upsert({
        where: {
          workspaceId_email: {
            workspaceId: wsId,
            email: activity.prospect.email,
          },
        },
        update: { reason: "unsubscribed" },
        create: {
          email: activity.prospect.email,
          reason: "unsubscribed",
          workspaceId: wsId,
        },
      });

      if (!activity.unsubscribed) {
        await logActivity({
          action: "prospect_unsubscribed",
          type: "warning",
          title: `Désabonnement — ${activity.prospect.companyName}`,
          details: activity.prospect.email,
          workspaceId: wsId,
          relatedEntityType: "prospect",
          relatedEntityId: activity.prospectId,
        });
      }
    }
  } catch (error) {
    console.error("[unsubscribe]", error);
  }

  // Always show a confirmation page
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Désabonnement confirmé</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    .card { text-align: center; padding: 48px 32px; max-width: 420px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 15px; color: #6b7280; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Désabonnement confirmé</h1>
    <p>Vous ne recevrez plus d'emails de notre part. Si c'est une erreur, contactez-nous directement.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
