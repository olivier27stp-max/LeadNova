import { Resend } from "resend";
import nodemailer from "nodemailer";

/**
 * System email sender for transactional emails (password reset, invitations, etc.)
 * Uses platform-level credentials, NOT user/workspace settings.
 */

const platformFrom = process.env.PLATFORM_FROM_EMAIL || "noreply@leadnova.one";
const platformFromName = process.env.PLATFORM_FROM_NAME || "LeadNova";

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY non configuree");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: `"${platformFromName}" <${platformFrom}>`,
    to,
    subject,
    html,
    text,
  });
}

async function sendViaSmtp(to: string, subject: string, html: string, text: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP non configure");
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"${platformFromName}" <${platformFrom}>`,
    to, subject, html, text,
  });
}

async function sendSystemEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(to, subject, html, text);
  } else {
    await sendViaSmtp(to, subject, html, text);
  }
}

export async function sendResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
  const subject = "Reinitialisation de votre mot de passe — LeadNova";
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reinitialisation du mot de passe</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <span style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #111827;">Lead</span><span style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; background: linear-gradient(to right, #2563eb, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Nova</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
              <!-- Header accent bar -->
              <div style="height: 4px; background: linear-gradient(to right, #2563eb, #7c3aed);"></div>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding: 32px 32px 0;">
                    <!-- Lock icon -->
                    <div style="width: 48px; height: 48px; background-color: #ede9fe; border-radius: 12px; margin: 0 auto 20px; text-align: center; line-height: 48px;">
                      <span style="font-size: 22px;">&#128274;</span>
                    </div>

                    <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #111827; text-align: center;">
                      Reinitialisation du mot de passe
                    </h1>
                    <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; text-align: center; line-height: 1.5;">
                      Une demande de reinitialisation a ete effectuee pour votre compte.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 0 32px;">
                    <p style="margin: 0 0 4px; font-size: 15px; color: #374151; line-height: 1.6;">
                      Bonjour <strong>${name}</strong>,
                    </p>
                    <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      Cliquez sur le bouton ci-dessous pour creer un nouveau mot de passe. Ce lien est valide pendant <strong>1 heure</strong> et ne peut etre utilise qu'une seule fois.
                    </p>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td align="center" style="padding: 0 32px 24px;">
                    <a href="${resetUrl}"
                       style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; letter-spacing: 0.2px; box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);">
                      Reinitialiser mon mot de passe
                    </a>
                  </td>
                </tr>

                <!-- Fallback URL -->
                <tr>
                  <td style="padding: 0 32px 24px;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
                      Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
                    </p>
                    <p style="margin: 4px 0 0; font-size: 11px; color: #6b7280; word-break: break-all; line-height: 1.5;">
                      <a href="${resetUrl}" style="color: #4f46e5; text-decoration: underline;">${resetUrl}</a>
                    </p>
                  </td>
                </tr>

                <!-- Security notice -->
                <tr>
                  <td style="padding: 0 32px 32px;">
                    <div style="background-color: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px;">
                      <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.5;">
                        <strong>&#9888;&#65039; Note de securite :</strong> Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email en toute securite. Votre mot de passe restera inchange.
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 16px; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #9ca3af;">
                LeadNova — Plateforme de prospection B2B
              </p>
              <p style="margin: 0; font-size: 11px; color: #d1d5db;">
                &copy; ${year} LeadNova. Tous droits reserves.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Bonjour ${name},

Vous avez demande la reinitialisation de votre mot de passe LeadNova.

Cliquez ici pour reinitialiser votre mot de passe :
${resetUrl}

Ce lien expire dans 1 heure et ne peut etre utilise qu'une seule fois.

Si vous n'etes pas a l'origine de cette demande, ignorez cet email.

— LeadNova`;

  await sendSystemEmail(to, subject, html, text);
}
