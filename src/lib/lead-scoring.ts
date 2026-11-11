interface ScoreInput {
  website?: string | null;
  email?: string | null;
  emailGuessed?: boolean | null;
  phone?: string | null;
  city?: string | null;
  industry?: string | null;
  reviewCount?: number | null;
  competitorCrm?: string | null;
}

/**
 * Score /100 orienté profil client idéal de Lume (entreprises de services à domicile).
 *
 *  Joignabilité   courriel réel 20 (deviné 5) · téléphone 10 · site 5 · ville 5
 *  Taille         avis Google : 20–300 → 20 · 5–19 ou 301–1000 → 10   (proxy d'une équipe de 3 à 20)
 *  Signal d'achat CRM concurrent détecté (Jobber, Housecall Pro…) → 30
 *  Pertinence     industrie renseignée → 10
 */
export function calculateLeadScore(prospect: ScoreInput): number {
  let score = 0;

  if (prospect.email) score += prospect.emailGuessed ? 5 : 20;
  if (prospect.phone) score += 10;
  if (prospect.website) score += 5;
  if (prospect.city) score += 5;

  const reviews = prospect.reviewCount ?? null;
  if (reviews !== null) {
    if (reviews >= 20 && reviews <= 300) score += 20;
    else if ((reviews >= 5 && reviews < 20) || (reviews > 300 && reviews <= 1000)) score += 10;
  }

  if (prospect.competitorCrm) score += 30;
  if (prospect.industry) score += 10;

  return Math.min(100, score);
}
