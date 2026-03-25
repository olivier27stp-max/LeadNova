import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";

// ─── Types ───────────────────────────────────────────────

export interface CompanyNameValidation {
  cleanName: string;
  isValid: boolean;
  confidence: number;
  reason: string;
  needsReview: boolean;
}

interface CompanyNameInput {
  rawName: string;
  website?: string;
  address?: string;
  city?: string;
  industry?: string;
}

// ─── Layer 1: Local Rules ────────────────────────────────

const GENERIC_PAGE_LABELS = new Set([
  "accueil", "home", "homepage", "index", "bienvenue", "welcome",
  "à propos", "about", "about us", "qui sommes-nous",
  "contact", "contactez-nous", "contact us", "nous joindre",
  "voir plus", "learn more", "read more", "en savoir plus",
  "property details", "listing", "annonce", "détails",
  "recherche", "search", "résultats", "results",
  "connexion", "login", "sign in", "inscription", "sign up",
  "page d'accueil", "main page", "site officiel",
  "untitled", "sans titre", "new page", "nouvelle page",
  "error", "404", "page not found", "page introuvable",
  "loading", "chargement",
]);

const SEO_SUFFIXES_REGEX = [
  // Rental/real estate suffixes
  /[,|–—-]\s*(appartements?|condos?|logements?|maisons?|bureaux|locaux|espaces?)\s*(à|for)\s*(louer|rent|vendre|sale)\s*(à|in|de|du|des|au|aux)?\s*.*$/i,
  /\s*[,|–—-]\s*(appartements?|condos?|logements?|maisons?)\s*(à|for)\s*(louer|rent|vendre|sale)$/i,
  /\s*[,|–—-]\s*(location|rental|leasing)\s*(d['']?|de\s+)?(appartements?|condos?|logements?).*$/i,
  // Descriptive content after pipe/dash separator (common SEO pattern)
  /\s*[|–—]\s*(appartements?|condos?|logements?|maisons?|bureaux|locaux|espaces?)\b.*$/i,
  // Generic SEO tails
  /\s*[|–—]\s*(accueil|home|page principale|site officiel).*$/i,
  /\s*[|–—]\s*(meilleur|best|top|#1|premier)\s.*$/i,
  // City name as SEO suffix after separator
  /\s*[,|–—-]\s*(québec|quebec|montréal|montreal|laval|gatineau|sherbrooke|trois-rivières|trois-rivieres|longueuil|lévis|levis|saguenay|drummondville|granby|saint-hyacinthe|rimouski|repentigny|terrebonne|brossard|blainville|joliette|victoriaville|shawinigan|mirabel|magog|sorel-tracy|val-d'or|rouyn-noranda|alma|rivière-du-loup|sept-îles|thetford mines|saint-georges|cowansville|saint-jean-sur-richelieu|saint-jérôme|baie-comeau)\s*$/i,
  // Trailing "à/in CityName"
  /\s+à\s+(québec|quebec|montréal|montreal|laval|gatineau|sherbrooke|trois-rivières|longueuil|lévis|saguenay|drummondville|granby|rimouski|repentigny|terrebonne|brossard)\s*$/i,
];

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 120;

export function localCleanCompanyName(raw: string): CompanyNameValidation {
  let name = raw.trim();

  // Collapse whitespace
  name = name.replace(/\s+/g, " ");

  // Check for empty
  if (!name || name.length < MIN_NAME_LENGTH) {
    return {
      cleanName: "",
      isValid: false,
      confidence: 0,
      reason: "Name is empty or too short.",
      needsReview: false,
    };
  }

  // Check for generic page labels
  if (GENERIC_PAGE_LABELS.has(name.toLowerCase())) {
    return {
      cleanName: "",
      isValid: false,
      confidence: 0.02,
      reason: `Generic navigation/page label "${name}", not a company name.`,
      needsReview: false,
    };
  }

  // Apply SEO suffix removal
  for (const regex of SEO_SUFFIXES_REGEX) {
    name = name.replace(regex, "").trim();
  }

  // Remove trailing separators and whitespace
  name = name.replace(/[|–—-]+\s*$/, "").trim();

  // Remove leading/trailing quotes
  name = name.replace(/^["'«»]+|["'«»]+$/g, "").trim();

  // Check again after cleaning
  if (!name || name.length < MIN_NAME_LENGTH) {
    return {
      cleanName: "",
      isValid: false,
      confidence: 0.05,
      reason: "Name became empty after removing SEO suffixes.",
      needsReview: false,
    };
  }

  if (GENERIC_PAGE_LABELS.has(name.toLowerCase())) {
    return {
      cleanName: "",
      isValid: false,
      confidence: 0.02,
      reason: `Name reduced to generic label "${name}".`,
      needsReview: false,
    };
  }

  // Too long — likely a page title or description, not a company name
  if (name.length > MAX_NAME_LENGTH) {
    return {
      cleanName: name.substring(0, MAX_NAME_LENGTH),
      isValid: false,
      confidence: 0.15,
      reason: "Name is unusually long, likely a page title or description.",
      needsReview: true,
    };
  }

  // Heuristic: if name looks clean (no pipes, dashes with spaces, or commas), high confidence
  const hasSuspiciousPatterns =
    /[|–—]/.test(name) ||
    /\b(louer|rent|vendre|sale|location|rental|listing|annonce)\b/i.test(name) ||
    name.split(" ").length > 8;

  if (hasSuspiciousPatterns) {
    return {
      cleanName: name,
      isValid: true,
      confidence: 0.55,
      reason: "Name contains patterns that may indicate SEO content.",
      needsReview: true,
    };
  }

  // Looks clean
  return {
    cleanName: name,
    isValid: true,
    confidence: 0.90,
    reason: "Name appears clean after local rules.",
    needsReview: false,
  };
}

// ─── Layer 1.5: Website Scraping ─────────────────────────
// When a name is doubtful and we have a website, fetch the homepage
// to extract the real company name from <title>, og:site_name, <h1>, etc.

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

async function fetchHomepageHTML(url: string): Promise<string | null> {
  try {
    let fullUrl = url;
    if (!/^https?:\/\//i.test(fullUrl)) fullUrl = "https://" + fullUrl;
    const res = await fetch(fullUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface WebScrapedName {
  name: string;
  source: string; // e.g. "og:site_name", "title", "h1"
}

function extractCompanyNameFromHTML(html: string): WebScrapedName | null {
  const $ = cheerio.load(html);

  // Priority order: og:site_name > structured data > title tag > h1
  const candidates: WebScrapedName[] = [];

  // 1. og:site_name — most reliable, explicitly set by the site owner
  const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (ogSiteName && ogSiteName.length >= 2 && ogSiteName.length <= 80) {
    candidates.push({ name: ogSiteName, source: "og:site_name" });
  }

  // 2. Schema.org organization name
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (
          (item["@type"] === "Organization" ||
           item["@type"] === "LocalBusiness" ||
           item["@type"] === "RealEstateAgent" ||
           item["@type"] === "Corporation") &&
          item.name
        ) {
          const name = String(item.name).trim();
          if (name.length >= 2 && name.length <= 80) {
            candidates.push({ name, source: "schema.org" });
          }
        }
      }
    } catch {
      // invalid JSON-LD
    }
  });

  // 3. <title> tag — often has SEO junk but can be useful
  const titleText = $("title").first().text()?.trim();
  if (titleText && titleText.length >= 2 && titleText.length <= 100) {
    // Extract the first segment before | – — separators (usually the company name)
    const firstSegment = titleText.split(/\s*[|–—]\s*/)[0]?.trim();
    if (firstSegment && firstSegment.length >= 2) {
      candidates.push({ name: firstSegment, source: "title" });
    }
  }

  // 4. First <h1> — often the company name on homepage
  const h1Text = $("h1").first().text()?.trim();
  if (h1Text && h1Text.length >= 2 && h1Text.length <= 80) {
    candidates.push({ name: h1Text, source: "h1" });
  }

  // 5. Logo alt text — sometimes contains the company name
  const logoAlt = $('img[class*="logo"], img[id*="logo"], img[alt*="logo" i], header img').first().attr("alt")?.trim();
  if (logoAlt && logoAlt.length >= 2 && logoAlt.length <= 60 && logoAlt.toLowerCase() !== "logo") {
    candidates.push({ name: logoAlt, source: "logo-alt" });
  }

  if (candidates.length === 0) return null;

  // Filter out candidates that are themselves generic labels
  const filtered = candidates.filter((c) => {
    const lower = c.name.toLowerCase();
    return !GENERIC_PAGE_LABELS.has(lower);
  });

  // Return best candidate by priority (og:site_name > schema.org > title > h1 > logo)
  return filtered[0] || null;
}

export async function scrapeCompanyName(website: string): Promise<WebScrapedName | null> {
  const html = await fetchHomepageHTML(website);
  if (!html) return null;
  return extractCompanyNameFromHTML(html);
}

// ─── Layer 2: AI Validation (batched) ────────────────────

const AI_MODEL = "claude-haiku-4-5-20251001";
const AI_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 20;

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

const AI_SYSTEM_PROMPT = `You are a company name validation expert. Your job is to determine if a given text is a real business/company name.

Rules:
- Extract ONLY the real company/business name
- Remove SEO keywords, slogans, service descriptions, rental types, city names used as SEO
- Do NOT invent or guess a name — only clean what's there
- Generic labels like "Accueil", "Home", "Contact", page titles, navigation items are NOT company names
- If the name is uncertain, set needs_review to true
- Prefer precision over recall: reject doubtful names rather than accept bad ones
- Respond ONLY with valid JSON, no markdown, no explanation outside the JSON`;

interface AIValidationInput {
  index: number;
  raw_name: string;
  website?: string;
  city?: string;
  industry?: string;
}

interface AIValidationResult {
  index: number;
  clean_company_name: string;
  is_valid_company_name: boolean;
  confidence: number;
  reason: string;
  needs_review: boolean;
}

async function callAIValidation(inputs: AIValidationInput[]): Promise<AIValidationResult[]> {
  const client = getAnthropicClient();

  const userPrompt = `Validate these company names. For each, return a JSON object.

Input:
${JSON.stringify(inputs, null, 2)}

Return a JSON array of objects, one per input, with this exact structure:
[
  {
    "index": <same index as input>,
    "clean_company_name": "<cleaned name or empty if invalid>",
    "is_valid_company_name": <true/false>,
    "confidence": <0.0 to 1.0>,
    "reason": "<brief explanation>",
    "needs_review": <true/false>
  }
]

JSON only, no other text:`;

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse JSON — handle potential markdown wrapping
    const jsonStr = text.replace(/^```json?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      console.error("[company-name-validation] AI returned non-array:", jsonStr.substring(0, 200));
      return [];
    }

    return parsed as AIValidationResult[];
  } catch (error) {
    console.error("[company-name-validation] AI call failed:", error);
    return [];
  }
}

// ─── Main validation function ────────────────────────────

export async function validateCompanyNames(
  inputs: CompanyNameInput[]
): Promise<CompanyNameValidation[]> {
  if (inputs.length === 0) return [];

  // Layer 1: local rules
  const localResults = inputs.map((input) => ({
    input,
    local: localCleanCompanyName(input.rawName),
  }));

  // Layer 1.5: Web scraping for doubtful names with a website
  const needsScraping: number[] = [];
  for (let i = 0; i < localResults.length; i++) {
    const { input, local } = localResults[i];
    if (input.website && (local.confidence < 0.85 || local.needsReview)) {
      needsScraping.push(i);
    }
  }

  if (needsScraping.length > 0) {
    // Scrape in parallel (max 5 concurrent)
    const CONCURRENCY = 5;
    for (let i = 0; i < needsScraping.length; i += CONCURRENCY) {
      const batch = needsScraping.slice(i, i + CONCURRENCY);
      const promises = batch.map(async (idx) => {
        const { input } = localResults[idx];
        if (!input.website) return;
        try {
          const scraped = await scrapeCompanyName(input.website);
          if (scraped) {
            // Validate the scraped name with local rules too
            const scrapedClean = localCleanCompanyName(scraped.name);
            if (scrapedClean.isValid && scrapedClean.confidence >= 0.80) {
              console.log(`  [scrape] "${input.rawName}" → "${scrapedClean.cleanName}" (via ${scraped.source})`);
              localResults[idx].local = {
                cleanName: scrapedClean.cleanName,
                isValid: true,
                confidence: Math.max(scrapedClean.confidence, 0.88),
                reason: `Company name found via website ${scraped.source}: "${scraped.name}"`,
                needsReview: false,
              };
            }
          }
        } catch (error) {
          console.warn(`  [scrape] Failed for ${input.website}:`, error);
        }
      });
      await Promise.all(promises);
    }
  }

  // Identify which ones still need AI validation after scraping:
  // - locally valid but with low confidence (< 0.85)
  // - or marked needs_review
  const needsAI: { idx: number; input: CompanyNameInput; local: CompanyNameValidation }[] = [];

  for (let i = 0; i < localResults.length; i++) {
    const { input, local } = localResults[i];
    if (!local.isValid) continue; // Already rejected locally, skip AI
    if (local.confidence >= 0.85 && !local.needsReview) continue; // Clean enough (or fixed by scraping)
    needsAI.push({ idx: i, input, local });
  }

  // Layer 2: AI validation in batches
  if (needsAI.length > 0 && process.env.ANTHROPIC_API_KEY) {
    for (let batchStart = 0; batchStart < needsAI.length; batchStart += BATCH_SIZE) {
      const batch = needsAI.slice(batchStart, batchStart + BATCH_SIZE);
      const aiInputs: AIValidationInput[] = batch.map((item) => ({
        index: item.idx,
        raw_name: item.input.rawName,
        website: item.input.website,
        city: item.input.city,
        industry: item.input.industry,
      }));

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

        const aiResults = await callAIValidation(aiInputs);
        clearTimeout(timeout);

        // Merge AI results back
        for (const aiResult of aiResults) {
          const idx = aiResult.index;
          if (idx < 0 || idx >= localResults.length) continue;

          localResults[idx].local = {
            cleanName: aiResult.clean_company_name || "",
            isValid: aiResult.is_valid_company_name,
            confidence: aiResult.confidence,
            reason: aiResult.reason,
            needsReview: aiResult.needs_review,
          };
        }
      } catch (error) {
        console.error("[company-name-validation] AI batch failed, using local results:", error);
        // Fallback: keep local results as-is
      }
    }
  }

  return localResults.map((r) => r.local);
}

// ─── Single name convenience function ────────────────────

export async function validateSingleCompanyName(
  rawName: string,
  context?: Omit<CompanyNameInput, "rawName">
): Promise<CompanyNameValidation> {
  const results = await validateCompanyNames([{ rawName, ...context }]);
  return results[0];
}
