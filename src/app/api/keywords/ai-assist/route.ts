import { NextRequest, NextResponse } from "next/server";

interface AiAssistRequest {
  prompt: string;
  type: "keywords" | "cities" | "queries";
  currentItems: string[];
}

function buildSystemPrompt(type: string, currentItems: string[]): string {
  const currentList = currentItems.length > 0
    ? `\nÉLÉMENTS ACTUELS:\n${currentItems.map((i) => `- ${i}`).join("\n")}`
    : "\nAucun élément actuellement configuré.";

  if (type === "cities") {
    return `Tu es un assistant spécialisé dans le ciblage géographique pour la prospection B2B au Québec/Canada.

L'utilisateur te donne une instruction en langage naturel. Tu dois retourner les villes à AJOUTER et/ou à SUPPRIMER de sa liste de ciblage.

RÈGLES:
- Retourne des noms de villes réels au Québec/Canada
- Si l'utilisateur demande d'ajouter des villes (ex: "ajoute les villes de l'Estrie"), retourne-les dans "add"
- Si l'utilisateur demande de retirer des villes (ex: "enlève Montréal", "retire les villes de la Montérégie"), retourne-les dans "remove"
- Si l'utilisateur demande de remplacer, mets les anciennes dans "remove" et les nouvelles dans "add"
- Ne duplique pas les villes déjà présentes dans "add"
- Pour les régions (ex: "Estrie", "Montérégie"), liste les principales villes de cette région
${currentList}

RÉPONDS UNIQUEMENT EN JSON VALIDE:
{
  "add": ["ville1", "ville2"],
  "remove": ["ville3"],
  "explanation": "Courte explication de ce qui a été fait"
}`;
  }

  if (type === "queries") {
    return `Tu es un expert en recherche de prospects B2B au Québec/Canada.

L'utilisateur te donne une instruction. Tu dois retourner des requêtes de recherche Google à AJOUTER et/ou SUPPRIMER.

RÈGLES:
- Les requêtes doivent utiliser {city} comme placeholder pour la ville
- Exemples: "entreprise de toiture {city}", "landscaping company {city}"
- Si l'utilisateur demande d'ajouter, retourne dans "add"
- Si l'utilisateur demande de supprimer ou modifier, utilise "remove" et "add" en conséquence
- Génère des requêtes variées: français, anglais, synonymes, termes commerciaux
${currentList}

RÉPONDS UNIQUEMENT EN JSON VALIDE:
{
  "add": ["requête1 {city}", "requête2 {city}"],
  "remove": ["ancienne requête"],
  "explanation": "Courte explication"
}`;
  }

  // keywords (default)
  return `Tu es un expert en mots-clés de recherche pour la prospection B2B au Québec/Canada.

L'utilisateur te donne une instruction en langage naturel. Tu dois retourner les mots-clés à AJOUTER et/ou SUPPRIMER de sa liste.

RÈGLES:
- Génère des mots-clés pratiques pour trouver des entreprises sur Google/Google Maps
- Inclus les variations françaises ET anglaises
- Inclus singulier/pluriel, abréviations, synonymes
- Si l'utilisateur demande d'ajouter un secteur, génère 15-30 mots-clés pertinents
- Si l'utilisateur demande de retirer un secteur ou des termes spécifiques, liste-les dans "remove"
- Si l'utilisateur demande de remplacer, mets les anciens dans "remove" et les nouveaux dans "add"
- Ne duplique pas les mots-clés déjà présents
- Pense aux termes que les gens utilisent réellement pour chercher
${currentList}

RÉPONDS UNIQUEMENT EN JSON VALIDE:
{
  "add": ["mot-clé1", "mot-clé2"],
  "remove": ["ancien mot-clé"],
  "explanation": "Courte explication"
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: AiAssistRequest = await request.json();
    const { prompt, type = "keywords", currentItems = [] } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Le prompt est requis" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY non configurée. Ajoutez-la dans votre fichier .env" },
        { status: 500 }
      );
    }

    const systemPrompt = buildSystemPrompt(type, currentItems);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: prompt.trim() }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[AI Assist] Gemini error ${res.status}:`, errText);
      if (res.status === 403) return NextResponse.json({ error: "Clé API Google invalide ou Gemini non activé" }, { status: 401 });
      if (res.status === 429) return NextResponse.json({ error: "Limite de requêtes atteinte. Réessayez." }, { status: 429 });
      return NextResponse.json({ error: `Erreur Gemini (${res.status}): ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return NextResponse.json({ error: "Réponse vide de Gemini" }, { status: 500 });
    }

    // Extract JSON from response
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let result: { add?: string[]; remove?: string[]; explanation?: string };
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error("[AI Assist] Failed to parse:", content);
      return NextResponse.json({ error: "Réponse invalide. Réessayez." }, { status: 500 });
    }

    return NextResponse.json({
      add: Array.isArray(result.add) ? result.add : [],
      remove: Array.isArray(result.remove) ? result.remove : [],
      explanation: result.explanation || "",
    });
  } catch (error) {
    console.error("[AI Assist] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      { status: 500 }
    );
  }
}
