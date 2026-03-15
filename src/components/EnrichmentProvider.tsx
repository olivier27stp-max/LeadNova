"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

// ---------- Types ----------
export interface EnrichProgressData {
  status: string;
  target: number;
  enriched: number;
  failed: number;
  noData: number;
  currentProspect: string;
  startedAt: number;
}

interface EnrichmentContextValue {
  enrichProgress: EnrichProgressData | null;
  isRunning: boolean;
  /** Start polling (called after triggering enrichment) */
  startPolling: () => void;
  /** Stop the current enrichment job */
  stopEnrichment: () => Promise<void>;
  /** Dismiss the progress bar */
  dismiss: () => void;
  /** Set initial progress optimistically when starting a job */
  setOptimisticProgress: (progress: EnrichProgressData) => void;
}

const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

export function useEnrichment() {
  const ctx = useContext(EnrichmentContext);
  if (!ctx) throw new Error("useEnrichment must be used within EnrichmentProvider");
  return ctx;
}

// ---------- Provider ----------
const POLL_INTERVAL = 2000;

export default function EnrichmentProvider({ children }: { children: React.ReactNode }) {
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgressData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/prospects/enrich");
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "running") {
          setEnrichProgress({
            status: "running",
            target: data.target || 0,
            enriched: data.enriched || 0,
            failed: data.failed || 0,
            noData: data.noData || 0,
            currentProspect: data.currentProspect || "",
            startedAt: data.startedAt || Date.now(),
          });
        } else if (data.status === "done" || data.status === "cancelled" || data.status === "error") {
          setEnrichProgress({
            status: data.status,
            target: data.target || 0,
            enriched: data.enriched || 0,
            failed: data.failed || 0,
            noData: data.noData || 0,
            currentProspect: "",
            startedAt: data.startedAt || Date.now(),
          });
          stopPolling();
          // Auto-dismiss after 8 seconds
          dismissTimerRef.current = setTimeout(() => setEnrichProgress(null), 8000);
        } else if (data.status === "idle") {
          stopPolling();
          setEnrichProgress(null);
        }
      } catch {
        // ignore polling errors
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  const stopEnrichment = useCallback(async () => {
    try {
      await fetch("/api/prospects/enrich", { method: "DELETE" });
    } catch {
      // ignore
    }
  }, []);

  const dismiss = useCallback(() => {
    setEnrichProgress(null);
    stopPolling();
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = undefined;
    }
  }, [stopPolling]);

  const setOptimisticProgress = useCallback((progress: EnrichProgressData) => {
    setEnrichProgress(progress);
  }, []);

  // On mount: check if enrichment is already running (e.g. started before navigation)
  useEffect(() => {
    fetch("/api/prospects/enrich")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.status === "running") {
          setEnrichProgress({
            status: "running",
            target: data.target || 0,
            enriched: data.enriched || 0,
            failed: data.failed || 0,
            noData: data.noData || 0,
            currentProspect: data.currentProspect || "",
            startedAt: data.startedAt || Date.now(),
          });
          startPolling();
        }
      })
      .catch(() => {});
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRunning = enrichProgress?.status === "running";

  return (
    <EnrichmentContext.Provider value={{ enrichProgress, isRunning, startPolling, stopEnrichment, dismiss, setOptimisticProgress }}>
      {children}
    </EnrichmentContext.Provider>
  );
}
