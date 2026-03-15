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

function buildAddressLine(info: CompanyInfo): string {
  const parts = [info.address, info.city, info.province, info.postalCode, info.country].filter(Boolean);
  return parts.join(", ");
}

function getContactName(info: CompanyInfo): string {
  // Use the name part before the company name, or fall back
  return info.emailSignature?.split("\n")[0]?.trim()
    || process.env.CONTACT_NAME
    || "L'équipe";
}

/**
 * Wraps a plain-text email body in a branded HTML template for LeadNova.
 * Compatible with Gmail, Outlook, Apple Mail, and all major clients.
 * Uses CID inline attachment for the logo image.
 *
 * @param body - Plain text email body
 * @param companyInfo - Company settings from DB (source of truth)
 * @param trackingPixelUrl - Optional tracking pixel URL
 * @param unsubscribeUrl - Optional unsubscribe URL
 */
export function wrapInEmailTemplate(
  body: string,
  companyInfo?: CompanyInfo,
  trackingPixelUrl?: string,
  unsubscribeUrl?: string
): string {
  const info = companyInfo || {};
  const htmlBody = body
    .split(/\n\n+/)
    .map((para) =>
      `<p style="margin:0 0 16px 0;line-height:1.6;">${para.trim().replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");

  const companyName = info.name || process.env.COMPANY_NAME || "LeadNova";
  const phone = info.phone || process.env.COMPANY_PHONE || "";
  const website = info.website || process.env.COMPANY_WEBSITE || "";
  const contactName = getContactName(info);
  const addressLine = buildAddressLine(info);

  // Build signature lines
  const phoneLine = phone
    ? `<a href="tel:${phone}" style="color:#2563eb;text-decoration:none;">${phone}</a>`
    : "";
  const websiteLine = website
    ? `<a href="${website.startsWith("http") ? website : `https://${website}`}" style="color:#2563eb;text-decoration:none;">${website.replace(/^https?:\/\//, "")}</a>`
    : "";
  const contactLine = [phoneLine, websiteLine].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const addressHtml = addressLine
    ? `<br><span style="color:#9ca3af;font-size:12px;">${addressLine}</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px 40px;color:#1a1a1a;font-size:15px;">
              ${htmlBody}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:24px 40px 0 40px;color:#374151;font-size:14px;line-height:1.6;">
              <strong style="color:#111827;">${contactName}</strong><br>
              <span style="color:#6b7280;">${companyName}</span><br>
              ${contactLine}${addressHtml}
            </td>
          </tr>

          <!-- Logo footer -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#000000;border-radius:6px;overflow:hidden;">
                <tr>
                  <td align="center" style="padding:20px 24px;">
                    <img
                      src="cid:leadnova-logo"
                      alt="LeadNova"
                      width="160"
                      height="160"
                      style="display:block;border:0;outline:none;text-decoration:none;width:160px;height:160px;object-fit:contain;"
                    />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Unsubscribe -->
          <tr>
            <td style="padding:16px 40px 32px 40px;text-align:center;color:#9ca3af;font-size:11px;">
              ${unsubscribeUrl
                ? `<a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Se désabonner</a>`
                : `Pour vous désabonner, répondez avec « DÉSABONNER » dans le sujet.`}
              ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />` : ""}
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
    let logoPath: string;
    if (logoUrl && logoUrl.startsWith("/") && !logoUrl.startsWith("//")) {
      logoPath = path.join(process.cwd(), "public", logoUrl.slice(1));
    } else {
      logoPath = path.join(process.cwd(), "public", "leadnova-logo.png");
    }
    if (!fs.existsSync(logoPath)) return null;
    const ext = path.extname(logoPath).slice(1) || "png";
    return {
      filename: `logo.${ext}`,
      path: logoPath,
      cid: "leadnova-logo",
    };
  } catch {
    return null;
  }
}

/**
 * Plain-text fallback footer (for clients that don't render HTML).
 * Uses company settings from DB as source of truth.
 */
export function getTextFooter(companyInfo?: CompanyInfo, unsubscribeUrl?: string): string {
  const info = companyInfo || {};
  const companyName = info.name || process.env.COMPANY_NAME || "LeadNova";
  const phone = info.phone || process.env.COMPANY_PHONE || "";
  const website = info.website || process.env.COMPANY_WEBSITE || "";
  const contactName = getContactName(info);
  const addressLine = buildAddressLine(info);

  const contactLine = [phone, website].filter(Boolean).join(" | ");
  const unsub = unsubscribeUrl
    ? `Se désabonner: ${unsubscribeUrl}`
    : `Pour vous désabonner, répondez avec "DÉSABONNER" dans le sujet.`;

  const parts = [`\n\n--\n${contactName}\n${companyName}`];
  if (contactLine) parts.push(contactLine);
  if (addressLine) parts.push(addressLine);
  parts.push(`\n${unsub}`);

  return parts.join("\n");
}
