import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const PAYMENT_SECRET =
  process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";
const PAID_COOKIE = "fl_paid";
const MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year

export const PROMO_CODE = "olivier27";
export const PLAN_PRICE_USD = 8750;

function signPaidToken(kind: "promo" | "paid"): string {
  const ts = Date.now().toString(36);
  const payload = `${kind}|${ts}`;
  const sig = createHmac("sha256", PAYMENT_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyPaidToken(token: string): { kind: string; ts: number } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastPipe = decoded.lastIndexOf("|");
    if (lastPipe === -1) return null;
    const payload = decoded.slice(0, lastPipe);
    const sig = decoded.slice(lastPipe + 1);
    const expected = createHmac("sha256", PAYMENT_SECRET)
      .update(payload)
      .digest("hex");
    if (sig !== expected) return null;
    const [kind, ts] = payload.split("|");
    const createdAt = parseInt(ts, 36);
    if (isNaN(createdAt)) return null;
    if (Date.now() - createdAt > MAX_AGE_SEC * 1000) return null;
    return { kind, ts: createdAt };
  } catch {
    return null;
  }
}

export function setPaidCookie(res: NextResponse, kind: "promo" | "paid"): void {
  res.cookies.set(PAID_COOKIE, signPaidToken(kind), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SEC,
    path: "/",
  });
}

export async function hasPaidAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PAID_COOKIE)?.value;
  if (!token) return false;
  return verifyPaidToken(token) !== null;
}
