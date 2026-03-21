import cron from "node-cron";
import { processScheduledEmails } from "./process-scheduled-emails";
import { processAutoFollowUps } from "./process-scheduled-emails";

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
  });

  // Auto follow-ups — every hour at :30
  cron.schedule("30 * * * *", async () => {
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
  });

  console.log("[scheduler] Démarré — emails planifiés (1min) + relances auto (1h)");
}
