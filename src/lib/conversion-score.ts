import { getIndustryGroup } from "@/lib/industry-groups";

/**
 * Chance de conversion /10 pour Lume (CRM des entreprises de services à domicile).
 * Estimation à partir de signaux — pas encore calibrée sur de vraies conversions.
 *
 *  Métier (2,5)        services à domicile 2,5 · construction 1,5 · inconnu 1 · immobilier/golf 0
 *  Taille (2,5)        avis Google 20–300 → 2,5 · 5–19 ou 301–1000 → 1,5 · inconnu 0,5
 *  Besoin (2)          site sans formulaire 2 · sans site 1,5 · CRM concurrent 1,5 · formulaire 1 · non analysé 1
 *  Joignabilité (3)    courriel réel 1,5 (deviné 0,5) · propriétaire trouvé 1 · téléphone 0,5
 *  Statut              pas intéressé → 0 · a répondu +2 · qualifié → au moins 9
 */

export interface ConversionInput {
  industry?: string | null;
  reviewCount?: number | null;
  contactFormStatus?: string | null;
  competitorCrm?: string | null;
  email?: string | null;
  emailGuessed?: boolean | null;
  ownerName?: string | null;
  phone?: string | null;
  status?: string | null;
}

const CORE_TRADES = new Set(["vitres", "gouttieres", "revetement", "nettoyage", "paysagement"]);

export function conversionChance(p: ConversionInput): { score: number; reasons: string[] } {
  if (p.status === "NOT_INTERESTED") return { score: 0, reasons: ["A dit ne pas être intéressé"] };

  const reasons: string[] = [];
  let raw = 0;

  // Métier
  const group = getIndustryGroup(p.industry);
  if (CORE_TRADES.has(group)) { raw += 2.5; reasons.push("Métier cible (services à domicile)"); }
  else if (group === "construction") { raw += 1.5; reasons.push("Construction / entrepreneur"); }
  else if (group === "immobilier" || group === "golf") { reasons.push("Hors cible (immobilier / golf)"); }
  else raw += 1;

  // Taille
  const r = p.reviewCount;
  if (r != null && r >= 20 && r <= 300) { raw += 2.5; reasons.push(`Taille idéale (${r} avis)`); }
  else if (r != null && ((r >= 5 && r < 20) || (r > 300 && r <= 1000))) { raw += 1.5; reasons.push(`${r} avis Google`); }
  else if (r == null) raw += 0.5;
  else reasons.push(r < 5 ? "Très petite entreprise" : "Très grande entreprise");

  // Besoin
  if (p.competitorCrm) { raw += 1.5; reasons.push(`Utilise ${p.competitorCrm}`); }
  else if (p.contactFormStatus === "NO_FORM") { raw += 2; reasons.push("Site sans formulaire de contact"); }
  else if (p.contactFormStatus === "NO_WEBSITE") { raw += 1.5; reasons.push("Pas de site web"); }
  else if (p.contactFormStatus === "HAS_FORM") raw += 1;
  else raw += 1;

  // Joignabilité
  if (p.email && !p.emailGuessed) { raw += 1.5; reasons.push("Courriel réel"); }
  else if (p.email) raw += 0.5;
  if (p.ownerName) { raw += 1; reasons.push(`Propriétaire connu (${p.ownerName})`); }
  if (p.phone) raw += 0.5;

  let score = Math.round(Math.min(10, raw));
  if (p.status === "REPLIED") { score = Math.min(10, score + 2); reasons.unshift("A répondu"); }
  if (p.status === "QUALIFIED") { score = Math.max(score, 9); reasons.unshift("Qualifié"); }

  return { score, reasons };
}
