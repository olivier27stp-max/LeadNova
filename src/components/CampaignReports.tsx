"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  MailCheck,
  Eye,
  MessageSquare,
  AlertTriangle,
  Star,
  TrendingUp,
  BarChart2,
  Users,
  CheckCircle2,
  UserMinus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────

interface ReportData {
  kpis: {
    sent: number;
    delivered: number;
    opened: number;
    replied: number;
    bounced: number;
    interested: number;
    converted: number;
    unsubscribed: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  };
  timeline: { date: string; sent: number; opened: number; replied: number; bounced: number }[];
  contacts: {
    prospectId: string;
    companyName: string;
    city: string | null;
    status: string;
    email: string | null;
    sentAt: string;
    openedAt: string | null;
    replyReceived: boolean;
    bounce: boolean;
    unsubscribed: boolean;
  }[];
  totalContacts: number;
}

type Range = "today" | "7d" | "30d" | "all";

const RANGE_LABELS: Record<Range, string> = {
  today: "Aujourd'hui",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  all: "Tout le temps",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  ENRICHED: "Enrichi",
  CONTACTED: "Contacté",
  REPLIED: "A répondu",
  QUALIFIED: "Qualifié",
  NOT_INTERESTED: "Pas intéressé",
};

// ─── Sub-components ───────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  alert = false,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  alert?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
    >
      <Card className={`h-full relative overflow-hidden ${alert ? "border-red-200 dark:border-red-900/60" : ""}`}>
        {alert && (
          <div className="absolute top-2.5 right-2.5">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
              <span className="relative inline-flex rounded-full size-2 bg-red-500" />
            </span>
          </div>
        )}
        <CardContent className="p-4 flex flex-col h-full gap-3">
          <div className={`p-1.5 rounded-md w-fit ${color}`}>
            <Icon className="size-3.5" />
          </div>
          <div className="mt-auto">
            <p className="text-xl font-bold text-foreground tracking-tight tabular-nums">{value}</p>
            <p className="text-xs text-foreground-muted mt-0.5 leading-tight">{label}</p>
            {sub && <p className="text-xs text-foreground-secondary mt-1 font-medium">{sub}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Bar Chart (SVG) ──────────────────────────────────────

function BarChart({
  data,
  height = 160,
}: {
  data: { date: string; sent: number; opened: number; replied: number }[];
  height?: number;
}) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.sent), 1);
  const barW = Math.max(8, Math.min(32, Math.floor(560 / data.length) - 4));
  const gap = Math.max(2, Math.floor(560 / data.length) - barW);
  const totalWidth = data.length * (barW + gap);

  return (
    <svg
      viewBox={`0 0 ${Math.max(totalWidth, 560)} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      {data.map((d, i) => {
        const x = i * (barW + gap);
        const sentH = Math.round((d.sent / maxVal) * (height - 20));
        const openH = Math.round((d.opened / maxVal) * (height - 20));
        const replyH = Math.round((d.replied / maxVal) * (height - 20));
        const base = height - 4;
        return (
          <g key={d.date}>
            {/* Sent bar */}
            <rect x={x} y={base - sentH} width={barW} height={sentH} rx="2" fill="var(--color-primary)" opacity="0.2" />
            {/* Opened bar */}
            <rect x={x} y={base - openH} width={barW} height={openH} rx="2" fill="var(--color-primary)" opacity="0.7" />
            {/* Reply dot */}
            {d.replied > 0 && (
              <circle cx={x + barW / 2} cy={base - replyH - 4} r="3" fill="var(--color-success)" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Funnel ───────────────────────────────────────────────

function Funnel({ kpis }: { kpis: ReportData["kpis"] }) {
  const steps = [
    { label: "Envoyés", value: kpis.sent, color: "bg-primary", textColor: "text-primary" },
    { label: "Livrés", value: kpis.delivered, color: "bg-accent", textColor: "text-accent" },
    { label: "Ouverts", value: kpis.opened, color: "bg-success", textColor: "text-success" },
    { label: "Réponses", value: kpis.replied, color: "bg-warning", textColor: "text-warning" },
    { label: "Intéressés", value: kpis.interested, color: "bg-orange-500", textColor: "text-orange-500" },
    { label: "Convertis", value: kpis.converted, color: "bg-success", textColor: "text-success" },
  ];
  const max = kpis.sent || 1;

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const pct = Math.round((step.value / max) * 100);
        const dropPct = i > 0 && steps[i - 1].value > 0
          ? Math.round((1 - step.value / steps[i - 1].value) * 100)
          : null;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground-secondary">{step.label}</span>
              <div className="flex items-center gap-2">
                {dropPct !== null && dropPct > 0 && (
                  <span className="text-[10px] text-foreground-muted">-{dropPct}%</span>
                )}
                <span className={`text-sm font-bold ${step.textColor}`}>{step.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-6 bg-background-muted rounded-md overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, step.value > 0 ? 2 : 0)}%` }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                className={`h-full ${step.color} rounded-md opacity-80`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Contact Table ────────────────────────────────────────

type ContactFilter = "all" | "opened" | "replied" | "bounced" | "no_open";

function ContactTable({ contacts }: { contacts: ReportData["contacts"] }) {
  const [filter, setFilter] = useState<ContactFilter>("all");

  const filtered = contacts.filter((c) => {
    if (filter === "opened") return c.openedAt !== null && !c.bounce;
    if (filter === "replied") return c.replyReceived;
    if (filter === "bounced") return c.bounce;
    if (filter === "no_open") return !c.openedAt && !c.bounce;
    return true;
  });

  const tabs: { id: ContactFilter; label: string; count: number }[] = [
    { id: "all", label: "Tous", count: contacts.length },
    { id: "opened", label: "Ont ouvert", count: contacts.filter((c) => c.openedAt && !c.bounce).length },
    { id: "replied", label: "Ont répondu", count: contacts.filter((c) => c.replyReceived).length },
    { id: "bounced", label: "Bounces", count: contacts.filter((c) => c.bounce).length },
    { id: "no_open", label: "Jamais ouvert", count: contacts.filter((c) => !c.openedAt && !c.bounce).length },
  ];

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === t.id
                ? "bg-primary text-white"
                : "bg-background-muted text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 ${filter === t.id ? "opacity-70" : "opacity-50"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-foreground-muted text-center py-6">Aucun contact dans cette catégorie.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted">Entreprise</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted">Ville</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted">Statut</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-foreground-muted">Envoyé</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-foreground-muted">Ouvert</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-foreground-muted">Réponse</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-foreground-muted">Bounce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 100).map((c) => (
                <tr key={c.prospectId} className="hover:bg-background-subtle transition-colors">
                  <td className="py-2 px-3 font-medium text-foreground truncate max-w-[180px]">{c.companyName}</td>
                  <td className="py-2 px-3 text-foreground-muted">{c.city || "—"}</td>
                  <td className="py-2 px-3">
                    <Badge variant={
                      c.status === "QUALIFIED" ? "success" :
                      c.status === "REPLIED" ? "primary" :
                      c.status === "CONTACTED" ? "accent" : "default"
                    }>
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-foreground-muted text-xs whitespace-nowrap">
                    {new Date(c.sentAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {c.openedAt ? (
                      <span className="text-success" title={new Date(c.openedAt).toLocaleString("fr-CA")}>✓</span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {c.replyReceived ? (
                      <span className="text-primary font-bold">✓</span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {c.bounce ? (
                      <span className="text-danger">✕</span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-xs text-foreground-muted text-center py-3">
              Affichage des 100 premiers résultats sur {filtered.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function CampaignReports({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reports?range=${range}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [campaignId, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">

      {/* Range filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              range === r
                ? "bg-primary text-white"
                : "bg-background-muted text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : data ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-stretch">
            <KpiCard icon={Send} label="Emails envoyés" value={data.kpis.sent.toLocaleString()} color="bg-primary-subtle text-primary" delay={0} />
            <KpiCard icon={MailCheck} label="Livrés" value={data.kpis.delivered.toLocaleString()} sub={`${data.rates.deliveryRate}% taux`} color="bg-accent-subtle text-accent" delay={0.05} />
            <KpiCard icon={Eye} label="Taux d'ouverture" value={`${data.rates.openRate}%`} sub={`${data.kpis.opened} ouvertures`} color="bg-success-subtle text-success" delay={0.1} />
            <KpiCard icon={MessageSquare} label="Taux de réponse" value={`${data.rates.replyRate}%`} sub={`${data.kpis.replied} réponses`} color="bg-primary-subtle text-primary" delay={0.15} />
            <KpiCard icon={AlertTriangle} label="Taux de bounce" value={`${data.rates.bounceRate}%`} sub={`${data.kpis.bounced} bounces`} color="bg-danger-subtle text-danger" delay={0.2} />
            <KpiCard icon={Star} label="Intéressés" value={data.kpis.interested.toLocaleString()} color="bg-warning-subtle text-warning" delay={0.25} />
            <KpiCard icon={CheckCircle2} label="Convertis" value={data.kpis.converted.toLocaleString()} color="bg-success-subtle text-success" delay={0.3} />
            <KpiCard
              icon={UserMinus}
              label="Désabonnements"
              value={data.kpis.unsubscribed.toLocaleString()}
              sub={`${data.rates.unsubscribeRate}% taux`}
              color={data.kpis.unsubscribed > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : "bg-background-muted text-foreground-muted"}
              alert={data.kpis.unsubscribed > 0}
              delay={0.35}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Funnel ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  <CardTitle className="text-base">Entonnoir de conversion</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Funnel kpis={data.kpis} />
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                    <span className="w-3 h-3 rounded bg-primary opacity-20 inline-block" /> Envoyés
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                    <span className="w-3 h-3 rounded bg-primary opacity-70 inline-block" /> Ouverts
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                    <span className="w-3 h-3 rounded-full bg-success inline-block" /> Réponses
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Timeline Chart ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart2 className="size-4 text-primary" />
                  <CardTitle className="text-base">Activité dans le temps</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {data.timeline.length === 0 ? (
                  <p className="text-sm text-foreground-muted text-center py-8">Aucune donnée temporelle disponible.</p>
                ) : (
                  <>
                    <BarChart data={data.timeline} />
                    <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                        <span className="w-3 h-3 rounded bg-primary opacity-20 inline-block" /> Envoyés
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                        <span className="w-3 h-3 rounded bg-primary opacity-70 inline-block" /> Ouverts
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
                        <span className="w-2 h-2 rounded-full bg-success inline-block" /> Réponses
                      </div>
                    </div>
                    {/* Date labels */}
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-foreground-muted">{data.timeline[0]?.date}</span>
                      <span className="text-[10px] text-foreground-muted">{data.timeline[data.timeline.length - 1]?.date}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Contact Breakdown ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <CardTitle className="text-base">Détail par contact</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ContactTable contacts={data.contacts} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
