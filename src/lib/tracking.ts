import { createHmac } from "crypto";

const SECRET = process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";

/** Signature courte d'un lien suivi : empêche d'utiliser /api/track/click comme redirection ouverte. */
export function signClick(activityId: string, url: string): string {
  return createHmac("sha256", SECRET).update(`${activityId}|${url}`).digest("hex").slice(0, 20);
}

export function buildClickUrl(trackingBase: string, activityId: string, url: string): string {
  const params = new URLSearchParams({ u: url, s: signClick(activityId, url) });
  return `${trackingBase}/api/track/click/${activityId}?${params}`;
}
