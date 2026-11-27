import cron from "node-cron";
import { processScheduledEmails } from "./process-scheduled-emails";
import { processAutoFollowUps } from "./process-scheduled-emails";
import { pollImapForUpdates } from "./imap-poller";
import { processSlackQueue } from "./slack-notifications";
import { prisma } from "./db";
import { QUEBEC_TZ } from "./quebec-time";

// Toutes les tâches suivent l'heure du Québec (le serveur Railway tourne en UTC)
const CRON_OPTIONS = { timezone: QUEBEC_TZ };

const globalForCron = globalThis as unknown as { _cronStarted?: boolean };

export function startScheduler() {
  if (globalForCron._cronStarted) return;
  globalForCron._cronStarted = true;

  // Scheduled emails — every minute
  cron.schedule("* * * * *", async () => {
    try {
      const result = await processScheduledEmails();
      if (result.processed > 0) {
        console.log(`[scheduler] ${result.processed} email(s) planifié(s) envoyé(s)`);
      }
    } catch (err) {
      console.error("[scheduler] Erreur emails planifiés:", err);
    }
  }, CRON_OPTIONS);

  // Auto follow-ups — every 2 hours at :30
  cron.schedule("30 */2 * * *", async () => {
    try {
      const result = await processAutoFollowUps();
      if (result.sent > 0) {
        console.log(`[scheduler] ${result.sent} relance(s) auto envoyée(s)`);
      }
      if (result.errors.length > 0) {
        console.warn(`[scheduler] Erreurs relances:`, result.errors);
      }
    } catch (err) {
      console.error("[scheduler] Erreur relances auto:", err);
    }
  }, CRON_OPTIONS);

  // IMAP polling for replies & bounces — every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const allSettings = await prisma.appSettings.findMany({
        where: { workspaceId: { not: null } },
        select: { workspaceId: true, data: true },
      });

      for (const setting of allSettings) {
        if (!setting.workspaceId) continue;
        const data = setting.data as Record<string, unknown>;
        const emailSettings = (data?.email || {}) as Record<string, string>;
        if (emailSettings.provider === "gmail_oauth") continue;
        if (!emailSettings.smtpHost && !emailSettings.imapHost) continue;

        try {
          const result = await pollImapForUpdates(setting.workspaceId);
          if (result.replies > 0 || result.bounces > 0) {
            console.log(`[scheduler] IMAP: ${result.replies} réponse(s), ${result.bounces} bounce(s)`);
          }
        } catch (err) {
          console.error("[scheduler] Erreur IMAP:", err);
        }
      }
    } catch (err) {
      console.error("[scheduler] Erreur IMAP polling:", err);
    }
  }, CRON_OPTIONS);

  // Notifications Slack en file — chaque minute, hors de la sync IMAP (une erreur n'y remonte jamais)
  cron.schedule("* * * * *", async () => {
    try {
      const result = await processSlackQueue();
      if (result.sent > 0 || result.failed > 0) {
        console.log(`[scheduler] Slack : ${result.sent} envoyée(s), ${result.failed} échec(s)`);
      }
    } catch (err) {
      console.error("[scheduler] Erreur notifications Slack:", err instanceof Error ? err.message : err);
    }
  }, CRON_OPTIONS);

  console.log("[scheduler] Démarré — emails (1min) + relances (2h) + IMAP (5min) + Slack (1min)");
}
