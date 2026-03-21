"use client";

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubData {
  plan: string;
  maxDiscoveriesPerMonth: number;
  discoveriesUsedThisMonth: number;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export default function DiscoveryCounter() {
  const [sub, setSub] = useState<SubData | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.subscription) setSub(d.subscription);
      })
      .catch(() => {});
  }, []);

  // Refresh every 30s to stay current after discoveries
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.subscription) setSub(d.subscription);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!sub) return null;

  const used = sub.discoveriesUsedThisMonth || 0;
  const max = sub.maxDiscoveriesPerMonth || 5000;
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const isHigh = percent >= 80;
  const isMax = percent >= 100;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium tabular-nums cursor-default transition-colors",
          isMax
            ? "text-danger bg-danger-subtle border border-danger/20"
            : isHigh
              ? "text-warning bg-warning-subtle border border-warning/20"
              : "text-foreground-muted bg-background-subtle border border-border"
        )}
      >
        <Search className="size-3" />
        <span>{used.toLocaleString("fr-CA")}</span>
        <span className="text-foreground-muted/60">/</span>
        <span>{max.toLocaleString("fr-CA")}</span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-card border border-border rounded-xl shadow-lg p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Decouvertes ce mois</span>
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              isMax ? "bg-danger-subtle text-danger" : isHigh ? "bg-warning-subtle text-warning" : "bg-primary-subtle text-primary"
            )}>
              {PLAN_LABELS[sub.plan] || sub.plan}
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="w-full h-2 bg-background-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isMax ? "bg-danger" : isHigh ? "bg-warning" : "bg-primary"
                )}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className={cn(
                "text-sm font-bold tabular-nums",
                isMax ? "text-danger" : isHigh ? "text-warning" : "text-foreground"
              )}>
                {percent}%
              </span>
              <span className="text-[11px] text-foreground-muted">
                {used.toLocaleString("fr-CA")} / {max.toLocaleString("fr-CA")} decouvertes
              </span>
            </div>
          </div>

          {/* Upgrade notice */}
          {percent >= 50 && (
            <div className={cn(
              "rounded-lg px-3 py-2 text-[11px] leading-relaxed",
              isMax ? "bg-danger-subtle text-danger" : "bg-background-subtle text-foreground-muted"
            )}>
              {isMax ? (
                <span><strong>Limite atteinte.</strong> Passez au plan superieur pour continuer vos decouvertes.</span>
              ) : isHigh ? (
                <span>Vous approchez de votre limite. <strong>Passez au plan superieur</strong> pour augmenter votre balance.</span>
              ) : (
                <span>Passez au plan superieur pour plus de decouvertes mensuelles.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
