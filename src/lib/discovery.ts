import { prisma } from "./db";
import { calculateLeadScore } from "./lead-scoring";
import { Prisma } from "@/generated/prisma/client";
import { isCancelRequested } from "./discovery-progress";
import { validateCompanyNames, localCleanCompanyName } from "./company-name-validation";
import { checkRelevanceBatch } from "./relevance-check";

// ─── Targeting settings loader ────────────────────────────
interface TargetingSettings {
  keywords: string[];
  blockedKeywords: string[];
  cities: string[];
  searchQueries: string[];
  region: string;
  minReviews?: number;
  maxReviews?: number;
}

export async function loadTargetingSettings(workspaceId?: string | null): Promise<TargetingSettings> {
  const empty: TargetingSettings = { keywords: [], blockedKeywords: [], cities: [], searchQueries: [], region: "CA" };
  try {
    const where = workspaceId ? { workspaceId } : { workspaceId: null };
    const row = await prisma.appSettings.findFirst({ where, select: { data: true } });
    if (!row?.data || typeof row.data !== "object") return empty;
    const data = row.data as Record<string, unknown>;
    const targeting = data.targeting as Record<string, unknown> | undefined;
    if (!targeting) return empty;
    return {
      keywords: Array.isArray(targeting.keywords) ? (targeting.keywords as string[]).filter(Boolean) : [],
      blockedKeywords: Array.isArray(targeting.blockedKeywords) ? (targeting.blockedKeywords as string[]).map((k) => (k as string).toLowerCase().trim()).filter(Boolean) : [],
      cities: Array.isArray(targeting.cities) ? (targeting.cities as string[]).filter(Boolean) : [],
      searchQueries: Array.isArray(targeting.searchQueries) ? (targeting.searchQueries as string[]).filter(Boolean) : [],
      region: typeof targeting.region === "string" ? (targeting.region as string) : "CA",
      minReviews: typeof targeting.minReviews === "number" ? targeting.minReviews : undefined,
      maxReviews: typeof targeting.maxReviews === "number" ? targeting.maxReviews : undefined,
    };
  } catch {
    return empty;
  }
}

function matchesBlockedKeyword(text: string, blockedKeywords: string[]): boolean {
  if (blockedKeywords.length === 0) return false;
  const lower = text.toLowerCase();
  return blockedKeywords.some((bk) => lower.includes(bk));
}

// ─── Relevance filtering ─────────────────────────────────
// Detects when a Google result is from a completely different industry
// even though it shares a keyword (e.g. "vitres" → window cleaning vs auto glass)

// Map of search terms → unrelated industry indicators in company name/address
const INDUSTRY_EXCLUSIONS: Array<{ keywords: string[]; exclude: string[] }> = [
  // Window cleaning ≠ auto glass / tinting / detailing
  { keywords: ["lavage de vitres", "nettoyage de vitres", "vitres résidentielles", "vitres commerciales", "window cleaning", "window washing"],
    exclude: ["auto", "automobile", "pare-brise", "windshield", "carrosserie", "d'autos", "d'auto", "car wash", "teint", "tint", "esthétique", "esthetique", "detailing", "pellicule", "film", "wrapping", "wrap"] },
  // Pressure washing ≠ car wash
  { keywords: ["lavage à pression", "lavage pression"],
    exclude: ["auto", "automobile", "car wash", "lave-auto"] },
  // Building cleaning ≠ duct cleaning, chimney
  { keywords: ["nettoyage", "entretien ménager", "femme de ménage"],
    exclude: ["conduit", "ventilation", "cheminée", "ramonage", "fosse septique", "drain"] },
  // Landscaping ≠ snow removal only companies
  { keywords: ["aménagement paysager", "paysagiste"],
    exclude: ["déneigement", "excavation", "asphalte"] },
  // Plumbing ≠ HVAC
  { keywords: ["plombier", "plomberie"],
    exclude: ["climatisation", "chauffage", "thermopompe", "hvac"] },
  // Painting ≠ auto painting
  { keywords: ["peinture", "peintre"],
    exclude: ["auto", "automobile", "carrosserie", "débosselage"] },
  // Roofing ≠ solar panels
  { keywords: ["toiture", "couvreur"],
    exclude: ["solaire", "solar", "panneau"] },
  // Window washing ≠ window installation
  { keywords: ["lavage de vitres", "nettoyage de vitres"],
    exclude: ["installation", "remplacement", "fenêtre", "porte et fenêtre", "vitrerie"] },
];

/** Check if a result is irrelevant based on the search keyword vs company name/category/website mismatch */
function isIrrelevantResult(companyName: string, searchKeyword: string, googleCategory?: string, website?: string): boolean {
  const nameLower = companyName.toLowerCase();
  const kwLower = searchKeyword.toLowerCase();
  const catLower = (googleCategory || "").toLowerCase();
  // Include website URL in checks — domain often reveals the real business type
  // e.g. "teintetatiop-esthetiqueauto.fr" contains "esthetique" and "auto"
  const siteLower = (website || "").toLowerCase().replace(/https?:\/\//, "").replace(/www\./, "");
  const textToCheck = `${nameLower} ${catLower} ${siteLower}`;

  // Rule-based exclusions
  for (const rule of INDUSTRY_EXCLUSIONS) {
    const keywordMatches = rule.keywords.some((k) => kwLower.includes(k));
    if (!keywordMatches) continue;
    if (rule.exclude.some((ex) => textToCheck.includes(ex))) {
      return true;
    }
  }

  // ─── Generic keyword-vs-category relevance check ───
  // If we have a Google category, check if it's completely unrelated to the search keyword.
  // Extract core service words from the keyword (remove city names and common words)
  if (catLower && catLower.length > 2) {
    const STOP_WORDS = new Set(["de", "du", "des", "le", "la", "les", "et", "en", "à", "au", "aux", "un", "une", "près", "région", "the", "and", "in", "of", "for"]);
    const kwWords = kwLower
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // Check if at least one keyword word appears in the category, company name, or website
    const hasRelevantMatch = kwWords.some((w) =>
      catLower.includes(w) || nameLower.includes(w) || siteLower.includes(w)
    );

    // If no keyword word matches the category or name, it's likely irrelevant
    // BUT only if the category itself seems unrelated (not a generic category)
    const GENERIC_CATEGORIES = ["business", "entreprise", "company", "service", "contractor", "entrepreneur"];
    const isGenericCategory = GENERIC_CATEGORIES.some((g) => catLower.includes(g));

    if (!hasRelevantMatch && !isGenericCategory) {
      return true;
    }
  }

  return false;
}

// ─── City name normalization (merge variants) ────────────
const CITY_CANONICAL: Record<string, string> = {
  "montreal": "Montréal",
  "montréal": "Montréal",
  "quebec": "Québec",
  "québec": "Québec",
  "quebec city": "Québec",
  "trois-rivieres": "Trois-Rivières",
  "trois-rivières": "Trois-Rivières",
  "trois rivieres": "Trois-Rivières",
  "trois rivières": "Trois-Rivières",
  "drummondville": "Drummondville",
  "sherbrooke": "Sherbrooke",
  "granby": "Granby",
  "laval": "Laval",
  "gatineau": "Gatineau",
  "longueuil": "Longueuil",
  "levis": "Lévis",
  "lévis": "Lévis",
  "saguenay": "Saguenay",
  "saint-hyacinthe": "Saint-Hyacinthe",
  "saint-jean-sur-richelieu": "Saint-Jean-sur-Richelieu",
  "saint-jerome": "Saint-Jérôme",
  "saint-jérôme": "Saint-Jérôme",
  "rimouski": "Rimouski",
  "shawinigan": "Shawinigan",
  "repentigny": "Repentigny",
  "brossard": "Brossard",
  "terrebonne": "Terrebonne",
  "blainville": "Blainville",
  "mirabel": "Mirabel",
  "joliette": "Joliette",
  "victoriaville": "Victoriaville",
  "sorel-tracy": "Sorel-Tracy",
  "magog": "Magog",
  "val-d'or": "Val-d'Or",
  "rouyn-noranda": "Rouyn-Noranda",
  "alma": "Alma",
  "riviere-du-loup": "Rivière-du-Loup",
  "rivière-du-loup": "Rivière-du-Loup",
  "baie-comeau": "Baie-Comeau",
  "sept-iles": "Sept-Îles",
  "sept-îles": "Sept-Îles",
  "thetford mines": "Thetford Mines",
  "saint-georges": "Saint-Georges",
  "cowansville": "Cowansville",
};

function normalizeCityName(city: string): string {
  const lower = city.toLowerCase().trim();
  return CITY_CANONICAL[lower] || city.trim();
}

interface SearchResult {
  companyName: string;
  website?: string;
  address?: string;
  phone?: string;
  googleMapsUrl?: string;
  city: string;
  industry: string;
  source: string;
  reviewCount?: number;
  googleCategory?: string; // Google Maps business category (e.g. "Siding contractor")
  _searchQuery?: string; // internal: the query that found this result
}

interface DiscoveryDiagnostics {
  queriesAttempted: number;
  queriesWithResults: number;
  queriesFailed: number;
  errors: string[];
}

export interface DiscoveryOutcome {
  found: number;
  new: number;
  skippedExisting: number;
  diagnostics: DiscoveryDiagnostics;
}

// ─── Google Places API (New) ────────────

interface PlacesResult {
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  userRatingCount?: number;
}

// Coordinates of QC cities for locationBias (lat, lng, radiusMeters)
// Radius of 30km covers surrounding towns (ex: Wickham for Drummondville)
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "montréal": { lat: 45.5017, lng: -73.5673 },
  "québec": { lat: 46.8139, lng: -71.2080 },
  "laval": { lat: 45.6066, lng: -73.7124 },
  "gatineau": { lat: 45.4765, lng: -75.7013 },
  "longueuil": { lat: 45.5312, lng: -73.5185 },
  "sherbrooke": { lat: 45.4042, lng: -71.8929 },
  "lévis": { lat: 46.8032, lng: -71.1780 },
  "trois-rivières": { lat: 46.3432, lng: -72.5419 },
  "saguenay": { lat: 48.4280, lng: -71.0686 },
  "terrebonne": { lat: 45.6960, lng: -73.6474 },
  "saint-jean-sur-richelieu": { lat: 45.3073, lng: -73.2629 },
  "repentigny": { lat: 45.7422, lng: -73.4499 },
  "brossard": { lat: 45.4584, lng: -73.4551 },
  "drummondville": { lat: 45.8838, lng: -72.4843 },
  "saint-jérôme": { lat: 45.7804, lng: -74.0036 },
  "granby": { lat: 45.4000, lng: -72.7333 },
  "blainville": { lat: 45.6704, lng: -73.8813 },
  "mirabel": { lat: 45.6501, lng: -74.0826 },
  "shawinigan": { lat: 46.5500, lng: -72.7500 },
  "saint-hyacinthe": { lat: 45.6307, lng: -72.9571 },
  "rimouski": { lat: 48.4490, lng: -68.5234 },
  "victoriaville": { lat: 46.0500, lng: -71.9667 },
  "sorel-tracy": { lat: 46.0333, lng: -73.1167 },
  "joliette": { lat: 46.0167, lng: -73.4333 },
  "magog": { lat: 45.2667, lng: -72.1500 },
  "val-d'or": { lat: 48.1000, lng: -77.7833 },
  "rouyn-noranda": { lat: 48.2333, lng: -79.0167 },
  "alma": { lat: 48.5500, lng: -71.6500 },
  "rivière-du-loup": { lat: 47.8333, lng: -69.5333 },
  "baie-comeau": { lat: 49.2167, lng: -68.1500 },
  "sept-îles": { lat: 50.2167, lng: -66.3833 },
  "thetford mines": { lat: 46.1000, lng: -71.3000 },
  "saint-georges": { lat: 46.1167, lng: -70.6667 },
  "cowansville": { lat: 45.2000, lng: -72.7500 },
};

function getCityCoords(city: string): { lat: number; lng: number } | null {
  const key = city.toLowerCase().trim();
  // Direct match
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  // Try canonical name
  const canonical = CITY_CANONICAL[key];
  if (canonical) return CITY_COORDS[canonical.toLowerCase()] || null;
  return null;
}

const SEARCH_RADIUS_METERS = 30000; // 30km — covers surrounding towns

async function searchPlaces(query: string, city: string, region = "CA"): Promise<SearchResult[]> {
  const outscrapeKey = process.env.OUTSCRAPER_API_KEY;
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const lang = region === "CA" ? "fr" : "en";

  // Try Outscraper first, fall back to Google Places if no results or error
  if (outscrapeKey) {
    try {
      const results = await searchViaOutscraper(query, city, outscrapeKey, region, lang);
      if (results.length > 0) return results;
      console.warn(`[discovery] Outscraper returned 0 results for "${query}", falling back to Google Places`);
    } catch (err) {
      console.error(`[discovery] Outscraper error, falling back to Google Places:`, err);
    }
  }
  if (placesKey) {
    return searchViaGooglePlaces(query, city, placesKey, lang);
  }
  throw new Error("OUTSCRAPER_API_KEY or GOOGLE_PLACES_API_KEY not configured");
}

// ─── Outscraper implementation ──────────────

interface OutscraperResult {
  name?: string;
  address?: string;
  full_address?: string;
  phone?: string;
  website?: string;
  site?: string;
  location_link?: string;
  google_maps_url?: string;
  city?: string;
  reviews?: number;
  rating?: number;
  type?: string;
  category?: string;
  subtypes?: string;
  state?: string;
  postal_code?: string;
}

async function searchViaOutscraper(query: string, city: string, apiKey: string, region = "CA", lang = "fr"): Promise<SearchResult[]> {
  // Avoid duplicating city if query already contains it
  const cityLower = city.toLowerCase();
  const queryHasCity = query.toLowerCase().includes(cityLower);
  const provinceSuffix = region === "CA" ? ", QC" : "";
  const searchQuery = queryHasCity ? query : `${query}, ${city}${provinceSuffix}`;
  const params = new URLSearchParams({
    query: searchQuery,
    limit: "40",
    async: "false",
    language: lang,
    region,
  });

  const res = await fetch(`https://api.outscraper.cloud/google-maps-search?${params}`, {
    method: "GET",
    headers: { "X-API-KEY": apiKey },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outscraper API error: ${res.status} - ${text}`);
  }

  const data = await res.json();
  console.log(`[outscraper] Query: "${searchQuery}" — Response keys: ${Object.keys(data || {}).join(", ")}, data type: ${typeof data?.data}, data[0] type: ${typeof data?.data?.[0]}, length: ${Array.isArray(data?.data?.[0]) ? data.data[0].length : (Array.isArray(data?.data) ? data.data.length : "N/A")}`);
  // Outscraper returns { data: [[...results]] } for search-v3
  const results: OutscraperResult[] = Array.isArray(data?.data?.[0]) ? data.data[0] : (Array.isArray(data?.data) ? data.data : []);

  return results
    .filter((r) => r.name)
    .map((r) => {
      let website = r.website || r.site || undefined;
      if (website && !/^https?:\/\//i.test(website)) {
        website = "https://" + website;
      }

      return {
        companyName: r.name!,
        website,
        address: r.full_address || r.address || undefined,
        phone: r.phone || undefined,
        googleMapsUrl: r.location_link || r.google_maps_url || undefined,
        city: r.city || normalizeCityName(city),
        industry: r.type || r.category || query.replace(city, "").trim(),
        source: "outscraper",
        reviewCount: r.reviews,
        googleCategory: r.type || r.category || undefined,
      };
    });
}

// ─── Google Places fallback ─────────────────

async function searchViaGooglePlaces(query: string, city: string, apiKey: string, lang = "fr"): Promise<SearchResult[]> {
  const requestBody: Record<string, unknown> = {
    textQuery: query,
    languageCode: lang,
    maxResultCount: 20,
  };

  const coords = getCityCoords(city);
  if (coords) {
    requestBody.locationBias = {
      circle: {
        center: { latitude: coords.lat, longitude: coords.lng },
        radius: SEARCH_RADIUS_METERS,
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.userRatingCount",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places API error: ${res.status} - ${text}`);
  }

  const data = await res.json();
  const places: PlacesResult[] = data.places || [];

  return places
    .filter((p) => p.displayName?.text)
    .map((p) => {
      let website = p.websiteUri || undefined;
      if (website && !/^https?:\/\//i.test(website)) {
        website = "https://" + website;
      }

      return {
        companyName: p.displayName!.text,
        website,
        address: p.formattedAddress || undefined,
        phone: p.nationalPhoneNumber || undefined,
        googleMapsUrl: p.googleMapsUri || undefined,
        city: normalizeCityName(city),
        industry: query.replace(city, "").trim(),
        source: "google_places",
        reviewCount: p.userRatingCount,
      };
    });
}

export async function discoverProspects(
  city: string,
  industry?: string,
  maxNew = Number.POSITIVE_INFINITY,
  batchId?: string,
  workspaceId?: string | null
): Promise<DiscoveryOutcome> {
  const normalizedCity = normalizeCityName(city);
  const settings = await loadTargetingSettings(workspaceId);

  // Build queries from user settings
  const isOutscraper = !!process.env.OUTSCRAPER_API_KEY;

  const queries: string[] = [];
  const addedQueries = new Set<string>();
  function addQuery(q: string) {
    const key = q.toLowerCase().trim();
    if (!addedQueries.has(key)) {
      addedQueries.add(key);
      queries.push(q);
    }
  }
  for (const sq of settings.searchQueries) {
    addQuery(sq.replace(/\{city\}/gi, city));
  }
  for (const kw of settings.keywords) {
    addQuery(`${kw} ${city}`);
    // Only add FR variations for Google Places (fast API). Outscraper is slow per query.
    if (!isOutscraper) {
      addQuery(`${kw} près de ${city}`);
      addQuery(`${kw} région de ${city}`);
    }
  }

  // For Outscraper: limit to max 5 queries to keep it fast (each takes ~10-20s)
  const effectiveQueries = isOutscraper ? queries.slice(0, 5) : queries;

  if (effectiveQueries.length === 0) {
    return { found: 0, new: 0, skippedExisting: 0, diagnostics: { queriesAttempted: 0, queriesWithResults: 0, queriesFailed: 0, errors: ["Aucun mot-clé ou requête configuré dans Ciblage"] } };
  }

  const blockedKeywords = settings.blockedKeywords;

  // ─── Pre-load existing prospects to skip duplicates (saves API tokens + AI calls) ───
  const existingWhere: Record<string, unknown> = { archivedAt: null };
  if (workspaceId) existingWhere.workspaceId = workspaceId;
  const existingProspects = await prisma.prospect.findMany({
    where: existingWhere,
    select: { companyName: true, city: true, phone: true },
  });
  const existingNames = new Set(
    existingProspects.map((p) => `${p.companyName.toLowerCase().trim()}|${(p.city || "").toLowerCase().trim()}`)
  );
  const existingPhones = new Set(
    existingProspects
      .filter((p) => p.phone)
      .map((p) => p.phone!.replace(/\D/g, ""))
      .filter((p) => p.length >= 7)
  );

  const allResults: SearchResult[] = [];
  const errors: string[] = [];
  let queriesWithResults = 0;

  for (const query of effectiveQueries) {
    if (isCancelRequested()) break;
    try {
      const results = await searchPlaces(query, city, settings.region);
      if (results.length > 0) {
        queriesWithResults++;
      }
      allResults.push(
        ...results.map((r) => ({
          ...r,
          city: normalizedCity,
          industry: industry || r.industry,
          _searchQuery: query,
        }))
      );
      // For Outscraper: stop early if we have enough results
      if (isOutscraper && allResults.length >= (maxNew * 2)) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${query}: ${message}`);
      console.error(`Discovery error for query "${query}":`, error);
      if (message.includes("403") || message.includes("429")) {
        break;
      }
    }
  }

  // Deduplicate by company name (case-insensitive)
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    const key = r.companyName.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter out prospects that already exist in the database
  const afterExisting = unique.filter((r) => {
    const nameKey = `${r.companyName.toLowerCase().trim()}|${(r.city || "").toLowerCase().trim()}`;
    if (existingNames.has(nameKey)) return false;
    if (r.phone) {
      const phoneKey = r.phone.replace(/\D/g, "");
      if (phoneKey.length >= 7 && existingPhones.has(phoneKey)) return false;
    }
    return true;
  });

  // Filter out irrelevant results (wrong industry despite matching keyword)
  const afterRelevance = afterExisting.filter((r) => {
    if (!r._searchQuery) return true;
    return !isIrrelevantResult(r.companyName, r._searchQuery, r.googleCategory, r.website);
  });

  // Filter out prospects matching blocked keywords
  const afterBlocked = blockedKeywords.length > 0
    ? afterRelevance.filter((r) => {
        const textToCheck = [r.companyName, r.industry, r.website, r.address].filter(Boolean).join(" ");
        return !matchesBlockedKeyword(textToCheck, blockedKeywords);
      })
    : afterRelevance;

  // Filter by review count (from targeting settings)
  const { minReviews, maxReviews } = settings;
  const filtered = (minReviews != null || maxReviews != null)
    ? afterBlocked.filter((r) => {
        // If place has no review data, skip it only when a min is set
        if (r.reviewCount == null) return minReviews == null;
        if (minReviews != null && r.reviewCount < minReviews) return false;
        if (maxReviews != null && r.reviewCount > maxReviews) return false;
        return true;
      })
    : afterBlocked;

  // ─── Relevance check (scrape website + smart local logic with user keywords) ───
  // Uses the user's positive keywords + blocked keywords to determine relevance
  const relevanceConfig = {
    positiveKeywords: settings.keywords,
    blockedKeywords: settings.blockedKeywords,
  };
  const withWebsite = filtered.filter((r) => r.website && r._searchQuery);
  const withoutWebsite = filtered.filter((r) => !r.website || !r._searchQuery);

  let afterAIRelevance = [...withoutWebsite];
  if (withWebsite.length > 0 && !isCancelRequested()) {
    const RELEVANCE_BATCH_SIZE = 10;
    for (let i = 0; i < withWebsite.length; i += RELEVANCE_BATCH_SIZE) {
      if (isCancelRequested()) break;
      const batch = withWebsite.slice(i, i + RELEVANCE_BATCH_SIZE);
      try {
        const results = await checkRelevanceBatch(
          batch.map((r) => ({
            companyName: r.companyName,
            website: r.website,
            googleCategory: r.googleCategory,
            searchKeyword: r._searchQuery!,
          })),
          relevanceConfig
        );
        for (let j = 0; j < batch.length; j++) {
          if (results[j]?.relevant !== false) {
            afterAIRelevance.push(batch[j]);
          } else {
            console.log(`[discovery] AI filtered: "${batch[j].companyName}" — ${results[j]?.reason}`);
          }
        }
      } catch (error) {
        console.error("[discovery] AI relevance check failed, keeping all:", error);
        afterAIRelevance.push(...batch);
      }
    }
    console.log(`[discovery] AI relevance: ${afterAIRelevance.length} kept / ${filtered.length} total (${filtered.length - afterAIRelevance.length} filtered)`);
  } else {
    afterAIRelevance = filtered;
  }

  // ─── Company name validation (Layer 1 local + Layer 2 AI) ───
  const AI_SKIP_REVIEW_THRESHOLD = 25; // Skip AI validation if prospect has 25+ Google reviews

  // First pass: local rules to reject obvious garbage and clean names
  const localChecked = afterAIRelevance.map((result) => {
    const local = localCleanCompanyName(result.companyName);
    // #4: Auto-validate if 25+ reviews — clearly a real business, no AI needed
    if (result.reviewCount != null && result.reviewCount >= AI_SKIP_REVIEW_THRESHOLD) {
      return { result, local: { ...local, isValid: true, confidence: 1.0, needsReview: false, reason: `Auto-validé (${result.reviewCount} avis Google)` } };
    }
    return { result, local };
  });

  // Remove locally-rejected entries (invalid with no review needed)
  const afterLocalFilter = localChecked.filter(({ local }) => local.isValid || local.needsReview);

  // #1: Load AI validation cache from DB to avoid re-validating known names
  let aiCache = new Map<string, { isValid: boolean; cleanName: string; confidence: number; needsReview: boolean }>();
  try {
    const cacheRows = await prisma.prospect.findMany({
      where: { companyNameConfidence: { not: null }, ...(workspaceId ? { workspaceId } : {}) },
      select: { companyName: true, rawCompanyName: true, companyNameConfidence: true, companyNameNeedsReview: true },
      distinct: ["companyName"],
    });
    for (const row of cacheRows) {
      const key = (row.rawCompanyName || row.companyName).toLowerCase().trim();
      aiCache.set(key, {
        isValid: true,
        cleanName: row.companyName,
        confidence: row.companyNameConfidence ?? 0.5,
        needsReview: row.companyNameNeedsReview,
      });
    }
  } catch {
    // Non-critical — proceed without cache
  }

  // Collect entries that need AI validation (skip cached + high-review + high-confidence)
  const needsAIValidation: typeof afterLocalFilter = [];
  for (const entry of afterLocalFilter) {
    if (entry.local.confidence >= 0.85 && !entry.local.needsReview) continue; // Already confident
    // Check cache
    const cacheKey = entry.result.companyName.toLowerCase().trim();
    const cached = aiCache.get(cacheKey);
    if (cached) {
      entry.local = { ...entry.local, ...cached, reason: "Validé (cache)" };
      continue;
    }
    needsAIValidation.push(entry);
  }

  // Batch AI validation only for entries that truly need it
  let aiTokensSaved = afterLocalFilter.length - needsAIValidation.length;
  if (needsAIValidation.length > 0) {
    try {
      const aiInputs = needsAIValidation.map(({ result }) => ({
        rawName: result.companyName,
        website: result.website,
        city: result.city,
        industry: result.industry,
      }));
      const aiResults = await validateCompanyNames(aiInputs);

      // Merge AI results back into the local results
      for (let i = 0; i < needsAIValidation.length; i++) {
        if (aiResults[i]) {
          needsAIValidation[i].local = aiResults[i];
        }
      }
    } catch (error) {
      console.error("[discovery] AI company name validation failed, using local results:", error);
    }
  }
  console.log(`[discovery] AI validation: ${needsAIValidation.length} called, ${aiTokensSaved} skipped (cache/reviews/confidence)`);

  let newCount = 0;
  let processedCount = 0; // total processed (new + existing) — used to enforce target limit

  for (const { result, local } of afterLocalFilter) {
    if (processedCount >= maxNew || isCancelRequested()) break;

    // Skip entries marked invalid by AI
    if (!local.isValid && !local.needsReview) continue;

    const finalName = local.cleanName || result.companyName;

    try {
      const score = calculateLeadScore(result);

      await prisma.prospect.create({
        data: {
          companyName: finalName,
          rawCompanyName: result.companyName !== finalName ? result.companyName : null,
          companyNameConfidence: local.confidence,
          companyNameNeedsReview: local.needsReview,
          website: result.website,
          address: result.address,
          phone: result.phone,
          googleMapsUrl: result.googleMapsUrl,
          city: result.city,
          industry: result.industry,
          source: result.source,
          leadScore: score,
          importBatchId: batchId,
          workspaceId: workspaceId ?? null,
          reviewCount: result.reviewCount ?? null,
        },
      });
      newCount++;
      processedCount++;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Prospect already exists — update its batchId so it gets added to campaign
        if (batchId) {
          try {
            await prisma.prospect.updateMany({
              where: { companyName: finalName, city: result.city },
              data: { importBatchId: batchId },
            });
          } catch {
            // Non-critical
          }
        }
        processedCount++;
        continue;
      }
      throw error;
    }
  }

  const skippedExisting = unique.length - afterExisting.length;
  if (skippedExisting > 0) {
    console.log(`[discovery] Skipped ${skippedExisting} already-existing prospects (saved API tokens)`);
  }

  return {
    found: unique.length,
    new: newCount,
    skippedExisting,
    diagnostics: {
      queriesAttempted: queries.length,
      queriesWithResults,
      queriesFailed: errors.length,
      errors,
    },
  };
}

export async function discoverAllCities(
  cities: string[],
  maxNew = Number.POSITIVE_INFINITY,
  workspaceId?: string | null
): Promise<{
  total: number;
  new: number;
  diagnostics: DiscoveryDiagnostics;
}> {
  let total = 0;
  let totalNew = 0;
  let queriesAttempted = 0;
  let queriesWithResults = 0;
  let queriesFailed = 0;
  const errors: string[] = [];

  for (const city of cities) {
    if (totalNew >= maxNew) break;

    const result = await discoverProspects(city, undefined, maxNew - totalNew, undefined, workspaceId);
    total += result.found;
    totalNew += result.new;
    queriesAttempted += result.diagnostics.queriesAttempted;
    queriesWithResults += result.diagnostics.queriesWithResults;
    queriesFailed += result.diagnostics.queriesFailed;
    errors.push(...result.diagnostics.errors);
  }

  return {
    total,
    new: totalNew,
    diagnostics: {
      queriesAttempted,
      queriesWithResults,
      queriesFailed,
      errors,
    },
  };
}
