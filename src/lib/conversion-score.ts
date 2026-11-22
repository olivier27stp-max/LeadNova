import { getIndustryGroup } from "@/lib/industry-groups";

/**
 * Chance de conversion /10 pour Lume (CRM des entreprises de services à domicile).
 * Estimation à partir de signaux — pas encore calibrée sur de vraies conversions.
 *
 * PROFIL (max 7)
 *  Métier 2          services à domicile 2 · construction 1,2 · inconnu 0,8 · immobilier/golf 0
 *  Taille 2          avis Google 20–300 → 2 · 5–19 ou 301–1000 → 1,2 · inconnu 0,4
 *  Besoin 1,5        site sans formulaire 1,5 · sans site / CRM concurrent 1,2 · formulaire ou non analysé 0,8
 *  Joignabilité 1,5  courriel réel 0,8 (deviné 0,3) · propriétaire connu 0,5 · téléphone 0,2
 * SIGNAUX (bonus / malus)
 *  Site & avis       embauche +0,8 · plaintes sur le suivi +0,8 · propriétaire répond aux avis +0,4
 *                    5+ avis en 6 mois +0,4 · réservation/paiement en ligne +0,3 · 2+ équipes +0,4
 *                    commercial +0,3 · bonne saison d'achat +0,4
 *  Appels            a parlé au propriétaire +0,4 · outil Excel/papier/rien/formulaire +0,5 · CRM +0,2
 *                    3–20 employés +0,4 · objection : pas besoin −1,5, déjà un outil −0,5, prix −0,3, timing −0,2
 *  Réponse courriel  positive +1,5 · neutre +0,5 · négative −1 · désabonnement → 0
 * ÉTAPE DE VENTE     démo prise ≥ 7 · démo faite ≥ 8 · essai ≥ 9 · vendu 10 · perdu 0
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
  // signaux site & avis
  hiring?: boolean | null;
  complaintCount?: number | null;
  ownerRepliesReviews?: boolean | null;
  reviewsLast6m?: number | null;
  onlineBooking?: boolean | null;
  onlinePayment?: boolean | null;
  teamsCount?: number | null;
  serviceSegment?: string | null;
  // appels & vente
  lastCallWho?: string | null;
  currentTool?: string | null;
  employeeCount?: number | null;
  lastObjection?: string | null;
  lastReplySentiment?: string | null;
  salesStage?: string | null;
  lostReason?: string | null;
}

const CORE_TRADES = new Set(["vitres", "gouttieres", "revetement", "nettoyage", "paysagement"]);

// Mois (0 = janvier) où chaque métier achète le plus : avant ou au début de sa saison
const BUYING_MONTHS: Record<string, number[]> = {
  vitres: [1, 2, 3, 4, 7, 8],
  gouttieres: [1, 2, 3, 7, 8, 9],
  revetement: [1, 2, 3, 4],
  paysagement: [9, 10, 11, 0, 1, 2],
  construction: [0, 1, 2, 3],
  nettoyage: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export function isBuyingSeason(industry: string | null | undefined, now = new Date()): boolean {
  const months = BUYING_MONTHS[getIndustryGroup(industry)];
  return !!months && months.includes(now.getMonth());
}

export function conversionChance(p: ConversionInput, now = new Date()): { score: number; reasons: string[] } {
  if (p.status === "NOT_INTERESTED") return { score: 0, reasons: ["A dit ne pas être intéressé"] };
  if (p.lastReplySentiment === "unsubscribe") return { score: 0, reasons: ["A demandé d'arrêter les courriels"] };
  if (p.salesStage === "WON") return { score: 10, reasons: ["Payant"] };
  if (p.salesStage === "LOST") return { score: 0, reasons: [`Perdu${p.lostReason ? ` (${p.lostReason.toLowerCase()})` : ""}`] };

  const reasons: string[] = [];
  let raw = 0;

  // ── Profil ──
  const group = getIndustryGroup(p.industry);
  if (CORE_TRADES.has(group)) { raw += 2; reasons.push("Métier cible"); }
  else if (group === "construction") { raw += 1.2; reasons.push("Construction"); }
  else if (group === "immobilier" || group === "golf") reasons.push("Hors cible (immobilier / golf)");
  else raw += 0.8;

  const r = p.reviewCount;
  if (r != null && r >= 20 && r <= 300) { raw += 2; reasons.push(`Taille idéale (${r} avis)`); }
  else if (r != null && ((r >= 5 && r < 20) || (r > 300 && r <= 1000))) { raw += 1.2; reasons.push(`${r} avis Google`); }
  else if (r == null) raw += 0.4;
  else reasons.push(r < 5 ? "Très petite entreprise" : "Très grande entreprise");

  if (p.contactFormStatus === "NO_FORM") { raw += 1.5; reasons.push("Site sans formulaire"); }
  else if (p.competitorCrm) { raw += 1.2; reasons.push(`Utilise ${p.competitorCrm}`); }
  else if (p.contactFormStatus === "NO_WEBSITE") { raw += 1.2; reasons.push("Pas de site web"); }
  else raw += 0.8;

  if (p.email && !p.emailGuessed) { raw += 0.8; reasons.push("Courriel réel"); }
  else if (p.email) raw += 0.3;
  if (p.ownerName) { raw += 0.5; reasons.push(`Propriétaire connu (${p.ownerName})`); }
  if (p.phone) raw += 0.2;

  // ── Signaux site & avis ──
  if (p.hiring) { raw += 0.8; reasons.push("Embauche en cours"); }
  if ((p.complaintCount ?? 0) > 0) { raw += 0.8; reasons.push(`${p.complaintCount} avis se plaignent du suivi`); }
  if (p.ownerRepliesReviews) { raw += 0.4; reasons.push("Le propriétaire répond aux avis"); }
  if ((p.reviewsLast6m ?? 0) >= 5) { raw += 0.4; reasons.push(`${p.reviewsLast6m} avis en 6 mois (croissance)`); }
  if (p.onlineBooking || p.onlinePayment) { raw += 0.3; reasons.push("Réservation ou paiement en ligne"); }
  if ((p.teamsCount ?? 0) >= 2) { raw += 0.4; reasons.push(`${p.teamsCount} équipes`); }
  if (p.serviceSegment === "commercial" || p.serviceSegment === "both") { raw += 0.3; reasons.push("Clientèle commerciale"); }
  if (isBuyingSeason(p.industry, now)) { raw += 0.4; reasons.push("Bonne période d'achat"); }

  // ── Appels ──
  if (p.lastCallWho === "OWNER") { raw += 0.4; reasons.push("A parlé au propriétaire"); }
  if (p.currentTool && ["EXCEL", "PAPER", "NONE", "GOOGLE_FORMS"].includes(p.currentTool)) { raw += 0.5; reasons.push("Outil actuel limité (gros besoin)"); }
  else if (p.currentTool && ["JOBBER", "HOUSECALL", "OTHER_CRM"].includes(p.currentTool)) raw += 0.2;
  if (p.employeeCount != null && p.employeeCount >= 3 && p.employeeCount <= 20) { raw += 0.4; reasons.push(`${p.employeeCount} employés`); }
  const objectionMalus: Record<string, [number, string]> = {
    NO_NEED: [-1.5, "Objection : pas besoin"],
    HAS_TOOL: [-0.5, "Objection : a déjà un outil"],
    PRICE: [-0.3, "Objection : prix"],
    TIMING: [-0.2, "Objection : pas le bon moment"],
  };
  if (p.lastObjection && objectionMalus[p.lastObjection]) {
    raw += objectionMalus[p.lastObjection][0];
    reasons.push(objectionMalus[p.lastObjection][1]);
  }

  // ── Réponse au courriel ──
  if (p.lastReplySentiment === "positive") { raw += 1.5; reasons.unshift("Réponse positive"); }
  else if (p.lastReplySentiment === "neutral") { raw += 0.5; reasons.push("Réponse neutre"); }
  else if (p.lastReplySentiment === "negative") { raw -= 1; reasons.push("Réponse négative"); }
  else if (p.status === "REPLIED") { raw += 1; reasons.unshift("A répondu"); }

  let score = Math.max(0, Math.min(10, Math.round(raw)));

  // ── Étape de vente ──
  const floor: Record<string, [number, string]> = {
    SETTING_BOOKED: [6, "Setting call prévu"],
    SETTING_DONE: [7, "Setting call fait"],
    DEMO_BOOKED: [7, "Closing call prévu"],
    DEMO_DONE: [8, "Closing call fait"],
    TRIAL: [9, "Inscrit"],
  };
  if (p.salesStage && floor[p.salesStage]) {
    score = Math.max(score, floor[p.salesStage][0]);
    reasons.unshift(floor[p.salesStage][1]);
  }
  if (p.status === "QUALIFIED") { score = Math.max(score, 9); reasons.unshift("Qualifié"); }

  return { score, reasons };
}
