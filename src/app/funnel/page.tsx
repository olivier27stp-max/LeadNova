"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "@/components/LanguageProvider";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Mail,
  Phone,
  ArrowRight,
  MapPin,
  Inbox,
  GripVertical,
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

// ─── Stage slug → translation key ───────────────────────

const STAGE_TRANSLATION_KEYS: Record<string, "newReplies" | "stageNotInterested" | "stageInterested" | "stageHotFollowUp1" | "stageHotFollowUp2" | "stageLost" | "stageClosed"> = {
  "new-replies": "newReplies",
  "not-interested": "stageNotInterested",
  "interested": "stageInterested",
  "hot-follow-up-1": "stageHotFollowUp1",
  "hot-follow-up-2": "stageHotFollowUp2",
  "lost": "stageLost",
  "closed": "stageClosed",
};

// ─── Stage color accents ────────────────────────────────

const STAGE_COLORS: Record<string, { bar: string; badge: string; dot: string; dropzone: string }> = {
  "new-replies":      { bar: "bg-primary",                          badge: "bg-primary-subtle text-primary",                     dot: "bg-primary",                          dropzone: "border-primary/40 bg-primary-subtle/30" },
  "not-interested":   { bar: "bg-foreground-muted",                 badge: "bg-background-muted text-foreground-muted",          dot: "bg-foreground-muted",                 dropzone: "border-foreground-muted/40 bg-background-muted/30" },
  "interested":       { bar: "bg-success",                          badge: "bg-success-subtle text-success",                     dot: "bg-success",                          dropzone: "border-success/40 bg-success-subtle/30" },
  "hot-follow-up-1":  { bar: "bg-warning",                          badge: "bg-warning-subtle text-warning",                     dot: "bg-warning",                          dropzone: "border-warning/40 bg-warning-subtle/30" },
  "hot-follow-up-2":  { bar: "bg-orange-500 dark:bg-orange-400",    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", dot: "bg-orange-500 dark:bg-orange-400", dropzone: "border-orange-400/40 bg-orange-50/30 dark:bg-orange-900/10" },
  "lost":             { bar: "bg-danger",                           badge: "bg-danger-subtle text-danger",                       dot: "bg-danger",                           dropzone: "border-danger/40 bg-danger-subtle/30" },
  "closed":           { bar: "bg-emerald-600 dark:bg-emerald-500",  badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-600 dark:bg-emerald-500", dropzone: "border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-900/10" },
};

const DEFAULT_COLOR = { bar: "bg-primary-light", badge: "bg-primary-subtle text-primary", dot: "bg-primary-light", dropzone: "border-primary/40 bg-primary-subtle/30" };

function getStageColor(slug: string) {
  return STAGE_COLORS[slug] || DEFAULT_COLOR;
}

// ─── Move Menu ──────────────────────────────────────────

function MoveMenu({
  stages,
  currentStageId,
  prospectId,
  getStageName,
  onMove,
}: {
  stages: Stage[];
  currentStageId: string;
  prospectId: string;
  getStageName: (s: Stage) => string;
  onMove: (prospectId: string, stageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1 rounded-md text-foreground-muted hover:text-primary hover:bg-primary-subtle transition-colors"
        title={t("funnel", "moveToStage")}
      >
        <ArrowRight className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-card shadow-xl py-1.5">
            <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
              {t("funnel", "moveToStage")}
            </p>
            {stages
              .filter((s) => s.id !== currentStageId)
              .map((s) => {
                const color = getStageColor(s.slug);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      onMove(prospectId, s.id);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-background-subtle flex items-center gap-2.5 transition-colors"
                  >
                    <span className={cn("size-2 rounded-full shrink-0", color.dot)} />
                    {getStageName(s)}
                  </button>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Skeleton Column ────────────────────────────────────

function SkeletonColumn() {
  return (
    <div className="flex flex-col w-[260px] shrink-0">
      <div className="h-1 bg-background-muted rounded-t-md animate-pulse" />
      <div className="px-4 py-3.5 bg-background-subtle border-b border-border">
        <div className="h-4 bg-background-muted rounded w-24 animate-pulse" />
      </div>
      <div className="p-2.5 space-y-2.5">
        {[120, 100, 90].map((w, i) => (
          <div key={i} className="rounded-lg border border-border p-3 animate-pulse">
            <div className="h-4 bg-background-muted rounded mb-2" style={{ width: `${w}px` }} />
            <div className="h-3 bg-background-muted/60 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function FunnelPage() {
  const { t } = useTranslation();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // ─── Drag & Drop state ──────────────────────────────
  const [dragProspectId, setDragProspectId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const dragSourceStageRef = useRef<string | null>(null);

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch("/api/funnel/stages");
      if (res.ok) {
        const data: Stage[] = await res.json();
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

  // ─── Helpers ────────────────────────────────────────

  function getStageName(stage: Stage): string {
    const key = STAGE_TRANSLATION_KEYS[stage.slug];
    if (key) {
      // If user renamed the stage, use the custom name
      const defaultNames: Record<string, string> = {
        "new-replies": "New Replies",
        "not-interested": "Not Interested",
        "interested": "Interested",
        "hot-follow-up-1": "Hot Follow-up #1",
        "hot-follow-up-2": "Hot Follow-up #2",
        "lost": "Lost",
        "closed": "Closed",
      };
      if (stage.name !== defaultNames[stage.slug]) return stage.name;
      return t("funnel", key);
    }
    return stage.name;
  }

  const totalProspects = stages.reduce((sum, s) => sum + s.prospects.length, 0);

  // ─── Handlers ───────────────────────────────────────

  async function handleAddStage() {
    const res = await fetch("/api/funnel/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t("funnel", "newStage") }),
    });
    if (res.ok) {
      const newStage: Stage = await res.json();
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
    setEditingStage(null);
  }

  async function handleDeleteStage(id: string) {
    if (!confirm(t("funnel", "deleteConfirm"))) return;
    const res = await fetch(`/api/funnel/stages?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setStages((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function handleMoveProspect(prospectId: string, targetStageId: string) {
    setStages((prev) => {
      const newStages = prev.map((s) => ({
        ...s,
        prospects: [...s.prospects],
      }));
      let movedItem: FunnelProspectItem | undefined;
      for (const stage of newStages) {
        const idx = stage.prospects.findIndex((p) => p.prospectId === prospectId);
        if (idx >= 0) {
          [movedItem] = stage.prospects.splice(idx, 1);
          break;
        }
      }
      if (movedItem) {
        const target = newStages.find((s) => s.id === targetStageId);
        if (target) target.prospects.push(movedItem);
      }
      return newStages;
    });
    await fetch("/api/funnel/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId, stageId: targetStageId, sortOrder: 0 }),
    });
  }

  async function handleRemoveProspect(prospectId: string) {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        prospects: s.prospects.filter((p) => p.prospectId !== prospectId),
      }))
    );
    await fetch(`/api/funnel/prospects?prospectId=${prospectId}`, { method: "DELETE" });
  }

  // ─── Drag & Drop handlers ──────────────────────────

  function handleDragStart(e: React.DragEvent, prospectId: string, sourceStageId: string) {
    setDragProspectId(prospectId);
    dragSourceStageRef.current = sourceStageId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", prospectId);
    // Slight delay so the dragged element gets the opacity
    requestAnimationFrame(() => {
      document.querySelectorAll(`[data-prospect-id="${prospectId}"]`).forEach((el) => {
        (el as HTMLElement).style.opacity = "0.4";
      });
    });
  }

  function handleDragEnd() {
    if (dragProspectId) {
      document.querySelectorAll(`[data-prospect-id="${dragProspectId}"]`).forEach((el) => {
        (el as HTMLElement).style.opacity = "1";
      });
    }
    setDragProspectId(null);
    setDragOverStageId(null);
    dragSourceStageRef.current = null;
  }

  function handleDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  }

  function handleDragLeave(e: React.DragEvent, stageId: string) {
    // Only clear if actually leaving the column (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      if (dragOverStageId === stageId) {
        setDragOverStageId(null);
      }
    }
  }

  function handleDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault();
    setDragOverStageId(null);

    if (dragProspectId && dragSourceStageRef.current !== targetStageId) {
      handleMoveProspect(dragProspectId, targetStageId);
    }

    // Reset opacity
    if (dragProspectId) {
      document.querySelectorAll(`[data-prospect-id="${dragProspectId}"]`).forEach((el) => {
        (el as HTMLElement).style.opacity = "1";
      });
    }
    setDragProspectId(null);
    dragSourceStageRef.current = null;
  }

  // ─── Render ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <PageHeader title={t("funnel", "title")} description={t("funnel", "description")} />
        <div className="flex mt-4 border border-border rounded-md bg-card shadow-sm overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cn(i > 1 && "border-l border-border")}>
              <SkeletonColumn />
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
        actions={
          <div className="flex items-center gap-3">
            {totalProspects > 0 && (
              <span className="text-sm text-foreground-muted tabular-nums">
                {totalProspects} {totalProspects === 1 ? t("funnel", "prospect") : t("funnel", "prospects")}
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={handleAddStage}>
              <Plus className="size-4" />
              {t("funnel", "addStage")}
            </Button>
          </div>
        }
      />

      {/* Pipeline columns */}
      <div className="mt-4 overflow-x-auto pb-2 -mb-2 scrollbar-thin">
        <div className="flex min-w-max rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          {stages.map((stage, idx) => {
            const color = getStageColor(stage.slug);
            const isDropTarget = dragOverStageId === stage.id && dragSourceStageRef.current !== stage.id;

            return (
              <div
                key={stage.id}
                className={cn(
                  "flex flex-col w-[260px] shrink-0 transition-colors duration-150",
                  idx > 0 && "border-l border-border"
                )}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={(e) => handleDragLeave(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Color accent bar */}
                <div className={cn("h-1 w-full", color.bar)} />

                {/* ── Column header ── */}
                <div className="px-4 py-3 bg-background-subtle border-b border-border">
                  {editingStage === stage.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameStage(stage.id, editName);
                          if (e.key === "Escape") setEditingStage(null);
                        }}
                        className="h-7 w-full rounded-md border border-border bg-card px-2 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button onClick={() => handleRenameStage(stage.id, editName)} className="p-1 text-success hover:bg-success-subtle rounded-md shrink-0 transition-colors">
                        <Check className="size-3.5" />
                      </button>
                      <button onClick={() => setEditingStage(null)} className="p-1 text-foreground-muted hover:bg-background-muted rounded-md shrink-0 transition-colors">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between group/header">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-[13px]">
                          {getStageName(stage)}
                        </span>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
                          color.badge
                        )}>
                          {stage.prospects.length}
                        </span>
                      </div>
                      {!stage.isDefault && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingStage(stage.id);
                              setEditName(getStageName(stage));
                            }}
                            className="p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-muted transition-colors"
                            title={t("funnel", "rename")}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteStage(stage.id)}
                            className="p-1 rounded-md text-foreground-muted hover:text-danger hover:bg-danger-subtle transition-colors"
                            title={t("funnel", "delete")}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Cards / Drop zone ── */}
                <div className={cn(
                  "flex-1 p-2.5 flex flex-col gap-2 min-h-[300px] transition-colors duration-150",
                  isDropTarget
                    ? color.dropzone
                    : "bg-background-subtle/30"
                )}>
                  {/* Drop indicator */}
                  {isDropTarget && (
                    <div className="rounded-lg border-2 border-dashed border-current opacity-30 h-16 flex items-center justify-center">
                      <ArrowRight className="size-4" />
                    </div>
                  )}

                  {stage.prospects.length === 0 && !isDropTarget ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
                      <Inbox className="size-8 text-foreground-muted/20" />
                      <p className="text-xs text-foreground-muted/40">{t("funnel", "emptyStage")}</p>
                    </div>
                  ) : (
                    stage.prospects.map((item) => (
                      <div
                        key={item.prospectId}
                        data-prospect-id={item.prospectId}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.prospectId, stage.id)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "group/card rounded-lg border border-border bg-card p-3 transition-all duration-150",
                          "hover:shadow-md hover:border-border-strong",
                          "cursor-grab active:cursor-grabbing",
                          dragProspectId === item.prospectId && "ring-2 ring-primary/30"
                        )}
                      >
                        {/* Card title + action icons */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 flex-1 min-w-0">
                            <GripVertical className="size-3.5 mt-0.5 shrink-0 text-foreground-muted/30 group-hover/card:text-foreground-muted transition-colors" />
                            <p className="font-semibold text-foreground text-[13px] leading-snug line-clamp-2 flex-1">
                              {item.prospect.companyName}
                            </p>
                          </div>
                          <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity">
                            {item.prospect.phone && (
                              <a
                                href={`tel:${item.prospect.phone}`}
                                className="p-1 rounded-md text-foreground-muted hover:text-primary hover:bg-primary-subtle transition-colors"
                                title={item.prospect.phone}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="size-3.5" />
                              </a>
                            )}
                            {item.prospect.email && (
                              <a
                                href={`mailto:${item.prospect.email}`}
                                className="p-1 rounded-md text-foreground-muted hover:text-primary hover:bg-primary-subtle transition-colors"
                                title={item.prospect.email}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Mail className="size-3.5" />
                              </a>
                            )}
                            <MoveMenu
                              stages={stages}
                              currentStageId={stage.id}
                              prospectId={item.prospectId}
                              getStageName={getStageName}
                              onMove={handleMoveProspect}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveProspect(item.prospectId); }}
                              className="p-1 rounded-md text-foreground-muted hover:text-danger hover:bg-danger-subtle transition-colors"
                              title={t("funnel", "remove")}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="mt-2 ml-5 flex flex-col gap-1">
                          {item.prospect.leadScore > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className={cn(
                                "h-1.5 rounded-full",
                                item.prospect.leadScore >= 40 ? "bg-success w-8" :
                                item.prospect.leadScore >= 20 ? "bg-warning w-5" :
                                "bg-foreground-muted/30 w-3"
                              )} />
                              <span className="text-xs font-medium text-foreground-secondary tabular-nums">
                                {item.prospect.leadScore} pts
                              </span>
                            </div>
                          )}

                          {item.prospect.city && (
                            <span className="flex items-center gap-1 text-xs text-foreground-muted">
                              <MapPin className="size-3 shrink-0" />
                              {item.prospect.city}
                            </span>
                          )}

                          {item.prospect.email && (
                            <span className="flex items-center gap-1 text-xs text-foreground-muted truncate">
                              <Mail className="size-3 shrink-0" />
                              {item.prospect.email}
                            </span>
                          )}

                          {item.prospect.industry && (
                            <p className="text-[11px] text-foreground-muted/70 truncate mt-0.5">
                              {item.prospect.industry}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
