"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PhoneCall, PhoneIncoming, UserCheck, CalendarCheck, Trophy, Percent, Flame, PhoneForwarded } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CALL_OUTCOMES } from "@/lib/call-options";

type Period = "7" | "30" | "all";

interface Bar { key: string; label: string; count: number }
interface Row {
  id: string;
  companyName: string;
  city: string | null;
  phone: string | null;
  ownerName: string | null;
  callbackAt: string | null;
  lastCallOutcome: string | null;
  conversion: number;
  engagement: { score: number; reasons: string[]; hot: boolean };
}
interface KpiData {
  kpis: {
    calls: number; prospectsCalled: number; connectRate: number | null; ownerRate: number | null;
    demos: number; won: number; closeRate: number | null; demoToWin: number | null;
  };
  funnel: Bar[];
  breakdowns: { outcomes: Bar[]; objections: Bar[]; tools: Bar[]; lostReasons: Bar[] };
  calibration: Array<{ key: string; label: string; called: number; connected: number; demos: number; won: number }>;
  callbacks: Row[];
  hot: Row[];
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)} %`);

function Bars({ title, items, empty, tone = "bg-primary" }: { title: string; items: Bar[]; empty: string; tone?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-foreground-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.key}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-foreground-secondary">{i.label}</span>
                <span className="tabular-nums text-foreground-muted">{i.count} · {Math.round((i.count / total) * 100)} %</span>
              </div>
              <div className="h-2 rounded-full bg-background-muted">
                <div className={cn("h-2 rounded-full", tone)} style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Funnel({ steps }: { steps: Bar[] }) {
  const top = Math.max(1, steps[0]?.count ?? 0);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground mb-3">Entonnoir de vente</p>
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].count : null;
          return (
            <div key={s.key} className="grid grid-cols-[96px_1fr_88px] items-center gap-3">
              <span className="text-xs text-foreground-secondary">{s.label}</span>
              <div className="h-6 rounded bg-background-muted">
                <div
                  className={cn("h-6 rounded flex items-center px-2 text-xs font-semibold text-white tabular-nums", s.key === "won" ? "bg-success" : "bg-primary")}
                  style={{ width: `${Math.max(s.count ? 6 : 0, (s.count / top) * 100)}%` }}
                >
                  {s.count > 0 && s.count}
                </div>
              </div>
              <span className="text-[11px] text-foreground-muted tabular-nums text-right">
                {prev != null && prev > 0 ? `${Math.round((s.count / prev) * 100)} % de l'étape d'avant` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProspectList({ title, icon, rows, empty, mode }: { title: string; icon: React.ReactNode; rows: Row[]; empty: string; mode: "callback" | "hot" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">{icon}{title} <span className="text-foreground-muted font-normal">({rows.length})</span></p>
      {rows.length === 0 ? (
        <p className="text-xs text-foreground-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const overdue = mode === "callback" && r.callbackAt && new Date(r.callbackAt) < new Date(new Date().setHours(0, 0, 0, 0));
            return (
              <li key={r.id} className="py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/prospects?open=${r.id}`} className="text-sm font-medium text-foreground hover:text-primary truncate block">
                    {r.companyName}
                  </Link>
                  <p className="text-xs text-foreground-muted truncate">
                    {[r.ownerName, r.city].filter(Boolean).join(" · ")}
                    {mode === "callback" && r.callbackAt && (
                      <span className={cn("ml-1", overdue ? "text-danger" : "text-warning")}>
                        {overdue ? "· en retard depuis le " : "· "}
                        {new Date(r.callbackAt).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {mode === "hot" && <span className="ml-1">· {r.engagement.reasons.filter((x) => x !== "À appeler maintenant").slice(0, 2).join(", ")}</span>}
                    {mode === "callback" && r.lastCallOutcome && <span className="ml-1">· dernier : {CALL_OUTCOMES[r.lastCallOutcome as keyof typeof CALL_OUTCOMES] ?? r.lastCallOutcome}</span>}
                  </p>
                </div>
                <span className="text-[11px] rounded-full bg-background-muted px-2 py-0.5 tabular-nums text-foreground-secondary" title="Chance de conversion">C {r.conversion}</span>
                <span className="text-[11px] rounded-full bg-background-muted px-2 py-0.5 tabular-nums text-foreground-secondary" title="Engagement">E {r.engagement.score}</span>
                {r.phone ? (
                  <a href={`tel:${r.phone}`} className="text-xs rounded-md border border-primary/30 text-primary px-2.5 py-1 hover:bg-primary-subtle whitespace-nowrap">
                    Appeler
                  </a>
                ) : (
                  <span className="text-xs text-foreground-muted">sans tél.</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function CallsPage() {
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kpis/calls?period=${p}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(period); }, [load, period]);

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appels"
        description="Tes résultats d'appels, ce qui bloque les ventes, et qui appeler maintenant."
        actions={
          <div className="flex rounded-md border border-border p-0.5">
            {([["7", "7 jours"], ["30", "30 jours"], ["all", "Tout"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setPeriod(v)}
                className={cn("px-3 py-1.5 text-sm rounded", period === v ? "bg-primary text-white" : "text-foreground-secondary hover:bg-background-subtle")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data && k && (
        <div className={cn("space-y-6", loading && "opacity-60")}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Appels" value={k.calls} subtitle={`${k.prospectsCalled} prospects`} icon={<PhoneCall size={16} />} iconColor="bg-primary-subtle text-primary" />
            <StatCard label="Taux de joints" value={pct(k.connectRate)} subtitle="Quelqu'un a répondu et parlé" icon={<PhoneIncoming size={16} />} iconColor="bg-primary-subtle text-primary" />
            <StatCard label="Propriétaire joint" value={pct(k.ownerRate)} subtitle="Parmi les appels joints" icon={<UserCheck size={16} />} iconColor="bg-primary-subtle text-primary" />
            <StatCard label="Démos" value={k.demos} subtitle="Prises (ou plus loin)" icon={<CalendarCheck size={16} />} iconColor="bg-warning-subtle text-warning" />
            <StatCard label="Ventes" value={k.won} subtitle={k.demoToWin != null ? `${pct(k.demoToWin)} des démos` : undefined} icon={<Trophy size={16} />} iconColor="bg-success-subtle text-success" />
            <StatCard label="Taux de close" value={pct(k.closeRate)} subtitle="Ventes / prospects joints" icon={<Percent size={16} />} iconColor="bg-success-subtle text-success" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ProspectList title="À rappeler aujourd'hui" icon={<PhoneForwarded size={16} className="text-warning" />} rows={data.callbacks} mode="callback"
              empty="Aucun rappel prévu. Choisis « Rappel » quand tu enregistres un appel." />
            <ProspectList title="À appeler maintenant" icon={<Flame size={16} className="text-danger" />} rows={data.hot} mode="hot"
              empty="Personne de chaud dans les 48 dernières heures (clic, 3+ ouvertures ou visite du site)." />
          </div>

          {k.calls === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-foreground">Aucun appel enregistré sur cette période.</p>
              <p className="text-xs text-foreground-muted mt-1">
                Ouvre un prospect dans <Link href="/prospects" className="text-primary hover:underline">Prospects</Link> et remplis le « Journal d&apos;appel » : quelques clics par appel.
              </p>
            </div>
          ) : (
            <>
              <Funnel steps={data.funnel} />
              <div className="grid gap-4 md:grid-cols-2">
                <Bars title="Résultats des appels" items={data.breakdowns.outcomes} empty="—" />
                <Bars title="Objections" items={data.breakdowns.objections.filter((o) => o.key !== "NONE")} empty="Aucune objection notée." tone="bg-warning" />
                <Bars title="Outils actuels des prospects" items={data.breakdowns.tools} empty="Pas encore noté." />
                <Bars title="Raisons de perte" items={data.breakdowns.lostReasons} empty="Aucune vente perdue." tone="bg-danger" />
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">La « Chance » prédit-elle les ventes ?</p>
                <p className="text-xs text-foreground-muted mb-3">
                  Prospects appelés, groupés par Chance /10. Si les ventes se concentrent dans 8–10, la note est fiable ; sinon, on ajustera les poids.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-foreground-muted">
                        <th className="text-left font-medium py-1.5">Chance</th>
                        <th className="text-right font-medium">Appelés</th>
                        <th className="text-right font-medium">Joints</th>
                        <th className="text-right font-medium">Démos</th>
                        <th className="text-right font-medium">Ventes</th>
                        <th className="text-right font-medium">Taux de vente</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.calibration.map((b) => (
                        <tr key={b.key} className="border-t border-border">
                          <td className="py-1.5 text-foreground">{b.label}</td>
                          <td className="text-right">{b.called}</td>
                          <td className="text-right">{b.connected}</td>
                          <td className="text-right">{b.demos}</td>
                          <td className="text-right font-semibold">{b.won}</td>
                          <td className="text-right">{b.called ? `${Math.round((b.won / b.called) * 100)} %` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
