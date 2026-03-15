import Papa from "papaparse";
import { prisma } from "./db";

// ─── Column mapping (Instant Data Scraper exports various column names) ────
const COLUMN_MAP: Record<string, string[]> = {
  companyName: ["name", "business name", "nom", "titre", "title", "company", "entreprise", "business"],
  industry: ["category", "type", "catégorie", "categorie", "industry"],
  phone: ["phone", "telephone", "téléphone", "tel", "phone number"],
  address: ["address", "adresse", "full address", "location"],
  website: ["website", "site web", "site", "url", "web"],
  googleMapsUrl: ["google maps url", "maps url", "link", "lien", "google maps", "href", "maps link"],
  city: ["city", "ville"],
  province: ["province", "state", "état", "region"],
  rating: ["rating", "note", "évaluation"],
  reviewCount: ["reviews", "reviews count", "avis", "nombre avis", "review count"],
};

function matchColumn(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.some((alias) => h === alias || h.includes(alias))) {
      return field;
    }
  }
  return null;
}

// ─── Types ────
export interface CsvRow {
  companyName: string;
  industry?: string;
  phone?: string;
  address?: string;
  website?: string;
  googleMapsUrl?: string;
  city?: string;
  province?: string;
  rating?: string;
  reviewCount?: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
  total: number;
}

// ─── Normalize phone to digits only ────
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  // Remove leading 1 for North American numbers
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.substring(1);
  }
  return digits.length >= 10 ? raw.trim() : null;
}

// ─── Normalize website URL ────
function normalizeWebsite(raw: string): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (!url) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

// ─── Parse CSV and map columns ────
export function parseCsv(csvText: string): { rows: CsvRow[]; errors: string[] } {
  const errors: string[] = [];

  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0) {
    for (const err of result.errors.slice(0, 5)) {
      errors.push(`Ligne ${err.row}: ${err.message}`);
    }
  }

  const rawRows = result.data as Record<string, string>[];
  if (rawRows.length === 0) {
    errors.push("Aucune donnée trouvée dans le CSV");
    return { rows: [], errors };
  }

  // Build column mapping from headers
  const headers = Object.keys(rawRows[0]);
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const field = matchColumn(header);
    if (field) {
      mapping[header] = field;
    }
  }

  if (!mapping || !Object.values(mapping).includes("companyName")) {
    // Try to use the first column as company name
    const firstHeader = headers[0];
    if (firstHeader) {
      mapping[firstHeader] = "companyName";
      errors.push(`Colonne "${firstHeader}" utilisée comme nom d'entreprise (aucune colonne 'name' trouvée)`);
    } else {
      errors.push("Impossible de trouver une colonne pour le nom d'entreprise");
      return { rows: [], errors };
    }
  }

  const rows: CsvRow[] = [];
  for (const raw of rawRows) {
    const row: Record<string, string> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (raw[header]) {
        row[field] = raw[header].trim();
      }
    }

    if (!row.companyName) continue;

    rows.push({
      companyName: row.companyName,
      industry: row.industry || undefined,
      phone: row.phone || undefined,
      address: row.address || undefined,
      website: row.website || undefined,
      googleMapsUrl: row.googleMapsUrl || undefined,
      city: row.city || undefined,
      province: row.province || undefined,
      rating: row.rating || undefined,
      reviewCount: row.reviewCount || undefined,
    });
  }

  return { rows, errors };
}

// ─── Deduplicate against existing DB ────
type DedupMode = "gmaps_url" | "website" | "phone" | "companyName_city";

async function findExistingProspect(
  row: CsvRow,
  dedupMode: DedupMode
): Promise<boolean> {
  switch (dedupMode) {
    case "gmaps_url":
      if (row.googleMapsUrl) {
        const existing = await prisma.prospect.findFirst({
          where: { googleMapsUrl: row.googleMapsUrl },
          select: { id: true },
        });
        return !!existing;
      }
      // Fallback to companyName + city
      if (row.companyName && row.city) {
        const existing = await prisma.prospect.findFirst({
          where: { companyName: row.companyName, city: row.city },
          select: { id: true },
        });
        return !!existing;
      }
      return false;

    case "website":
      if (row.website) {
        const normalized = normalizeWebsite(row.website);
        if (normalized) {
          const existing = await prisma.prospect.findFirst({
            where: { website: normalized },
            select: { id: true },
          });
          return !!existing;
        }
      }
      return false;

    case "phone":
      if (row.phone) {
        const normalized = normalizePhone(row.phone);
        if (normalized) {
          const digits = normalized.replace(/\D/g, "");
          const existing = await prisma.prospect.findFirst({
            where: { phone: { contains: digits.slice(-10) } },
            select: { id: true },
          });
          return !!existing;
        }
      }
      return false;

    case "companyName_city":
      if (row.companyName) {
        const existing = await prisma.prospect.findFirst({
          where: {
            companyName: row.companyName,
            ...(row.city ? { city: row.city } : {}),
          },
          select: { id: true },
        });
        return !!existing;
      }
      return false;
  }
}

// ─── Import CSV rows into prospects ────
export async function importCsvRows(
  rows: CsvRow[],
  options: {
    dedupMode: DedupMode;
    source: string;
    defaultCity?: string;
    defaultProvince?: string;
  }
): Promise<ImportResult> {
  let imported = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      // Apply default city/province if not in CSV
      if (!row.city && options.defaultCity) {
        row.city = options.defaultCity;
      }

      // Check for duplicates
      const isDuplicate = await findExistingProspect(row, options.dedupMode);
      if (isDuplicate) {
        duplicates++;
        continue;
      }

      // Build notes from rating/reviews
      const notes: string[] = [];
      if (row.rating) notes.push(`Note: ${row.rating}`);
      if (row.reviewCount) notes.push(`Avis: ${row.reviewCount}`);

      // Create prospect
      await prisma.prospect.create({
        data: {
          companyName: row.companyName,
          industry: row.industry || null,
          phone: normalizePhone(row.phone || "") || null,
          address: row.address || null,
          website: normalizeWebsite(row.website || "") || null,
          googleMapsUrl: row.googleMapsUrl || null,
          city: row.city || null,
          email: null,
          source: options.source,
          status: "NEW",
          leadScore: 0,
          notes: notes.length > 0 ? notes.join(" | ") : null,
        },
      });
      imported++;
    } catch (err) {
      // P2002 = unique constraint violation
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
        duplicates++;
      } else {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        if (errors.length < 10) {
          errors.push(`${row.companyName}: ${msg}`);
        }
      }
    }
  }

  return { imported, duplicates, errors, total: rows.length };
}
