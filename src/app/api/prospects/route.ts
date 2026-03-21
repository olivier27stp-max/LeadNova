import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateLeadScore } from "@/lib/lead-scoring";
import { DAILY_DISCOVERY_LIMIT } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/session";
import { getActiveWorkspaceId } from "@/lib/workspace";

async function getWorkspaceId() {
  const user = await getSessionUser();
  if (!user) return null;
  return getActiveWorkspaceId(user.id);
}

function getStartOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const city = searchParams.get("city");
    const source = searchParams.get("source");
    const contactType = searchParams.get("contactType");
    const emailStatus = searchParams.get("emailStatus");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 5000);
    const sortBy = searchParams.get("sortBy") || "leadScore";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Build where clause (exclude archived, scope to workspace)
    const workspaceId = await getWorkspaceId();
    const where: Record<string, unknown> = { archivedAt: null };
    if (workspaceId) where.workspaceId = workspaceId;
    if (status) where.status = status;
    if (city) where.city = { equals: city, mode: "insensitive" };
    if (source) where.source = source;
    if (contactType) where.contactType = contactType;
    if (emailStatus === "unknown") where.OR = [{ emailStatus: "unknown" }, { emailStatus: null }];
    else if (emailStatus) where.emailStatus = emailStatus;

    // Text search across multiple fields
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    // Build orderBy
    const validSortFields = ["leadScore", "companyName", "createdAt", "status", "city"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "leadScore";
    const orderBy = { [orderByField]: sortOrder };

    // Sequential queries (connection_limit=1 on local Prisma Postgres)
    const total = await prisma.prospect.count({ where });
    const scrapedToday = await prisma.prospect.count({
      where: {
        archivedAt: null,
        source: {
          in: ["google_search", "duckduckgo_search"],
        },
        dateDiscovered: {
          gte: getStartOfToday(),
        },
      },
    });
    const enrichedToday = await prisma.prospect.count({
      where: {
        archivedAt: null,
        enrichedAt: {
          gte: getStartOfToday(),
        },
      },
    });
    const prospects = await prisma.prospect.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        companyName: true,
        city: true,
        email: true,
        phone: true,
        website: true,
        status: true,
        leadScore: true,
        source: true,
        contactType: true,
        industry: true,
        emailGuessed: true,
        emailStatus: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      prospects,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      scrapedToday,
      enrichedToday,
      dailyDiscoveryLimit: DAILY_DISCOVERY_LIMIT,
    });
  } catch (error) {
    console.error("Prospects fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch prospects", prospects: [], total: 0, page: 1, totalPages: 1 },
      { status: 500 }
    );
  }
}

// GET a single prospect with full details (for modal)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Normalize city names
    if (body._action === "fixCities") {
      const CITY_FIX: Record<string, string> = {
        "Montreal": "Montréal", "montreal": "Montréal",
        "Quebec": "Québec", "quebec": "Québec", "Quebec City": "Québec",
        "Trois-Rivieres": "Trois-Rivières", "Trois Rivieres": "Trois-Rivières",
        "Trois Rivières": "Trois-Rivières",
        "Levis": "Lévis", "levis": "Lévis",
        "Saint-Jerome": "Saint-Jérôme", "Saint Jerome": "Saint-Jérôme",
        "Riviere-du-Loup": "Rivière-du-Loup",
        "Sept-Iles": "Sept-Îles",
        "Sainte-Therese": "Sainte-Thérèse",
        "Chateauguay": "Châteauguay",
        "Cote-Saint-Luc": "Côte-Saint-Luc",
        "Rosemere": "Rosemère",
        "Prevost": "Prévost",
        // MRC → ville principale
        "Desjardins": "Lévis",
        "desjardins": "Lévis",
        "Les Chutes-De-La-Chaudière-Est": "Lévis",
        "Les Chutes-De-La-Chaudière-Ouest": "Lévis",
        "La Nouvelle-Beauce": "Sainte-Marie",
        "La Côte-de-Beaupré": "Beaupré",
        "La Jacques-Cartier": "Shannon",
        "Portneuf": "Donnacona",
        "L'Île-d'Orléans": "Saint-Pierre",
        "Bellechasse": "Saint-Raphaël",
        "Montmorency": "Beauport",
      };
      let fixed = 0;
      for (const [from, to] of Object.entries(CITY_FIX)) {
        const result = await prisma.prospect.updateMany({
          where: { city: from },
          data: { city: to },
        });
        fixed += result.count;
      }
      return NextResponse.json({ fixed });
    }

    // Deduplicate prospects by email (case-insensitive)
    if (body._action === "deduplicate") {
      const all = await prisma.prospect.findMany({
        where: { archivedAt: null },
        select: { id: true, companyName: true, email: true, city: true, phone: true, website: true, leadScore: true, status: true, createdAt: true },
        orderBy: { leadScore: "desc" },
      });

      const seen = new Map<string, string>();
      const toDelete: string[] = [];

      for (const p of all) {
        if (!p.email) continue;
        const key = p.email.toLowerCase().trim();
        if (seen.has(key)) {
          toDelete.push(p.id);
        } else {
          seen.set(key, p.id);
        }
      }

      // Collect info of prospects to delete before removing them
      const deletedProspects = all
        .filter((p) => toDelete.includes(p.id))
        .map((p) => ({
          companyName: p.companyName,
          email: p.email,
          city: p.city,
          phone: p.phone,
          website: p.website,
          leadScore: p.leadScore,
          status: p.status,
        }));

      if (toDelete.length > 0) {
        await prisma.campaignContact.deleteMany({ where: { prospectId: { in: toDelete } } });
        await prisma.prospect.updateMany({
          where: { id: { in: toDelete } },
          data: { archivedAt: new Date() },
        });
      }

      if (toDelete.length > 0) {
        await logActivity({
          action: "prospect_deduplicated",
          type: "success",
          title: "Doublons supprimés",
          details: `${toDelete.length} prospects en double supprimés`,
          metadata: { deleted: toDelete.length, deletedProspects },
        });
      }

      return NextResponse.json({ deleted: toDelete.length });
    }

    // Clean up invalid emails/websites (punycode garbage from Google Maps)
    if (body._action === "cleanupBadEmails") {
      const VALID_DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
      const INVALID_WEBSITES = ["https://·", "https://Ouvert", "https://Fermé", "https://Ferme"];

      // Fix invalid websites
      const withBadWebsite = await prisma.prospect.findMany({
        where: { website: { in: INVALID_WEBSITES } },
        select: { id: true },
      });
      for (const p of withBadWebsite) {
        await prisma.prospect.update({
          where: { id: p.id },
          data: { website: null },
        });
      }

      // Fix invalid guessed emails
      const allWithEmail = await prisma.prospect.findMany({
        where: { emailGuessed: true, email: { not: null } },
        select: { id: true, email: true },
      });
      let cleaned = 0;
      for (const p of allWithEmail) {
        if (!p.email) continue;
        const domain = p.email.split("@")[1];
        if (!domain || !VALID_DOMAIN_RE.test(domain)) {
          await prisma.prospect.update({
            where: { id: p.id },
            data: { email: null, secondaryEmail: null, emailGuessed: false, status: "NEW" },
          });
          cleaned++;
        }
      }

      return NextResponse.json({ cleanedWebsites: withBadWebsite.length, cleanedEmails: cleaned });
    }

    // Detect garbage city values
    if (body._action === "detectGarbageCities") {
      const cities = await prisma.prospect.groupBy({
        by: ["city"],
        _count: { city: true },
        where: { archivedAt: null, city: { not: null } },
        orderBy: { _count: { city: "desc" } },
      });

      // Known valid Quebec cities / regions (lowercase for comparison)
      const KNOWN_VALID = new Set([
        "montréal", "québec", "laval", "longueuil", "gatineau", "sherbrooke",
        "lévis", "trois-rivières", "saguenay", "terrebonne", "saint-jean-sur-richelieu",
        "repentigny", "brossard", "drummondville", "saint-jérôme", "blainville",
        "saint-hyacinthe", "saint-eustache", "boisbriand", "sorel-tracy", "rimouski",
        "victoriaville", "granby", "shawinigan", "dollard-des-ormeaux", "saint-georges",
        "mirabel", "mascouche", "candiac", "bécancour", "nicolet", "joliette",
        "beloeil", "cowansville", "val-d'or", "rouyn-noranda", "amos", "la sarre",
        "baie-comeau", "sept-îles", "magog", "coaticook", "thetford mines",
        "sainte-marie", "beauceville", "saint-raphaël", "donnacona", "beaupré",
        "shannon", "saint-tite", "louiseville", "rawdon", "mont-laurier",
        "lachute", "sainte-adèle", "mont-tremblant", "sainte-thérèse",
        "vaudreuil-dorion", "salaberry-de-valleyfield", "huntingdon",
        "beloeil", "saint-rémi", "la prairie", "marieville", "greenfield park",
        "saint-lambert", "saint-sauveur", "westmount", "saint-hubert",
        "l'ancienne-lorette", "saint-augustin-de-desmaures", "neuville",
        "pont-rouge", "lorraine", "blainville", "sainte-anne-de-sorel",
        "dolbeau-mistassini", "alma", "roberval", "chelsea",
        "papineauville", "coteau-du-lac", "piedmont", "orford", "bromont",
        "saint-colomban", "terrebonne", "mascouche", "repentigny",
        "sainte-agathe-des-monts", "saint-lin–laurentides", "berthierville",
        "la présentation", "racine", "lac-supérieur", "saint-germain-de-grantham",
        "la malbaie", "baie-saint-paul", "carleton-sur-mer", "chandler",
        "gaspé", "sainte-anne-des-monts", "amqui", "mont-joli",
        "trois-pistoles", "rivière-du-loup", "témiscouata-sur-le-lac",
        "saint-pascal", "windsor", "cookshire-eaton", "asbestos", "warwick",
        "ville-marie", "témiscamingue",
      ]);

      const garbage = cities.filter(({ city }) => {
        if (!city) return false;
        const lower = city.toLowerCase().trim();

        // Known valid → not garbage
        if (KNOWN_VALID.has(lower)) return false;

        // Contains digits → likely address or fragment
        if (/\d/.test(city)) return true;

        // More than 4 words → sentence fragment
        if (city.trim().split(/\s+/).length > 4) return true;

        // Contains common non-city indicators
        if (/\b(rue|avenue|boulevard|blvd|ave|qc|inc\.|inc$|ltée|gestion|appartement|louer|heures|minutes|liens|dates?|règles|mission)\b/i.test(city)) return true;

        // Looks like an email or URL
        if (/@|https?:\/\//.test(city)) return true;

        // All lowercase multi-word (usually scraped fragments)
        if (city === city.toLowerCase() && city.includes(" ")) return true;

        return false;
      }).map(({ city, _count }) => ({ city: city!, count: _count.city }));

      return NextResponse.json({ garbage });
    }

    // Clear specified garbage cities (set to null)
    if (body._action === "clearGarbageCities") {
      const citiesToClear: string[] = body.cities || [];
      if (!citiesToClear.length) return NextResponse.json({ cleared: 0 });

      let cleared = 0;
      for (const city of citiesToClear) {
        const r = await prisma.prospect.updateMany({
          where: { city },
          data: { city: null },
        });
        cleared += r.count;
      }
      return NextResponse.json({ cleared });
    }

    // If it's a detail request
    if (body._action === "getDetail") {
      const prospect = await prisma.prospect.findUnique({
        where: { id: body.id },
        include: {
          emailActivities: { orderBy: { sentAt: "desc" }, take: 5 },
        },
      });
      if (!prospect) {
        return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
      }
      return NextResponse.json(prospect);
    }

    // Otherwise, create a new prospect
    const score = calculateLeadScore(body);
    const wsId = await getWorkspaceId();

    const prospect = await prisma.prospect.create({
      data: {
        workspaceId: wsId ?? undefined,
        companyName: body.companyName,
        industry: body.industry,
        city: body.city,
        address: body.address,
        phone: body.phone,
        website: body.website,
        email: body.email,
        source: body.source || "manual",
        leadScore: score,
        notes: body.notes,
      },
    });

    return NextResponse.json(prospect, { status: 201 });
  } catch (error) {
    console.error("Prospect create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create prospect" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing prospect id" }, { status: 400 });
    }

    // Only allow updating known fields
    const allowed: Record<string, unknown> = {};
    const fields = ["companyName", "industry", "city", "address", "phone", "website", "email", "secondaryEmail", "contactPageUrl", "linkedinUrl", "source", "status", "notes", "contactType", "leadScore"];
    for (const f of fields) {
      if (f in data) allowed[f] = data[f];
    }

    const updated = await prisma.prospect.update({
      where: { id },
      data: allowed,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Prospect update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update prospect" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    if (!idsParam) {
      return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
    }

    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    // Soft-delete: archive prospects instead of hard-deleting
    await prisma.campaignContact.deleteMany({ where: { prospectId: { in: ids } } });
    const result = await prisma.prospect.updateMany({
      where: { id: { in: ids } },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("Prospect delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete prospects" },
      { status: 500 }
    );
  }
}
