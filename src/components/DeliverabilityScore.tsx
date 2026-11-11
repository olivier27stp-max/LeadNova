"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { scoreEmailDeliverability } from "@/lib/deliverability-score";

const LEVELS = {
  excellent: { label: "Excellent", text: "text-success", bar: "bg-success", chip: "bg-success-subtle text-success" },
  good: { label: "Bon", text: "text-success", bar: "bg-success", chip: "bg-success-subtle text-success" },
  risky: { label: "Risqué", text: "text-warning", bar: "bg-warning", chip: "bg-warning-subtle text-warning" },
  danger: { label: "Danger", text: "text-danger", bar: "bg-danger", chip: "bg-danger-subtle text-danger" },
} as const;

const SEVERITY_DOT = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-foreground-muted",
} as const;

/** Score de sécurité (anti-indésirables) d'un sujet + corps, mis à jour pendant la rédaction. */
export function DeliverabilityScore({ subject, body, isFollowUp = false }: { subject: string; body: string; isFollowUp?: boolean }) {
  const result = useMemo(() => scoreEmailDeliverability(subject, body, { isFollowUp }), [subject, body, isFollowUp]);
  const [open, setOpen] = useState(false);

  if (!subject.trim() && !body.trim()) return null;

  const lvl = LEVELS[result.level];
  const Icon = result.level === "excellent" || result.level === "good" ? ShieldCheck : ShieldAlert;

  return (
    <div className="rounded-md border border-border bg-background-subtle p-3 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <Icon className={cn("size-5 shrink-0", lvl.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Score de sécurité</span>
            <span className={cn("font-mono text-sm font-semibold tabular-nums", lvl.text)}>{result.score} %</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", lvl.chip)}>{lvl.label}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-background-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", lvl.bar)} style={{ width: `${result.score}%` }} />
          </div>
        </div>
        <span className="text-xs text-foreground-muted shrink-0 tabular-nums">
          {result.wordCount} mots · {result.linkCount} lien{result.linkCount > 1 ? "s" : ""}
        </span>
        <ChevronDown className={cn("size-4 text-foreground-muted shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="pt-1 space-y-2">
          {result.issues.length === 0 ? (
            <p className="text-xs text-foreground-secondary">Aucun problème détecté dans le texte. Le reste dépend de ton domaine, du réchauffement et de la liste.</p>
          ) : (
            <ul className="space-y-2">
              {result.issues.map((issue, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className={cn("mt-1.5 size-1.5 rounded-full shrink-0", SEVERITY_DOT[issue.severity])} />
                  <div className="min-w-0">
                    <p className="text-foreground">
                      {issue.label} <span className="text-foreground-muted tabular-nums">(−{issue.penalty})</span>
                    </p>
                    <p className="text-foreground-muted">{issue.tip}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-foreground-muted">
            Estimation basée sur le texte seulement. Le lien de désabonnement et ton adresse sont ajoutés automatiquement à l&apos;envoi.
          </p>
        </div>
      )}
    </div>
  );
}
