"use client";

import { useEffect, useState, useCallback, useRef, memo, useMemo, useTransition, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { CityDropdown } from "@/components/ui/city-dropdown";
import JobProgressBar from "@/components/prospects/JobProgressBar";
import ProspectInsights from "@/components/prospects/ProspectInsights";
import { useEnrichment } from "@/components/EnrichmentProvider";
import { useTranslation } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";
import { TAG_COLOR_CLASSES, parseProspectTags, type ProspectTag } from "@/lib/prospect-tags";

// ---------- Types ----------
interface ProspectListItem {
  id: string;
  companyName: string;
  city: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  leadScore: number;
  source: string | null;
  contactType: string | null;
  industry: string | null;
  emailGuessed: boolean;
  tags?: string[];
  reviewCount: number | null;
  companyNameNeedsReview?: boolean;
  contactFormStatus?: string | null;
  contactFormProvider?: string | null;
  competitorCrm?: string | null;
  ownerName?: string | null;
  ownerRole?: string | null;
  ownerConfidence?: string | null;
  ownerCheckedAt?: string | null;
  conversion?: { score: number; reasons: string[] };
  engagement?: { score: number; reasons: string[]; hot: boolean };
  // Signaux site & avis, engagement, appels
  siteAnalyzedAt?: string | null;
  hiring?: boolean | null;
  complaintCount?: number | null;
  ownerRepliesReviews?: boolean | null;
  reviewsLast6m?: number | null;
  onlineBooking?: boolean | null;
  onlinePayment?: boolean | null;
  teamsCount?: number | null;
  serviceSegment?: string | null;
  emailOpenCount?: number | null;
  emailClickCount?: number | null;
  siteVisitCount?: number | null;
  lastReplySentiment?: string | null;
  lastEngagedAt?: string | null;
  lastCallAt?: string | null;
  lastCallOutcome?: string | null;
  lastCallWho?: string | null;
  lastObjection?: string | null;
  currentTool?: string | null;
  employeeCount?: number | null;
  callbackAt?: string | null;
  salesStage?: string | null;
  lostReason?: string | null;
  registrationYear?: number | null;
  registrationDate?: string | null;
  registrationSource?: string | null;
  registrationEvidence?: string | null;
  registrationUrl?: string | null;
  registrationConfidence?: string | null;
  registrationCheckedAt?: string | null;
  createdAt: string;
  campaignId: string | null;
  campaignNumber: number | null;
}

interface CampaignOption {
  id: string;
  number: number;
  name: string;
}

interface ProspectDetail extends ProspectListItem {
  ownerSourceUrl?: string | null;
  hiringEvidence?: string | null;
  complaintEvidence?: string | null;
  reviewsSampleSize?: number | null;
  reviewsSource?: string | null;
  bookingTool?: string | null;
  teamsEvidence?: string | null;
  ownerEvidence?: string | null;
  address: string | null;
  secondaryEmail: string | null;
  contactPageUrl: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  dateDiscovered: string;
  emailActivities: Array<{
    id: string;
    emailSubject: string;
    sentAt: string;
    replyReceived: boolean;
    bounce: boolean;
  }>;
}

// ---------- Constants ----------
const STATUS_OPTIONS = ["NEW", "ENRICHED", "CONTACTED", "REPLIED", "BOUNCED", "QUALIFIED", "NOT_INTERESTED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  ENRICHED: "Enrichi",
  CONTACTED: "Contacté",
  REPLIED: "Répondu",
  BOUNCED: "Bounce",
  QUALIFIED: "Qualifié",
  NOT_INTERESTED: "Pas intéressé",
};
const SOURCE_OPTIONS = ["google_search", "duckduckgo_search", "manual", "import", "referral"];
const CONTACT_TYPE_OPTIONS = ["prospect", "client", "nouveau_client"];
const CONTACT_TYPE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  client: "Client",
  nouveau_client: "Nouveau client",
};

const LOAD_ALL_LIMIT = 5000;
const CURRENT_YEAR = new Date().getFullYear();

// Colonnes de la liste : l'utilisateur choisit celles qu'il affiche (mémorisé dans ce navigateur).
// Entreprise, numéro et case à cocher restent toujours visibles.
const LIST_COLUMNS = [
  { key: "city", label: "Ville", width: 120 },
  { key: "email", label: "Courriel", width: 210 },
  { key: "phone", label: "Téléphone", width: 140 },
  { key: "campaign", label: "Campagne", width: 90 },
  { key: "reviews", label: "Avis", width: 60 },
  { key: "registration", label: "Immatriculation", width: 140 },
  { key: "score", label: "Score", width: 80 },
  { key: "conversion", label: "Chance", width: 90 },
  { key: "engagement", label: "Engagement", width: 110 },
  { key: "status", label: "Statut", width: 110 },
  { key: "actions", label: "Actions", width: 110 },
] as const;
type ListColumn = (typeof LIST_COLUMNS)[number]["key"];
const HIDDEN_COLUMNS_KEY = "leadnova.prospects.hiddenColumns";
const HIDDEN_COLUMNS_EVENT = "leadnova:hidden-columns";

function subscribeHiddenColumns(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(HIDDEN_COLUMNS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(HIDDEN_COLUMNS_EVENT, cb);
  };
}
function readHiddenColumns() {
  try { return localStorage.getItem(HIDDEN_COLUMNS_KEY) ?? ""; } catch { return ""; }
}
function writeHiddenColumns(keys: string[]) {
  try { localStorage.setItem(HIDDEN_COLUMNS_KEY, keys.join(",")); } catch { /* navigation privée */ }
  window.dispatchEvent(new Event(HIDDEN_COLUMNS_EVENT));
}

const REGISTRATION_SOURCE_LABELS: Record<string, string> = {
  registre: "Registre des entreprises du Québec",
  site: "Site de l'entreprise",
  web: "Source web",
  domaine: "Indice seulement : création du nom de domaine",
};

/** Année d'immatriculation + âge ; « indice » quand ce n'est que la date du nom de domaine. */
function RegistrationCell({ p }: { p: ProspectListItem }) {
  if (!p.registrationCheckedAt) return <span className="text-foreground-muted" title="Pas encore cherchée">—</span>;
  if (!p.registrationYear) return <span className="text-xs text-foreground-muted" title="Aucune source fiable trouvée">Inconnue</span>;
  const age = CURRENT_YEAR - p.registrationYear;
  const hint = p.registrationSource === "domaine";
  const title = `${REGISTRATION_SOURCE_LABELS[p.registrationSource ?? ""] ?? "Source"}${p.registrationEvidence ? ` — « ${p.registrationEvidence} »` : ""}`;
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className={cn("tabular-nums", hint ? "text-foreground-muted" : "text-foreground-secondary")}>{p.registrationYear}</span>
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", age < 3 ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success")}>
        {age < 3 ? "< 3 ans" : `${age} ans`}
      </span>
      {hint && <span className="text-[10px] text-foreground-muted">indice</span>}
    </span>
  );
}

// ---------- Sub-components ----------
const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    NEW: "bg-primary-subtle text-primary border border-primary/20",
    ENRICHED: "bg-background-muted text-foreground-secondary border border-border",
    SCHEDULED: "bg-warning-subtle text-warning border border-warning/20",
    CONTACTED: "bg-warning-subtle text-warning border border-warning/20",
    REPLIED: "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700",
    BOUNCED: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
    QUALIFIED: "bg-success-subtle text-success border border-success/20",
    NOT_INTERESTED: "bg-background-muted text-foreground-muted border border-border",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status] || "bg-background-muted text-foreground-muted border border-border"}`}>
      {t("status", status as "NEW") || status}
    </span>
  );
});

// Segment « formulaire de contact » : détermine quel message de campagne le prospect reçoit
function ConversionPill({ conversion }: { conversion?: { score: number; reasons: string[] } }) {
  if (!conversion) return <span className="text-foreground-muted">—</span>;
  const { score, reasons } = conversion;
  const tone = score >= 7 ? "bg-success-subtle text-success" : score >= 4 ? "bg-warning-subtle text-warning" : "bg-background-muted text-foreground-muted";
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)} title={reasons.join("\n") || "Peu de signaux"}>
      {score}/10
    </span>
  );
}

function EngagementPill({ engagement }: { engagement?: { score: number; reasons: string[]; hot: boolean } }) {
  if (!engagement) return <span className="text-foreground-muted">—</span>;
  const { score, reasons, hot } = engagement;
  const tone = score >= 6 ? "bg-success-subtle text-success" : score >= 3 ? "bg-warning-subtle text-warning" : "bg-background-muted text-foreground-muted";
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)} title={reasons.join("\n") || "Aucune interaction"}>
      {hot ? "🔥 " : ""}{score}/10
    </span>
  );
}

function FormBadge({ status, provider, crm }: { status?: string | null; provider?: string | null; crm?: string | null }) {
  if (crm) {
    return <span className="text-[10px] bg-success-subtle text-success px-1.5 py-0.5 rounded shrink-0 font-medium" title={`CRM concurrent détecté : ${crm}`}>{crm}</span>;
  }
  if (status === "HAS_FORM") {
    return <span className="text-[10px] bg-primary-subtle text-primary px-1.5 py-0.5 rounded shrink-0 font-medium" title={`Formulaire détecté : ${provider || "oui"}`}>Formulaire</span>;
  }
  if (status === "NO_FORM") {
    return <span className="text-[10px] bg-background-muted text-foreground-secondary px-1.5 py-0.5 rounded shrink-0 font-medium" title="Aucun formulaire de contact sur le site">Sans form.</span>;
  }
  if (status === "NO_WEBSITE") {
    return <span className="text-[10px] bg-background-muted text-foreground-secondary px-1.5 py-0.5 rounded shrink-0 font-medium" title="Aucun site web">Sans site</span>;
  }
  return null;
}

function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="border-b border-border animate-pulse">
      <td className="px-4 py-3" />
      <td className="px-4 py-3" />
      <td className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-32" /><div className="h-3 bg-background-subtle rounded w-20 mt-1" /></td>
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-3/4" /></td>
      ))}
    </tr>
  );
}

const ProspectRow = memo(function ProspectRow({
  prospect,
  rowIndex,
  actionLoading,
  selected,
  campaigns,
  onSelect,
  onToggleSelect,
  onEnrich,
  onEmail,
  onDragStart,
  onCampaignChange,
  hiddenColumns,
  tagDefs,
}: {
  hiddenColumns: string;
  tagDefs: ProspectTag[];
  prospect: ProspectListItem;
  rowIndex: number;
  actionLoading: string | null;
  selected: boolean;
  campaigns: CampaignOption[];
  onSelect: (p: ProspectListItem) => void;
  onToggleSelect: (id: string) => void;
  onEnrich: (id: string) => void;
  onEmail: (p: ProspectListItem) => void;
  onDragStart: (id: string, e?: React.MouseEvent) => void;
  onCampaignChange: (prospectId: string, campaignId: string | null) => void;
}) {
  const { t } = useTranslation();
  const show = (k: ListColumn) => !`,${hiddenColumns},`.includes(`,${k},`);
  return (
    <tr
      data-row-idx={rowIndex - 1}
      className={`border-b border-border hover:bg-card-hover cursor-pointer ${selected ? "bg-primary-subtle" : ""}`}
      onClick={() => onSelect(prospect)}
    >
      <td className="px-4 py-3 text-xs text-foreground-muted text-right">{rowIndex}</td>
      <td
        className="px-4 py-3 select-none"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.preventDefault(); onDragStart(prospect.id, e); }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(prospect.id)}
          className="w-4 h-4 rounded border-border-strong text-primary focus:ring-primary pointer-events-none"
        />
      </td>
      <td className="px-4 py-3 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-foreground truncate">{prospect.companyName}</p>
          {prospect.companyNameNeedsReview && (
            <span className="text-[10px] bg-warning-subtle text-warning px-1.5 py-0.5 rounded shrink-0 font-medium" title="Nom à vérifier">Review</span>
          )}
          <FormBadge status={prospect.contactFormStatus} provider={prospect.contactFormProvider} crm={prospect.competitorCrm} />
          {tagDefs.filter((tg) => prospect.tags?.includes(tg.id)).map((tg) => (
            <span key={tg.id} className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium", TAG_COLOR_CLASSES[tg.color])}>{tg.name}</span>
          ))}
        </div>
        {prospect.ownerName ? (
          <p className="text-xs text-foreground-secondary truncate" title={`${prospect.ownerRole || "Propriétaire"} — confiance ${prospect.ownerConfidence === "high" ? "élevée" : "moyenne"}`}>
            <span className="text-success">●</span> {prospect.ownerName}{prospect.ownerRole ? ` · ${prospect.ownerRole}` : ""}
          </p>
        ) : prospect.industry ? (
          <p className="text-xs text-foreground-muted truncate">{prospect.industry}</p>
        ) : null}
      </td>
      {show("city") && <td className="px-4 py-3 text-foreground-secondary truncate overflow-hidden">{prospect.city || "—"}</td>}
      {show("email") && <td className="px-4 py-3 overflow-hidden">
        {prospect.email ? (
          <span className="flex items-center gap-1">
            <span className={`truncate ${prospect.emailGuessed ? "text-warning" : "text-foreground-secondary"}`}>{prospect.email}</span>
            {prospect.emailGuessed && <span className="text-[10px] bg-warning-subtle text-warning px-1 rounded shrink-0">{t("common", "guessed")}</span>}
          </span>
        ) : "—"}
      </td>}
      {show("phone") && <td className="px-4 py-3 text-foreground-secondary truncate overflow-hidden">{prospect.phone || "—"}</td>}
      {show("campaign") && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <select
          value={prospect.campaignId || ""}
          onChange={(e) => onCampaignChange(prospect.id, e.target.value || null)}
          className="w-14 text-xs border border-border rounded px-1 py-0.5 bg-background text-foreground cursor-pointer"
        >
          <option value="">—</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.number}</option>
          ))}
        </select>
      </td>}
      {show("reviews") && <td className="px-4 py-3 whitespace-nowrap text-foreground-secondary tabular-nums text-sm">
        {prospect.reviewCount != null ? prospect.reviewCount : "—"}
      </td>}
      {show("registration") && <td className="px-4 py-3 whitespace-nowrap text-sm">
        <RegistrationCell p={prospect} />
      </td>}
      {show("score") && <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-mono font-medium text-foreground tabular-nums">{prospect.leadScore}</span>
      </td>}
      {show("conversion") && <td className="px-4 py-3 whitespace-nowrap">
        <ConversionPill conversion={prospect.conversion} />
      </td>}
      {show("engagement") && <td className="px-4 py-3 whitespace-nowrap">
        <EngagementPill engagement={prospect.engagement} />
      </td>}
      {show("status") && <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={prospect.status} />
      </td>}
      {show("actions") && <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {prospect.status === "NEW" && (
            <button
              onClick={() => onEnrich(prospect.id)}
              disabled={actionLoading === prospect.id}
              className="text-xs border border-border bg-card text-foreground-secondary px-2 py-1 rounded hover:bg-card-hover disabled:opacity-50"
            >
              {t("prospects", "enrich")}
            </button>
          )}
          {prospect.email && prospect.status !== "CONTACTED" && (
            <button
              onClick={() => onEmail(prospect)}
              className="text-xs border border-border bg-card text-foreground-secondary px-2 py-1 rounded hover:bg-card-hover"
            >
              Email
            </button>
          )}
        </div>
      </td>}
    </tr>
  );
});

// ---------- Main Page ----------
export default function ProspectsPage() {
  const [prospects, setProspects] = useState<ProspectListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [scrapedToday, setScrapedToday] = useState(0);
  const [enrichedToday, setEnrichedToday] = useState(0);
  const [dailyDiscoveryLimit, setDailyDiscoveryLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [formFilter, setFormFilter] = useState(""); // HAS_FORM | NO_FORM_ANY | NO_FORM | NO_WEBSITE | unknown | crm | coldcall
  const [industryGroupFilter, setIndustryGroupFilter] = useState("");
  const [crmFilter, setCrmFilter] = useState(""); // any | none
  const [reachFilter, setReachFilter] = useState(""); // email_real | email_guessed | no_email | coldcall
  const [minScoreFilter, setMinScoreFilter] = useState("");
  const [reviewsFilter, setReviewsFilter] = useState(""); // ideal | small | large
  const [minChanceFilter, setMinChanceFilter] = useState("");
  const [engagementFilter, setEngagementFilter] = useState(""); // "3" | "5" | "7" | hot
  const [callbackFilter, setCallbackFilter] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState(""); // found | not_found | pending
  const [tagFilter, setTagFilter] = useState(""); // identifiant d'un tag
  const [tagDefs, setTagDefs] = useState<ProspectTag[]>([]);
  const [ownerStats, setOwnerStats] = useState<{ found: number; notFound: number; remaining: number } | null>(null);
  const [ownerRun, setOwnerRun] = useState<{ processed: number; found: number; total: number } | null>(null);
  const ownerStopRef = useRef(false);
  const [ageFilter, setAgeFilter] = useState(""); // lt3 | gte3 | lt5 | gte5 | gte10 | unknown | pending
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [ageSureOnly, setAgeSureOnly] = useState(false);
  const [regStats, setRegStats] = useState<{ found: number; recent: number; older: number; unknown: number; remaining: number } | null>(null);
  const [regRun, setRegRun] = useState<{ processed: number; found: number; total: number } | null>(null);
  const regStopRef = useRef(false);
  const hiddenColumns = useSyncExternalStore(subscribeHiddenColumns, readHiddenColumns, () => "");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const visibleColumns = useMemo(
    () => LIST_COLUMNS.filter((c) => !`,${hiddenColumns},`.includes(`,${c.key},`)),
    [hiddenColumns]
  );
  const showCol = (k: ListColumn) => !`,${hiddenColumns},`.includes(`,${k},`);
  function toggleColumn(key: ListColumn) {
    const hidden = new Set(hiddenColumns.split(",").filter(Boolean));
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    writeHiddenColumns([...hidden]);
  }
  const [industryGroups, setIndustryGroups] = useState<{ key: string; label: string; count: number }[]>([]);
  const [formStats, setFormStats] = useState<{ hasForm: number; noForm: number; noWebsite: number; unreachable: number; competitorCrm: number; remaining: number } | null>(null);
  const [formDetectRunning, setFormDetectRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { t, locale } = useTranslation();
  const [sortBy, setSortBy] = useState("leadScore");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Detail modal
  const [selectedProspect, setSelectedProspect] = useState<ProspectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | number>>({});
  const [editEmailGuessed, setEditEmailGuessed] = useState(false);
  const [editTags, setEditTags] = useState<string[]>([]);

  // Discover & Enrich
  const [discoverTarget, setDiscoverTarget] = useState(100);
  const [targetingCities, setTargetingCities] = useState<string[]>([]);
  const [enrichTarget, setEnrichTarget] = useState(100);
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(false);
  const [discoverProgress, setDiscoverProgress] = useState<{
    status: string;
    target: number;
    found: number;
    newCount: number;
    filteredOut: number;
    filterPhase?: string;
    currentCity: string;
    round: number;
    startedAt: number;
    totalCities: number;
    completedCities: number;
  } | null>(null);
  // Enrichment state from global context (persists across navigation)
  const { enrichProgress, isRunning: isEnrichRunning, startPolling: startEnrichPolling, stopEnrichment, dismiss: dismissEnrich, setOptimisticProgress: setEnrichProgress } = useEnrichment();

  // Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importParsed, setImportParsed] = useState<Array<{
    companyName: string;
    industry?: string | null;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    googleMapsUrl?: string | null;
    contactType?: string;
    notes?: string | null;
    _selected?: boolean;
  }> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  // File import
  const [importFileColumns, setImportFileColumns] = useState<string[]>([]);
  const [importFileRows, setImportFileRows] = useState<string[][]>([]);
  const [importColumnMap, setImportColumnMap] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<"input" | "mapping" | "preview" | "done">("input");
  const [importDedupMode, setImportDedupMode] = useState<string>("companyName_city");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discover confirmation modal
  const [showDiscoverConfirm, setShowDiscoverConfirm] = useState(false);
  const [targetingKeywords, setTargetingKeywords] = useState<string[]>([]);
  const [targetingQueries, setTargetingQueries] = useState<string[]>([]);
  const [targetingAge, setTargetingAge] = useState("");

  // Campaign assignment on discover
  const [discoverCampaignId, setDiscoverCampaignId] = useState("");

  // Province-based discovery
  const [provinces, setProvinces] = useState<{ code: string; name: string }[]>([]);
  const [discoverProvince, setDiscoverProvince] = useState("");
  const [discoverKeyword, setDiscoverKeyword] = useState("");
  const [gmapsCities, setGmapsCities] = useState<{ name: string; province: string; population: number; searchUrl?: string }[]>([]);
  const [showGmapsPanel, setShowGmapsPanel] = useState(false);

  // Scroll to top button
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Find in page (Ctrl+F)
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string } | null>(null);

  // (enrichDropdownRef removed — replaced by enrich confirmation modal)

  // Clear selection when search or filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, sourceFilter, contactTypeFilter, cityFilter, campaignFilter, formFilter, industryGroupFilter, crmFilter, reachFilter, minScoreFilter, reviewsFilter, ownerFilter, tagFilter, minChanceFilter, engagementFilter, callbackFilter, ageFilter, yearFrom, yearTo, ageSureOnly]);

  // Debounce search for server fetch only (local filter uses searchQuery directly)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery]);

  // Fetch prospects
  const hasLoadedOnce = useRef(false);
  const fetchProspects = useCallback(async () => {
    // Only show skeleton on initial load, not during enrichment refreshes
    if (!hasLoadedOnce.current) setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: String(LOAD_ALL_LIMIT) });
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (contactTypeFilter) params.set("contactType", contactTypeFilter);
    if (campaignFilter && campaignFilter !== "none") params.set("campaignId", campaignFilter);
    if (campaignFilter === "none") params.set("campaignId", "none");
    if (formFilter) params.set("formStatus", formFilter);
    if (industryGroupFilter) params.set("industryGroup", industryGroupFilter);
    if (crmFilter) params.set("competitorCrm", crmFilter);
    if (reachFilter === "coldcall") params.set("coldCall", "1");
    else if (reachFilter) params.set("reach", reachFilter);
    if (minScoreFilter) params.set("minScore", minScoreFilter);
    if (reviewsFilter) params.set("reviews", reviewsFilter);
    if (ownerFilter) params.set("owner", ownerFilter);
    if (tagFilter) params.set("tag", tagFilter);
    if (ageFilter) params.set("age", ageFilter);
    if (/^\d{4}$/.test(yearFrom)) params.set("yearFrom", yearFrom);
    if (/^\d{4}$/.test(yearTo)) params.set("yearTo", yearTo);
    if (ageSureOnly) params.set("ageSure", "1");
    if (callbackFilter) params.set("callback", "due");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    try {
      let res = await fetch(`/api/prospects?${params}`);
      // Retry once on 500 (transient DB connection errors)
      if (res.status === 500) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await fetch(`/api/prospects?${params}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProspects(data.prospects || []);
      setTotal(data.total || 0);
      if (data.scrapedToday !== undefined) setScrapedToday(data.scrapedToday);
      if (data.enrichedToday !== undefined) setEnrichedToday(data.enrichedToday);
      if (data.dailyDiscoveryLimit !== undefined) setDailyDiscoveryLimit(data.dailyDiscoveryLimit);
      hasLoadedOnce.current = true;
    } catch (error) {
      console.error("Failed to fetch prospects:", error);
      // Don't clear existing data on error — keep showing what we have
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, contactTypeFilter, campaignFilter, formFilter, industryGroupFilter, crmFilter, reachFilter, minScoreFilter, reviewsFilter, ownerFilter, tagFilter, callbackFilter, ageFilter, yearFrom, yearTo, ageSureOnly, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  // Fetch campaigns for dropdown
  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CampaignOption[]) => {
        const list = Array.isArray(data) ? data : [];
        setCampaigns(list.map((c) => ({ id: c.id, number: c.number, name: c.name })).sort((a, b) => a.number - b.number));
      })
      .catch(console.error);
  }, []);

  // Assign campaign to prospect
  const handleCampaignChange = useCallback(async (prospectId: string, campaignId: string | null) => {
    // Optimistic update
    setProspects((prev) =>
      prev.map((p) =>
        p.id === prospectId
          ? { ...p, campaignId, campaignNumber: campaigns.find((c) => c.id === campaignId)?.number ?? null }
          : p
      )
    );
    try {
      await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospectId, campaignId }),
      });
    } catch (error) {
      console.error("Failed to assign campaign:", error);
    }
  }, [campaigns]);

  // Derive available cities from loaded prospects (dynamic, no static list)
  const availableCities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of prospects) {
      const city = p.city?.trim();
      if (city) {
        const key = city.toLowerCase().normalize("NFC");
        if (!seen.has(key)) seen.set(key, city);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, locale));
  }, [prospects, locale]);

  // Client-side filtered prospects: instant filter using searchQuery + cityFilter (no debounce wait)
  const displayProspects = useMemo(() => {
    let result = prospects;
    if (minChanceFilter) result = result.filter((p) => (p.conversion?.score ?? 0) >= Number(minChanceFilter));
    if (engagementFilter === "hot") result = result.filter((p) => p.engagement?.hot);
    else if (engagementFilter) result = result.filter((p) => (p.engagement?.score ?? 0) >= Number(engagementFilter));
    if (sortBy === "conversion") {
      const dir = sortOrder === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => ((a.conversion?.score ?? 0) - (b.conversion?.score ?? 0)) * dir || b.leadScore - a.leadScore);
    } else if (sortBy === "engagement") {
      const dir = sortOrder === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => ((a.engagement?.score ?? 0) - (b.engagement?.score ?? 0)) * dir || (b.conversion?.score ?? 0) - (a.conversion?.score ?? 0));
    }
    if (cityFilter) result = result.filter((p) => p.city?.trim().toLowerCase() === cityFilter.trim().toLowerCase());
    const q = searchQuery.toLowerCase();
    if (!q) return result;
    // Normalize phone search: strip non-digit chars for comparison
    const qDigits = q.replace(/\D/g, "");
    const isPhoneSearch = qDigits.length >= 3;
    return result.filter((p) => {
      if (p.companyName.toLowerCase().includes(q)) return true;
      if (p.email && p.email.toLowerCase().includes(q)) return true;
      if (p.city && p.city.toLowerCase().includes(q)) return true;
      if (p.industry && p.industry.toLowerCase().includes(q)) return true;
      if (p.website && p.website.toLowerCase().includes(q)) return true;
      // Phone: match both raw and normalized (digits only)
      if (p.phone) {
        if (p.phone.includes(q)) return true;
        if (isPhoneSearch && p.phone.replace(/\D/g, "").includes(qDigits)) return true;
      }
      return false;
    });
  }, [prospects, searchQuery, cityFilter, minChanceFilter, engagementFilter, sortBy, sortOrder]);

  // Fetch targeting cities from settings + provinces list
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.targeting?.cities) setTargetingCities(((v: string[]) => v.flatMap((x) => String(x).split(/[,;\n]/)).map((x) => x.trim()).filter(Boolean))(data.targeting.cities));
        if (data?.targeting?.keywords) setTargetingKeywords(((v: string[]) => v.flatMap((x) => String(x).split(/[,;\n]/)).map((x) => x.trim()).filter(Boolean))(data.targeting.keywords));
        if (data?.targeting?.searchQueries) setTargetingQueries(data.targeting.searchQueries);
        setTargetingAge(typeof data?.targeting?.companyAge === "string" ? data.targeting.companyAge : "");
        setTagDefs(parseProspectTags(data?.prospectTags));
      })
      .catch(() => {});
    fetch("/api/cities?list=provinces")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.provinces) setProvinces(data.provinces);
      })
      .catch(() => {});
  }, []);

  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedProspect?.id ?? null; }, [selectedProspect]);

  // Recharge la fiche ouverte (après un appel) sans la fermer, puis la liste
  const refreshSelected = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "getDetail", id }),
      });
      if (res.ok) setSelectedProspect(await res.json());
    } catch { /* silencieux */ }
    fetchProspects();
  }, [fetchProspects]);

  // Lien direct depuis la page Appels : /prospects?open=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id) return;
    setDetailLoading(true);
    fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "getDetail", id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSelectedProspect(d))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, []);

  // Fetch full detail for modal
  const handleSelectProspect = useCallback(async (p: ProspectListItem) => {
    setDetailLoading(true);
    setSelectedProspect(null);
    setGeneratedEmail(null);
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "getDetail", id: p.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail = await res.json();
      setSelectedProspect(detail);
    } catch {
      // Fallback: show list data as partial detail
      setSelectedProspect({ ...p, address: null, secondaryEmail: null, contactPageUrl: null, linkedinUrl: null, notes: null, dateDiscovered: p.createdAt, emailActivities: [] });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Column sort handler
  const handleSort = useCallback((field: string) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
        return prev;
      }
      setSortOrder("desc");
      return field;
    });
     }, []);

  // Progress polling
  const progressIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const liveNewCountRef = useRef(0);
  const lastListRefreshRef = useRef(0);

  function startProgressPolling() {
    stopProgressPolling();
    liveNewCountRef.current = 0;
    lastListRefreshRef.current = 0;
    progressIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/prospects/discover");
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "running") {
          // Nouveaux prospects enregistrés : rafraîchir la liste (au plus toutes les 5 s)
          const n = data.newCount || 0;
          if (n > liveNewCountRef.current && Date.now() - lastListRefreshRef.current > 5000) {
            liveNewCountRef.current = n;
            lastListRefreshRef.current = Date.now();
            fetchProspects();
          }
          setDiscoverProgress({
            status: data.status,
            target: data.target || 0,
            found: data.found || 0,
            newCount: data.newCount || 0,
            filteredOut: data.filteredOut || 0,
            filterPhase: data.filterPhase || "",
            currentCity: data.currentCity || "",
            round: data.round || 1,
            startedAt: data.startedAt || Date.now(),
            totalCities: data.totalCities || 1,
            completedCities: data.completedCities || 0,
          });
        } else if (data.status === "done" || data.status === "error" || data.status === "cancelled") {
          setDiscoverProgress({
            status: data.status,
            target: data.target || 0,
            found: data.found || 0,
            newCount: data.newCount || 0,
            filteredOut: data.filteredOut || 0,
            filterPhase: data.filterPhase || "",
            currentCity: data.currentCity || "",
            round: data.round || 1,
            startedAt: data.startedAt || Date.now(),
            totalCities: data.totalCities || 1,
            completedCities: data.completedCities || 0,
          });
          stopProgressPolling();
        } else if (data.status === "idle") {
          // Le serveur ne connaît plus la recherche (redémarrage, mise en ligne) : ne pas laisser un compteur gelé
          stopProgressPolling();
          setDiscoverProgress(null);
          setActionLoading(null);
          fetchProspects();
        }
      } catch {
        // ignore polling errors
      }
    }, 1000);
  }

  function stopProgressPolling() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = undefined;
    }
  }

  // Page rechargée pendant une découverte : reprendre l'affichage de la progression
  useEffect(() => {
    fetch("/api/prospects/discover")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.status === "running") startProgressPolling();
      })
      .catch(() => {});
    return () => stopProgressPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStopDiscover() {
    try {
      await fetch("/api/prospects/discover", { method: "DELETE" });
    } catch {
      // ignore
    }
  }

  // Refresh prospect list when enrichment completes
  const prevEnrichStatus = useRef(enrichProgress?.status);
  useEffect(() => {
    const prev = prevEnrichStatus.current;
    const curr = enrichProgress?.status;
    prevEnrichStatus.current = curr;
    // When transitioning from running → done/cancelled, refresh data
    if (prev === "running" && (curr === "done" || curr === "cancelled")) {
      fetchProspects();
    }
  }, [enrichProgress?.status, fetchProspects]);

  // Actions
  async function handleDiscover(city: string, count?: number) {
    const targetCount = count || discoverTarget;
    setActionLoading("discover");
    setDiscoverProgress({ status: "running", target: targetCount, found: 0, newCount: 0, filteredOut: 0, currentCity: "...", round: 1, startedAt: Date.now(), totalCities: 1, completedCities: 0 });
    startProgressPolling();

    try {
      const res = await fetch("/api/prospects/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city || "all", targetCount, campaignId: discoverCampaignId || undefined }),
      });
      // Réponse pas toujours en JSON (ex. « upstream error » du proxy) : ne pas planter sur le parse
      const startText = await res.text();
      let startData: { error?: string } = {};
      try { startData = JSON.parse(startText); } catch { /* texte brut */ }
      if (!res.ok) {
        stopProgressPolling();
        throw new Error(startData.error || `Erreur du serveur (${res.status}) : ${startText.slice(0, 120)}`);
      }
      // La recherche tourne en arrière-plan sur le serveur : attendre sa fin et lire le résultat
      let data: {
        total?: number; found?: number; new?: number; filteredOut?: number; rounds?: number; cancelled?: boolean; addedToCampaign?: number; ageMatched?: number | null;
        batchId?: string | null; companyAge?: string | null; diagnostics?: unknown;
      } = {};
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        let p: { status?: string; error?: string; result?: Record<string, unknown> };
        try {
          const pr = await fetch("/api/prospects/discover");
          if (!pr.ok) continue;
          p = await pr.json();
        } catch {
          continue; // coupure réseau passagère : on réessaie
        }
        if (p.status === "running") continue;
        if (p.status === "error") throw new Error(p.error || t("prospects", "errorDiscovery"));
        if (p.status === "idle") throw new Error("La découverte s'est interrompue (serveur redémarré ?). Les prospects déjà trouvés sont dans ta liste.");
        data = p.result || { cancelled: p.status === "cancelled" };
        break;
      }
      stopProgressPolling();
      const finalStatus = data.cancelled ? "cancelled" : "done";
      setDiscoverProgress({ status: finalStatus, target: targetCount, found: data.total || data.found || 0, newCount: data.new || 0, filteredOut: data.filteredOut || 0, currentCity: "", round: data.rounds || 1, startedAt: discoverProgress?.startedAt || Date.now(), totalCities: discoverProgress?.totalCities || 1, completedCities: discoverProgress?.totalCities || 1 });
      fetchProspects();
      // Auto-clear progress after 5 seconds
      setTimeout(() => setDiscoverProgress(null), 5000);
      // 0 nouveau prospect : dire pourquoi au lieu d'un « terminé » muet
      if (!data.cancelled && (data.new || 0) === 0) {
        const diag = data.diagnostics as { queriesAttempted?: number; queriesFailed?: number; queriesSkipped?: number; errors?: string[] } | undefined;
        const found = data.total || data.found || 0;
        alert(
          found === 0 && !diag?.queriesAttempted && diag?.queriesSkipped
            ? `Aucune nouvelle recherche à faire : les ${diag.queriesSkipped} recherches de ton Ciblage ont déjà été faites il y a moins de 30 jours. Ajoute des villes ou des mots-clés, ou clique « Refaire toutes les recherches » dans Paramètres → Ciblage.`
            : found > 0
            ? `Aucun nouveau prospect : les ${found} résultat(s) trouvés sont déjà dans ta liste ou ont été exclus par le Ciblage (mots bloqués, nombre d'avis).`
            : diag?.queriesFailed
              ? `Aucun résultat : ${diag.queriesFailed}/${diag.queriesAttempted ?? "?"} recherche(s) ont échoué.\n${diag.errors?.[0] ?? ""}`
              : `Aucun résultat sur Google Maps (${diag?.queriesAttempted ?? 0} recherche(s)). Vérifie dans Paramètres → Ciblage que chaque ville et chaque mot-clé est une entrée séparée.`
        );
      }
      // Le serveur a déjà ajouté les nouveaux prospects à la campagne (ciblage par âge compris) : on le dit
      if (discoverCampaignId && (data.new || 0) > 0) {
        const added = Number(data.addedToCampaign) || 0;
        const name = campaigns.find((c) => c.id === discoverCampaignId);
        const label = name ? `#${name.number} — ${name.name}` : "la campagne";
        alert(
          data.companyAge && data.ageMatched != null
            ? `Ciblage par âge : ${data.ageMatched} des ${data.new} nouveaux prospects ont l'âge voulu ; ${added} ajouté(s) à ${label}. Les autres restent dans Prospects (filtre « Âge »).`
            : `${added} nouveau(x) prospect(s) ajouté(s) à ${label}.`
        );
      }
    } catch (error) {
      stopProgressPolling();
      setDiscoverProgress(null);
      alert(error instanceof Error ? error.message : t("prospects", "errorDiscovery"));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeduplicate() {
    if (!confirm(t("prospects", "confirmDeduplicate"))) return;
    setActionLoading("deduplicate");
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "deduplicate" }),
      });
      const data = await res.json();
      alert(`${data.deleted} ${data.deleted !== 1 ? t("prospects", "duplicatesRemovedPlural") : t("prospects", "duplicatesRemoved")} ${data.deleted !== 1 ? t("prospects", "removedPlural") : t("prospects", "removed")}`);
      fetchProspects();
    } catch {
      alert(t("prospects", "errorDeduplicate"));
    } finally {
      setActionLoading(null);
    }
  }

  // Cleanup progress
  const [cleanupProgress, setCleanupProgress] = useState<{
    status: string; checked: number; total: number; archived: number; currentProspect: string; startedAt: number;
  } | null>(null);
  const cleanupPollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  function startCleanupPolling() {
    stopCleanupPolling();
    cleanupPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/prospects/cleanup");
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "idle") return;
        setCleanupProgress(data);
        if (data.status === "done" || data.status === "cancelled") {
          stopCleanupPolling();
          fetchProspects();
          setTimeout(() => setCleanupProgress(null), 5000);
        }
      } catch { /* ignore */ }
    }, 1000);
  }
  function stopCleanupPolling() {
    if (cleanupPollRef.current) { clearInterval(cleanupPollRef.current); cleanupPollRef.current = undefined; }
  }

  async function handleCleanupIrrelevant() {
    if (!confirm("Supprimer les prospects qui ne correspondent pas à vos mots-clés de ciblage ? (scrape les sites web)")) return;
    setActionLoading("cleanup-irrelevant");
    setCleanupProgress({ status: "running", checked: 0, total: 0, archived: 0, currentProspect: "...", startedAt: Date.now() });
    startCleanupPolling();
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "cleanupIrrelevant" }),
      });
      // If request completes normally, update with final result
      if (res.ok) {
        const data = await res.json();
        stopCleanupPolling();
        setCleanupProgress({ status: data.cancelled ? "cancelled" : "done", checked: data.checked || 0, total: data.checked || 0, archived: data.archived || 0, currentProspect: "", startedAt: cleanupProgress?.startedAt || Date.now() });
        fetchProspects();
        setTimeout(() => setCleanupProgress(null), 5000);
      } else {
        const data = await res.json().catch(() => ({ error: "Cleanup failed" }));
        stopCleanupPolling();
        throw new Error(data.error || "Cleanup failed");
      }
    } catch (err) {
      // If fetch itself fails (timeout, network error), polling is still running
      // and will pick up progress from the backend
      if (err instanceof TypeError || (err instanceof Error && err.message.includes("timeout"))) {
        // Network/timeout error — backend is still running, polling will track it
        console.log("[cleanup] Request timed out, polling continues...");
      } else {
        stopCleanupPolling();
        setCleanupProgress(null);
        alert(err instanceof Error ? err.message : "Erreur lors du nettoyage");
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function stopCleanup() {
    try { await fetch("/api/prospects/cleanup", { method: "DELETE" }); } catch { /* ignore */ }
  }

  async function handleEnrichBatch() {
    setShowEnrichConfirm(false);
    setEnrichProgress({ status: "running", target: enrichTarget, enriched: 0, failed: 0, noData: 0, currentProspect: t("prospects", "starting"), startedAt: Date.now() });
    startEnrichPolling();
    try {
      const res = await fetch("/api/prospects/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true, limit: enrichTarget }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || t("prospects", "errorStartEnrichment"));
        dismissEnrich();
      }
      // Server returns immediately — polling handles progress tracking
    } catch {
      dismissEnrich();
      alert(t("prospects", "networkError"));
    }
  }

  const handleEnrichOne = useCallback(async (prospectId: string) => {
    setEnrichProgress({ status: "running", target: 1, enriched: 0, failed: 0, noData: 0, currentProspect: "...", startedAt: Date.now() });
    startEnrichPolling();
    try {
      const res = await fetch("/api/prospects/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || t("prospects", "errorEnrichment"));
        dismissEnrich();
      }
      // Server returns immediately — polling handles progress tracking
    } catch {
      dismissEnrich();
      alert(t("prospects", "errorEnrichment"));
    }
  }, [setEnrichProgress, startEnrichPolling, dismissEnrich, t]);

  const handleEmailClick = useCallback((p: ProspectListItem) => {
    handleSelectProspect(p);
  }, [handleSelectProspect]);

  async function handleGenerateEmail(prospectId: string) {
    setActionLoading("generate-" + prospectId);
    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      const data = await res.json();
      setGeneratedEmail({ subject: data.subject, body: data.body });
    } catch {
      alert(t("prospects", "errorGenerate"));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSendEmail(prospectId: string) {
    if (!generatedEmail) return;
    setActionLoading("send-" + prospectId);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          subject: generatedEmail.subject,
          body: generatedEmail.body,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(t("prospects", "emailSent"));
        setGeneratedEmail(null);
        fetchProspects();
      } else {
        alert(`${t("common", "error")}: ${data.error}`);
      }
    } catch {
      alert(t("prospects", "errorSend"));
    } finally {
      setActionLoading(null);
    }
  }

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Drag-to-select with range tracking + smooth auto-scroll
  const isDragging = useRef(false);
  const dragSelectMode = useRef<boolean>(true);
  const dragStartIndex = useRef<number>(-1);
  const dragLastIndex = useRef<number>(-1);
  const dragPrevIds = useRef<Set<string>>(new Set());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollSpeedRef = useRef(0);
  const rafRef = useRef<number>(0);
  const mouseYRef = useRef(0);
  const prospectsRef = useRef(prospects);
  prospectsRef.current = prospects;

  const applyDragRange = useCallback((currentIdx: number) => {
    if (dragStartIndex.current === -1 || currentIdx === dragLastIndex.current) return;
    dragLastIndex.current = currentIdx;
    const lo = Math.min(dragStartIndex.current, currentIdx);
    const hi = Math.max(dragStartIndex.current, currentIdx);
    const ps = prospectsRef.current;
    const rangeIds = new Set<string>();
    for (let i = lo; i <= hi; i++) rangeIds.add(ps[i].id);
    setSelectedIds(() => {
      const next = new Set(dragPrevIds.current);
      for (const rid of rangeIds) {
        if (dragSelectMode.current) next.add(rid); else next.delete(rid);
      }
      return next;
    });
  }, []);

  const dragPendingId = useRef<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const DRAG_THRESHOLD = 8;

  const handleDragStart = useCallback((id: string, e?: React.MouseEvent) => {
    // Don't activate drag immediately — store pending and wait for threshold
    dragPendingId.current = id;
    dragStartPos.current = { x: e?.clientX ?? 0, y: e?.clientY ?? 0 };
    isDragging.current = false;

    // Toggle the clicked checkbox immediately
    const willSelect = !selectedIds.has(id);
    dragSelectMode.current = willSelect;
    dragPrevIds.current = new Set(selectedIds);
    const idx = prospects.findIndex((p) => p.id === id);
    dragStartIndex.current = idx;
    dragLastIndex.current = idx;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (willSelect) next.add(id); else next.delete(id);
      return next;
    });
  }, [selectedIds, prospects]);

  // Single RAF loop: smooth scroll + hit-test row under cursor
  useEffect(() => {
    let lastTime = 0;
    const loop = (time: number) => {
      if (isDragging.current) {
        // Smooth scroll
        if (lastTime && scrollSpeedRef.current !== 0) {
          const dt = time - lastTime;
          window.scrollBy(0, scrollSpeedRef.current * (dt / 16));
        }
        // Hit-test: find which <tr> is under cursor
        const el = document.elementFromPoint(window.innerWidth / 3, mouseYRef.current);
        if (el) {
          const tr = el.closest("tr[data-row-idx]");
          if (tr) {
            const idx = parseInt(tr.getAttribute("data-row-idx")!, 10);
            if (!isNaN(idx)) applyDragRange(idx);
          }
        }
      }
      lastTime = time;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const handleMouseUp = () => {
      isDragging.current = false;
      dragPendingId.current = null;
      dragStartIndex.current = -1;
      dragLastIndex.current = -1;
      scrollSpeedRef.current = 0;
    };
    const handleMouseMove = (e: MouseEvent) => {
      mouseYRef.current = e.clientY;
      // Check drag threshold before activating
      if (!isDragging.current && dragPendingId.current) {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) {
          isDragging.current = true;
          dragPendingId.current = null;
        } else {
          return;
        }
      }
      if (!isDragging.current) { scrollSpeedRef.current = 0; return; }
      const edgeZone = 120;
      const viewH = window.innerHeight;
      if (e.clientY < edgeZone) {
        scrollSpeedRef.current = -Math.max(3, Math.round((edgeZone - e.clientY) / 3));
      } else if (e.clientY > viewH - edgeZone) {
        scrollSpeedRef.current = Math.max(3, Math.round((e.clientY - (viewH - edgeZone)) / 3));
      } else {
        scrollSpeedRef.current = 0;
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyDragRange]);

  const toggleSelectAll = useCallback(() => {
    startTransition(() => {
      if (selectedIds.size === displayProspects.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(displayProspects.map((p) => p.id)));
      }
    });
  }, [displayProspects, selectedIds.size]);

  // Bulk enrich selected — server-side background processing (survives page navigation)
  async function handleBulkEnrich() {
    if (selectedIds.size === 0) return;
    const allIds = Array.from(selectedIds);

    setActionLoading("bulk-enrich");
    setSelectedIds(new Set());

    try {
      const res = await fetch("/api/prospects/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: allIds }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || t("prospects", "errorStartEnrichment"));
        return;
      }

      // Server started background processing — polling will track progress
      setEnrichProgress({ status: "running", target: allIds.length, enriched: 0, failed: 0, noData: 0, currentProspect: t("prospects", "starting"), startedAt: Date.now() });
      startEnrichPolling();
    } catch (err) {
      console.error("Failed to start enrichment:", err);
      alert(t("prospects", "networkError"));
    } finally {
      setActionLoading(null);
    }
  }

  // Bulk delete
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${t("common", "delete")} ${selectedIds.size} prospect${selectedIds.size > 1 ? "s" : ""} ? ${t("prospects", "confirmDelete")}`)) return;
    setActionLoading("bulk-delete");
    try {
      const res = await fetch("/api/prospects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Delete failed");
      const data = await res.json();
      alert(`${data.deleted} prospect${data.deleted > 1 ? "s" : ""} ${data.deleted > 1 ? t("prospects", "removedPlural") : t("prospects", "removed")}`);
      setSelectedIds(new Set());
      fetchProspects();
    } catch {
      alert(t("prospects", "errorDelete"));
    } finally {
      setActionLoading(null);
    }
  }

  // Bulk assign to campaign
  const [bulkCampaignId, setBulkCampaignId] = useState("");
  async function handleBulkAssignCampaign() {
    if (selectedIds.size === 0 || !bulkCampaignId) return;
    setActionLoading("bulk-campaign");
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "bulkAssignCampaign", ids: Array.from(selectedIds), campaignId: bulkCampaignId }),
      });
      if (!res.ok) throw new Error("Assign failed");
      const data = await res.json();
      alert(`${data.assigned} prospect${data.assigned > 1 ? "s" : ""} ajouté${data.assigned > 1 ? "s" : ""} à la campagne`);
      setSelectedIds(new Set());
      setBulkCampaignId("");
      fetchProspects();
    } catch {
      alert("Erreur lors de l'assignation");
    } finally {
      setActionLoading(null);
    }
  }

  // Edit prospect
  function startEditing() {
    if (!selectedProspect) return;
    setEditing(true);
    setEditEmailGuessed(!!selectedProspect.emailGuessed);
    setEditTags(selectedProspect.tags ?? []);
    setEditData({
      companyName: selectedProspect.companyName || "",
      industry: selectedProspect.industry || "",
      city: selectedProspect.city || "",
      address: selectedProspect.address || "",
      email: selectedProspect.email || "",
      phone: selectedProspect.phone || "",
      website: selectedProspect.website || "",
      linkedinUrl: selectedProspect.linkedinUrl || "",
      contactType: selectedProspect.contactType || "prospect",
      status: selectedProspect.status || "NEW",
      notes: selectedProspect.notes || "",
      leadScore: selectedProspect.leadScore || 0,
    });
  }

  async function handleSaveEdit() {
    if (!selectedProspect) return;
    setActionLoading("save-edit");
    try {
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedProspect.id, ...editData, emailGuessed: editData.email ? editEmailGuessed : false, tags: editTags }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      setSelectedProspect({ ...selectedProspect, ...updated });
      setEditing(false);
      fetchProspects();
    } catch {
      alert(t("prospects", "errorEdit"));
    } finally {
      setActionLoading(null);
    }
  }

  // Import handlers
  const IMPORT_FIELDS = [
    { key: "companyName", label: t("prospects", "fieldCompany") },
    { key: "industry", label: t("prospects", "fieldIndustry") },
    { key: "city", label: t("prospects", "fieldCity") },
    { key: "address", label: t("prospects", "fieldAddress") },
    { key: "googleMapsUrl", label: t("prospects", "fieldGmapsUrl") },
    { key: "phone", label: t("prospects", "fieldPhone") },
    { key: "email", label: t("prospects", "fieldEmail") },
    { key: "website", label: t("prospects", "fieldWebsite") },
    { key: "contactType", label: t("prospects", "fieldContactType") },
    { key: "notes", label: t("prospects", "fieldNotes") },
  ];

  function deduplicateColumns(cols: string[]): string[] {
    const seen = new Map<string, number>();
    return cols.map((c) => {
      const name = c || "Colonne";
      const count = seen.get(name) || 0;
      seen.set(name, count + 1);
      return count > 0 ? `${name} (${count + 1})` : name;
    });
  }

  async function handleFileUpload(file: File) {
    setImportError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const text = await file.text();
        const Papa = (await import("papaparse")).default;
        const result = Papa.parse(text, { header: false, skipEmptyLines: true });
        const rows = result.data as string[][];
        if (rows.length < 2) {
          setImportError(t("prospects", "fileError"));
          return;
        }
        const columns = deduplicateColumns(rows[0].map((c) => c.trim()));
        setImportFileColumns(columns);
        setImportFileRows(rows.slice(1));
        autoMapColumns(columns);
        setImportStep("mapping");
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
        if (rows.length < 2) {
          setImportError(t("prospects", "fileError"));
          return;
        }
        const columns = deduplicateColumns((rows[0] as string[]).map((c) => String(c).trim()));
        setImportFileColumns(columns);
        setImportFileRows(rows.slice(1).map((r) => (r as string[]).map((c) => String(c))));
        autoMapColumns(columns);
        setImportStep("mapping");
      } else {
        setImportError(t("prospects", "unsupportedFormat"));
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t("prospects", "errorFileRead"));
    }
  }

  function autoMapColumns(columns: string[]) {
    const map: Record<string, string> = {};
    const patterns: Record<string, RegExp> = {
      companyName: /entreprise|company|nom|name|raison.?sociale|société|societe|business/i,
      industry: /industrie|industry|secteur|domaine|activité|activite/i,
      city: /ville|city|municipalit/i,
      address: /adresse|address|rue|street/i,
      phone: /t[eé]l[eé]phone|phone|tel|cell|mobile|fax/i,
      email: /email|courriel|e-mail|mail/i,
      website: /^(?!.*google.*maps).*(?:site|web|url|http|www|lien)/i,
      googleMapsUrl: /google.*maps|maps.*url|maps.*link|maps.*lien|href/i,
      contactType: /type|cat[eé]gorie|statut/i,
      notes: /note|commentaire|description|remarque|info/i,
    };
    for (const [field, regex] of Object.entries(patterns)) {
      const idx = columns.findIndex((c) => regex.test(c));
      if (idx !== -1) {
        map[field] = columns[idx];
      }
    }
    setImportColumnMap(map);
  }

  function cleanProspectData(prospect: Record<string, string | null | boolean>) {
    const URL_RE = /^https?:\/\/|^www\./i;
    const GOOGLE_MAPS_RE = /google\.\w+\/maps|maps\.google|goo\.gl\/maps/i;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_RE = /^[\d()\s.+\-]{7,20}$/;

    // Scan all text fields for misplaced data
    const textFields = ["phone", "address", "notes", "industry", "city"] as const;
    for (const field of textFields) {
      const val = prospect[field] as string | null;
      if (!val || typeof val !== "string") continue;

      // URL or Google Maps link in a non-website field
      if ((URL_RE.test(val) || GOOGLE_MAPS_RE.test(val)) && !prospect.website) {
        prospect.website = val.startsWith("www.") ? "https://" + val : val;
        prospect[field] = null;
        continue;
      }

      // Email in a non-email field
      if (EMAIL_RE.test(val) && !prospect.email) {
        prospect.email = val;
        prospect[field] = null;
        continue;
      }

      // If a "phone" field contains a URL, move it and clear phone
      if (field === "phone" && (URL_RE.test(val) || GOOGLE_MAPS_RE.test(val))) {
        if (!prospect.website) {
          prospect.website = val.startsWith("www.") ? "https://" + val : val;
        } else if (!prospect.notes) {
          prospect.notes = val;
        }
        prospect.phone = null;
        continue;
      }
    }

    // Ensure website has protocol
    if (prospect.website && typeof prospect.website === "string" && !/^https?:\/\//i.test(prospect.website)) {
      prospect.website = "https://" + prospect.website;
    }

    // Clean phone: only keep if it looks like a phone number
    if (prospect.phone && typeof prospect.phone === "string" && !PHONE_RE.test(prospect.phone.replace(/\s/g, ""))) {
      // Not a valid phone — might be a URL or other data
      if (URL_RE.test(prospect.phone) && !prospect.website) {
        prospect.website = (prospect.phone as string).startsWith("www.") ? "https://" + prospect.phone : prospect.phone;
      }
      prospect.phone = null;
    }

    return prospect;
  }

  function applyColumnMapping() {
    const mapped = importFileRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => {
        const prospect: Record<string, string | null | boolean> = {};
        for (const field of IMPORT_FIELDS) {
          const col = importColumnMap[field.key];
          if (col) {
            const idx = importFileColumns.indexOf(col);
            prospect[field.key] = idx !== -1 ? row[idx]?.trim() || null : null;
          } else {
            prospect[field.key] = null;
          }
        }
        // Also grab any unmapped columns into notes
        const mappedCols = new Set(Object.values(importColumnMap).filter(Boolean));
        const extraParts: string[] = [];
        for (let i = 0; i < importFileColumns.length; i++) {
          if (!mappedCols.has(importFileColumns[i]) && row[i]?.trim()) {
            extraParts.push(`${importFileColumns[i]}: ${row[i].trim()}`);
          }
        }
        if (extraParts.length > 0) {
          const existing = prospect.notes ? prospect.notes + " | " : "";
          prospect.notes = existing + extraParts.join(" | ");
        }

        cleanProspectData(prospect);
        prospect._selected = true;
        return prospect;
      })
      .filter((p) => p.companyName);

    if (mapped.length === 0) {
      setImportError(t("prospects", "noProspectFoundImport"));
      return;
    }
    setImportParsed(mapped as typeof importParsed);
    setImportStep("preview");
    setImportError(null);
  }

  async function handleImportParse() {
    if (!importText.trim()) return;
    setImportParsing(true);
    setImportError(null);
    setImportParsed(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/prospects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "parse", rawText: importText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common", "error"));
      setImportParsed(data.prospects.map((p: Record<string, unknown>) => ({ ...p, _selected: true })));
      setImportStep("preview");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t("prospects", "errorImportParse"));
    } finally {
      setImportParsing(false);
    }
  }

  async function handleImportSave() {
    if (!importParsed) return;
    const toSave = importParsed.filter((p) => p._selected !== false);
    if (toSave.length === 0) return;
    setImportSaving(true);
    setImportError(null);
    try {
      const res = await fetch("/api/prospects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "save", prospects: toSave, dedupMode: importDedupMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common", "error"));
      setImportResult({ created: data.created, skipped: data.skipped });
      setImportStep("done");
      fetchProspects();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t("prospects", "errorImportSave"));
    } finally {
      setImportSaving(false);
    }
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportText("");
    setImportParsed(null);
    setImportError(null);
    setImportResult(null);
    setImportFileColumns([]);
    setImportFileRows([]);
    setImportColumnMap({});
    setImportStep("input");
    setImportDedupMode("companyName_city");
  }

  function toggleImportProspect(index: number) {
    if (!importParsed) return;
    const updated = [...importParsed];
    updated[index] = { ...updated[index], _selected: !updated[index]._selected };
    setImportParsed(updated);
  }

  // Filter reset
  const hasSegmentFilters = !!(formFilter || industryGroupFilter || crmFilter || reachFilter || minScoreFilter || reviewsFilter || ownerFilter || tagFilter || minChanceFilter || engagementFilter || callbackFilter || ageFilter || yearFrom || yearTo || ageSureOnly);
  const hasFilters = statusFilter || cityFilter || sourceFilter || contactTypeFilter || campaignFilter || hasSegmentFilters || debouncedSearch || searchQuery;

  // Répartition A / B des résultats affichés (selon le formulaire de contact)
  const segmentSplit = useMemo(() => {
    let a = 0, b = 0, unknown = 0;
    for (const p of displayProspects) {
      if (p.contactFormStatus === "HAS_FORM") a++;
      else if (p.contactFormStatus === "NO_FORM" || p.contactFormStatus === "NO_WEBSITE") b++;
      else unknown++;
    }
    return { a, b, unknown };
  }, [displayProspects]);

  function resetSegmentFilters() {
    setFormFilter("");
    setIndustryGroupFilter("");
    setCrmFilter("");
    setReachFilter("");
    setMinScoreFilter("");
    setReviewsFilter("");
    setOwnerFilter("");
    setTagFilter("");
    setMinChanceFilter("");
    setEngagementFilter("");
    setCallbackFilter(false);
    setAgeFilter("");
    setYearFrom("");
    setYearTo("");
    setAgeSureOnly(false);
  }

  // ─── Année d'immatriculation (IA) ───
  const fetchRegStats = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/find-registration");
      if (res.ok) setRegStats(await res.json());
    } catch { /* silencieux */ }
  }, []);
  useEffect(() => { fetchRegStats(); }, [fetchRegStats]);

  async function runRegistrationSearch(ids?: string[], discovery?: { batchId: string; campaignId?: string; total: number }) {
    regStopRef.current = false;
    const total = discovery ? discovery.total : ids ? ids.length : regStats?.remaining ?? 0;
    let added: number | null = null;
    let matched: number | null = null;
    setRegRun({ processed: 0, found: 0, total });
    let processed = 0;
    let found = 0;
    try {
      for (let i = 0; i < 1000 && !regStopRef.current; i++) {
        const res = await fetch("/api/prospects/find-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discovery ? { batchId: discovery.batchId, campaignId: discovery.campaignId } : ids ? { ids } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        processed += data.processed;
        found += data.counts?.found ?? 0;
        if (data.addedToCampaign != null) { added = data.addedToCampaign; matched = data.matched; }
        setRegRun({ processed, found, total });
        if (data.remaining === 0 || data.processed === 0) break;
        if (data.stalled) throw new Error("L'IA ne répond pas (vérifier ANTHROPIC_API_KEY et le crédit Anthropic)");
      }
      await fetchProspects();
      if (discovery?.campaignId && added != null) {
        alert(`Ciblage par âge : ${matched} prospect(s) de la découverte ont l'âge voulu ; ${added} ajouté(s) à la campagne. Les autres restent dans Prospects (filtre « Âge »).`);
      }
    } catch (error) {
      alert(`Recherche de l'année interrompue : ${error instanceof Error ? error.message : "erreur"}`);
    } finally {
      setRegRun(null);
      fetchRegStats();
    }
  }

  // ─── Propriétaires (IA) ───
  const fetchOwnerStats = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/find-owners");
      if (res.ok) setOwnerStats(await res.json());
    } catch { /* silencieux */ }
  }, []);
  useEffect(() => { fetchOwnerStats(); }, [fetchOwnerStats]);

  async function runOwnerSearch(ids?: string[]) {
    ownerStopRef.current = false;
    const total = ids ? ids.length : ownerStats?.remaining ?? 0;
    setOwnerRun({ processed: 0, found: 0, total });
    let processed = 0;
    let found = 0;
    try {
      for (let i = 0; i < 1000 && !ownerStopRef.current; i++) {
        const res = await fetch("/api/prospects/find-owners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ids ? { ids } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        processed += data.processed;
        found += data.counts?.found ?? 0;
        setOwnerRun({ processed, found, total });
        if (data.remaining === 0 || data.processed === 0) break;
        if (data.stalled) throw new Error("L'IA ne répond pas (vérifier ANTHROPIC_API_KEY et le crédit Anthropic)");
      }
      await fetchProspects();
    } catch (error) {
      alert(`Recherche des propriétaires interrompue : ${error instanceof Error ? error.message : "erreur"}`);
    } finally {
      setOwnerRun(null);
      fetchOwnerStats();
    }
  }

  const fetchIndustryGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/industry-groups");
      if (res.ok) setIndustryGroups((await res.json()).groups || []);
    } catch { /* silencieux */ }
  }, []);
  useEffect(() => { fetchIndustryGroups(); }, [fetchIndustryGroups]);

  // ─── Segmentation par formulaire de contact ───
  const fetchFormStats = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/detect-forms");
      if (res.ok) setFormStats(await res.json());
    } catch { /* silencieux */ }
  }, []);
  useEffect(() => { fetchFormStats(); }, [fetchFormStats]);

  async function runFormDetection() {
    setFormDetectRunning(true);
    try {
      // Lots successifs côté serveur jusqu'à ce que tous les prospects soient classés
      for (let i = 0; i < 500; i++) {
        const res = await fetch("/api/prospects/detect-forms", { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { processed: number; remaining: number } = await res.json();
        await fetchFormStats();
        if (data.remaining === 0 || data.processed === 0) break;
      }
      await fetchProspects();
    } catch (error) {
      console.error("Form detection failed:", error);
    } finally {
      setFormDetectRunning(false);
    }
  }

  function resetFilters() {
    setStatusFilter("");
    setCityFilter("");
    setSourceFilter("");
    setContactTypeFilter("");
    setCampaignFilter("");
    resetSegmentFilters();
    setSearchQuery("");
    setDebouncedSearch("");
     }

  // Ctrl+F handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindBar(true);
        setTimeout(() => findInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && showFindBar) {
        setShowFindBar(false);
        setFindQuery("");
        setFindMatchIndex(0);
        setFindMatchCount(0);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showFindBar]);

  // Highlight and count matches when findQuery changes
  useEffect(() => {
    if (!tableRef.current || !findQuery.trim()) {
      setFindMatchCount(0);
      setFindMatchIndex(0);
      return;
    }

    const q = findQuery.toLowerCase();
    const cells = tableRef.current.querySelectorAll("td");
    let count = 0;
    const matchElements: Element[] = [];

    cells.forEach((cell) => {
      // Remove old highlights
      const existing = cell.querySelectorAll("mark[data-find]");
      existing.forEach((m) => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent || ""), m);
          parent.normalize();
        }
      });
    });

    if (!q) return;

    cells.forEach((cell) => {
      // Skip checkbox/button cells
      if (cell.querySelector("input, button, svg")) return;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node;
      while ((node = walker.nextNode())) textNodes.push(node as Text);

      for (const textNode of textNodes) {
        const text = textNode.textContent || "";
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) continue;

        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + q.length);
        const after = text.slice(idx + q.length);

        const mark = document.createElement("mark");
        mark.setAttribute("data-find", "true");
        mark.setAttribute("data-find-index", String(count));
        mark.className = "bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white rounded-sm px-0.5";
        mark.textContent = match;

        const parent = textNode.parentNode;
        if (parent) {
          if (before) parent.insertBefore(document.createTextNode(before), textNode);
          parent.insertBefore(mark, textNode);
          if (after) parent.insertBefore(document.createTextNode(after), textNode);
          parent.removeChild(textNode);
        }

        matchElements.push(mark);
        count++;
      }
    });

    setFindMatchCount(count);
    if (count > 0) {
      setFindMatchIndex((prev) => Math.min(prev, count - 1));
    }
  }, [findQuery, prospects]);

  // Scroll to current match
  useEffect(() => {
    if (!tableRef.current || findMatchCount === 0) return;
    const marks = tableRef.current.querySelectorAll("mark[data-find]");
    marks.forEach((m, i) => {
      if (i === findMatchIndex) {
        (m as HTMLElement).className = "bg-orange-400 dark:bg-orange-500 text-white rounded-sm px-0.5 ring-2 ring-orange-500";
        m.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        (m as HTMLElement).className = "bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white rounded-sm px-0.5";
      }
    });
  }, [findMatchIndex, findMatchCount]);

  function closeFindBar() {
    setShowFindBar(false);
    setFindQuery("");
    setFindMatchIndex(0);
    setFindMatchCount(0);
    // Clean up highlights
    if (tableRef.current) {
      const marks = tableRef.current.querySelectorAll("mark[data-find]");
      marks.forEach((m) => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent || ""), m);
          parent.normalize();
        }
      });
    }
  }

  // Sort indicator
  function SortIcon({ field }: { field: string }) {
    if (sortBy !== field) return <ArrowUpDown className="inline w-3.5 h-3.5 text-foreground-muted/50 ml-1" />;
    return sortOrder === "desc" ? <ArrowDown className="inline w-3.5 h-3.5 text-primary ml-1" /> : <ArrowUp className="inline w-3.5 h-3.5 text-primary ml-1" />;
  }

  // More actions dropdown
  const [showMoreActions, setShowMoreActions] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showMoreActions) return;
    function handleClick(e: MouseEvent) {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) setShowMoreActions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMoreActions]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("prospects", "title")}</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {total} {total !== 1 ? t("prospects", "totalCountPlural") : t("prospects", "totalCount")} {t("common", "total")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-1">
            <div className="relative group rounded-md border border-border bg-card px-2.5 py-1 text-center cursor-default">
              <p className="text-[9px] font-medium text-foreground-muted uppercase tracking-wide">{t("prospects", "discoveriesToday")}</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{scrapedToday}</p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50">
                <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 whitespace-nowrap text-xs text-foreground-muted">
                  <p className="mb-1.5">{scrapedToday} / {dailyDiscoveryLimit} {t("prospects", "discoveriesToday").toLowerCase()}</p>
                  <Link href="/settings?section=subscription" className="text-primary hover:underline font-medium">
                    {t("prospects", "seePlans")}
                  </Link>
                </div>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-2.5 py-1 text-center">
              <p className="text-[9px] font-medium text-foreground-muted uppercase tracking-wide">{t("prospects", "enrichedToday")}</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{enrichedToday}</p>
            </div>
          </div>
          <button
            onClick={() => setShowDiscoverConfirm(true)}
            disabled={actionLoading === "discover"}
            className="bg-primary text-white px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {actionLoading === "discover" ? t("prospects", "discovering") : t("prospects", "discover")}
          </button>
          <button
            onClick={() => setShowEnrichConfirm(true)}
            disabled={actionLoading === "enrich"}
            className="border border-border bg-card text-foreground px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-card-hover disabled:opacity-50"
          >
            {actionLoading === "enrich" ? t("prospects", "enriching") : t("prospects", "enrich")}
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="border border-border bg-card text-foreground-secondary px-3 py-1.5 rounded-md text-sm font-medium hover:bg-card-hover flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {t("prospects", "importBtn")}
          </button>
          {/* More actions dropdown */}
          <div className="relative" ref={moreActionsRef}>
            <button
              onClick={() => setShowMoreActions(!showMoreActions)}
              className="border border-border bg-card text-foreground-secondary px-2.5 py-1.5 rounded-md text-sm hover:bg-card-hover"
              title="Plus d'actions"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
            </button>
            {showMoreActions && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={() => { setShowMoreActions(false); setShowFindBar(true); setTimeout(() => findInputRef.current?.focus(), 50); }}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-card-hover flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  {t("prospects", "quickSearch")}
                </button>
                <button
                  onClick={() => { setShowMoreActions(false); handleDeduplicate(); }}
                  disabled={actionLoading === "deduplicate"}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-card-hover flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  {actionLoading === "deduplicate" ? t("prospects", "removingDuplicates") : t("prospects", "removeDuplicates")}
                </button>
                <button
                  onClick={() => { setShowMoreActions(false); handleCleanupIrrelevant(); }}
                  disabled={actionLoading === "cleanup-irrelevant"}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-card-hover flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                  {actionLoading === "cleanup-irrelevant" ? "Nettoyage..." : "Nettoyer non pertinents"}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { setShowMoreActions(false); fetchProspects(); }}
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-card-hover flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Rafraîchir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discover confirmation modal */}
      {showDiscoverConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDiscoverConfirm(false)}>
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">{t("prospects", "confirmDiscovery")}</h2>
              <p className="text-sm text-foreground-muted mt-1">{t("prospects", "discoveryParams")}</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Nombre de prospects */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-2 uppercase tracking-wide">{t("prospects", "prospectCount")}</p>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[100, 250, 500, 1000, 2000, 3000, 4000, 5000].map((n) => (
                    <button
                      key={n}
                      onClick={() => setDiscoverTarget(n)}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        discoverTarget === n
                          ? "bg-primary text-white"
                          : "bg-background-subtle text-foreground-secondary hover:bg-background-muted"
                      }`}
                    >
                      {n >= 1000 ? `${n / 1000}k` : n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-foreground-muted shrink-0">{t("common", "custom")}:</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={discoverTarget}
                    onChange={(e) => setDiscoverTarget(Math.min(5000, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-24 border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
                  />
                </div>
              </div>

              {/* Villes */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  {t("prospects", "targetedCities")} ({targetingCities.length})
                </p>
                {targetingCities.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {targetingCities.map((c) => (
                      <span key={c} className="px-2 py-0.5 bg-success-subtle text-success border border-success/20 rounded text-xs">{c}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-warning">{t("prospects", "noCitiesConfigured")}</p>
                )}
              </div>

              {/* Mots-clés */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  {t("prospects", "keywords")} ({targetingKeywords.length})
                </p>
                {targetingKeywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {targetingKeywords.map((k) => (
                      <span key={k} className="px-2 py-0.5 bg-primary-subtle text-primary border border-primary/20 rounded text-xs">{k}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-warning">{t("prospects", "noKeywordsConfigured")}</p>
                )}
              </div>

              {/* Requêtes */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  {t("prospects", "searchQueries")} ({targetingQueries.length})
                </p>
                {targetingQueries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {targetingQueries.map((q) => (
                      <span key={q} className="px-2 py-0.5 bg-background-muted text-foreground-secondary border border-border rounded text-xs">{q}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-foreground-muted">{t("prospects", "noCustomQueries")}</p>
                )}
              </div>

              {/* Âge de l'entreprise */}
              {targetingAge && (
                <div>
                  <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">Âge de l&apos;entreprise</p>
                  <span className="px-2 py-0.5 bg-warning-subtle text-warning border border-warning/20 rounded text-xs">
                    {({ lt3: "Moins de 3 ans", gte3: "3 ans et plus", lt5: "Moins de 5 ans", gte5: "5 ans et plus", gte10: "10 ans et plus" } as Record<string, string>)[targetingAge] ?? targetingAge}
                  </span>
                  <p className="text-[11px] text-foreground-muted mt-1">
                    Après la découverte, l&apos;IA cherche l&apos;année des nouveaux prospects ; seuls ceux qui correspondent sont ajoutés à la campagne. Modifiable dans Paramètres → Ciblage.
                  </p>
                </div>
              )}

              {/* Add to campaign */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  {t("prospects", "addToCampaign")}
                </p>
                <select
                  value={discoverCampaignId}
                  onChange={(e) => setDiscoverCampaignId(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                >
                  <option value="">{t("prospects", "noCampaignSelected")}</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.number} — {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-foreground-muted mt-1">{t("prospects", "addToCampaignDesc")}</p>
              </div>

              {/* Google Maps manual */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-foreground-muted uppercase">{t("prospects", "orGoogleMaps")}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <p className="text-xs text-foreground-muted mb-2">{t("prospects", "googleMapsDesc")}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t("prospects", "keywordPlaceholder")}
                    value={discoverKeyword}
                    onChange={(e) => setDiscoverKeyword(e.target.value)}
                    className="flex-1 border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                  />
                  <select
                    value={discoverProvince}
                    onChange={(e) => setDiscoverProvince(e.target.value)}
                    className="border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                  >
                    <option value="">{t("prospects", "province")}</option>
                    {provinces.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    if (!discoverKeyword.trim() || !discoverProvince) return;
                    fetch(`/api/cities?province=${discoverProvince}&keyword=${encodeURIComponent(discoverKeyword.trim())}&limit=50`)
                      .then((r) => r.json())
                      .then((data) => {
                        setGmapsCities(data.cities || []);
                        setShowGmapsPanel(true);
                        setShowDiscoverConfirm(false);
                      })
                      .catch(() => {});
                  }}
                  disabled={!discoverKeyword.trim() || !discoverProvince}
                  className="w-full mt-2 bg-primary text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {t("prospects", "generateGmapsLinks")}
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowDiscoverConfirm(false)}
                className="px-4 py-2 rounded-md text-sm font-medium text-foreground-secondary hover:bg-background-subtle"
              >
                {t("common", "cancel")}
              </button>
              <button
                onClick={() => {
                  setShowDiscoverConfirm(false);
                  handleDiscover("");
                }}
                disabled={targetingCities.length === 0 && targetingKeywords.length === 0}
                className="bg-primary text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
              >
                {t("prospects", "launchDiscovery")} ({discoverTarget})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrich confirmation modal */}
      {showEnrichConfirm && (() => {
        const newProspects = prospects.filter((p) => p.status === "NEW");
        const newCount = newProspects.length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowEnrichConfirm(false)}>
            <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">{t("prospects", "confirmEnrichment")}</h2>
                <p className="text-sm text-foreground-muted mt-1">
                  {newCount > 0
                    ? `${newCount} prospect${newCount > 1 ? "s" : ""} ${newCount > 1 ? t("prospects", "unenrichedAvailablePlural") : t("prospects", "unenrichedAvailable")} ${newCount > 1 ? t("prospects", "availablePlural") : t("prospects", "available")}`
                    : t("prospects", "noProspectsToEnrich")}
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-foreground-muted mb-2 uppercase tracking-wide">{t("prospects", "prospectsToEnrichCount")}</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[100, 250, 500, 1000, 2000, 3000, 4000, 5000].map((n) => (
                      <button
                        key={n}
                        onClick={() => setEnrichTarget(n)}
                        className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                          enrichTarget === n
                            ? "bg-primary text-white"
                            : "bg-background-subtle text-foreground-secondary hover:bg-background-muted"
                        }`}
                      >
                        {n >= 1000 ? `${n / 1000}k` : n}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-foreground-muted shrink-0">{t("common", "custom")}:</label>
                    <input
                      type="number"
                      min={1}
                      max={newCount || 5000}
                      value={enrichTarget}
                      onChange={(e) => setEnrichTarget(Math.min(newCount || 5000, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-24 border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
                    />
                  </div>
                </div>

                {newCount > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                      {t("prospects", "prospectsToEnrich")} ({Math.min(enrichTarget, newCount)})
                    </p>
                    <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                      {newProspects.slice(0, enrichTarget).map((p) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0">
                          <div>
                            <p className="text-sm text-foreground font-medium">{p.companyName}</p>
                            {p.city && <p className="text-xs text-foreground-muted">{p.city}</p>}
                          </div>
                          <span className="text-xs text-foreground-muted tabular-nums">{p.leadScore}</span>
                        </div>
                      ))}
                      {newCount > enrichTarget && (
                        <div className="px-3 py-2 text-xs text-foreground-muted text-center">
                          {t("common", "and")} {newCount - enrichTarget} {newCount - enrichTarget > 1 ? t("prospects", "othersPlural") : t("prospects", "others")}...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-border flex gap-3 justify-end">
                <button
                  onClick={() => setShowEnrichConfirm(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium text-foreground-secondary hover:bg-background-subtle"
                >
                  {t("common", "cancel")}
                </button>
                <button
                  onClick={handleEnrichBatch}
                  disabled={newCount === 0}
                  className="bg-primary text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
                >
                  {t("prospects", "launchEnrichment")} ({Math.min(enrichTarget, newCount)})
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Google Maps city links panel */}
      {showGmapsPanel && gmapsCities.length > 0 && (
        <div className="mb-4 bg-card border border-border rounded-md p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Google Maps — &quot;{discoverKeyword}&quot; ({gmapsCities.length} villes)
              </h3>
              <p className="text-xs text-foreground-muted mt-0.5">
                {t("prospects", "gmapsOpenAndScrape")}
              </p>
            </div>
            <button
              onClick={() => { setShowGmapsPanel(false); setGmapsCities([]); }}
              className="text-foreground-muted hover:text-foreground"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {gmapsCities.map((city, i) => (
              <a
                key={i}
                href={city.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-background-subtle rounded-md border border-border hover:border-border-strong text-sm group transition-colors"
              >
                <svg className="w-4 h-4 text-foreground-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-foreground-secondary group-hover:text-foreground truncate">{city.name}</span>
                <span className="text-xs text-foreground-muted ml-auto shrink-0">{city.population?.toLocaleString(locale === "en" ? "en-CA" : "fr-CA")} {t("prospects", "inhabitants")}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Discovery progress */}
      {discoverProgress && (
        <JobProgressBar
          data={{
            type: "discovery",
            status: discoverProgress.status === "done" ? "completed"
              : discoverProgress.status === "error" ? "failed"
              : discoverProgress.status === "cancelled" ? "cancelled"
              : "running",
            title: discoverProgress.status === "running"
              ? t("prospects", "searchInProgress")
              : discoverProgress.status === "done"
                ? t("prospects", "searchComplete")
                : discoverProgress.status === "cancelled"
                  ? t("prospects", "searchStopped")
                  : t("prospects", "searchError"),
            stepLabel: discoverProgress.currentCity
              ? `${t("prospects", "analysis")} : ${discoverProgress.currentCity}`
              : "",
            processed: discoverProgress.newCount,
            total: discoverProgress.target,
            startedAt: discoverProgress.startedAt,
            currentStep: discoverProgress.completedCities + 1,
            totalSteps: discoverProgress.totalCities,
            stepUnit: t("prospects", "city"),
            secondaryLabel: `${discoverProgress.found} ${t("prospects", "found")}, ${discoverProgress.newCount} ${t("prospects", "newOnes")}${discoverProgress.filteredOut ? `, ${discoverProgress.filteredOut} non pertinents` : ""}${discoverProgress.filterPhase ? ` — ${discoverProgress.filterPhase}` : ""}${discoverProgress.round > 1 ? ` (round ${discoverProgress.round})` : ""}`,
            error: discoverProgress.status === "error" ? t("prospects", "errorDuringSearch") : undefined,
          }}
          onStop={async () => {
            try { await fetch("/api/prospects/discover", { method: "DELETE" }); } catch {}
          }}
          onDismiss={() => setDiscoverProgress(null)}
        />
      )}

      {/* Enrich progress */}
      {enrichProgress && (() => {
        const enrichProcessed = enrichProgress.enriched + enrichProgress.failed + enrichProgress.noData;
        return (
          <JobProgressBar
            data={{
              type: "enrichment",
              status: enrichProgress.status === "done" ? "completed"
                : enrichProgress.status === "cancelled" ? "cancelled"
                : "running",
              title: enrichProgress.status === "running"
                ? t("prospects", "enrichmentInProgress")
                : enrichProgress.status === "done"
                  ? t("prospects", "enrichmentComplete")
                  : t("prospects", "enrichmentStopped"),
              stepLabel: enrichProgress.currentProspect
                ? `${t("prospects", "enrich")} : ${enrichProgress.currentProspect}`
                : "",
              processed: enrichProcessed,
              total: enrichProgress.target,
              startedAt: enrichProgress.startedAt,
              currentStep: enrichProcessed + 1,
              totalSteps: enrichProgress.target,
              stepUnit: "Prospect",
              secondaryLabel: `${enrichProgress.enriched} ${enrichProgress.enriched !== 1 ? t("prospects", "enrichedPlural") : t("prospects", "enriched")}${enrichProgress.noData > 0 ? `, ${enrichProgress.noData} ${t("prospects", "noData")}` : ""}${enrichProgress.failed > 0 ? `, ${enrichProgress.failed} ${enrichProgress.failed !== 1 ? t("prospects", "failedPlural") : t("prospects", "failed")}` : ""}`,
            }}
            onStop={stopEnrichment}
            onDismiss={dismissEnrich}
          />
        );
      })()}

      {/* Cleanup progress bar */}
      {cleanupProgress && cleanupProgress.status !== "idle" && (
        <JobProgressBar
          data={{
            type: "enrichment",
            status: cleanupProgress.status === "done" ? "completed"
              : cleanupProgress.status === "cancelled" ? "cancelled"
              : "running",
            title: cleanupProgress.status === "running"
              ? "Nettoyage non pertinents en cours..."
              : cleanupProgress.status === "done"
                ? `Nettoyage terminé — ${cleanupProgress.archived} supprimé${cleanupProgress.archived !== 1 ? "s" : ""}`
                : "Nettoyage arrêté",
            stepLabel: cleanupProgress.currentProspect
              ? `Vérification : ${cleanupProgress.currentProspect}`
              : "",
            processed: cleanupProgress.checked,
            total: cleanupProgress.total,
            startedAt: cleanupProgress.startedAt,
            currentStep: cleanupProgress.checked + 1,
            totalSteps: cleanupProgress.total,
            stepUnit: "Prospect",
            secondaryLabel: `${cleanupProgress.checked} vérifiés, ${cleanupProgress.archived} non pertinent${cleanupProgress.archived !== 1 ? "s" : ""}`,
          }}
          onStop={stopCleanup}
          onDismiss={() => setCleanupProgress(null)}
        />
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("prospects", "searchPlaceholder")}
            className="w-full border border-border rounded-md px-3 py-2 text-sm pl-9 bg-background text-foreground"
          />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
              className="absolute right-2.5 top-2.5 h-4 w-4 flex items-center justify-center rounded-full bg-foreground-muted/20 hover:bg-foreground-muted/40 transition-colors"
            >
              <svg className="h-3 w-3 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="">{t("prospects", "allStatuses")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{t("status", s as "NEW") || s}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="">{t("prospects", "allSources")}</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={contactTypeFilter}
          onChange={(e) => { setContactTypeFilter(e.target.value); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="">{t("prospects", "allTypes")}</option>
          {CONTACT_TYPE_OPTIONS.map((ct) => (
            <option key={ct} value={ct}>{t("contactType", ct as "prospect") || ct}</option>
          ))}
        </select>
        <select
          value={campaignFilter}
          onChange={(e) => { setCampaignFilter(e.target.value); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="">Toutes les campagnes</option>
          <option value="none">Aucune campagne</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>#{c.number} — {c.name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="text-sm text-danger hover:text-danger/80 px-2 py-1"
          >
            {t("common", "reset")}
          </button>
        )}
      </div>

      {/* Segmentation — filtres combinables pour séparer les listes (A / B, métier, CRM…) */}
      <div className="flex flex-wrap gap-3 mb-4 items-center p-3 rounded-md border border-border bg-background-subtle/40">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mr-1">Segmentation</span>
        <select
          value={industryGroupFilter}
          onChange={(e) => setIndustryGroupFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", industryGroupFilter && "border-primary text-primary")}
          title="Grand métier (regroupe les catégories Google similaires)"
        >
          <option value="">Tous les métiers</option>
          {industryGroups.map((g) => (
            <option key={g.key} value={g.key}>{g.label} ({g.count})</option>
          ))}
        </select>
        <select
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", formFilter && "border-primary text-primary")}
          title="Segment selon le formulaire de contact du site"
        >
          <option value="">Message A et B</option>
          <option value="HAS_FORM">A — avec formulaire{formStats ? ` (${formStats.hasForm})` : ""}</option>
          <option value="NO_FORM_ANY">B — sans formulaire ou sans site{formStats ? ` (${formStats.noForm + formStats.noWebsite})` : ""}</option>
          <option value="NO_FORM">B · site sans formulaire{formStats ? ` (${formStats.noForm})` : ""}</option>
          <option value="NO_WEBSITE">B · sans site web{formStats ? ` (${formStats.noWebsite})` : ""}</option>
          <option value="UNREACHABLE">Site inaccessible{formStats ? ` (${formStats.unreachable})` : ""}</option>
          <option value="unknown">Pas encore analysés{formStats ? ` (${formStats.remaining})` : ""}</option>
        </select>
        <select
          value={crmFilter}
          onChange={(e) => setCrmFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", crmFilter && "border-primary text-primary")}
          title="CRM concurrent détecté sur le site (Jobber, Housecall Pro…)"
        >
          <option value="">CRM : tous</option>
          <option value="any">Utilise un CRM concurrent{formStats ? ` (${formStats.competitorCrm})` : ""}</option>
          <option value="none">Aucun CRM détecté</option>
        </select>
        <select
          value={reachFilter}
          onChange={(e) => setReachFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", reachFilter && "border-primary text-primary")}
          title="Comment joindre le prospect"
        >
          <option value="">Contact : tous</option>
          <option value="email_real">Courriel réel (cold email)</option>
          <option value="email_guessed">Courriel deviné</option>
          <option value="coldcall">Liste d&apos;appels (tél. sans courriel réel)</option>
          <option value="no_email">Aucun courriel</option>
        </select>
        <select
          value={reviewsFilter}
          onChange={(e) => setReviewsFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", reviewsFilter && "border-primary text-primary")}
          title="Taille estimée selon le nombre d'avis Google"
        >
          <option value="">Taille : toutes</option>
          <option value="ideal">Idéale (20–300 avis)</option>
          <option value="small">Petite (&lt; 20 avis)</option>
          <option value="large">Grande (&gt; 300 avis)</option>
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", ownerFilter && "border-primary text-primary")}
          title="Nom du propriétaire trouvé par l'IA sur le site web"
        >
          <option value="">Propriétaire : tous</option>
          <option value="found">Propriétaire trouvé{ownerStats ? ` (${ownerStats.found})` : ""}</option>
          <option value="not_found">Non trouvé{ownerStats ? ` (${ownerStats.notFound})` : ""}</option>
          <option value="pending">Pas encore cherché</option>
        </select>
        {tagDefs.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", tagFilter && "border-primary text-primary")}
            title="Tags créés dans Paramètres → Prospects"
          >
            <option value="">Tag : tous</option>
            {tagDefs.map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
          </select>
        )}
        <select
          value={ageFilter}
          onChange={(e) => setAgeFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", ageFilter && "border-primary text-primary")}
          title="Âge de l'entreprise selon l'année d'immatriculation trouvée par l'IA"
        >
          <option value="">Âge : tous</option>
          <option value="lt3">Moins de 3 ans{regStats ? ` (${regStats.recent})` : ""}</option>
          <option value="gte3">3 ans et plus{regStats ? ` (${regStats.older})` : ""}</option>
          <option value="lt5">Moins de 5 ans</option>
          <option value="gte5">5 ans et plus</option>
          <option value="gte10">10 ans et plus</option>
          <option value="unknown">Année inconnue{regStats ? ` (${regStats.unknown})` : ""}</option>
          <option value="pending">Pas encore cherchée</option>
        </select>
        <div className={cn("flex items-center gap-1 border border-border rounded-md px-2 py-1 text-sm", (yearFrom || yearTo) && "border-primary")} title="Année d'immatriculation entre…">
          <span className="text-foreground-muted text-xs">Immat.</span>
          <input
            type="number" inputMode="numeric" min={1900} max={CURRENT_YEAR} placeholder="de"
            value={yearFrom} onChange={(e) => setYearFrom(e.target.value.slice(0, 4))}
            className="w-16 bg-transparent px-1 py-1 text-foreground outline-none"
          />
          <span className="text-foreground-muted">–</span>
          <input
            type="number" inputMode="numeric" min={1900} max={CURRENT_YEAR} placeholder="à"
            value={yearTo} onChange={(e) => setYearTo(e.target.value.slice(0, 4))}
            className="w-16 bg-transparent px-1 py-1 text-foreground outline-none"
          />
        </div>
        {(ageFilter || yearFrom || yearTo) && ageFilter !== "unknown" && ageFilter !== "pending" && (
          <label className="flex items-center gap-1.5 text-sm text-foreground-secondary" title="Exclut les années devinées seulement par la date du nom de domaine">
            <input type="checkbox" checked={ageSureOnly} onChange={(e) => setAgeSureOnly(e.target.checked)} className="w-4 h-4 rounded border-border-strong" />
            Sources sûres seulement
          </label>
        )}
        <select
          value={minChanceFilter}
          onChange={(e) => setMinChanceFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", minChanceFilter && "border-primary text-primary")}
          title="Chance de conversion estimée sur 10"
        >
          <option value="">Chance : toutes</option>
          <option value="8">Chance ≥ 8/10</option>
          <option value="7">Chance ≥ 7/10</option>
          <option value="5">Chance ≥ 5/10</option>
        </select>
        <select
          value={engagementFilter}
          onChange={(e) => setEngagementFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", engagementFilter && "border-primary text-primary")}
          title="Engagement sur 10 : ouvertures, clics, visites du site, réponses, appels"
        >
          <option value="">Engagement : tous</option>
          <option value="hot">🔥 À appeler maintenant</option>
          <option value="7">Engagement ≥ 7/10</option>
          <option value="5">Engagement ≥ 5/10</option>
          <option value="3">Engagement ≥ 3/10</option>
        </select>
        <button
          type="button"
          onClick={() => setCallbackFilter((v) => !v)}
          className={cn("border rounded-md px-3 py-2 text-sm", callbackFilter ? "border-primary bg-primary-subtle text-primary" : "border-border text-foreground-secondary hover:bg-background-subtle")}
          title="Prospects avec un rappel prévu aujourd'hui ou en retard"
        >
          📞 Rappels du jour
        </button>
        <select
          value={minScoreFilter}
          onChange={(e) => setMinScoreFilter(e.target.value)}
          className={cn("border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground", minScoreFilter && "border-primary text-primary")}
          title="Score minimum du prospect"
        >
          <option value="">Score : tous</option>
          <option value="30">Score ≥ 30</option>
          <option value="50">Score ≥ 50</option>
          <option value="70">Score ≥ 70</option>
        </select>
        {formStats && formStats.remaining > 0 && (
          <button
            onClick={runFormDetection}
            disabled={formDetectRunning}
            className="text-sm border border-primary/30 text-primary rounded-md px-3 py-2 hover:bg-primary-subtle disabled:opacity-60"
            title="Visite le site de chaque prospect pour détecter un formulaire de contact ou un CRM concurrent"
          >
            {formDetectRunning ? `Analyse… (${formStats.remaining} restants)` : `Analyser les formulaires (${formStats.remaining})`}
          </button>
        )}
        {ownerRun ? (
          <button
            onClick={() => { ownerStopRef.current = true; }}
            className="text-sm border border-warning/40 text-warning rounded-md px-3 py-2 hover:bg-warning-subtle"
            title="Arrêter après le lot en cours"
          >
            Propriétaires… {ownerRun.processed}/{ownerRun.total} · {ownerRun.found} trouvés — Arrêter
          </button>
        ) : ownerStats && ownerStats.remaining > 0 && (
          <button
            onClick={() => runOwnerSearch()}
            className="text-sm border border-primary/30 text-primary rounded-md px-3 py-2 hover:bg-primary-subtle"
            title="L'IA lit le site (accueil, À propos, équipe, carrières, contact) et les avis Google : propriétaire, embauche, équipes, réservation en ligne, plaintes sur le suivi"
          >
            Analyser sites + avis (IA) ({ownerStats.remaining})
          </button>
        )}
        {regRun ? (
          <button
            onClick={() => { regStopRef.current = true; }}
            className="text-sm border border-warning/40 text-warning rounded-md px-3 py-2 hover:bg-warning-subtle"
            title="Arrêter après le lot en cours"
          >
            Année… {regRun.processed}/{regRun.total} · {regRun.found} trouvées — Arrêter
          </button>
        ) : regStats && regStats.remaining > 0 && (
          <button
            onClick={() => runRegistrationSearch()}
            className="text-sm border border-primary/30 text-primary rounded-md px-3 py-2 hover:bg-primary-subtle"
            title="L'IA cherche l'année d'immatriculation (Registre des entreprises du Québec, site, web) avec citation vérifiée ; sinon, indice par la date du nom de domaine"
          >
            Chercher l&apos;année (IA) ({regStats.remaining})
          </button>
        )}
        {hasSegmentFilters && (
          <button onClick={resetSegmentFilters} className="text-sm text-danger hover:text-danger/80 px-2 py-1">
            Effacer la segmentation
          </button>
        )}
        {!loading && displayProspects.length > 0 && (
          <div className="flex items-center gap-2 text-xs ml-auto">
            <span className="text-foreground-muted">{displayProspects.length} résultats :</span>
            <button
              onClick={() => setFormFilter(formFilter === "HAS_FORM" ? "" : "HAS_FORM")}
              className={cn("rounded-full px-2.5 py-1 border", formFilter === "HAS_FORM" ? "bg-primary text-white border-primary" : "border-border hover:bg-background-subtle")}
              title="Prospects qui recevront le message A"
            >
              A · {segmentSplit.a}
            </button>
            <button
              onClick={() => setFormFilter(formFilter === "NO_FORM_ANY" ? "" : "NO_FORM_ANY")}
              className={cn("rounded-full px-2.5 py-1 border", formFilter === "NO_FORM_ANY" ? "bg-primary text-white border-primary" : "border-border hover:bg-background-subtle")}
              title="Prospects qui recevront le message B"
            >
              B · {segmentSplit.b}
            </button>
            {segmentSplit.unknown > 0 && (
              <span className="text-foreground-muted" title="Pas encore analysés ou site inaccessible : recevront le message A par défaut">
                ? · {segmentSplit.unknown}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Select all results banner — shown when filters/search active and not all selected */}
      {hasFilters && displayProspects.length > 0 && selectedIds.size === 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-primary-subtle/50 border border-primary/20 rounded-md">
          <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm text-foreground-secondary">
            {displayProspects.length} {displayProspects.length > 1 ? t("prospects", "resultsPlural") : t("prospects", "results")}
          </span>
          <button
            onClick={toggleSelectAll}
            className="text-sm font-medium text-white bg-primary px-4 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
          >
            {t("common", "selectAll")} ({displayProspects.length})
          </button>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-primary-subtle border border-primary/20 rounded-md">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} {selectedIds.size > 1 ? t("prospects", "selectedPlural") : t("prospects", "selected")} {t("prospects", "onTotal")} {displayProspects.length}
          </span>
          {selectedIds.size < displayProspects.length && (
            <button
              onClick={toggleSelectAll}
              className="text-sm text-primary hover:text-primary/80 underline"
            >
              {t("common", "selectAll")} ({displayProspects.length})
            </button>
          )}
          <button
            onClick={handleBulkEnrich}
            disabled={actionLoading === "bulk-enrich"}
            className="text-sm border border-border bg-card text-foreground px-3 py-1.5 rounded-md hover:bg-card-hover disabled:opacity-50"
          >
            {actionLoading === "bulk-enrich" ? t("prospects", "enriching") : t("prospects", "enrichSelection")}
          </button>
          <button
            onClick={() => runOwnerSearch(Array.from(selectedIds))}
            disabled={!!ownerRun}
            className="text-sm border border-border bg-card text-foreground px-3 py-1.5 rounded-md hover:bg-card-hover disabled:opacity-50"
            title="Cherche le propriétaire des prospects sélectionnés qui n'ont pas encore été analysés"
          >
            Trouver les propriétaires
          </button>
          <button
            onClick={() => runRegistrationSearch(Array.from(selectedIds))}
            disabled={!!regRun}
            className="text-sm border border-border bg-card text-foreground px-3 py-1.5 rounded-md hover:bg-card-hover disabled:opacity-50"
            title="Cherche l'année d'immatriculation des prospects sélectionnés pas encore cherchés"
          >
            Trouver l&apos;année
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={actionLoading === "bulk-delete"}
            className="text-sm bg-danger text-white px-3 py-1.5 rounded-md hover:bg-danger/90 disabled:opacity-50"
          >
            {actionLoading === "bulk-delete" ? t("prospects", "deleting") : t("prospects", "deleteSelection")}
          </button>
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
            <select
              value={bulkCampaignId}
              onChange={(e) => setBulkCampaignId(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
            >
              <option value="">Campagne...</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>#{c.number} — {c.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkAssignCampaign}
              disabled={!bulkCampaignId || actionLoading === "bulk-campaign"}
              className="text-sm border border-primary text-primary px-3 py-1.5 rounded-md hover:bg-primary-subtle disabled:opacity-50"
            >
              {actionLoading === "bulk-campaign" ? "..." : "Assigner"}
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-foreground-muted hover:text-foreground"
          >
            {t("common", "cancel")}
          </button>
        </div>
      )}

      {/* Find Bar */}
      {showFindBar && (
        <div className="sticky top-0 z-40 mb-3 flex items-center gap-2 bg-card border border-border rounded-md shadow-lg px-3 py-2">
          <svg className="w-4 h-4 text-foreground-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            ref={findInputRef}
            type="text"
            value={findQuery}
            onChange={(e) => { setFindQuery(e.target.value); setFindMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) {
                  setFindMatchIndex((prev) => (prev - 1 + findMatchCount) % findMatchCount);
                } else {
                  setFindMatchIndex((prev) => (prev + 1) % findMatchCount);
                }
              }
              if (e.key === "Escape") closeFindBar();
            }}
            placeholder={t("prospects", "searchInTable")}
            className="flex-1 border-none outline-none bg-transparent text-sm text-foreground"
          />
          {findQuery && (
            <span className="text-xs text-foreground-muted shrink-0">
              {findMatchCount > 0 ? `${findMatchIndex + 1}/${findMatchCount}` : t("prospects", "noResult")}
            </span>
          )}
          <div className="flex gap-0.5 shrink-0">
            <button
              onClick={() => setFindMatchIndex((prev) => (prev - 1 + findMatchCount) % findMatchCount)}
              disabled={findMatchCount === 0}
              className="p-1 rounded hover:bg-background-subtle disabled:opacity-30"
              title={`${t("common", "previous")} (Shift+Enter)`}
            >
              <svg className="w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button
              onClick={() => setFindMatchIndex((prev) => (prev + 1) % findMatchCount)}
              disabled={findMatchCount === 0}
              className="p-1 rounded hover:bg-background-subtle disabled:opacity-30"
              title={`${t("common", "next")} (Enter)`}
            >
              <svg className="w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          <button onClick={closeFindBar} className="p-1 rounded hover:bg-background-subtle shrink-0" title={`${t("common", "close")} (Esc)`}>
            <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Choix des colonnes */}
      <div className="flex justify-end mb-2 relative">
        <button
          type="button"
          onClick={() => setColumnsOpen((v) => !v)}
          className="text-sm border border-border bg-card text-foreground-secondary px-3 py-1.5 rounded-md hover:bg-card-hover"
          aria-expanded={columnsOpen}
        >
          Colonnes ({visibleColumns.length}/{LIST_COLUMNS.length})
        </button>
        {columnsOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setColumnsOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-card border border-border rounded-md shadow-lg p-2">
              <p className="text-xs text-foreground-muted px-2 pb-1">Colonnes affichées</p>
              {LIST_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground rounded hover:bg-background-subtle cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!`,${hiddenColumns},`.includes(`,${c.key},`)}
                    onChange={() => toggleColumn(c.key)}
                    className="w-4 h-4 rounded border-border-strong"
                  />
                  {c.label}
                </label>
              ))}
              {hiddenColumns && (
                <button onClick={() => writeHiddenColumns([])} className="w-full text-left text-xs text-primary px-2 pt-1 hover:underline">
                  Tout afficher
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div ref={(el) => { (tableRef as React.MutableRefObject<HTMLDivElement | null>).current = el; tableContainerRef.current = el; }} className="bg-card rounded-md border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: 80 + 220 + visibleColumns.reduce((n, c) => n + c.width, 0) }}>
          <colgroup>
            <col style={{ width: 40 }} /><col style={{ width: 40 }} /><col style={{ minWidth: 220 }} />
            {visibleColumns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead className="bg-background-subtle border-b border-border">
            <tr>
              <th className="px-4 py-3 text-xs text-foreground-muted">#</th>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={displayProspects.length > 0 && selectedIds.size === displayProspects.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border-strong text-primary focus:ring-primary"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("companyName")}>
                {t("prospects", "company")} <SortIcon field="companyName" />
              </th>
              {showCol("city") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                <CityDropdown
                  value={cityFilter}
                  onChange={setCityFilter}
                  cities={availableCities}
                  placeholder={t("prospects", "city")}
                />
              </th>}
              {showCol("email") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">Email</th>}
              {showCol("phone") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "phone")}</th>}
              {showCol("campaign") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">Campagne</th>}
              {showCol("reviews") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "reviews")}</th>}
              {showCol("registration") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("registrationYear")} title="Année d'immatriculation (registre, site ou web) et âge de l'entreprise">
                Immat. <SortIcon field="registrationYear" />
              </th>}
              {showCol("score") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("leadScore")}>
                {t("prospects", "score")} <SortIcon field="leadScore" />
              </th>}
              {showCol("conversion") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("conversion")} title="Chance de conversion estimée sur 10 (métier, taille, besoin, joignabilité)">
                Chance <SortIcon field="conversion" />
              </th>}
              {showCol("engagement") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("engagement")} title="Engagement sur 10 : ouvertures, clics, visites du site, réponses, appels. 🔥 = à appeler maintenant">
                Engagement <SortIcon field="engagement" />
              </th>}
              {showCol("status") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("status")}>
                {t("prospects", "status")} <SortIcon field="status" />
              </th>}
              {showCol("actions") && <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
                <SkeletonRow columns={visibleColumns.length} />
              </>
            ) : displayProspects.length === 0 ? (
              <tr>
                <td colSpan={3 + visibleColumns.length} className="text-center py-12 text-foreground-muted">
                  <div className="space-y-2">
                    <p className="text-base">{t("prospects", "noProspectFound")}</p>
                    {hasFilters ? (
                      <p className="text-sm">{t("prospects", "tryModifyFilters")} <button onClick={resetFilters} className="text-primary hover:underline">{t("prospects", "resetFilters")}</button></p>
                    ) : (
                      <p className="text-sm">{t("prospects", "startDiscovery")}</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              displayProspects.map((p, i) => (
                <ProspectRow
                  key={p.id}
                  prospect={p}
                  rowIndex={i + 1}
                  actionLoading={actionLoading}
                  selected={selectedIds.has(p.id)}
                  campaigns={campaigns}
                  onSelect={handleSelectProspect}
                  onToggleSelect={toggleSelect}
                  onDragStart={handleDragStart}
                  onEnrich={handleEnrichOne}
                  onEmail={handleEmailClick}
                  onCampaignChange={handleCampaignChange}
                  hiddenColumns={hiddenColumns}
                  tagDefs={tagDefs}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Total count */}
      {total > 0 && (
        <div className="mt-4 text-center">
          <p className="text-sm text-foreground-muted">
            {displayProspects.length} {displayProspects.length > 1 ? t("prospects", "totalCountPlural") : t("prospects", "totalCount")} {t("prospects", "displayed")} {total}
          </p>
        </div>
      )}

      {/* Detail Modal */}
      {(selectedProspect || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setSelectedProspect(null); setGeneratedEmail(null); setEditing(false); }}>
          <div className="bg-card border border-border rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {detailLoading && !selectedProspect ? (
              <div className="p-8 text-center text-foreground-muted animate-pulse">
                <div className="h-6 bg-background-muted rounded w-48 mx-auto mb-4" />
                <div className="h-4 bg-background-subtle rounded w-32 mx-auto" />
              </div>
            ) : selectedProspect && (
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{selectedProspect.companyName}</h2>
                    <p className="text-foreground-muted text-sm">
                      {selectedProspect.industry} — {selectedProspect.city}
                    </p>
                    {selectedProspect.ownerName && (
                      <div className="mt-2 text-sm">
                        <p className="text-foreground">
                          <span className="text-success">●</span> {selectedProspect.ownerName}
                          {selectedProspect.ownerRole && <span className="text-foreground-muted"> · {selectedProspect.ownerRole}</span>}
                          <span className="text-xs text-foreground-muted"> (confiance {selectedProspect.ownerConfidence === "high" ? "élevée" : "moyenne"})</span>
                        </p>
                        {selectedProspect.ownerEvidence && (
                          <p className="text-xs text-foreground-muted italic mt-0.5">
                            « {selectedProspect.ownerEvidence} »
                            {selectedProspect.ownerSourceUrl && (
                              <> — <a href={selectedProspect.ownerSourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline not-italic">source</a></>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                    {selectedProspect.registrationYear && (
                      <div className="mt-2 text-sm">
                        <p className="text-foreground">
                          Immatriculée en {selectedProspect.registrationYear}
                          <span className="text-foreground-muted"> · {CURRENT_YEAR - selectedProspect.registrationYear} an(s)</span>
                          <span className="text-xs text-foreground-muted"> — {REGISTRATION_SOURCE_LABELS[selectedProspect.registrationSource ?? ""] ?? "source"}
                            {selectedProspect.registrationConfidence && selectedProspect.registrationSource !== "domaine" && ` (confiance ${selectedProspect.registrationConfidence === "high" ? "élevée" : "moyenne"})`}
                          </span>
                        </p>
                        {selectedProspect.registrationEvidence && (
                          <p className="text-xs text-foreground-muted italic mt-0.5">
                            « {selectedProspect.registrationEvidence} »
                            {selectedProspect.registrationUrl && (
                              <> — <a href={selectedProspect.registrationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline not-italic">source</a></>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!editing && (
                      <button
                        onClick={startEditing}
                        className="text-sm border border-border bg-card text-foreground-secondary px-3 py-1.5 rounded-md hover:bg-card-hover"
                      >
                        {t("common", "edit")}
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedProspect(null); setGeneratedEmail(null); setEditing(false); }}
                      className="text-foreground-muted hover:text-foreground text-xl"
                    >
                      &times;
                    </button>
                  </div>
                </div>

                {editing ? (
                  <div className="space-y-3 mb-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "company")}</label>
                        <input type="text" value={editData.companyName || ""} onChange={(e) => setEditData({ ...editData, companyName: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "industry")}</label>
                        <input type="text" value={editData.industry || ""} onChange={(e) => setEditData({ ...editData, industry: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Email</label>
                        <input type="email" value={editData.email || ""} onChange={(e) => { setEditData({ ...editData, email: e.target.value }); setEditEmailGuessed(false); }} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                        {editData.email ? (
                          <label className="mt-1.5 flex items-center gap-2 text-xs text-foreground-secondary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editEmailGuessed}
                              onChange={(e) => setEditEmailGuessed(e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-border-strong"
                            />
                            Courriel deviné (pas confirmé) — décoche si tu sais qu&apos;il est bon
                          </label>
                        ) : null}
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "phone")}</label>
                        <input type="text" value={editData.phone || ""} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "city")}</label>
                        <input type="text" value={editData.city || ""} onChange={(e) => setEditData({ ...editData, city: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "address")}</label>
                        <input type="text" value={editData.address || ""} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "website")}</label>
                        <input type="url" value={editData.website || ""} onChange={(e) => setEditData({ ...editData, website: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">LinkedIn</label>
                        <input type="url" value={editData.linkedinUrl || ""} onChange={(e) => setEditData({ ...editData, linkedinUrl: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "score")}</label>
                        <input type="number" min={0} max={100} value={editData.leadScore || 0} onChange={(e) => setEditData({ ...editData, leadScore: parseInt(e.target.value) || 0 })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "status")}</label>
                        <select value={editData.status || "NEW"} onChange={(e) => setEditData({ ...editData, status: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground">
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t("status", s as "NEW")}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">{t("prospects", "type")}</label>
                        <select value={editData.contactType || "prospect"} onChange={(e) => setEditData({ ...editData, contactType: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground">
                          {CONTACT_TYPE_OPTIONS.map((ct) => <option key={ct} value={ct}>{t("contactType", ct as "prospect")}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-foreground-muted uppercase">Tags</label>
                      {tagDefs.length === 0 ? (
                        <p className="text-xs text-foreground-muted mt-1">Aucun tag. Crée-les dans Paramètres → Prospects → Tags.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {tagDefs.map((tg) => {
                            const on = editTags.includes(tg.id);
                            return (
                              <button
                                key={tg.id}
                                type="button"
                                onClick={() => setEditTags(on ? editTags.filter((x) => x !== tg.id) : [...editTags, tg.id])}
                                className={cn("text-xs px-2.5 py-1 rounded-full font-medium border transition-opacity", TAG_COLOR_CLASSES[tg.color], on ? "border-current" : "border-transparent opacity-40 hover:opacity-70")}
                                aria-pressed={on}
                              >
                                {on ? "✓ " : ""}{tg.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-foreground-muted uppercase">{t("prospects", "notes")}</label>
                      <textarea value={editData.notes || ""} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={3} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 rounded-md border border-border text-foreground-secondary hover:bg-background-subtle">
                        {t("common", "cancel")}
                      </button>
                      <button onClick={handleSaveEdit} disabled={actionLoading === "save-edit"} className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50">
                        {actionLoading === "save-edit" ? t("common", "saving") : t("common", "save")}
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Email</p>
                    <p className="text-sm text-foreground">{selectedProspect.email || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">{t("prospects", "phone")}</p>
                    <p className="text-sm text-foreground">{selectedProspect.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">{t("prospects", "website")}</p>
                    <p className="text-sm">
                      {selectedProspect.website ? (
                        <a href={selectedProspect.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {selectedProspect.website}
                        </a>
                      ) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">LinkedIn</p>
                    <p className="text-sm">
                      {selectedProspect.linkedinUrl ? (
                        <a href={selectedProspect.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {t("prospects", "viewProfile")}
                        </a>
                      ) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">{t("prospects", "score")}</p>
                    <p className="text-sm font-mono font-semibold text-foreground tabular-nums">{selectedProspect.leadScore}</p>
                  </div>
                  {selectedProspect.conversion && (
                    <div className="col-span-2">
                      <p className="text-xs text-foreground-muted uppercase">Chance de conversion</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ConversionPill conversion={selectedProspect.conversion} />
                        <span className="text-xs text-foreground-muted">{selectedProspect.conversion.reasons.join(" · ") || "Peu de signaux"}</span>
                      </div>
                    </div>
                  )}
                  {selectedProspect.reviewCount != null && (
                    <div>
                      <p className="text-xs text-foreground-muted uppercase">{t("prospects", "reviews")}</p>
                      <p className="text-sm font-mono font-semibold text-foreground tabular-nums">{selectedProspect.reviewCount}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">{t("prospects", "status")}</p>
                    <StatusBadge status={selectedProspect.status} />
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">{t("prospects", "address")}</p>
                    <p className="text-sm text-foreground">{selectedProspect.address || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Campagne</p>
                    <p className="text-sm text-foreground">
                      {selectedProspect.campaignNumber ? `#${selectedProspect.campaignNumber}` : "—"}
                    </p>
                  </div>
                </div>
                )}

                {!editing && (
                  <ProspectInsights key={selectedProspect.id} prospect={selectedProspect} onChanged={refreshSelected} />
                )}

                {/* Recent emails */}
                {selectedProspect.emailActivities && selectedProspect.emailActivities.length > 0 && (
                  <div className="border-t border-border pt-4 mb-4">
                    <h3 className="font-semibold mb-2 text-sm text-foreground">{t("prospects", "emailsSent")}</h3>
                    <div className="space-y-1">
                      {selectedProspect.emailActivities.map((ea) => (
                        <div key={ea.id} className="flex items-center gap-2 text-xs text-foreground-secondary">
                          <span>{new Date(ea.sentAt).toLocaleDateString(locale === "en" ? "en-CA" : "fr-CA")}</span>
                          <span className="truncate flex-1">{ea.emailSubject}</span>
                          {ea.replyReceived && <span className="text-success font-medium">{t("status", "REPLIED")}</span>}
                          {ea.bounce && <span className="text-danger font-medium">{t("dashboard", "bounce")}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email Generation */}
                {selectedProspect.email && (
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground text-sm">{t("prospects", "prospectingEmail")}</h3>
                      <button
                        onClick={() => handleGenerateEmail(selectedProspect.id)}
                        disabled={actionLoading === "generate-" + selectedProspect.id}
                        className="text-sm bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary-hover disabled:opacity-50"
                      >
                        {actionLoading === "generate-" + selectedProspect.id ? t("prospects", "generating") : t("prospects", "generateWithAI")}
                      </button>
                    </div>

                    {generatedEmail && (
                      <div className="bg-background-subtle rounded-md p-4 space-y-3">
                        <div>
                          <p className="text-xs text-foreground-muted uppercase mb-1">{t("prospects", "subject")}</p>
                          <p className="text-sm font-medium text-foreground">{generatedEmail.subject}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-muted uppercase mb-1">{t("prospects", "body")}</p>
                          <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">{generatedEmail.body}</pre>
                        </div>
                        <button
                          onClick={() => handleSendEmail(selectedProspect.id)}
                          disabled={actionLoading === "send-" + selectedProspect.id}
                          className="w-full bg-success text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-success/90 disabled:opacity-50"
                        >
                          {actionLoading === "send-" + selectedProspect.id ? t("prospects", "sending") : `${t("prospects", "sendTo")} ${selectedProspect.email}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeImportModal}>
          <div className="bg-card border border-border rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">{t("prospects", "importProspects")}</h2>
                <button onClick={closeImportModal} className="text-foreground-muted hover:text-foreground">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Steps indicator */}
              {importStep !== "done" && (
                <div className="flex items-center gap-2 mb-5 text-xs">
                  {[
                    { key: "input", label: t("prospects", "stepSource") },
                    { key: "mapping", label: t("prospects", "stepColumns") },
                    { key: "preview", label: t("prospects", "stepPreview") },
                  ].map((s, i) => (
                    <div key={s.key} className="flex items-center gap-2">
                      {i > 0 && <div className="w-6 h-px bg-border" />}
                      <span className={`px-2 py-1 rounded-full font-medium ${
                        importStep === s.key
                          ? "bg-primary-subtle text-primary"
                          : (["input", "mapping", "preview"].indexOf(importStep) > ["input", "mapping", "preview"].indexOf(s.key))
                            ? "bg-success-subtle text-success"
                            : "bg-background-muted text-foreground-muted"
                      }`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Step: Done */}
              {importStep === "done" && importResult && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-success-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-base font-medium text-foreground mb-2">{t("prospects", "importComplete")}</p>
                  <p className="text-foreground-muted">
                    {importResult.created} prospect{importResult.created !== 1 ? "s" : ""} {importResult.created !== 1 ? t("prospects", "importedPlural") : t("prospects", "imported")}
                    {importResult.skipped > 0 && `, ${importResult.skipped} ${importResult.skipped !== 1 ? t("prospects", "skippedPlural") : t("prospects", "skipped")} (${t("prospects", "duplicates")})`}
                  </p>
                  <button onClick={closeImportModal} className="mt-4 bg-primary text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-primary-hover">
                    {t("common", "close")}
                  </button>
                </div>
              )}

              {/* Step 1: Input - file or text */}
              {importStep === "input" && (
                <div>
                  {/* File upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }}
                  />
                  <div
                    className="border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-subtle transition-colors mb-4"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary-subtle"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary", "bg-primary-subtle"); }}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-primary", "bg-primary-subtle"); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                  >
                    <svg className="w-10 h-10 text-foreground-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <p className="font-medium text-foreground mb-1">{t("prospects", "dragFileOrClick")}</p>
                    <p className="text-xs text-foreground-muted">{t("prospects", "fileFormats")}</p>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-foreground-muted uppercase">{t("prospects", "orPasteText")}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={t("prospects", "importTextPlaceholder")}
                    rows={6}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground font-mono resize-y"
                  />
                  {importError && (
                    <p className="text-sm text-danger mt-2">{importError}</p>
                  )}
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={closeImportModal} className="text-sm px-4 py-2 rounded-md border border-border text-foreground-secondary hover:bg-background-subtle">
                      {t("common", "cancel")}
                    </button>
                    <button
                      onClick={handleImportParse}
                      disabled={importParsing || !importText.trim()}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
                    >
                      {importParsing ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          {t("prospects", "aiAnalyzing")}
                        </>
                      ) : (
                        <>{t("prospects", "analyzeWithAI")}</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Column mapping */}
              {importStep === "mapping" && (
                <div>
                  <p className="text-sm text-foreground-muted mb-4">
                    {importFileRows.length} {importFileRows.length !== 1 ? t("prospects", "linesDetectedPlural") : t("prospects", "linesDetected")} {importFileRows.length !== 1 ? t("prospects", "detectedPlural") : t("prospects", "detected")}. {t("prospects", "mapColumns")}
                  </p>

                  <div className="grid grid-cols-1 gap-2 mb-4">
                    {IMPORT_FIELDS.map((field) => (
                      <div key={field.key} className="flex items-center gap-3">
                        <label className="w-32 text-sm font-medium text-foreground-secondary shrink-0">
                          {field.label}
                          {field.key === "companyName" && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        <select
                          value={importColumnMap[field.key] || ""}
                          onChange={(e) => setImportColumnMap({ ...importColumnMap, [field.key]: e.target.value })}
                          className="flex-1 border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                        >
                          <option value="">{t("prospects", "ignore")}</option>
                          {importFileColumns.filter(Boolean).map((col, ci) => (
                            <option key={ci} value={col}>{col}</option>
                          ))}
                        </select>
                        {importColumnMap[field.key] && (
                          <span className="text-xs text-foreground-muted truncate max-w-40 shrink-0" title={importFileRows[0]?.[importFileColumns.indexOf(importColumnMap[field.key])] || ""}>
                            ex: {importFileRows[0]?.[importFileColumns.indexOf(importColumnMap[field.key])] || "—"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Preview of raw file data */}
                  <details className="mb-4">
                    <summary className="text-xs text-foreground-muted cursor-pointer hover:text-foreground">
                      {t("prospects", "filePreview")} ({Math.min(5, importFileRows.length)} {t("prospects", "firstLines")})
                    </summary>
                    <div className="mt-2 border border-border rounded-md overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-background-subtle">
                          <tr>
                            {importFileColumns.map((col, i) => (
                              <th key={i} className="text-left px-2 py-1.5 font-medium text-foreground-muted whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importFileRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-t border-border">
                              {importFileColumns.map((_, j) => (
                                <td key={j} className="px-2 py-1.5 text-foreground-secondary whitespace-nowrap max-w-40 truncate">{row[j] || "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  {/* Deduplication mode */}
                  <div className="bg-background-subtle rounded-md p-3 mb-4">
                    <label className="text-xs font-medium text-foreground-muted mb-1.5 block">{t("prospects", "dedupMode")}</label>
                    <select
                      value={importDedupMode}
                      onChange={(e) => setImportDedupMode(e.target.value)}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                    >
                      <option value="companyName_city">{t("prospects", "dedupNameCity")}</option>
                      <option value="gmaps_url">{t("prospects", "dedupGmapsUrl")}</option>
                      <option value="website">{t("prospects", "dedupWebsite")}</option>
                      <option value="phone">{t("prospects", "dedupPhone")}</option>
                      <option value="none">{t("prospects", "dedupNone")}</option>
                    </select>
                    <p className="text-xs text-foreground-muted mt-1">
                      {importDedupMode === "gmaps_url" && t("prospects", "dedupDescGmaps")}
                      {importDedupMode === "website" && t("prospects", "dedupDescWebsite")}
                      {importDedupMode === "phone" && t("prospects", "dedupDescPhone")}
                      {importDedupMode === "companyName_city" && t("prospects", "dedupDescNameCity")}
                      {importDedupMode === "none" && t("prospects", "dedupDescNone")}
                    </p>
                  </div>

                  {importError && (
                    <p className="text-sm text-danger mt-2">{importError}</p>
                  )}
                  <div className="flex justify-between mt-4">
                    <button
                      onClick={() => { setImportStep("input"); setImportFileColumns([]); setImportFileRows([]); setImportColumnMap({}); setImportError(null); }}
                      className="text-sm px-4 py-2 rounded-md border border-border text-foreground-secondary hover:bg-background-subtle"
                    >
                      {t("common", "back")}
                    </button>
                    <button
                      onClick={applyColumnMapping}
                      disabled={!importColumnMap.companyName}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50"
                    >
                      {t("prospects", "applyAndPreview")}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview */}
              {importStep === "preview" && importParsed && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-foreground-muted">
                      {importParsed.filter((p) => p._selected).length} / {importParsed.length} prospect{importParsed.length !== 1 ? "s" : ""} {importParsed.filter((p) => p._selected).length !== 1 ? t("prospects", "selectedPlural") : t("prospects", "selected")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setImportParsed(importParsed.map((p) => ({ ...p, _selected: true })))}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("common", "selectAll")}
                      </button>
                      <button
                        onClick={() => setImportParsed(importParsed.map((p) => ({ ...p, _selected: false })))}
                        className="text-xs text-foreground-muted hover:underline"
                      >
                        {t("common", "deselectAll")}
                      </button>
                    </div>
                  </div>
                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-background-subtle sticky top-0">
                          <tr>
                            <th className="px-3 py-2 w-8"></th>
                            <th className="px-3 py-2 w-6 text-xs text-foreground-muted">#</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "company")}</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "city")}</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Email</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "phone")}</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "website")}</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">{t("prospects", "type")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importParsed.map((p, i) => (
                            <tr key={i} className={`border-t border-border ${p._selected ? "" : "opacity-40"}`}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={p._selected !== false}
                                  onChange={() => toggleImportProspect(i)}
                                  className="w-4 h-4 rounded border-border-strong text-primary focus:ring-primary"
                                />
                              </td>
                              <td className="px-3 py-2 text-xs text-foreground-muted">{i + 1}</td>
                              <td className="px-3 py-2 font-medium text-foreground">{p.companyName || "—"}</td>
                              <td className="px-3 py-2 text-foreground-secondary">{p.city || "—"}</td>
                              <td className="px-3 py-2 text-foreground-secondary truncate max-w-40">{p.email || "—"}</td>
                              <td className="px-3 py-2 text-foreground-secondary">{p.phone || "—"}</td>
                              <td className="px-3 py-2 text-foreground-secondary truncate max-w-36">{p.website || "—"}</td>
                              <td className="px-3 py-2 text-foreground-secondary">{p.contactType || "prospect"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {importError && (
                    <p className="text-sm text-danger mt-2">{importError}</p>
                  )}
                  <div className="flex justify-between mt-4">
                    <button
                      onClick={() => { setImportParsed(null); setImportError(null); setImportStep(importFileColumns.length > 0 ? "mapping" : "input"); }}
                      className="text-sm px-4 py-2 rounded-md border border-border text-foreground-secondary hover:bg-background-subtle"
                    >
                      {t("common", "back")}
                    </button>
                    <button
                      onClick={handleImportSave}
                      disabled={importSaving || importParsed.filter((p) => p._selected).length === 0}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
                    >
                      {importSaving ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          {t("prospects", "importInProgress")}
                        </>
                      ) : (
                        <>{t("common", "import")} {importParsed.filter((p) => p._selected).length} prospect{importParsed.filter((p) => p._selected).length !== 1 ? "s" : ""}</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 bg-foreground text-background w-10 h-10 rounded-full shadow-lg hover:opacity-90 transition-all flex items-center justify-center opacity-80 hover:opacity-100"
          title={t("prospects", "scrollToTop")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
        </button>
      )}
    </div>
  );
}
