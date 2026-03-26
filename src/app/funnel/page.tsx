"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@/components/LanguageProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Mail,
  Phone,
  MapPin,
  Star,
  X,
  Check,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface ProspectCard {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  status: string;
  leadScore: number;
  city: string | null;
  industry: string | null;
}

interface FunnelProspectItem {
  id: string;
  prospectId: string;
  sortOrder: number;
  prospect: ProspectCard;
}

interface Stage {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isDefault: boolean;
  prospects: FunnelProspectItem[];
}

// ─── Default stage slug → translation key ───────────────

const STAGE_TRANSLATION_KEYS: Record<string, "newReplies" | "stageNotInterested" | "stageInterested" | "stageHotFollowUp1" | "stageHotFollowUp2" | "stageLost" | "stageClosed"> = {
  "new-replies": "newReplies",
  "not-interested": "stageNotInterested",
  "interested": "stageInterested",
  "hot-follow-up-1": "stageHotFollowUp1",
  "hot-follow-up-2": "stageHotFollowUp2",
  "lost": "stageLost",
  "closed": "stageClosed",
};

// ─── Status badge variant mapping ───────────────────────

const STATUS_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger" | "accent"> = {
  NEW: "default",
  ENRICHED: "primary",
  SCHEDULED: "accent",
  CONTACTED: "primary",
  REPLIED: "success",
  BOUNCED: "danger",
  QUALIFIED: "success",
  NOT_INTERESTED: "warning",
};

// ─── Sortable Prospect Card ─────────────────────────────

function SortableProspectCard({
  item,
  t,
}: {
  item: FunnelProspectItem;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.prospectId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 shadow-sm transition-all",
        isDragging && "opacity-40 shadow-lg ring-2 ring-primary/20"
      )}
      {...attributes}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab text-foreground-muted/40 hover:text-foreground-muted active:cursor-grabbing"
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {item.prospect.companyName}
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {item.prospect.email && (
              <span className="flex items-center gap-1 text-xs text-foreground-muted truncate">
                <Mail className="size-3 shrink-0" />
                {item.prospect.email}
              </span>
            )}
            {!item.prospect.email && item.prospect.phone && (
              <span className="flex items-center gap-1 text-xs text-foreground-muted truncate">
                <Phone className="size-3 shrink-0" />
                {item.prospect.phone}
              </span>
            )}
            {item.prospect.city && (
              <span className="flex items-center gap-1 text-xs text-foreground-muted truncate">
                <MapPin className="size-3 shrink-0" />
                {item.prospect.city}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge variant={STATUS_VARIANT[item.prospect.status] || "default"}>
              {t("prospectStatus", item.prospect.status as "NEW" | "ENRICHED" | "SCHEDULED" | "CONTACTED" | "REPLIED" | "BOUNCED" | "QUALIFIED" | "NOT_INTERESTED")}
            </Badge>
            {item.prospect.leadScore > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-foreground-muted">
                <Star className="size-3 text-warning" />
                {item.prospect.leadScore}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Overlay Card (shown while dragging) ────────────────

function OverlayCard({ item, t }: { item: FunnelProspectItem; t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3 shadow-xl ring-2 ring-primary/20 w-[260px]">
      <div className="flex items-start gap-2">
        <GripVertical className="size-3.5 mt-0.5 text-foreground-muted/40" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.prospect.companyName}</p>
          {item.prospect.email && (
            <span className="flex items-center gap-1 text-xs text-foreground-muted truncate mt-1">
              <Mail className="size-3 shrink-0" />
              {item.prospect.email}
            </span>
          )}
          <div className="mt-2">
            <Badge variant={STATUS_VARIANT[item.prospect.status] || "default"}>
              {t("prospectStatus", item.prospect.status as "NEW" | "ENRICHED" | "SCHEDULED" | "CONTACTED" | "REPLIED" | "BOUNCED" | "QUALIFIED" | "NOT_INTERESTED")}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Column ───────────────────────────────────

function StageColumn({
  stage,
  t,
  onRename,
  onDelete,
}: {
  stage: Stage;
  t: ReturnType<typeof useTranslation>["t"];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleRenameSubmit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== stage.name) {
      onRename(stage.id, trimmed);
    }
    setEditing(false);
    setMenuOpen(false);
  }

  const prospectIds = stage.prospects.map((p) => p.prospectId);
  const count = stage.prospects.length;

  return (
    <div className="flex flex-col w-[280px] shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-background-subtle rounded-t-lg border border-b-0 border-border">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") { setEditing(false); setEditName(stage.name); }
                }}
                className="h-7 w-full rounded border border-border bg-card px-2 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button onClick={handleRenameSubmit} className="p-1 text-success hover:bg-success-subtle rounded">
                <Check className="size-3.5" />
              </button>
              <button onClick={() => { setEditing(false); setEditName(stage.name); }} className="p-1 text-foreground-muted hover:bg-background-muted rounded">
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-foreground truncate">
                {STAGE_TRANSLATION_KEYS[stage.slug]
                  ? t("funnel", STAGE_TRANSLATION_KEYS[stage.slug])
                  : stage.name}
              </h3>
              <p className="text-xs text-foreground-muted">
                {count} {count === 1 ? t("funnel", "prospect") : t("funnel", "prospects")}
              </p>
            </>
          )}
        </div>
        {!stage.isDefault && !editing && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-muted transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-border bg-card shadow-lg py-1">
                <button
                  onClick={() => { setEditing(true); setMenuOpen(false); setEditName(stage.name); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-background-subtle flex items-center gap-2"
                >
                  <Pencil className="size-3.5" />
                  {t("funnel", "rename")}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t("funnel", "deleteConfirm"))) {
                      onDelete(stage.id);
                    }
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-danger-subtle flex items-center gap-2"
                >
                  <Trash2 className="size-3.5" />
                  {t("funnel", "delete")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Column body */}
      <div className="flex-1 rounded-b-lg border border-border bg-background-subtle/50 p-2 space-y-2 min-h-[200px] overflow-y-auto max-h-[calc(100vh-220px)]">
        <SortableContext items={prospectIds} strategy={verticalListSortingStrategy}>
          {stage.prospects.map((item) => (
            <SortableProspectCard key={item.prospectId} item={item} t={t} />
          ))}
        </SortableContext>
        {count === 0 && (
          <p className="text-center text-xs text-foreground-muted/60 py-8">
            {t("funnel", "emptyStage")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function FunnelPage() {
  const { t } = useTranslation();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<FunnelProspectItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch("/api/funnel/stages");
      if (res.ok) {
        const data = await res.json();
        setStages(data);
      }
    } catch (err) {
      console.error("Failed to fetch stages", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  // ─── Handlers ───────────────────────────────────

  async function handleAddStage() {
    const res = await fetch("/api/funnel/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t("funnel", "newStage") }),
    });
    if (res.ok) {
      const newStage = await res.json();
      setStages((prev) => [...prev, newStage]);
    }
  }

  async function handleRenameStage(id: string, name: string) {
    const res = await fetch("/api/funnel/stages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    if (res.ok) {
      setStages((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name } : s))
      );
    }
  }

  async function handleDeleteStage(id: string) {
    const res = await fetch(`/api/funnel/stages?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setStages((prev) => prev.filter((s) => s.id !== id));
    }
  }

  // ─── Drag & Drop ─────────────────────────────────

  function findStageByProspectId(prospectId: string): Stage | undefined {
    return stages.find((s) => s.prospects.some((p) => p.prospectId === prospectId));
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const stage = findStageByProspectId(active.id as string);
    if (stage) {
      const item = stage.prospects.find((p) => p.prospectId === active.id);
      if (item) setActiveItem(item);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeProspectId = active.id as string;
    const overId = over.id as string;

    const activeStage = findStageByProspectId(activeProspectId);
    // Check if over is a stage column or a prospect
    let overStage = findStageByProspectId(overId);
    if (!overStage) {
      // Over might be a stage ID (empty column)
      overStage = stages.find((s) => s.id === overId);
    }

    if (!activeStage || !overStage || activeStage.id === overStage.id) return;

    // Move prospect from one stage to another (optimistic)
    setStages((prev) => {
      const newStages = prev.map((s) => ({
        ...s,
        prospects: [...s.prospects],
      }));

      const fromStage = newStages.find((s) => s.id === activeStage.id)!;
      const toStage = newStages.find((s) => s.id === overStage.id)!;

      const itemIndex = fromStage.prospects.findIndex(
        (p) => p.prospectId === activeProspectId
      );
      if (itemIndex === -1) return prev;

      const [movedItem] = fromStage.prospects.splice(itemIndex, 1);

      // Find insert position
      const overIndex = toStage.prospects.findIndex(
        (p) => p.prospectId === overId
      );
      if (overIndex >= 0) {
        toStage.prospects.splice(overIndex, 0, movedItem);
      } else {
        toStage.prospects.push(movedItem);
      }

      return newStages;
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const activeProspectId = active.id as string;
    const overId = over.id as string;

    // Find the stage the prospect is currently in (after drag over updates)
    const currentStage = findStageByProspectId(activeProspectId);
    if (!currentStage) return;

    // Handle reorder within same stage
    if (activeProspectId !== overId) {
      const overIndex = currentStage.prospects.findIndex(
        (p) => p.prospectId === overId
      );
      const activeIndex = currentStage.prospects.findIndex(
        (p) => p.prospectId === activeProspectId
      );

      if (overIndex >= 0 && activeIndex >= 0 && overIndex !== activeIndex) {
        setStages((prev) => {
          const newStages = prev.map((s) => ({
            ...s,
            prospects: [...s.prospects],
          }));
          const stage = newStages.find((s) => s.id === currentStage.id)!;
          const [moved] = stage.prospects.splice(activeIndex, 1);
          stage.prospects.splice(overIndex, 0, moved);
          return newStages;
        });
      }
    }

    // Persist to DB
    const updates = currentStage.prospects.map((p, i) => ({
      prospectId: p.prospectId,
      stageId: currentStage.id,
      sortOrder: i,
    }));

    // Also check if we need to update the prospect that moved
    const movedProspect = currentStage.prospects.find(
      (p) => p.prospectId === activeProspectId
    );
    if (movedProspect) {
      await fetch("/api/funnel/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: activeProspectId,
          stageId: currentStage.id,
          sortOrder: currentStage.prospects.findIndex(
            (p) => p.prospectId === activeProspectId
          ),
        }),
      });
    }

    // Persist full order for the stage
    await fetch("/api/funnel/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
  }

  // ─── Render ─────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <PageHeader title={t("funnel", "title")} description={t("funnel", "description")} />
        <div className="flex gap-4 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-[280px] shrink-0">
              <Skeleton className="h-10 rounded-t-lg" />
              <Skeleton className="h-[300px] rounded-b-lg mt-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6">
      <PageHeader
        title={t("funnel", "title")}
        description={t("funnel", "description")}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              t={t}
              onRename={handleRenameStage}
              onDelete={handleDeleteStage}
            />
          ))}

          {/* Add stage button */}
          <button
            onClick={handleAddStage}
            className="flex flex-col items-center justify-center w-[280px] shrink-0 min-h-[200px] rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-background-subtle/50 transition-colors group"
          >
            <Plus className="size-6 text-foreground-muted/40 group-hover:text-primary/60 transition-colors" />
            <span className="mt-1 text-sm text-foreground-muted/60 group-hover:text-primary/60 transition-colors">
              {t("funnel", "addStage")}
            </span>
          </button>
        </div>

        <DragOverlay>
          {activeItem ? <OverlayCard item={activeItem} t={t} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
