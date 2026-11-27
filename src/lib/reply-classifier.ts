import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { advanceSalesStage } from "@/lib/sales-pipeline";
import { enqueueReplyNotification } from "@/lib/slack-notifications";
import {
  REPLY_CATEGORIES,
  classifyByKeywords,
  cleanReplyText,
  isExplicitUnsubscribe,
  isReplyCategory,
  type ReplyCategory,
  type ReplyClassification,
} from "@/lib/reply-text";

/**
 * Classe une réponse de prospect : positive | neutral | negative | unsubscribe | out_of_office | bounce,
 * avec un score de confiance et une raison courte. IA (Claude) d'abord, mots-clés FR/EN en secours.
 * Une réponse négative reste un signal d'engagement ; « unsubscribe » ajoute l'adresse à la liste noire (LCAP).
 */

export { cleanReplyText };
export type ReplySentiment = ReplyCategory;

const MODEL = process.env.OWNER_AI_MODEL || "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...REPLY_CATEGORIES] },
    confidence: { type: "number", description: "Confiance de 0 à 1" },
    reason: { type: "string", description: "Raison courte (une phrase, en français)" },
  },
  required: ["category", "confidence", "reason"],
  additionalProperties: false,
} as const;

const SYSTEM = `Tu classes la réponse d'un propriétaire d'entreprise québécoise à un courriel de prospection pour un logiciel (CRM).
La réponse peut être en français (québécois) ou en anglais. / The reply may be in French (Quebec) or English.
- positive : intéressé, veut un appel ou une démo, demande le prix ou des informations (« oui appelez-moi », « combien ça coûte ? », "call me", "how much?").
- neutral : question sans intérêt clair, « pas maintenant », transfère à quelqu'un d'autre.
- negative : pas intéressé, a déjà un outil et n'en veut pas d'autre ("not interested").
- unsubscribe : demande d'arrêter les courriels ou d'être retiré de la liste. « non merci » est l'instruction de désinscription de nos courriels : c'est TOUJOURS unsubscribe ("no thanks", "remove me", "stop").
- out_of_office : réponse automatique (absence du bureau, vacances, accusé de réception).
- bounce : message d'erreur de livraison (adresse introuvable, boîte pleine, mailer-daemon).
Le texte cité du message original et la signature ont déjà été retirés ; ignore ce qui en resterait.
confidence : ta confiance de 0 à 1. reason : une phrase courte en français.`;

let client: Anthropic | null = null;

type AiClassifier = (cleaned: string) => Promise<Omit<ReplyClassification, "source"> | null>;

async function classifyWithClaude(cleaned: string): Promise<Omit<ReplyClassification, "source"> | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: `Réponse reçue / Reply received :\n\n${cleaned}` }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  const parsed = JSON.parse(block.text) as { category?: unknown; confidence?: unknown; reason?: unknown };
  if (!isReplyCategory(parsed.category)) return null;
  const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;
  return { category: parsed.category, confidence, reason: String(parsed.reason ?? "").slice(0, 200) };
}

/**
 * Classe une réponse brute (source MIME ou texte). IA si disponible, sinon mots-clés.
 * Une demande explicite de désinscription (« non merci », « retirez-moi », « stop ») prime toujours.
 */
export async function classifyReply(
  raw: string,
  meta: { subject?: string; from?: string } = {},
  ai: AiClassifier = classifyWithClaude
): Promise<{ classification: ReplyClassification; cleaned: string }> {
  const cleaned = cleanReplyText(raw);
  const keywords = classifyByKeywords(cleaned, meta);
  let classification: ReplyClassification = keywords;
  // Rebonds et réponses vides : les mots-clés suffisent, pas d'appel IA
  if (cleaned && keywords.category !== "bounce") {
    try {
      const r = await ai(cleaned);
      if (r) classification = { ...r, source: "ai" };
    } catch (err) {
      console.error("[reply-classifier] IA indisponible, mots-clés utilisés :", err instanceof Error ? err.message : err);
    }
  }
  if (classification.category !== "unsubscribe" && classification.category !== "bounce" && isExplicitUnsubscribe(cleaned)) {
    classification = { category: "unsubscribe", confidence: Math.max(classification.confidence, 0.95), reason: "Demande de ne plus recevoir de courriels", source: classification.source };
  }
  return { classification, cleaned };
}

/** Classe et enregistre la réponse sur l'activité et le prospect, puis met la notification Slack en file. Ne lance jamais d'erreur. */
export async function recordReplyClassification(
  activityId: string,
  prospectId: string,
  rawText: string,
  workspaceId?: string | null,
  meta: { messageId?: string | null; subject?: string; from?: string } = {},
  ai?: AiClassifier
): Promise<ReplyClassification | null> {
  try {
    const { classification: result, cleaned } = await classifyReply(rawText, meta, ai);
    const now = new Date();
    const activity = await prisma.emailActivity.update({
      where: { id: activityId },
      data: {
        repliedAt: now,
        replySentiment: result.category,
        replySnippet: result.reason || cleaned.slice(0, 300) || null,
        replyConfidence: result.confidence,
        replyMessageId: meta.messageId ?? null,
        // Un rebond n'est pas une réponse ; un désabonnement arrête les relances partout
        ...(result.category === "bounce" ? { bounce: true, replyReceived: false } : {}),
        ...(result.category === "unsubscribe" ? { unsubscribed: true } : {}),
      },
      select: { campaignId: true },
    });
    if (result.category === "bounce") {
      await prisma.prospect.updateMany({
        where: { id: prospectId, status: { notIn: ["QUALIFIED"] } },
        data: { status: "BOUNCED", emailStatus: "invalid" },
      });
    } else {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { lastEngagedAt: now, lastReplySentiment: result.category },
      });
    }
    // Réponse positive → entre dans le pipeline de vente (colonne « Réponse positive »)
    if (result.category === "positive") {
      const p = await prisma.prospect.findUnique({
        where: { id: prospectId },
        select: { companyName: true, salesStage: true, workspaceId: true },
      });
      const ws = p?.workspaceId ?? workspaceId;
      if (p && ws) {
        await advanceSalesStage({ workspaceId: ws, prospectId, companyName: p.companyName, from: p.salesStage, to: "POSITIVE_REPLY" });
      }
    }
    // Désabonnement (« non merci ») ou rebond → contact exclu (liste noire), plus aucune relance
    if ((result.category === "unsubscribe" || result.category === "bounce") && workspaceId) {
      const p = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { email: true } });
      const reason = result.category === "unsubscribe" ? "unsubscribe_reply" : "hard_bounce";
      if (p?.email) {
        await prisma.blacklist.upsert({
          where: { workspaceId_email: { workspaceId, email: p.email.toLowerCase() } },
          update: { reason },
          create: { email: p.email.toLowerCase(), reason, workspaceId },
        });
      }
      if (result.category === "unsubscribe") {
        await prisma.prospect.update({ where: { id: prospectId }, data: { status: "NOT_INTERESTED" } });
      }
    }
    // Notification Slack : mise en file seulement (envoi par le cron, jamais pendant la sync)
    if (workspaceId) {
      await enqueueReplyNotification({
        workspaceId,
        activityId,
        prospectId,
        campaignId: activity.campaignId,
        messageId: meta.messageId,
        classification: result,
        cleanedText: cleaned,
      });
    }
    return result;
  } catch (err) {
    console.error("[reply-classifier] record failed:", err);
    return null;
  }
}
