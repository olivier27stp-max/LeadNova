"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityLogEntry {
  id: string;
  action: string;
  details?: string | null;
  createdAt: string;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    settings_updated: "Paramètres modifiés",
    user_created: "Utilisateur créé",
    user_updated: "Utilisateur modifié",
    user_deleted: "Utilisateur supprimé",
  };
  return map[action] || action;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

export default function ActivityBell() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadLogs = useCallback(() => {
    setLoading(true);
    fetch("/api/activity-log?limit=15")
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => setLogs(d.logs || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) loadLogs();
  }, [open, loadLogs]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "p-2 rounded-md transition-colors",
          open
            ? "text-foreground bg-background-muted"
            : "text-foreground-muted hover:text-foreground hover:bg-background-subtle"
        )}
        title="Centre des activités"
      >
        <Bell className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">
              Centre des activités
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={loadLogs}
                className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
                title="Rafraîchir"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-subtle transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-foreground-muted text-sm text-center py-8">
                Aucune activité enregistrée.
              </p>
            ) : (
              <div>
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-background-subtle transition-colors"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {formatAction(log.action)}
                      </p>
                      {log.details && (
                        <p className="text-xs text-foreground-muted truncate">
                          {log.details}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted shrink-0 pt-0.5">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
