import * as cheerio from "cheerio";

/**
 * Relevance checker: scrapes prospect website and uses smart local logic
 * to determine if the business matches the user's targeting keywords.
 *
 * 100% gratuit — 0 token AI.
 *
 * Logic:
 * 1. Scrape the homepage (title, description, headings, paragraphs)
 * 2. Score the content against positive keywords (from targeting settings)
 * 3. Score the content against negative/blocked keywords
 * 4. If negative score > positive score → irrelevant
 * 5. If site has enough content but 0 positive matches → irrelevant
 * 6. Uses word proximity: "vitre" near "auto" = negative, "vitre" near "nettoyage" = positive
 */

const SCRAPE_TIMEOUT_MS = 8000;

interface RelevanceInput {
  companyName: string;
  website?: string;
  googleCategory?: string;
  searchKeyword: string;
}

interface RelevanceResult {
  relevant: boolean;
  reason: string;
}

interface RelevanceConfig {
  positiveKeywords: string[];  // from targeting settings (keywords)
  blockedKeywords: string[];   // from targeting settings (blockedKeywords)
}

// ─── Common false-positive industries by context ───
// When these words appear near a keyword word, it signals a different industry
const CONTEXT_NEGATIVE_SIGNALS: Record<string, string[]> = {
  "vitre": ["auto", "automobile", "véhicule", "vehicule", "voiture", "car", "pare-brise", "windshield", "teint", "tint", "pellicule", "film", "wrap", "carrosserie", "body shop", "débosselage", "installation", "remplacement", "replacement"],
  "vitres": ["auto", "automobile", "véhicule", "vehicule", "voiture", "car", "pare-brise", "windshield", "teint", "tint", "pellicule", "film", "wrap", "carrosserie", "body shop", "débosselage", "installation", "remplacement", "replacement"],
  "window": ["tint", "tinting", "film", "auto", "automotive", "vehicle", "car", "windshield", "replacement", "installation"],
  "nettoyage": ["auto", "automobile", "véhicule", "voiture", "conduit", "ventilation", "cheminée", "drain", "fosse", "septique"],
  "cleaning": ["auto", "automotive", "vehicle", "car", "duct", "hvac", "chimney"],
  "lavage": ["auto", "automobile", "voiture", "lave-auto", "car wash"],
  "washing": ["car", "auto", "vehicle", "pressure"],
  "peinture": ["auto", "automobile", "carrosserie", "body shop"],
  "painting": ["auto", "automotive", "body shop"],
  "gouttière": ["toiture", "couvreur", "bardeau", "shingle"],
  "gutter": ["roofing", "shingle", "siding"],
};

/** Scrape homepage and extract meaningful text */
async function scrapeHomepageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadNovaBot/1.0)",
        "Accept": "text/html",
        "Accept-Language": "fr,en",
      },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, svg").remove();

    const parts: string[] = [];

    const title = $("title").text().trim();
    if (title) parts.push(title);

    const metaDesc = $('meta[name="description"]').attr("content")?.trim();
    if (metaDesc) parts.push(metaDesc);

    const ogDesc = $('meta[property="og:description"]').attr("content")?.trim();
    if (ogDesc && ogDesc !== metaDesc) parts.push(ogDesc);

    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) parts.push(text);
    });

    $("p, li").slice(0, 20).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10 && text.length < 500) parts.push(text);
    });

    $("footer").each((_, el) => {
      const text = $(el).text().trim().slice(0, 300);
      if (text) parts.push(text);
    });

    return parts.join(" ").toLowerCase().slice(0, 4000);
  } catch {
    return "";
  }
}

// ─── Scoring logic ───

const STOP_WORDS = new Set([
  "de", "du", "des", "le", "la", "les", "et", "en", "à", "au", "aux",
  "un", "une", "près", "région", "pour", "par", "avec", "dans", "sur",
  "the", "and", "in", "of", "for", "with", "on", "at", "to", "is", "are",
  "service", "services", "entreprise", "company",
]);

/** Extract meaningful words from a phrase */
function extractWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[\s,;.!?/()\-–—]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Count how many times words from a keyword appear in the text */
function scoreKeywordMatch(text: string, keyword: string): number {
  const words = extractWords(keyword);
  let score = 0;
  for (const word of words) {
    // Count occurrences (more = stronger signal)
    const regex = new RegExp(word, "gi");
    const matches = text.match(regex);
    if (matches) {
      score += matches.length;
    }
  }
  // Bonus: full phrase match (much stronger signal)
  if (text.includes(keyword.toLowerCase())) {
    score += 10;
  }
  return score;
}

/** Check if a keyword word appears near a negative context word (within ~100 chars) */
function hasNegativeContext(text: string, keywordWords: string[]): { found: boolean; signal: string } {
  for (const kwWord of keywordWords) {
    const negatives = CONTEXT_NEGATIVE_SIGNALS[kwWord];
    if (!negatives) continue;

    // Find positions of the keyword word in the text
    const kwRegex = new RegExp(kwWord, "gi");
    let kwMatch;
    while ((kwMatch = kwRegex.exec(text)) !== null) {
      const pos = kwMatch.index;
      // Check nearby text (100 chars before and after)
      const nearby = text.slice(Math.max(0, pos - 100), pos + kwWord.length + 100);
      for (const neg of negatives) {
        if (nearby.includes(neg)) {
          return { found: true, signal: `"${kwWord}" près de "${neg}"` };
        }
      }
    }
  }
  return { found: false, signal: "" };
}

/** Check a single prospect's relevance */
function checkSingleRelevance(
  input: RelevanceInput,
  siteText: string,
  config: RelevanceConfig
): RelevanceResult {
  const nameLower = input.companyName.toLowerCase();
  const urlLower = (input.website || "").toLowerCase().replace(/https?:\/\//, "").replace(/www\./, "");
  const allText = `${siteText} ${nameLower} ${urlLower}`;

  // If no site content and no config, keep it
  if (!siteText && config.positiveKeywords.length === 0 && config.blockedKeywords.length === 0) {
    return { relevant: true, reason: "Pas de données pour vérifier" };
  }

  // ─── Step 1: Check blocked keywords (explicit user exclusions) ───
  for (const blocked of config.blockedKeywords) {
    const blockedLower = blocked.toLowerCase();
    if (allText.includes(blockedLower)) {
      return { relevant: false, reason: `Mot bloqué trouvé: "${blocked}"` };
    }
    // Also check URL
    if (urlLower.includes(blockedLower.replace(/\s+/g, ""))) {
      return { relevant: false, reason: `Mot bloqué dans l'URL: "${blocked}"` };
    }
  }

  // ─── Step 2: Score positive keywords vs search keyword context ───
  let positiveScore = 0;
  let bestPositiveMatch = "";
  for (const kw of config.positiveKeywords) {
    const s = scoreKeywordMatch(allText, kw);
    if (s > positiveScore) {
      positiveScore = s;
      bestPositiveMatch = kw;
    }
  }

  // ─── Step 3: Check for negative context (word proximity) ───
  const searchWords = extractWords(input.searchKeyword);
  const negContext = hasNegativeContext(allText, searchWords);

  if (negContext.found) {
    // Negative context detected — is it stronger than positive signal?
    if (positiveScore < 5) {
      return { relevant: false, reason: `Contexte négatif: ${negContext.signal}` };
    }
    // Has some positive signal too — could be a mixed business, keep but flag
  }

  // ─── Step 4: If we have enough site content, check keyword presence ───
  if (siteText.length > 200) {
    // Check if ANY positive keyword appears on the site
    const anyPositiveOnSite = config.positiveKeywords.some((kw) => {
      const words = extractWords(kw);
      return words.some((w) => siteText.includes(w));
    });

    if (!anyPositiveOnSite) {
      // Site doesn't mention anything related to any positive keyword
      // Also check the search keyword itself
      const searchOnSite = searchWords.some((w) => siteText.includes(w));
      if (!searchOnSite) {
        return { relevant: false, reason: "Aucun mot-clé de ciblage trouvé sur le site" };
      }
    }
  }

  // ─── Step 5: Check URL for unrelated business signals ───
  // URLs often reveal the true nature (e.g. "esthetiqueauto.fr")
  const urlWords = urlLower.replace(/[.\-_/]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  for (const kwWord of searchWords) {
    const negatives = CONTEXT_NEGATIVE_SIGNALS[kwWord];
    if (!negatives) continue;
    for (const neg of negatives) {
      const negClean = neg.replace(/\s+/g, "");
      if (urlLower.includes(negClean)) {
        return { relevant: false, reason: `URL indique un autre domaine: "${neg}"` };
      }
    }
  }

  return { relevant: true, reason: positiveScore > 0 ? `Match: "${bestPositiveMatch}" (score: ${positiveScore})` : "OK" };
}

/** Batch check relevance. Scrapes websites and checks locally (0 tokens). */
export async function checkRelevanceBatch(
  inputs: RelevanceInput[],
  config?: RelevanceConfig
): Promise<RelevanceResult[]> {
  if (inputs.length === 0) return [];

  const effectiveConfig: RelevanceConfig = config || { positiveKeywords: [], blockedKeywords: [] };

  // Scrape websites in parallel (max 5 concurrent)
  const siteTexts: string[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < inputs.length; i += CONCURRENCY) {
    const batch = inputs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((inp) => inp.website ? scrapeHomepageText(inp.website) : Promise.resolve(""))
    );
    siteTexts.push(...results);
  }

  return inputs.map((input, i) => checkSingleRelevance(input, siteTexts[i], effectiveConfig));
}
