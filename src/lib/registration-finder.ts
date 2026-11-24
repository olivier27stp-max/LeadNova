import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { collectSiteText, type PageText } from "@/lib/owner-finder";
import { isValidWebsiteCandidate, normalizeBaseUrl } from "@/lib/enrichment";

/**
 * Année d'immatriculation (ou de fondation) d'une entreprise — pour séparer « moins de 3 ans » et « 3 ans et plus ».
 *
 * Mode économique (défaut), du moins cher au plus cher, on s'arrête au premier résultat vérifié :
 * 1. Gratuit : lit le site de l'entreprise et repère « fondée en 2016 », « depuis 2012 », « since 2015 »…
 * 2. Claude Haiku + 1 à 2 recherches web, sans ouvrir de pages : la citation doit figurer mot pour mot
 *    dans les extraits cités par l'API de recherche (fournis par Anthropic, pas écrits par le modèle).
 * Mode précis (REGISTRATION_MODE=precise) : étape 2 remplacée par Claude Opus qui ouvre les pages.
 * Vérification anti-invention dans les deux cas : l'extrait doit contenir l'année et exister tel quel.
 * Dernier recours, signalé comme simple indice : l'année de création du nom de domaine du site.
 *
 * Les données ouvertes du Registraire ne sont PAS importées en bloc : leur licence (CC-BY-NC-SA) interdit
 * l'utilisation commerciale. On ne lit que des pages publiques, une entreprise à la fois.
 */

const PRECISE = process.env.REGISTRATION_MODE === "precise";
const MODEL = process.env.REGISTRATION_AI_MODEL || (PRECISE ? "claude-opus-5-5" : "claude-haiku-5-5");
const MAX_CONTINUATIONS = 4;

export type RegistrationSource = "registre" | "site" | "web" | "domaine";

export interface RegistrationFields {
  registrationYear: number | null;
  registrationDate: Date | null;
  registrationSource: RegistrationSource | null;
  registrationEvidence: string | null;
  registrationUrl: string | null;
  registrationConfidence: "high" | "medium" | "low" | null;
}

export interface RegistrationResult {
  status: "found" | "hint" | "not_found" | "error";
  reason?: string;
  /** null = ne rien enregistrer (erreur temporaire, à réessayer) */
  fields: RegistrationFields | null;
}

const EMPTY: RegistrationFields = {
  registrationYear: null, registrationDate: null, registrationSource: null,
  registrationEvidence: null, registrationUrl: null, registrationConfidence: null,
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^a-z0-9'@./\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Indice : date de création du nom de domaine (RDAP, gratuit) ───

async function domainCreationDate(website: string | null): Promise<{ date: Date; domain: string } | null> {
  if (!website || !isValidWebsiteCandidate(website)) return null;
  let host: string;
  try {
    host = new URL(normalizeBaseUrl(website)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  // Domaine enregistrable (exemple.ca, exemple.com, exemple.qc.ca)
  const parts = host.split(".");
  const domain = parts.slice(-(parts.length >= 3 && parts[parts.length - 2] === "qc" ? 3 : 2)).join(".");
  // Registre officiel en direct (.ca → CIRA, .com/.net → Verisign) : rdap.org limite le débit
  // et refusait presque toutes les requêtes venant du serveur. rdap.org reste en secours.
  const tld = domain.split(".").pop();
  const direct =
    tld === "ca" ? `https://rdap.ca.fury.ca/rdap/domain/${domain}`
    : tld === "com" || tld === "net" ? `https://rdap.verisign.com/${tld}/v1/domain/${domain}`
    : null;
  for (const url of [direct, `https://rdap.org/domain/${domain}`]) {
    if (!url) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow", headers: { Accept: "application/rdap+json" } });
        if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        if (!res.ok) break;
        const data = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> };
        const reg = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
        const date = reg ? new Date(reg) : null;
        if (date && !isNaN(date.getTime())) return { date, domain };
        break;
      } catch {
        break;
      }
    }
  }
  return null;
}

// ─── Étape gratuite : l'année écrite sur le site ───

const YEAR = "((?:19|20)\\d{2})";
const SITE_PATTERNS = [
  // « fondée en 2016 », « établie depuis 2012 », « incorporée le 3 mars 2019 », « founded in 2015 »
  new RegExp(`(?<!\\p{L})(?:fond[ée]+e?s?|[ée]tablie?s?|incorpor[ée]+e?s?|immatricul[ée]+e?s?|cr[ée]+e?s? en|founded|established|incorporated|est\\.)\\s+(?:en|in|le|depuis|since)?\\s*(?:\\d{1,2}(?:er)?\\s+[a-zéû]+\\s+)?${YEAR}\\b`, "iu"),
  // « en affaires depuis 2010 », « au service de la Rive-Nord depuis 2014 », « since 2015 », « depuis 2012 »
  new RegExp(`(?<!\\p{L})(?:en affaires|en op[ée]ration|au service[^.]{0,40}|serving[^.]{0,40})?\\s*(?:depuis|since)\\s+${YEAR}\\b`, "iu"),
];

/** Cherche une année de fondation dans le texte du site, sans IA. Garde la plus ancienne trouvée. */
export function findYearOnSite(pages: PageText[], nowYear = new Date().getFullYear()): { year: number; evidence: string; url: string } | null {
  let best: { year: number; evidence: string; url: string } | null = null;
  for (const p of pages) {
    for (const sentence of p.text.split(/(?<=[.!?\n])\s+/)) {
      if (sentence.length > 400) continue;
      // « 15 ans d'expérience » ou « membre depuis » décrivent souvent autre chose que l'entreprise
      if (/exp[ée]rience|membre|member|garantie|warranty|©|copyright/i.test(sentence)) continue;
      for (const re of SITE_PATTERNS) {
        const m = sentence.match(re);
        const year = m ? Number(m[1]) : NaN;
        if (Number.isInteger(year) && year >= 1900 && year <= nowYear && (!best || year < best.year)) {
          best = { year, evidence: sentence.trim().slice(0, 300), url: p.url };
        }
      }
    }
  }
  return best;
}

// ─── Mode économique : Haiku + recherche web, sans ouvrir de pages ───

const ECO_SYSTEM = `Tu trouves l'année d'immatriculation ou de fondation d'une petite entreprise de services du Québec, avec la recherche web.
Cherche d'abord sa fiche au Registraire des entreprises du Québec reproduite sur un site public (requête du genre « <nom> <ville> NEQ immatriculation »), sinon l'année de fondation.
Règles :
- Même entreprise seulement : même nom (ou très proche) ET même ville, téléphone ou site. Un homonyme ailleurs ne compte pas.
- « evidence » = passage EXACT d'un résultat de recherche qui contient l'année. Il sera vérifié ; un texte reformulé est rejeté.
- Pas de « X ans d'expérience », de date d'article, d'avis ou de mise à jour. Si rien de sûr : found = false.
Termine par un seul bloc, rien après :
<resultat>{"found": true|false, "kind": "registre"|"web"|"aucun", "year": 2017, "date": "2017-03-14" ou null, "sourceUrl": "https://…", "evidence": "passage exact", "sameCompanyBecause": "…", "confidence": "high"|"medium"|"low"}</resultat>`;

async function researchEco(companyName: string, city: string | null, phone: string | null, website: string | null): Promise<ResearchOutput> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Entreprise : ${companyName}\nVille : ${city || "inconnue"}\nTéléphone : ${phone || "inconnu"}\nSite : ${website || "aucun"}` },
  ];
  const fetched: PageText[] = [];
  let finalText = "";
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await getClient().messages.create({
      model: MODEL,
      // Haiku 5.5 réfléchit par défaut : assez de marge pour la réflexion + la réponse, effort bas = moins de jetons
      max_tokens: 16000,
      output_config: { effort: "low" },
      system: ECO_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2, user_location: { type: "approximate", country: "CA", region: "Quebec" } }],
      messages,
    });
    for (const block of response.content) {
      if (block.type !== "text") continue;
      finalText += block.text;
      // Extraits cités par l'API de recherche : ce sont eux qui servent de preuve
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") fetched.push({ url: c.url, text: `${c.title ?? ""}\n${c.cited_text}` });
      }
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      finalText = "";
      continue;
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return { answer: null, fetched };
    break;
  }
  const m = finalText.match(/<resultat>([\s\S]*?)<\/resultat>/);
  if (!m) return { answer: null, fetched };
  try {
    return { answer: JSON.parse(m[1]) as AiAnswer, fetched };
  } catch {
    return { answer: null, fetched };
  }
}

// ─── Mode précis : Opus lit les pages ───

const SYSTEM = `Tu trouves depuis quand existe une petite entreprise de services du Québec, pour savoir si elle a moins de 3 ans ou 3 ans et plus.

Ce qu'on cherche, par ordre de préférence :
1. « registre » : la date d'immatriculation au Registraire des entreprises du Québec (REQ), avec le NEQ, telle qu'elle apparaît sur une page publique (fiche d'entreprise reproduisant les données du registre). Cherche par exemple « <nom> NEQ » ou « <nom> <ville> immatriculation ».
2. « site » : l'année de fondation écrite par l'entreprise elle-même sur son site (« fondée en 2016 », « depuis 2012 », « en affaires depuis… »).
3. « web » : l'année de fondation dans une autre source fiable (article, annuaire, page Facebook ou LinkedIn de l'entreprise).

Règles strictes :
- Assure-toi que c'est LA MÊME entreprise : même nom (ou nom d'affaires très proche) ET même ville ou même téléphone, adresse ou site. Une entreprise homonyme ailleurs ne compte pas. En cas de doute, ne conclus pas.
- Pour toute source autre que le texte du site fourni, OUVRE la page avec l'outil de lecture de page (web_fetch) : un extrait vu seulement dans les résultats de recherche ne suffit pas.
- « evidence » doit être une citation EXACTE, copiée mot pour mot de la page lue, qui contient l'année (ou la date complète). Elle sera vérifiée automatiquement ; une citation reformulée est rejetée.
- N'utilise PAS « X ans d'expérience » : cela décrit souvent le propriétaire, pas l'entreprise.
- N'utilise pas la date de création du nom de domaine, les dates de publication d'articles ou d'avis, ni une date de mise à jour de fiche.
- Si rien de fiable : found = false. Ne devine jamais.
- Fais au plus 4 recherches et ouvre au plus 5 pages.

Termine ta réponse par un seul bloc, et rien après :
<resultat>{"found": true|false, "kind": "registre"|"site"|"web"|"aucun", "year": 2017, "date": "2017-03-14" ou null, "sourceUrl": "https://…", "evidence": "citation exacte", "sameCompanyBecause": "même nom et même téléphone…", "confidence": "high"|"medium"|"low"}</resultat>`;

interface AiAnswer {
  found: boolean;
  kind: string;
  year: number | null;
  date: string | null;
  sourceUrl: string;
  evidence: string;
  sameCompanyBecause: string;
  confidence: string;
}

interface ResearchOutput {
  answer: AiAnswer | null;
  /** Pages réellement lues par l'IA (texte brut), pour vérifier la citation */
  fetched: PageText[];
}

async function research(
  companyName: string,
  city: string | null,
  phone: string | null,
  website: string | null,
  sitePages: PageText[],
): Promise<ResearchOutput> {
  const site = sitePages.length
    ? sitePages.map((p) => `<page url="${p.url}">\n${p.text.slice(0, 8000)}\n</page>`).join("\n\n")
    : "(site non disponible)";
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Entreprise : ${companyName}\nVille : ${city || "inconnue"}\nTéléphone : ${phone || "inconnu"}\nSite : ${website || "aucun"}\n\nTexte déjà lu sur son site :\n\n${site}`,
    },
  ];
  const fetched: PageText[] = [];
  let finalText = "";

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium" },
      // Versions de base exprès : le texte des pages lues revient tel quel dans la réponse,
      // ce qui permet de vérifier la citation mot pour mot (les versions à filtrage dynamique
      // passent par du code et ne renvoient pas toujours la page brute).
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "CA", region: "Quebec" } },
        { type: "web_fetch_20250910", name: "web_fetch", max_uses: 5, max_content_tokens: 12000 },
      ],
      messages,
    });

    for (const block of response.content) {
      if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
        const src = block.content.content.source;
        if (src.type === "text") fetched.push({ url: block.content.url, text: src.data });
      }
      if (block.type === "text") finalText += block.text;
    }

    if (response.stop_reason === "pause_turn") {
      // Le serveur reprend là où il s'est arrêté : on renvoie la réponse telle quelle, sans nouveau message
      messages.push({ role: "assistant", content: response.content });
      finalText = "";
      continue;
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return { answer: null, fetched };
    break;
  }

  const m = finalText.match(/<resultat>([\s\S]*?)<\/resultat>/);
  if (!m) return { answer: null, fetched };
  try {
    return { answer: JSON.parse(m[1]) as AiAnswer, fetched };
  } catch {
    return { answer: null, fetched };
  }
}

/** Vérifie la réponse contre les pages lues ; renvoie la raison du rejet, ou null si elle tient. */
export function verifyRegistration(answer: AiAnswer, pages: PageText[], nowYear = new Date().getFullYear()): string | null {
  const year = Number(answer.year);
  if (!Number.isInteger(year) || year < 1900 || year > nowYear) return "année invalide";
  if (!["registre", "site", "web"].includes(answer.kind)) return "source invalide";
  const ev = normalize(answer.evidence || "");
  if (ev.length < 6) return "citation manquante";
  if (!ev.includes(String(year))) return "l'année n'est pas dans la citation";
  // La citation doit venir de la page annoncée (ou, à défaut, d'une page lue)
  const page = pages.find((p) => p.url === answer.sourceUrl) ?? null;
  const corpus = normalize((page ? [page] : pages).map((p) => p.text).join("\n"));
  const core = ev.length > 60 ? ev.slice(10, ev.length - 10) : ev;
  if (!corpus.includes(core)) return "citation introuvable dans les pages lues";
  return null;
}

/** Analyse pure (aucune écriture) : peut tourner en parallèle. */
export async function analyzeRegistration(p: {
  companyName: string;
  city: string | null;
  phone: string | null;
  website: string | null;
}): Promise<RegistrationResult> {
  const hasSite = !!p.website && isValidWebsiteCandidate(p.website);
  const site = hasSite ? await collectSiteText(p.website!).catch(() => null) : null;
  const sitePages = site?.pages.filter((x) => x.text.length >= 50) ?? [];

  // 1. Gratuit : l'année écrite sur le site
  const onSite = findYearOnSite(sitePages);
  if (onSite) {
    return {
      status: "found",
      fields: {
        registrationYear: onSite.year,
        registrationDate: null,
        registrationSource: "site",
        registrationEvidence: onSite.evidence,
        registrationUrl: onSite.url,
        registrationConfidence: "medium",
      },
    };
  }

  let out: ResearchOutput;
  try {
    out = PRECISE
      ? await research(p.companyName, p.city, p.phone, hasSite ? p.website : null, sitePages)
      : await researchEco(p.companyName, p.city, p.phone, hasSite ? p.website : null);
  } catch (err) {
    return { status: "error", reason: err instanceof Error ? err.message : "erreur IA", fields: null };
  }

  const answer = out.answer;
  if (answer?.found && answer.confidence !== "low") {
    const rejection = verifyRegistration(answer, [...sitePages, ...out.fetched]);
    if (!rejection) {
      const date = answer.date && /^\d{4}-\d{2}-\d{2}$/.test(answer.date) ? new Date(`${answer.date}T12:00:00Z`) : null;
      const okDate = date && !isNaN(date.getTime()) && date.getUTCFullYear() === Number(answer.year) ? date : null;
      const isSitePage = sitePages.some((x) => x.url === answer.sourceUrl);
      return {
        status: "found",
        fields: {
          registrationYear: Number(answer.year),
          registrationDate: okDate,
          registrationSource: answer.kind === "web" && isSitePage ? "site" : (answer.kind as RegistrationSource),
          registrationEvidence: answer.evidence.slice(0, 400),
          registrationUrl: answer.sourceUrl || null,
          registrationConfidence: answer.confidence === "high" ? "high" : "medium",
        },
      };
    }
    console.warn(`[registration] ${p.companyName} rejeté : ${rejection}`);
  }

  // Dernier recours : création du nom de domaine (simple indice, confiance faible)
  const dom = hasSite ? await domainCreationDate(p.website) : null;
  if (dom) {
    return {
      status: "hint",
      reason: "indice : nom de domaine",
      fields: {
        registrationYear: dom.date.getUTCFullYear(),
        registrationDate: null,
        registrationSource: "domaine",
        registrationEvidence: `Nom de domaine ${dom.domain} créé le ${dom.date.toISOString().slice(0, 10)}`,
        registrationUrl: `https://rdap.org/domain/${dom.domain}`,
        registrationConfidence: "low",
      },
    };
  }
  return { status: "not_found", reason: answer?.sameCompanyBecause || "aucune source fiable", fields: { ...EMPTY } };
}

export async function saveRegistration(prospectId: string, r: RegistrationResult): Promise<void> {
  if (!r.fields) return;
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { ...r.fields, registrationCheckedAt: new Date() },
  });
}

/** Âge en années complètes à partir de l'année (ou de la date exacte si connue). */
export function yearsSince(year: number, date: Date | null, now = new Date()): number {
  if (date) {
    let y = now.getFullYear() - date.getFullYear();
    if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) y--;
    return y;
  }
  return now.getFullYear() - year;
}
