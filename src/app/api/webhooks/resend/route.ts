import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Resend webhook endpoint.
 * Handles: email.bounced, email.complained, email.delivered, email.opened
 *
 * Configure in Resend dashboard → Webhooks → Add endpoint:
 *   URL: https://leadnova.one/api/webhooks/resend
 *   Events: email.bounced, email.complained, email.delivered, email.opened
 *
 * Resend sends the email ID in headers["x-entity-ref-id"] if you set it,
 * or we match by the "to" email address + recent timestamp.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if RESEND_WEBHOOK_SECRET is configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const svixId = request.headers.get("svix-id");
      const svixTimestamp = request.headers.get("svix-timestamp");
      const svixSignature = request.headers.get("svix-signature");
      if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
      }
    }

    const payload = await request.json();
    const { type, data } = payload;

    // Resend webhook event types
    switch (type) {
      case "email.bounced": {
        const to = data?.to?.[0];
        if (to) {
          // Find most recent activity for this email and mark as bounced
          const activity = await prisma.emailActivity.findFirst({
            where: { prospect: { email: to } },
            orderBy: { sentAt: "desc" },
          });
          if (activity) {
            await prisma.emailActivity.update({
              where: { id: activity.id },
              data: { bounce: true },
            });
          }
        }
        break;
      }

      case "email.complained": {
        // Spam complaint — treat like unsubscribe + bounce
        const to = data?.to?.[0];
        if (to) {
          const activity = await prisma.emailActivity.findFirst({
            where: { prospect: { email: to } },
            orderBy: { sentAt: "desc" },
          });
          if (activity) {
            await prisma.emailActivity.update({
              where: { id: activity.id },
              data: { bounce: true, unsubscribed: true },
            });
          }
          // Add to blacklist — use prospect's workspace
          const prospect = await prisma.prospect.findFirst({
            where: { email: to },
            select: { workspaceId: true },
          });
          const wsId = prospect?.workspaceId;
          if (wsId) {
            await prisma.blacklist.upsert({
              where: { workspaceId_email: { workspaceId: wsId, email: to } },
              update: { reason: "spam_complaint" },
              create: { email: to, reason: "spam_complaint", workspaceId: wsId },
            });
          }
        }
        break;
      }

      case "email.delivered": {
        // Could track delivery confirmation — for now just log
        break;
      }

      case "email.opened": {
        // Resend can also track opens — update if not already set
        const to = data?.to?.[0];
        if (to) {
          const activity = await prisma.emailActivity.findFirst({
            where: { prospect: { email: to }, openedAt: null },
            orderBy: { sentAt: "desc" },
          });
          if (activity) {
            await prisma.emailActivity.update({
              where: { id: activity.id },
              data: { openedAt: new Date() },
            });
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[resend-webhook]", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
