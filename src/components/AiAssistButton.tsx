"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, Mic, Square, X, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

interface AiAssistResult {
  add: string[];
  remove: string[];
  explanation: string;
}

type RecordingState = "idle" | "recording" | "processing";

interface AiAssistButtonProps {
  type: "keywords" | "cities" | "queries";
  currentItems: string[];
  onApply: (result: { add: string[]; remove: string[] }) => void;
  color: string;
}

// ─── Component ───────────────────────────────────────────

export default function AiAssistButton({ type, currentItems, onApply }: AiAssistButtonProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Voice (Web Speech API)
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const placeholder = {
    keywords: "Ex: ajoute des mots-clés pour les entreprises de toiture, enlève tout ce qui concerne le paysagement...",
    cities: "Ex: ajoute les villes de l'Estrie, retire Montréal et Laval, remplace par les villes du Saguenay...",
    queries: "Ex: génère des requêtes pour trouver des plombiers, enlève les requêtes en anglais...",
  }[type];

  const label = {
    keywords: "mots-clés",
    cities: "villes",
    queries: "requêtes",
  }[type];

  // ─── Generate ────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/keywords/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), type, currentItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }, [prompt, type, currentItems]);

  // ─── Voice (Web Speech API - free, no API key) ───────────

  const startRecording = () => {
    setVoiceError(null);

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setVoiceError("Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez Chrome ou Edge.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "fr-CA";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) {
        setPrompt((prev) => (prev ? prev + " " : "") + transcript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setVoiceError("Microphone bloqué. Autorisez l'accès dans votre navigateur.");
      } else if (event.error !== "aborted") {
        setVoiceError(`Erreur: ${event.error}`);
      }
      setRecordingState("idle");
    };

    recognition.onend = () => {
      setRecordingState("idle");
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setRecordingState("recording");
    } catch {
      setVoiceError("Impossible de démarrer la reconnaissance vocale");
      setRecordingState("idle");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  // ─── Apply result ────────────────────────────────────────

  const handleApply = () => {
    if (!result) return;
    onApply({ add: result.add, remove: result.remove });
    setResult(null);
    setPrompt("");
    setOpen(false);
  };

  // ─── Close / reset ──────────────────────────────────────

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setPrompt("");
  };

  // ─── Render ──────────────────────────────────────────────

  return (
    <>
      {/* AI Button */}
      <Button
        variant={open ? "secondary" : "primary"}
        size="sm"
        onClick={() => setOpen(!open)}
        title={`Assistant AI pour les ${label}`}
        className={open ? "border-primary/30 bg-primary-subtle text-primary" : ""}
      >
        <Sparkles className="size-3.5" />
        AI
      </Button>

      {/* Expanded panel */}
      {open && (
        <div className="col-span-full mt-2 p-3 border border-primary/20 bg-primary-subtle rounded-lg space-y-3">
          {/* Input row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={placeholder}
                disabled={loading}
                className="pr-10"
              />
              {/* Mic button */}
              <button
                onClick={recordingState === "recording" ? stopRecording : startRecording}
                disabled={recordingState === "processing" || loading}
                className={cn(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all",
                  recordingState === "recording"
                    ? "bg-danger text-white animate-pulse"
                    : recordingState === "processing"
                    ? "bg-warning text-white"
                    : "text-foreground-muted hover:text-foreground hover:bg-background-subtle"
                )}
                title={recordingState === "recording" ? "Arrêter" : "Dicter"}
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
            <Button onClick={handleGenerate} disabled={loading || !prompt.trim()}>
              {loading ? <><Loader2 className="size-4 animate-spin" /> ...</> : "Envoyer"}
            </Button>
            <button onClick={handleClose} className="text-foreground-muted hover:text-foreground px-2">
              <X className="size-4" />
            </button>
          </div>

          {/* Voice error */}
          {voiceError && (
            <p className="text-xs text-danger">{voiceError}</p>
          )}

          {/* Recording indicator */}
          {recordingState === "recording" && (
            <div className="flex items-center gap-2 text-xs text-danger">
              <span className="w-2 h-2 bg-danger rounded-full animate-pulse" />
              Enregistrement... Cliquez pour arrêter.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-danger bg-danger-subtle border border-danger/20 rounded-md px-3 py-2 flex items-center justify-between">
              <span>{error}</span>
              <Button variant="danger-ghost" size="sm" onClick={handleGenerate}>
                Réessayer
              </Button>
            </div>
          )}

          {/* Result preview */}
          {result && (
            <div className="space-y-2">
              {/* Explanation */}
              {result.explanation && (
                <p className="text-xs text-foreground-muted italic">{result.explanation}</p>
              )}

              {/* Items to add */}
              {result.add.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-success mb-1">
                    + {result.add.length} {label} à ajouter
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.add.map((item, i) => {
                      const alreadyExists = currentItems.includes(item);
                      return (
                        <span
                          key={i}
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs border",
                            alreadyExists
                              ? "bg-background-muted text-foreground-muted border-border line-through"
                              : "bg-success-subtle text-success border-success/20"
                          )}
                        >
                          {alreadyExists ? "déjà" : "+"} {item}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items to remove */}
              {result.remove.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-danger mb-1">
                    - {result.remove.length} {label} à retirer
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.remove.map((item, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs border bg-danger-subtle text-danger border-danger/20"
                      >
                        &times; {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button variant="success" size="sm" onClick={handleApply}>
                  Appliquer
                  {result.add.length > 0 && result.remove.length > 0
                    ? ` (+${result.add.length} / -${result.remove.length})`
                    : result.add.length > 0
                    ? ` (+${result.add.length})`
                    : ` (-${result.remove.length})`}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading}>
                  <RefreshCw className="size-3.5" />
                  Régénérer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
