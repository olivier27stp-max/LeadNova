import { google } from "googleapis";
import nodemailer from "nodemailer";
import { prisma } from "./db";
import { encrypt, decrypt, isEncrypted } from "./crypto";

// ─── Types ───────────────────────────────────────────────

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email: string;
}

// ─── OAuth2 Client ───────────────────────────────────────

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const appUrl = process.env.APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectUri = `${appUrl}/api/auth/gmail/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID et GOOGLE_OAUTH_CLIENT_SECRET requis");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ─── Auth URL & Token Exchange ───────────────────────────

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getGmailAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeGmailCode(code: string): Promise<GmailTokens> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Impossible d'obtenir les tokens Gmail");
  }

  // Get the user's email
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
    email: data.email || "",
  };
}

// ─── Token Storage ───────────────────────────────────────

export async function saveGmailTokens(workspaceId: string, tokens: GmailTokens): Promise<void> {
  const record = await prisma.appSettings.findUnique({ where: { workspaceId } });
  const data = (record?.data || {}) as Record<string, unknown>;
  const emailSettings = (data.email || {}) as Record<string, unknown>;

  emailSettings.provider = "gmail_oauth";
  emailSettings.gmailTokens = encrypt(JSON.stringify(tokens));
  emailSettings.gmailConnectedEmail = tokens.email;
  emailSettings.gmailConnectedAt = new Date().toISOString();

  data.email = emailSettings;

  await prisma.appSettings.upsert({
    where: { workspaceId },
    update: { data: data as never },
    create: { workspaceId, data: data as never },
  });
}

export async function loadGmailTokens(workspaceId: string): Promise<GmailTokens | null> {
  const record = await prisma.appSettings.findUnique({ where: { workspaceId } });
  const data = (record?.data || {}) as Record<string, unknown>;
  const emailSettings = (data.email || {}) as Record<string, unknown>;

  const raw = emailSettings.gmailTokens as string | undefined;
  if (!raw) return null;

  try {
    const decrypted = isEncrypted(raw) ? decrypt(raw) : raw;
    return JSON.parse(decrypted) as GmailTokens;
  } catch {
    return null;
  }
}

export async function clearGmailTokens(workspaceId: string): Promise<void> {
  const record = await prisma.appSettings.findUnique({ where: { workspaceId } });
  if (!record) return;

  const data = (record.data || {}) as Record<string, unknown>;
  const emailSettings = (data.email || {}) as Record<string, unknown>;

  delete emailSettings.gmailTokens;
  delete emailSettings.gmailConnectedEmail;
  delete emailSettings.gmailConnectedAt;
  emailSettings.provider = "gmail";

  data.email = emailSettings;

  await prisma.appSettings.update({
    where: { workspaceId },
    data: { data: data as never },
  });
}

// ─── Authenticated Client ────────────────────────────────

async function getAuthenticatedClient(workspaceId: string) {
  const tokens = await loadGmailTokens(workspaceId);
  if (!tokens) throw new Error("Gmail non connecté");

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Auto-refresh if expired
  if (tokens.expiry_date < Date.now() + 60_000) {
    const { credentials } = await client.refreshAccessToken();
    const updated: GmailTokens = {
      ...tokens,
      access_token: credentials.access_token || tokens.access_token,
      expiry_date: credentials.expiry_date || Date.now() + 3600 * 1000,
    };
    await saveGmailTokens(workspaceId, updated);
    client.setCredentials(credentials);
  }

  return client;
}

// ─── Send via Gmail API ──────────────────────────────────

export async function sendViaGmailApi(
  workspaceId: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  from: string,
  replyTo?: string,
  unsubscribeUrl?: string,
  logoAttachment?: { filename: string; content: Buffer; contentType: string; cid: string }
): Promise<{ gmailMessageId: string }> {
  const client = await getAuthenticatedClient(workspaceId);
  const gmail = google.gmail({ version: "v1", auth: client });

  // Build MIME message using nodemailer as MIME builder (streamTransport)
  const transporter = nodemailer.createTransport({ streamTransport: true });

  const mailOptions: Record<string, unknown> = {
    from,
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(unsubscribeUrl ? {
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    } : {}),
  };

  if (logoAttachment) {
    mailOptions.attachments = [{
      filename: logoAttachment.filename,
      content: logoAttachment.content,
      contentType: logoAttachment.contentType,
      cid: logoAttachment.cid,
    }];
  }

  const info = await transporter.sendMail(mailOptions);
  const rawMessage = (info as { message: Buffer }).message;

  // Base64url encode the raw MIME message
  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return { gmailMessageId: response.data.id || "" };
}

// ─── Poll for Bounces & Replies ──────────────────────────

export async function pollGmailForUpdates(workspaceId: string): Promise<{ replies: number; bounces: number }> {
  const client = await getAuthenticatedClient(workspaceId);
  const gmail = google.gmail({ version: "v1", auth: client });

  let replies = 0;
  let bounces = 0;

  // --- 1. Detect replies (inbox messages that are replies to our sent emails) ---
  const replyResults = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox is:unread newer_than:1h",
    maxResults: 50,
  });

  const replyMessages = replyResults.data.messages || [];

  for (const msg of replyMessages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["In-Reply-To", "References", "From"],
    });

    const headers = full.data.payload?.headers || [];
    const inReplyTo = headers.find((h) => h.name === "In-Reply-To")?.value;
    const references = headers.find((h) => h.name === "References")?.value;
    const fromHeader = headers.find((h) => h.name === "From")?.value || "";

    // Extract the Gmail message ID from In-Reply-To or References
    // Gmail wraps message IDs in angle brackets: <CABx...@mail.gmail.com>
    const refIds: string[] = [];
    if (inReplyTo) refIds.push(inReplyTo);
    if (references) refIds.push(...references.split(/\s+/));

    // Try to match against our sent emails by gmailMessageId
    // Gmail's In-Reply-To typically contains the Message-ID header, not the API message ID
    // We need to match by the sender's email (the prospect who replied)
    const senderEmail = fromHeader.match(/<(.+)>/)?.[1] || fromHeader;

    // Find an activity where we sent to this email and haven't marked reply yet
    const activity = await prisma.emailActivity.findFirst({
      where: {
        replyReceived: false,
        prospect: { email: senderEmail },
      },
      orderBy: { sentAt: "desc" },
      include: { prospect: { select: { id: true, status: true } } },
    });

    if (activity) {
      await prisma.emailActivity.update({
        where: { id: activity.id },
        data: { replyReceived: true },
      });

      // Update prospect status to REPLIED if not already beyond that
      if (activity.prospect.status !== "QUALIFIED") {
        await prisma.prospect.update({
          where: { id: activity.prospect.id },
          data: { status: "REPLIED" },
        });
      }

      // Auto-add to funnel "New Replies" stage
      try {
        const defaultStage = await prisma.funnelStage.findFirst({
          where: { workspaceId, isDefault: true },
        });
        if (defaultStage) {
          const existing = await prisma.funnelProspect.findUnique({
            where: { prospectId: activity.prospect.id },
          });
          if (existing) {
            await prisma.funnelProspect.update({
              where: { id: existing.id },
              data: { stageId: defaultStage.id, sortOrder: 0 },
            });
          } else {
            await prisma.funnelProspect.create({
              data: { stageId: defaultStage.id, prospectId: activity.prospect.id, sortOrder: 0 },
            });
          }
        }
      } catch (funnelErr) {
        console.error("[gmail] Failed to add prospect to funnel:", funnelErr);
      }

      replies++;
    }
  }

  // --- 2. Detect bounces (from mailer-daemon) ---
  const bounceResults = await gmail.users.messages.list({
    userId: "me",
    q: "from:mailer-daemon newer_than:1h",
    maxResults: 50,
  });

  const bounceMessages = bounceResults.data.messages || [];

  for (const msg of bounceMessages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    // Extract the bounced recipient email from the body
    const body = full.data.snippet || "";
    const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (!emailMatch) continue;

    const bouncedEmail = emailMatch[1].toLowerCase();

    // Find the most recent non-bounced activity sent to this email
    const activity = await prisma.emailActivity.findFirst({
      where: {
        bounce: false,
        prospect: { email: bouncedEmail },
      },
      orderBy: { sentAt: "desc" },
    });

    if (activity) {
      await prisma.emailActivity.update({
        where: { id: activity.id },
        data: { bounce: true },
      });
      // Auto-blacklist bounced email to prevent future sends
      try {
        await prisma.blacklist.upsert({
          where: { workspaceId_email: { workspaceId, email: bouncedEmail } },
          update: { reason: "hard_bounce" },
          create: { email: bouncedEmail, reason: "hard_bounce", workspaceId },
        });
      } catch {
        // Ignore if already blacklisted
      }
      // Update prospect status
      await prisma.prospect.updateMany({
        where: { email: bouncedEmail, status: { notIn: ["REPLIED", "QUALIFIED"] } },
        data: { status: "BOUNCED", emailStatus: "invalid" },
      });
      bounces++;
    }
  }

  return { replies, bounces };
}
