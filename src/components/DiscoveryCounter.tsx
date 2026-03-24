"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/LanguageProvider";

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
  const { t } = useTranslation();
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
      {/* Compact icon trigger */}
      <div
        className={cn(
          "flex items-center justify-center size-8 rounded-md cursor-default transition-all",
          isMax
            ? "text-danger bg-danger-subtle"
            : isHigh
              ? "text-warning bg-warning-subtle"
              : "text-foreground-muted hover:text-foreground hover:bg-background-subtle"
        )}
      >
        <Zap className={cn("size-4", showTooltip && "scale-110 transition-transform")} />
      </div>

      {/* Tooltip — pt-2 creates a hover bridge so the mouse can travel from icon to tooltip */}
      {showTooltip && (
        <div className="absolute right-0 top-full pt-2 z-50">
        <div className="w-64 bg-card border border-border rounded-xl shadow-lg p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{t("discovery", "monthlyTitle")}</span>
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
              <span className="text-[11px] text-foreground-muted tabular-nums">
                {used.toLocaleString("fr-CA")} / {max.toLocaleString("fr-CA")} {t("discovery", "discoveries")}
              </span>
            </div>
          </div>

          {/* Context message */}
          <p className="text-[11px] leading-relaxed text-foreground-muted">
            {isMax
              ? t("discovery", "limitReached")
              : isHigh
                ? t("discovery", "approachingLimit")
                : t("discovery", "usageMessage").replace("{percent}", String(percent))
            }
          </p>

          {/* CTA */}
          <Link
            href="/settings?section=subscription"
            className={cn(
              "flex items-center justify-center w-full text-xs font-semibold py-2 rounded-lg transition-colors",
              isMax || isHigh
                ? "bg-primary text-white hover:bg-primary-hover"
                : "bg-background-subtle text-foreground-muted hover:text-foreground hover:bg-background-muted"
            )}
          >
            {t("discovery", "seePlans")}
          </Link>
        </div>
        </div>
      )}
    </div>
  );
}
