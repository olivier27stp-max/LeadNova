"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2, Zap, Copy, RefreshCw, Trash2, History, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

interface KeywordResult {
  userIntent: string;
  primaryKeywords: string[];
  frenchKeywords: string[];
  englishKeywords: string[];
  expandedKeywords: string[];
  nicheExpansions: string[];
  relatedCategories: string[];
  negativeKeywords: string[];
  searchQueries: string[];
  notes: string;
}

interface SavedGeneration {
  id: string;
  prompt: string;
  language: string;
  depth: string;
  angle: string;
  insertedCount: number;
  createdAt: string;
}

interface KeywordGeneratorProps {
  onInsertKeywords: (keywords: string[], mode: "append" | "replace") => void;
  onInsertQueries: (queries: string[], mode: "append" | "replace") => void;
  existingKeywords: string[];
  existingQueries: string[];
}

type Language = "fr" | "en" | "bilingual";
type Depth = "simple" | "standard" | "deep";
type Angle = "local" | "commercial" | "technical" | "general";
type RecordingState = "idle" | "recording" | "processing" | "error";

// ─── Category display config ─────────────────────────────

const CATEGORIES = [
  { key: "primaryKeywords" as const, label: "Mots-clés principaux" },
  { key: "frenchKeywords" as const, label: "Mots-clés français" },
  { key: "englishKeywords" as const, label: "Mots-clés anglais" },
  { key: "expandedKeywords" as const, label: "Variantes étendues" },
  { key: "nicheExpansions" as const, label: "Sous-catégories / niches" },
  { key: "relatedCategories" as const, label: "Catégories connexes" },
  { key: "searchQueries" as const, label: "Requêtes de recherche" },
] as const;

// ─── Main Component ──────────────────────────────────────

export default function KeywordGenerator({ onInsertKeywords, onInsertQueries, existingKeywords, existingQueries }: KeywordGeneratorProps) {
  // Input state
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<Language>("bilingual");
  const [depth, setDepth] = useState<Depth>("standard");
  const [angle, setAngle] = useState<Angle>("commercial");
  const [maxKeywords, setMaxKeywords] = useState(50);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<KeywordResult | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Voice state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Saved generations
  const [savedGenerations, setSavedGenerations] = useState<SavedGeneration[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ─── Load saved generations ────────────────────────────

  const loadHistory = useCallback(() => {
    fetch("/api/keywords/generate")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { if (Array.isArray(d)) setSavedGenerations(d); })
      .catch(console.error);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ─── Generate keywords ─────────────────────────────────

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setSelected(new Set());

    try {
      const res = await fetch("/api/keywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), language, depth, angle, maxKeywords }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }

      setResult(data.result);
      setGenerationId(data.id);

      // Auto-select all keywords
      const allKw = new Set<string>();
      for (const cat of CATEGORIES) {
        const items = data.result[cat.key] as string[] || [];
        items.forEach((k: string) => allKw.add(k));
      }
      setSelected(allKw);

      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Voice recording ───────────────────────────────────

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (blob.size < 1000) {
          setVoiceError("Enregistrement trop court. Parlez plus longtemps.");
          setRecordingState("idle");
          return;
        }

        setRecordingState("processing");

        try {
          const form = new FormData();
          form.append("audio", blob);

          const res = await fetch("/api/keywords/transcribe", { method: "POST", body: form });
          const data = await res.json();

          if (!res.ok) {
            setVoiceError(data.error || "Erreur de transcription");
            setRecordingState("error");
            return;
          }

          if (data.text) {
            setPrompt((prev) => (prev ? prev + " " : "") + data.text);
          }
          setRecordingState("idle");
        } catch {
          setVoiceError("Erreur de connexion au serveur");
          setRecordingState("error");
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingState("recording");
    } catch {
      setVoiceError("Impossible d'accéder au microphone. Vérifiez les permissions de votre navigateur.");
      setRecordingState("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // ─── Selection helpers ─────────────────────────────────

  const toggleKeyword = (kw: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw); else next.add(kw);
      return next;
    });
  };

  const selectAll = () => {
    if (!result) return;
    const all = new Set<string>();
    for (const cat of CATEGORIES) {
      (result[cat.key] as string[] || []).forEach((k) => all.add(k));
    }
    setSelected(all);
  };

  const selectNone = () => setSelected(new Set());

  const selectCategory = (key: keyof KeywordResult) => {
    const items = result?.[key] as string[] || [];
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((k) => next.add(k));
      return next;
    });
  };

  // ─── Insert actions ────────────────────────────────────

  const getSelectedKeywords = () => {
    if (!result) return { keywords: [], queries: [] };
    const keywords: string[] = [];
    const queries: string[] = [];

    for (const cat of CATEGORIES) {
      const items = result[cat.key] as string[] || [];
      for (const item of items) {
        if (!selected.has(item)) continue;
        if (cat.key === "searchQueries") {
          queries.push(item);
        } else {
          keywords.push(item);
        }
      }
    }

    return {
      keywords: [...new Set(keywords)],
      queries: [...new Set(queries)],
    };
  };

  const handleInsert = async (mode: "append" | "replace") => {
    const { keywords, queries } = getSelectedKeywords();
    if (keywords.length > 0) onInsertKeywords(keywords, mode);
    if (queries.length > 0) onInsertQueries(queries, mode);

    // Update inserted count in DB
    if (generationId) {
      fetch(`/api/keywords/${generationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insertedCount: keywords.length + queries.length }),
      }).catch(console.error);
    }
  };

  // ─── Load a saved generation ───────────────────────────

  const loadGeneration = async (id: string) => {
    try {
      const res = await fetch(`/api/keywords/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setPrompt(data.prompt);
      setLanguage(data.language);
      setDepth(data.depth);
      setAngle(data.angle);
      setMaxKeywords(data.maxKeywords);
      setResult(data.result as KeywordResult);
      setGenerationId(data.id);
      setShowHistory(false);

      // Auto-select all
      const allKw = new Set<string>();
      for (const cat of CATEGORIES) {
        ((data.result as KeywordResult)[cat.key] as string[] || []).forEach((k: string) => allKw.add(k));
      }
      setSelected(allKw);
    } catch (err) {
      console.error("Failed to load generation:", err);
    }
  };

  const deleteGeneration = async (id: string) => {
    await fetch(`/api/keywords/${id}`, { method: "DELETE" }).catch(console.error);
    loadHistory();
  };

  // ─── Copy all to clipboard ─────────────────────────────

  const copyAll = () => {
    const { keywords, queries } = getSelectedKeywords();
    const text = [...keywords, ...queries].join("\n");
    navigator.clipboard.writeText(text);
  };

  // ─── Count helpers ─────────────────────────────────────

  const totalGenerated = result
    ? CATEGORIES.reduce((sum, cat) => sum + ((result[cat.key] as string[])?.length || 0), 0)
    : 0;

  const selectedCount = selected.size;

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Zap className="size-4 text-warning" />
            Expansion de mots-clés avec ChatGPT
          </h3>
          <p className="text-xs text-foreground-muted mt-0.5">
            Décrivez votre secteur en quelques mots et ChatGPT générera une liste complète de mots-clés bilingues.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="size-3.5" />
            Historique ({savedGenerations.length})
          </Button>
          <Button
            variant={showSettings ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="size-3.5" />
            Paramètres
          </Button>
        </div>
      </div>

      {/* Saved generations history */}
      {showHistory && savedGenerations.length > 0 && (
        <div className="bg-background-subtle rounded-lg p-3 max-h-48 overflow-y-auto">
          <p className="text-xs font-medium text-foreground-muted mb-2">Générations précédentes</p>
          <div className="space-y-1.5">
            {savedGenerations.map((gen) => (
              <div key={gen.id} className="flex items-center justify-between bg-card rounded-lg px-3 py-2 text-sm border border-border">
                <button onClick={() => loadGeneration(gen.id)} className="flex-1 text-left hover:text-primary transition-colors">
                  <span className="font-medium">{gen.prompt}</span>
                  <span className="text-xs text-foreground-muted ml-2">
                    {gen.language} / {gen.depth} / {gen.angle}
                    {gen.insertedCount > 0 && ` — ${gen.insertedCount} insérés`}
                  </span>
                </button>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-foreground-muted">{new Date(gen.createdAt).toLocaleDateString("fr-CA")}</span>
                  <button onClick={() => deleteGeneration(gen.id)} className="text-danger hover:text-danger/80">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced settings */}
      {showSettings && (
        <div className="bg-background-subtle rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">Langue</label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="bilingual">Bilingue (FR + EN)</option>
                <option value="fr">Français seulement</option>
                <option value="en">Anglais seulement</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">Profondeur</label>
              <Select value={depth} onChange={(e) => setDepth(e.target.value as Depth)}>
                <option value="simple">Simple (10-15)</option>
                <option value="standard">Standard (25-40)</option>
                <option value="deep">Approfondi (50+)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">Angle</label>
              <Select value={angle} onChange={(e) => setAngle(e.target.value as Angle)}>
                <option value="commercial">Commercial / B2B</option>
                <option value="local">Local / quartier</option>
                <option value="technical">Technique / spécialisé</option>
                <option value="general">Grand public</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">Max mots-clés</label>
              <Input
                type="number"
                value={maxKeywords}
                onChange={(e) => setMaxKeywords(Math.max(10, Math.min(200, Number(e.target.value))))}
                min={10}
                max={200}
              />
            </div>
          </div>
        </div>
      )}

      {/* Input block */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="Décrivez votre secteur... Ex: compagnies de paysagement, entrepreneurs en toiture, cliniques dentaires..."
            rows={2}
            className="w-full border border-border rounded-md px-3 py-2.5 text-sm bg-input text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none pr-12"
          />
          {/* Voice button overlaid */}
          <button
            onClick={recordingState === "recording" ? stopRecording : startRecording}
            disabled={recordingState === "processing" || generating}
            className={cn(
              "absolute right-2 top-2 p-2 rounded-md transition-all",
              recordingState === "recording"
                ? "bg-danger text-white animate-pulse"
                : recordingState === "processing"
                ? "bg-warning text-white"
                : "bg-background-muted text-foreground-muted hover:bg-background-muted/80 hover:text-foreground-secondary"
            )}
            title={recordingState === "recording" ? "Arrêter l'enregistrement" : "Parler"}
          >
            {recordingState === "recording" ? (
              <Square className="size-4" />
            ) : recordingState === "processing" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mic className="size-4" />
            )}
          </button>
        </div>
        <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} variant="success">
          {generating ? (
            <><Loader2 className="size-4 animate-spin" /> Génération...</>
          ) : (
            <><Zap className="size-4" /> Générer</>
          )}
        </Button>
      </div>

      {/* Voice error */}
      {voiceError && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle border border-danger/20 rounded-md px-3 py-2">
          <span>{voiceError}</span>
          <button onClick={() => { setVoiceError(null); setRecordingState("idle"); }} className="ml-auto text-danger hover:text-danger/80">&times;</button>
        </div>
      )}

      {/* Recording indicator */}
      {recordingState === "recording" && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle border border-danger/20 rounded-md px-3 py-2">
          <span className="w-2 h-2 bg-danger rounded-full animate-pulse" />
          Enregistrement en cours... Cliquez sur le bouton pour arrêter.
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="text-sm text-danger bg-danger-subtle border border-danger/20 rounded-md px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="danger-ghost" size="sm" onClick={handleGenerate}>
            Réessayer
          </Button>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Intent + stats bar */}
          <div className="flex items-center justify-between bg-success-subtle border border-success/20 rounded-md px-4 py-2">
            <div>
              <p className="text-sm font-medium text-success">{result.userIntent}</p>
              <p className="text-xs text-success/80">
                {totalGenerated} mots-clés générés — {selectedCount} sélectionnés
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-success hover:underline">Tout</button>
              <span className="text-success/30">|</span>
              <button onClick={selectNone} className="text-xs text-success hover:underline">Aucun</button>
            </div>
          </div>

          {/* Keyword categories */}
          {CATEGORIES.map((cat) => {
            const items = result[cat.key] as string[] || [];
            if (items.length === 0) return null;

            const catSelectedCount = items.filter((k) => selected.has(k)).length;

            return (
              <div key={cat.key} className="border border-border rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 bg-background-subtle rounded-t-lg">
                  <span className="text-xs font-medium text-foreground-secondary">
                    {cat.label} ({items.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground-muted">{catSelectedCount}/{items.length}</span>
                    <button
                      onClick={() => selectCategory(cat.key)}
                      className="text-xs text-primary hover:text-primary-hover"
                    >
                      +tout
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 p-3">
                  {items.map((kw, i) => {
                    const isSelected = selected.has(kw);
                    const isDuplicate = cat.key === "searchQueries"
                      ? existingQueries.includes(kw)
                      : existingKeywords.includes(kw);

                    return (
                      <button
                        key={i}
                        onClick={() => toggleKeyword(kw)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-all border",
                          isDuplicate
                            ? "bg-background-muted text-foreground-muted border-border line-through"
                            : isSelected
                            ? "bg-primary-subtle text-primary border-primary/20"
                            : "bg-card text-foreground-muted border-border"
                        )}
                        title={isDuplicate ? "Déjà présent dans le ciblage" : isSelected ? "Cliquez pour désélectionner" : "Cliquez pour sélectionner"}
                      >
                        {isSelected && !isDuplicate && <span className="text-success">&#10003;</span>}
                        {isDuplicate && <span className="text-foreground-muted">&#8212;</span>}
                        {kw}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Notes */}
          {result.notes && (
            <div className="text-xs text-foreground-muted bg-background-subtle rounded-lg px-3 py-2 italic">
              {result.notes}
            </div>
          )}

          {/* Negative keywords */}
          {result.negativeKeywords.length > 0 && (
            <div className="text-xs text-foreground-muted">
              <span className="font-medium">Mots-clés négatifs (à exclure) :</span>{" "}
              {result.negativeKeywords.join(", ")}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button
              onClick={() => handleInsert("append")}
              disabled={selectedCount === 0}
              variant="success"
            >
              Ajouter au ciblage ({selectedCount})
            </Button>
            <Button
              onClick={() => handleInsert("replace")}
              disabled={selectedCount === 0}
            >
              Remplacer le ciblage
            </Button>
            <Button
              variant="secondary"
              onClick={copyAll}
              disabled={selectedCount === 0}
            >
              <Copy className="size-3.5" />
              Copier ({selectedCount})
            </Button>
            <Button
              variant="secondary"
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
            >
              <RefreshCw className="size-3.5" />
              Régénérer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
