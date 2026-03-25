/**
 * One-shot script: validate company names on all existing prospects.
 * Run with: npx tsx scripts/validate-existing-names.ts
 */

// Load env vars before anything else
import { config } from "dotenv";
config({ path: ".env.local" });

// Use the project's Prisma client (pg adapter)
import { prisma } from "../src/lib/db";
import { validateCompanyNames } from "../src/lib/company-name-validation";

const BATCH_SIZE = 20;

async function main() {
  const mode = process.argv[2]; // --review to re-process flagged ones
  const isReviewMode = mode === "--review";

  console.log(isReviewMode
    ? "Fetching flagged/review prospects for re-validation..."
    : "Fetching unvalidated prospects...");

  const whereClause = isReviewMode
    ? { companyNameNeedsReview: true }
    : { companyNameConfidence: null };

  const prospects = await prisma.prospect.findMany({
    where: whereClause,
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

  // Run full validation pipeline (local rules → web scraping → AI) in batches
  const withResults: { prospect: typeof prospects[0]; result: Awaited<ReturnType<typeof validateCompanyNames>>[0] }[] = [];

  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(prospects.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} prospects)...`);

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
      console.error(`  Batch ${batchNum} failed:`, error);
      // Fallback: skip this batch
    }
  }

  // Update DB
  let cleaned = 0;
  let flagged = 0;
  let rejected = 0;
  let unchanged = 0;

  console.log("\nUpdating database...");

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
      console.log(`  CLEANED: "${prospect.companyName}" → "${finalName}"`);
    } else if (!result.isValid) {
      updateData.rawCompanyName = prospect.companyName;
      updateData.companyNameNeedsReview = true;
      rejected++;
      console.log(`  REJECTED: "${prospect.companyName}" (${result.reason})`);
    } else if (result.needsReview) {
      flagged++;
      console.log(`  FLAGGED: "${prospect.companyName}" (${result.reason})`);
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
            companyNameConfidence: result.confidence,
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
