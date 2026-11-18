import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await params;

  try {
    // Chaque ouverture est comptée (3+ ouvertures = probablement relu ou transféré au patron)
    const activity = await prisma.emailActivity.findUnique({
      where: { id: activityId },
      select: { prospectId: true, openedAt: true },
    });
    if (activity) {
      const now = new Date();
      await prisma.emailActivity.update({
        where: { id: activityId },
        data: { openCount: { increment: 1 }, lastOpenedAt: now, ...(activity.openedAt ? {} : { openedAt: now }) },
      });
      await prisma.prospect.update({
        where: { id: activity.prospectId },
        data: { emailOpenCount: { increment: 1 }, lastEngagedAt: now },
      });
    }
  } catch {
    // silently ignore — always return the pixel
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}
