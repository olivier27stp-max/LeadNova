import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { collectSiteText, type PageText } from "@/lib/owner-finder";
import { isValidWebsiteCandidate, normalizeBaseUrl } from "@/lib/enrichment";

/**
 * Année d'immatriculation (ou de fondation) d'une entreprise — pour séparer « moins de 3 ans » et « 3 ans et plus ».
 *
 * 1. Lit le site de l'entreprise (accueil, À propos, histoire…).
 * 2. Claude cherche sur le web (recherche + lecture des pages) : d'abord la date d'immatriculation au
 *    Registraire des entreprises du Québec reproduite sur une page publique, sinon l'année de fondation
 *    écrite par l'entreprise (« depuis 2015 », « fondée en 2018 »).
 * 3. Vérification anti-invention : l'extrait cité doit apparaître tel quel dans une page réellement lue
 *    (site ou page ouverte par l'IA) et contenir l'année ; sinon le résultat est rejeté.
 * 4. Dernier recours, signalé comme simple indice : l'année de création du nom de domaine du site.
 *
 * Les données ouvertes du Registraire ne sont PAS importées en bloc : leur licence (CC-BY-NC-SA) interdit
 * l'utilisation commerciale. On ne lit que des pages publiques, une entreprise à la fois.
 */

const MODEL = process.env.REGISTRATION_AI_MODEL || "claude-opus-5-5";
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
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> };
    const reg = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
    const date = reg ? new Date(reg) : null;
    return date && !isNaN(date.getTime()) ? { date, domain } : null;
  } catch {
    return null;
  }
}

// ─── Recherche IA ───

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

  let out: ResearchOutput;
  try {
    out = await research(p.companyName, p.city, p.phone, hasSite ? p.website : null, sitePages);
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
