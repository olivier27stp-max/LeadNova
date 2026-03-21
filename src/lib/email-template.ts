import fs from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────

export interface CompanyInfo {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  emailSignature?: string;
}

// ─── Helpers ─────────────────────────────────────────────

function getContactName(info: CompanyInfo): string {
  return info.emailSignature?.split("\n")[0]?.trim()
    || process.env.CONTACT_NAME
    || "";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps a plain-text email body in a professional HTML template.
 *
 * Signature format:
 *   Bonne journée,
 *
 *   {{contact_name}}
 *   {{company_name}}
 *   {{phone}}
 *
 *   ---
 *   {{contact_name}}
 *   {{company_name}} Inc.
 *   {{phone}} · {{website}}
 *   Canada
 *
 *   [Logo]
 *
 *   Se désabonner
 */
export function wrapInEmailTemplate(
  body: string,
  companyInfo?: CompanyInfo,
  trackingPixelUrl?: string,
  unsubscribeUrl?: string,
  logoEnabled?: boolean
): string {
  const info = companyInfo || {};
  const htmlBody = body
    .split(/\n\n+/)
    .map((para) =>
      `<p style="margin:0 0 16px 0;line-height:1.6;">${para.trim().replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");

  const contactName = getContactName(info);
  const companyName = info.name || "";
  const phone = info.phone || "";
  const website = info.website || "";
  const websiteDisplay = website.replace(/^https?:\/\//, "");
  const websiteHref = website.startsWith("http") ? website : `https://${website}`;
  const showLogo = logoEnabled !== false;

  // ── Greeting block ──
  const greetingHtml = `
          <tr>
            <td style="padding:24px 40px 0 40px;color:#374151;font-size:14px;line-height:1.8;">
              Bonne journ&eacute;e,
            </td>
          </tr>`;

  // ── Short signature (name, company, phone) ──
  const shortSigLines: string[] = [];
  if (contactName) shortSigLines.push(`<strong style="color:#111827;">${escapeHtml(contactName)}</strong>`);
  if (companyName) shortSigLines.push(`<span style="color:#6b7280;">${escapeHtml(companyName)}</span>`);
  if (phone) shortSigLines.push(`<a href="tel:${escapeHtml(phone)}" style="color:#374151;text-decoration:none;">${escapeHtml(phone)}</a>`);

  const shortSigHtml = shortSigLines.length > 0
    ? `
          <tr>
            <td style="padding:8px 40px 0 40px;color:#374151;font-size:14px;line-height:1.8;">
              ${shortSigLines.join("<br>")}
            </td>
          </tr>`
    : "";

  // ── Divider ──
  const dividerHtml = `
          <tr>
            <td style="padding:20px 40px 0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>`;

  // ── Full signature block (contact card) ──
  const fullSigLines: string[] = [];
  if (contactName) fullSigLines.push(`<strong style="color:#111827;font-size:13px;">${escapeHtml(contactName)}</strong>`);
  if (companyName) fullSigLines.push(`<span style="color:#6b7280;font-size:13px;">${escapeHtml(companyName)} Inc.</span>`);

  // Phone · Website on same line
  const contactParts: string[] = [];
  if (phone) contactParts.push(`<a href="tel:${escapeHtml(phone)}" style="color:#374151;text-decoration:none;font-size:12px;">${escapeHtml(phone)}</a>`);
  if (website) contactParts.push(`<a href="${escapeHtml(websiteHref)}" style="color:#2563eb;text-decoration:none;font-size:12px;">${escapeHtml(websiteDisplay)}</a>`);
  if (contactParts.length > 0) fullSigLines.push(contactParts.join(` <span style="color:#d1d5db;"> &middot; </span> `));

  // Country
  const country = info.country || "Canada";
  fullSigLines.push(`<span style="color:#9ca3af;font-size:12px;">${escapeHtml(country)}</span>`);

  const fullSigHtml = fullSigLines.length > 0
    ? `
          <tr>
            <td style="padding:16px 40px 0 40px;color:#374151;font-size:13px;line-height:1.8;">
              ${fullSigLines.join("<br>")}
            </td>
          </tr>`
    : "";

  // ── Logo block ──
  const logoHtml = showLogo ? `
          <tr>
            <td style="padding:16px 40px 0 40px;text-align:center;">
              <img
                src="cid:company-logo"
                alt="${escapeHtml(companyName || "Logo")}"
                width="140"
                style="display:inline-block;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;"
              />
            </td>
          </tr>` : "";

  // ── Unsubscribe ──
  const unsubHtml = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;font-size:11px;">Se d&eacute;sabonner</a>`
    : `<a href="mailto:${escapeHtml(info.email || "")}?subject=D%C3%89SABONNER" style="color:#9ca3af;text-decoration:underline;font-size:11px;">Se d&eacute;sabonner</a>`;

  // ── Tracking pixel ──
  const pixelHtml = trackingPixelUrl
    ? `<img src="${escapeHtml(trackingPixelUrl)}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    @media (prefers-color-scheme: dark) {
      .email-card { background-color: #1f2937 !important; }
      .email-body { color: #f3f4f6 !important; }
    }
    @media only screen and (max-width: 620px) {
      .email-card { width: 100% !important; border-radius: 0 !important; }
      .email-cell { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email card -->
        <table class="email-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Body -->
          <tr>
            <td class="email-cell email-body" style="padding:40px 40px 16px 40px;color:#1a1a1a;font-size:15px;">
              ${htmlBody}
            </td>
          </tr>

          <!-- Greeting -->
          ${greetingHtml}

          <!-- Short signature -->
          ${shortSigHtml}

          <!-- Divider -->
          ${dividerHtml}

          <!-- Full signature card -->
          ${fullSigHtml}

          <!-- Logo -->
          ${logoHtml}

          <!-- Unsubscribe -->
          <tr>
            <td style="padding:24px 40px 32px 40px;text-align:center;">
              ${unsubHtml}
              ${pixelHtml}
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Returns the logo as a nodemailer inline attachment (CID).
 * Uses logoUrl from settings if provided (local path in /public), falls back to default logo.
 */
export function getLogoAttachment(logoUrl?: string): object | null {
  try {
    const logoPath = resolveLogoPath(logoUrl);
    if (!fs.existsSync(logoPath)) return null;
    const ext = path.extname(logoPath).slice(1) || "png";
    return {
      filename: `logo.${ext}`,
      path: logoPath,
      cid: "company-logo",
    };
  } catch {
    return null;
  }
}

/**
 * Returns the logo as a base64 data URI string for embedding directly in HTML.
 * Used by providers that don't support CID attachments (e.g. Resend).
 */
export function getLogoBase64DataUri(logoUrl?: string): string | null {
  try {
    const logoPath = resolveLogoPath(logoUrl);
    if (!fs.existsSync(logoPath)) return null;
    const ext = path.extname(logoPath).slice(1) || "png";
    const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
    const data = fs.readFileSync(logoPath).toString("base64");
    return `data:${mime};base64,${data}`;
  } catch {
    return null;
  }
}

function resolveLogoPath(logoUrl?: string): string {
  if (logoUrl && logoUrl.startsWith("/") && !logoUrl.startsWith("//")) {
    return path.join(process.cwd(), "public", logoUrl.slice(1));
  }
  return path.join(process.cwd(), "public", "leadnova-logo.png");
}

/**
 * Plain-text fallback footer.
 * Matches the HTML signature structure.
 */
export function getTextFooter(companyInfo?: CompanyInfo, unsubscribeUrl?: string): string {
  const info = companyInfo || {};
  const contactName = getContactName(info);
  const companyName = info.name || "";
  const phone = info.phone || "";
  const website = info.website?.replace(/^https?:\/\//, "") || "";
  const country = info.country || "Canada";

  const unsub = unsubscribeUrl
    ? `Se désabonner: ${unsubscribeUrl}`
    : "";

  // Short signature
  const shortLines: string[] = [];
  shortLines.push("Bonne journée,");
  shortLines.push("");
  if (contactName) shortLines.push(contactName);
  if (companyName) shortLines.push(companyName);
  if (phone) shortLines.push(phone);

  // Full signature
  const fullLines: string[] = [];
  fullLines.push("---");
  if (contactName) fullLines.push(contactName);
  if (companyName) fullLines.push(`${companyName} Inc.`);
  const contactParts: string[] = [];
  if (phone) contactParts.push(phone);
  if (website) contactParts.push(website);
  if (contactParts.length > 0) fullLines.push(contactParts.join(" · "));
  fullLines.push(country);

  const sig = `\n\n${shortLines.join("\n")}\n\n${fullLines.join("\n")}`;
  return unsub ? `${sig}\n\n${unsub}` : sig;
}
