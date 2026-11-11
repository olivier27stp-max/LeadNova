/**
 * Score de sécurité d'un courriel de prospection (0–100 %).
 *
 * Estime le risque qu'un message tombe dans les indésirables à partir de son contenu :
 * mots déclencheurs, liens, images, longueur, majuscules, ponctuation, personnalisation.
 * Le pied de page (désabonnement, adresse) est ajouté automatiquement à l'envoi : il n'est pas évalué ici.
 *
 * C'est une heuristique : la réputation du domaine, le réchauffement et la qualité de la liste
 * comptent autant que le texte.
 */

export type IssueSeverity = "critical" | "warning" | "info";

export interface ScoreIssue {
  severity: IssueSeverity;
  label: string;
  tip: string;
  penalty: number;
}

export interface DeliverabilityResult {
  score: number;
  level: "excellent" | "good" | "risky" | "danger";
  issues: ScoreIssue[];
  wordCount: number;
  linkCount: number;
}

// Mots et expressions associés au pourriel (FR + EN). Comparaison sans accents, insensible à la casse.
const SPAM_TRIGGERS = [
  "gratuit", "gratuitement", "100%", "100 %", "garanti", "garantie", "offre speciale", "offre limitee", "promotion", "promo",
  "rabais", "escompte", "economisez", "meilleur prix", "prix imbattable", "gagnez", "gagner de l'argent", "felicitations",
  "cliquez ici", "cliquez maintenant", "agissez maintenant", "derniere chance", "urgent", "urgence", "sans engagement",
  "sans risque", "aucun frais", "essai gratuit", "opportunite unique", "incroyable", "exclusif", "argent facile",
  "satisfait ou rembourse", "achetez", "commandez maintenant", "ne manquez pas", "temps limite", "dernier jour",
  "free", "guarantee", "guaranteed", "limited time", "click here", "buy now", "act now", "winner", "cash", "discount",
  "risk-free", "no obligation", "special offer", "earn money", "make money", "best price", "order now", "deal",
];

const URL_SHORTENERS = /\b(bit\.ly|tinyurl\.com|ow\.ly|t\.co|goo\.gl|rebrand\.ly|is\.gd|buff\.ly|cutt\.ly|shorturl\.at)\b/i;
const URL_REGEX = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi;
const VARIABLE_REGEX = /\{\{\s*(company_name|city|contact_name|form_provider)\s*\}\}/;
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function countTriggers(text: string): string[] {
  const n = normalize(text);
  const found: string[] = [];
  for (const word of SPAM_TRIGGERS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Limites de mot, sauf pour les expressions qui contiennent des symboles
    const pattern = /^[a-z' -]+$/.test(word) ? new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`) : new RegExp(escaped);
    if (pattern.test(n)) found.push(word);
  }
  return found;
}

function stripVariables(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, "X");
}

export function scoreEmailDeliverability(subject: string, body: string, opts: { isFollowUp?: boolean } = {}): DeliverabilityResult {
  const issues: ScoreIssue[] = [];
  const add = (severity: IssueSeverity, penalty: number, label: string, tip: string) =>
    issues.push({ severity, penalty, label, tip });

  const subj = (subject || "").trim();
  const text = (body || "").trim();
  const plainBody = stripVariables(text.replace(/<[^>]+>/g, " "));
  const plainSubject = stripVariables(subj);
  const words = plainBody.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const wordCount = words.length;

  if (!subj && !text) {
    return { score: 0, level: "danger", issues: [], wordCount: 0, linkCount: 0 };
  }

  // ── Mots déclencheurs ──
  const subjectTriggers = countTriggers(plainSubject);
  const bodyTriggers = countTriggers(plainBody).filter((w) => !subjectTriggers.includes(w));
  if (subjectTriggers.length > 0) {
    add("critical", Math.min(30, subjectTriggers.length * 12), `Mot à risque dans le sujet : « ${subjectTriggers.join(" », « ")} »`,
      "Le sujet est le premier élément analysé par les filtres. Reformule sans vocabulaire commercial.");
  }
  if (bodyTriggers.length > 0) {
    add(bodyTriggers.length >= 3 ? "critical" : "warning", Math.min(25, bodyTriggers.length * 6),
      `${bodyTriggers.length} mot(s) à risque dans le texte : « ${bodyTriggers.slice(0, 5).join(" », « ")} »`,
      "Remplace par un langage neutre et concret (ex. « essai gratuit » → « vous pouvez l'essayer 14 jours »).");
  }

  // ── Liens ──
  const links = text.match(URL_REGEX) || [];
  const linkCount = links.length;
  if (linkCount === 2) add("warning", 8, "2 liens dans le message", "Garde un seul lien, ou aucun pour le premier courriel.");
  else if (linkCount >= 3) add("critical", 18, `${linkCount} liens dans le message`, "Plusieurs liens = signal typique de pourriel. Garde-en un seul au maximum.");
  if (URL_SHORTENERS.test(text)) add("critical", 15, "Lien raccourci (bit.ly, etc.)", "Les raccourcisseurs sont très mal vus des filtres. Utilise le lien complet de ton domaine.");

  // ── Images et HTML ──
  if (/<img\b|!\[[^\]]*\]\(/i.test(text)) add("warning", 10, "Image dans le message", "Envoie du texte seul : les images dans un premier contact déclenchent les filtres.");
  if (/<(table|div|style|font)\b|style\s*=/i.test(text)) add("warning", 6, "Mise en forme HTML", "Un courriel qui ressemble à une infolettre est classé « Promotions ». Reste en texte simple.");

  // ── Longueur ──
  if (wordCount > 0 && wordCount < 25) add("warning", 8, `Message très court (${wordCount} mots)`, "Vise 50 à 125 mots : assez pour être crédible, assez court pour être lu.");
  else if (wordCount > 300) add("critical", 18, `Message très long (${wordCount} mots)`, "Coupe à 50–125 mots. Garde un seul argument et une seule question.");
  else if (wordCount > 200) add("warning", 10, `Message long (${wordCount} mots)`, "Vise 50 à 125 mots.");
  else if (wordCount > 150) add("info", 4, `Message un peu long (${wordCount} mots)`, "Idéal : 50 à 125 mots.");

  // ── Sujet ──
  if (!subj) add("critical", 15, "Sujet vide", "Écris un sujet court et précis (3 à 7 mots).");
  else {
    if (plainSubject.length > 60) add("warning", 6, `Sujet long (${plainSubject.length} caractères)`, "Vise moins de 50 caractères, il sera coupé sur mobile.");
    if (/!/.test(plainSubject)) add("warning", 8, "Point d'exclamation dans le sujet", "Retire-le : c'est un marqueur classique de pourriel.");
    if (/[$€%]/.test(plainSubject)) add("warning", 6, "Symbole $, € ou % dans le sujet", "Évite les prix et pourcentages dans le sujet.");
    // Une relance envoyée dans le même fil peut légitimement commencer par « Re: »
    if (!opts.isFollowUp && /^\s*(re|tr|fw|fwd)\s*:/i.test(plainSubject)) add("critical", 15, "Faux « RE: » ou « TR: » dans le sujet", "Simuler une conversation existante est trompeur et pénalisé (et contraire à la LCAP).");
    if (EMOJI_REGEX.test(plainSubject)) add("info", 4, "Émoji dans le sujet", "Un courriel d'affaires 1 à 1 n'en a généralement pas.");
    const capsWords = plainSubject.split(/\s+/).filter((w) => w.length >= 3 && /\p{Lu}/u.test(w) && w === w.toUpperCase() && /\p{L}/u.test(w));
    if (capsWords.length > 0) add("warning", 8, "Mot en MAJUSCULES dans le sujet", "Écris le sujet en minuscules normales.");
  }

  // ── Majuscules et ponctuation dans le texte ──
  const capsBody = words.filter((w) => w.replace(/[^\p{L}]/gu, "").length >= 4 && w === w.toUpperCase() && /\p{Lu}/u.test(w));
  if (capsBody.length >= 3) add("warning", 8, `${capsBody.length} mots en MAJUSCULES`, "Les majuscules donnent un ton agressif et sont pénalisées.");
  const exclamations = (plainBody.match(/!/g) || []).length;
  if (exclamations > 4) add("warning", 10, `${exclamations} points d'exclamation`, "Garde-en un au maximum.");
  else if (exclamations > 2) add("info", 5, `${exclamations} points d'exclamation`, "Garde-en un au maximum.");
  const money = (plainBody.match(/[$€]|\d+\s?%/g) || []).length;
  if (money > 2) add("warning", 6, "Plusieurs prix ou pourcentages", "Parle du problème du prospect avant de parler de prix.");

  // ── Personnalisation ──
  if (!VARIABLE_REGEX.test(`${subj} ${text}`)) {
    add("warning", 10, "Aucune personnalisation", "Ajoute au moins {{company_name}} ou {{city}} : des messages tous identiques sont repérés comme envoi de masse.");
  }

  const penalty = issues.reduce((sum, i) => sum + i.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const level = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "risky" : "danger";
  issues.sort((a, b) => b.penalty - a.penalty);

  return { score, level, issues, wordCount, linkCount };
}
