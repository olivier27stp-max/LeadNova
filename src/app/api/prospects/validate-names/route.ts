import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateCompanyNames, localCleanCompanyName } from "@/lib/company-name-validation";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

const AI_BATCH_SIZE = 20;

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

    // Step 1: Apply local rules to all prospects
    const withLocal = prospects.map((p) => ({
      prospect: p,
      local: localCleanCompanyName(p.companyName),
    }));

    // Step 2: Collect prospects needing AI validation
    const needsAI = withLocal.filter(
      ({ local }) => local.isValid && (local.confidence < 0.85 || local.needsReview)
    );

    // Step 3: Batch AI validation
    if (needsAI.length > 0 && process.env.ANTHROPIC_API_KEY) {
      for (let i = 0; i < needsAI.length; i += AI_BATCH_SIZE) {
        const batch = needsAI.slice(i, i + AI_BATCH_SIZE);
        try {
          const aiInputs = batch.map(({ prospect }) => ({
            rawName: prospect.companyName,
            website: prospect.website || undefined,
            city: prospect.city || undefined,
            industry: prospect.industry || undefined,
          }));
          const aiResults = await validateCompanyNames(aiInputs);
          for (let j = 0; j < batch.length; j++) {
            if (aiResults[j]) {
              batch[j].local = aiResults[j];
            }
          }
        } catch (error) {
          console.error("[validate-names] AI batch failed, keeping local results:", error);
        }
      }
    }

    // Step 4: Update all prospects in DB
    for (const { prospect, local } of withLocal) {
      const finalName = local.cleanName || prospect.companyName;
      const nameChanged = finalName !== prospect.companyName;

      const updateData: Record<string, unknown> = {
        companyNameConfidence: local.confidence,
        companyNameNeedsReview: local.needsReview,
      };

      if (nameChanged && local.isValid) {
        updateData.rawCompanyName = prospect.companyName;
        updateData.companyName = finalName;
        cleaned++;
      } else if (!local.isValid) {
        // Mark invalid but don't delete — store raw and flag
        updateData.rawCompanyName = prospect.companyName;
        updateData.companyNameNeedsReview = true;
        rejected++;
      } else if (local.needsReview) {
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
