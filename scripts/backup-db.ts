/**
 * Backup script — exports all prospect data to a JSON file.
 * Run: npx tsx scripts/backup-db.ts
 *
 * Creates timestamped backups in /backups folder.
 */
import { prisma } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const backupDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = path.join(backupDir, `backup-${timestamp}.json`);

  console.log("Exporting data...");

  const [prospects, campaigns, campaignContacts, emailActivity, blacklist, activityLogs, emailTemplates, appSettings] = await Promise.all([
    prisma.$queryRawUnsafe("SELECT * FROM prospects"),
    prisma.$queryRawUnsafe("SELECT * FROM campaigns"),
    prisma.$queryRawUnsafe("SELECT * FROM campaign_contacts"),
    prisma.$queryRawUnsafe("SELECT * FROM email_activity"),
    prisma.$queryRawUnsafe("SELECT * FROM blacklist"),
    prisma.$queryRawUnsafe("SELECT * FROM activity_logs"),
    prisma.$queryRawUnsafe("SELECT * FROM email_templates"),
    prisma.$queryRawUnsafe("SELECT * FROM app_settings"),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    counts: {
      prospects: (prospects as any[]).length,
      campaigns: (campaigns as any[]).length,
      campaignContacts: (campaignContacts as any[]).length,
      emailActivity: (emailActivity as any[]).length,
      blacklist: (blacklist as any[]).length,
      activityLogs: (activityLogs as any[]).length,
      emailTemplates: (emailTemplates as any[]).length,
      appSettings: (appSettings as any[]).length,
    },
    prospects,
    campaigns,
    campaignContacts,
    emailActivity,
    blacklist,
    activityLogs,
    emailTemplates,
    appSettings,
  };

  const json = JSON.stringify(data, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2);
  fs.writeFileSync(filename, json);

  console.log(`\nBackup saved: ${filename}`);
  console.log("Counts:", JSON.stringify(data.counts));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Backup failed:", e.message);
  process.exit(1);
});
