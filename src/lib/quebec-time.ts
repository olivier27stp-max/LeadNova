// Heure locale du Québec pour les envois (le serveur Railway tourne en UTC).
export const QUEBEC_TZ = "America/Toronto";

/** Date locale du Québec au format YYYY-MM-DD. */
export function quebecDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUEBEC_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Instant correspondant à minuit (heure du Québec) aujourd'hui. */
export function startOfQuebecDay(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUEBEC_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
  const elapsedMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

/** Vrai si on est samedi ou dimanche au Québec. */
export function isQuebecWeekend(now: Date = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: QUEBEC_TZ, weekday: "short" }).format(now);
  return day === "Sat" || day === "Sun";
}
