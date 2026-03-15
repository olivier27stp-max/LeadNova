import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await params;

  try {
    // Find the email activity to get the prospect's email
    const activity = await prisma.emailActivity.findUnique({
      where: { id: activityId },
      include: { prospect: { select: { email: true, companyName: true } } },
    });

    if (activity?.prospect?.email) {
      // Mark this activity as unsubscribed
      await prisma.emailActivity.update({
        where: { id: activityId },
        data: { unsubscribed: true },
      });

      // Add to blacklist so no future emails are sent
      await prisma.blacklist.upsert({
        where: {
          workspaceId_email: {
            workspaceId: "default",
            email: activity.prospect.email,
          },
        },
        update: { reason: "unsubscribed" },
        create: {
          email: activity.prospect.email,
          reason: "unsubscribed",
          workspaceId: "default",
        },
      });
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
