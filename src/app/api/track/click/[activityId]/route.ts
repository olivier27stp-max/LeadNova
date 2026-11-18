import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signClick } from "@/lib/tracking";

// GET /api/track/click/:activityId?u=<url>&s=<signature> — compte le clic puis redirige
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await params;
  const url = req.nextUrl.searchParams.get("u") || "";
  const sig = req.nextUrl.searchParams.get("s") || "";

  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("protocole");
  } catch {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }
  if (sig !== signClick(activityId, url)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }

  try {
    const activity = await prisma.emailActivity.findUnique({
      where: { id: activityId },
      select: { prospectId: true, firstClickedAt: true },
    });
    if (activity) {
      const now = new Date();
      await prisma.emailActivity.update({
        where: { id: activityId },
        data: { clickCount: { increment: 1 }, lastClickedAt: now, ...(activity.firstClickedAt ? {} : { firstClickedAt: now }) },
      });
      await prisma.prospect.update({
        where: { id: activity.prospectId },
        data: { emailClickCount: { increment: 1 }, lastEngagedAt: now },
      });
    }
  } catch {
    // le suivi ne doit jamais bloquer la redirection
  }

  // Paramètre lu par le script de suivi des visites installé sur le site de destination
  target.searchParams.set("lnr", activityId);
  return NextResponse.redirect(target.toString(), 302);
}
