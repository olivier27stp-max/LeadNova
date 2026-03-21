"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Undo2,
  Redo2,
  Check,
  Loader2,
  Pin,
  PinOff,
  Trash2,
  Code,
  Highlighter,
  Link2,
  Type,
} from "lucide-react";

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

type ToolbarAction = {
  icon: React.ElementType;
  command: string;
  arg?: string;
  label: string;
  type?: "separator";
};

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    { icon: Undo2, command: "undo", label: "Annuler" },
    { icon: Redo2, command: "redo", label: "Rétablir" },
  ],
  [
    { icon: Type, command: "formatBlock", arg: "p", label: "Paragraphe" },
    { icon: Heading1, command: "formatBlock", arg: "h1", label: "Titre 1" },
    { icon: Heading2, command: "formatBlock", arg: "h2", label: "Titre 2" },
    { icon: Heading3, command: "formatBlock", arg: "h3", label: "Titre 3" },
  ],
  [
    { icon: Bold, command: "bold", label: "Gras" },
    { icon: Italic, command: "italic", label: "Italique" },
    { icon: Underline, command: "underline", label: "Souligné" },
    { icon: Strikethrough, command: "strikeThrough", label: "Barré" },
    { icon: Code, command: "formatBlock", arg: "pre", label: "Code" },
    { icon: Highlighter, command: "hiliteColor", arg: "#fef08a", label: "Surligner" },
  ],
  [
    { icon: List, command: "insertUnorderedList", label: "Liste à puces" },
    { icon: ListOrdered, command: "insertOrderedList", label: "Liste numérotée" },
    { icon: Quote, command: "formatBlock", arg: "blockquote", label: "Citation" },
    { icon: Minus, command: "insertHorizontalRule", label: "Séparateur" },
  ],
  [
    { icon: AlignLeft, command: "justifyLeft", label: "Aligner à gauche" },
    { icon: AlignCenter, command: "justifyCenter", label: "Centrer" },
    { icon: AlignRight, command: "justifyRight", label: "Aligner à droite" },
  ],
];

export default function NoteEditorPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Track latest content for save
  const contentRef = useRef("");
  const titleValRef = useRef("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (res.status === 403 || res.status === 404) {
          router.push("/notes");
          return;
        }
        const data = await res.json();
        if (data.note) {
          setNote(data.note);
          setTitle(data.note.title);
          titleValRef.current = data.note.title;
          contentRef.current = data.note.content;
          if (editorRef.current) {
            editorRef.current.innerHTML = data.note.content;
          }
        }
      } catch {
        router.push("/notes");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  // Set editor content after mount
  useEffect(() => {
    if (!loading && editorRef.current && note) {
      editorRef.current.innerHTML = note.content;
    }
  }, [loading, note]);

  const saveNote = useCallback(async () => {
    if (!note) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleValRef.current,
          content: contentRef.current,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [note]);

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveNote, 1000);
  }

  function handleContentChange() {
    if (editorRef.current) {
      contentRef.current = editorRef.current.innerHTML;
      scheduleSave();
    }
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    titleValRef.current = val;
    scheduleSave();
  }

  function execCommand(command: string, arg?: string) {
    editorRef.current?.focus();
    if (command === "formatBlock" && arg) {
      document.execCommand(command, false, `<${arg}>`);
    } else {
      document.execCommand(command, false, arg);
    }
    handleContentChange();
  }

  function insertLink() {
    const url = prompt("URL du lien :");
    if (url) {
      editorRef.current?.focus();
      document.execCommand("createLink", false, url);
      handleContentChange();
    }
  }

  async function togglePin() {
    if (!note) return;
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      const data = await res.json();
      if (data.note) setNote(data.note);
    } catch {
      // ignore
    }
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirm("Supprimer cette note ?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
      router.push("/notes");
    } catch {
      setDeleting(false);
    }
  }

  // Save on Cmd+S / Ctrl+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveNote();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNote]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-foreground-muted" />
      </div>
    );
  }

  if (!note) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveNote();
              }
              router.push("/notes");
            }}
            className="p-1.5 rounded-md hover:bg-background-subtle text-foreground-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
          </button>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Sans titre"
            className="text-lg font-semibold bg-transparent border-none outline-none text-foreground placeholder:text-foreground-muted/40 w-64 sm:w-96"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {/* Save status */}
          <span className="text-xs text-foreground-muted mr-2">
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Enregistrement...
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <Check className="size-3" />
                Enregistré
              </span>
            ) : null}
          </span>
          <button
            onClick={togglePin}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              note.pinned
                ? "text-amber-500 hover:bg-amber-500/10"
                : "text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            )}
            title={note.pinned ? "Désépingler" : "Épingler"}
          >
            {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-md text-foreground-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border bg-card/40 flex-wrap">
        {TOOLBAR_GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && (
              <div className="w-px h-5 bg-border mx-1.5" />
            )}
            {group.map((action) => (
              <button
                key={action.command + (action.arg || "")}
                onClick={() => execCommand(action.command, action.arg)}
                className="p-1.5 rounded hover:bg-background-subtle text-foreground-muted hover:text-foreground transition-colors"
                title={action.label}
              >
                <action.icon className="size-3.5" />
              </button>
            ))}
          </div>
        ))}
        <div className="w-px h-5 bg-border mx-1.5" />
        <button
          onClick={insertLink}
          className="p-1.5 rounded hover:bg-background-subtle text-foreground-muted hover:text-foreground transition-colors"
          title="Insérer un lien"
        >
          <Link2 className="size-3.5" />
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleContentChange}
            className={cn(
              "min-h-[60vh] outline-none text-foreground text-[15px] leading-relaxed",
              "prose prose-neutral dark:prose-invert max-w-none",
              "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6",
              "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5",
              "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4",
              "[&_p]:mb-2",
              "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3",
              "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3",
              "[&_li]:mb-1",
              "[&_blockquote]:border-l-4 [&_blockquote]:border-blue-400/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-foreground-muted [&_blockquote]:my-4",
              "[&_pre]:bg-background-muted [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:text-sm [&_pre]:font-mono [&_pre]:my-4 [&_pre]:overflow-x-auto",
              "[&_hr]:border-border [&_hr]:my-6",
              "[&_a]:text-blue-500 [&_a]:underline",
              "empty:before:content-['Commencez_à_écrire...'] empty:before:text-foreground-muted/40"
            )}
            data-placeholder="Commencez à écrire..."
          />
        </div>
      </div>
    </div>
  );
}
