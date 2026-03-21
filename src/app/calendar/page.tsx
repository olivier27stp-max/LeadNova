"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "@/components/LanguageProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  Mail,
  RefreshCcw,
  CheckSquare,
  Filter,
  Bell,
  Eye,
  Building2,
  Phone,
  AtSign,
  Flag,
  Megaphone,
  ListTodo,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  type: "followup" | "scheduled_email" | "task";
  start: string;
  end?: string;
  status?: string;
  description?: string;
  campaignId?: string;
  campaignName?: string;
  priority?: string;
  relatedProspects?: Array<{
    id: string;
    companyName: string;
    email: string | null;
    phone: string | null;
  }>;
}

interface Notification {
  id: string;
  event: CalendarEvent;
  dismissedAt?: number;
}

type ViewMode = "day" | "week" | "month";

// ─── Helpers ──────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfWeek(d: Date): Date {
  const r = startOfWeek(d);
  r.setDate(r.getDate() + 6);
  r.setHours(23, 59, 59, 999);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

const WEEKDAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_CONFIG = {
  followup: { label: "Follow-up", color: "bg-amber-500", textColor: "text-amber-700 dark:text-amber-400", bgLight: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700", icon: RefreshCcw },
  scheduled_email: { label: "Email planifié", color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400", bgLight: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-300 dark:border-blue-700", icon: Mail },
  task: { label: "Tâche", color: "bg-violet-500", textColor: "text-violet-700 dark:text-violet-400", bgLight: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-300 dark:border-violet-700", icon: CheckSquare },
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  SENT: "Envoyé",
  CANCELLED: "Annulé",
  FAILED: "Échoué",
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
};

const PRIORITY_CONFIG: Record<string, { label: string; variant: "danger" | "warning" | "default" }> = {
  HIGH: { label: "Haute", variant: "danger" },
  MEDIUM: { label: "Moyenne", variant: "warning" },
  LOW: { label: "Basse", variant: "default" },
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── Main Component ──────────────────────────────────────

export default function CalendarPage() {
  const { t, locale } = useTranslation();
  const WEEKDAYS = locale === "fr" ? WEEKDAYS_FR : WEEKDAYS_EN;

  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [filters, setFilters] = useState({ followup: true, scheduled_email: true, task: true });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [prospects, setProspects] = useState<Array<{ id: string; companyName: string }>>([]);

  // ─── Date range from view ──────────────────────────────

  const { from, to } = useMemo(() => {
    if (view === "day") return { from: startOfDay(currentDate), to: endOfDay(currentDate) };
    if (view === "week") return { from: startOfWeek(currentDate), to: endOfWeek(currentDate) };
    // month: include surrounding days for calendar grid
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    const gridStart = startOfWeek(ms);
    const gridEnd = endOfWeek(me);
    return { from: gridStart, to: gridEnd };
  }, [view, currentDate]);

  // ─── Fetch events ──────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const activeTypes = Object.entries(filters).filter(([, v]) => v).map(([k]) => k);
      const res = await fetch(
        `/api/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}&types=${activeTypes.join(",")}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  }, [from, to, filters]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch campaigns + prospects for task form
  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setCampaigns(d.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
    fetch("/api/prospects?limit=200&fields=id,companyName").then((r) => r.json()).then((d) => {
      const list = d.prospects || d;
      if (Array.isArray(list)) setProspects(list.map((p: { id: string; companyName: string }) => ({ id: p.id, companyName: p.companyName })));
    }).catch(() => {});
  }, []);

  // ─── Notifications system ──────────────────────────────

  useEffect(() => {
    const checkNotifications = () => {
      const now = new Date();
      for (const event of events) {
        const eventTime = new Date(event.start);
        const diff = eventTime.getTime() - now.getTime();
        // Trigger if within 1 minute window and not already notified
        if (diff >= -60000 && diff <= 60000 && !notifiedRef.current.has(event.id)) {
          notifiedRef.current.add(event.id);
          setNotifications((prev) => [...prev, { id: event.id, event }]);
        }
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 15000);
    return () => clearInterval(interval);
  }, [events]);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // ─── Navigation ────────────────────────────────────────

  function navigate(direction: -1 | 1) {
    const d = new Date(currentDate);
    if (view === "day") d.setDate(d.getDate() + direction);
    else if (view === "week") d.setDate(d.getDate() + 7 * direction);
    else d.setMonth(d.getMonth() + direction);
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // ─── Header title ──────────────────────────────────────

  const headerTitle = useMemo(() => {
    if (view === "day") return formatDate(currentDate);
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return `${formatShortDate(ws)} — ${formatShortDate(we)}`;
    }
    return currentDate.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "long", year: "numeric" });
  }, [view, currentDate, locale]);

  // ─── Filtered events ──────────────────────────────────

  const filteredEvents = useMemo(() => {
    return events.filter((e) => filters[e.type]);
  }, [events, filters]);

  // ─── Events grouped by day ──────────────────────────────

  function eventsForDay(day: Date): CalendarEvent[] {
    return filteredEvents.filter((e) => isSameDay(new Date(e.start), day));
  }

  function eventsForHour(day: Date, hour: number): CalendarEvent[] {
    return filteredEvents.filter((e) => {
      const d = new Date(e.start);
      return isSameDay(d, day) && d.getHours() === hour;
    });
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Notifications Banner */}
      <NotificationBanner
        notifications={notifications}
        onDismiss={dismissNotification}
        onView={(event) => { dismissNotification(event.id); setSelectedEvent(event); }}
      />

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-subtle">
            <CalendarDays className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Calendrier</h1>
            <p className="text-sm text-foreground-muted">Suivis, envois et tâches planifiées</p>
          </div>
        </div>
        <Button onClick={() => setShowAddTask(true)}>
          <Plus className="size-4" />
          Ajouter une tâche
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goToday}>
            Aujourd&apos;hui
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="text-sm font-medium text-foreground capitalize ml-2">{headerTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex items-center gap-1 mr-2">
            <Filter className="size-3.5 text-foreground-muted mr-1" />
            {(["followup", "scheduled_email", "task"] as const).map((type) => {
              const cfg = TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  onClick={() => setFilters((f) => ({ ...f, [type]: !f[type] }))}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
                    filters[type]
                      ? `${cfg.bgLight} ${cfg.textColor} ${cfg.border}`
                      : "bg-background-subtle text-foreground-muted border-transparent opacity-50"
                  )}
                >
                  <span className={cn("size-2 rounded-full", cfg.color)} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          {/* View switcher */}
          <div className="flex items-center bg-background-subtle rounded-md p-0.5">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-colors",
                  view === v ? "bg-card text-foreground shadow-sm" : "text-foreground-muted hover:text-foreground"
                )}
              >
                {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Body */}
      <div className="bg-card border border-border rounded-lg overflow-hidden min-h-[600px]">
        {loading ? (
          <div className="flex items-center justify-center h-[600px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : view === "month" ? (
          <MonthView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            onSelectEvent={setSelectedEvent}
            onClickDay={(d) => { setCurrentDate(d); setView("day"); }}
            weekdays={WEEKDAYS}
          />
        ) : view === "week" ? (
          <WeekView
            currentDate={currentDate}
            eventsForHour={eventsForHour}
            eventsForDay={eventsForDay}
            onSelectEvent={setSelectedEvent}
            weekdays={WEEKDAYS}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            eventsForHour={eventsForHour}
            onSelectEvent={setSelectedEvent}
          />
        )}
      </div>

      {/* Event Detail Drawer */}
      <AnimatePresence>
        {selectedEvent && (
          <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} onUpdate={fetchEvents} />
        )}
      </AnimatePresence>

      {/* Add Task Modal */}
      <AnimatePresence>
        {showAddTask && (
          <AddTaskModal
            campaigns={campaigns}
            prospects={prospects}
            onClose={() => setShowAddTask(false)}
            onCreated={() => { setShowAddTask(false); fetchEvents(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────

function MonthView({
  currentDate,
  eventsForDay,
  onSelectEvent,
  onClickDay,
  weekdays,
}: {
  currentDate: Date;
  eventsForDay: (d: Date) => CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onClickDay: (d: Date) => void;
  weekdays: string[];
}) {
  const ms = startOfMonth(currentDate);
  const me = endOfMonth(currentDate);
  const gridStart = startOfWeek(ms);
  const today = new Date();

  const weeks: Date[][] = [];
  let cursor = new Date(gridStart);
  while (cursor <= me || weeks.length < 6) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 6) break;
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((wd) => (
          <div key={wd} className="p-2 text-center text-xs font-medium text-foreground-muted">
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, idx) => {
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = eventsForDay(day);

          return (
            <div
              key={idx}
              className={cn(
                "min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer hover:bg-background-subtle transition-colors",
                !isCurrentMonth && "bg-background-subtle/50"
              )}
              onClick={() => onClickDay(day)}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                    isToday ? "bg-primary text-white" : isCurrentMonth ? "text-foreground" : "text-foreground-muted/50"
                  )}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-foreground-muted">{dayEvents.length}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                    className={cn(
                      "w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-80",
                      TYPE_CONFIG[ev.type].bgLight,
                      TYPE_CONFIG[ev.type].textColor
                    )}
                  >
                    <span className={cn("inline-block size-1.5 rounded-full mr-1", TYPE_CONFIG[ev.type].color)} />
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-foreground-muted pl-1">+{dayEvents.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ──────────────────────────────────────────

function WeekView({
  currentDate,
  eventsForHour,
  eventsForDay,
  onSelectEvent,
  weekdays,
}: {
  currentDate: Date;
  eventsForHour: (d: Date, h: number) => CalendarEvent[];
  eventsForDay: (d: Date) => CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  weekdays: string[];
}) {
  const ws = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(0, (now.getHours() - 2) * 60);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border sticky top-0 bg-card z-10">
        <div className="p-2" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className={cn("p-2 text-center border-l border-border", isToday && "bg-primary-subtle/30")}>
              <div className="text-xs text-foreground-muted">{weekdays[day.getDay()]}</div>
              <div className={cn(
                "text-sm font-semibold mt-0.5",
                isToday ? "text-primary" : "text-foreground"
              )}>
                {day.getDate()}
              </div>
              {/* All-day events count */}
              {eventsForDay(day).length > 0 && (
                <div className="flex gap-0.5 justify-center mt-1">
                  {Object.keys(TYPE_CONFIG).map((type) => {
                    const count = eventsForDay(day).filter((e) => e.type === type).length;
                    if (!count) return null;
                    return <span key={type} className={cn("size-1.5 rounded-full", TYPE_CONFIG[type as keyof typeof TYPE_CONFIG].color)} />;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[540px]">
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/50 min-h-[60px]">
            <div className="p-1 text-right pr-2 text-[10px] text-foreground-muted">
              {hour.toString().padStart(2, "0")}:00
            </div>
            {days.map((day, di) => {
              const hourEvents = eventsForHour(day, hour);
              const isNowHour = isSameDay(day, today) && today.getHours() === hour;
              return (
                <div
                  key={di}
                  className={cn(
                    "border-l border-border/50 p-0.5 relative",
                    isNowHour && "bg-primary-subtle/10"
                  )}
                >
                  {hourEvents.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={cn(
                        "w-full text-left text-[10px] px-1.5 py-1 rounded mb-0.5 truncate font-medium border transition-all hover:shadow-sm",
                        TYPE_CONFIG[ev.type].bgLight,
                        TYPE_CONFIG[ev.type].textColor,
                        TYPE_CONFIG[ev.type].border
                      )}
                    >
                      <span className="font-normal opacity-70">{formatTime(new Date(ev.start))}</span>{" "}
                      {ev.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Day View ──────────────────────────────────────────

function DayView({
  currentDate,
  eventsForHour,
  onSelectEvent,
}: {
  currentDate: Date;
  eventsForHour: (d: Date, h: number) => CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(0, (now.getHours() - 2) * 60);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div ref={scrollRef} className="overflow-y-auto max-h-[600px]">
      {HOURS.map((hour) => {
        const hourEvents = eventsForHour(currentDate, hour);
        const isNowHour = isSameDay(currentDate, today) && today.getHours() === hour;
        return (
          <div
            key={hour}
            className={cn(
              "grid grid-cols-[80px_1fr] border-b border-border/50 min-h-[64px]",
              isNowHour && "bg-primary-subtle/10"
            )}
          >
            <div className="p-2 text-right pr-3 text-xs text-foreground-muted font-medium">
              {hour.toString().padStart(2, "0")}:00
            </div>
            <div className="p-1 border-l border-border/50 space-y-1">
              {hourEvents.map((ev) => {
                const cfg = TYPE_CONFIG[ev.type];
                const Icon = cfg.icon;
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md border transition-all hover:shadow-md flex items-start gap-2",
                      cfg.bgLight, cfg.textColor, cfg.border
                    )}
                  >
                    <Icon className="size-3.5 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{ev.title}</div>
                      <div className="text-[10px] opacity-70 flex items-center gap-1.5 mt-0.5">
                        <Clock className="size-3" />
                        {formatTime(new Date(ev.start))}
                        {ev.status && <Badge variant={ev.status === "DONE" || ev.status === "SENT" ? "success" : "default"} className="text-[9px] px-1 py-0">{STATUS_LABELS[ev.status] || ev.status}</Badge>}
                        {ev.campaignName && <span className="truncate">• {ev.campaignName}</span>}
                      </div>
                    </div>
                    {ev.relatedProspects && ev.relatedProspects.length > 0 && (
                      <span className="text-[10px] opacity-60 shrink-0">{ev.relatedProspects.length} contact{ev.relatedProspects.length > 1 ? "s" : ""}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Event Detail Drawer ──────────────────────────────────

function EventDrawer({
  event,
  onClose,
  onUpdate,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const cfg = TYPE_CONFIG[event.type];
  const Icon = cfg.icon;
  const isTask = event.type === "task";
  const realId = event.id.replace(/^(task_|se_|fu_)/, "");

  async function updateTaskStatus(status: string) {
    await fetch(`/api/calendar/tasks/${realId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onUpdate();
    onClose();
  }

  async function deleteTask() {
    if (!confirm("Supprimer cette tâche ?")) return;
    await fetch(`/api/calendar/tasks/${realId}`, { method: "DELETE" });
    onUpdate();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md bg-card border-l border-border shadow-2xl overflow-y-auto"
      >
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md", cfg.bgLight)}>
              <Icon className={cn("size-4", cfg.textColor)} />
            </div>
            <span className={cn("text-xs font-medium", cfg.textColor)}>{cfg.label}</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">
          {/* Title */}
          <h2 className="text-lg font-semibold text-foreground">{event.title}</h2>

          {/* Date / Time */}
          <div className="flex items-center gap-2 text-sm text-foreground-secondary">
            <Clock className="size-4" />
            <span>{formatDate(new Date(event.start))} à {formatTime(new Date(event.start))}</span>
          </div>

          {/* Status */}
          {event.status && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground-muted">Statut :</span>
              <Badge variant={event.status === "DONE" || event.status === "SENT" ? "success" : event.status === "FAILED" ? "danger" : "default"}>
                {STATUS_LABELS[event.status] || event.status}
              </Badge>
            </div>
          )}

          {/* Priority (tasks only) */}
          {event.priority && PRIORITY_CONFIG[event.priority] && (
            <div className="flex items-center gap-2">
              <Flag className="size-4 text-foreground-muted" />
              <span className="text-sm text-foreground-muted">Priorité :</span>
              <Badge variant={PRIORITY_CONFIG[event.priority].variant}>
                {PRIORITY_CONFIG[event.priority].label}
              </Badge>
            </div>
          )}

          {/* Campaign */}
          {event.campaignName && (
            <div className="flex items-center gap-2 text-sm">
              <Megaphone className="size-4 text-foreground-muted" />
              <span className="text-foreground-muted">Campagne :</span>
              <span className="font-medium text-foreground">{event.campaignName}</span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="space-y-1">
              <span className="text-sm text-foreground-muted">Description</span>
              <p className="text-sm text-foreground bg-background-subtle rounded-md p-3">{event.description}</p>
            </div>
          )}

          {/* Related Prospects */}
          {event.relatedProspects && event.relatedProspects.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-foreground-muted" />
                <span className="text-sm font-medium text-foreground">
                  Contacts ({event.relatedProspects.length})
                </span>
              </div>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {event.relatedProspects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-background-subtle rounded-md p-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{p.companyName}</div>
                      <div className="flex items-center gap-3 mt-0.5 text-foreground-muted">
                        {p.email && (
                          <span className="flex items-center gap-1 truncate">
                            <AtSign className="size-3" />{p.email}
                          </span>
                        )}
                        {p.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" />{p.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Actions */}
          {isTask && (
            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex gap-2">
                {event.status !== "DONE" && (
                  <Button size="sm" variant="success" onClick={() => updateTaskStatus("DONE")}>
                    <CheckSquare className="size-3.5" /> Marquer terminé
                  </Button>
                )}
                {event.status === "TODO" && (
                  <Button size="sm" variant="secondary" onClick={() => updateTaskStatus("IN_PROGRESS")}>
                    En cours
                  </Button>
                )}
                {event.status === "DONE" && (
                  <Button size="sm" variant="secondary" onClick={() => updateTaskStatus("TODO")}>
                    Réouvrir
                  </Button>
                )}
              </div>
              <Button size="sm" variant="danger-ghost" onClick={deleteTask}>
                Supprimer la tâche
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Add Task Modal ──────────────────────────────────────

function AddTaskModal({
  campaigns,
  prospects,
  onClose,
  onCreated,
}: {
  campaigns: Array<{ id: string; name: string }>;
  prospects: Array<{ id: string; companyName: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState("09:00");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("TODO");
  const [prospectId, setProspectId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const dueAt = new Date(`${date}T${time}:00`);
    try {
      const res = await fetch("/api/calendar/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          dueAt: dueAt.toISOString(),
          priority,
          status,
          prospectId: prospectId || null,
          campaignId: campaignId || null,
        }),
      });

      if (res.ok) {
        onCreated();
      }
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Nouvelle tâche</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Titre *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Relancer les leads de Québec"
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Détails optionnels..."
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Heure *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Priorité</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Statut</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="TODO">À faire</option>
                <option value="IN_PROGRESS">En cours</option>
                <option value="DONE">Terminé</option>
              </select>
            </div>
          </div>

          {/* Prospect */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Prospect lié (optionnel)</label>
            <select
              value={prospectId}
              onChange={(e) => setProspectId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Aucun</option>
              {prospects.map((p) => (
                <option key={p.id} value={p.id}>{p.companyName}</option>
              ))}
            </select>
          </div>

          {/* Campaign */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">Campagne liée (optionnel)</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Aucune</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={saving || !title.trim()}>
              {saving ? "Création..." : "Créer la tâche"}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Notification Banner ──────────────────────────────────

function NotificationBanner({
  notifications,
  onDismiss,
  onView,
}: {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onView: (event: CalendarEvent) => void;
}) {
  if (notifications.length === 0) return null;

  const NOTIF_MESSAGES: Record<string, string> = {
    followup: "Follow-up maintenant",
    scheduled_email: "Email planifié maintenant",
    task: "Tâche due maintenant",
  };

  return (
    <div className="fixed top-14 right-4 z-[60] space-y-2 max-w-sm">
      <AnimatePresence>
        {notifications.map((n) => {
          const cfg = TYPE_CONFIG[n.event.type];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -10, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg shadow-lg border",
                "bg-card", cfg.border
              )}
            >
              <div className={cn("p-1.5 rounded-md shrink-0", cfg.bgLight)}>
                <Icon className={cn("size-4", cfg.textColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-xs font-semibold", cfg.textColor)}>
                  {NOTIF_MESSAGES[n.event.type]}
                </div>
                <div className="text-sm font-medium text-foreground truncate mt-0.5">
                  {n.event.title}
                </div>
                <div className="text-[10px] text-foreground-muted mt-0.5">
                  {formatTime(new Date(n.event.start))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onView(n.event)}
                  className="p-1 rounded hover:bg-background-subtle text-foreground-muted hover:text-foreground transition-colors"
                  title="Voir"
                >
                  <Eye className="size-3.5" />
                </button>
                <button
                  onClick={() => onDismiss(n.id)}
                  className="p-1 rounded hover:bg-background-subtle text-foreground-muted hover:text-foreground transition-colors"
                  title="Fermer"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
