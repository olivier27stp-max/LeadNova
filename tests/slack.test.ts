/**
 * Slack : validation de l'URL (SSRF), masquage, message Block Kit, essais et Retry-After.
 * Run with: npx tsx tests/slack.test.ts
 */
import assert from "node:assert/strict";
import { test, run } from "./helpers/harness";
import {
  buildSlackMessage,
  maskWebhookUrl,
  postToSlack,
  redactWebhook,
  retryDelayMs,
  validateSlackWebhookUrl,
} from "../src/lib/slack";

const URL_OK = "https://hooks.slack.com/services/T0001/B0002/abcdefghijklmnop1234";

// ─── Validation de l'URL ─────────────────────────────────

test("accepte https://hooks.slack.com/services/…", () => {
  assert.deepEqual(validateSlackWebhookUrl(URL_OK), { ok: true, url: URL_OK });
  assert.equal(validateSlackWebhookUrl(`  ${URL_OK}  `).ok, true);
});

for (const bad of [
  "http://hooks.slack.com/services/T/B/x",
  "https://hooks.slack.com.evil.com/services/T/B/x",
  "https://evil.com/hooks.slack.com/services/T/B/x",
  "https://user:pass@hooks.slack.com/services/T/B/x",
  "https://hooks.slack.com:8443/services/T/B/x",
  "https://hooks.slack.com/api/chat.postMessage",
  "https://hooks.slack.com/services/T/B/x?redirect=http://169.254.169.254",
  "https://hooks.slack.com/services/../../admin",
  "https://169.254.169.254/latest/meta-data",
  "https://localhost/services/T/B/x",
  "javascript:alert(1)",
  "",
  null,
  42,
]) {
  test(`refuse ${JSON.stringify(bad)}`, () => {
    assert.equal(validateSlackWebhookUrl(bad).ok, false);
  });
}

test("masque l'URL (4 derniers caractères seulement)", () => {
  const m = maskWebhookUrl(URL_OK)!;
  assert.ok(m.endsWith("1234"));
  assert.ok(!m.includes("T0001") && !m.includes("abcdefgh"));
  assert.equal(maskWebhookUrl(null), null);
});

test("redactWebhook retire l'URL des messages d'erreur", () => {
  assert.equal(redactWebhook(`fetch failed for ${URL_OK}`).includes("hooks.slack.com"), false);
});

// ─── Message ─────────────────────────────────────────────

test("message positif : en-tête, champs, extrait, catégorie + confiance, bouton", () => {
  const msg = buildSlackMessage({
    event: "positive_reply",
    prospectName: "Jean Tremblay",
    companyName: "Gestion JT <inc>",
    email: "jean@gestionjt.ca",
    campaignName: "Gestionnaires Montréal",
    mailbox: "olivier@lume.ca",
    excerpt: "Oui, appelez-moi demain",
    category: "positive",
    confidence: 0.92,
    link: "https://app.leadnova.one/prospects?open=p1",
  });
  const json = JSON.stringify(msg);
  assert.equal(msg.text, "🟢 Réponse positive — Gestion JT <inc>");
  assert.equal((msg.blocks[0] as { text: { text: string } }).text.text, "🟢 Réponse positive");
  for (const s of ["Jean Tremblay", "Gestion JT &lt;inc&gt;", "jean@gestionjt.ca", "Gestionnaires Montréal", "olivier@lume.ca", "Oui, appelez-moi demain", "Catégorie : Positive", "Confiance : 92 %", "Ouvrir dans LeadNova", "https://app.leadnova.one/prospects?open=p1"]) {
    assert.ok(json.includes(s), `manque : ${s}`);
  }
});

test("sans extrait : aucun contenu de réponse dans le message", () => {
  const msg = buildSlackMessage({ event: "positive_reply", companyName: "ACME", link: "https://x.test/p", excerpt: null, category: "positive", confidence: 0.8 });
  assert.equal(JSON.stringify(msg).includes("Extrait"), false);
});

test("extrait plafonné à 300 caractères", () => {
  const msg = buildSlackMessage({ event: "reply", companyName: "ACME", link: "https://x.test/p", excerpt: "x".repeat(600) });
  const section = msg.blocks.find((b) => JSON.stringify(b).includes("Extrait")) as { text: { text: string } };
  assert.ok(section.text.text.length < 340);
});

// ─── Envoi : délai, 3 essais, backoff, Retry-After ───────

function fakeFetch(responses: Array<number | Error | { status: number; retryAfter?: string }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    const { status, retryAfter } = typeof r === "number" ? { status: r, retryAfter: undefined } : r;
    return new Response(status === 200 ? "ok" : "error", { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("succès au premier essai ; redirections refusées ; délai de 5 s", async () => {
  const f = fakeFetch([200]);
  const res = await postToSlack(URL_OK, { text: "x" }, { fetchImpl: f.impl, sleep: async () => {} });
  assert.deepEqual(res, { ok: true, attempts: 1 });
  assert.equal(f.calls[0].init.redirect, "error");
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
});

test("5xx : 3 essais avec backoff exponentiel puis échec", async () => {
  const f = fakeFetch([500, 502, 503]);
  const sleeps: number[] = [];
  const res = await postToSlack(URL_OK, {}, { fetchImpl: f.impl, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(res.ok, false);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test("429 : respecte Retry-After puis réussit", async () => {
  const f = fakeFetch([{ status: 429, retryAfter: "7" }, 200]);
  const sleeps: number[] = [];
  const res = await postToSlack(URL_OK, {}, { fetchImpl: f.impl, sleep: async (ms) => { sleeps.push(ms); } });
  assert.deepEqual(res, { ok: true, attempts: 2 });
  assert.deepEqual(sleeps, [7000]);
});

test("4xx (webhook révoqué) : pas de nouvel essai", async () => {
  const f = fakeFetch([404]);
  const res = await postToSlack(URL_OK, {}, { fetchImpl: f.impl, sleep: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(f.calls.length, 1);
});

test("délai dépassé / réseau : réessaie ; l'erreur ne contient jamais l'URL", async () => {
  const timeout = Object.assign(new Error(`timeout ${URL_OK}`), { name: "TimeoutError" });
  const f = fakeFetch([timeout, new Error(`connect ECONNREFUSED ${URL_OK}`), timeout]);
  const res = await postToSlack(URL_OK, {}, { fetchImpl: f.impl, sleep: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(f.calls.length, 3);
  assert.ok(!("error" in res) || !res.error.includes("hooks.slack.com"));
});

test("URL invalide : aucun appel réseau", async () => {
  const f = fakeFetch([200]);
  const res = await postToSlack("https://evil.com/x", {}, { fetchImpl: f.impl });
  assert.equal(res.ok, false);
  assert.equal(f.calls.length, 0);
});

test("retryDelayMs : Retry-After plafonné à 30 s, date HTTP, backoff par défaut", () => {
  assert.equal(retryDelayMs(1, "120"), 30_000);
  assert.equal(retryDelayMs(1, new Date(1_000_000 + 5000).toUTCString(), 1000, 1_000_000), 5000);
  assert.equal(retryDelayMs(3, null), 4000);
});

run("Slack : URL, message, envoi");
