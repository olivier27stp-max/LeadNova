/**
 * One-shot script: validate company names on all existing prospects.
 * Run with: npx tsx scripts/validate-existing-names.ts
 */

// Load env vars before anything else
import { config } from "dotenv";
config({ path: ".env.local" });

// Use the project's Prisma client (pg adapter)
import { prisma } from "../src/lib/db";
import { localCleanCompanyName, validateCompanyNames } from "../src/lib/company-name-validation";

const AI_BATCH_SIZE = 20;

async function main() {
  console.log("Fetching unvalidated prospects...");

  const prospects = await prisma.prospect.findMany({
    where: { companyNameConfidence: null },
    select: {
      id: true,
      companyName: true,
      website: true,
      city: true,
      industry: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${prospects.length} prospects to validate.\n`);

  if (prospects.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Layer 1: local rules
  const withLocal = prospects.map((p) => ({
    prospect: p,
    local: localCleanCompanyName(p.companyName),
  }));

  // Layer 2: AI for uncertain ones
  const needsAI = withLocal.filter(
    ({ local }) => local.isValid && (local.confidence < 0.85 || local.needsReview)
  );

  console.log(`Local rules done. ${needsAI.length} need AI validation.`);

  if (needsAI.length > 0 && process.env.ANTHROPIC_API_KEY) {
    for (let i = 0; i < needsAI.length; i += AI_BATCH_SIZE) {
      const batch = needsAI.slice(i, i + AI_BATCH_SIZE);
      const batchNum = Math.floor(i / AI_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(needsAI.length / AI_BATCH_SIZE);
      console.log(`  AI batch ${batchNum}/${totalBatches} (${batch.length} names)...`);

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
        console.error(`  AI batch ${batchNum} failed:`, error);
      }
    }
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  ANTHROPIC_API_KEY not set, skipping AI layer.");
  }

  // Update DB
  let cleaned = 0;
  let flagged = 0;
  let rejected = 0;
  let unchanged = 0;

  console.log("\nUpdating database...");

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
      console.log(`  CLEANED: "${prospect.companyName}" → "${finalName}"`);
    } else if (!local.isValid) {
      updateData.rawCompanyName = prospect.companyName;
      updateData.companyNameNeedsReview = true;
      rejected++;
      console.log(`  REJECTED: "${prospect.companyName}" (${local.reason})`);
    } else if (local.needsReview) {
      flagged++;
      console.log(`  FLAGGED: "${prospect.companyName}" (${local.reason})`);
    } else {
      unchanged++;
    }

    try {
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: updateData,
      });
    } catch (error: unknown) {
      // Unique constraint violation — cleaned name conflicts with existing prospect
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2002") {
        // Just update metadata without changing the name
        await prisma.prospect.update({
          where: { id: prospect.id },
          data: {
            companyNameConfidence: local.confidence,
            companyNameNeedsReview: true,
            rawCompanyName: prospect.companyName,
          },
        });
        flagged++;
        if (nameChanged) cleaned--; // undo the cleaned count
        console.log(`  DUPLICATE: "${finalName}" already exists, flagged for review`);
      } else {
        throw error;
      }
    }
  }

  console.log(`
${"─".repeat(50)}
RESULTS:
  Processed: ${prospects.length}
  Cleaned:   ${cleaned}
  Flagged:   ${flagged}
  Rejected:  ${rejected}
  Unchanged: ${unchanged}
${"─".repeat(50)}`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
