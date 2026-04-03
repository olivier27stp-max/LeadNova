import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Get start-of-day in the given IANA timezone, returned as a UTC Date for DB queries */
export function startOfDayInTz(tz: string, daysAgo: number = 0): Date {
  const now = new Date();
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = localNow.getTime() - now.getTime();
  const local = new Date(localNow);
  local.setDate(local.getDate() - daysAgo);
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}
