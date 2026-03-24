import { NextResponse, NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `Tu es l'assistant support de LeadNova, une plateforme de génération de leads B2B et de prospection.
Tu aides les utilisateurs avec leurs questions sur :
- La découverte de prospects (Discovery)
- L'enrichissement de données
- Les campagnes d'emailing
- Les paramètres et le ciblage
- L'import/export de données
- Les plans et la facturation

Réponds de manière concise, utile et en français par défaut. Si l'utilisateur écrit en anglais, réponds en anglais.
Ne fais pas de promesses sur les fonctionnalités qui n'existent pas.
Si tu ne peux pas résoudre le problème, suggère de contacter l'équipe support à support@leadnova.io.`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    // Convert to Anthropic format
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    });

    const reply = response.content[0]?.type === "text" ? response.content[0].text : "Désolé, je n'ai pas pu générer une réponse.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Support chat error:", error);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
