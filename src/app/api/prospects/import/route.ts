import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateLeadScore } from "@/lib/lead-scoring";
import { logActivity, generateBatchId } from "@/lib/activity";
import { getWorkspaceContext } from "@/lib/workspace";

const PARSE_PROMPT = `Tu es un assistant spécialisé dans l'extraction de données de prospects/clients à partir de texte brut.

L'utilisateur va te fournir du texte copié-collé (CSV, tableau, liste, texte libre, etc.).
Tu dois extraire chaque prospect et retourner un tableau JSON.

Champs à extraire pour chaque prospect (utilise null si non trouvé):
- companyName: string (OBLIGATOIRE - nom de l'entreprise)
- industry: string | null (secteur d'activité)
- city: string | null (ville)
- address: string | null (adresse complète)
- phone: string | null (numéro de téléphone)
- email: string | null (adresse email)
- website: string | null (site web, ajoute https:// si manquant)
- contactType: "prospect" | "client" | "nouveau_client" (déduis du contexte, par défaut "prospect")
- notes: string | null (informations supplémentaires qui ne rentrent pas dans les autres champs)

Règles:
- Extrais TOUS les prospects trouvés dans le texte
- Si une ligne contient plusieurs entreprises, sépare-les
- Normalise les numéros de téléphone au format (XXX) XXX-XXXX si possible
- Si le texte semble être un CSV, détecte automatiquement le séparateur et les colonnes
- Si c'est du texte libre, utilise ton jugement pour identifier chaque prospect
- Ne devine PAS d'informations non présentes dans le texte
- Retourne UNIQUEMENT le tableau JSON, sans markdown, sans explication

Réponds avec un tableau JSON valide uniquement.`;

const URL_RE = /^https?:\/\/|^www\./i;
const GOOGLE_MAPS_RE = /google\.\w+\/maps|maps\.google|goo\.gl\/maps/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d()\s.+\-]{7,20}$/;

function cleanProspectData(p: Record<string, string | null>) {
  const textFields = ["phone", "address", "notes", "industry", "city"] as const;
  for (const field of textFields) {
    const val = p[field];
    if (!val) continue;

    if ((URL_RE.test(val) || GOOGLE_MAPS_RE.test(val)) && !p.website) {
      p.website = val.startsWith("www.") ? "https://" + val : val;
      p[field] = null;
      continue;
    }
    if (EMAIL_RE.test(val) && !p.email) {
      p.email = val;
      p[field] = null;
      continue;
    }
    if (field === "phone" && (URL_RE.test(val) || GOOGLE_MAPS_RE.test(val))) {
      if (!p.website) p.website = val.startsWith("www.") ? "https://" + val : val;
      p.phone = null;
      continue;
    }
  }

  if (p.website && !/^https?:\/\//i.test(p.website)) {
    p.website = "https://" + p.website;
  }

  // Validate website is a real domain
  if (p.website) {
    try {
      const hostname = new URL(p.website).hostname.replace(/^www\./, "");
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(hostname)) {
        p.website = null;
      }
    } catch {
      p.website = null;
    }
  }

  if (p.phone && !PHONE_RE.test(p.phone.replace(/\s/g, ""))) {
    if (URL_RE.test(p.phone) && !p.website) {
      p.website = p.phone.startsWith("www.") ? "https://" + p.phone : p.phone;
    }
    p.phone = null;
  }

  return p;
}

async function checkDuplicate(
  raw: Record<string, string | null>,
  dedupMode: string
): Promise<boolean> {
  switch (dedupMode) {
    case "gmaps_url":
      if (raw.googleMapsUrl) {
        const existing = await prisma.prospect.findFirst({
          where: { googleMapsUrl: raw.googleMapsUrl },
          select: { id: true },
        });
        if (existing) return true;
      }
      // Fallback to companyName + city
      if (raw.companyName && raw.city) {
        const existing = await prisma.prospect.findFirst({
          where: { companyName: raw.companyName, city: raw.city },
          select: { id: true },
        });
        return !!existing;
      }
      return false;

    case "website":
      if (raw.website) {
        const existing = await prisma.prospect.findFirst({
          where: { website: raw.website },
          select: { id: true },
        });
        return !!existing;
      }
      return false;

    case "phone":
      if (raw.phone) {
        const digits = raw.phone.replace(/\D/g, "").slice(-10);
        if (digits.length >= 10) {
          const existing = await prisma.prospect.findFirst({
            where: { phone: { contains: digits } },
            select: { id: true },
          });
          return !!existing;
        }
      }
      return false;

    case "companyName_city":
      if (raw.companyName) {
        const existing = await prisma.prospect.findFirst({
          where: {
            companyName: raw.companyName,
            ...(raw.city ? { city: raw.city } : {}),
          },
          select: { id: true },
        });
        return !!existing;
      }
      return false;

    default:
      return false;
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getWorkspaceContext();
  const workspaceId = ctx?.workspaceId ?? null;

  const body = await request.json();

  // Step 1: Parse raw text with AI
  if (body._action === "parse") {
    const { rawText } = body;
    if (!rawText?.trim()) {
      return NextResponse.json({ error: "Texte vide" }, { status: 400 });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Clé API Gemini non configurée (GEMINI_API_KEY)" },
          { status: 500 }
        );
      }

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: PARSE_PROMPT }] },
            contents: [{ parts: [{ text: rawText }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error("Gemini API error:", geminiRes.status, errBody);
        if (geminiRes.status === 403) {
          return NextResponse.json({ error: "Clé API Gemini invalide" }, { status: 500 });
        }
        if (geminiRes.status === 429) {
          return NextResponse.json({ error: "Limite de requêtes Gemini atteinte, réessayez plus tard" }, { status: 429 });
        }
        return NextResponse.json({ error: "Erreur API Gemini" }, { status: 500 });
      }

      const geminiData = await geminiRes.json();
      const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Extract JSON array from response
      let prospects;
      try {
        prospects = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          prospects = JSON.parse(match[0]);
        } else {
          return NextResponse.json(
            { error: "L'IA n'a pas pu extraire de prospects du texte fourni" },
            { status: 422 }
          );
        }
      }

      if (!Array.isArray(prospects) || prospects.length === 0) {
        return NextResponse.json(
          { error: "Aucun prospect trouvé dans le texte" },
          { status: 422 }
        );
      }

      return NextResponse.json({ prospects });
    } catch (error) {
      console.error("Import parse error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Erreur lors de l'analyse" },
        { status: 500 }
      );
    }
  }

  // Step 2: Save parsed prospects to DB
  if (body._action === "save") {
    const { prospects, importSource, importFileName, dedupMode } = body;
    if (!Array.isArray(prospects) || prospects.length === 0) {
      return NextResponse.json({ error: "Aucun prospect à importer" }, { status: 400 });
    }

    const batchId = generateBatchId();
    let created = 0;
    let skipped = 0;
    let blocked = 0;
    const errors: string[] = [];

    // Load blocked keywords
    let blockedKeywords: string[] = [];
    try {
      const settingsRow = await prisma.appSettings.findFirst({
        where: workspaceId ? { workspaceId } : { workspaceId: null },
        select: { data: true },
      });
      if (settingsRow?.data && typeof settingsRow.data === "object") {
        const d = settingsRow.data as Record<string, unknown>;
        const t = d.targeting as Record<string, unknown> | undefined;
        if (t?.blockedKeywords && Array.isArray(t.blockedKeywords)) {
          blockedKeywords = (t.blockedKeywords as string[]).map((k) => k.toLowerCase().trim()).filter(Boolean);
        }
      }
    } catch { /* ignore */ }

    for (const p of prospects) {
      if (!p.companyName) {
        skipped++;
        continue;
      }

      try {
        // Clean misplaced data (URLs in phone, etc.)
        const raw = {
          companyName: p.companyName as string,
          industry: (p.industry as string) || null,
          city: (p.city as string) || null,
          address: (p.address as string) || null,
          phone: (p.phone as string) || null,
          email: (p.email as string) || null,
          website: (p.website as string) || null,
          notes: (p.notes as string) || null,
          googleMapsUrl: (p.googleMapsUrl as string) || null,
        };
        cleanProspectData(raw);

        // Deduplication check
        if (dedupMode && dedupMode !== "none") {
          const isDup = await checkDuplicate(raw, dedupMode);
          if (isDup) {
            skipped++;
            continue;
          }
        }

        // Blocked keywords check
        if (blockedKeywords.length > 0) {
          const textToCheck = [raw.companyName, raw.industry, raw.website, raw.address].filter(Boolean).join(" ").toLowerCase();
          if (blockedKeywords.some((bk) => textToCheck.includes(bk))) {
            blocked++;
            skipped++;
            continue;
          }
        }

        const data = {
          companyName: raw.companyName,
          industry: raw.industry,
          city: raw.city,
          address: raw.address,
          phone: raw.phone,
          email: raw.email,
          website: raw.website,
          notes: raw.notes,
          googleMapsUrl: raw.googleMapsUrl,
          contactType: p.contactType || "prospect",
          source: importSource || "import",
          status: raw.email ? "ENRICHED" as const : "NEW" as const,
          importBatchId: batchId,
        };

        const score = calculateLeadScore(data);

        await prisma.prospect.create({
          data: { ...data, leadScore: score, workspaceId },
        });
        created++;
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          skipped++;
        } else {
          errors.push(`${p.companyName}: ${error instanceof Error ? error.message : "Erreur"}`);
          skipped++;
        }
      }
    }

    // Log activity
    await logActivity({
      action: importFileName ? "import_csv" : "import_text",
      type: errors.length > 0 ? "warning" : "success",
      title: `Import ${importFileName ? "CSV" : "texte"} complété`,
      details: `${created} nouveau${created > 1 ? "x" : ""} prospect${created > 1 ? "s" : ""} importé${created > 1 ? "s" : ""}, ${skipped} ignoré${skipped > 1 ? "s" : ""}${blocked > 0 ? `, ${blocked} bloqué${blocked > 1 ? "s" : ""}` : ""}`,
      importBatchId: created > 0 ? batchId : undefined,
      metadata: {
        prospects_created: created,
        duplicates_found: skipped,
        errors_count: errors.length,
        total_rows: prospects.length,
        source: importSource || "import",
        import_file_name: importFileName || undefined,
      },
    });

    return NextResponse.json({ created, skipped, errors, batchId });
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
