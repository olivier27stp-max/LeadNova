/**
 * Regroupement des catégories Google (texte libre, FR/EN) en grands métiers
 * pour segmenter les listes de prospects. Le premier groupe qui correspond gagne,
 * d'où l'ordre : les métiers précis (gouttières, revêtement) passent avant le
 * nettoyage général.
 */

export interface IndustryGroup {
  key: string;
  label: string;
  pattern: RegExp;
}

export const OTHER_INDUSTRY_GROUP = "autre";

export const INDUSTRY_GROUPS: IndustryGroup[] = [
  {
    key: "gouttieres",
    label: "Gouttières",
    pattern: /gouttiere|gutter/,
  },
  {
    key: "revetement",
    label: "Revêtement / lavage à pression",
    pattern: /nettoyage de revetement|lavage a (la )?pression|pressure wash|power wash|soft wash/,
  },
  {
    key: "vitres",
    label: "Lavage de vitres",
    pattern: /(nettoyage|lavage|laveur|nettoyeur)s? de (vitre|fenetre)|window (clean|wash)/,
  },
  {
    key: "nettoyage",
    label: "Nettoyage / entretien ménager",
    pattern: /nettoy|menage|entretien menager|conciergerie|janitorial|cleaning|maid/,
  },
  {
    key: "paysagement",
    label: "Paysagement / déneigement",
    pattern: /paysag|amenagement paysager|landscap|tonte|pelouse|lawn|deneig|snow/,
  },
  {
    key: "immobilier",
    label: "Gestion immobilière",
    pattern: /immobili|property|facility|building management|copropriete|condo|gestion d'immeubles|edifice a appartements|appartements|logement|habitations/,
  },
  {
    key: "golf",
    label: "Golf",
    pattern: /golf|driving range/,
  },
  {
    key: "construction",
    label: "Construction / entrepreneurs",
    pattern: /entrepreneur|construct|renovation|toitur|couvreur|roofing|peint|painting|fenetre|revetements de sol|parement/,
  },
];

export function normalizeIndustry(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .trim();
}

/** Clé du grand métier d'un prospect, « autre » si rien ne correspond. */
export function getIndustryGroup(industry: string | null | undefined): string {
  const n = normalizeIndustry(industry);
  if (!n) return OTHER_INDUSTRY_GROUP;
  for (const g of INDUSTRY_GROUPS) {
    if (g.pattern.test(n)) return g.key;
  }
  return OTHER_INDUSTRY_GROUP;
}

export function industryGroupLabel(key: string): string {
  if (key === OTHER_INDUSTRY_GROUP) return "Autres / non classés";
  return INDUSTRY_GROUPS.find((g) => g.key === key)?.label ?? key;
}

/**
 * Valeurs exactes du champ `industry` qui appartiennent à un groupe, à partir
 * de la liste des valeurs distinctes en base. Pour « autre », `includeEmpty`
 * indique qu'il faut aussi prendre les prospects sans industrie (null).
 */
export function industryValuesForGroup(
  distinctValues: (string | null)[],
  groupKey: string
): { values: string[]; includeNull: boolean } {
  const values: string[] = [];
  let includeNull = false;
  for (const v of distinctValues) {
    if (getIndustryGroup(v) !== groupKey) continue;
    if (v === null) includeNull = true;
    else values.push(v);
  }
  return { values, includeNull };
}
