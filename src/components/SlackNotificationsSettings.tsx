"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Ce que renvoie /api/settings/slack (jamais l'URL complète du webhook) */
interface SlackView {
  enabled: boolean;
  configured: boolean;
  webhookUrlMasked: string | null;
  encryptionReady: boolean;
  threshold: number;
  events: { positive: boolean; allReplies: boolean; unsubscribes: boolean };
  includeExcerpt: boolean;
  consecutiveFailures: number;
  alert: { message: string; at: string } | null;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm text-foreground-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-background-muted")}
      >
        <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </label>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-foreground-secondary cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

/** Paramètres → Automatisation → Notifications internes → Slack (admins de l'espace de travail seulement). */
export default function SlackNotificationsSettings() {
  const [view, setView] = useState<SlackView | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [draft, setDraft] = useState<Pick<SlackView, "enabled" | "threshold" | "events" | "includeExcerpt"> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  function apply(v: SlackView) {
    setView(v);
    setDraft({ enabled: v.enabled, threshold: v.threshold, events: v.events, includeExcerpt: v.includeExcerpt });
    setDirty(false);
  }

  useEffect(() => {
    fetch("/api/settings/slack")
      .then(async (r) => {
        if (r.status === 403) setForbidden(true);
        else if (r.ok) apply(await r.json());
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function update(patch: Partial<NonNullable<typeof draft>>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setDirty(true);
    setMessage(null);
  }

  async function save(extra: Record<string, unknown> = {}) {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/slack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, ...(newUrl.trim() ? { webhookUrl: newUrl.trim() } : {}), ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible d'enregistrer");
      apply(data);
      setNewUrl("");
      setMessage({ text: "Paramètres Slack enregistrés." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Impossible d'enregistrer", error: true });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUrl.trim() ? { webhookUrl: newUrl.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec du test");
      setMessage({ text: "Message de test envoyé : vérifiez le canal Slack." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Échec du test", error: true });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Notifications internes — Slack</CardTitle>
            <p className="text-sm text-foreground-muted mt-1">
              Recevez un message dans un canal Slack quand un prospect répond positivement à une campagne.
            </p>
          </div>
          {draft && (
            <Button onClick={() => save()} disabled={(!dirty && !newUrl.trim()) || saving} size="sm">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loaded ? (
          <p className="text-sm text-foreground-muted">Chargement…</p>
        ) : forbidden ? (
          <p className="text-sm text-foreground-muted">Réservé aux administrateurs de l&apos;espace de travail.</p>
        ) : !view || !draft ? (
          <p className="text-sm text-danger">Impossible de charger les paramètres Slack.</p>
        ) : (
          <>
            {view.alert && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                <p className="font-medium">Alertes d&apos;erreur</p>
                <p className="mt-1">{view.alert.message}</p>
                <p className="mt-1 text-xs opacity-80">{new Date(view.alert.at).toLocaleString("fr-CA")}</p>
              </div>
            )}

            <Switch checked={draft.enabled} onChange={(v) => update({ enabled: v })} label="Envoyer les notifications Slack" />

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1">URL du webhook Slack entrant</label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={view.webhookUrlMasked ?? "https://hooks.slack.com/services/…"}
                value={newUrl}
                onChange={(e) => { setNewUrl(e.target.value); setMessage(null); }}
              />
              <p className="text-xs text-muted mt-1">
                {view.configured
                  ? `Enregistrée (chiffrée) : ${view.webhookUrlMasked}. Collez une nouvelle URL pour la remplacer.`
                  : "Slack → Apps → Incoming Webhooks → « Add New Webhook to Workspace ». Seules les URL https://hooks.slack.com/ sont acceptées."}
              </p>
              {!view.encryptionReady && (
                <p className="text-xs text-warning mt-1">Le chiffrement n&apos;est pas configuré sur le serveur (ENCRYPTION_KEY) : l&apos;URL ne peut pas être enregistrée.</p>
              )}
              {view.configured && (
                <button type="button" onClick={() => save({ webhookUrl: "", enabled: false })} className="text-xs text-danger mt-1 hover:underline">
                  Retirer l&apos;URL
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1">Seuil de confiance (réponses positives)</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.05}
                  value={draft.threshold}
                  onChange={(e) => update({ threshold: Number(e.target.value) })}
                  className="flex-1 accent-[var(--color-primary)]"
                />
                <span className="text-sm tabular-nums w-12 text-right">{draft.threshold.toFixed(2).replace(".", ",")}</span>
              </div>
              <p className="text-xs text-muted mt-1">Une réponse classée positive sous ce seuil n&apos;est pas notifiée comme positive.</p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground-secondary mb-1">Événements</p>
              <Check checked={draft.events.positive} onChange={(v) => update({ events: { ...draft.events, positive: v } })} label="Réponse positive" />
              <Check checked={draft.events.allReplies} onChange={(v) => update({ events: { ...draft.events, allReplies: v } })} label="Toutes les réponses" />
              <Check checked={draft.events.unsubscribes} onChange={(v) => update({ events: { ...draft.events, unsubscribes: v } })} label="Désabonnements" />
            </div>

            <div className="border-t border-border pt-3">
              <Check checked={draft.includeExcerpt} onChange={(v) => update({ includeExcerpt: v })} label="Inclure un extrait de la réponse" />
              <p className="text-xs text-muted mt-1">
                Décoché : Slack ne reçoit que le nom, la compagnie, le courriel, la campagne et la boîte d&apos;envoi, jamais le contenu de la réponse.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={sendTest} disabled={testing || (!view.configured && !newUrl.trim())}>
                {testing ? "Envoi…" : "Envoyer un test"}
              </Button>
              {dirty && <span className="text-xs text-warning">Modifications non enregistrées.</span>}
            </div>
          </>
        )}
        {message && <p className={cn("text-sm", message.error ? "text-danger" : "text-success")}>{message.text}</p>}
      </CardContent>
    </Card>
  );
}
