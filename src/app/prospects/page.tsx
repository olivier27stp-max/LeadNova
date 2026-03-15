"use client";

import { useEffect, useState, useCallback, useRef, memo, useMemo, useTransition } from "react";
import { ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import JobProgressBar from "@/components/prospects/JobProgressBar";
import { useEnrichment } from "@/components/EnrichmentProvider";

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
  createdAt: string;
}

interface ProspectDetail extends ProspectListItem {
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
const STATUS_OPTIONS = ["NEW", "ENRICHED", "CONTACTED", "REPLIED", "QUALIFIED", "NOT_INTERESTED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  ENRICHED: "Enrichi",
  CONTACTED: "Contacté",
  REPLIED: "Répondu",
  QUALIFIED: "Qualifié",
  NOT_INTERESTED: "Pas intéressé",
};
const SOURCE_OPTIONS = ["google_search", "duckduckgo_search", "manual", "import", "referral"];
const SOURCE_LABELS: Record<string, string> = {
  google_search: "Google",
  duckduckgo_search: "DuckDuckGo",
  manual: "Manuel",
  import: "Import",
  referral: "Référence",
};
const CONTACT_TYPE_OPTIONS = ["prospect", "client", "nouveau_client"];
const CONTACT_TYPE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  client: "Client",
  nouveau_client: "Nouveau client",
};

const LOAD_ALL_LIMIT = 5000;

// ---------- Sub-components ----------
const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    NEW: "bg-primary-subtle text-primary border border-primary/20",
    ENRICHED: "bg-background-muted text-foreground-secondary border border-border",
    CONTACTED: "bg-warning-subtle text-warning border border-warning/20",
    REPLIED: "bg-success-subtle text-success border border-success/20",
    QUALIFIED: "bg-success-subtle text-success border border-success/20",
    NOT_INTERESTED: "bg-background-muted text-foreground-muted border border-border",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status] || "bg-background-muted text-foreground-muted border border-border"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
});

function SkeletonRow() {
  return (
    <tr className="border-b border-border animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-32" /><div className="h-3 bg-background-subtle rounded w-20 mt-1" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-20" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-36" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-24" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-background-muted rounded w-10" /></td>
      <td className="px-4 py-3"><div className="h-5 bg-background-muted rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-6 bg-background-muted rounded w-14" /></td>
    </tr>
  );
}

const ProspectRow = memo(function ProspectRow({
  prospect,
  rowIndex,
  actionLoading,
  selected,
  onSelect,
  onToggleSelect,
  onEnrich,
  onEmail,
  onDragStart,
}: {
  prospect: ProspectListItem;
  rowIndex: number;
  actionLoading: string | null;
  selected: boolean;
  onSelect: (p: ProspectListItem) => void;
  onToggleSelect: (id: string) => void;
  onEnrich: (id: string) => void;
  onEmail: (p: ProspectListItem) => void;
  onDragStart: (id: string) => void;
}) {
  return (
    <tr
      data-row-idx={rowIndex - 1}
      className={`border-b border-border hover:bg-card-hover cursor-pointer ${selected ? "bg-primary-subtle" : ""}`}
      onClick={() => onSelect(prospect)}
    >
      <td className="px-4 py-3 w-8 text-xs text-foreground-muted text-right">{rowIndex}</td>
      <td
        className="px-4 py-3 w-10 select-none"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.preventDefault(); onDragStart(prospect.id); }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(prospect.id)}
          className="w-4 h-4 rounded border-border-strong text-primary focus:ring-primary pointer-events-none"
        />
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{prospect.companyName}</p>
        {prospect.industry && <p className="text-xs text-foreground-muted">{prospect.industry}</p>}
      </td>
      <td className="px-4 py-3 text-foreground-secondary">{prospect.city || "—"}</td>
      <td className="px-4 py-3 truncate max-w-48">
        {prospect.email ? (
          <span className="flex items-center gap-1">
            <span className={prospect.emailGuessed ? "text-warning" : "text-foreground-secondary"}>{prospect.email}</span>
            {prospect.emailGuessed && <span className="text-[10px] bg-warning-subtle text-warning px-1 rounded">deviné</span>}
          </span>
        ) : "—"}
      </td>
      <td className="px-4 py-3 text-foreground-secondary">{prospect.phone || "—"}</td>
      <td className="px-4 py-3 text-xs text-foreground-muted">{prospect.source || "—"}</td>
      <td className="px-4 py-3">
        <span className="font-mono font-medium text-foreground tabular-nums">{prospect.leadScore}</span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={prospect.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {prospect.status === "NEW" && (
            <button
              onClick={() => onEnrich(prospect.id)}
              disabled={actionLoading === prospect.id}
              className="text-xs border border-border bg-card text-foreground-secondary px-2 py-1 rounded hover:bg-card-hover disabled:opacity-50"
            >
              Enrichir
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
      </td>
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

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  // Discover & Enrich
  const [discoverTarget, setDiscoverTarget] = useState(10);
  const [targetingCities, setTargetingCities] = useState<string[]>([]);
  const [enrichTarget, setEnrichTarget] = useState(10);
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(false);
  const [discoverProgress, setDiscoverProgress] = useState<{
    status: string;
    target: number;
    found: number;
    newCount: number;
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
  }, [searchQuery, statusFilter, sourceFilter, contactTypeFilter, cityFilter]);

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
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    try {
      const res = await fetch(`/api/prospects?${params}`);
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
  }, [statusFilter, sourceFilter, contactTypeFilter, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  // Derive available cities from loaded prospects (dynamic, no static list)
  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    for (const p of prospects) {
      if (p.city) cities.add(p.city);
    }
    return Array.from(cities).sort((a, b) => a.localeCompare(b, "fr"));
  }, [prospects]);

  // Client-side filtered prospects: instant filter using searchQuery + cityFilter (no debounce wait)
  const displayProspects = useMemo(() => {
    let result = prospects;
    if (cityFilter) result = result.filter((p) => p.city === cityFilter);
    const q = searchQuery.toLowerCase();
    if (!q) return result;
    return result.filter((p) =>
      p.companyName.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q)) ||
      (p.industry && p.industry.toLowerCase().includes(q)) ||
      (p.website && p.website.toLowerCase().includes(q))
    );
  }, [prospects, searchQuery, cityFilter]);

  // Fetch targeting cities from settings + provinces list
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.targeting?.cities) setTargetingCities(data.targeting.cities);
        if (data?.targeting?.keywords) setTargetingKeywords(data.targeting.keywords);
        if (data?.targeting?.searchQueries) setTargetingQueries(data.targeting.searchQueries);
      })
      .catch(() => {});
    fetch("/api/cities?list=provinces")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.provinces) setProvinces(data.provinces);
      })
      .catch(() => {});
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

  function startProgressPolling() {
    stopProgressPolling();
    progressIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/prospects/discover");
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "running") {
          setDiscoverProgress({
            status: data.status,
            target: data.target || 0,
            found: data.found || 0,
            newCount: data.newCount || 0,
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
            currentCity: data.currentCity || "",
            round: data.round || 1,
            startedAt: data.startedAt || Date.now(),
            totalCities: data.totalCities || 1,
            completedCities: data.completedCities || 0,
          });
          stopProgressPolling();
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
    setDiscoverProgress({ status: "running", target: targetCount, found: 0, newCount: 0, currentCity: "...", round: 1, startedAt: Date.now(), totalCities: 1, completedCities: 0 });
    startProgressPolling();

    try {
      const res = await fetch("/api/prospects/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city || "all", targetCount }),
      });
      const data = await res.json();
      stopProgressPolling();
      if (!res.ok) {
        throw new Error(data.error || "Discovery failed");
      }
      const finalStatus = data.cancelled ? "cancelled" : "done";
      setDiscoverProgress({ status: finalStatus, target: targetCount, found: data.total || data.found || 0, newCount: data.new || 0, currentCity: "", round: data.rounds || 1, startedAt: discoverProgress?.startedAt || Date.now(), totalCities: discoverProgress?.totalCities || 1, completedCities: discoverProgress?.totalCities || 1 });
      fetchProspects();
      // Auto-clear progress after 5 seconds
      setTimeout(() => setDiscoverProgress(null), 5000);
    } catch (error) {
      stopProgressPolling();
      setDiscoverProgress(null);
      alert(error instanceof Error ? error.message : "Erreur lors de la découverte");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeduplicate() {
    if (!confirm("Supprimer les prospects en double (même nom d'entreprise) ? Le prospect avec le meilleur score sera conservé.")) return;
    setActionLoading("deduplicate");
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "deduplicate" }),
      });
      const data = await res.json();
      alert(`${data.deleted} doublon${data.deleted !== 1 ? "s" : ""} supprimé${data.deleted !== 1 ? "s" : ""}`);
      fetchProspects();
    } catch {
      alert("Erreur lors de la suppression des doublons");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleEnrichBatch() {
    setShowEnrichConfirm(false);
    setEnrichProgress({ status: "running", target: enrichTarget, enriched: 0, failed: 0, noData: 0, currentProspect: "Démarrage...", startedAt: Date.now() });
    startEnrichPolling();
    try {
      const res = await fetch("/api/prospects/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: true, limit: enrichTarget }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors du démarrage de l'enrichissement");
        dismissEnrich();
      }
      // Server returns immediately — polling handles progress tracking
    } catch {
      dismissEnrich();
      alert("Erreur réseau lors du démarrage de l'enrichissement");
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
        alert(data.error || "Erreur lors de l'enrichissement");
        dismissEnrich();
      }
      // Server returns immediately — polling handles progress tracking
    } catch {
      dismissEnrich();
      alert("Erreur lors de l'enrichissement");
    }
  }, [setEnrichProgress, startEnrichPolling, dismissEnrich]);

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
      alert("Erreur lors de la génération");
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
        alert("Email envoyé!");
        setGeneratedEmail(null);
        fetchProspects();
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch {
      alert("Erreur lors de l'envoi");
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

  const handleDragStart = useCallback((id: string) => {
    const idx = prospects.findIndex((p) => p.id === id);
    if (idx === -1) return;
    isDragging.current = true;
    dragStartIndex.current = idx;
    dragLastIndex.current = idx;
    const willSelect = !selectedIds.has(id);
    dragSelectMode.current = willSelect;
    dragPrevIds.current = new Set(selectedIds);
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
      dragStartIndex.current = -1;
      dragLastIndex.current = -1;
      scrollSpeedRef.current = 0;
    };
    const handleMouseMove = (e: MouseEvent) => {
      mouseYRef.current = e.clientY;
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
        alert(data.error || "Erreur lors du démarrage de l'enrichissement");
        return;
      }

      // Server started background processing — polling will track progress
      setEnrichProgress({ status: "running", target: allIds.length, enriched: 0, failed: 0, noData: 0, currentProspect: "Démarrage...", startedAt: Date.now() });
      startEnrichPolling();
    } catch (err) {
      console.error("Failed to start enrichment:", err);
      alert("Erreur réseau lors du démarrage de l'enrichissement");
    } finally {
      setActionLoading(null);
    }
  }

  // Bulk delete
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} prospect${selectedIds.size > 1 ? "s" : ""} ? Cette action est irréversible.`)) return;
    setActionLoading("bulk-delete");
    try {
      const res = await fetch(`/api/prospects?ids=${Array.from(selectedIds).join(",")}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      const data = await res.json();
      alert(`${data.deleted} prospect${data.deleted > 1 ? "s" : ""} supprimé${data.deleted > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      fetchProspects();
    } catch {
      alert("Erreur lors de la suppression");
    } finally {
      setActionLoading(null);
    }
  }

  // Edit prospect
  function startEditing() {
    if (!selectedProspect) return;
    setEditing(true);
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
        body: JSON.stringify({ id: selectedProspect.id, ...editData }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      setSelectedProspect({ ...selectedProspect, ...updated });
      setEditing(false);
      fetchProspects();
    } catch {
      alert("Erreur lors de la modification");
    } finally {
      setActionLoading(null);
    }
  }

  // Import handlers
  const IMPORT_FIELDS = [
    { key: "companyName", label: "Entreprise" },
    { key: "industry", label: "Industrie" },
    { key: "city", label: "Ville" },
    { key: "address", label: "Adresse" },
    { key: "googleMapsUrl", label: "URL Google Maps" },
    { key: "phone", label: "Téléphone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Site web" },
    { key: "contactType", label: "Type de contact" },
    { key: "notes", label: "Notes" },
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
          setImportError("Le fichier doit contenir au moins un en-tête et une ligne de données");
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
          setImportError("Le fichier doit contenir au moins un en-tête et une ligne de données");
          return;
        }
        const columns = deduplicateColumns((rows[0] as string[]).map((c) => String(c).trim()));
        setImportFileColumns(columns);
        setImportFileRows(rows.slice(1).map((r) => (r as string[]).map((c) => String(c))));
        autoMapColumns(columns);
        setImportStep("mapping");
      } else {
        setImportError("Format non supporté. Utilisez CSV, TSV, XLS ou XLSX.");
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Erreur de lecture du fichier");
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
      setImportError("Aucun prospect trouvé. Vérifiez que la colonne \"Entreprise\" est bien assignée.");
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
      if (!res.ok) throw new Error(data.error || "Erreur");
      setImportParsed(data.prospects.map((p: Record<string, unknown>) => ({ ...p, _selected: true })));
      setImportStep("preview");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Erreur lors de l'analyse");
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
      if (!res.ok) throw new Error(data.error || "Erreur");
      setImportResult({ created: data.created, skipped: data.skipped });
      setImportStep("done");
      fetchProspects();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Erreur lors de l'import");
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
  const hasFilters = statusFilter || cityFilter || sourceFilter || contactTypeFilter || debouncedSearch || searchQuery;
  function resetFilters() {
    setStatusFilter("");
    setCityFilter("");
    setSourceFilter("");
    setContactTypeFilter("");
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Prospects</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              {total} prospect{total !== 1 ? "s" : ""} au total
            </p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="border border-border bg-card text-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-card-hover flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Importer
          </button>
          <button
            onClick={() => { setShowFindBar(true); setTimeout(() => findInputRef.current?.focus(), 50); }}
            className="border border-border bg-card text-foreground-secondary px-3 py-2 rounded-md text-sm font-medium hover:bg-card-hover flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            Recherche rapide
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 mr-2">
            <div className="rounded-md border border-border bg-card px-3 py-1.5 text-center shadow-xs">
              <p className="text-[10px] font-medium text-foreground-muted uppercase tracking-wide">Découvertes du jour</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{scrapedToday}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-1.5 text-center shadow-xs">
              <p className="text-[10px] font-medium text-foreground-muted uppercase tracking-wide">Enrichis du jour</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{enrichedToday}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDiscoverConfirm(true)}
              disabled={actionLoading === "discover"}
              className="bg-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {actionLoading === "discover" ? "Recherche..." : "Découvrir"}
            </button>
            <button
              onClick={() => setShowEnrichConfirm(true)}
              disabled={actionLoading === "enrich"}
              className="border border-border bg-card text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-card-hover disabled:opacity-50"
            >
              {actionLoading === "enrich" ? "Enrichissement..." : "Enrichir"}
            </button>
            <button
              onClick={handleDeduplicate}
              disabled={actionLoading === "deduplicate"}
              className="border border-border bg-card text-foreground-secondary px-4 py-2 rounded-md text-sm font-medium hover:bg-card-hover disabled:opacity-50"
            >
              {actionLoading === "deduplicate" ? "Suppression..." : "Supprimer doublons"}
            </button>
          </div>
        </div>
      </div>

      {/* Discover confirmation modal */}
      {showDiscoverConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDiscoverConfirm(false)}>
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Confirmer la découverte</h2>
              <p className="text-sm text-foreground-muted mt-1">Voici les paramètres de ciblage qui seront utilisés</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Nombre de prospects */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-2 uppercase tracking-wide">Nombre de prospects</p>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[10, 25, 50, 100, 150, 200, 300, 500].map((n) => (
                    <button
                      key={n}
                      onClick={() => setDiscoverTarget(n)}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        discoverTarget === n
                          ? "bg-primary text-white"
                          : "bg-background-subtle text-foreground-secondary hover:bg-background-muted"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-foreground-muted shrink-0">Personnalisé:</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={discoverTarget}
                    onChange={(e) => setDiscoverTarget(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-24 border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
                  />
                </div>
              </div>

              {/* Villes */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  Villes ciblées ({targetingCities.length})
                </p>
                {targetingCities.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {targetingCities.map((c) => (
                      <span key={c} className="px-2 py-0.5 bg-success-subtle text-success border border-success/20 rounded text-xs">{c}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-warning">Aucune ville configurée. Allez dans Paramètres &gt; Ciblage.</p>
                )}
              </div>

              {/* Mots-clés */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  Mots-clés ({targetingKeywords.length})
                </p>
                {targetingKeywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {targetingKeywords.map((k) => (
                      <span key={k} className="px-2 py-0.5 bg-primary-subtle text-primary border border-primary/20 rounded text-xs">{k}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-warning">Aucun mot-clé configuré. Allez dans Paramètres &gt; Ciblage.</p>
                )}
              </div>

              {/* Requêtes */}
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                  Requêtes de recherche ({targetingQueries.length})
                </p>
                {targetingQueries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {targetingQueries.map((q) => (
                      <span key={q} className="px-2 py-0.5 bg-background-muted text-foreground-secondary border border-border rounded text-xs">{q}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-foreground-muted">Aucune requête personnalisée (les mots-clés seront utilisés).</p>
                )}
              </div>

              {/* Google Maps manual */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-foreground-muted uppercase">ou Google Maps (manuel)</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <p className="text-xs text-foreground-muted mb-2">Générer des liens Google Maps par province, scraper manuellement, puis importer le CSV.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Mot-clé (ex: lavage de vitres)"
                    value={discoverKeyword}
                    onChange={(e) => setDiscoverKeyword(e.target.value)}
                    className="flex-1 border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                  />
                  <select
                    value={discoverProvince}
                    onChange={(e) => setDiscoverProvince(e.target.value)}
                    className="border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                  >
                    <option value="">Province</option>
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
                  Générer les liens Google Maps
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowDiscoverConfirm(false)}
                className="px-4 py-2 rounded-md text-sm font-medium text-foreground-secondary hover:bg-background-subtle"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowDiscoverConfirm(false);
                  handleDiscover("");
                }}
                disabled={targetingCities.length === 0 && targetingKeywords.length === 0}
                className="bg-primary text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
              >
                Lancer la découverte ({discoverTarget})
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
                <h2 className="text-base font-semibold text-foreground">Confirmer l&apos;enrichissement</h2>
                <p className="text-sm text-foreground-muted mt-1">
                  {newCount > 0
                    ? `${newCount} prospect${newCount > 1 ? "s" : ""} non enrichi${newCount > 1 ? "s" : ""} disponible${newCount > 1 ? "s" : ""}`
                    : "Aucun prospect à enrichir (tous sont déjà enrichis)"}
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-foreground-muted mb-2 uppercase tracking-wide">Nombre de prospects à enrichir</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[10, 25, 50, 100, 150, 200, 300, 500].map((n) => (
                      <button
                        key={n}
                        onClick={() => setEnrichTarget(n)}
                        className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                          enrichTarget === n
                            ? "bg-primary text-white"
                            : "bg-background-subtle text-foreground-secondary hover:bg-background-muted"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-foreground-muted shrink-0">Personnalisé:</label>
                    <input
                      type="number"
                      min={1}
                      max={newCount || 500}
                      value={enrichTarget}
                      onChange={(e) => setEnrichTarget(Math.min(newCount || 500, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-24 border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
                    />
                  </div>
                </div>

                {newCount > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground-muted mb-1.5 uppercase tracking-wide">
                      Prospects à enrichir ({Math.min(enrichTarget, newCount)})
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
                          et {newCount - enrichTarget} autre{newCount - enrichTarget > 1 ? "s" : ""}...
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
                  Annuler
                </button>
                <button
                  onClick={handleEnrichBatch}
                  disabled={newCount === 0}
                  className="bg-primary text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
                >
                  Lancer l&apos;enrichissement ({Math.min(enrichTarget, newCount)})
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
                Ouvrez chaque lien, scrapez avec Instant Data Scraper, puis importez le CSV avec le bouton Importer.
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
                <span className="text-xs text-foreground-muted ml-auto shrink-0">{city.population?.toLocaleString("fr-CA")} hab.</span>
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
              ? "Recherche en cours"
              : discoverProgress.status === "done"
                ? "Recherche terminée"
                : discoverProgress.status === "cancelled"
                  ? "Recherche arrêtée"
                  : "Recherche — Erreur",
            stepLabel: discoverProgress.currentCity
              ? `Analyse : ${discoverProgress.currentCity}`
              : "",
            processed: discoverProgress.newCount,
            total: discoverProgress.target,
            startedAt: discoverProgress.startedAt,
            currentStep: discoverProgress.completedCities + 1,
            totalSteps: discoverProgress.totalCities,
            stepUnit: "Ville",
            secondaryLabel: `${discoverProgress.found} trouvés, ${discoverProgress.newCount} nouveaux${discoverProgress.round > 1 ? ` (round ${discoverProgress.round})` : ""}`,
            error: discoverProgress.status === "error" ? "Erreur lors de la recherche" : undefined,
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
                ? "Enrichissement en cours"
                : enrichProgress.status === "done"
                  ? "Enrichissement terminé"
                  : "Enrichissement arrêté",
              stepLabel: enrichProgress.currentProspect
                ? `Enrichissement : ${enrichProgress.currentProspect}`
                : "",
              processed: enrichProcessed,
              total: enrichProgress.target,
              startedAt: enrichProgress.startedAt,
              currentStep: enrichProcessed + 1,
              totalSteps: enrichProgress.target,
              stepUnit: "Prospect",
              secondaryLabel: `${enrichProgress.enriched} enrichi${enrichProgress.enriched !== 1 ? "s" : ""}${enrichProgress.noData > 0 ? `, ${enrichProgress.noData} sans données` : ""}${enrichProgress.failed > 0 ? `, ${enrichProgress.failed} échoué${enrichProgress.failed !== 1 ? "s" : ""}` : ""}`,
            }}
            onStop={stopEnrichment}
            onDismiss={dismissEnrich}
          />
        );
      })()}

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, email, téléphone, ville..."
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
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="">Toutes les sources</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
          ))}
        </select>
        <select
          value={contactTypeFilter}
          onChange={(e) => { setContactTypeFilter(e.target.value); }}
          className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
        >
          <option value="">Tous les types</option>
          {CONTACT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{CONTACT_TYPE_LABELS[t] || t}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="text-sm text-danger hover:text-danger/80 px-2 py-1"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Select all results banner — shown when filters/search active and not all selected */}
      {hasFilters && displayProspects.length > 0 && selectedIds.size === 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-primary-subtle/50 border border-primary/20 rounded-md">
          <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm text-foreground-secondary">
            {displayProspects.length} résultat{displayProspects.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={toggleSelectAll}
            className="text-sm font-medium text-white bg-primary px-4 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
          >
            Sélectionner tout ({displayProspects.length})
          </button>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-primary-subtle border border-primary/20 rounded-md">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""} sur {displayProspects.length}
          </span>
          {selectedIds.size < displayProspects.length && (
            <button
              onClick={toggleSelectAll}
              className="text-sm text-primary hover:text-primary/80 underline"
            >
              Tout sélectionner ({displayProspects.length})
            </button>
          )}
          <button
            onClick={handleBulkEnrich}
            disabled={actionLoading === "bulk-enrich"}
            className="text-sm border border-border bg-card text-foreground px-3 py-1.5 rounded-md hover:bg-card-hover disabled:opacity-50"
          >
            {actionLoading === "bulk-enrich" ? "Enrichissement..." : "Enrichir la sélection"}
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={actionLoading === "bulk-delete"}
            className="text-sm bg-danger text-white px-3 py-1.5 rounded-md hover:bg-danger/90 disabled:opacity-50"
          >
            {actionLoading === "bulk-delete" ? "Suppression..." : "Supprimer la sélection"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-foreground-muted hover:text-foreground"
          >
            Annuler
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
            placeholder="Rechercher dans le tableau..."
            className="flex-1 border-none outline-none bg-transparent text-sm text-foreground"
          />
          {findQuery && (
            <span className="text-xs text-foreground-muted shrink-0">
              {findMatchCount > 0 ? `${findMatchIndex + 1}/${findMatchCount}` : "0 résultat"}
            </span>
          )}
          <div className="flex gap-0.5 shrink-0">
            <button
              onClick={() => setFindMatchIndex((prev) => (prev - 1 + findMatchCount) % findMatchCount)}
              disabled={findMatchCount === 0}
              className="p-1 rounded hover:bg-background-subtle disabled:opacity-30"
              title="Précédent (Shift+Enter)"
            >
              <svg className="w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button
              onClick={() => setFindMatchIndex((prev) => (prev + 1) % findMatchCount)}
              disabled={findMatchCount === 0}
              className="p-1 rounded hover:bg-background-subtle disabled:opacity-30"
              title="Suivant (Enter)"
            >
              <svg className="w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          <button onClick={closeFindBar} className="p-1 rounded hover:bg-background-subtle shrink-0" title="Fermer (Esc)">
            <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Table */}
      <div ref={(el) => { (tableRef as React.MutableRefObject<HTMLDivElement | null>).current = el; tableContainerRef.current = el; }} className="bg-card rounded-md border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-background-subtle border-b border-border">
            <tr>
              <th className="px-4 py-3 w-8 text-xs text-foreground-muted">#</th>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={displayProspects.length > 0 && selectedIds.size === displayProspects.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border-strong text-primary focus:ring-primary"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("companyName")}>
                Entreprise <SortIcon field="companyName" />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                <select
                  value={cityFilter}
                  onChange={(e) => { setCityFilter(e.target.value); }}
                  className="bg-transparent border-none cursor-pointer font-medium text-foreground-muted text-xs uppercase tracking-wide p-0 focus:ring-0 focus:outline-none"
                >
                  <option value="">Ville ▾</option>
                  {availableCities.sort((a, b) => a.localeCompare(b, "fr")).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">Email</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">Téléphone</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">Source</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("leadScore")}>
                Score <SortIcon field="leadScore" />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted cursor-pointer select-none" onClick={() => handleSort("status")}>
                Statut <SortIcon field="status" />
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : displayProspects.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-foreground-muted">
                  <div className="space-y-2">
                    <p className="text-base">Aucun prospect trouvé</p>
                    {hasFilters ? (
                      <p className="text-sm">Essayez de modifier vos filtres ou <button onClick={resetFilters} className="text-primary hover:underline">réinitialiser</button></p>
                    ) : (
                      <p className="text-sm">Lancez une découverte pour commencer!</p>
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
                  onSelect={handleSelectProspect}
                  onToggleSelect={toggleSelect}
                  onDragStart={handleDragStart}
                  onEnrich={handleEnrichOne}
                  onEmail={handleEmailClick}
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
            {displayProspects.length} prospect{displayProspects.length > 1 ? "s" : ""} affichés sur {total}
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
                  </div>
                  <div className="flex items-center gap-2">
                    {!editing && (
                      <button
                        onClick={startEditing}
                        className="text-sm border border-border bg-card text-foreground-secondary px-3 py-1.5 rounded-md hover:bg-card-hover"
                      >
                        Modifier
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
                        <label className="text-xs text-foreground-muted uppercase">Entreprise</label>
                        <input type="text" value={editData.companyName || ""} onChange={(e) => setEditData({ ...editData, companyName: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Industrie</label>
                        <input type="text" value={editData.industry || ""} onChange={(e) => setEditData({ ...editData, industry: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Email</label>
                        <input type="email" value={editData.email || ""} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Téléphone</label>
                        <input type="text" value={editData.phone || ""} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Ville</label>
                        <input type="text" value={editData.city || ""} onChange={(e) => setEditData({ ...editData, city: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Adresse</label>
                        <input type="text" value={editData.address || ""} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Site web</label>
                        <input type="url" value={editData.website || ""} onChange={(e) => setEditData({ ...editData, website: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">LinkedIn</label>
                        <input type="url" value={editData.linkedinUrl || ""} onChange={(e) => setEditData({ ...editData, linkedinUrl: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Score</label>
                        <input type="number" min={0} max={100} value={editData.leadScore || 0} onChange={(e) => setEditData({ ...editData, leadScore: parseInt(e.target.value) || 0 })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Statut</label>
                        <select value={editData.status || "NEW"} onChange={(e) => setEditData({ ...editData, status: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground">
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-foreground-muted uppercase">Type</label>
                        <select value={editData.contactType || "prospect"} onChange={(e) => setEditData({ ...editData, contactType: e.target.value })} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground">
                          {CONTACT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{CONTACT_TYPE_LABELS[t]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-foreground-muted uppercase">Notes</label>
                      <textarea value={editData.notes || ""} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={3} className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 rounded-md border border-border text-foreground-secondary hover:bg-background-subtle">
                        Annuler
                      </button>
                      <button onClick={handleSaveEdit} disabled={actionLoading === "save-edit"} className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50">
                        {actionLoading === "save-edit" ? "Enregistrement..." : "Enregistrer"}
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
                    <p className="text-xs text-foreground-muted uppercase">Téléphone</p>
                    <p className="text-sm text-foreground">{selectedProspect.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Site web</p>
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
                          Voir profil
                        </a>
                      ) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Score</p>
                    <p className="text-sm font-mono font-semibold text-foreground tabular-nums">{selectedProspect.leadScore}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Statut</p>
                    <StatusBadge status={selectedProspect.status} />
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Adresse</p>
                    <p className="text-sm text-foreground">{selectedProspect.address || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-muted uppercase">Source</p>
                    <p className="text-sm text-foreground">{selectedProspect.source || "—"}</p>
                  </div>
                </div>
                )}

                {/* Recent emails */}
                {selectedProspect.emailActivities && selectedProspect.emailActivities.length > 0 && (
                  <div className="border-t border-border pt-4 mb-4">
                    <h3 className="font-semibold mb-2 text-sm text-foreground">Emails envoyés</h3>
                    <div className="space-y-1">
                      {selectedProspect.emailActivities.map((ea) => (
                        <div key={ea.id} className="flex items-center gap-2 text-xs text-foreground-secondary">
                          <span>{new Date(ea.sentAt).toLocaleDateString("fr-CA")}</span>
                          <span className="truncate flex-1">{ea.emailSubject}</span>
                          {ea.replyReceived && <span className="text-success font-medium">Répondu</span>}
                          {ea.bounce && <span className="text-danger font-medium">Rebond</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email Generation */}
                {selectedProspect.email && (
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground text-sm">Email de prospection</h3>
                      <button
                        onClick={() => handleGenerateEmail(selectedProspect.id)}
                        disabled={actionLoading === "generate-" + selectedProspect.id}
                        className="text-sm bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary-hover disabled:opacity-50"
                      >
                        {actionLoading === "generate-" + selectedProspect.id ? "Génération..." : "Générer avec IA"}
                      </button>
                    </div>

                    {generatedEmail && (
                      <div className="bg-background-subtle rounded-md p-4 space-y-3">
                        <div>
                          <p className="text-xs text-foreground-muted uppercase mb-1">Sujet</p>
                          <p className="text-sm font-medium text-foreground">{generatedEmail.subject}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-muted uppercase mb-1">Corps</p>
                          <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">{generatedEmail.body}</pre>
                        </div>
                        <button
                          onClick={() => handleSendEmail(selectedProspect.id)}
                          disabled={actionLoading === "send-" + selectedProspect.id}
                          className="w-full bg-success text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-success/90 disabled:opacity-50"
                        >
                          {actionLoading === "send-" + selectedProspect.id ? "Envoi..." : `Envoyer à ${selectedProspect.email}`}
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
                <h2 className="text-base font-semibold text-foreground">Importer des prospects</h2>
                <button onClick={closeImportModal} className="text-foreground-muted hover:text-foreground">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Steps indicator */}
              {importStep !== "done" && (
                <div className="flex items-center gap-2 mb-5 text-xs">
                  {[
                    { key: "input", label: "1. Source" },
                    { key: "mapping", label: "2. Colonnes" },
                    { key: "preview", label: "3. Aperçu" },
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
                  <p className="text-base font-medium text-foreground mb-2">Import terminé</p>
                  <p className="text-foreground-muted">
                    {importResult.created} prospect{importResult.created !== 1 ? "s" : ""} importé{importResult.created !== 1 ? "s" : ""}
                    {importResult.skipped > 0 && `, ${importResult.skipped} ignoré${importResult.skipped !== 1 ? "s" : ""} (doublons)`}
                  </p>
                  <button onClick={closeImportModal} className="mt-4 bg-primary text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-primary-hover">
                    Fermer
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
                    <p className="font-medium text-foreground mb-1">Glissez un fichier ici ou cliquez pour parcourir</p>
                    <p className="text-xs text-foreground-muted">CSV, TSV, Excel (.xlsx, .xls)</p>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-foreground-muted uppercase">ou collez du texte</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"Ex:\nABC Gestion, Montreal, info@abc.com, (514) 555-1234\nXYZ Immobilier, Quebec, contact@xyz.ca\n\nOu collez un tableau Excel, un CSV, du texte libre..."}
                    rows={6}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground font-mono resize-y"
                  />
                  {importError && (
                    <p className="text-sm text-danger mt-2">{importError}</p>
                  )}
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={closeImportModal} className="text-sm px-4 py-2 rounded-md border border-border text-foreground-secondary hover:bg-background-subtle">
                      Annuler
                    </button>
                    <button
                      onClick={handleImportParse}
                      disabled={importParsing || !importText.trim()}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
                    >
                      {importParsing ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Analyse IA en cours...
                        </>
                      ) : (
                        <>Analyser avec l&apos;IA</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Column mapping */}
              {importStep === "mapping" && (
                <div>
                  <p className="text-sm text-foreground-muted mb-4">
                    {importFileRows.length} ligne{importFileRows.length !== 1 ? "s" : ""} détectée{importFileRows.length !== 1 ? "s" : ""}. Associez chaque colonne du fichier au champ correspondant.
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
                          <option value="">— Ignorer —</option>
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
                      Aperçu du fichier ({Math.min(5, importFileRows.length)} premières lignes)
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
                    <label className="text-xs font-medium text-foreground-muted mb-1.5 block">Mode de déduplication</label>
                    <select
                      value={importDedupMode}
                      onChange={(e) => setImportDedupMode(e.target.value)}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                    >
                      <option value="companyName_city">Nom + Ville</option>
                      <option value="gmaps_url">URL Google Maps</option>
                      <option value="website">Site web</option>
                      <option value="phone">Téléphone</option>
                      <option value="none">Aucune (tout importer)</option>
                    </select>
                    <p className="text-xs text-foreground-muted mt-1">
                      {importDedupMode === "gmaps_url" && "Les prospects avec la même URL Google Maps seront ignorés"}
                      {importDedupMode === "website" && "Les prospects avec le même site web seront ignorés"}
                      {importDedupMode === "phone" && "Les prospects avec le même téléphone seront ignorés"}
                      {importDedupMode === "companyName_city" && "Les prospects avec le même nom et même ville seront ignorés"}
                      {importDedupMode === "none" && "Tous les prospects seront importés sans vérification"}
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
                      Retour
                    </button>
                    <button
                      onClick={applyColumnMapping}
                      disabled={!importColumnMap.companyName}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50"
                    >
                      Appliquer et voir l&apos;aperçu
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview */}
              {importStep === "preview" && importParsed && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-foreground-muted">
                      {importParsed.filter((p) => p._selected).length} / {importParsed.length} prospect{importParsed.length !== 1 ? "s" : ""} sélectionné{importParsed.filter((p) => p._selected).length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setImportParsed(importParsed.map((p) => ({ ...p, _selected: true })))}
                        className="text-xs text-primary hover:underline"
                      >
                        Tout sélectionner
                      </button>
                      <button
                        onClick={() => setImportParsed(importParsed.map((p) => ({ ...p, _selected: false })))}
                        className="text-xs text-foreground-muted hover:underline"
                      >
                        Tout désélectionner
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
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Entreprise</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Ville</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Email</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Téléphone</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Site web</th>
                            <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Type</th>
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
                      Retour
                    </button>
                    <button
                      onClick={handleImportSave}
                      disabled={importSaving || importParsed.filter((p) => p._selected).length === 0}
                      className="text-sm bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
                    >
                      {importSaving ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Import en cours...
                        </>
                      ) : (
                        <>Importer {importParsed.filter((p) => p._selected).length} prospect{importParsed.filter((p) => p._selected).length !== 1 ? "s" : ""}</>
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
          title="Revenir en haut"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
        </button>
      )}
    </div>
  );
}
