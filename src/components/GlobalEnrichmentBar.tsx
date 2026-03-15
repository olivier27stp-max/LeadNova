"use client";

import { useEnrichment } from "./EnrichmentProvider";
import { useState } from "react";
import { usePathname } from "next/navigation";

export default function GlobalEnrichmentBar() {
  const { enrichProgress, isRunning, stopEnrichment, dismiss } = useEnrichment();
  const [minimized, setMinimized] = useState(false);
  const pathname = usePathname();

  // On prospects page, the full JobProgressBar is shown inline — hide this global one
  if (pathname === "/prospects") return null;

  if (!enrichProgress) return null;

  const { status, target, enriched, failed, noData, currentProspect } = enrichProgress;
  const processed = enriched + failed + noData;
  const pct = target > 0 ? Math.round((processed / target) * 100) : 0;
  const isDone = status === "done" || status === "cancelled" || status === "error";

  const barColor = isDone
    ? status === "done" ? "bg-success" : status === "cancelled" ? "bg-warning" : "bg-danger"
    : "bg-primary";

  const statusLabel = status === "running"
    ? `Enrichissement ${pct}%`
    : status === "done"
    ? "Enrichissement terminé"
    : status === "cancelled"
    ? "Enrichissement arrêté"
    : "Enrichissement échoué";

  if (minimized) {
    return (
      <div
        className="fixed top-3 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 shadow-lg border border-border bg-background cursor-pointer hover:bg-background-muted transition-colors"
        onClick={() => setMinimized(false)}
      >
        <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-primary animate-pulse" : barColor}`} />
        <span className="text-xs font-medium text-foreground-secondary">{statusLabel}</span>
      </div>
    );
  }

  return (
    <div className="fixed top-3 right-4 z-50 w-80 rounded-xl shadow-lg border border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-subtle border-b border-border">
        <span className="text-xs font-semibold text-foreground">{statusLabel}</span>
        <div className="flex items-center gap-1">
          {isRunning && (
            <button
              onClick={stopEnrichment}
              className="text-xs text-danger hover:text-danger/80 px-1.5 py-0.5 rounded hover:bg-danger/10 transition-colors"
            >
              Arrêter
            </button>
          )}
          <button
            onClick={() => setMinimized(true)}
            className="text-foreground-muted hover:text-foreground px-1 text-sm"
            title="Réduire"
          >
            −
          </button>
          {isDone && (
            <button
              onClick={dismiss}
              className="text-foreground-muted hover:text-foreground px-1 text-sm"
              title="Fermer"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-background-muted">
        <div
          className={`h-full ${barColor} transition-all duration-500 ease-out`}
          style={{ width: `${isDone ? 100 : pct}%` }}
        />
      </div>

      {/* Details */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between text-xs text-foreground-secondary">
          <span>{processed}/{target}</span>
          <span>
            {enriched > 0 && <span className="text-success">{enriched} enrichis</span>}
            {noData > 0 && <span className="text-foreground-muted ml-1.5">{noData} sans données</span>}
            {failed > 0 && <span className="text-danger ml-1.5">{failed} échoués</span>}
          </span>
        </div>
        {isRunning && currentProspect && (
          <p className="text-xs text-foreground-muted mt-1 truncate">
            {currentProspect}
          </p>
        )}
      </div>
    </div>
  );
}
