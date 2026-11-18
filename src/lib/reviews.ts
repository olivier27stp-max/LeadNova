/**
 * Avis Google récents d'une entreprise, pour les signaux de conversion
 * (rythme des avis, plaintes, propriétaire qui répond lui-même).
 *
 * - Outscraper (si OUTSCRAPER_API_KEY) : jusqu'à 30 avis les plus récents + réponses du propriétaire.
 * - Sinon Google Places (GOOGLE_PLACES_API_KEY) : 5 avis max, sans les réponses du propriétaire.
 */

export interface ReviewItem {
  rating: number | null;
  text: string;
  publishedAt: Date | null;
  ownerAnswer: string | null;
}

export interface ReviewsResult {
  source: "outscraper" | "google_places";
  reviews: ReviewItem[];
  /** true si la source donne les réponses du propriétaire */
  hasOwnerAnswers: boolean;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

async function viaOutscraper(query: string, apiKey: string): Promise<ReviewsResult | null> {
  const params = new URLSearchParams({
    query,
    reviewsLimit: "30",
    sort: "newest",
    language: "fr",
    async: "false",
  });
  const res = await fetch(`https://api.outscraper.cloud/maps/reviews-v3?${params}`, {
    headers: { "X-API-KEY": apiKey },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    console.warn(`[reviews] Outscraper ${res.status} for "${query}"`);
    return null;
  }
  const data = await res.json();
  const place = Array.isArray(data?.data) ? (Array.isArray(data.data[0]) ? data.data[0][0] : data.data[0]) : null;
  const raw: Array<Record<string, unknown>> = Array.isArray(place?.reviews_data) ? place.reviews_data : [];
  return {
    source: "outscraper",
    hasOwnerAnswers: true,
    reviews: raw.map((r) => ({
      rating: typeof r.review_rating === "number" ? r.review_rating : null,
      text: String(r.review_text ?? "").trim(),
      publishedAt: toDate(r.review_datetime_utc),
      ownerAnswer: r.owner_answer ? String(r.owner_answer).trim() : null,
    })),
  };
}

async function viaPlaces(query: string, apiKey: string): Promise<ReviewsResult | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.reviews",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "fr", regionCode: "CA", pageSize: 1 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn(`[reviews] Places ${res.status} for "${query}"`);
    return null;
  }
  const data = await res.json();
  const raw: Array<Record<string, unknown>> = data?.places?.[0]?.reviews ?? [];
  return {
    source: "google_places",
    hasOwnerAnswers: false,
    reviews: raw.map((r) => {
      const text = (r.originalText as { text?: string } | undefined)?.text ?? (r.text as { text?: string } | undefined)?.text ?? "";
      return {
        rating: typeof r.rating === "number" ? r.rating : null,
        text: text.trim(),
        publishedAt: toDate(r.publishTime),
        ownerAnswer: null,
      };
    }),
  };
}

export async function fetchRecentReviews(companyName: string, city: string | null): Promise<ReviewsResult | null> {
  const query = [companyName, city, "QC"].filter(Boolean).join(", ");
  try {
    const outscraperKey = process.env.OUTSCRAPER_API_KEY;
    if (outscraperKey) {
      const r = await viaOutscraper(query, outscraperKey);
      if (r && r.reviews.length > 0) return r;
    }
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (placesKey) return await viaPlaces(query, placesKey);
  } catch (err) {
    console.warn(`[reviews] failed for "${query}":`, err instanceof Error ? err.message : err);
  }
  return null;
}

/** Statistiques calculées sans IA. */
export function reviewStats(r: ReviewsResult) {
  const sixMonthsAgo = Date.now() - 182 * 24 * 3600 * 1000;
  const dated = r.reviews.filter((x) => x.publishedAt);
  const last6m = dated.filter((x) => x.publishedAt!.getTime() >= sixMonthsAgo).length;
  const lastReviewAt = dated.reduce<Date | null>((acc, x) => (!acc || x.publishedAt! > acc ? x.publishedAt! : acc), null);
  const answered = r.reviews.filter((x) => x.ownerAnswer).length;
  return {
    sampleSize: r.reviews.length,
    last6m,
    lastReviewAt,
    // « répond lui-même » : au moins 30 % des avis récents ont une réponse
    ownerReplies: r.hasOwnerAnswers && r.reviews.length > 0 ? answered / r.reviews.length >= 0.3 : null,
  };
}
