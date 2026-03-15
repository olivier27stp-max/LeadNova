"use client";

import { useState, useEffect } from "react";
import { X, Clock, CalendarDays, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScheduleModalProps {
  selectedCount: number;
  onConfirm: (scheduledFor: Date, timezone: string) => Promise<void>;
  onClose: () => void;
}

function getTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
  catch { return "America/Toronto"; }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function nextBusinessDay(from: Date): Date {
  const d = addDays(from, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function formatScheduled(date: Date, tz: string): string {
  return date.toLocaleString("fr-CA", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Preset {
  label: string;
  getDate: () => Date;
}

function buildPresets(): Preset[] {
  const now = new Date();
  const tomorrow = addDays(now, 1);
  const nbd = nextBusinessDay(now);

  function at(base: Date, h: number, m = 0): Date {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  }

  return [
    { label: "Demain 8h00",  getDate: () => at(tomorrow, 8) },
    { label: "Demain 9h00",  getDate: () => at(tomorrow, 9) },
    { label: "Demain 10h00", getDate: () => at(tomorrow, 10) },
    { label: "Prochain jour ouvrable 8h00", getDate: () => at(nbd, 8) },
    { label: "Prochain jour ouvrable 9h00", getDate: () => at(nbd, 9) },
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleModal({ selectedCount, onConfirm, onClose }: ScheduleModalProps) {
  const tz = getTimezone();
  const presets = buildPresets();

  const tomorrow = addDays(new Date(), 1);
  const [customDate, setCustomDate] = useState(toDateStr(tomorrow));
  const [customTime, setCustomTime] = useState("09:00");
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const d = new Date(`${toDateStr(tomorrow)}T09:00`);
    return isNaN(d.getTime()) ? null : d;
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const todayStr = toDateStr(new Date());

  function buildDate(date: string, time: string): Date | null {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}`);
    return isNaN(d.getTime()) ? null : d;
  }

  function handleDateChange(date: string) {
    setCustomDate(date);
    const d = buildDate(date, customTime);
    if (!d) { setSelectedDate(null); setError("Date invalide."); return; }
    if (d <= new Date()) { setSelectedDate(null); setError("La date doit être dans le futur."); return; }
    setSelectedDate(d);
    setError("");
  }

  function handleTimeChange(time: string) {
    setCustomTime(time);
    const d = buildDate(customDate, time);
    if (!d) { setSelectedDate(null); setError("Heure invalide."); return; }
    if (d <= new Date()) { setSelectedDate(null); setError("La date doit être dans le futur."); return; }
    setSelectedDate(d);
    setError("");
  }

  function selectPreset(preset: Preset) {
    const d = preset.getDate();
    setCustomDate(toDateStr(d));
    setCustomTime(toTimeStr(d));
    setSelectedDate(d);
    setError("");
  }

  async function handleConfirm() {
    if (!selectedDate) { setError("Veuillez choisir une date et heure."); return; }
    if (selectedDate <= new Date()) { setError("La date doit être dans le futur."); return; }
    setLoading(true);
    try {
      await onConfirm(selectedDate, tz);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Planifier l'envoi</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Target info */}
          <p className="text-sm text-foreground-secondary">
            Envoi planifié à{" "}
            <span className="font-semibold text-foreground">{selectedCount} contact{selectedCount !== 1 ? "s" : ""}</span>
          </p>

          {/* Quick presets */}
          <div>
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2">Envoi rapide</p>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => selectPreset(p)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    selectedDate && toDateStr(selectedDate) === toDateStr(p.getDate()) && toTimeStr(selectedDate) === toTimeStr(p.getDate())
                      ? "border-primary bg-primary-subtle text-primary font-medium"
                      : "border-border bg-background-subtle hover:bg-card-hover text-foreground-secondary"
                  }`}
                >
                  <CalendarDays className="size-3.5 inline mr-1.5 opacity-60" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date/time */}
          <div>
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2">Date et heure personnalisées</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Date</label>
                <input
                  type="date"
                  value={customDate}
                  min={todayStr}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-muted mb-1">Heure</label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle rounded-md px-3 py-2">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Summary */}
          {selectedDate && !error && (
            <div className="bg-primary-subtle border border-primary/20 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1">Envoi planifié pour</p>
              <p className="text-sm font-semibold text-foreground capitalize">
                {formatScheduled(selectedDate, tz)}
              </p>
              <p className="text-xs text-foreground-muted mt-0.5">{tz}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-border bg-background-subtle">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={!selectedDate || !!error || loading}
            onClick={handleConfirm}
          >
            <Send className="size-3.5" />
            {loading ? "Planification…" : "Confirmer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
