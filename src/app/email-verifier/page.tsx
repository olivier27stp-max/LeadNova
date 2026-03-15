"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import JobProgressBar from "@/components/prospects/JobProgressBar";
import { useEnrichment } from "@/components/EnrichmentProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ToastContainer } from "@/components/ui/toast";
import {
  ShieldCheck,
  RefreshCw,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Info,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface VerifyProspect {
  id: string;
  companyName: string;
  email: string | null;
  emailStatus: string | null;
  emailVerifiedAt: string | null;
  emailEnrichmentAttempts: number;
}

interface VerifyStats {
  total: number;
  valid: number;
  risky: number;
  invalid: number;
  "catch-all": number;
  disposable: number;
  unknown: number;
}

type EmailStatusConfig = Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
>;

const EMAIL_STATUS_CONFIG: EmailStatusConfig = {
  valid: { label: "Valide", color: "text-success", bg: "bg-success/10", icon: <CheckCircle2 className="size-4 text-success" /> },
  risky: { label: "Risqué", color: "text-warning", bg: "bg-warning/10", icon: <AlertCircle className="size-4 text-warning" /> },
  invalid: { label: "Invalide", color: "text-destructive", bg: "bg-destructive/10", icon: <XCircle className="size-4 text-destructive" /> },
  "catch-all": { label: "Catch-all", color: "text-accent", bg: "bg-accent/10", icon: <AlertTriangle className="size-4 text-accent" /> },
  disposable: { label: "Jetable", color: "text-destructive", bg: "bg-destructive/10", icon: <XCircle className="size-4 text-destructive" /> },
  unknown: { label: "Non vérifié", color: "text-foreground-muted", bg: "bg-foreground/5", icon: <HelpCircle className="size-4 text-foreground-muted" /> },
};

const STAT_CARDS = [
  { key: "total", label: "Total scannés", color: "text-foreground" },
  { key: "valid", label: "Valides", color: "text-success" },
  { key: "risky", label: "Risqués", color: "text-warning" },
  { key: "invalid", label: "Invalides", color: "text-destructive" },
  { key: "disposable", label: "Jetables", color: "text-destructive" },
  { key: "unknown", label: "Non vérifiés", color: "text-foreground-muted" },
] as const;

const FILTERS = ["all", "valid", "risky", "invalid", "disposable", "unknown"] as const;

// ─── Virtualized Table ───────────────────────────────────

const ROW_HEIGHT = 48;

function VerifyEmailsTable({
  prospects,
  loading,
  selected,
  onSelectedChange,
  scrollRef,
}: {
  prospects: VerifyProspect[];
  loading: boolean;
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const allChecked = prospects.length > 0 && prospects.every((p) => selected.has(p.id));
  const someChecked = prospects.some((p) => selected.has(p.id)) && !allChecked;

  const rowVirtualizer = useVirtualizer({
    count: prospects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const next = new Set(selected);
      prospects.forEach((p) => next.add(p.id));
      onSelectedChange(next);
    } else {
      const idsToRemove = new Set(prospects.map((p) => p.id));
      const next = new Set([...selected].filter((id) => !idsToRemove.has(id)));
      onSelectedChange(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectedChange(next);
  };

  if (loading && prospects.length === 0) {
    return (
      <div className="border border-border rounded-lg p-10 flex justify-center">
        <Loader2 className="size-5 animate-spin text-foreground-muted" />
      </div>
    );
  }

  if (prospects.length === 0) {
    return (
      <div className="border border-border rounded-lg p-10 text-center text-foreground-muted text-sm">
        Aucun prospect avec email trouvé.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Sticky header */}
      <div className="bg-background-subtle border-b border-border">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[28%]">Entreprise</th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[30%]">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[22%]">Statut</th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[12%]">Vérifié le</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Virtualized scrollable body */}
      <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const p = prospects[virtualRow.index];
            const s = p.emailStatus ?? "unknown";
            const isConfirmedInvalid = (s === "invalid" || s === "disposable") && p.emailEnrichmentAttempts > 0;
            const cfg = isConfirmedInvalid
              ? { label: "Définitivement invalide", color: "text-destructive", bg: "bg-destructive/10", icon: <XCircle className="size-4 text-destructive" /> }
              : (EMAIL_STATUS_CONFIG[s] ?? EMAIL_STATUS_CONFIG.unknown);
            const isSelected = selected.has(p.id);

            return (
              <div
                key={p.id}
                className={cn(
                  "absolute left-0 w-full border-b border-border transition-colors cursor-pointer",
                  isSelected ? "bg-primary/5" : "hover:bg-background-subtle"
                )}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => toggleOne(p.id)}
              >
                <table className="w-full text-sm table-fixed h-full">
                  <tbody>
                    <tr>
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground truncate w-[28%]">{p.companyName}</td>
                      <td className="px-4 py-3 text-foreground-muted font-mono text-xs truncate w-[30%]">{p.email}</td>
                      <td className="px-4 py-3 w-[22%]">
                        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", cfg.bg, cfg.color)}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground-muted w-[12%]">
                        {p.emailVerifiedAt ? new Date(p.emailVerifiedAt).toLocaleDateString("fr-CA") : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────

export default function EmailVerifierPage() {
  const searchParams = useSearchParams();
  const fromCampaign = searchParams.get("from") === "campaign";
  const campaignName = searchParams.get("campaign");

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  // Data state
  const [verifyStats, setVerifyStats] = useState<VerifyStats | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState<{ verified: number; total: number; startedAt: number } | null>(null);
  const [prospects, setProspects] = useState<VerifyProspect[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deepEnriching, setDeepEnriching] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Enrichment context
  const {
    enrichProgress,
    isRunning: enrichIsRunning,
    startPolling: startEnrichPolling,
    stopEnrichment,
    dismiss: dismissEnrich,
  } = useEnrichment();

  // ─── Data loaders ──────────────────────────────────────

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/verify-emails");
    if (res.ok) setVerifyStats(await res.json());
  }, []);

  const loadProspects = useCallback(async () => {
    const params = new URLSearchParams({ limit: "5000" });
    if (filter !== "all") params.set("emailStatus", filter);
    const res = await fetch(`/api/prospects?${params}`);
    if (res.ok) {
      const data = await res.json();
      setProspects(data.prospects ?? []);
    }
  }, [filter]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadProspects()]).finally(() => setLoading(false));
  }, [loadStats, loadProspects]);

  // Reload when filter changes
  useEffect(() => {
    setLoading(true);
    loadProspects().finally(() => setLoading(false));
  }, [filter, loadProspects]);

  // Auto-refresh when enrichment completes
  const prevEnrichStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentStatus = enrichProgress?.status;
    const prev = prevEnrichStatusRef.current;
    prevEnrichStatusRef.current = currentStatus;
    if (prev === "running" && (currentStatus === "done" || currentStatus === "cancelled")) {
      loadStats();
      loadProspects();
      if (currentStatus === "done") showToast("Enrichissement terminé — liste actualisée", "success");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichProgress?.status]);

  // ─── Actions ───────────────────────────────────────────

  async function runBulkVerify() {
    setVerifying(true);
    setVerifyProgress(null);
    let totalVerified = 0;
    const BATCH = 25;
    try {
      const r = await fetch("/api/verify-emails?ids=1");
      if (!r.ok) throw new Error("Impossible de récupérer les prospects");
      const { ids } = (await r.json()) as { ids: string[] };
      if (ids.length === 0) {
        showToast("Aucun email à vérifier", "success");
        return;
      }
      setVerifyProgress({ verified: 0, total: ids.length, startedAt: Date.now() });

      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const res = await fetch("/api/verify-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch }),
        });
        if (!res.ok) {
          const d = await res.json();
          showToast(d.error || "Erreur lors de la vérification", "error");
          return;
        }
        const data = await res.json();
        totalVerified += data.verified ?? 0;
        setVerifyProgress((prev) => ({
          verified: Math.min(i + BATCH, ids.length),
          total: ids.length,
          startedAt: prev?.startedAt ?? Date.now(),
        }));
      }

      showToast(`${totalVerified} emails vérifiés`, "success");
      await loadStats();
      await loadProspects();
    } catch {
      showToast("Erreur réseau lors de la vérification", "error");
    } finally {
      setVerifying(false);
      setVerifyProgress(null);
    }
  }

  async function runDeepEnrich() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeepEnriching(true);
    const res = await fetch("/api/prospects/deep-enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    setDeepEnriching(false);
    if (res.ok) {
      setSelected(new Set());
      startEnrichPolling();
    } else {
      showToast(data.error || "Erreur lors de l'approfondissement", "error");
    }
  }

  async function deleteSelectedProspects() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeletingSelected(true);
    const res = await fetch("/api/prospects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    setDeletingSelected(false);
    if (res.ok) {
      showToast(`${data.deleted} prospect(s) supprimé(s)`, "success");
      setSelected(new Set());
      await loadStats();
      await loadProspects();
    } else {
      showToast(data.error || "Erreur lors de la suppression", "error");
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      loadStats(),
      loadProspects(),
      new Promise((r) => setTimeout(r, 500)),
    ]);
    setRefreshing(false);
  }

  async function handleStopEnrich() {
    await stopEnrichment();
  }

  // ─── Derived state ────────────────────────────────────

  const filteredProspects = prospects.filter(
    (p) => p.email && (filter === "all" || (p.emailStatus ?? "unknown") === filter)
  );

  // ─── Render ───────────────────────────────────────────

  return (
    <div>
      <ToastContainer toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="Email Vérificateur"
        description="Détectez les adresses invalides, risquées ou jetables avant d'envoyer vos campagnes."
      />

      {/* Campaign redirect banner */}
      {fromCampaign && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Vérification requise avant envoi
            </p>
            <p className="text-foreground-muted mt-0.5">
              {campaignName
                ? `Vérifiez les emails avant d'envoyer la campagne « ${campaignName} ».`
                : "Vérifiez les emails de vos prospects avant d'envoyer votre campagne."}
              {" "}Une fois terminé, retournez à votre campagne pour procéder à l&apos;envoi.
            </p>
          </div>
        </motion.div>
      )}

      <div className="space-y-6">
        {/* Enrich progress bar */}
        {enrichProgress && (
          <JobProgressBar
            data={{
              type: "enrichment",
              status: enrichProgress.status === "done" ? "completed" : enrichProgress.status === "cancelled" ? "cancelled" : enrichProgress.status === "error" ? "failed" : "running",
              title: "Enrichissement approfondi",
              stepLabel: enrichProgress.currentProspect,
              processed: enrichProgress.enriched + enrichProgress.failed + enrichProgress.noData,
              total: enrichProgress.target,
              startedAt: enrichProgress.startedAt,
              secondaryLabel: [
                enrichProgress.enriched > 0 ? `${enrichProgress.enriched} enrichis` : null,
                enrichProgress.noData > 0 ? `${enrichProgress.noData} sans données` : null,
                enrichProgress.failed > 0 ? `${enrichProgress.failed} échoués` : null,
              ].filter(Boolean).join(", ") || undefined,
            }}
            onStop={enrichIsRunning ? handleStopEnrich : undefined}
            onDismiss={!enrichIsRunning ? dismissEnrich : undefined}
          />
        )}

        {/* Verify progress bar */}
        {verifyProgress && (
          <JobProgressBar
            data={{
              type: "enrichment",
              status: verifying ? "running" : "completed",
              title: "Vérification des emails",
              stepLabel: "",
              processed: verifyProgress.verified,
              total: verifyProgress.total,
              startedAt: verifyProgress.startedAt,
            }}
          />
        )}

        <div className="relative">
          {/* Loading overlay */}
          {refreshing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-card/70 backdrop-blur-[2px] rounded-lg"
            >
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-sm text-foreground-muted">Actualisation…</span>
              </div>
            </motion.div>
          )}

          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {STAT_CARDS.map(({ key, label, color }) => (
                <div
                  key={key}
                  className="bg-background-subtle border border-border rounded-lg p-3 text-center"
                >
                  <p className={`text-2xl font-bold tabular-nums ${color}`}>
                    {verifyStats ? (verifyStats[key as keyof VerifyStats] ?? 0) : "–"}
                  </p>
                  <p className="text-xs text-foreground-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={runBulkVerify} disabled={verifying}>
                {verifying ? (
                  <><Loader2 className="size-4 animate-spin" />Vérification en cours…</>
                ) : (
                  <><ShieldCheck className="size-4" />Vérifier tous les emails</>
                )}
              </Button>
              <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                {refreshing ? "Chargement…" : "Actualiser"}
              </Button>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm text-foreground-muted mr-1">Filtrer :</span>
              {FILTERS.map((f) => {
                const active = filter === f;
                const count = verifyStats && f !== "all" ? (verifyStats[f as keyof VerifyStats] ?? 0) : null;
                return (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setSelected(new Set()); }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-foreground-muted border-border hover:border-primary/40 hover:bg-background-subtle"
                    )}
                  >
                    {f === "all" ? "Tous" : EMAIL_STATUS_CONFIG[f]?.label ?? f}
                    {count !== null && count > 0 && (
                      <span className={cn("ml-1.5 opacity-70", active && "opacity-90")}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selection action bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-sm font-medium text-primary flex-1">
                  {selected.size} prospect{selected.size !== 1 ? "s" : ""} sélectionné{selected.size !== 1 ? "s" : ""}
                </span>
                <Button variant="secondary" onClick={runDeepEnrich} disabled={deepEnriching}>
                  {deepEnriching
                    ? <><Loader2 className="size-4 animate-spin" />Enrichissement…</>
                    : <><RefreshCw className="size-4" />Approfondir l&apos;enrichissement</>
                  }
                </Button>
                <Button
                  variant="secondary"
                  onClick={deleteSelectedProspects}
                  disabled={deletingSelected}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  {deletingSelected
                    ? <><Loader2 className="size-4 animate-spin" />Suppression…</>
                    : <><Trash2 className="size-4" />Supprimer</>
                  }
                </Button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="p-1 rounded-md text-foreground-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {/* Table */}
            <VerifyEmailsTable
              prospects={filteredProspects}
              loading={loading}
              selected={selected}
              onSelectedChange={setSelected}
              scrollRef={scrollRef}
            />

            {filteredProspects.length > 0 && (
              <p className="text-xs text-foreground-muted">
                {filteredProspects.length} résultat{filteredProspects.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
