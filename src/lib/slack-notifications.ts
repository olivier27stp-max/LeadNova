// Notifications Slack des réponses : paramètres par espace de travail (app_settings.data.slack),
// file d'envoi idempotente (table slack_notifications) traitée par le cron chaque minute.
// Rien ici ne doit faire échouer la synchronisation des courriels : les fonctions appelées
// pendant la sync attrapent leurs erreurs.

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { decrypt, encrypt, hasEncryptionKey, isEncrypted } from "@/lib/crypto";
import { replyExcerpt, type ReplyCategory, type ReplyClassification, isReplyCategory } from "@/lib/reply-text";
import {
  buildSlackMessage,
  buildSlackTestMessage,
  maskWebhookUrl,
  postToSlack,
  redactWebhook,
  validateSlackWebhookUrl,
  type SendDeps,
  type SlackEvent,
} from "@/lib/slack";

export const MAX_CONSECUTIVE_FAILURES = 5;
export const DEFAULT_THRESHOLD = 0.7;

export interface SlackEvents {
  positive: boolean;
  allReplies: boolean;
  unsubscribes: boolean;
}

/** Forme stockée dans app_settings.data.slack (l'URL y est chiffrée) */
interface StoredSlack {
  enabled?: boolean;
  webhookUrl?: string;
  threshold?: number;
  events?: Partial<SlackEvents>;
  includeExcerpt?: boolean;
  consecutiveFailures?: number;
  alert?: { message: string; at: string } | null;
}

export interface SlackConfig {
  enabled: boolean;
  /** Déchiffrée — usage serveur seulement */
  webhookUrl: string | null;
  threshold: number;
  events: SlackEvents;
  includeExcerpt: boolean;
  consecutiveFailures: number;
  alert: { message: string; at: string } | null;
}

/** Ce que voit le navigateur : jamais l'URL complète */
export interface SlackSettingsView extends Omit<SlackConfig, "webhookUrl"> {
  configured: boolean;
  webhookUrlMasked: string | null;
  encryptionReady: boolean;
}

function clampThreshold(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function parseStored(data: unknown): StoredSlack {
  const s = (data as Record<string, unknown> | null)?.slack;
  return s && typeof s === "object" && !Array.isArray(s) ? (s as StoredSlack) : {};
}

function toConfig(s: StoredSlack): SlackConfig {
  let webhookUrl: string | null = null;
  if (s.webhookUrl && isEncrypted(s.webhookUrl)) {
    const plain = decrypt(s.webhookUrl);
    // decrypt() rend la valeur chiffrée telle quelle si la clé manque ou ne correspond pas
    if (!isEncrypted(plain) && validateSlackWebhookUrl(plain).ok) webhookUrl = plain;
  }
  return {
    enabled: s.enabled === true,
    webhookUrl,
    threshold: s.threshold === undefined ? DEFAULT_THRESHOLD : clampThreshold(s.threshold),
    events: {
      positive: s.events?.positive !== false,
      allReplies: s.events?.allReplies === true,
      unsubscribes: s.events?.unsubscribes === true,
    },
    includeExcerpt: s.includeExcerpt !== false,
    consecutiveFailures: s.consecutiveFailures ?? 0,
    alert: s.alert ?? null,
  };
}

export function toView(c: SlackConfig): SlackSettingsView {
  const { webhookUrl, ...rest } = c;
  return { ...rest, configured: !!webhookUrl, webhookUrlMasked: maskWebhookUrl(webhookUrl), encryptionReady: hasEncryptionKey() };
}

async function loadStored(workspaceId: string): Promise<{ data: Record<string, unknown>; slack: StoredSlack } | null> {
  const row = await prisma.appSettings.findUnique({ where: { workspaceId }, select: { data: true } });
  if (!row) return null;
  const data = (row.data as Record<string, unknown>) || {};
  return { data, slack: parseStored(data) };
}

export async function getSlackConfig(workspaceId: string): Promise<SlackConfig> {
  const stored = await loadStored(workspaceId);
  return toConfig(stored?.slack ?? {});
}

async function writeSlack(workspaceId: string, patch: Partial<StoredSlack>): Promise<StoredSlack> {
  const stored = await loadStored(workspaceId);
  const slack: StoredSlack = { ...(stored?.slack ?? {}), ...patch };
  const data = { ...(stored?.data ?? {}), slack };
  await prisma.appSettings.upsert({
    where: { workspaceId },
    update: { data: data as never },
    create: { workspaceId, data: data as never },
  });
  return slack;
}

// ─── Autorisation ────────────────────────────────────────

/** Seuls OWNER et ADMIN de l'espace de travail lisent ou modifient les paramètres Slack. */
export async function isWorkspaceAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m?.role === "OWNER" || m?.role === "ADMIN";
}

// ─── Lecture / mise à jour des paramètres (API) ──────────

export interface SlackSettingsInput {
  enabled?: unknown;
  /** Nouvelle URL ; absente = garder l'actuelle ; "" ou null = la retirer */
  webhookUrl?: unknown;
  threshold?: unknown;
  events?: { positive?: unknown; allReplies?: unknown; unsubscribes?: unknown };
  includeExcerpt?: unknown;
}

export async function readSlackSettings(workspaceId: string): Promise<SlackSettingsView> {
  return toView(await getSlackConfig(workspaceId));
}

export async function updateSlackSettings(
  workspaceId: string,
  input: SlackSettingsInput,
  userId?: string
): Promise<{ ok: true; settings: SlackSettingsView } | { ok: false; status: number; error: string }> {
  const stored = (await loadStored(workspaceId))?.slack ?? {};
  const patch: Partial<StoredSlack> = {};

  if (input.webhookUrl !== undefined) {
    if (input.webhookUrl === null || input.webhookUrl === "") {
      patch.webhookUrl = undefined;
    } else {
      const v = validateSlackWebhookUrl(input.webhookUrl);
      if (!v.ok) return { ok: false, status: 400, error: v.error };
      if (!hasEncryptionKey()) {
        return { ok: false, status: 400, error: "Chiffrement non configuré sur le serveur (ENCRYPTION_KEY) : l'URL ne peut pas être enregistrée." };
      }
      patch.webhookUrl = encrypt(v.url);
      // Nouvelle URL : on repart à zéro sur les échecs
      patch.consecutiveFailures = 0;
      patch.alert = null;
    }
  }
  if (input.threshold !== undefined) patch.threshold = clampThreshold(input.threshold);
  if (input.includeExcerpt !== undefined) patch.includeExcerpt = input.includeExcerpt === true;
  if (input.events && typeof input.events === "object") {
    const cur = toConfig(stored).events;
    patch.events = {
      positive: input.events.positive === undefined ? cur.positive : input.events.positive === true,
      allReplies: input.events.allReplies === undefined ? cur.allReplies : input.events.allReplies === true,
      unsubscribes: input.events.unsubscribes === undefined ? cur.unsubscribes : input.events.unsubscribes === true,
    };
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled === true;
    // Réactiver après une désactivation automatique efface l'alerte
    if (patch.enabled && !stored.enabled) {
      patch.consecutiveFailures = 0;
      patch.alert = null;
    }
  }

  const next = toConfig({ ...stored, ...patch });
  if (next.enabled && !next.webhookUrl) {
    return { ok: false, status: 400, error: "Ajoutez l'URL du webhook Slack avant d'activer les notifications." };
  }

  const saved = await writeSlack(workspaceId, patch);
  await logActivity({
    action: "slack_settings_updated",
    type: "info",
    title: "Paramètres Slack modifiés",
    details: next.enabled ? "Notifications Slack activées" : "Notifications Slack désactivées",
    userId,
    workspaceId,
  });
  return { ok: true, settings: toView(toConfig(saved)) };
}

/** Bouton « Envoyer un test » : n'entre pas dans le compte des échecs consécutifs. */
export async function sendSlackTest(workspaceId: string, webhookUrl?: unknown, deps?: SendDeps) {
  let url: string | null;
  if (typeof webhookUrl === "string" && webhookUrl.trim()) {
    const v = validateSlackWebhookUrl(webhookUrl);
    if (!v.ok) return { ok: false as const, error: v.error };
    url = v.url;
  } else {
    url = (await getSlackConfig(workspaceId)).webhookUrl;
  }
  if (!url) return { ok: false as const, error: "Aucune URL de webhook enregistrée" };
  const res = await postToSlack(url, buildSlackTestMessage(appLink("/settings")), deps);
  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
}

// ─── File d'envoi ────────────────────────────────────────

function appLink(path: string): string {
  const base = (process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
  return `${base}${path}`;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

interface QueuePayload {
  category?: ReplyCategory;
  confidence?: number;
  excerpt?: string;
}

async function enqueue(row: {
  workspaceId: string;
  dedupeKey: string;
  event: SlackEvent;
  prospectId: string;
  campaignId: string | null;
  activityId: string | null;
  payload: QueuePayload;
}): Promise<boolean> {
  try {
    await prisma.slackNotification.create({ data: { ...row, payload: row.payload as never } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false; // déjà notifié (idempotence)
    throw err;
  }
}

/** Quel événement Slack (au plus un) pour une réponse classée, selon les paramètres. */
export function pickReplyEvent(c: Pick<ReplyClassification, "category" | "confidence">, cfg: Pick<SlackConfig, "events" | "threshold">): SlackEvent | null {
  if (c.category === "positive" && cfg.events.positive && c.confidence >= cfg.threshold) return "positive_reply";
  if (c.category === "unsubscribe" && cfg.events.unsubscribes) return "unsubscribe";
  // « Toutes les réponses » : les vraies réponses humaines, pas les absences ni les rebonds
  if (cfg.events.allReplies && c.category !== "out_of_office" && c.category !== "bounce") return "reply";
  return null;
}

/**
 * Met en file la notification d'une réponse classée. Clé d'idempotence = Message-ID (sinon id de l'activité) :
 * une même réponse rapprochée de plusieurs envois ne notifie qu'une fois. Ne lance jamais d'erreur.
 */
export async function enqueueReplyNotification(o: {
  workspaceId: string;
  activityId: string;
  prospectId: string;
  campaignId: string | null;
  messageId?: string | null;
  classification: ReplyClassification;
  cleanedText: string;
}): Promise<boolean> {
  try {
    const cfg = await getSlackConfig(o.workspaceId);
    if (!cfg.enabled || !cfg.webhookUrl) return false;
    const event = pickReplyEvent(o.classification, cfg);
    if (!event) return false;
    const payload: QueuePayload = { category: o.classification.category, confidence: o.classification.confidence };
    if (cfg.includeExcerpt && o.cleanedText) payload.excerpt = replyExcerpt(o.cleanedText, 300);
    return await enqueue({
      workspaceId: o.workspaceId,
      dedupeKey: `reply:${o.messageId?.trim() || o.activityId}`,
      event,
      prospectId: o.prospectId,
      campaignId: o.campaignId,
      activityId: o.activityId,
      payload,
    });
  } catch (err) {
    console.error("[slack] mise en file échouée:", err instanceof Error ? redactWebhook(err.message) : err);
    return false;
  }
}

/**
 * Un humain a glissé le prospect dans « Réponse positive » : une seule notification par prospect et par campagne
 * (rien si une réponse positive de cette campagne a déjà été notifiée). Ne lance jamais d'erreur.
 */
export async function enqueueManualPositiveNotification(o: { workspaceId: string; prospectId: string }): Promise<boolean> {
  try {
    const cfg = await getSlackConfig(o.workspaceId);
    if (!cfg.enabled || !cfg.webhookUrl || !cfg.events.positive) return false;
    const last = await prisma.emailActivity.findFirst({
      where: { prospectId: o.prospectId, prospect: { workspaceId: o.workspaceId } },
      orderBy: { sentAt: "desc" },
      select: { id: true, campaignId: true },
    });
    const campaignId = last?.campaignId ?? null;
    const already = await prisma.slackNotification.findFirst({
      where: { workspaceId: o.workspaceId, prospectId: o.prospectId, campaignId, event: { in: ["positive_reply", "manual_positive"] } },
      select: { id: true },
    });
    if (already) return false;
    return await enqueue({
      workspaceId: o.workspaceId,
      dedupeKey: `manual-positive:${o.prospectId}:${campaignId ?? "sans-campagne"}`,
      event: "manual_positive",
      prospectId: o.prospectId,
      campaignId,
      activityId: last?.id ?? null,
      payload: {},
    });
  } catch (err) {
    console.error("[slack] mise en file (manuel) échouée:", err instanceof Error ? redactWebhook(err.message) : err);
    return false;
  }
}

async function recordFailure(workspaceId: string, error: string) {
  const cfg = await getSlackConfig(workspaceId);
  const failures = cfg.consecutiveFailures + 1;
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    const message = `Envoi Slack désactivé après ${failures} échecs consécutifs (dernière erreur : ${error}). Vérifiez l'URL du webhook puis réactivez.`;
    await writeSlack(workspaceId, { consecutiveFailures: failures, enabled: false, alert: { message, at: new Date().toISOString() } });
    await logActivity({ action: "slack_disabled", type: "error", title: "Notifications Slack désactivées", details: message, workspaceId });
  } else {
    await writeSlack(workspaceId, { consecutiveFailures: failures });
  }
}

/**
 * Envoie les notifications en attente (toutes les minutes via le cron). Séquentiel (pool Prisma limité).
 * Chaque notification : 3 essais avec délai de 5 s ; échec définitif = FAILED + compteur d'échecs.
 */
export async function processSlackQueue(deps: SendDeps & { limit?: number } = {}): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  // Envois interrompus (redémarrage) : on les remet en attente après 5 minutes
  await prisma.slackNotification.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: "PENDING" },
  });
  const pending = await prisma.slackNotification.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: deps.limit ?? 20,
  });

  for (const n of pending) {
    const claimed = await prisma.slackNotification.updateMany({ where: { id: n.id, status: "PENDING" }, data: { status: "SENDING" } });
    if (claimed.count === 0) continue;
    try {
      const cfg = await getSlackConfig(n.workspaceId);
      if (!cfg.enabled || !cfg.webhookUrl) {
        await prisma.slackNotification.update({ where: { id: n.id }, data: { status: "SKIPPED", lastError: "Slack désactivé", payload: {} } });
        out.skipped++;
        continue;
      }
      const message = await buildMessageFor(n, cfg.includeExcerpt);
      if (!message) {
        await prisma.slackNotification.update({ where: { id: n.id }, data: { status: "SKIPPED", lastError: "Prospect introuvable", payload: {} } });
        out.skipped++;
        continue;
      }
      const res = await postToSlack(cfg.webhookUrl, message, deps);
      if (res.ok) {
        // L'extrait n'est gardé que le temps de l'envoi (Loi 25 : minimisation)
        await prisma.slackNotification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), attempts: res.attempts, payload: {} } });
        if (cfg.consecutiveFailures > 0) await writeSlack(n.workspaceId, { consecutiveFailures: 0 });
        out.sent++;
      } else {
        await prisma.slackNotification.update({ where: { id: n.id }, data: { status: "FAILED", attempts: res.attempts, lastError: res.error, payload: {} } });
        console.error(`[slack] échec de la notification ${n.id} : ${res.error}`);
        await recordFailure(n.workspaceId, res.error);
        out.failed++;
      }
    } catch (err) {
      const error = redactWebhook(err instanceof Error ? err.message : "Erreur");
      console.error(`[slack] notification ${n.id} :`, error);
      await prisma.slackNotification.update({ where: { id: n.id }, data: { status: "FAILED", lastError: error, payload: {} } }).catch(() => {});
      out.failed++;
    }
  }
  return out;
}

async function buildMessageFor(
  n: { workspaceId: string; event: string; prospectId: string | null; campaignId: string | null; activityId: string | null; payload: unknown },
  includeExcerpt: boolean
) {
  if (!n.prospectId) return null;
  // Isolation : le prospect doit appartenir à l'espace de travail de la notification
  const prospect = await prisma.prospect.findFirst({
    where: { id: n.prospectId, workspaceId: n.workspaceId },
    select: { id: true, companyName: true, ownerName: true, email: true },
  });
  if (!prospect) return null;
  const campaign = n.campaignId
    ? await prisma.campaign.findFirst({ where: { id: n.campaignId, workspaceId: n.workspaceId }, select: { name: true } })
    : null;
  let mailbox: string | null = null;
  if (n.activityId) {
    const act = await prisma.emailActivity.findUnique({ where: { id: n.activityId }, select: { emailAccountId: true } });
    if (act?.emailAccountId) {
      const acc = await prisma.emailAccount.findFirst({ where: { id: act.emailAccountId, workspaceId: n.workspaceId }, select: { email: true } });
      mailbox = acc?.email ?? null;
    }
  }
  if (!mailbox) {
    const row = await prisma.appSettings.findUnique({ where: { workspaceId: n.workspaceId }, select: { data: true } });
    const email = ((row?.data as Record<string, unknown>)?.email || {}) as Record<string, string>;
    mailbox = email.gmailConnectedEmail || email.senderEmail || email.smtpUser || null;
  }
  const p = (n.payload || {}) as QueuePayload;
  return buildSlackMessage({
    event: n.event as SlackEvent,
    prospectName: prospect.ownerName,
    companyName: prospect.companyName,
    email: prospect.email,
    campaignName: campaign?.name ?? null,
    mailbox,
    excerpt: includeExcerpt ? p.excerpt ?? null : null,
    category: isReplyCategory(p.category) ? p.category : n.event === "manual_positive" ? "positive" : null,
    confidence: typeof p.confidence === "number" ? p.confidence : null,
    link: appLink(`/prospects?open=${encodeURIComponent(prospect.id)}`),
  });
}
