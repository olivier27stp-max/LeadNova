"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Workspace {
  id: string;
  name: string;
  role: string;
}

interface WorkspaceData {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}

export default function WorkspaceSwitcher() {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [ready, setReady] = useState(false); // true once first fetch completes
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create" | "rename" | "delete">("list");
  const [inputValue, setInputValue] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch {
      // ignore
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMode("list");
        setError("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setMode("list"); }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === data?.activeWorkspaceId) { setOpen(false); return; }
    await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    setOpen(false);
    router.refresh();
    // Reload page data
    window.location.reload();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputValue.trim() }),
      });
      const created = await res.json();
      if (!res.ok) { setError(created.error || "Erreur"); setActionLoading(false); return; }
      // Switch to new workspace
      await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: created.id }),
      });
      setOpen(false);
      setMode("list");
      setInputValue("");
      window.location.reload();
    } catch {
      setError("Erreur réseau");
      setActionLoading(false);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || !data?.activeWorkspaceId) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${data.activeWorkspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputValue.trim() }),
      });
      const updated = await res.json();
      if (!res.ok) { setError(updated.error || "Erreur"); setActionLoading(false); return; }
      await loadWorkspaces();
      setMode("list");
      setInputValue("");
    } catch {
      setError("Erreur réseau");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!data?.activeWorkspaceId) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${data.activeWorkspaceId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Erreur"); setActionLoading(false); return; }
      setOpen(false);
      setMode("list");
      window.location.reload();
    } catch {
      setError("Erreur réseau");
      setActionLoading(false);
    }
  }

  // Loading skeleton
  if (!ready) {
    return <div className="h-6 w-28 rounded-md bg-background-subtle animate-pulse" />;
  }

  // Not logged in or no workspaces
  if (!data || data.workspaces.length === 0) return null;

  const activeWorkspace = data.workspaces.find((w) => w.id === data.activeWorkspaceId)
    ?? data.workspaces[0];
  const isOwner = activeWorkspace?.role === "OWNER";

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        onClick={() => { setOpen((v) => !v); setMode("list"); setError(""); }}
        className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md hover:bg-background-subtle transition-colors text-foreground-secondary hover:text-foreground"
      >
        <Building2 className="size-3.5 text-foreground-muted shrink-0" />
        <span className="text-[13px] font-medium max-w-[120px] truncate hidden sm:block">
          {activeWorkspace?.name ?? "Workspace"}
        </span>
        <ChevronDown
          className={`size-3 text-foreground-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div className="w-px h-5 bg-border mx-1" />

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-card border border-border rounded-xl shadow-lg overflow-hidden">

          {/* List mode */}
          {mode === "list" && (
            <>
              <div className="px-3 pt-3 pb-2">
                <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wider mb-2">
                  Espace de travail
                </p>
                <div className="space-y-0.5">
                  {data.workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => switchWorkspace(ws.id)}
                      className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        ws.id === activeWorkspace?.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-background-subtle"
                      }`}
                    >
                      <div className={`size-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        ws.id === activeWorkspace?.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-background-subtle text-foreground-muted border border-border"
                      }`}>
                        {ws.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="truncate flex-1 text-left">{ws.name}</span>
                      {ws.id === activeWorkspace?.id && (
                        <Check className="size-3.5 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border p-1">
                {isOwner && (
                  <>
                    <button
                      onClick={() => { setMode("rename"); setInputValue(activeWorkspace?.name ?? ""); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-foreground hover:bg-background-subtle transition-colors"
                    >
                      <Pencil className="size-4 text-foreground-muted" />
                      Renommer
                    </button>
                    {data.workspaces.length > 1 && (
                      <button
                        onClick={() => setMode("delete")}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger-subtle transition-colors"
                      >
                        <Trash2 className="size-4" />
                        Supprimer ce workspace
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setMode("create"); setInputValue(""); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-foreground hover:bg-background-subtle transition-colors"
                >
                  <Plus className="size-4 text-foreground-muted" />
                  Nouveau workspace
                </button>
              </div>
            </>
          )}

          {/* Create mode */}
          {mode === "create" && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Nouveau workspace</p>
                <button onClick={() => setMode("list")} className="p-1 text-foreground-muted hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Nom du workspace"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {error && <p className="text-xs text-danger">{error}</p>}
                <Button type="submit" variant="primary" className="w-full" disabled={actionLoading || !inputValue.trim()}>
                  {actionLoading ? "Création…" : "Créer"}
                </Button>
              </form>
            </div>
          )}

          {/* Rename mode */}
          {mode === "rename" && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Renommer</p>
                <button onClick={() => setMode("list")} className="p-1 text-foreground-muted hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              <form onSubmit={handleRename} className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Nouveau nom"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {error && <p className="text-xs text-danger">{error}</p>}
                <Button type="submit" variant="primary" className="w-full" disabled={actionLoading || !inputValue.trim()}>
                  {actionLoading ? "Sauvegarde…" : "Enregistrer"}
                </Button>
              </form>
            </div>
          )}

          {/* Delete confirmation */}
          {mode === "delete" && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-danger shrink-0" />
                <p className="text-sm font-semibold text-foreground">Supprimer le workspace ?</p>
              </div>
              <p className="text-xs text-foreground-secondary">
                Toutes les données de <strong>{activeWorkspace?.name}</strong> seront supprimées définitivement.
              </p>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setMode("list")}>
                  Annuler
                </Button>
                <Button variant="danger" className="flex-1" onClick={handleDelete} disabled={actionLoading}>
                  {actionLoading ? "Suppression…" : "Supprimer"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
