import Anthropic from "@anthropic-ai/sdk";

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

  // Identify which ones need AI validation:
  // - locally valid but with low confidence (< 0.85)
  // - or marked needs_review
  const needsAI: { idx: number; input: CompanyNameInput; local: CompanyNameValidation }[] = [];

  for (let i = 0; i < localResults.length; i++) {
    const { input, local } = localResults[i];
    if (!local.isValid) continue; // Already rejected locally, skip AI
    if (local.confidence >= 0.85 && !local.needsReview) continue; // Clean enough
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
