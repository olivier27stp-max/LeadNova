import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getWorkspaceContext } from "@/lib/workspace";

// ─── Types ───────────────────────────────────────────────

interface GenerateRequest {
  prompt: string;
  language: "fr" | "en" | "bilingual";
  depth: "simple" | "standard" | "deep";
  angle: "local" | "commercial" | "technical" | "general";
  maxKeywords: number;
}

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

// ─── System prompt ───────────────────────────────────────

function buildSystemPrompt(language: string, depth: string, angle: string, maxKeywords: number): string {
  const langInstruction = {
    fr: "Generate keywords ONLY in French.",
    en: "Generate keywords ONLY in English.",
    bilingual: "Generate keywords in BOTH French and English. Ensure balanced coverage of both languages.",
  }[language] || "Generate keywords in both French and English.";

  const depthInstruction = {
    simple: "Generate a focused set of 10-15 core keywords.",
    standard: "Generate a comprehensive set of 25-40 keywords covering main variations and synonyms.",
    deep: `Generate an exhaustive set of up to ${maxKeywords} keywords including all variations, synonyms, related terms, niche sub-categories, and commercial angles.`,
  }[depth] || "Generate a comprehensive set of keywords.";

  const angleInstruction = {
    local: "Focus on local business terms, neighborhood-level targeting, and community-oriented language.",
    commercial: "Focus on commercial/B2B terms, professional services, and business-oriented language.",
    technical: "Focus on technical/industry-specific terms, certifications, and specialized vocabulary.",
    general: "Cover a broad range of terms suitable for general audience discovery.",
  }[angle] || "Use commercial/B2B oriented language.";

  return `You are a B2B lead generation keyword expert specializing in the Quebec/Canadian market.

Your job: Transform a short business idea or industry description into a comprehensive, structured list of search keywords optimized for finding businesses on Google and Google Maps.

RULES:
- ${langInstruction}
- ${depthInstruction}
- ${angleInstruction}
- Keywords must be practical search terms that would find actual businesses
- Include singular and plural forms when relevant
- Include common abbreviations and alternate spellings
- Think about how business owners and customers actually search
- For Quebec market, include both standard French and Quebec French variations
- Generate search queries that combine keywords with "{city}" placeholder
- Maximum ${maxKeywords} total keywords across all categories

RESPOND WITH VALID JSON ONLY. No markdown, no explanation, no code blocks. Just the JSON object.

JSON structure:
{
  "userIntent": "Brief summary of what the user wants to find",
  "primaryKeywords": ["top 5-10 most important keywords"],
  "frenchKeywords": ["all French keyword variations"],
  "englishKeywords": ["all English keyword variations"],
  "expandedKeywords": ["broader/related terms, synonyms, niche variations"],
  "nicheExpansions": ["sub-categories: residential, commercial, industrial, etc."],
  "relatedCategories": ["related business types the user might also want"],
  "negativeKeywords": ["terms to exclude to avoid irrelevant results"],
  "searchQueries": ["ready-to-use search queries with {city} placeholder, e.g. 'landscaping company {city}'"],
  "notes": "Any useful observations or suggestions for the user"
}`;
}

// ─── POST handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const body: GenerateRequest = await request.json();
    const { prompt, language = "bilingual", depth = "standard", angle = "commercial", maxKeywords = 50 } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Le prompt est requis" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY non configurée. Ajoutez-la dans votre fichier .env" },
        { status: 500 }
      );
    }

    const systemPrompt = buildSystemPrompt(language, depth, angle, maxKeywords);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt.trim() },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Keywords] OpenAI API error ${res.status}:`, errText);
      if (res.status === 401) {
        return NextResponse.json({ error: "Clé API OpenAI invalide" }, { status: 401 });
      }
      if (res.status === 429) {
        return NextResponse.json({ error: "Limite de requêtes OpenAI atteinte. Réessayez dans quelques secondes." }, { status: 429 });
      }
      return NextResponse.json({ error: `Erreur OpenAI: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: "Réponse vide de ChatGPT" }, { status: 500 });
    }

    let result: KeywordResult;
    try {
      result = JSON.parse(content);
    } catch {
      console.error("[Keywords] Failed to parse ChatGPT response:", content);
      return NextResponse.json({ error: "Réponse invalide de ChatGPT. Réessayez." }, { status: 500 });
    }

    // Ensure all arrays exist
    const sanitized: KeywordResult = {
      userIntent: result.userIntent || prompt,
      primaryKeywords: Array.isArray(result.primaryKeywords) ? result.primaryKeywords : [],
      frenchKeywords: Array.isArray(result.frenchKeywords) ? result.frenchKeywords : [],
      englishKeywords: Array.isArray(result.englishKeywords) ? result.englishKeywords : [],
      expandedKeywords: Array.isArray(result.expandedKeywords) ? result.expandedKeywords : [],
      nicheExpansions: Array.isArray(result.nicheExpansions) ? result.nicheExpansions : [],
      relatedCategories: Array.isArray(result.relatedCategories) ? result.relatedCategories : [],
      negativeKeywords: Array.isArray(result.negativeKeywords) ? result.negativeKeywords : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : [],
      notes: result.notes || "",
    };

    // Save to DB
    const saved = await prisma.keywordGeneration.create({
      data: {
        workspaceId,
        prompt: prompt.trim(),
        language,
        depth,
        angle,
        maxKeywords,
        result: sanitized as never,
      },
    });

    const totalKw = (sanitized.primaryKeywords?.length || 0) + (sanitized.expandedKeywords?.length || 0);
    await logActivity({
      action: "keywords_generated",
      type: "success",
      title: "Mots-clés générés",
      details: `${totalKw} mots-clés générés pour "${prompt.trim().substring(0, 50)}"`,
      workspaceId: workspaceId ?? undefined,
      metadata: { keyword: prompt.trim().substring(0, 100), count: totalKw },
    });

    return NextResponse.json({
      id: saved.id,
      result: sanitized,
    });
  } catch (error) {
    console.error("[Keywords] Generation error:", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── GET: list saved generations ─────────────────────────

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const generations = await prisma.keywordGeneration.findMany({
      where: workspaceId ? { workspaceId } : {},
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        prompt: true,
        language: true,
        depth: true,
        angle: true,
        insertedCount: true,
        createdAt: true,
      },
    });
    return NextResponse.json(generations);
  } catch (error) {
    console.error("[Keywords] List error:", error);
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }
}
