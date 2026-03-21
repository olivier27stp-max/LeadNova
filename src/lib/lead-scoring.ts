interface ScoreInput {
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  industry?: string | null;
}

export function calculateLeadScore(prospect: ScoreInput): number {
  let score = 0;

  if (prospect.website) score += 20;
  if (prospect.email) score += 15;
  if (prospect.phone) score += 10;
  if (prospect.city) score += 10;
  if (prospect.industry) score += 5;

  return score;
}
