import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { fetchPage, normalizeBaseUrl, isValidWebsiteCandidate } from "@/lib/enrichment";
import { isBlockedPage } from "@/lib/form-detection";
import { fetchRecentReviews, reviewStats, type ReviewsResult } from "@/lib/reviews";

/**
 * Trouve le propriétaire / dirigeant d'une entreprise à partir de son site web.
 *
 * 1. Visite l'accueil, puis les pages « à propos », équipe, histoire, contact…
 * 2. Extrait le texte utile (texte visible, texte alternatif des photos, JSON-LD, courriels).
 * 3. Claude identifie LE propriétaire et cite l'extrait exact qui le prouve.
 * 4. Vérification anti-invention : le nom et l'extrait doivent apparaître tels quels
 *    dans le texte récupéré, sinon le résultat est rejeté.
 */

const OWNER_MODEL = process.env.OWNER_AI_MODEL || "claude-opus-5-5";
const MAX_PAGES = 8;
const MAX_CHARS_PER_PAGE = 12_000;
const MAX_TOTAL_CHARS = 40_000;

// Liens qui mènent le plus souvent au nom du propriétaire (ordre = priorité)
const OWNER_LINK_PATTERNS: RegExp[] = [
  /a-?propos|qui-sommes|about|notre-?histoire|our-?story|histoire|story/,
  /equipe|team|fondat|founder|direction|president|proprietaire|owner|mot-du|leadership/,
  /carriere|emploi|recrutement|embauche|careers?|jobs?|join-us|joindre-l-equipe|rejoins|rejoignez/,
  /entreprise|compagnie|company|mission|valeurs/,
  /contact|nous-joindre|joindre|coordonnees/,
];

const FALLBACK_PATHS = ["/a-propos", "/qui-sommes-nous", "/notre-equipe", "/equipe", "/about", "/about-us", "/contact"];

export interface OwnerResult {
  status: "found" | "not_found" | "no_website" | "unreachable" | "error";
  ownerName?: string;
  confidence?: string;
  reason?: string;
}

interface PageText {
  url: string;
  text: string;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Comparaison tolérante (accents, casse, espaces, apostrophes) pour la vérification anti-invention. */
function normalizeForMatch(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^a-z0-9'@.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pathKey(url: string): string {
  try {
    return stripAccents(decodeURIComponent(new URL(url).pathname.toLowerCase()));
  } catch {
    return "";
  }
}

function extractPageText(html: string, url: string, seenLines: Set<string>): PageText {
  const $ = cheerio.load(html);
  const extras: string[] = [];

  // Données structurées : fondateur, employés, auteur…
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (/founder|employee|person|author|"name"/i.test(raw)) {
      extras.push(`[JSON-LD] ${raw.replace(/\s+/g, " ").slice(0, 2000)}`);
    }
  });
  const author = $('meta[name="author"]').attr("content");
  if (author) extras.push(`[meta author] ${author}`);

  // Texte alternatif des photos (souvent « Jean Tremblay, propriétaire »)
  const alts = new Set<string>();
  $("img[alt]").each((_, el) => {
    const alt = ($(el).attr("alt") || "").replace(/\s+/g, " ").trim();
    if (alt.length >= 4 && alt.length <= 120) alts.add(alt);
  });
  if (alts.size > 0) extras.push(`[Textes des images] ${[...alts].slice(0, 40).join(" | ")}`);

  // Courriels (ex. jean@entreprise.com aide à confirmer un prénom)
  const mails = new Set<string>();
  $('a[href^="mailto:"]').each((_, el) => {
    const m = ($(el).attr("href") || "").replace(/^mailto:/i, "").split("?")[0].trim();
    if (m) mails.add(m.toLowerCase());
  });
  if (mails.size > 0) extras.push(`[Courriels] ${[...mails].join(", ")}`);

  $("script, style, noscript, svg, iframe, template").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, section, article, header, footer, td, blockquote, figcaption, span.elementor-heading-title").each((_, el) => {
    $(el).append("\n");
  });

  const lines: string[] = [];
  for (const rawLine of $("body").text().split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 2) continue;
    const key = line.toLowerCase();
    // Menus et pieds de page répétés d'une page à l'autre : gardés une seule fois
    if (seenLines.has(key)) continue;
    seenLines.add(key);
    lines.push(line);
  }

  const text = [...lines, ...extras].join("\n").slice(0, MAX_CHARS_PER_PAGE);
  return { url, text };
}

function pickOwnerLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  let host: string;
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }
  const buckets: string[][] = OWNER_LINK_PATTERNS.map(() => []);
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (u.hostname.replace(/^www\./, "") !== host) return;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|mp4)$/i.test(u.pathname)) return;
    const clean = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    if (seen.has(clean)) return;
    seen.add(clean);

    const key = `${pathKey(clean)} ${stripAccents($(el).text().toLowerCase())}`;
    const idx = OWNER_LINK_PATTERNS.findIndex((re) => re.test(key));
    if (idx >= 0) buckets[idx].push(clean);
  });

  return buckets.flat();
}

// Outils de réservation / paiement en ligne détectés dans le code des pages
const BOOKING_SIGNATURES: Array<[RegExp, string]> = [
  [/calendly\.com/, "Calendly"],
  [/setmore\.com/, "Setmore"],
  [/acuityscheduling\.com/, "Acuity"],
  [/squareup\.com\/appointments|square\.site\/book/, "Square Appointments"],
  [/booksy\.com/, "Booksy"],
  [/simplybook\.(me|it)/, "SimplyBook"],
  [/clienthub\.getjobber\.com|getjobber\.com\/(request|booking)/, "Jobber (demande en ligne)"],
  [/book\.housecallpro\.com|housecallpro\.com\/book/, "Housecall Pro (réservation)"],
  [/r[ée]server en ligne|r[ée]servation en ligne|prendre rendez-vous en ligne|book online|book now|schedule online/, "Réservation en ligne"],
];
const PAYMENT_SIGNATURES: Array<[RegExp, string]> = [
  [/js\.stripe\.com|checkout\.stripe\.com|buy\.stripe\.com/, "Stripe"],
  [/squareup\.com\/(checkout|pay)|square\.link|web\.squarecdn\.com/, "Square"],
  [/paypal\.com\/sdk|paypalobjects\.com|paypal\.me/, "PayPal"],
  [/moneris\.com/, "Moneris"],
  [/clover\.com\/(pay|online)/, "Clover"],
  [/payer en ligne|paiement en ligne|pay online|pay your invoice|payer votre facture/, "Paiement en ligne"],
];

export interface SiteTech {
  booking: string | null;
  payment: string | null;
}

function detectTech(html: string, tech: SiteTech) {
  const h = stripAccents(html.toLowerCase()).replace(/[éè]/g, "e");
  const lower = html.toLowerCase();
  if (!tech.booking) for (const [re, label] of BOOKING_SIGNATURES) if (re.test(lower) || re.test(h)) { tech.booking = label; break; }
  if (!tech.payment) for (const [re, label] of PAYMENT_SIGNATURES) if (re.test(lower) || re.test(h)) { tech.payment = label; break; }
}

export async function collectSiteText(website: string): Promise<{ pages: PageText[]; tech: SiteTech } | null> {
  let base = normalizeBaseUrl(website);
  let home = await fetchPage(base, 12_000);
  if (!home) {
    base = base.startsWith("https://") ? base.replace("https://", "http://") : base.replace("http://", "https://");
    home = await fetchPage(base, 12_000);
  }
  if (!home || isBlockedPage(home)) return null;

  let origin = base;
  try {
    origin = new URL(base).origin;
  } catch { /* garde base */ }

  const tech: SiteTech = { booking: null, payment: null };
  detectTech(home, tech);
  const seenLines = new Set<string>();
  const pages: PageText[] = [extractPageText(home, base, seenLines)];
  const visited = new Set<string>([base.replace(/\/+$/, ""), origin]);

  const candidates = pickOwnerLinks(home, base);
  const hasAboutLink = candidates.some((u) => OWNER_LINK_PATTERNS[0].test(pathKey(u)) || OWNER_LINK_PATTERNS[1].test(pathKey(u)));
  if (!hasAboutLink) candidates.push(...FALLBACK_PATHS.map((p) => `${origin}${p}`));

  let total = pages[0].text.length;
  for (const url of candidates) {
    if (pages.length >= MAX_PAGES || total >= MAX_TOTAL_CHARS) break;
    if (visited.has(url)) continue;
    visited.add(url);
    const html = await fetchPage(url, 10_000);
    if (!html || isBlockedPage(html)) continue;
    detectTech(html, tech);
    const page = extractPageText(html, url, seenLines);
    if (page.text.length < 20) continue;
    pages.push(page);
    total += page.text.length;
  }
  return { pages, tech };
}

const SITE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    fullName: { type: "string", description: "Prénom et nom exactement comme écrits sur le site (le prénom seul si c'est tout ce que le site donne), vide si non trouvé" },
    firstName: { type: "string" },
    role: { type: "string", description: "Rôle tel qu'indiqué : Propriétaire, Président, Fondateur, Copropriétaire…" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    evidence: { type: "string", description: "Extrait EXACT copié du texte qui prouve que cette personne est le propriétaire/dirigeant" },
    sourceUrl: { type: "string" },
    reason: { type: "string", description: "Courte explication en français" },
    hiring: { type: "boolean", description: "Le site annonce une embauche en cours (offre d'emploi, « on embauche », page carrières avec postes ouverts)" },
    hiringEvidence: { type: "string", description: "Extrait EXACT du site prouvant l'embauche, vide sinon" },
    teamsCount: { type: "integer", description: "Nombre d'équipes, de camions ou d'employés terrain explicitement mentionné ; 0 si non mentionné" },
    teamsEvidence: { type: "string", description: "Extrait EXACT du site mentionnant ce nombre, vide sinon" },
    serviceSegment: { type: "string", enum: ["residential", "commercial", "both", "unknown"] },
    complaintCount: { type: "integer", description: "Nombre d'avis clients qui se plaignent du suivi, de retards, d'une soumission jamais reçue, de la communication ou de l'organisation" },
    complaintEvidence: { type: "string", description: "Extrait EXACT d'un de ces avis, vide si aucun" },
  },
  required: ["found", "fullName", "firstName", "role", "confidence", "evidence", "sourceUrl", "reason", "hiring", "hiringEvidence", "teamsCount", "teamsEvidence", "serviceSegment", "complaintCount", "complaintEvidence"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Tu analyses le site web et les avis Google d'une petite entreprise de services du Québec. Tu as 5 tâches.

1. PROPRIÉTAIRE — trouve SON PROPRIÉTAIRE ou dirigeant principal (une seule personne).
Ordre de priorité si plusieurs personnes : propriétaire > fondateur/fondatrice > président(e) / PDG > copropriétaire > directeur général. S'il y a des copropriétaires égaux, prends celui ou celle nommé(e) en premier.
Ne retiens JAMAIS :
- les auteurs de témoignages ou d'avis clients, les clients, les partenaires;
- le concepteur du site web, l'agence, le photographe;
- un employé, technicien ou représentant qui n'est pas présenté comme propriétaire/dirigeant;
- un nom déduit uniquement du nom de l'entreprise (ex. « Nettoyage Tremblay » ne prouve pas qui est le propriétaire);
- un nom deviné à partir d'une adresse courriel seule.
Indices valables : « fondée par », « propriétaire », « président », « mot du président », « notre fondateur », une signature « — Marc, propriétaire », une photo dont le texte alternatif nomme le propriétaire, un JSON-LD « founder ». Une histoire du type « Marc a lancé l'entreprise en 2012 » compte comme fondateur. Une réponse du propriétaire à un avis signée d'un prénom compte aussi (confiance medium).
Confiance : high = le texte dit explicitement que cette personne est propriétaire/fondateur/président de CETTE entreprise ; medium = très probable mais formulation indirecte ; low = simple hypothèse. Dans le doute, found=false.

2. EMBAUCHE — hiring=true seulement si le site annonce une embauche en cours (offre d'emploi, « nous embauchons », page carrières avec des postes). Une simple page « carrières » vide ou générique ne compte pas.

3. ÉQUIPES — teamsCount = nombre d'équipes, de camions ou d'employés terrain s'il est écrit explicitement (« nos 4 équipes », « une flotte de 6 camions », « 12 employés »). 0 si rien d'explicite.

4. SEGMENT — residential, commercial, both ou unknown selon les services décrits.

5. PLAINTES — parmi les avis fournis, compte ceux qui se plaignent du suivi, de retards, d'un rendez-vous oublié, d'une soumission jamais reçue, de la difficulté à joindre l'entreprise ou de l'organisation. Les plaintes sur la qualité du travail seul ne comptent pas.

Tous les extraits (evidence, hiringEvidence, teamsEvidence, complaintEvidence) doivent être copiés TELS QUELS depuis le texte fourni. Laisse vide quand il n'y a rien.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

interface OwnerAiAnswer {
  found: boolean;
  fullName: string;
  firstName: string;
  role: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
  sourceUrl: string;
  reason: string;
  hiring: boolean;
  hiringEvidence: string;
  teamsCount: number;
  teamsEvidence: string;
  serviceSegment: "residential" | "commercial" | "both" | "unknown";
  complaintCount: number;
  complaintEvidence: string;
}

function reviewsCorpus(reviews: ReviewsResult | null): string {
  if (!reviews || reviews.reviews.length === 0) return "";
  return reviews.reviews
    .map((r, i) => {
      const date = r.publishedAt ? r.publishedAt.toISOString().slice(0, 10) : "date inconnue";
      const answer = r.ownerAnswer ? `\n  Réponse du propriétaire : ${r.ownerAnswer.slice(0, 600)}` : "";
      return `Avis ${i + 1} (${r.rating ?? "?"}★, ${date}) : ${r.text.slice(0, 1200)}${answer}`;
    })
    .join("\n");
}

async function askClaude(companyName: string, pages: PageText[], reviews: ReviewsResult | null): Promise<OwnerAiAnswer | null> {
  const siteCorpus = pages.length > 0
    ? pages.map((p) => `<page url="${p.url}">\n${p.text}\n</page>`).join("\n\n")
    : "(aucun site web lisible)";
  const avis = reviewsCorpus(reviews);
  const corpus = `${siteCorpus}\n\n<avis_google>\n${avis || "(aucun avis disponible)"}\n</avis_google>`;

  const response = await getClient().messages.create({
    model: OWNER_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SITE_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: "user",
        content: `Entreprise : ${companyName}\n\nTexte récupéré sur son site et ses avis Google :\n\n${corpus}`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  try {
    return JSON.parse(block.text) as OwnerAiAnswer;
  } catch {
    return null;
  }
}

/** Vérifie que l'IA n'a rien inventé : nom et extrait présents dans le texte récupéré. */
export function verifyAgainstText(answer: Pick<OwnerAiAnswer, "fullName" | "evidence">, pages: PageText[], companyName: string): string | null {
  const name = answer.fullName.trim();
  const words = name.split(/\s+/).filter(Boolean);
  // Un prénom seul est accepté (« Ludovic, co-fondateur ») : c'est ce qui sert dans {{contact_name}}
  if (words.length === 0 || words.length > 5) return "nom invalide";
  if (words.length === 1 && name.length < 3) return "prénom trop court";
  if (name.length > 60 || /\d|@|www|\.com/i.test(name)) return "ne ressemble pas à un nom de personne";

  const corpus = normalizeForMatch(pages.map((p) => p.text).join("\n"));
  const escaped = normalizeForMatch(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Mot entier : « Marc » ne doit pas valider « Marchand »
  if (!new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(corpus)) return "nom absent du site";

  const ev = normalizeForMatch(answer.evidence);
  if (ev.length < 8) return "extrait de preuve manquant";
  // Tolère une coupe aux extrémités : on vérifie le cœur de l'extrait
  const core = ev.length > 60 ? ev.slice(10, ev.length - 10) : ev;
  if (!corpus.includes(core)) return "extrait de preuve introuvable sur le site";

  // Nom identique au nom de l'entreprise → pas une preuve
  if (normalizeForMatch(companyName) === normalizeForMatch(name)) return "nom de l'entreprise, pas d'une personne";
  return null;
}

function titleCaseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export interface OwnerFields {
  ownerName: string | null;
  ownerFirstName: string | null;
  ownerRole: string | null;
  ownerConfidence: string | null;
  ownerSourceUrl: string | null;
  ownerEvidence: string | null;
}

export interface SiteSignalFields {
  hiring: boolean | null;
  hiringEvidence: string | null;
  onlineBooking: boolean | null;
  onlinePayment: boolean | null;
  bookingTool: string | null;
  teamsCount: number | null;
  teamsEvidence: string | null;
  serviceSegment: string | null;
  reviewsCheckedAt: Date | null;
  reviewsSource: string | null;
  reviewsSampleSize: number | null;
  reviewsLast6m: number | null;
  lastReviewAt: Date | null;
  complaintCount: number | null;
  complaintEvidence: string | null;
  ownerRepliesReviews: boolean | null;
}

const EMPTY_OWNER: OwnerFields = {
  ownerName: null, ownerFirstName: null, ownerRole: null,
  ownerConfidence: null, ownerSourceUrl: null, ownerEvidence: null,
};

export interface OwnerAnalysis extends OwnerResult {
  /** Champs à enregistrer ; null = ne rien enregistrer (erreur temporaire, à réessayer) */
  fields: (OwnerFields & Partial<SiteSignalFields>) | null;
}

/** Garde un extrait seulement s'il apparaît tel quel dans le texte source. */
function keepIfQuoted(evidence: string | undefined, sourceText: string): string | null {
  const ev = normalizeForMatch(evidence || "");
  if (ev.length < 6) return null;
  const core = ev.length > 60 ? ev.slice(10, ev.length - 10) : ev;
  return normalizeForMatch(sourceText).includes(core) ? (evidence || "").slice(0, 400) : null;
}

/**
 * Analyse pure (aucun accès à la base) : peut tourner en parallèle.
 * Site (propriétaire, embauche, équipes, segment, réservation/paiement) + avis Google (rythme, plaintes, réponses).
 * L'enregistrement se fait ensuite avec saveOwnerAnalysis, une requête à la fois.
 */
export async function analyzeOwner(companyName: string, website: string | null, city: string | null = null): Promise<OwnerAnalysis> {
  const hasSite = !!website && isValidWebsiteCandidate(website);
  const site = hasSite ? await collectSiteText(website!) : null;
  const pages = site && !site.pages.every((p) => p.text.length < 50) ? site.pages : [];
  const reviews = await fetchRecentReviews(companyName, city);
  const stats = reviews ? reviewStats(reviews) : null;

  const signals: Partial<SiteSignalFields> = {
    onlineBooking: site ? !!site.tech.booking : null,
    onlinePayment: site ? !!site.tech.payment : null,
    bookingTool: site ? [site.tech.booking, site.tech.payment].filter(Boolean).join(" · ") || null : null,
    reviewsCheckedAt: reviews ? new Date() : null,
    reviewsSource: reviews?.source ?? null,
    reviewsSampleSize: stats?.sampleSize ?? null,
    reviewsLast6m: stats?.last6m ?? null,
    lastReviewAt: stats?.lastReviewAt ?? null,
    ownerRepliesReviews: stats?.ownerReplies ?? null,
  };

  if (pages.length === 0 && (!reviews || reviews.reviews.length === 0)) {
    return { status: hasSite ? "unreachable" : "no_website", fields: { ...EMPTY_OWNER, ...signals } };
  }

  let answer: OwnerAiAnswer | null;
  try {
    answer = await askClaude(companyName, pages, reviews);
  } catch (err) {
    return { status: "error", reason: err instanceof Error ? err.message : "erreur IA", fields: null };
  }
  if (!answer) return { status: "error", reason: "réponse IA invalide", fields: null };

  const siteText = pages.map((p) => p.text).join("\n");
  const reviewText = reviewsCorpus(reviews);
  const hiringEvidence = answer.hiring ? keepIfQuoted(answer.hiringEvidence, siteText) : null;
  const teamsEvidence = answer.teamsCount > 0 ? keepIfQuoted(answer.teamsEvidence, siteText) : null;
  const complaintEvidence = answer.complaintCount > 0 ? keepIfQuoted(answer.complaintEvidence, reviewText) : null;

  Object.assign(signals, {
    hiring: pages.length > 0 ? !!hiringEvidence : null,
    hiringEvidence,
    teamsCount: teamsEvidence ? answer.teamsCount : null,
    teamsEvidence,
    serviceSegment: answer.serviceSegment && answer.serviceSegment !== "unknown" ? answer.serviceSegment : null,
    complaintCount: reviews && reviews.reviews.length > 0 ? (complaintEvidence ? answer.complaintCount : 0) : null,
    complaintEvidence,
  });

  if (!answer.found || !answer.fullName.trim() || answer.confidence === "low") {
    return { status: "not_found", reason: answer.reason, fields: { ...EMPTY_OWNER, ...signals } };
  }

  // Le nom peut venir du site ou d'une réponse du propriétaire signée dans les avis
  const sources: PageText[] = [...pages, { url: "avis Google", text: reviewText }];
  const rejection = verifyAgainstText(answer, sources, companyName);
  if (rejection) {
    return { status: "not_found", reason: `rejeté : ${rejection}`, fields: { ...EMPTY_OWNER, ...signals } };
  }

  const fullName = titleCaseName(answer.fullName.trim());
  const firstName = titleCaseName((answer.firstName || fullName.split(/\s+/)[0]).trim());
  return {
    status: "found",
    ownerName: fullName,
    confidence: answer.confidence,
    fields: {
      ownerName: fullName,
      ownerFirstName: firstName,
      ownerRole: answer.role?.trim() || null,
      ownerConfidence: answer.confidence,
      ownerSourceUrl: pages.some((p) => p.url === answer.sourceUrl) ? answer.sourceUrl : (pages[0]?.url ?? "avis Google"),
      ownerEvidence: answer.evidence.slice(0, 500),
      ...signals,
    },
  };
}

export async function saveOwnerAnalysis(prospectId: string, analysis: OwnerAnalysis): Promise<void> {
  if (!analysis.fields) return;
  const now = new Date();
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { ...analysis.fields, ownerCheckedAt: now, siteAnalyzedAt: now },
  });
}

/** Version unitaire : lit le prospect, analyse, enregistre. */
export async function findProspectOwner(prospectId: string): Promise<OwnerAnalysis> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { companyName: true, website: true, city: true },
  });
  if (!prospect) return { status: "error", reason: "prospect introuvable", fields: null };
  const analysis = await analyzeOwner(prospect.companyName, prospect.website, prospect.city);
  await saveOwnerAnalysis(prospectId, analysis);
  return analysis;
}
