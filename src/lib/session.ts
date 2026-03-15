import { createHmac, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "freeleads-dev-secret-change-in-prod";
const COOKIE_NAME = "fl_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

// ─── Token helpers ─────────────────────────────────────────

function signToken(userId: string): string {
  const ts = Date.now().toString(36);
  const payload = `${userId}|${ts}`;
  const sig = createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

function verifyToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastPipe = decoded.lastIndexOf("|");
    if (lastPipe === -1) return null;
    const payload = decoded.slice(0, lastPipe);
    const sig = decoded.slice(lastPipe + 1);
    const expected = createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("hex");
    if (sig !== expected) return null;
    const [userId, ts] = payload.split("|");
    const createdAt = parseInt(ts, 36);
    if (isNaN(createdAt)) return null;
    if (Date.now() - createdAt > MAX_AGE_SEC * 1000) return null;
    return userId;
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────

export function setSessionCookie(res: NextResponse, userId: string): void {
  res.cookies.set(COOKIE_NAME, signToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SEC,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
}

export async function getSessionUser(): Promise<{
  id: string;
  name: string;
  email: string;
  role: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
