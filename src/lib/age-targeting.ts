// Ciblage par âge après une découverte, entièrement côté serveur :
// cherche l'année d'immatriculation des nouveaux prospects du lot, puis ajoute à la campagne
// ceux qui ont l'âge voulu (sources sûres). Avant, c'était la page Prospects qui pilotait
// ces étapes : page fermée ou rechargée = aucun prospect ajouté à la campagne, sans message.
import { prisma } from "./db";
import { logActivity } from "./activity";
import { analyzeRegistration, saveRegistration, type RegistrationResult } from "./registration-finder";

const BATCH_SIZE = 6;
const CONCURRENCY = 3;

/** Années d'immatriculation qui correspondent à l'âge voulu (lt3 = moins de 3 ans, gte3 = 3 ans et plus…). */
export function ageYearRange(age: string, nowYear: number): { gt?: number; lte?: number } | null {
  const maxAge = ({ lt3: 3, lt5: 5 } as Record<string, number>)[age];
  const minAge = ({ gte3: 3, gte5: 5, gte10: 10 } as Record<string, number>)[age];
  if (maxAge) return { gt: nowYear - maxAge };
  if (minAge) return { lte: nowYear - minAge };
  return null;
}

/** Ajoute à la campagne les prospects du lot qui ont l'âge voulu (sources sûres seulement). */
export async function addBatchToCampaignByAge(params: {
  workspaceId: string;
  batchId: string;
  campaignId: string;
  companyAge: string | null | undefined;
  userId?: string;
}): Promise<{ matched: number; added: number } | null> {
  const { workspaceId, batchId, campaignId, companyAge, userId } = params;
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { id: true } });
  if (!campaign) return null;
  const range = companyAge ? ageYearRange(companyAge, new Date().getFullYear()) : null;
  const keep = await prisma.prospect.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      importBatchId: batchId,
      ...(range ? { registrationYear: range, registrationSource: { not: "domaine" } } : {}),
    },
    select: { id: true },
  });
  let added = 0;
  for (const p of keep) {
    try {
      await prisma.campaignContact.create({ data: { campaignId: campaign.id, prospectId: p.id } });
      added++;
    } catch { /* déjà dans la campagne */ }
  }
  await logActivity({
    action: "find_registration",
    type: "success",
    title: `Ciblage par âge : ${added} prospect(s) ajouté(s) à la campagne`,
    details: `${keep.length} prospect(s) de la découverte ont l'âge voulu (${companyAge ?? "tous"}, sources sûres)`,
    workspaceId,
    userId,
    relatedEntityType: "campaign",
    relatedEntityId: campaign.id,
  });
  return { matched: keep.length, added };
}

/**
 * Cherche l'année de tous les prospects du lot pas encore cherchés, puis les ajoute à la campagne
 * selon l'âge. Chaque prospect n'est essayé qu'une fois (une erreur de l'IA ne fait pas boucler).
 */
export async function runAgeTargetingForBatch(params: {
  workspaceId: string;
  batchId: string;
  campaignId: string;
  companyAge: string;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}): Promise<{ matched: number; added: number; checked: number; errors: number } | null> {
  const { workspaceId, batchId, campaignId, companyAge, onProgress, isCancelled } = params;
  const pendingWhere = { workspaceId, archivedAt: null, registrationCheckedAt: null, importBatchId: batchId };
  const total = await prisma.prospect.count({ where: pendingWhere });
  const attempted: string[] = [];
  let errors = 0;

  if (process.env.ANTHROPIC_API_KEY) {
    while (!isCancelled?.()) {
      const batch = await prisma.prospect.findMany({
        where: { ...pendingWhere, id: { notIn: attempted } },
        select: { id: true, companyName: true, city: true, phone: true, website: true },
        orderBy: { leadScore: "desc" },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;
      attempted.push(...batch.map((p) => p.id));

      const results: Array<{ id: string; r: RegistrationResult }> = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < batch.length) {
          const p = batch[cursor++];
          try {
            results.push({ id: p.id, r: await analyzeRegistration(p) });
          } catch (err) {
            console.error(`[age-targeting] ${p.id} failed:`, err);
            results.push({ id: p.id, r: { status: "error", reason: "exception", fields: null } });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

      // Écritures une à la fois (pool Prisma)
      for (const { id, r } of results) {
        if (r.status === "error") errors++;
        await saveRegistration(id, r);
      }
      onProgress?.(attempted.length, total);
    }
  } else {
    console.error("[age-targeting] ANTHROPIC_API_KEY manquante : années non cherchées");
  }

  const res = await addBatchToCampaignByAge({ workspaceId, batchId, campaignId, companyAge });
  return res ? { ...res, checked: attempted.length, errors } : null;
}
