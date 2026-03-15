import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "fl_session";

const PUBLIC_PATHS = [
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
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
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

  if (isPublic(pathname)) return NextResponse.next();

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token || !(await verifyToken(token))) {
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
