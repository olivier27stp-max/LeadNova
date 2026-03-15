import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { verifyEmailBatch } from "@/lib/email-verifier";
import { logActivity } from "@/lib/activity";

// GET /api/verify-emails/stats — returns status counts
// GET /api/verify-emails?campaignId=xxx — unverified count for a campaign
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (campaignId) {
    // Return unverified count for a specific campaign
    const contacts = await prisma.campaignContact.findMany({
      where: { campaignId },
      select: { prospect: { select: { email: true, emailStatus: true } } },
    });
    const total = contacts.filter((c) => c.prospect.email).length;
    const unverified = contacts.filter(
      (c) => c.prospect.email && (!c.prospect.emailStatus || c.prospect.emailStatus === "unknown")
    ).length;
    return NextResponse.json({ total, unverified });
  }

  // Return just the IDs for batching (for progress bar)
  if (searchParams.get("ids") === "1") {
    const all = await prisma.prospect.findMany({
      where: { workspaceId: ctx.workspaceId, email: { not: null }, archivedAt: null },
      select: { id: true },
    });
    return NextResponse.json({ ids: all.map((p) => p.id) });
  }

  // Global stats for workspace
  const prospects = await prisma.prospect.findMany({
    where: { workspaceId: ctx.workspaceId, email: { not: null }, archivedAt: null },
    select: { emailStatus: true },
  });

  const stats = {
    total: prospects.length,
    valid: 0,
    risky: 0,
    invalid: 0,
    "catch-all": 0,
    disposable: 0,
    unknown: 0,
  };

  for (const p of prospects) {
    const s = (p.emailStatus ?? "unknown") as keyof typeof stats;
    if (s in stats) (stats as Record<string, number>)[s]++;
    else stats.unknown++;
  }

  return NextResponse.json(stats);
}

// POST /api/verify-emails — bulk verify
// body: { scope: "all" | "campaign", campaignId?: string }
export async function POST(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const { scope, campaignId, ids } = body as { scope?: string; campaignId?: string; ids?: string[] };

  let prospects: Array<{ id: string; email: string | null }> = [];

  if (ids && Array.isArray(ids) && ids.length > 0) {
    // Batch mode: verify only the given IDs
    prospects = await prisma.prospect.findMany({
      where: { id: { in: ids }, workspaceId: ctx.workspaceId, email: { not: null }, archivedAt: null },
      select: { id: true, email: true },
    });
  } else if (scope === "campaign" && campaignId) {
    const contacts = await prisma.campaignContact.findMany({
      where: { campaignId },
      select: { prospect: { select: { id: true, email: true } } },
    });
    prospects = contacts
      .map((c) => c.prospect)
      .filter((p): p is { id: string; email: string } => !!p.email);
  } else {
    prospects = await prisma.prospect.findMany({
      where: { workspaceId: ctx.workspaceId, email: { not: null }, archivedAt: null },
      select: { id: true, email: true },
    });
  }

  const withEmail = prospects.filter((p): p is { id: string; email: string } => !!p.email);

  if (withEmail.length === 0) {
    return NextResponse.json({ verified: 0, stats: {} });
  }

  try {
    const results = await verifyEmailBatch(withEmail);

    // Update prospects sequentially
    for (const { id, result } of results) {
      await prisma.prospect.update({
        where: { id },
        data: {
          emailStatus: result.status,
          emailVerifiedAt: new Date(),
          emailVerificationResult: result as object,
        },
      });
    }

    const statCounts = { valid: 0, risky: 0, invalid: 0, "catch-all": 0, disposable: 0, unknown: 0 };
    for (const { result } of results) {
      const s = result.status as keyof typeof statCounts;
      if (s in statCounts) statCounts[s]++;
    }

    await logActivity({
      action: "emails_verified",
      type: "success",
      title: `${results.length} emails vérifiés`,
      details: `Valides: ${statCounts.valid}, Risqués: ${statCounts.risky}, Invalides: ${statCounts.invalid}, Jetables: ${statCounts.disposable}`,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ verified: results.length, stats: statCounts });
  } catch (err) {
    console.error("Email verification failed:", err);
    return NextResponse.json(
      { error: "Erreur lors de la vérification des emails" },
      { status: 500 }
    );
  }
}
