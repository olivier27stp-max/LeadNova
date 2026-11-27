/** Mini-harnais de test (pas de framework dans le projet) : npx tsx tests/<fichier>.test.ts */
const queue: Array<{ name: string; fn: () => unknown | Promise<unknown> }> = [];

export function test(name: string, fn: () => unknown | Promise<unknown>) {
  queue.push({ name, fn });
}

export async function run(title: string) {
  let passed = 0;
  let failed = 0;
  console.log(`\n${title}\n${"─".repeat(50)}`);
  for (const t of queue) {
    try {
      await t.fn();
      passed++;
      console.log(`✅ ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`❌ ${t.name}\n   ${err instanceof Error ? err.message.split("\n").join("\n   ") : err}`);
    }
  }
  console.log(`${"─".repeat(50)}\nRésultats : ${passed} réussi(s), ${failed} échec(s)`);
  if (failed > 0) process.exit(1);
}
