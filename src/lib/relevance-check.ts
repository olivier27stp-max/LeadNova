import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Relevance checker: scrapes prospect website + uses AI to verify
 * if the business actually matches the search keyword.
 *
 * Used during discovery to filter out false positives like
 * "TEINTE TA TIOP" (auto tinting) when searching for "nettoyage de vitres".
 */

const SCRAPE_TIMEOUT_MS = 8000;
const MAX_TEXT_LENGTH = 1500; // chars sent to AI per prospect

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

/** Scrape homepage and extract meaningful text (title, meta, headings, first paragraphs) */
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

    // Remove scripts, styles, nav, footer noise
    $("script, style, nav, footer, noscript, iframe, svg").remove();

    const parts: string[] = [];

    // Title
    const title = $("title").text().trim();
    if (title) parts.push(`Titre: ${title}`);

    // Meta description
    const metaDesc = $('meta[name="description"]').attr("content")?.trim();
    if (metaDesc) parts.push(`Description: ${metaDesc}`);

    // H1, H2, H3
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) parts.push(text);
    });

    // First few paragraphs
    $("p").slice(0, 8).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20 && text.length < 500) parts.push(text);
    });

    return parts.join("\n").slice(0, MAX_TEXT_LENGTH);
  } catch {
    return "";
  }
}

/** Batch check relevance using AI. Returns array of results matching input order. */
export async function checkRelevanceBatch(
  inputs: RelevanceInput[]
): Promise<RelevanceResult[]> {
  if (inputs.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No AI key — assume all relevant (skip check)
    return inputs.map(() => ({ relevant: true, reason: "No API key — skipped" }));
  }

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

  // Build the prompt — one batch call for all prospects
  const prospectLines = inputs.map((inp, i) => {
    const site = siteTexts[i] ? `\nSite web:\n${siteTexts[i]}` : "\nSite web: (non disponible)";
    return `--- Prospect ${i + 1} ---
Nom: ${inp.companyName}
Catégorie Google: ${inp.googleCategory || "inconnue"}
URL: ${inp.website || "aucun"}${site}`;
  }).join("\n\n");

  const prompt = `Tu es un expert en validation de prospects B2B.

Mot-clé de recherche: "${inputs[0].searchKeyword}"

Pour chaque prospect ci-dessous, détermine si l'entreprise offre RÉELLEMENT le service correspondant au mot-clé de recherche.
Attention: la catégorie Google peut être incorrecte. Base-toi principalement sur le contenu du site web et le nom de l'entreprise.

${prospectLines}

Réponds en JSON uniquement, un tableau avec un objet par prospect:
[{"relevant": true/false, "reason": "explication courte"}]

Exemples de cas NON pertinents:
- Teintage de vitres d'auto quand on cherche "nettoyage de vitres"
- Installation de pare-brise quand on cherche "lavage de vitres"
- Esthétique automobile quand on cherche "nettoyage de vitres"
- Revêtement extérieur quand on cherche "nettoyage de maison"

Sois strict: si le service principal de l'entreprise ne correspond PAS au mot-clé, marque-le comme non pertinent.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[relevance-check] Could not parse AI response:", text.slice(0, 200));
      return inputs.map(() => ({ relevant: true, reason: "Parse error — kept" }));
    }

    const parsed = JSON.parse(jsonMatch[0]) as RelevanceResult[];
    // Ensure array length matches
    if (parsed.length !== inputs.length) {
      console.warn(`[relevance-check] AI returned ${parsed.length} results for ${inputs.length} inputs`);
      return inputs.map((_, i) => parsed[i] || { relevant: true, reason: "Missing — kept" });
    }
    return parsed;
  } catch (error) {
    console.error("[relevance-check] AI call failed:", error);
    return inputs.map(() => ({ relevant: true, reason: "AI error — kept" }));
  }
}
