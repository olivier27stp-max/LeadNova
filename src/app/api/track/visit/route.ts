import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * GET /api/track/visit?a=<activityId> — page vue sur le site de l'expéditeur (ex. lumecrm.net)
 * par un prospect arrivé depuis un lien de courriel. Appelé par le script de suivi (pixel image, pas de CORS).
 */
export async function GET(req: NextRequest) {
  const activityId = req.nextUrl.searchParams.get("a") || "";
  if (activityId) {
    try {
      const activity = await prisma.emailActivity.findUnique({ where: { id: activityId }, select: { prospectId: true } });
      if (activity) {
        const now = new Date();
        await prisma.prospect.update({
          where: { id: activity.prospectId },
          data: { siteVisitCount: { increment: 1 }, lastSiteVisitAt: now, lastEngagedAt: now },
        });
      }
    } catch {
      // silencieux
    }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private" },
  });
}
