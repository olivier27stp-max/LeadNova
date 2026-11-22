// Étapes du pipeline de vente (sans dépendance serveur : utilisable côté client).
// cold email → setting call → closing call → inscription → payant.
// Les clés DEMO_* et TRIAL datent de la première version (démo = closing call, essai = inscription) ;
// elles sont gardées telles quelles pour ne pas réécrire les données existantes.

export const PIPELINE_STAGES = [
  { key: "POSITIVE_REPLY", label: "Réponse positive", short: "Réponse +" },
  { key: "SETTING_BOOKED", label: "Setting call prévu", short: "Setting prévu" },
  { key: "SETTING_DONE", label: "Setting call fait", short: "Setting fait" },
  { key: "DEMO_BOOKED", label: "Closing call prévu", short: "Closing prévu" },
  { key: "DEMO_DONE", label: "Closing call fait", short: "Closing fait" },
  { key: "TRIAL", label: "Inscrit", short: "Inscrit" },
  { key: "WON", label: "Payant", short: "Payant" },
] as const;

export type ActiveStage = (typeof PIPELINE_STAGES)[number]["key"];
export type SalesStage = ActiveStage | "LOST";

/** Libellés de toutes les étapes, y compris « Perdu » (ordre du pipeline) */
export const SALES_STAGES: Record<SalesStage, string> = {
  ...(Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, s.label])) as Record<ActiveStage, string>),
  LOST: "Perdu",
};

/** Rang dans le pipeline (1 = réponse positive … 7 = payant) ; 0 = aucune étape ou perdu */
export function stageRank(stage: string | null | undefined): number {
  const i = PIPELINE_STAGES.findIndex((s) => s.key === stage);
  return i + 1;
}

export function isSalesStage(value: unknown): value is SalesStage {
  return typeof value === "string" && value in SALES_STAGES;
}
