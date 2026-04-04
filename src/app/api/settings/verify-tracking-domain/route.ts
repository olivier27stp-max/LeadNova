import { NextRequest, NextResponse } from "next/server";
import { resolve } from "dns/promises";

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ valid: false, error: "No domain provided" }, { status: 400 });
  }

  try {
    const records = await resolve(domain, "CNAME");
    // Check if any CNAME points to our app domain
    const appHost = process.env.APP_URL
      ? new URL(process.env.APP_URL).hostname
      : process.env.VERCEL_URL || "leadnova.one";

    const valid = records.some((r) =>
      r.replace(/\.$/, "").toLowerCase() === appHost.toLowerCase()
    );

    return NextResponse.json({
      valid,
      records,
      expected: appHost,
      error: valid ? null : `CNAME points to ${records.join(", ")} instead of ${appHost}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "DNS lookup failed";
    return NextResponse.json({ valid: false, error: `DNS lookup failed: ${message}` });
  }
}
