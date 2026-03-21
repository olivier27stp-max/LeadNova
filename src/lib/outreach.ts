import Anthropic from "@anthropic-ai/sdk";
import { COMPANY_INFO } from "./config";

const anthropic = new Anthropic();

interface OutreachInput {
  companyName: string;
  city?: string | null;
  industry?: string | null;
}

interface OutreachEmail {
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `Tu es un rédacteur d'emails professionnels pour ${COMPANY_INFO.name}${COMPANY_INFO.services.length > 0 ? `, une entreprise spécialisée dans:\n- ${COMPANY_INFO.services.join("\n- ")}` : ""}

Tu dois générer des emails de prospection personnalisés, professionnels et concis en français.
L'email doit:
- Être court (max 150 mots)
- Mentionner le nom de l'entreprise prospect
- Mentionner la ville si disponible
- Présenter brièvement les services si disponibles
- Proposer une soumission ou une collaboration
- Avoir un ton professionnel mais amical
- Se terminer avec "Cordialement,\\n${COMPANY_INFO.contactName}\\n${COMPANY_INFO.name}"

Retourne le résultat en JSON avec les clés "subject" et "body".
Ne mets PAS de markdown, retourne uniquement le JSON.`;

export async function generateOutreachEmail(
  input: OutreachInput
): Promise<OutreachEmail> {
  const userPrompt = `Génère un email de prospection pour:
- Entreprise: ${input.companyName}
- Ville: ${input.city || "Non spécifiée"}
- Industrie: ${input.industry || "Non spécifiée"}

L'email doit proposer nos services de manière professionnelle et personnalisée.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  try {
    const parsed = JSON.parse(content.text);
    return {
      subject: parsed.subject,
      body: parsed.body,
    };
  } catch {
    // Fallback: try to extract from response
    const lines = content.text.split("\n");
    return {
      subject: `Proposition de services pour ${input.companyName}`,
      body: content.text,
    };
  }
}

export function generateFallbackEmail(input: OutreachInput): OutreachEmail {
  const city = input.city || "votre région";
  const servicesBlock = COMPANY_INFO.services.length > 0
    ? `\n\nNous offrons des services tels que:\n${COMPANY_INFO.services.map((s) => `• ${s}`).join("\n")}\n`
    : "";

  return {
    subject: `Proposition de services pour ${input.companyName}`,
    body: `Bonjour,

J'ai remarqué que ${input.companyName} est basée dans la région de ${city}.

Chez ${COMPANY_INFO.name}, nous serions ravis de collaborer avec vous.${servicesBlock}
Je serais heureux de vous fournir une soumission rapide ou de discuter d'une collaboration potentielle.

Cordialement,
${COMPANY_INFO.contactName}
${COMPANY_INFO.name}`,
  };
}
