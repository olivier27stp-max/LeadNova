"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CALL_OUTCOMES, CALL_WHO, CURRENT_TOOLS, OBJECTIONS, SALES_STAGES, LOST_REASONS,
} from "@/lib/call-options";
import { PIPELINE_STAGES } from "@/lib/sales-stages";

export interface InsightsProspect {
  id: string;
  hiring?: boolean | null;
  hiringEvidence?: string | null;
  complaintCount?: number | null;
  complaintEvidence?: string | null;
  ownerRepliesReviews?: boolean | null;
  reviewsLast6m?: number | null;
  reviewsSampleSize?: number | null;
  reviewsSource?: string | null;
  onlineBooking?: boolean | null;
  onlinePayment?: boolean | null;
  bookingTool?: string | null;
  teamsCount?: number | null;
  teamsEvidence?: string | null;
  serviceSegment?: string | null;
  siteAnalyzedAt?: string | null;
  emailOpenCount?: number | null;
  emailClickCount?: number | null;
  siteVisitCount?: number | null;
  lastReplySentiment?: string | null;
  currentTool?: string | null;
  employeeCount?: number | null;
  salesStage?: string | null;
  lostReason?: string | null;
  callbackAt?: string | null;
  engagement?: { score: number; reasons: string[]; hot: boolean };
}

interface CallEntry {
  id: string;
  createdAt: string;
  outcome: keyof typeof CALL_OUTCOMES;
  whoAnswered: keyof typeof CALL_WHO | null;
  currentTool: keyof typeof CURRENT_TOOLS | null;
  employeeCount: number | null;
  objection: keyof typeof OBJECTIONS | null;
  callbackAt: string | null;
  notes: string | null;
}

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Réponse positive",
  neutral: "Réponse neutre",
  negative: "Réponse négative",
  out_of_office: "Réponse d'absence",
  unsubscribe: "A demandé d'arrêter",
};

function Chips<T extends string>({
  options, value, onChange, tone = "primary",
}: {
  options: Record<T, string>;
  value: T | null;
  onChange: (v: T | null) => void;
  tone?: "primary" | "success";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(options) as T[]).map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(active ? null : key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              active
                ? tone === "success" ? "bg-success text-white border-success" : "bg-primary text-white border-primary"
                : "border-border text-foreground-secondary hover:bg-background-subtle",
            )}
          >
            {options[key]}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-2">
      <span className="pt-1 text-xs font-medium text-foreground-muted">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ProspectInsights({ prospect, onChanged }: { prospect: InsightsProspect; onChanged: () => void }) {
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [outcome, setOutcome] = useState<keyof typeof CALL_OUTCOMES | null>(null);
  const [who, setWho] = useState<keyof typeof CALL_WHO | null>(null);
  const [tool, setTool] = useState<keyof typeof CURRENT_TOOLS | null>((prospect.currentTool as keyof typeof CURRENT_TOOLS) || null);
  const [employees, setEmployees] = useState<string>(prospect.employeeCount ? String(prospect.employeeCount) : "");
  const [objection, setObjection] = useState<keyof typeof OBJECTIONS | null>(null);
  const [callback, setCallback] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<string | null>(prospect.salesStage ?? null);
  // L'étape peut changer côté serveur (appel « setting/closing call pris », réponse positive)
  useEffect(() => { setStage(prospect.salesStage ?? null); }, [prospect.salesStage]);
  const [lostReason, setLostReason] = useState<string | null>(prospect.lostReason ?? null);

  const loadCalls = useCallback(async () => {
    const res = await fetch(`/api/prospects/calls?prospectId=${prospect.id}`);
    if (res.ok) setCalls((await res.json()).calls || []);
  }, [prospect.id]);
  useEffect(() => { loadCalls(); }, [loadCalls]);

  async function saveCall() {
    if (!outcome) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prospects/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: prospect.id,
          outcome,
          whoAnswered: who,
          currentTool: tool,
          employeeCount: employees ? Number(employees) : null,
          objection,
          callbackAt: callback ? new Date(callback).toISOString() : null,
          notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erreur");
      setOutcome(null); setWho(null); setObjection(null); setCallback(""); setNotes("");
      await loadCalls();
      onChanged();
    } catch (e) {
      alert(`Appel non enregistré : ${e instanceof Error ? e.message : "erreur"}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveStage(next: string | null, reason: string | null = null) {
    setStage(next);
    setLostReason(reason);
    const res = await fetch("/api/prospects/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: prospect.id, salesStage: next ?? "", lostReason: reason }),
    });
    if (res.ok) onChanged();
  }

  // ── Signaux ──
  const signals: Array<{ label: string; title?: string | null; good?: boolean }> = [];
  if (prospect.hiring) signals.push({ label: "Embauche en cours", title: prospect.hiringEvidence, good: true });
  if ((prospect.complaintCount ?? 0) > 0) signals.push({ label: `${prospect.complaintCount} avis se plaignent du suivi`, title: prospect.complaintEvidence, good: true });
  if (prospect.ownerRepliesReviews) signals.push({ label: "Le propriétaire répond aux avis", good: true });
  if (prospect.reviewsLast6m != null) signals.push({ label: `${prospect.reviewsLast6m} avis en 6 mois${prospect.reviewsSampleSize ? ` (sur ${prospect.reviewsSampleSize} lus)` : ""}`, good: prospect.reviewsLast6m >= 5 });
  if (prospect.onlineBooking || prospect.onlinePayment) signals.push({ label: `En ligne : ${prospect.bookingTool || "réservation/paiement"}`, good: true });
  if (prospect.teamsCount) signals.push({ label: `${prospect.teamsCount} équipes`, title: prospect.teamsEvidence, good: prospect.teamsCount >= 2 });
  if (prospect.serviceSegment) signals.push({ label: { residential: "Résidentiel", commercial: "Commercial", both: "Résidentiel + commercial" }[prospect.serviceSegment] || prospect.serviceSegment });

  const eng = prospect.engagement;

  return (
    <div className="space-y-5 mb-6">
      {/* Signaux & engagement */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-2">Signaux (site + avis)</p>
          {!prospect.siteAnalyzedAt ? (
            <p className="text-xs text-foreground-muted">Pas encore analysé — bouton « Analyser les sites (IA) » dans Prospects.</p>
          ) : signals.length === 0 ? (
            <p className="text-xs text-foreground-muted">Aucun signal particulier.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {signals.map((s) => (
                <span key={s.label} title={s.title || undefined} className={cn("rounded-full px-2 py-0.5 text-xs", s.good ? "bg-success-subtle text-success" : "bg-background-muted text-foreground-secondary")}>
                  {s.label}
                </span>
              ))}
            </div>
          )}
          {prospect.reviewsSource === "google_places" && (
            <p className="mt-2 text-[11px] text-foreground-muted">Avis via Google Places (5 max, sans les réponses du propriétaire).</p>
          )}
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Engagement</p>
            {eng && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", eng.score >= 6 ? "bg-success-subtle text-success" : eng.score >= 3 ? "bg-warning-subtle text-warning" : "bg-background-muted text-foreground-muted")}>
                {eng.hot ? "🔥 " : ""}{eng.score}/10
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-lg font-semibold tabular-nums">{prospect.emailOpenCount ?? 0}</p><p className="text-[11px] text-foreground-muted">ouvertures</p></div>
            <div><p className="text-lg font-semibold tabular-nums">{prospect.emailClickCount ?? 0}</p><p className="text-[11px] text-foreground-muted">clics</p></div>
            <div><p className="text-lg font-semibold tabular-nums">{prospect.siteVisitCount ?? 0}</p><p className="text-[11px] text-foreground-muted">pages vues</p></div>
          </div>
          {prospect.lastReplySentiment && (
            <p className="mt-2 text-xs text-foreground-secondary">{SENTIMENT_LABELS[prospect.lastReplySentiment] || prospect.lastReplySentiment}</p>
          )}
        </div>
      </div>

      {/* Journal d'appel */}
      <div className="rounded-md border border-border p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Journal d&apos;appel</p>
          {prospect.callbackAt && (
            <span className="text-xs text-warning">📞 Rappel prévu : {fmtDate(prospect.callbackAt)}</span>
          )}
        </div>
        <Row label="Résultat"><Chips options={CALL_OUTCOMES} value={outcome} onChange={setOutcome} /></Row>
        <Row label="Qui"><Chips options={CALL_WHO} value={who} onChange={setWho} /></Row>
        <Row label="Outil actuel"><Chips options={CURRENT_TOOLS} value={tool} onChange={setTool} /></Row>
        <Row label="Employés">
          <input
            type="number" min={1} value={employees} onChange={(e) => setEmployees(e.target.value)}
            className="w-24 border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground" placeholder="ex. 6"
          />
        </Row>
        <Row label="Objection"><Chips options={OBJECTIONS} value={objection} onChange={setObjection} /></Row>
        <Row label="Rappel">
          <div className="flex flex-wrap items-center gap-1.5">
            {([["Demain", 1], ["Dans 2 jours", 2], ["Semaine prochaine", 7]] as const).map(([label, d]) => (
              <button key={label} type="button" onClick={() => setCallback(daysFromNow(d))}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-secondary hover:bg-background-subtle">
                {label}
              </button>
            ))}
            <input type="datetime-local" value={callback} onChange={(e) => setCallback(e.target.value)}
              className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground" />
          </div>
        </Row>
        <Row label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground" placeholder="Ce qui a été dit…" />
        </Row>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveCall} disabled={!outcome || saving}>
            {saving ? "Enregistrement…" : "Enregistrer l'appel"}
          </Button>
        </div>
      </div>

      {/* Étape de vente */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Étape du pipeline</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPELINE_STAGES.map(({ key: s }, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-foreground-muted">→</span>}
              <button type="button" onClick={() => saveStage(stage === s ? null : s)}
                className={cn("rounded-full border px-2.5 py-1 text-xs",
                  stage === s ? (s === "WON" ? "bg-success text-white border-success" : "bg-primary text-white border-primary") : "border-border text-foreground-secondary hover:bg-background-subtle")}>
                {s === "WON" ? "✓ " : ""}{SALES_STAGES[s]}
              </button>
            </span>
          ))}
          <button type="button" onClick={() => saveStage(stage === "LOST" ? null : "LOST", lostReason)}
            className={cn("ml-2 rounded-full border px-2.5 py-1 text-xs", stage === "LOST" ? "bg-danger text-white border-danger" : "border-border text-foreground-secondary hover:bg-background-subtle")}>
            ✗ Perdu
          </button>
        </div>
        {stage === "LOST" && (
          <Row label="Raison">
            <Chips options={LOST_REASONS} value={lostReason as keyof typeof LOST_REASONS | null} onChange={(r) => saveStage("LOST", r)} />
          </Row>
        )}
      </div>

      {/* Historique */}
      {calls.length > 0 && (
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-2">Historique des appels ({calls.length})</p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {calls.map((c) => (
              <li key={c.id} className="text-xs text-foreground-secondary">
                <span className="text-foreground-muted tabular-nums">{fmtDate(c.createdAt)}</span>{" "}
                <span className="font-medium text-foreground">{CALL_OUTCOMES[c.outcome] || c.outcome}</span>
                {c.whoAnswered && ` · ${CALL_WHO[c.whoAnswered]}`}
                {c.currentTool && ` · ${CURRENT_TOOLS[c.currentTool]}`}
                {c.employeeCount && ` · ${c.employeeCount} employés`}
                {c.objection && c.objection !== "NONE" && ` · Objection : ${OBJECTIONS[c.objection]}`}
                {c.notes && <span className="block pl-4 italic">« {c.notes} »</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
