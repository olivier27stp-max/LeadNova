import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateCompanyNames } from "@/lib/company-name-validation";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

const BATCH_SIZE = 20;

// POST /api/prospects/validate-names — run company name validation on all existing prospects
export async function POST() {
  try {
    const ctx = await requireWorkspaceContext();

    // Fetch all prospects that haven't been validated yet (no confidence score)
    const prospects = await prisma.prospect.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        companyNameConfidence: null,
        archivedAt: null,
      },
      select: {
        id: true,
        companyName: true,
        website: true,
        city: true,
        industry: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (prospects.length === 0) {
      return NextResponse.json({ message: "Tous les prospects sont déjà validés.", processed: 0, cleaned: 0, flagged: 0, rejected: 0 });
    }

    let cleaned = 0;
    let flagged = 0;
    let rejected = 0;
    let unchanged = 0;

    // Run full validation pipeline (local rules → web scraping → AI) in batches
    const withResults: { prospect: typeof prospects[0]; result: Awaited<ReturnType<typeof validateCompanyNames>>[0] }[] = [];

    for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
      const batch = prospects.slice(i, i + BATCH_SIZE);
      try {
        const inputs = batch.map((p) => ({
          rawName: p.companyName,
          website: p.website || undefined,
          city: p.city || undefined,
          industry: p.industry || undefined,
        }));
        const results = await validateCompanyNames(inputs);
        for (let j = 0; j < batch.length; j++) {
          withResults.push({ prospect: batch[j], result: results[j] });
        }
      } catch (error) {
        console.error("[validate-names] Batch failed:", error);
      }
    }

    // Update all prospects in DB
    for (const { prospect, result } of withResults) {
      const finalName = result.cleanName || prospect.companyName;
      const nameChanged = finalName !== prospect.companyName;

      const updateData: Record<string, unknown> = {
        companyNameConfidence: result.confidence,
        companyNameNeedsReview: result.needsReview,
      };

      if (nameChanged && result.isValid) {
        updateData.rawCompanyName = prospect.companyName;
        updateData.companyName = finalName;
        cleaned++;
      } else if (!result.isValid) {
        updateData.rawCompanyName = prospect.companyName;
        updateData.companyNameNeedsReview = true;
        rejected++;
      } else if (result.needsReview) {
        flagged++;
      } else {
        unchanged++;
      }

      await prisma.prospect.update({
        where: { id: prospect.id },
        data: updateData,
      });
    }

    return NextResponse.json({
      message: "Validation terminée",
      processed: prospects.length,
      cleaned,
      flagged,
      rejected,
      unchanged,
    });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
