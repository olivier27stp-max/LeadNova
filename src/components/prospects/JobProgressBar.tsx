"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { computeEta, type EtaSnapshot } from "@/lib/eta-calculator";

// --------------- Types ---------------

export type JobStatus =
  | "idle"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type JobType = "discovery" | "enrichment";

export interface JobProgressData {
  type: JobType;
  status: JobStatus;
  /** Job title – e.g. "Recherche en cours" */
  title: string;
  /** Current step description */
  stepLabel: string;
  /** Items processed so far */
  processed: number;
  /** Total items expected */
  total: number;
  /** Timestamp (ms) when the job started */
  startedAt: number;
  /** Optional: current step index (e.g. city 3 of 10) */
  currentStep?: number;
  /** Optional: total steps */
  totalSteps?: number;
  /** Optional: step unit label – e.g. "ville", "prospect" */
  stepUnit?: string;
  /** Optional secondary counter label – e.g. "284 prospects trouvés" */
  secondaryLabel?: string;
  /** Optional error message */
  error?: string;
}

interface JobProgressBarProps {
  data: JobProgressData;
  onStop?: () => void;
  onDismiss?: () => void;
}

// --------------- Colour maps ---------------

const STATUS_COLORS: Record<JobStatus, { bg: string; bar: string; text: string; border: string }> = {
  idle:      { bg: "bg-background-subtle",  bar: "bg-foreground-muted",  text: "text-foreground-muted",    border: "border-border" },
  queued:    { bg: "bg-warning-subtle",     bar: "bg-warning",           text: "text-warning",             border: "border-warning/20" },
  running:   { bg: "",                       bar: "",                     text: "",                         border: "" },
  paused:    { bg: "bg-warning-subtle",     bar: "bg-warning",           text: "text-warning",             border: "border-warning/20" },
  completed: { bg: "bg-success-subtle",     bar: "bg-success",           text: "text-success",             border: "border-success/20" },
  failed:    { bg: "bg-danger-subtle",      bar: "bg-danger",            text: "text-danger",              border: "border-danger/20" },
  cancelled: { bg: "bg-warning-subtle",     bar: "bg-warning",           text: "text-warning",             border: "border-warning/20" },
};

const TYPE_RUNNING_COLORS: Record<JobType, { bg: string; bar: string; text: string; border: string }> = {
  discovery:   { bg: "bg-primary-subtle",       bar: "bg-primary",       text: "text-primary",       border: "border-primary/20" },
  enrichment:  { bg: "bg-background-subtle",    bar: "bg-foreground-muted", text: "text-foreground-secondary", border: "border-border" },
};

const STATUS_LABELS: Record<JobStatus, string> = {
  idle: "",
  queued: "En attente de démarrage",
  running: "",
  paused: "En pause",
  completed: "Terminé",
  failed: "Erreur",
  cancelled: "Annulé",
};

// --------------- Component ---------------

export default function JobProgressBar({ data, onStop, onDismiss }: JobProgressBarProps) {
  const { type, status, title, stepLabel, processed, total, startedAt, currentStep, totalSteps, stepUnit, secondaryLabel, error } = data;

  // ETA state (persisted across renders via refs for smoothing)
  const smoothedRateRef = useRef<number | null>(null);
  const sampleCountRef = useRef(0);
  const [eta, setEta] = useState<EtaSnapshot | null>(null);
  const [minimized, setMinimized] = useState(false);

  // Reset ETA state when job restarts
  const prevStartedAtRef = useRef(startedAt);
  if (startedAt !== prevStartedAtRef.current) {
    smoothedRateRef.current = null;
    sampleCountRef.current = 0;
    prevStartedAtRef.current = startedAt;
  }

  // Compute ETA — runs on data change AND on a 2s interval so the
  // display stays alive even when progress stalls on a slow item.
  const updateEta = useCallback(() => {
    if (status !== "running" || total <= 0) {
      setEta(null);
      return;
    }
    const [snapshot, newRate, newCount] = computeEta(
      processed,
      total,
      startedAt,
      smoothedRateRef.current,
      sampleCountRef.current,
    );
    smoothedRateRef.current = newRate;
    sampleCountRef.current = newCount;
    setEta(snapshot);
  }, [processed, total, startedAt, status]);

  // Re-run on data changes
  useEffect(() => {
    updateEta();
  }, [updateEta]);

  // Periodic refresh so ETA ticks even when processed doesn't change
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(updateEta, 2000);
    return () => clearInterval(id);
  }, [status, updateEta]);

  // Colours
  const colors = status === "running" ? TYPE_RUNNING_COLORS[type] : STATUS_COLORS[status];
  const percent = total > 0 ? Math.min(100, (processed / total) * 100) : 0;

  // Don't render idle
  if (status === "idle") return null;

  // --------------- Minimized view ---------------
  if (minimized) {
    return (
      <div
        className={`mb-3 p-2 rounded-md border cursor-pointer flex items-center gap-3 ${colors.bg} ${colors.border}`}
        onClick={() => setMinimized(false)}
      >
        {status === "running" && (
          <div className="w-3 h-3 border-2 border-foreground-muted border-t-transparent rounded-full animate-spin" />
        )}
        <span className={`text-sm font-medium ${colors.text} truncate flex-1`}>{title}</span>
        <span className="text-xs font-mono font-bold text-foreground-secondary">{Math.round(percent)}%</span>
        <div className="w-24 bg-background-muted rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all duration-500 ${colors.bar}`} style={{ width: `${percent}%` }} />
        </div>
        {eta && status === "running" && (
          <span className="text-xs text-foreground-muted whitespace-nowrap">{eta.remainingLabel}</span>
        )}
      </div>
    );
  }

  // --------------- Full view ---------------
  return (
    <div className={`mb-4 rounded-md border shadow-sm overflow-hidden ${colors.bg} ${colors.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          {status === "running" && (
            <div className="w-4 h-4 border-2 border-foreground-muted border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {status === "completed" && (
            <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          )}
          {status === "failed" && (
            <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          )}
          {status === "paused" && (
            <svg className="w-4 h-4 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
          )}
          <span className={`text-sm font-semibold truncate ${colors.text}`}>
            {title}
            {STATUS_LABELS[status] ? ` — ${STATUS_LABELS[status]}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Percentage */}
          <span className="text-sm font-mono font-bold text-foreground-secondary">
            {Math.round(percent)}%
          </span>

          {/* Minimize */}
          <button
            onClick={() => setMinimized(true)}
            className="text-foreground-muted hover:text-foreground p-0.5"
            title="Réduire"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" /></svg>
          </button>

          {/* Stop / Dismiss */}
          {status === "running" && onStop ? (
            <button
              onClick={onStop}
              className="text-xs bg-danger-subtle text-danger px-2 py-1 rounded hover:bg-danger/10 transition-colors"
            >
              Arrêter
            </button>
          ) : status !== "running" && onDismiss ? (
            <button onClick={onDismiss} className="text-foreground-muted hover:text-foreground text-sm">
              &times;
            </button>
          ) : null}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-1.5">
        <div className="w-full bg-background-muted rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-700 ease-out ${colors.bar}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Details row */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {/* Counter */}
        <span className="text-xs font-mono font-bold text-foreground-secondary">
          {processed} / {total}
        </span>

        {/* Step label */}
        {stepLabel && status === "running" && (
          <span className="text-xs text-foreground-muted truncate max-w-[200px]">
            {stepLabel}
          </span>
        )}

        {/* Step progress (ville X sur Y) */}
        {currentStep != null && totalSteps != null && totalSteps > 1 && status === "running" && (
          <span className="text-xs text-foreground-muted">
            {stepUnit ? `${stepUnit.charAt(0).toUpperCase() + stepUnit.slice(1)} ` : "Étape "}
            {currentStep} sur {totalSteps}
          </span>
        )}

        {/* Secondary label */}
        {secondaryLabel && (
          <span className="text-xs text-foreground-muted">
            {secondaryLabel}
          </span>
        )}

        {/* Error */}
        {error && status === "failed" && (
          <span className="text-xs text-danger truncate max-w-[300px]">
            {error}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* ETA section */}
        {eta && status === "running" && (
          <div className="flex items-center gap-3 text-xs text-foreground-muted">
            {eta.speedLabel && (
              <span>{eta.speedLabel}</span>
            )}
            {eta.endTimeLabel && !isNaN(eta.remainingSeconds) && (
              <span>Fin ~{eta.endTimeLabel}</span>
            )}
            {eta.remainingLabel && (
              <span className="font-medium text-foreground-secondary">
                {eta.remainingLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
