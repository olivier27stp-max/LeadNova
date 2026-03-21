import { prisma } from "../src/lib/db";

const VALID_TYPES = ["prospect", "client", "nouveau_client"];

async function main() {
  const bad = await prisma.prospect.findMany({
    where: { contactType: { notIn: VALID_TYPES } },
    select: { id: true, contactType: true },
  });
  console.log("Found", bad.length, "prospects with invalid contactType");
  if (bad.length > 0) {
    console.log("Examples:", bad.slice(0, 3).map((b) => b.contactType?.substring(0, 80)));
    const result = await prisma.prospect.updateMany({
      where: { contactType: { notIn: VALID_TYPES } },
      data: { contactType: "prospect" },
    });
    console.log("Fixed", result.count, "prospects");
  }
  await prisma.$disconnect();
}

main().catch(console.error);
