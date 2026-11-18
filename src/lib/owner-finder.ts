import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { fetchPage, normalizeBaseUrl, isValidWebsiteCandidate } from "@/lib/enrichment";
import { isBlockedPage } from "@/lib/form-detection";

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
const MAX_PAGES = 7;
const MAX_CHARS_PER_PAGE = 12_000;
const MAX_TOTAL_CHARS = 40_000;

// Liens qui mènent le plus souvent au nom du propriétaire (ordre = priorité)
const OWNER_LINK_PATTERNS: RegExp[] = [
  /a-?propos|qui-sommes|about|notre-?histoire|our-?story|histoire|story/,
  /equipe|team|fondat|founder|direction|president|proprietaire|owner|mot-du|leadership/,
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

export async function collectSiteText(website: string): Promise<PageText[] | null> {
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
    const page = extractPageText(html, url, seenLines);
    if (page.text.length < 20) continue;
    pages.push(page);
    total += page.text.length;
  }
  return pages;
}

const OWNER_SCHEMA = {
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
  },
  required: ["found", "fullName", "firstName", "role", "confidence", "evidence", "sourceUrl", "reason"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Tu analyses le texte du site web d'une petite entreprise de services du Québec pour trouver SON PROPRIÉTAIRE ou dirigeant principal (une seule personne).

Ordre de priorité si plusieurs personnes : propriétaire > fondateur/fondatrice > président(e) / PDG > copropriétaire > directeur général. S'il y a des copropriétaires égaux, prends celui ou celle nommé(e) en premier.

Ne retiens JAMAIS :
- les auteurs de témoignages ou d'avis clients, les clients, les partenaires;
- le concepteur du site web, l'agence, le photographe;
- un employé, technicien ou représentant qui n'est pas présenté comme propriétaire/dirigeant;
- un nom déduit uniquement du nom de l'entreprise (ex. « Nettoyage Tremblay » ne prouve pas qui est le propriétaire);
- un nom deviné à partir d'une adresse courriel seule.

Indices valables : « fondée par », « propriétaire », « président », « mot du président », « notre fondateur », une signature « — Marc, propriétaire », une photo dont le texte alternatif nomme le propriétaire, un JSON-LD « founder ». Une histoire du type « Marc a lancé l'entreprise en 2012 » compte comme fondateur.

Confiance :
- high : le texte dit explicitement que cette personne est propriétaire/fondateur/président de CETTE entreprise.
- medium : très probable mais formulation indirecte (ex. seul nom présenté dans la page « À propos » comme ayant démarré l'entreprise).
- low : simple hypothèse. Dans le doute, mets found=false plutôt que de deviner.

Le nom et l'extrait (evidence) doivent être copiés tels quels depuis le texte fourni. Si personne n'est clairement identifié, found=false et champs texte vides.`;

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
}

async function askClaude(companyName: string, pages: PageText[]): Promise<OwnerAiAnswer | null> {
  const corpus = pages
    .map((p) => `<page url="${p.url}">\n${p.text}\n</page>`)
    .join("\n\n");

  const response = await getClient().messages.create({
    model: OWNER_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: OWNER_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: "user",
        content: `Entreprise : ${companyName}\n\nTexte récupéré sur son site :\n\n${corpus}`,
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
export function verifyAgainstText(answer: OwnerAiAnswer, pages: PageText[], companyName: string): string | null {
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

const EMPTY_OWNER: OwnerFields = {
  ownerName: null, ownerFirstName: null, ownerRole: null,
  ownerConfidence: null, ownerSourceUrl: null, ownerEvidence: null,
};

export interface OwnerAnalysis extends OwnerResult {
  /** Champs à enregistrer ; null = ne rien enregistrer (erreur temporaire, à réessayer) */
  fields: OwnerFields | null;
}

/**
 * Analyse pure (aucun accès à la base) : peut tourner en parallèle.
 * L'enregistrement se fait ensuite avec saveOwnerAnalysis, une requête à la fois.
 */
export async function analyzeOwner(companyName: string, website: string | null): Promise<OwnerAnalysis> {
  if (!website || !isValidWebsiteCandidate(website)) {
    return { status: "no_website", fields: EMPTY_OWNER };
  }

  const pages = await collectSiteText(website);
  if (!pages || pages.every((p) => p.text.length < 50)) {
    return { status: "unreachable", fields: EMPTY_OWNER };
  }

  let answer: OwnerAiAnswer | null;
  try {
    answer = await askClaude(companyName, pages);
  } catch (err) {
    return { status: "error", reason: err instanceof Error ? err.message : "erreur IA", fields: null };
  }
  if (!answer) return { status: "error", reason: "réponse IA invalide", fields: null };

  if (!answer.found || !answer.fullName.trim() || answer.confidence === "low") {
    return { status: "not_found", reason: answer.reason, fields: EMPTY_OWNER };
  }

  const rejection = verifyAgainstText(answer, pages, companyName);
  if (rejection) {
    return { status: "not_found", reason: `rejeté : ${rejection}`, fields: EMPTY_OWNER };
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
      ownerSourceUrl: pages.some((p) => p.url === answer.sourceUrl) ? answer.sourceUrl : pages[0].url,
      ownerEvidence: answer.evidence.slice(0, 500),
    },
  };
}

export async function saveOwnerAnalysis(prospectId: string, analysis: OwnerAnalysis): Promise<void> {
  if (!analysis.fields) return;
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { ...analysis.fields, ownerCheckedAt: new Date() },
  });
}

/** Version unitaire : lit le prospect, analyse, enregistre. */
export async function findProspectOwner(prospectId: string): Promise<OwnerAnalysis> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { companyName: true, website: true },
  });
  if (!prospect) return { status: "error", reason: "prospect introuvable", fields: null };
  const analysis = await analyzeOwner(prospect.companyName, prospect.website);
  await saveOwnerAnalysis(prospectId, analysis);
  return analysis;
}
