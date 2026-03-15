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
  if (!apiKey) throw new Error("RESEND_API_KEY non configurée");
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
  if (!host || !user || !pass) throw new Error("SMTP non configuré");
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
  const subject = "Réinitialisation de votre mot de passe — LeadNova";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #111827;">
  <h2 style="margin: 0 0 16px;">Réinitialisation du mot de passe</h2>
  <p>Bonjour ${name},</p>
  <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en créer un nouveau :</p>
  <p style="margin: 24px 0;">
    <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Réinitialiser mon mot de passe</a>
  </p>
  <p style="font-size: 14px; color: #6b7280;">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="font-size: 12px; color: #9ca3af;">LeadNova — Plateforme de prospection B2B</p>
</body>
</html>`;
  const text = `Bonjour ${name},\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez ici: ${resetUrl}\n\nCe lien expire dans 1 heure.\n\n— LeadNova`;
  await sendSystemEmail(to, subject, html, text);
}
