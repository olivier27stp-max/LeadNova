import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "fl_session";
const PAID_COOKIE = "fl_paid";

const PUBLIC_PATHS = [
  "/payment",
  "/api/payment",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/setup",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/track",
  "/api/webhooks",
  "/api/cron",
  "/invite",
];

// Always reachable without session OR paywall — the paywall itself lives here.
const PAYWALL_FREE_PATHS = [
  "/payment",
  "/api/payment",
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/track",
  "/api/webhooks",
  "/api/cron",
];

// Paths where a visitor who has NOT paid must be redirected to /payment
// even though they are otherwise "public" (login/register/setup/forgot/etc.).
const PAYWALL_GATED_PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/api/auth/setup",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];

function matchesAny(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string): boolean {
  return matchesAny(pathname, PUBLIC_PATHS);
}

function isPaywallFree(pathname: string): boolean {
  return matchesAny(pathname, PAYWALL_FREE_PATHS);
}

function isPaywallGatedPublic(pathname: string): boolean {
  return matchesAny(pathname, PAYWALL_GATED_PUBLIC_PATHS);
}

async function verifyPaidCookie(token: string): Promise<boolean> {
  try {
    const secret = process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";
    const decoded = Buffer.from(token, "base64url").toString();
    const lastPipe = decoded.lastIndexOf("|");
    if (lastPipe === -1) return false;
    const payload = decoded.slice(0, lastPipe);
    const sig = decoded.slice(lastPipe + 1);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (sig !== expected) return false;

    const parts = payload.split("|");
    if (parts.length < 2) return false;
    const ts = parts[parts.length - 1];
    const createdAt = parseInt(ts, 36);
    if (isNaN(createdAt)) return false;
    const MAX_AGE_MS = 60 * 60 * 24 * 365 * 1000; // 1 year
    if (Date.now() - createdAt > MAX_AGE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";
    const decoded = Buffer.from(token, "base64url").toString();
    const lastPipe = decoded.lastIndexOf("|");
    if (lastPipe === -1) return false;
    const payload = decoded.slice(0, lastPipe);
    const sig = decoded.slice(lastPipe + 1);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (sig !== expected) return false;

    const parts = payload.split("|");
    if (parts.length < 2) return false;
    const ts = parts[parts.length - 1];
    const createdAt = parseInt(ts, 36);
    if (isNaN(createdAt)) return false;
    const MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000; // 7 days
    if (Date.now() - createdAt > MAX_AGE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;
  const isAuthed = !!(sessionToken && (await verifyToken(sessionToken)));

  // Paywall check: anyone without a valid session must have paid (or used a
  // promo code) before being able to reach login, register or the app itself.
  if (!isAuthed && !isPaywallFree(pathname)) {
    const paidToken = request.cookies.get(PAID_COOKIE)?.value;
    const hasPaid = !!(paidToken && (await verifyPaidCookie(paidToken)));
    if (!hasPaid) {
      // Paywall-gated public paths (login, register, …) and private paths
      // both funnel unpaid visitors to /payment.
      if (isPaywallGatedPublic(pathname) || !isPublic(pathname)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Paiement requis. Veuillez souscrire au plan Enterprise." },
            { status: 402 }
          );
        }
        const paymentUrl = new URL("/payment", request.url);
        paymentUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(paymentUrl);
      }
    }
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!isAuthed) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    // Pages redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
