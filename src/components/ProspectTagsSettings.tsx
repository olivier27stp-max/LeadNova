"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TAG_COLORS, TAG_COLOR_CLASSES, TAG_COLOR_LABELS, newTagId, parseProspectTags, type ProspectTag, type TagColor } from "@/lib/prospect-tags";

/** Paramètres → Prospects : créer, renommer, colorer et supprimer les tags du compte. */
export default function ProspectTagsSettings() {
  const [tags, setTags] = useState<ProspectTag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("blue");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTags(parseProspectTags(data?.prospectTags)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function addTag() {
    const name = newName.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setMessage("Ce tag existe déjà.");
      return;
    }
    setTags([...tags, { id: newTagId(), name, color: newColor }]);
    setNewName("");
    setDirty(true);
    setMessage(null);
  }

  function update(id: string, patch: Partial<ProspectTag>) {
    setTags(tags.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setDirty(true);
  }

  function remove(tag: ProspectTag) {
    if (!confirm(`Supprimer le tag « ${tag.name} » ? Il disparaîtra de toutes les fiches.`)) return;
    setTags(tags.filter((t) => t.id !== tag.id));
    setDirty(true);
  }

  async function save() {
    if (tags.some((t) => !t.name.trim())) {
      setMessage("Un tag n'a pas de nom.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectTags: tags.map((t) => ({ ...t, name: t.name.trim() })) }),
      });
      if (!res.ok) throw new Error();
      setDirty(false);
      setMessage("Tags enregistrés.");
    } catch {
      setMessage("Impossible d'enregistrer les tags.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Tags</CardTitle>
            <p className="text-sm text-foreground-muted mt-1">
              Crée tes propres étiquettes (ex. « À rappeler », « Chaud », « Partenaire »), puis ajoute-les aux fiches en les modifiant dans Prospects. Tu peux ensuite filtrer la liste par tag.
            </p>
          </div>
          <Button onClick={save} disabled={!dirty || saving} size="sm">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loaded ? (
          <p className="text-sm text-foreground-muted">Chargement…</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-foreground-muted">Aucun tag pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2">
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0 min-w-16 text-center", TAG_COLOR_CLASSES[tag.color])}>
                  {tag.name || "—"}
                </span>
                <Input value={tag.name} maxLength={40} onChange={(e) => update(tag.id, { name: e.target.value })} className="flex-1" />
                <select
                  value={tag.color}
                  onChange={(e) => update(tag.id, { color: e.target.value as TagColor })}
                  className="border border-border rounded-md px-2 py-2 text-sm bg-background text-foreground"
                  aria-label="Couleur"
                >
                  {TAG_COLORS.map((c) => <option key={c} value={c}>{TAG_COLOR_LABELS[c]}</option>)}
                </select>
                <button onClick={() => remove(tag)} className="text-sm text-danger px-2 py-1.5 rounded hover:bg-danger/10" title="Supprimer">
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input
            placeholder="Nouveau tag"
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            className="flex-1"
          />
          <select
            value={newColor}
            onChange={(e) => setNewColor(e.target.value as TagColor)}
            className="border border-border rounded-md px-2 py-2 text-sm bg-background text-foreground"
            aria-label="Couleur du nouveau tag"
          >
            {TAG_COLORS.map((c) => <option key={c} value={c}>{TAG_COLOR_LABELS[c]}</option>)}
          </select>
          <Button onClick={addTag} disabled={!newName.trim()} size="sm" variant="secondary">
            Ajouter
          </Button>
        </div>
        {dirty && <p className="text-xs text-warning">Modifications non enregistrées : clique « Enregistrer ».</p>}
        {message && <p className="text-xs text-foreground-secondary">{message}</p>}
      </CardContent>
    </Card>
  );
}
