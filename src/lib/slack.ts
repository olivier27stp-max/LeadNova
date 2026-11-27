// Slack (webhook entrant) : validation de l'URL (anti-SSRF), masquage, message Block Kit en français
// et envoi avec délai (5 s) et 3 essais. Module pur : testé dans tests/slack.test.ts.
// L'URL du webhook est un secret : ne jamais la journaliser ni la renvoyer telle quelle au navigateur.

import { REPLY_CATEGORY_LABELS, type ReplyCategory } from "@/lib/reply-text";

export const SLACK_TIMEOUT_MS = 5000;
export const SLACK_MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 30_000;

// ─── URL du webhook ──────────────────────────────────────

/** Accepte seulement https://hooks.slack.com/services/… (ou /triggers/…), sans port, identifiants ni fragment. */
export function validateSlackWebhookUrl(input: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "URL du webhook manquante" };
  const raw = input.trim();
  if (raw.length > 500) return { ok: false, error: "URL du webhook trop longue" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "URL du webhook invalide" };
  }
  const invalid = { ok: false as const, error: "L'URL doit commencer par https://hooks.slack.com/services/" };
  if (u.protocol !== "https:" || u.hostname !== "hooks.slack.com") return invalid;
  if (u.port || u.username || u.password || u.hash) return invalid;
  if (!/^\/(services|triggers)\/[A-Za-z0-9/_-]+$/.test(u.pathname) || u.search) return invalid;
  return { ok: true, url: `https://hooks.slack.com${u.pathname}` };
}

/** « https://hooks.slack.com/services/••••••••3f9a » : seuls les 4 derniers caractères restent visibles. */
export function maskWebhookUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return `https://hooks.slack.com/services/••••••••${url.slice(-4)}`;
}

/** Retire toute URL de webhook d'un message d'erreur avant de le journaliser ou de l'afficher. */
export function redactWebhook(message: string): string {
  return message.replace(/https?:\/\/hooks\.slack\.com\/\S*/gi, "[webhook Slack]").slice(0, 300);
}

// ─── Message ─────────────────────────────────────────────

export type SlackEvent = "positive_reply" | "manual_positive" | "reply" | "unsubscribe";

export interface SlackMessageInput {
  event: SlackEvent;
  prospectName?: string | null;
  companyName: string;
  email?: string | null;
  campaignName?: string | null;
  mailbox?: string | null;
  /** Déjà nettoyé ; absent si « Inclure un extrait » est décoché */
  excerpt?: string | null;
  category?: ReplyCategory | null;
  confidence?: number | null;
  link: string;
}

const HEADERS: Record<SlackEvent, string> = {
  positive_reply: "🟢 Réponse positive",
  manual_positive: "🟢 Réponse positive (ajout manuel au Pipeline)",
  reply: "💬 Nouvelle réponse",
  unsubscribe: "🔕 Désabonnement",
};

/** Échappe les caractères spéciaux du mrkdwn Slack (&, <, >). */
export function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function field(label: string, value: string | null | undefined) {
  return { type: "mrkdwn", text: `*${label}*\n${value ? escapeSlack(value) : "—"}` };
}

export function buildSlackMessage(m: SlackMessageInput) {
  const title = HEADERS[m.event];
  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    {
      type: "section",
      fields: [
        field("Prospect", m.prospectName),
        field("Compagnie", m.companyName),
        field("Courriel", m.email),
        field("Campagne", m.campaignName),
        field("Boîte d'envoi", m.mailbox),
      ],
    },
  ];
  if (m.excerpt) {
    const quoted = escapeSlack(m.excerpt.slice(0, 300)).replace(/\n/g, "\n>");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Extrait de la réponse*\n>${quoted}` } });
  }
  const context: string[] = [];
  if (m.category) context.push(`Catégorie : ${REPLY_CATEGORY_LABELS[m.category]}`);
  if (typeof m.confidence === "number") context.push(`Confiance : ${Math.round(m.confidence * 100)} %`);
  if (m.event === "manual_positive") context.push("Déplacé manuellement dans « Réponse positive »");
  if (context.length) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: context.join(" · ") }] });
  blocks.push({
    type: "actions",
    elements: [
      { type: "button", text: { type: "plain_text", text: "Ouvrir dans LeadNova" }, url: m.link, style: "primary" },
    ],
  });
  return { text: `${title} — ${m.companyName}`, blocks };
}

export function buildSlackTestMessage(link: string) {
  return {
    text: "✅ Test LeadNova : la connexion Slack fonctionne",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "✅ *Test LeadNova* : les notifications de réponses arriveront dans ce canal." } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Ouvrir dans LeadNova" }, url: link }] },
    ],
  };
}

// ─── Envoi ───────────────────────────────────────────────

export interface SendDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export type SendResult = { ok: true; attempts: number } | { ok: false; attempts: number; status?: number; error: string };

/** Délai avant le prochain essai : Retry-After (secondes ou date HTTP, plafonné à 30 s), sinon 1 s, 2 s, 4 s… */
export function retryDelayMs(attempt: number, retryAfter: string | null, baseDelayMs = 1000, now = Date.now()): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS);
  }
  return baseDelayMs * 2 ** (attempt - 1);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * POST JSON vers le webhook. Réessaie sur 429, 5xx, délai dépassé et erreur réseau ; pas sur les autres 4xx.
 * Les redirections sont refusées (anti-SSRF). L'erreur retournée ne contient jamais l'URL.
 */
export async function postToSlack(webhookUrl: string, body: unknown, deps: SendDeps = {}): Promise<SendResult> {
  const valid = validateSlackWebhookUrl(webhookUrl);
  if (!valid.ok) return { ok: false, attempts: 0, error: valid.error };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxAttempts = deps.maxAttempts ?? SLACK_MAX_ATTEMPTS;
  const timeoutMs = deps.timeoutMs ?? SLACK_TIMEOUT_MS;

  let last: SendResult = { ok: false, attempts: 0, error: "Aucun essai" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryAfter: string | null = null;
    let retryable = true;
    try {
      const res = await fetchImpl(valid.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { ok: true, attempts: attempt };
      const text = (await res.text().catch(() => "")).slice(0, 100);
      retryable = res.status === 429 || res.status >= 500;
      retryAfter = res.headers.get("retry-after");
      last = { ok: false, attempts: attempt, status: res.status, error: redactWebhook(`Slack HTTP ${res.status}${text ? ` (${text})` : ""}`) };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const msg = name === "TimeoutError" || name === "AbortError" ? `Délai de ${timeoutMs / 1000} s dépassé` : err instanceof Error ? err.message : "Erreur réseau";
      last = { ok: false, attempts: attempt, error: redactWebhook(msg) };
    }
    if (!retryable || attempt === maxAttempts) return last;
    await sleep(retryDelayMs(attempt, retryAfter, deps.baseDelayMs ?? 1000));
  }
  return last;
}
