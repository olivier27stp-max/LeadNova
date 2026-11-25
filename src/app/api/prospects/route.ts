import { NextRequest, NextResponse } from "next/server";
import { splitCommaList, websiteKey } from "@/lib/discovery";
import { prisma } from "@/lib/db";
import { calculateLeadScore } from "@/lib/lead-scoring";
import { DAILY_DISCOVERY_LIMIT } from "@/lib/config";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/session";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { industryValuesForGroup } from "@/lib/industry-groups";
import { conversionChance } from "@/lib/conversion-score";
import { engagementScore } from "@/lib/engagement-score";

// Allow long-running cleanup operations (up to 5 minutes)
export const maxDuration = 300;

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
    const campaignId = searchParams.get("campaignId");
    const formStatus = searchParams.get("formStatus"); // HAS_FORM | NO_FORM | NO_WEBSITE | UNREACHABLE | NO_FORM_ANY | unknown
    const competitorCrm = searchParams.get("competitorCrm"); // "any" ou nom du CRM
    const coldCall = searchParams.get("coldCall") === "1"; // téléphone sans courriel réel
    const industryGroup = searchParams.get("industryGroup"); // clé de src/lib/industry-groups.ts
    const reach = searchParams.get("reach"); // email_real | email_guessed | no_email
    const minScore = parseInt(searchParams.get("minScore") || "", 10);
    const reviews = searchParams.get("reviews"); // ideal (20–300) | small (<20) | large (>300)
    const owner = searchParams.get("owner"); // found | not_found | pending
    const callback = searchParams.get("callback"); // due = rappel prévu aujourd'hui ou en retard
    const age = searchParams.get("age"); // lt3 | gte3 | lt5 | gte5 | gte10 | unknown | pending (âge de l'entreprise)
    const yearFrom = parseInt(searchParams.get("yearFrom") || "", 10); // immatriculée en ou après
    const yearTo = parseInt(searchParams.get("yearTo") || "", 10); // immatriculée en ou avant
    const sureOnly = searchParams.get("ageSure") === "1"; // exclut l'indice « nom de domaine »
    const tag = searchParams.get("tag"); // identifiant d'un tag (Paramètres → Prospects → Tags)
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 5000);
    const sortBy = searchParams.get("sortBy") || "leadScore";
    const sortOrder: "asc" | "desc" = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Build where clause (exclude archived, scope to workspace)
    const workspaceId = await getWorkspaceId();
    const where: Record<string, unknown> = { archivedAt: null };
    if (workspaceId) where.workspaceId = workspaceId;
    if (status) where.status = status;
    if (tag) where.tags = { has: tag };
    if (city) where.city = { equals: city, mode: "insensitive" };
    if (source) where.source = source;
    if (contactType) where.contactType = contactType;
    if (emailStatus === "unknown") where.OR = [{ emailStatus: "unknown" }, { emailStatus: null }];
    else if (emailStatus) where.emailStatus = emailStatus;
    if (formStatus === "unknown") where.contactFormStatus = null;
    else if (formStatus === "NO_FORM_ANY") where.contactFormStatus = { in: ["NO_FORM", "NO_WEBSITE"] };
    else if (formStatus) where.contactFormStatus = formStatus;
    if (competitorCrm === "any") where.competitorCrm = { not: null };
    else if (competitorCrm === "none") where.competitorCrm = null;
    else if (competitorCrm) where.competitorCrm = competitorCrm;
    if (!isNaN(minScore) && minScore > 0) where.leadScore = { gte: minScore };
    if (owner === "found") where.ownerName = { not: null };
    else if (owner === "not_found") { where.ownerName = null; where.ownerCheckedAt = { not: null }; }
    else if (owner === "pending") where.ownerCheckedAt = null;
    // Âge de l'entreprise : âge = année courante − année d'immatriculation
    const nowYear = new Date().getFullYear();
    const yearRange: Record<string, number> = {};
    const maxAge = { lt3: 3, lt5: 5 }[age ?? ""];
    const minAge = { gte3: 3, gte5: 5, gte10: 10 }[age ?? ""];
    if (maxAge) yearRange.gt = nowYear - maxAge;
    if (minAge) yearRange.lte = nowYear - minAge;
    if (!isNaN(yearFrom)) yearRange.gte = yearFrom;
    if (!isNaN(yearTo)) yearRange.lte = Math.min(yearRange.lte ?? yearTo, yearTo);
    if (Object.keys(yearRange).length) where.registrationYear = yearRange;
    if (sureOnly && (maxAge || minAge || !isNaN(yearFrom) || !isNaN(yearTo))) where.registrationSource = { not: "domaine" };
    if (age === "unknown") { where.registrationYear = null; where.registrationCheckedAt = { not: null }; }
    else if (age === "pending") where.registrationCheckedAt = null;
    if (callback === "due") {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      where.callbackAt = { lte: endOfToday };
    }
    if (reviews === "ideal") where.reviewCount = { gte: 20, lte: 300 };
    else if (reviews === "large") where.reviewCount = { gt: 300 };
    // Conditions combinées en AND (pour ne pas écraser les OR de la recherche)
    const extraConditions: Record<string, unknown>[] = [];
    if (reviews === "small") extraConditions.push({ OR: [{ reviewCount: null }, { reviewCount: { lt: 20 } }] });
    if (reach === "email_real") extraConditions.push({ email: { not: null } }, { NOT: { email: "" } }, { emailGuessed: false });
    else if (reach === "email_guessed") extraConditions.push({ email: { not: null } }, { emailGuessed: true });
    else if (reach === "no_email") extraConditions.push({ OR: [{ email: null }, { email: "" }] });
    if (industryGroup) {
      // Le regroupement se fait en JS sur les valeurs distinctes, puis filtre exact en base
      const distinct = await prisma.prospect.groupBy({
        by: ["industry"],
        where: workspaceId ? { archivedAt: null, workspaceId } : { archivedAt: null },
      });
      const { values, includeNull } = industryValuesForGroup(distinct.map((d) => d.industry), industryGroup);
      const industryOr: Record<string, unknown>[] = [{ industry: { in: values } }];
      if (includeNull) industryOr.push({ industry: null });
      extraConditions.push({ OR: industryOr });
    }
    // Liste d'appels : on a un téléphone mais pas de courriel fiable (absent ou deviné)
    const coldCallCondition = coldCall
      ? { AND: [{ phone: { not: null } }, { NOT: { phone: "" } }, { OR: [{ email: null }, { emailGuessed: true }] }] }
      : null;
    if (campaignId === "none") {
      where.campaignContacts = { none: {} };
    } else if (campaignId) {
      where.campaignContacts = { some: { campaignId } };
    }

    // Text search across multiple fields — use AND to avoid overwriting emailStatus OR
    if (search) {
      // Normalize phone: extract digits for format-tolerant matching
      const searchDigits = search.replace(/\D/g, "");
      const searchConditions: Record<string, unknown>[] = [
        { companyName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
      // If search looks like a phone number (3+ digits), also search normalized
      if (searchDigits.length >= 3 && searchDigits !== search) {
        searchConditions.push({ phone: { contains: searchDigits, mode: "insensitive" } });
      }
      if (where.OR) {
        // emailStatus OR already set — wrap both in AND
        const emailStatusOr = where.OR;
        delete where.OR;
        where.AND = [{ OR: emailStatusOr as Record<string, unknown>[] }, { OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    if (coldCallCondition) {
      where.AND = [...((where.AND as Record<string, unknown>[] | undefined) || []), coldCallCondition];
    }
    if (extraConditions.length > 0) {
      where.AND = [...((where.AND as Record<string, unknown>[] | undefined) || []), ...extraConditions];
    }

    // Build orderBy
    const validSortFields = ["leadScore", "companyName", "createdAt", "status", "city", "registrationYear"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "leadScore";
    // Années inconnues toujours en bas
    const orderBy = orderByField === "registrationYear"
      ? { registrationYear: { sort: sortOrder, nulls: "last" as const } }
      : { [orderByField]: sortOrder };

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
        // enrichedAt marque aussi une tentative sans résultat (statut resté NEW)
        status: { not: "NEW" },
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
        reviewCount: true,
        companyNameNeedsReview: true,
        contactFormStatus: true,
        contactFormProvider: true,
        ownerName: true,
        ownerRole: true,
        ownerConfidence: true,
        ownerCheckedAt: true,
        siteAnalyzedAt: true,
        registrationYear: true,
        tags: true,
        registrationDate: true,
        registrationSource: true,
        registrationEvidence: true,
        registrationUrl: true,
        registrationConfidence: true,
        registrationCheckedAt: true,
        hiring: true,
        complaintCount: true,
        ownerRepliesReviews: true,
        reviewsLast6m: true,
        onlineBooking: true,
        onlinePayment: true,
        teamsCount: true,
        serviceSegment: true,
        emailOpenCount: true,
        emailClickCount: true,
        siteVisitCount: true,
        lastReplySentiment: true,
        lastEngagedAt: true,
        lastCallAt: true,
        lastCallOutcome: true,
        lastCallWho: true,
        lastObjection: true,
        currentTool: true,
        employeeCount: true,
        callbackAt: true,
        salesStage: true,
        lostReason: true,
        competitorCrm: true,
        createdAt: true,
        campaignContacts: {
          select: {
            campaign: {
              select: { id: true, number: true, name: true },
            },
          },
          take: 1,
        },
      },
    });

    // Flatten campaign data for frontend
    const flatProspects = prospects.map(({ campaignContacts, ...rest }) => ({
      ...rest,
      conversion: conversionChance(rest),
      engagement: engagementScore(rest),
      campaignId: campaignContacts[0]?.campaign?.id ?? null,
      campaignNumber: campaignContacts[0]?.campaign?.number ?? null,
    }));

    return NextResponse.json({
      prospects: flatProspects,
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

    // Deduplicate prospects by email, company name+city, and phone number
    if (body._action === "deduplicate") {
      const workspaceId = await getWorkspaceId();
      // Seulement CET espace de travail (aucun lien entre les comptes)
      const whereClause: Record<string, unknown> = { archivedAt: null, workspaceId: workspaceId ?? null };

      const all = await prisma.prospect.findMany({
        where: whereClause,
        select: { id: true, companyName: true, email: true, city: true, phone: true, website: true, leadScore: true, status: true, createdAt: true },
        orderBy: { leadScore: "desc" },
      });

      const toDeleteSet = new Set<string>();

      // 1. Deduplicate by email (case-insensitive)
      const seenEmails = new Map<string, string>();
      for (const p of all) {
        if (!p.email) continue;
        const key = p.email.toLowerCase().trim();
        if (seenEmails.has(key)) {
          toDeleteSet.add(p.id);
        } else {
          seenEmails.set(key, p.id);
        }
      }

      // 2. Deduplicate by company name + city (case-insensitive)
      const seenNames = new Map<string, string>();
      for (const p of all) {
        if (toDeleteSet.has(p.id)) continue;
        const nameKey = `${p.companyName.toLowerCase().trim()}|${(p.city || "").toLowerCase().trim()}`;
        if (seenNames.has(nameKey)) {
          toDeleteSet.add(p.id);
        } else {
          seenNames.set(nameKey, p.id);
        }
      }

      // 3. Deduplicate by phone number (digits only)
      const seenPhones = new Map<string, string>();
      for (const p of all) {
        if (toDeleteSet.has(p.id)) continue;
        if (!p.phone) continue;
        const phoneKey = p.phone.replace(/\D/g, "");
        if (phoneKey.length < 7) continue;
        if (seenPhones.has(phoneKey)) {
          toDeleteSet.add(p.id);
        } else {
          seenPhones.set(phoneKey, p.id);
        }
      }

      // 4. Même site web (domaine) = même entreprise, même inscrite dans une autre ville
      const seenSites = new Map<string, string>();
      for (const p of all) {
        if (toDeleteSet.has(p.id)) continue;
        const siteKey = websiteKey(p.website);
        if (!siteKey) continue;
        if (seenSites.has(siteKey)) {
          toDeleteSet.add(p.id);
        } else {
          seenSites.set(siteKey, p.id);
        }
      }

      const toDelete = Array.from(toDeleteSet);

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

      // Delete in batches of 200 to avoid query size limits
      let totalArchived = 0;
      const BATCH_SIZE = 200;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        await prisma.campaignContact.deleteMany({ where: { prospectId: { in: batch } } });
        await prisma.funnelProspect.deleteMany({ where: { prospectId: { in: batch } } });
        await prisma.emailActivity.deleteMany({ where: { prospectId: { in: batch } } });
        const result = await prisma.prospect.updateMany({
          where: { id: { in: batch } },
          data: { archivedAt: new Date() },
        });
        totalArchived += result.count;
      }

      if (totalArchived > 0) {
        await logActivity({
          workspaceId: workspaceId ?? undefined,
          action: "prospect_deduplicated",
          type: "success",
          title: "Doublons supprimés",
          details: `${totalArchived} prospects en double supprimés`,
          metadata: { detected: toDelete.length, archived: totalArchived, deletedProspects },
        });
      }

      return NextResponse.json({ deleted: totalArchived });
    }

    // Bulk assign prospects to a campaign
    if (body._action === "bulkAssignCampaign") {
      const { ids, campaignId: targetCampaignId } = body;
      if (!Array.isArray(ids) || !targetCampaignId) {
        return NextResponse.json({ error: "ids and campaignId required" }, { status: 400 });
      }
      let assigned = 0;
      for (const prospectId of ids) {
        try {
          await prisma.campaignContact.upsert({
            where: { campaignId_prospectId: { campaignId: targetCampaignId, prospectId } },
            update: {},
            create: { campaignId: targetCampaignId, prospectId },
          });
          assigned++;
        } catch {
          // Skip errors (invalid IDs, etc.)
        }
      }

      // Autres campagnes où ces prospects se trouvent déjà (pour proposer de les en retirer)
      const otherLinks = await prisma.campaignContact.findMany({
        where: { prospectId: { in: ids }, campaignId: { not: targetCampaignId } },
        select: { campaign: { select: { id: true, number: true, name: true } } },
      });
      const byCampaign = new Map<string, { id: string; number: number; name: string; count: number }>();
      for (const { campaign } of otherLinks) {
        const entry = byCampaign.get(campaign.id) ?? { ...campaign, count: 0 };
        entry.count++;
        byCampaign.set(campaign.id, entry);
      }
      const otherCampaigns = [...byCampaign.values()].sort((a, b) => a.number - b.number);

      return NextResponse.json({ assigned, otherCampaigns });
    }

    // Retire des prospects d'une ou plusieurs campagnes (ex. après les avoir mis dans une nouvelle).
    // L'historique des courriels déjà envoyés reste ; seuls les envois planifiés pas encore partis sont mis à jour.
    if (body._action === "bulkRemoveFromCampaigns") {
      const { ids, campaignIds } = body;
      if (!Array.isArray(ids) || !Array.isArray(campaignIds) || ids.length === 0 || campaignIds.length === 0) {
        return NextResponse.json({ error: "ids and campaignIds required" }, { status: 400 });
      }
      const workspaceId = await getWorkspaceId();
      const campaigns = await prisma.campaign.findMany({
        where: { id: { in: campaignIds }, workspaceId: workspaceId ?? null },
        select: { id: true, number: true, name: true },
      });
      const allowedIds = campaigns.map((c) => c.id);
      if (allowedIds.length === 0) {
        return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
      }

      const removed = await prisma.campaignContact.deleteMany({
        where: { campaignId: { in: allowedIds }, prospectId: { in: ids } },
      });

      // Envois planifiés de ces campagnes : retirer ces prospects de la liste figée au moment de planifier
      const removedSet = new Set<string>(ids);
      const pending = await prisma.scheduledEmail.findMany({
        where: { campaignId: { in: allowedIds }, status: "PENDING" },
        select: { id: true, snapshotProspectIds: true },
      });
      for (const se of pending) {
        if (!se.snapshotProspectIds.some((pid) => removedSet.has(pid))) continue;
        const remaining = se.snapshotProspectIds.filter((pid) => !removedSet.has(pid));
        // Liste vide = le traitement prendrait TOUS les contacts de la campagne : on annule plutôt l'envoi
        await prisma.scheduledEmail.update({
          where: { id: se.id },
          data: remaining.length > 0
            ? { snapshotProspectIds: remaining }
            : { status: "CANCELLED", error: "Tous les destinataires ont été retirés de la campagne" },
        });
      }

      await logActivity({
        action: "campaign_contacts_removed",
        type: "info",
        title: "Prospects retirés de campagne",
        details: `${removed.count} retrait${removed.count > 1 ? "s" : ""} — ${campaigns.map((c) => `#${c.number} ${c.name}`).join(", ")}`,
        workspaceId: workspaceId ?? undefined,
        metadata: { campaign_ids: allowedIds, prospect_count: ids.length, removed: removed.count },
      });

      return NextResponse.json({ removed: removed.count });
    }

    // Clean up prospects that don't match targeting keywords (with website scraping)
    // Runs as fire-and-forget background task — frontend polls cleanup-progress
    if (body._action === "cleanupIrrelevant") {
      const workspaceId = await getWorkspaceId();
      if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

      const settingsRow = await prisma.appSettings.findFirst({
        where: { workspaceId },
        select: { data: true },
      });
      const settingsData = (settingsRow?.data as Record<string, unknown>) || {};
      const targeting = (settingsData.targeting as Record<string, unknown>) || {};
      const keywords: string[] = splitCommaList(targeting.keywords);
      const blockedKeywords: string[] = splitCommaList(targeting.blockedKeywords);

      if (keywords.length === 0) {
        return NextResponse.json({ error: "Aucun mot-clé configuré dans Ciblage" }, { status: 400 });
      }

      const { checkRelevanceBatch } = await import("@/lib/relevance-check");
      const { setCleanupProgress, updateCleanupProgress, isCleanupCancelRequested } = await import("@/lib/cleanup-progress");

      const prospects = await prisma.prospect.findMany({
        where: { workspaceId, archivedAt: null },
        select: { id: true, companyName: true, industry: true, website: true, city: true },
      });

      setCleanupProgress({
        status: "running",
        checked: 0,
        total: prospects.length,
        archived: 0,
        currentProspect: "...",
        startedAt: Date.now(),
      });

      const relevanceConfig = { positiveKeywords: keywords, blockedKeywords };
      const irrelevantIds: string[] = [];
      const BATCH_SIZE = 10;

      for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
        if (isCleanupCancelRequested()) break;

        const batch = prospects.slice(i, i + BATCH_SIZE);
        updateCleanupProgress({
          checked: i + batch.length,
          archived: irrelevantIds.length,
          currentProspect: batch[0]?.companyName || "...",
        });

        try {
          const results = await checkRelevanceBatch(
            batch.map((p) => ({
              companyName: p.companyName,
              website: p.website || undefined,
              googleCategory: p.industry || undefined,
              searchKeyword: keywords[0],
            })),
            relevanceConfig
          );
          for (let j = 0; j < batch.length; j++) {
            if (results[j]?.relevant === false) {
              irrelevantIds.push(batch[j].id);
              updateCleanupProgress({ archived: irrelevantIds.length });
            }
          }
        } catch (err) {
          console.error(`[cleanup] Batch ${i} error:`, err);
        }
      }

      // Archive irrelevant prospects in batches
      let totalArchived = 0;
      const DELETE_BATCH = 200;
      for (let i = 0; i < irrelevantIds.length; i += DELETE_BATCH) {
        const batchIds = irrelevantIds.slice(i, i + DELETE_BATCH);
        await prisma.campaignContact.deleteMany({ where: { prospectId: { in: batchIds } } });
        await prisma.funnelProspect.deleteMany({ where: { prospectId: { in: batchIds } } });
        const result = await prisma.prospect.updateMany({
          where: { id: { in: batchIds } },
          data: { archivedAt: new Date() },
        });
        totalArchived += result.count;
      }

      const wasCancelled = isCleanupCancelRequested();
      setCleanupProgress({
        status: wasCancelled ? "cancelled" : "done",
        checked: prospects.length,
        total: prospects.length,
        archived: totalArchived,
        currentProspect: "",
        startedAt: Date.now(),
      });

      if (totalArchived > 0) {
        await logActivity({
          action: "prospect_cleanup_irrelevant",
          type: "success",
          title: "Prospects non pertinents supprimés",
          details: `${totalArchived} prospects archivés (ne correspondent pas aux mots-clés de ciblage)`,
          metadata: { archived: totalArchived, totalChecked: prospects.length, keywords },
        });
      }

      return NextResponse.json({ archived: totalArchived, checked: prospects.length, cancelled: wasCancelled });
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
        // Seulement CET espace de travail
        const r = await prisma.prospect.updateMany({
          where: { city, workspaceId: (await getWorkspaceId()) ?? null },
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
      if (!prospect || (prospect.workspaceId ?? null) !== ((await getWorkspaceId()) ?? null)) {
        return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
      }
      return NextResponse.json({ ...prospect, conversion: conversionChance(prospect), engagement: engagementScore(prospect) });
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

    // Fetch current prospect to detect status change
    const current = await prisma.prospect.findUnique({
      where: { id },
      select: { status: true, workspaceId: true, email: true },
    });
    // Seulement un prospect de CET espace de travail
    const wsId = await getWorkspaceId();
    if (!current || (current.workspaceId ?? null) !== (wsId ?? null)) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }

    // Tags : liste d'identifiants (texte court), sans doublon
    if (Array.isArray(data.tags)) {
      allowed.tags = Array.from(new Set((data.tags as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))).slice(0, 50);
    }

    // Tag « deviné » : modifiable à la main ; un courriel tapé à la main n'est plus « deviné »
    if (typeof data.emailGuessed === "boolean") allowed.emailGuessed = data.emailGuessed;
    const newEmail = typeof allowed.email === "string" ? (allowed.email as string).trim() : undefined;
    if (newEmail !== undefined) {
      allowed.email = newEmail || null;
      if (newEmail.toLowerCase() !== (current.email ?? "").toLowerCase()) {
        if (!("emailGuessed" in allowed)) allowed.emailGuessed = false;
        // L'ancienne vérification ne s'applique plus au nouveau courriel
        allowed.emailStatus = null;
        allowed.emailVerifiedAt = null;
      }
      if (!newEmail) allowed.emailGuessed = false;
    }

    const updated = await prisma.prospect.update({
      where: { id },
      data: allowed,
    });

    // When status manually set to REPLIED:
    // 1. Mark latest EmailActivity as replyReceived (so it shows in campaign reports)
    // 2. Auto-add to funnel "New Replies" stage
    if (
      allowed.status === "REPLIED" &&
      current?.status !== "REPLIED"
    ) {
      // Mark latest email activity as replied
      const latestEmail = await prisma.emailActivity.findFirst({
        where: { prospectId: id },
        orderBy: { sentAt: "desc" },
      });
      if (latestEmail && !latestEmail.replyReceived) {
        await prisma.emailActivity.update({
          where: { id: latestEmail.id },
          data: { replyReceived: true },
        });
      }

      // Auto-add to funnel
      if (current?.workspaceId) {
        const existingFunnel = await prisma.funnelProspect.findUnique({
          where: { prospectId: id },
        });
        if (!existingFunnel) {
          const defaultStage = await prisma.funnelStage.findFirst({
            where: { workspaceId: current.workspaceId, isDefault: true },
          });
          if (defaultStage) {
            await prisma.funnelProspect.create({
              data: { stageId: defaultStage.id, prospectId: id, sortOrder: 0 },
            });
          }
        }
      }
    }

    // Handle campaign assignment
    if ("campaignId" in data) {
      // Remove existing campaign contacts for this prospect
      await prisma.campaignContact.deleteMany({ where: { prospectId: id } });
      // Create new one if a campaign was selected
      if (data.campaignId) {
        await prisma.campaignContact.create({
          data: { campaignId: data.campaignId, prospectId: id },
        });
      }
    }

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
    // Support both query param (?ids=a,b) and JSON body ({ ids: [a,b] })
    let ids: string[] = [];
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    if (idsParam) {
      ids = idsParam.split(",").filter(Boolean);
    } else {
      try {
        const body = await request.json();
        if (Array.isArray(body.ids)) ids = body.ids.filter(Boolean);
      } catch { /* no body */ }
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
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
