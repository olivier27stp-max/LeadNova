// Pipeline de vente : cold email → setting call → closing call → inscription → payant.
// Une seule source de vérité : Prospect.salesStage. Chaque changement est inscrit dans
// activity_logs (action « sales_stage », metadata { from, to }) : c'est l'historique daté
// qui sert aux taux du funnel par période.

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { SALES_STAGES, stageRank, type ActiveStage, type SalesStage } from "@/lib/sales-stages";

export * from "@/lib/sales-stages";

interface SetStageOptions {
  workspaceId: string;
  prospectId: string;
  companyName: string;
  from: string | null;
  to: SalesStage | null;
  lostReason?: string | null;
  lostReasonLabel?: string | null;
  userId?: string | null;
}

/** Change l'étape d'un prospect et l'inscrit dans l'historique. */
export async function setSalesStage(o: SetStageOptions) {
  const updated = await prisma.prospect.update({
    where: { id: o.prospectId },
    data: {
      salesStage: o.to,
      lostReason: o.to === "LOST" ? o.lostReason ?? null : null,
      ...(o.to === "WON" ? { status: "QUALIFIED" } : {}),
    },
    select: { id: true, salesStage: true, lostReason: true, status: true },
  });

  await logActivity({
    action: "sales_stage",
    type: o.to === "WON" ? "success" : "info",
    title: `${o.companyName} : ${o.to ? SALES_STAGES[o.to] : "retiré du pipeline"}`,
    details: o.to === "LOST" && o.lostReasonLabel ? `Raison : ${o.lostReasonLabel}` : undefined,
    userId: o.userId ?? undefined,
    workspaceId: o.workspaceId,
    relatedEntityType: "prospect",
    relatedEntityId: o.prospectId,
    metadata: { from: o.from ?? "", to: o.to ?? "" },
  });

  return updated;
}

/**
 * Avance le prospect jusqu'à `to` seulement s'il est plus bas dans le pipeline
 * (jamais de recul, et un prospect perdu reste perdu). Retourne true si l'étape a changé.
 */
export async function advanceSalesStage(o: Omit<SetStageOptions, "to" | "lostReason" | "lostReasonLabel"> & { to: ActiveStage }) {
  if (o.from === "LOST" || stageRank(o.from) >= stageRank(o.to)) return false;
  await setSalesStage(o);
  return true;
}
