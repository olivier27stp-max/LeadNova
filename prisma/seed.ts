import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_TCP_URL;
if (!connectionString) {
  throw new Error("DATABASE_TCP_URL environment variable is not set");
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const sampleProspects = [
  {
    companyName: "Gestion Immobilière ABC (t)",
    industry: "Gestion immobilière",
    city: "Montreal",
    address: "1234 Rue Sherbrooke, Montreal, QC",
    phone: "(514) 555-0101",
    website: "https://gestionabc.ca",
    email: "info@gestionabc.ca",
    source: "seed",
    leadScore: 55,
    status: "ENRICHED" as const,
  },
  {
    companyName: "Condo Plus Management (t)",
    industry: "Gestion de copropriété",
    city: "Montreal",
    address: "5678 Blvd Saint-Laurent, Montreal, QC",
    phone: "(514) 555-0202",
    website: "https://condoplus.ca",
    email: "contact@condoplus.ca",
    source: "seed",
    leadScore: 50,
    status: "ENRICHED" as const,
  },
  {
    companyName: "Propriétés Sherbrooke Inc. (t)",
    industry: "Gestion immobilière",
    city: "Sherbrooke",
    phone: "(819) 555-0303",
    website: "https://proprietessherbrooke.ca",
    source: "seed",
    leadScore: 30,
    status: "NEW" as const,
  },
  {
    companyName: "Immeubles Drummond (t)",
    industry: "Gestion de propriétés commerciales",
    city: "Drummondville",
    address: "100 Rue Lindsay, Drummondville, QC",
    phone: "(819) 555-0404",
    website: "https://immeublesdrummond.ca",
    email: "info@immeublesdrummond.ca",
    secondaryEmail: "maintenance@immeublesdrummond.ca",
    source: "seed",
    leadScore: 60,
    status: "ENRICHED" as const,
  },
  {
    companyName: "Gestion TR Immobilier (t)",
    industry: "Gestion immobilière",
    city: "Trois-Rivières",
    website: "https://gestiontr.ca",
    source: "seed",
    leadScore: 20,
    status: "NEW" as const,
  },
  {
    companyName: "Solutions Bâtiment Granby (t)",
    industry: "Entretien de bâtiments",
    city: "Granby",
    phone: "(450) 555-0606",
    email: "info@solutionsbatiment.ca",
    source: "seed",
    leadScore: 35,
    status: "ENRICHED" as const,
  },
  {
    companyName: "Groupe Habitation Québec (t)",
    industry: "Gestion immobilière",
    city: "Quebec",
    address: "200 Grande Allée, Québec, QC",
    phone: "(418) 555-0707",
    website: "https://groupehabitation.ca",
    email: "direction@groupehabitation.ca",
    source: "seed",
    leadScore: 55,
    status: "CONTACTED" as const,
  },
  {
    companyName: "Multi-Résidences Montréal (t)",
    industry: "Gestion de copropriété",
    city: "Montreal",
    address: "3000 Rue Notre-Dame, Montreal, QC",
    phone: "(514) 555-0808",
    website: "https://multiresidences.ca",
    email: "admin@multiresidences.ca",
    source: "seed",
    leadScore: 60,
    status: "REPLIED" as const,
  },
];

async function main() {
  console.log("Seeding database...");

  for (const prospect of sampleProspects) {
    await prisma.prospect.upsert({
      where: {
        companyName_city: {
          companyName: prospect.companyName,
          city: prospect.city,
        },
      },
      update: {},
      create: prospect,
    });
  }

  // Create a sample campaign
  await prisma.campaign.upsert({
    where: { id: "seed-campaign-1" },
    update: {},
    create: {
      id: "seed-campaign-1",
      name: "Campagne initiale - Gestion immobilière",
      status: "DRAFT",
      maxPerDay: 30,
      delayMinSeconds: 120,
      delayMaxSeconds: 300,
    },
  });

  // Create sample email activity for the "CONTACTED" prospect
  const contactedProspect = await prisma.prospect.findFirst({
    where: { status: "CONTACTED" },
  });

  if (contactedProspect) {
    await prisma.emailActivity.create({
      data: {
        prospectId: contactedProspect.id,
        emailSubject: "Services d'entretien pour vos propriétés à Quebec",
        emailBody:
          "Bonjour,\n\nJ'ai remarqué que Groupe Habitation Québec gère des propriétés dans la région de Quebec...",
        sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      },
    });
  }

  // Create email activity for the "REPLIED" prospect
  const repliedProspect = await prisma.prospect.findFirst({
    where: { status: "REPLIED" },
  });

  if (repliedProspect) {
    await prisma.emailActivity.create({
      data: {
        prospectId: repliedProspect.id,
        emailSubject: "Services d'entretien pour vos propriétés à Montreal",
        emailBody:
          "Bonjour,\n\nJ'ai remarqué que Multi-Résidences Montréal gère des propriétés...",
        sentAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        replyReceived: true,
      },
    });
  }

  console.log("Seed complete!");
  console.log(`  - ${sampleProspects.length} prospects created`);
  console.log(`  - 1 campaign created`);
  console.log(`  - 2 email activities created`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
