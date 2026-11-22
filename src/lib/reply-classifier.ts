import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { advanceSalesStage } from "@/lib/sales-pipeline";

/**
 * Classe une réponse de prospect : positive | neutral | negative | out_of_office | unsubscribe.
 * Une réponse négative reste un signal d'engagement ; « unsubscribe » ajoute l'adresse à la liste noire (LCAP).
 */

export type ReplySentiment = "positive" | "neutral" | "negative" | "out_of_office" | "unsubscribe";

const MODEL = process.env.OWNER_AI_MODEL || "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "out_of_office", "unsubscribe"] },
    summary: { type: "string", description: "Résumé de la réponse en une phrase, en français" },
  },
  required: ["sentiment", "summary"],
  additionalProperties: false,
} as const;

const SYSTEM = `Tu classes la réponse d'un propriétaire d'entreprise à un courriel de prospection pour un logiciel (CRM).
- positive : intéressé, veut une démo, pose des questions, demande le prix, « rappelez-moi ».
- neutral : ni oui ni non, « pas maintenant », « envoyez-moi de l'info », transfère à quelqu'un.
- negative : pas intéressé, a déjà un outil et n'en veut pas d'autre.
- out_of_office : réponse automatique d'absence.
- unsubscribe : demande explicitement d'arrêter les courriels / de le retirer de la liste.
Ignore le texte cité du message original.`;

let client: Anthropic | null = null;

/** Retire le message cité (« Le … a écrit », lignes « > »…) et l'en-tête MIME grossier. */
export function cleanReplyText(raw: string): string {
  let t = raw.replace(/\r/g, "");
  const headerEnd = t.indexOf("\n\n");
  if (/^[\w-]+: /m.test(t.slice(0, 200)) && headerEnd > 0) t = t.slice(headerEnd + 2);
  t = t
    .replace(/=\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]+>/g, " ");
  const cut = t.search(/\n(Le .{5,120}a écrit|On .{5,120}wrote|-----\s*Original Message|De\s*:.*\nEnvoy[ée]|From:.*\nSent:)/i);
  if (cut > 0) t = t.slice(0, cut);
  return t
    .split("\n")
    .filter((l) => !l.trim().startsWith(">") && !/^content-|^--[\w=_-]{10,}/i.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

export async function classifyReply(text: string): Promise<{ sentiment: ReplySentiment; summary: string } | null> {
  const cleaned = cleanReplyText(text);
  if (!cleaned || !process.env.ANTHROPIC_API_KEY) return null;
  try {
    if (!client) client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content: `Réponse reçue :\n\n${cleaned}` }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    return JSON.parse(block.text);
  } catch (err) {
    console.error("[reply-classifier]", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Classe et enregistre la réponse sur l'activité et le prospect. Ne lance jamais d'erreur. */
export async function recordReplyClassification(
  activityId: string,
  prospectId: string,
  rawText: string,
  workspaceId?: string | null
): Promise<void> {
  try {
    const result = await classifyReply(rawText);
    const now = new Date();
    await prisma.emailActivity.update({
      where: { id: activityId },
      data: {
        repliedAt: now,
        replySentiment: result?.sentiment ?? null,
        replySnippet: result?.summary ?? cleanReplyText(rawText).slice(0, 300) ?? null,
      },
    });
    await prisma.prospect.update({
      where: { id: prospectId },
      data: { lastEngagedAt: now, ...(result ? { lastReplySentiment: result.sentiment } : {}) },
    });
    // Réponse positive → entre dans le pipeline de vente (colonne « Réponse positive »)
    if (result?.sentiment === "positive") {
      const p = await prisma.prospect.findUnique({
        where: { id: prospectId },
        select: { companyName: true, salesStage: true, workspaceId: true },
      });
      const ws = p?.workspaceId ?? workspaceId;
      if (p && ws) {
        await advanceSalesStage({ workspaceId: ws, prospectId, companyName: p.companyName, from: p.salesStage, to: "POSITIVE_REPLY" });
      }
    }
    if (result?.sentiment === "unsubscribe" && workspaceId) {
      const p = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { email: true } });
      if (p?.email) {
        await prisma.blacklist.upsert({
          where: { workspaceId_email: { workspaceId, email: p.email.toLowerCase() } },
          update: { reason: "unsubscribe_reply" },
          create: { email: p.email.toLowerCase(), reason: "unsubscribe_reply", workspaceId },
        });
      }
      await prisma.prospect.update({ where: { id: prospectId }, data: { status: "NOT_INTERESTED" } });
    }
  } catch (err) {
    console.error("[reply-classifier] record failed:", err);
  }
}
