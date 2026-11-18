/**
 * Note d'engagement /10 : ce que le prospect a FAIT (séparée de la chance de conversion, qui décrit son profil).
 *
 *  Ouvertures   1–2 → 0,7 · 3–4 → 1,5 · 5+ → 2      (souvent relu ou transféré au patron)
 *  Clics        1 → 2,5 · 2+ → 3
 *  Visites site 1–2 → 1,2 · 3+ → 2
 *  Réponse      positive 3,5 · neutre 2,5 · négative 1,5 · absence 0,3 · a répondu (ton inconnu) 2
 *  Appels       démo prise 3 · rappeler 2 · conversation 1,5 · refus 1
 *  Fraîcheur    dernier signal > 30 jours ×0,6 · > 90 jours ×0,3
 *  Désabonnement → 0
 *
 * Note : les ouvertures sont gonflées par Apple Mail (ouverture automatique) ; les clics et réponses sont plus fiables.
 */

export interface EngagementInput {
  emailOpenCount?: number | null;
  emailClickCount?: number | null;
  siteVisitCount?: number | null;
  lastReplySentiment?: string | null;
  lastCallOutcome?: string | null;
  lastEngagedAt?: string | Date | null;
  status?: string | null;
}

export function engagementScore(p: EngagementInput, now = new Date()): { score: number; reasons: string[]; hot: boolean } {
  if (p.lastReplySentiment === "unsubscribe") return { score: 0, reasons: ["A demandé d'arrêter les courriels"], hot: false };

  const reasons: string[] = [];
  let raw = 0;

  const opens = p.emailOpenCount ?? 0;
  if (opens >= 5) { raw += 2; reasons.push(`${opens} ouvertures`); }
  else if (opens >= 3) { raw += 1.5; reasons.push(`${opens} ouvertures`); }
  else if (opens >= 1) { raw += 0.7; reasons.push(`${opens} ouverture${opens > 1 ? "s" : ""}`); }

  const clicks = p.emailClickCount ?? 0;
  if (clicks >= 2) { raw += 3; reasons.push(`${clicks} clics`); }
  else if (clicks === 1) { raw += 2.5; reasons.push("A cliqué un lien"); }

  const visits = p.siteVisitCount ?? 0;
  if (visits >= 3) { raw += 2; reasons.push(`${visits} pages vues sur ton site`); }
  else if (visits >= 1) { raw += 1.2; reasons.push(`${visits} page${visits > 1 ? "s" : ""} vue${visits > 1 ? "s" : ""} sur ton site`); }

  const replyPoints: Record<string, [number, string]> = {
    positive: [3.5, "Réponse positive"],
    neutral: [2.5, "Réponse neutre"],
    negative: [1.5, "Réponse négative (mais engagé)"],
    out_of_office: [0.3, "Réponse d'absence"],
  };
  if (p.lastReplySentiment && replyPoints[p.lastReplySentiment]) {
    raw += replyPoints[p.lastReplySentiment][0];
    reasons.unshift(replyPoints[p.lastReplySentiment][1]);
  } else if (p.status === "REPLIED") {
    raw += 2;
    reasons.unshift("A répondu");
  }

  const callPoints: Record<string, [number, string]> = {
    DEMO_BOOKED: [3, "Démo prise au téléphone"],
    CALLBACK: [2, "Demande d'être rappelé"],
    CONNECTED: [1.5, "Conversation au téléphone"],
    REFUSED: [1, "A parlé au téléphone (refus)"],
  };
  if (p.lastCallOutcome && callPoints[p.lastCallOutcome]) {
    raw += callPoints[p.lastCallOutcome][0];
    reasons.push(callPoints[p.lastCallOutcome][1]);
  }

  // Fraîcheur
  const last = p.lastEngagedAt ? new Date(p.lastEngagedAt) : null;
  const ageDays = last ? (now.getTime() - last.getTime()) / 86_400_000 : null;
  if (ageDays != null && raw > 0) {
    if (ageDays > 90) { raw *= 0.3; reasons.push("Dernier signal il y a plus de 3 mois"); }
    else if (ageDays > 30) { raw *= 0.6; reasons.push("Dernier signal il y a plus d'un mois"); }
  }

  const score = Math.max(0, Math.min(10, Math.round(raw)));
  // À appeler maintenant : clic ou 3+ ouvertures, signal de moins de 48 h
  const hot = ageDays != null && ageDays <= 2 && (clicks > 0 || opens >= 3 || visits > 0);
  if (hot) reasons.unshift("À appeler maintenant");

  return { score, reasons, hot };
}
