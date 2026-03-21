"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  FileText,
  Loader2,
} from "lucide-react";

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.status === 403) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function createNote() {
    setCreating(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Sans titre", content: "" }),
      });
      const data = await res.json();
      console.log("Create note response:", res.status, data);
      if (data.note) {
        router.push(`/notes/${data.note.id}`);
      }
    } catch (err) {
      console.error("Create note error:", err);
    } finally {
      setCreating(false);
    }
  }

  async function togglePin(e: React.MouseEvent, note: Note) {
    e.stopPropagation();
    try {
      await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      fetchNotes();
    } catch {
      // ignore
    }
  }

  async function deleteNote(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await fetch(`/api/notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // ignore
    }
  }

  function getPreview(content: string) {
    const stripped = content.replace(/<[^>]*>/g, "").trim();
    return stripped.length > 120 ? stripped.slice(0, 120) + "..." : stripped || "Note vide";
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-CA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const filtered = notes.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.content.replace(/<[^>]*>/g, "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title="Mes notes"
        description="Espace personnel de prise de notes"
      />

      <div className="flex items-center gap-3 mt-6 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une note..."
            className="pl-9"
          />
        </div>
        <Button onClick={createNote} disabled={creating}>
          {creating ? (
            <Loader2 className="size-4 animate-spin mr-1.5" />
          ) : (
            <Plus className="size-4 mr-1.5" />
          )}
          Nouvelle note
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-foreground-muted">
          <FileText className="size-12 mb-3 opacity-40" />
          <p className="text-sm">
            {search ? "Aucune note trouvée" : "Aucune note pour le moment"}
          </p>
          {!search && (
            <Button variant="ghost" className="mt-4" onClick={createNote}>
              <Plus className="size-4 mr-1.5" />
              Créer une première note
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((note) => (
            <div
              key={note.id}
              onClick={() => router.push(`/notes/${note.id}`)}
              className={cn(
                "group relative bg-card border border-border rounded-xl p-4 cursor-pointer",
                "hover:border-blue-500/40 hover:shadow-md transition-all duration-200",
                note.pinned && "ring-1 ring-amber-400/30 border-amber-400/20"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground truncate flex-1">
                  {note.title || "Sans titre"}
                </h3>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => togglePin(e, note)}
                    className="p-1 rounded hover:bg-background-subtle text-foreground-muted hover:text-amber-500 transition-colors"
                    title={note.pinned ? "Désépingler" : "Épingler"}
                  >
                    {note.pinned ? (
                      <PinOff className="size-3.5" />
                    ) : (
                      <Pin className="size-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => deleteNote(e, note.id)}
                    className="p-1 rounded hover:bg-red-500/10 text-foreground-muted hover:text-red-500 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-foreground-muted leading-relaxed line-clamp-3 mb-3">
                {getPreview(note.content)}
              </p>
              <p className="text-[11px] text-foreground-muted/60">
                {formatDate(note.updatedAt)}
              </p>
              {note.pinned && (
                <Pin className="absolute top-2 right-2 size-3 text-amber-400 opacity-60 group-hover:opacity-0 transition-opacity" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
