"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, ChevronRight, CreditCard, Flame, MailCheck, MapPin, Phone, Plus, Reply, Search, ThumbsUp, UserPlus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LOST_REASONS } from "@/lib/call-options";
import { PIPELINE_STAGES, SALES_STAGES } from "@/lib/sales-stages";

// ─── Types ──────────────────────────────────────────────

type Period = "7" | "30" | "90" | "all";

interface Card {
  id: string;
  companyName: string;
  ownerName: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  salesStage: string | null;
  lostReason: string | null;
  callbackAt: string | null;
  lastCallAt: string | null;
  daysInStage: number;
  callbackDue: boolean;
  engagement: { score: number; reasons: string[]; hot: boolean };
  conversion: number;
}
interface Column { key: string; label: string; cards: Card[] }
interface Step { key: string; label: string; count: number; rate: number | null }
interface Kpis {
  replyRate: number | null; positiveRate: number | null; positiveOfReplies: number | null;
  emailToSignup: number | null; signupToPaid: number | null; emailed: number; signups: number; paid: number;
}
interface PipelineData {
  campaignId: string | null;
  campaigns: Array<{ id: string; name: string; number: number }>;
  columns: Column[];
  funnel: Step[];
  kpis: Kpis;
  lostInPeriod: number;
}
interface SearchResult { id: string; companyName: string; ownerName: string | null; city: string | null; salesStage: string | null }

const COLUMN_TONE: Record<string, string> = {
  POSITIVE_REPLY: "bg-primary",
  SETTING_BOOKED: "bg-sky-500",
  SETTING_DONE: "bg-sky-700",
  DEMO_BOOKED: "bg-violet-500",
  DEMO_DONE: "bg-violet-700",
  TRIAL: "bg-warning",
  WON: "bg-success",
  LOST: "bg-danger",
};

const pct = (v: number | null) => {
  if (v == null) return "—";
  const x = v * 100;
  return `${x > 0 && x < 10 ? x.toFixed(1).replace(".", ",") : Math.round(x)} %`;
};

function daysLabel(d: number) {
  return d <= 0 ? "aujourd'hui" : d === 1 ? "1 jour" : `${d} jours`;
}

// ─── Carte ──────────────────────────────────────────────

function CardBody({ card, overlay }: { card: Card; overlay?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-card p-2.5 text-left shadow-sm", overlay && "shadow-xl ring-2 ring-primary/40 rotate-1")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-tight">{card.companyName}</p>
        {card.engagement.hot && <Flame className="size-3.5 shrink-0 text-warning" aria-label="Signal récent" />}
      </div>
      {card.ownerName && <p className="text-xs text-foreground-secondary mt-0.5">{card.ownerName}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-foreground-muted">
        {card.city && <span className="flex items-center gap-0.5"><MapPin className="size-3" />{card.city}</span>}
        {card.phone && <span className="flex items-center gap-0.5"><Phone className="size-3" />{card.phone}</span>}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="text-foreground-muted">depuis {daysLabel(card.daysInStage)}</span>
        <span className="tabular-nums text-foreground-secondary" title="Chance de conversion · engagement">
          {card.conversion}/10 · {card.engagement.score}/10
        </span>
      </div>
      {card.salesStage === "LOST" && card.lostReason && (
        <p className="mt-1 text-[11px] text-danger">{LOST_REASONS[card.lostReason as keyof typeof LOST_REASONS] ?? card.lostReason}</p>
      )}
      {card.callbackDue && card.callbackAt && card.salesStage !== "LOST" && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
          <CalendarClock className="size-3" />Rappel {new Date(card.callbackAt!).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}
        </p>
      )}
    </div>
  );
}

function DraggableCard({ card, onRemove }: { card: Card; onRemove: (c: Card) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } });
  return (
    <div
      ref={setNodeRef}
      className={cn("group relative touch-none select-none", isDragging && "opacity-30")}
      {...listeners}
      {...attributes}
    >
      <Link href={`/prospects?open=${card.id}`} draggable={false} className="block" title="Ouvrir la fiche">
        <CardBody card={card} />
      </Link>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(card)}
        className="absolute right-1 top-1 hidden rounded p-0.5 text-foreground-muted hover:bg-background-subtle hover:text-danger group-hover:block"
        title="Retirer du pipeline"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function StageColumn({ column, onRemove }: { column: Column; onRemove: (c: Card) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div className="flex w-52 shrink-0 flex-col rounded-lg border border-border bg-background-subtle">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn("size-2 rounded-full", COLUMN_TONE[column.key])} />
        <p className="text-sm font-semibold text-foreground">{column.label}</p>
        <span className="ml-auto rounded-full bg-background-muted px-2 text-xs tabular-nums text-foreground-secondary">{column.cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
          isOver && "bg-primary-subtle/50 ring-2 ring-inset ring-primary/40 rounded-b-lg",
        )}
        style={{ maxHeight: "calc(100vh - 360px)" }}
      >
        {column.cards.map((c) => <DraggableCard key={c.id} card={c} onRemove={onRemove} />)}
        {column.cards.length === 0 && <p className="py-6 text-center text-xs text-foreground-muted">Glisse un prospect ici</p>}
      </div>
    </div>
  );
}

// ─── Funnel ─────────────────────────────────────────────

function FunnelStrip({ steps, lost }: { steps: Step[]; lost: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-stretch overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s.key} className="flex shrink-0 items-center">
            {i > 0 && (
              <div className="flex shrink-0 flex-col items-center px-1 text-[10px] text-foreground-muted">
                <span className="tabular-nums font-medium text-foreground-secondary">{pct(s.rate)}</span>
                <ChevronRight className="size-3.5" />
              </div>
            )}
            <div className="shrink-0 rounded-md bg-background-subtle px-2 py-1.5">
              <p className="whitespace-nowrap text-[11px] text-foreground-muted leading-tight">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{s.count}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-foreground-muted">
        Compté par prospect : chaque étape inclut ceux qui sont allés plus loin. {lost > 0 && `${lost} perdu${lost > 1 ? "s" : ""} dans la période.`}
      </p>
    </div>
  );
}

// ─── Ajout d'un prospect ────────────────────────────────

function AddProspect({ onAdd }: { onAdd: (id: string, stage: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("POSITIVE_REPLY");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(value: string) {
    setQ(value);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/pipeline/search?q=${encodeURIComponent(value.trim())}`);
      if (res.ok) setResults((await res.json()).results);
    }, 250);
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted" />
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Ajouter un prospect…"
          className="w-56 rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-sm text-foreground"
        />
      </div>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        aria-label="Étape d'arrivée"
      >
        {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-card py-1 shadow-xl">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={async () => { await onAdd(r.id, stage); setQ(""); setResults([]); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background-subtle"
                >
                  <Plus className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{r.companyName}</span>
                    <span className="block truncate text-xs text-foreground-muted">
                      {[r.ownerName, r.city].filter(Boolean).join(" · ")}
                      {r.salesStage && ` — déjà : ${SALES_STAGES[r.salesStage as keyof typeof SALES_STAGES] ?? r.salesStage}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

// La colonne sous le pointeur ; sinon (clavier, bord de colonne) celle que la carte recouvre le plus
const columnUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export default function PipelinePage() {
  const [period, setPeriod] = useState<Period>("30");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [pendingLost, setPendingLost] = useState<Card | null>(null);

  const load = useCallback(async (p: Period, c: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline?period=${p}&campaignId=${encodeURIComponent(c)}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(period, campaignId); }, [load, period, campaignId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const cardsById = useMemo(() => new Map((data?.columns ?? []).flatMap((c) => c.cards.map((card) => [card.id, card] as const))), [data]);

  /** Déplace la carte tout de suite à l'écran, puis enregistre ; en cas d'échec, recharge. */
  const saveStage = useCallback(async (prospectId: string, to: string | null, lostReason: string | null = null) => {
    setData((d) => {
      if (!d) return d;
      const card = d.columns.flatMap((c) => c.cards).find((c) => c.id === prospectId);
      const moved = card ? { ...card, salesStage: to, lostReason, daysInStage: 0 } : null;
      return {
        ...d,
        columns: d.columns.map((c) => ({
          ...c,
          cards: [...(moved && c.key === to ? [moved] : []), ...c.cards.filter((x) => x.id !== prospectId)],
        })),
      };
    });
    const res = await fetch("/api/prospects/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId, salesStage: to ?? "", lostReason }),
    });
    if (!res.ok) alert(`Étape non enregistrée : ${(await res.json().catch(() => ({}))).error || "erreur"}`);
    load(period, campaignId); // recalcule le funnel et les notes
  }, [load, period, campaignId]);

  function onDragStart(e: DragStartEvent) {
    setActiveCard(cardsById.get(String(e.active.id)) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const card = cardsById.get(String(e.active.id));
    const to = e.over ? String(e.over.id) : null;
    if (!card || !to || card.salesStage === to) return;
    if (to === "LOST") { setPendingLost(card); return; }
    saveStage(card.id, to);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description="Cold email → setting call → closing call → inscription → payant. Glisse les prospects d'une étape à l'autre."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="max-w-56 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              aria-label="Campagne"
            >
              <option value="all">Toutes les campagnes</option>
              {data?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.number ? `#${c.number} · ` : ""}{c.name}</option>)}
            </select>
            <AddProspect onAdd={(id, stage) => saveStage(id, stage)} />
            <div className="flex rounded-md border border-border p-0.5">
              {([["7", "7 j"], ["30", "30 j"], ["90", "90 j"], ["all", "Tout"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setPeriod(v)}
                  className={cn("px-2.5 py-1.5 text-sm rounded", period === v ? "bg-primary text-white" : "text-foreground-secondary hover:bg-background-subtle")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <div className="flex gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-96 w-52 shrink-0" />)}</div>
        </div>
      ) : data && (
        <>
          <div className={cn(loading && "opacity-70")}>
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <StatCard label="Taux de réponse" value={pct(data.kpis.replyRate)} subtitle={`sur ${data.kpis.emailed} prospects écrits`} icon={<Reply size={16} />} iconColor="bg-primary-subtle text-primary" />
              <StatCard label="Réponses positives" value={pct(data.kpis.positiveRate)} subtitle={`des écrits · ${pct(data.kpis.positiveOfReplies)} des réponses`} icon={<ThumbsUp size={16} />} iconColor="bg-primary-subtle text-primary" />
              <StatCard label="Courriel → inscription" value={pct(data.kpis.emailToSignup)} subtitle={`${data.kpis.signups} inscrit${data.kpis.signups > 1 ? "s" : ""}`} icon={<UserPlus size={16} />} iconColor="bg-warning-subtle text-warning" />
              <StatCard label="Inscription → payant" value={pct(data.kpis.signupToPaid)} subtitle={`${data.kpis.paid} payant${data.kpis.paid > 1 ? "s" : ""}`} icon={<CreditCard size={16} />} iconColor="bg-success-subtle text-success" />
              <StatCard label="LTV / CAC" value="—" subtitle="Pas encore suivi (revenu et coûts à ajouter)" icon={<MailCheck size={16} />} iconColor="bg-background-muted text-foreground-muted" />
            </div>
            <FunnelStrip steps={data.funnel} lost={data.lostInPeriod} />
          </div>

          <DndContext sensors={sensors} collisionDetection={columnUnderPointer} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveCard(null)}>
            {/* Pleine largeur de l'écran : les 8 colonnes tiennent sur un grand écran */}
            <div className="relative left-1/2 w-[calc(100vw-20px)] -translate-x-1/2 px-2 sm:px-4">
            <div className="flex gap-2 overflow-x-auto pb-3">
              {data.columns.map((col) => (
                <StageColumn key={col.key} column={col} onRemove={(c) => {
                  if (confirm(`Retirer ${c.companyName} du pipeline ?`)) saveStage(c.id, null);
                }} />
              ))}
            </div>
            </div>
            <DragOverlay dropAnimation={null}>{activeCard && <CardBody card={activeCard} overlay />}</DragOverlay>
          </DndContext>
        </>
      )}

      {pendingLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPendingLost(null)}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">Pourquoi {pendingLost.companyName} est perdu ?</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(Object.entries(LOST_REASONS) as Array<[string, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { saveStage(pendingLost.id, "LOST", key); setPendingLost(null); }}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-secondary hover:bg-background-subtle"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setPendingLost(null)} className="px-3 py-1.5 text-foreground-secondary hover:underline">Annuler</button>
              <button type="button" onClick={() => { saveStage(pendingLost.id, "LOST"); setPendingLost(null); }} className="rounded-md bg-danger px-3 py-1.5 text-white">
                Perdu sans raison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
