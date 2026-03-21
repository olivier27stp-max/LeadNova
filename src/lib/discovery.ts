import { prisma } from "./db";
import { SEARCH_QUERIES } from "./config";
import { calculateLeadScore } from "./lead-scoring";
import { Prisma } from "@/generated/prisma/client";
import { isCancelRequested } from "./discovery-progress";

// ─── Blocked keywords loader ────────────────────────────
async function loadBlockedKeywords(workspaceId?: string | null): Promise<string[]> {
  try {
    const where = workspaceId ? { workspaceId } : { workspaceId: null };
    const row = await prisma.appSettings.findFirst({ where, select: { data: true } });
    if (!row?.data || typeof row.data !== "object") return [];
    const data = row.data as Record<string, unknown>;
    const targeting = data.targeting as Record<string, unknown> | undefined;
    if (!targeting?.blockedKeywords || !Array.isArray(targeting.blockedKeywords)) return [];
    return (targeting.blockedKeywords as string[]).map((k) => k.toLowerCase().trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function matchesBlockedKeyword(text: string, blockedKeywords: string[]): boolean {
  if (blockedKeywords.length === 0) return false;
  const lower = text.toLowerCase();
  return blockedKeywords.some((bk) => lower.includes(bk));
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
  diagnostics: DiscoveryDiagnostics;
}

// ─── Google Places API (New) ────────────

interface PlacesResult {
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
}

async function searchPlaces(query: string, city: string): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "fr",
      maxResultCount: 20,
    }),
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
  const queries = SEARCH_QUERIES.map((q) => q.replace("{city}", city));
  const blockedKeywords = await loadBlockedKeywords(workspaceId);

  const allResults: SearchResult[] = [];
  const errors: string[] = [];
  let queriesWithResults = 0;

  for (const query of queries) {
    if (isCancelRequested()) break;
    try {
      const results = await searchPlaces(query, city);
      if (results.length > 0) {
        queriesWithResults++;
      }
      allResults.push(
        ...results.map((r) => ({
          ...r,
          city: normalizedCity,
          industry: industry || r.industry,
        }))
      );
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

  // Filter out prospects matching blocked keywords
  const filtered = blockedKeywords.length > 0
    ? unique.filter((r) => {
        const textToCheck = [r.companyName, r.industry, r.website, r.address].filter(Boolean).join(" ");
        return !matchesBlockedKeyword(textToCheck, blockedKeywords);
      })
    : unique;

  let newCount = 0;

  for (const result of filtered) {
    if (newCount >= maxNew || isCancelRequested()) break;

    try {
      const score = calculateLeadScore(result);

      await prisma.prospect.create({
        data: {
          companyName: result.companyName,
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
        },
      });
      newCount++;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return {
    found: unique.length,
    new: newCount,
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
