"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/LanguageProvider";
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

type TFn = (section: "emailVerifier", key: string) => string;

function getEmailStatusConfig(t: TFn): EmailStatusConfig {
  return {
    valid: { label: t("emailVerifier", "statusValid"), color: "text-success", bg: "bg-success/10", icon: <CheckCircle2 className="size-4 text-success" /> },
    risky: { label: t("emailVerifier", "statusRisky"), color: "text-warning", bg: "bg-warning/10", icon: <AlertCircle className="size-4 text-warning" /> },
    invalid: { label: t("emailVerifier", "statusInvalid"), color: "text-destructive", bg: "bg-destructive/10", icon: <XCircle className="size-4 text-destructive" /> },
    "catch-all": { label: t("emailVerifier", "statusCatchAll"), color: "text-accent", bg: "bg-accent/10", icon: <AlertTriangle className="size-4 text-accent" /> },
    disposable: { label: t("emailVerifier", "statusDisposable"), color: "text-destructive", bg: "bg-destructive/10", icon: <XCircle className="size-4 text-destructive" /> },
    unknown: { label: t("emailVerifier", "statusUnknown"), color: "text-foreground-muted", bg: "bg-foreground/5", icon: <HelpCircle className="size-4 text-foreground-muted" /> },
  };
}

function getStatCards(t: TFn) {
  return [
    { key: "total", label: t("emailVerifier", "statTotal"), color: "text-foreground" },
    { key: "valid", label: t("emailVerifier", "statValid"), color: "text-success" },
    { key: "risky", label: t("emailVerifier", "statRisky"), color: "text-warning" },
    { key: "invalid", label: t("emailVerifier", "statInvalid"), color: "text-destructive" },
    { key: "disposable", label: t("emailVerifier", "statDisposable"), color: "text-destructive" },
    { key: "unknown", label: t("emailVerifier", "statUnverified"), color: "text-foreground-muted" },
  ] as const;
}

const FILTERS = ["all", "valid", "risky", "invalid", "disposable", "unknown"] as const;

// ─── Virtualized Table ───────────────────────────────────

const ROW_HEIGHT = 48;

function VerifyEmailsTable({
  prospects,
  loading,
  selected,
  onSelectedChange,
  scrollRef,
  t,
}: {
  prospects: VerifyProspect[];
  loading: boolean;
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  t: TFn;
}) {
  const emailStatusConfig = getEmailStatusConfig(t);
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
        {t("emailVerifier", "noProspectsWithEmail")}
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
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[28%]">{t("emailVerifier", "tableCompany")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[30%]">{t("emailVerifier", "tableEmail")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[22%]">{t("emailVerifier", "tableStatus")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-foreground-muted w-[12%]">{t("emailVerifier", "tableVerifiedAt")}</th>
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
              ? { label: t("emailVerifier", "statusDefinitelyInvalid"), color: "text-destructive", bg: "bg-destructive/10", icon: <XCircle className="size-4 text-destructive" /> }
              : (emailStatusConfig[s] ?? emailStatusConfig.unknown);
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

export default function EmailVerifierPageWrapper() {
  return (
    <Suspense>
      <EmailVerifierPage />
    </Suspense>
  );
}

function EmailVerifierPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const fromCampaign = searchParams.get("from") === "campaign";
  const campaignName = searchParams.get("campaign");
  const emailStatusConfig = getEmailStatusConfig(t as TFn);
  const statCards = getStatCards(t as TFn);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  // Data state
  const [verifyStats, setVerifyStats] = useState<VerifyStats | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState<{
    verified: number;
    total: number;
    startedAt: number;
    stepLabel: string;
    stats: { valid: number; risky: number; invalid: number; disposable: number; unknown: number };
    done: boolean;
    cancelled: boolean;
  } | null>(null);
  const verifyAbortRef = useRef(false);
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
      if (currentStatus === "done") showToast(t("emailVerifier", "enrichmentDoneRefreshed"), "success");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichProgress?.status]);

  // ─── Actions ───────────────────────────────────────────

  async function runBulkVerify() {
    setVerifying(true);
    verifyAbortRef.current = false;
    const BATCH = 25;
    const runningStats = { valid: 0, risky: 0, invalid: 0, disposable: 0, unknown: 0 };
    let totalVerified = 0;
    try {
      const r = await fetch("/api/verify-emails?ids=1");
      if (!r.ok) throw new Error(t("emailVerifier", "errorFetchProspects"));
      const { ids } = (await r.json()) as { ids: string[] };
      if (ids.length === 0) {
        showToast(t("emailVerifier", "noEmailsToVerify"), "success");
        setVerifying(false);
        return;
      }
      setVerifyProgress({
        verified: 0, total: ids.length, startedAt: Date.now(),
        stepLabel: "", stats: { ...runningStats }, done: false, cancelled: false,
      });

      for (let i = 0; i < ids.length; i += BATCH) {
        if (verifyAbortRef.current) {
          setVerifyProgress((prev) => prev ? { ...prev, cancelled: true } : prev);
          showToast(t("emailVerifier", "verificationCancelled"), "success");
          break;
        }
        const batch = ids.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;
        const totalBatches = Math.ceil(ids.length / BATCH);
        setVerifyProgress((prev) => ({
          verified: prev?.verified ?? 0,
          total: ids.length,
          startedAt: prev?.startedAt ?? Date.now(),
          stepLabel: `Lot ${batchNum} / ${totalBatches}`,
          stats: { ...runningStats },
          done: false,
          cancelled: false,
        }));

        const res = await fetch("/api/verify-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch }),
        });
        if (!res.ok) {
          const d = await res.json();
          showToast(d.error || t("emailVerifier", "errorVerification"), "error");
          setVerifyProgress((prev) => prev ? { ...prev, done: true } : prev);
          break;
        }
        const data = await res.json();
        totalVerified += data.verified ?? 0;
        // Accumulate stats
        if (data.stats) {
          for (const k of Object.keys(runningStats) as (keyof typeof runningStats)[]) {
            runningStats[k] += data.stats[k] ?? 0;
          }
        }
        setVerifyProgress((prev) => ({
          verified: Math.min(i + BATCH, ids.length),
          total: ids.length,
          startedAt: prev?.startedAt ?? Date.now(),
          stepLabel: `Lot ${batchNum} / ${totalBatches}`,
          stats: { ...runningStats },
          done: false,
          cancelled: false,
        }));
      }

      if (!verifyAbortRef.current) {
        showToast(`${totalVerified} ${t("emailVerifier", "emailsVerified")}`, "success");
      }
      await loadStats();
      await loadProspects();
    } catch {
      showToast(t("emailVerifier", "networkErrorVerification"), "error");
    } finally {
      setVerifying(false);
      setVerifyProgress((prev) => prev ? { ...prev, done: true } : null);
    }
  }

  function stopVerify() {
    verifyAbortRef.current = true;
  }

  function dismissVerifyProgress() {
    setVerifyProgress(null);
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
      showToast(data.error || t("emailVerifier", "errorDeepEnrich"), "error");
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
      showToast(`${data.deleted} ${t("emailVerifier", "prospectsDeleted")}`, "success");
      setSelected(new Set());
      await loadStats();
      await loadProspects();
    } else {
      showToast(data.error || t("emailVerifier", "errorDeletion"), "error");
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
        title={t("emailVerifier", "title")}
        description={t("emailVerifier", "description")}
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
              {t("emailVerifier", "verificationRequired")}
            </p>
            <p className="text-foreground-muted mt-0.5">
              {campaignName
                ? `${t("emailVerifier", "verifyCampaignEmails")} « ${campaignName} ».`
                : t("emailVerifier", "verifyProspectEmails")}
              {" "}{t("emailVerifier", "onceDoneReturn")}
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
              title: t("emailVerifier", "deepEnrichTitle"),
              stepLabel: enrichProgress.currentProspect,
              processed: enrichProgress.enriched + enrichProgress.failed + enrichProgress.noData,
              total: enrichProgress.target,
              startedAt: enrichProgress.startedAt,
              secondaryLabel: [
                enrichProgress.enriched > 0 ? `${enrichProgress.enriched} ${t("emailVerifier", "enriched")}` : null,
                enrichProgress.noData > 0 ? `${enrichProgress.noData} ${t("emailVerifier", "noData")}` : null,
                enrichProgress.failed > 0 ? `${enrichProgress.failed} ${t("emailVerifier", "failed")}` : null,
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
              status: verifyProgress.cancelled ? "cancelled" : verifying ? "running" : verifyProgress.done ? "completed" : "running",
              title: t("emailVerifier", "verificationTitle"),
              stepLabel: verifyProgress.stepLabel,
              processed: verifyProgress.verified,
              total: verifyProgress.total,
              startedAt: verifyProgress.startedAt,
              secondaryLabel: [
                verifyProgress.stats.valid > 0 ? `${verifyProgress.stats.valid} ${t("emailVerifier", "statusValid").toLowerCase()}` : null,
                verifyProgress.stats.risky > 0 ? `${verifyProgress.stats.risky} ${t("emailVerifier", "statusRisky").toLowerCase()}` : null,
                verifyProgress.stats.invalid > 0 ? `${verifyProgress.stats.invalid} ${t("emailVerifier", "statusInvalid").toLowerCase()}` : null,
                verifyProgress.stats.disposable > 0 ? `${verifyProgress.stats.disposable} ${t("emailVerifier", "statusDisposable").toLowerCase()}` : null,
              ].filter(Boolean).join(", ") || undefined,
            }}
            onStop={verifying ? stopVerify : undefined}
            onDismiss={!verifying && verifyProgress.done ? dismissVerifyProgress : undefined}
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
                <span className="text-sm text-foreground-muted">{t("emailVerifier", "refreshing")}</span>
              </div>
            </motion.div>
          )}

          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {statCards.map(({ key, label, color }) => (
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
                  <><Loader2 className="size-4 animate-spin" />{t("emailVerifier", "verifyingInProgress")}</>
                ) : (
                  <><ShieldCheck className="size-4" />{t("emailVerifier", "verifyAll")}</>
                )}
              </Button>
              <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                {refreshing ? t("emailVerifier", "refreshLoading") : t("emailVerifier", "refresh")}
              </Button>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm text-foreground-muted mr-1">{t("emailVerifier", "filterLabel")}</span>
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
                    {f === "all" ? t("emailVerifier", "filterAll") : emailStatusConfig[f]?.label ?? f}
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
                  {selected.size} {selected.size !== 1 ? t("emailVerifier", "prospectsSelected") : t("emailVerifier", "prospectSelected")}
                </span>
                <Button variant="secondary" onClick={runDeepEnrich} disabled={deepEnriching}>
                  {deepEnriching
                    ? <><Loader2 className="size-4 animate-spin" />{t("emailVerifier", "deepEnriching")}</>
                    : <><RefreshCw className="size-4" />{t("emailVerifier", "deepEnrich")}</>
                  }
                </Button>
                <Button
                  variant="secondary"
                  onClick={deleteSelectedProspects}
                  disabled={deletingSelected}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  {deletingSelected
                    ? <><Loader2 className="size-4 animate-spin" />{t("emailVerifier", "deleting")}</>
                    : <><Trash2 className="size-4" />{t("emailVerifier", "deleteBtn")}</>
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
              t={t as TFn}
            />

            {filteredProspects.length > 0 && (
              <p className="text-xs text-foreground-muted">
                {filteredProspects.length} {filteredProspects.length !== 1 ? t("emailVerifier", "results") : t("emailVerifier", "result")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
