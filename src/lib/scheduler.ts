import cron from "node-cron";
import { processScheduledEmails } from "./process-scheduled-emails";

const globalForCron = globalThis as unknown as { _cronStarted?: boolean };

export function startScheduler() {
  if (globalForCron._cronStarted) return;
  globalForCron._cronStarted = true;

  // Run every minute
  cron.schedule("* * * * *", async () => {
    try {
      const result = await processScheduledEmails();
      if (result.processed > 0) {
        console.log(`[scheduler] ${result.processed} email(s) planifié(s) envoyé(s)`);
      }
    } catch (err) {
      console.error("[scheduler] Erreur:", err);
    }
  });

  console.log("[scheduler] Démarré — vérification des emails planifiés toutes les minutes");
}
