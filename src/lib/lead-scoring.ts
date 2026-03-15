import { TARGET_CITIES, TARGET_INDUSTRIES } from "./config";

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

  if (
    prospect.city &&
    TARGET_CITIES.some(
      (c) => c.toLowerCase() === prospect.city!.toLowerCase()
    )
  ) {
    score += 10;
  }

  if (
    prospect.industry &&
    TARGET_INDUSTRIES.some(
      (i) => i.toLowerCase() === prospect.industry!.toLowerCase()
    )
  ) {
    score += 5;
  }

  return score;
}
