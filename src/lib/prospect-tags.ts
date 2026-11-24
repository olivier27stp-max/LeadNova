// Tags de prospects : définis par compte dans Paramètres (app_settings.data.prospectTags),
// chaque fiche garde les identifiants de ses tags (Prospect.tags).

export interface ProspectTag {
  id: string;
  name: string;
  color: TagColor;
}

export const TAG_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

// Classes Tailwind complètes (pas de concaténation, sinon Tailwind ne les génère pas)
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  green: "bg-green-500/15 text-green-700 dark:text-green-300",
  yellow: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  pink: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
};

export const TAG_COLOR_LABELS: Record<TagColor, string> = {
  gray: "Gris", blue: "Bleu", green: "Vert", yellow: "Jaune", orange: "Orange", red: "Rouge", purple: "Violet", pink: "Rose",
};

/** Lit la liste des tags depuis les réglages (tolère des données incomplètes). */
export function parseProspectTags(value: unknown): ProspectTag[] {
  if (!Array.isArray(value)) return [];
  const out: ProspectTag[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    if (typeof t.id !== "string" || typeof t.name !== "string" || !t.name.trim()) continue;
    const color = (TAG_COLORS as readonly string[]).includes(t.color as string) ? (t.color as TagColor) : "gray";
    out.push({ id: t.id, name: t.name.trim(), color });
  }
  return out;
}

export function newTagId(): string {
  return `tag_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
