import * as cheerio from "cheerio";

/**
 * Relevance checker: scrapes prospect website and locally checks
 * if the business actually matches the search keyword.
 *
 * 100% gratuit — 0 token AI. Compare les mots-clés avec le contenu
 * du site web (titre, description, headings, paragraphes).
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

// Words that indicate a DIFFERENT industry when found on the website
// These override a matching Google category
const UNRELATED_INDICATORS: Record<string, string[]> = {
  // When searching for window/glass cleaning
  "vitre": ["teint", "tint", "pellicule", "film solaire", "pare-brise", "windshield", "esthétique auto", "esthetique auto", "auto glass", "remplacement de vitre", "réparation de vitre", "installation de vitre", "débosselage", "carrosserie", "automobile", "vehicule", "véhicule"],
  "vitres": ["teint", "tint", "pellicule", "film solaire", "pare-brise", "windshield", "esthétique auto", "esthetique auto", "auto glass", "remplacement de vitre", "réparation de vitre", "installation de vitre", "débosselage", "carrosserie", "automobile", "vehicule", "véhicule"],
  "window": ["tint", "tinting", "film", "auto glass", "windshield", "replacement", "installation", "automotive", "vehicle", "car"],
  "cleaning": ["tint", "tinting", "auto detailing", "car wash", "automotive", "vehicle wrap"],
  "nettoyage": ["teint", "tint", "pare-brise", "automobile", "véhicule", "vehicule", "carrosserie", "esthétique auto", "débosselage", "conduit", "ventilation", "cheminée", "ramonage"],
  "lavage": ["teint", "tint", "pare-brise", "automobile", "esthétique auto", "lave-auto", "car wash"],
  "gouttière": ["toiture", "couvreur", "revêtement", "bardeau", "siding"],
  "ménager": ["conduit", "ventilation", "cheminée", "ramonage", "plomberie"],
  "peinture": ["automobile", "carrosserie", "débosselage", "auto body"],
  "paysag": ["déneigement", "excavation", "asphalte", "pavage"],
  "plomb": ["climatisation", "chauffage", "thermopompe", "hvac"],
  "toiture": ["solaire", "solar", "panneau", "photovoltaïque"],
};

// Positive indicators — words that CONFIRM relevance
const RELEVANT_INDICATORS: Record<string, string[]> = {
  "vitre": ["lavage de vitre", "nettoyage de vitre", "window cleaning", "window washing", "vitres résidentielles", "vitres commerciales", "nettoyage de fenêtre"],
  "vitres": ["lavage de vitre", "nettoyage de vitre", "window cleaning", "window washing", "vitres résidentielles", "vitres commerciales", "nettoyage de fenêtre"],
  "nettoyage": ["entretien ménager", "femme de ménage", "service de nettoyage", "nettoyage résidentiel", "nettoyage commercial", "cleaning service", "house cleaning", "janitorial"],
  "gouttière": ["nettoyage de gouttière", "gutter cleaning", "entretien de gouttière"],
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

    $("script, style, nav, noscript, iframe, svg").remove();

    const parts: string[] = [];

    const title = $("title").text().trim();
    if (title) parts.push(title);

    const metaDesc = $('meta[name="description"]').attr("content")?.trim();
    if (metaDesc) parts.push(metaDesc);

    // OG description as fallback
    const ogDesc = $('meta[property="og:description"]').attr("content")?.trim();
    if (ogDesc && ogDesc !== metaDesc) parts.push(ogDesc);

    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) parts.push(text);
    });

    // First paragraphs + list items (services pages often use <li>)
    $("p, li").slice(0, 15).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10 && text.length < 500) parts.push(text);
    });

    // Footer text (often has business description)
    $("footer").each((_, el) => {
      const text = $(el).text().trim().slice(0, 300);
      if (text) parts.push(text);
    });

    return parts.join(" ").toLowerCase().slice(0, 3000);
  } catch {
    return "";
  }
}

/** Check a single prospect's relevance by comparing site content to keyword */
function checkSingleRelevance(input: RelevanceInput, siteText: string): RelevanceResult {
  const kwLower = input.searchKeyword.toLowerCase();
  const nameLower = input.companyName.toLowerCase();
  const urlLower = (input.website || "").toLowerCase();
  const allText = `${siteText} ${nameLower} ${urlLower}`;

  // Extract core words from the search keyword
  const STOP_WORDS = new Set(["de", "du", "des", "le", "la", "les", "et", "en", "à", "au", "un", "une", "the", "and", "in", "of", "for", "service", "entreprise", "company"]);
  const kwWords = kwLower.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Check for UNRELATED indicators in site content
  for (const kwWord of kwWords) {
    const unrelated = UNRELATED_INDICATORS[kwWord];
    if (!unrelated) continue;
    for (const indicator of unrelated) {
      if (allText.includes(indicator)) {
        // Found an unrelated indicator — but check if there's also a POSITIVE indicator
        const relevant = RELEVANT_INDICATORS[kwWord];
        if (relevant && relevant.some((r) => allText.includes(r))) {
          continue; // Has both unrelated AND relevant — keep it (mixed business)
        }
        return { relevant: false, reason: `"${indicator}" trouvé — non pertinent pour "${kwWord}"` };
      }
    }
  }

  // If we have site text, check that at least one keyword word appears
  if (siteText.length > 50) {
    const hasKeywordMatch = kwWords.some((w) => siteText.includes(w));
    if (!hasKeywordMatch) {
      // Site doesn't mention anything related to the keyword at all
      // But be lenient — only filter if site has enough content to be sure
      if (siteText.length > 200) {
        return { relevant: false, reason: `Aucun mot-clé trouvé sur le site web` };
      }
    }
  }

  return { relevant: true, reason: "OK" };
}

/** Batch check relevance. Scrapes websites and checks locally (0 tokens). */
export async function checkRelevanceBatch(
  inputs: RelevanceInput[]
): Promise<RelevanceResult[]> {
  if (inputs.length === 0) return [];

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

  // Check each prospect locally
  return inputs.map((input, i) => checkSingleRelevance(input, siteTexts[i]));
}
