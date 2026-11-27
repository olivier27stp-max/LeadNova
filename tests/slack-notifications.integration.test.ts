/**
 * Intégration (Prisma simulé en mémoire, Slack simulé) :
 * réponse reçue → classée positive → prospect déplacé → 1 seul appel Slack ; idempotence ;
 * « non merci » ; désactivation après 5 échecs ; ajout manuel ; isolation et autorisation entre workspaces.
 * Run with: npx tsx tests/slack-notifications.integration.test.ts
 */
import assert from "node:assert/strict";
import { test, run } from "./helpers/harness";
import { installFakePrisma } from "./helpers/fake-prisma";
import { recordReplyClassification } from "../src/lib/reply-classifier";
import {
  enqueueManualPositiveNotification,
  isWorkspaceAdmin,
  processSlackQueue,
  readSlackSettings,
  updateSlackSettings,
} from "../src/lib/slack-notifications";
import { encrypt } from "../src/lib/crypto";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.APP_URL = "https://app.leadnova.test";
delete process.env.ANTHROPIC_API_KEY;

const db = installFakePrisma();
const WEBHOOK_A = "https://hooks.slack.com/services/TA/BA/secretA0000";
const WEBHOOK_B = "https://hooks.slack.com/services/TB/BB/secretB0000";

function reset() {
  for (const k of Object.keys(db._tables)) delete db._tables[k];
  const T = db._tables;
  T.workspaceMember = [
    { id: "m1", workspaceId: "wsA", userId: "adminA", role: "OWNER" },
    { id: "m2", workspaceId: "wsA", userId: "memberA", role: "MEMBER" },
    { id: "m3", workspaceId: "wsB", userId: "adminB", role: "ADMIN" },
  ];
  T.appSettings = [
    { id: "s1", workspaceId: "wsA", data: { email: { smtpUser: "olivier@lume.ca" } } },
    { id: "s2", workspaceId: "wsB", data: { slack: { enabled: true, webhookUrl: encrypt(WEBHOOK_B), threshold: 0.5 } } },
  ];
  T.prospect = [
    { id: "p1", workspaceId: "wsA", companyName: "Gestion JT", ownerName: "Jean Tremblay", email: "jean@gestionjt.ca", salesStage: null, status: "CONTACTED" },
    { id: "p2", workspaceId: "wsA", companyName: "Immeubles Roy", ownerName: null, email: "info@roy.ca", salesStage: "DEMO_BOOKED", status: "CONTACTED" },
  ];
  T.campaign = [{ id: "c1", workspaceId: "wsA", name: "Gestionnaires Montréal" }];
  T.emailAccount = [{ id: "acc1", workspaceId: "wsA", email: "olivier@envoi-lume.ca" }];
  T.emailActivity = [
    { id: "a1", prospectId: "p1", campaignId: "c1", emailAccountId: "acc1", sentAt: new Date("2026-11-20"), replyReceived: true, bounce: false, unsubscribed: false },
    { id: "a1b", prospectId: "p1", campaignId: "c1", emailAccountId: "acc1", sentAt: new Date("2026-11-23"), replyReceived: true, bounce: false, unsubscribed: false },
    { id: "a2", prospectId: "p2", campaignId: "c1", emailAccountId: null, sentAt: new Date("2026-11-21"), replyReceived: true, bounce: false, unsubscribed: false },
  ];
}

async function enableSlackA(extra: Record<string, unknown> = {}) {
  const r = await updateSlackSettings("wsA", { enabled: true, webhookUrl: WEBHOOK_A, ...extra }, "adminA");
  assert.equal(r.ok, true, JSON.stringify(r));
}

function slackFetch(status = 200) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    return new Response(status === 200 ? "ok" : "no_service", { status });
  }) as unknown as typeof fetch;
  return { calls, deps: { fetchImpl, sleep: async () => {} } };
}

const positiveAi = async () => ({ category: "positive" as const, confidence: 0.92, reason: "Veut un appel" });

// ─── Parcours principal ──────────────────────────────────

test("réponse positive → prospect dans « Réponse positive » → 1 seul appel Slack", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a1", "p1", "Oui appelez-moi demain\n\nLe 20 nov. 2026, Olivier a écrit :\n> Bonjour", "wsA", { messageId: "<m1@gestionjt.ca>" }, positiveAi);

  const p1 = db._tables.prospect.find((p) => p.id === "p1")!;
  assert.equal(p1.salesStage, "POSITIVE_REPLY");
  assert.equal(p1.lastReplySentiment, "positive");
  const a1 = db._tables.emailActivity.find((a) => a.id === "a1")!;
  assert.equal(a1.replySentiment, "positive");
  assert.equal(a1.replyConfidence, 0.92);

  const slack = slackFetch();
  const out = await processSlackQueue(slack.deps);
  assert.deepEqual(out, { sent: 1, failed: 0, skipped: 0 });
  assert.equal(slack.calls.length, 1);
  assert.equal(slack.calls[0].url, WEBHOOK_A);
  const body = slack.calls[0].body;
  for (const s of ["🟢 Réponse positive", "Jean Tremblay", "Gestion JT", "jean@gestionjt.ca", "Gestionnaires Montréal", "olivier@envoi-lume.ca", "Oui appelez-moi demain", "Confiance : 92 %", "https://app.leadnova.test/prospects?open=p1"]) {
    assert.ok(body.includes(s), `manque : ${s}`);
  }
  assert.equal(body.includes("Bonjour"), false, "le texte cité ne doit pas partir");

  // L'extrait n'est pas conservé après l'envoi
  const n = db._tables.slackNotification[0];
  assert.equal(n.status, "SENT");
  assert.deepEqual(n.payload, {});

  // Rien de plus au tour suivant
  const again = await processSlackQueue(slack.deps);
  assert.equal(again.sent, 0);
  assert.equal(slack.calls.length, 1);
});

test("idempotence : même Message-ID rapproché de 2 envois → 1 seule notification", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", { messageId: "<m1@gestionjt.ca>" }, positiveAi);
  await recordReplyClassification("a1b", "p1", "Oui appelez-moi", "wsA", { messageId: "<m1@gestionjt.ca>" }, positiveAi);
  await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", { messageId: "<m1@gestionjt.ca>" }, positiveAi);
  assert.equal(db._tables.slackNotification.length, 1);
  const slack = slackFetch();
  await processSlackQueue(slack.deps);
  assert.equal(slack.calls.length, 1);
});

test("sans Message-ID : clé = id de l'activité", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", {}, positiveAi);
  await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", {}, positiveAi);
  assert.equal(db._tables.slackNotification.length, 1);
  assert.equal(db._tables.slackNotification[0].dedupeKey, "reply:a1");
});

test("prospect déjà plus loin dans le pipeline : pas de recul", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a2", "p2", "Oui appelez-moi", "wsA", { messageId: "<m2@roy.ca>" }, positiveAi);
  assert.equal(db._tables.prospect.find((p) => p.id === "p2")!.salesStage, "DEMO_BOOKED");
});

test("« non merci » : jamais positif, liste noire, relances arrêtées, pas de Slack positif", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a1", "p1", "Non merci", "wsA", { messageId: "<m3@gestionjt.ca>" }, positiveAi);
  const p1 = db._tables.prospect.find((p) => p.id === "p1")!;
  assert.equal(p1.lastReplySentiment, "unsubscribe");
  assert.equal(p1.status, "NOT_INTERESTED");
  assert.equal(p1.salesStage, null);
  assert.equal(db._tables.emailActivity.find((a) => a.id === "a1")!.unsubscribed, true);
  assert.equal(db._tables.blacklist[0].email, "jean@gestionjt.ca");
  assert.equal(db._tables.slackNotification?.length ?? 0, 0);
});

test("événement « Désabonnements » coché : notification 🔕", async () => {
  reset();
  await enableSlackA({ events: { unsubscribes: true } });
  await recordReplyClassification("a1", "p1", "retirez-moi de votre liste", "wsA", { messageId: "<m4@gestionjt.ca>" });
  const slack = slackFetch();
  await processSlackQueue(slack.deps);
  assert.equal(slack.calls.length, 1);
  assert.ok(slack.calls[0].body.includes("🔕 Désabonnement"));
});

test("sous le seuil de confiance : pas de notification positive", async () => {
  reset();
  await enableSlackA({ threshold: 0.95 });
  await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", { messageId: "<m5@x>" }, positiveAi);
  assert.equal(db._tables.slackNotification?.length ?? 0, 0);
  // Le prospect avance quand même dans le pipeline
  assert.equal(db._tables.prospect.find((p) => p.id === "p1")!.salesStage, "POSITIVE_REPLY");
});

test("« Inclure un extrait » décoché : aucun contenu de réponse envoyé ni stocké", async () => {
  reset();
  await enableSlackA({ includeExcerpt: false });
  await recordReplyClassification("a1", "p1", "Oui appelez-moi au 514-555-1234", "wsA", { messageId: "<m6@x>" }, positiveAi);
  assert.equal(JSON.stringify(db._tables.slackNotification[0].payload).includes("514"), false);
  const slack = slackFetch();
  await processSlackQueue(slack.deps);
  assert.equal(slack.calls[0].body.includes("514"), false);
  assert.equal(slack.calls[0].body.includes("Extrait"), false);
});

test("Slack désactivé : rien n'est mis en file", async () => {
  reset();
  await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", { messageId: "<m7@x>" }, positiveAi);
  assert.equal(db._tables.slackNotification?.length ?? 0, 0);
});

test("une panne de Slack ne fait pas échouer l'enregistrement de la réponse", async () => {
  reset();
  await enableSlackA();
  const r = await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", { messageId: "<m8@x>" }, positiveAi);
  assert.equal(r?.category, "positive");
  const slack = slackFetch(500);
  const out = await processSlackQueue(slack.deps);
  assert.equal(out.failed, 1);
  assert.equal(slack.calls.length, 3, "3 essais");
  assert.equal(db._tables.slackNotification[0].status, "FAILED");
});

test("5 échecs consécutifs → envoi désactivé + alerte ; réactivation efface l'alerte", async () => {
  reset();
  await enableSlackA();
  const errors: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.join(" ")); };
  try {
    for (let i = 0; i < 5; i++) {
      await recordReplyClassification("a1", "p1", "Oui appelez-moi", "wsA", { messageId: `<f${i}@x>` }, positiveAi);
      await processSlackQueue(slackFetch(500).deps);
    }
  } finally {
    console.error = origErr;
  }
  const view = await readSlackSettings("wsA");
  assert.equal(view.enabled, false);
  assert.ok(view.alert?.message.includes("5 échecs"));
  assert.ok(db._tables.activityLog.some((l) => l.action === "slack_disabled" && l.type === "error"));
  // Le webhook ne doit apparaître ni dans les journaux ni dans l'alerte
  assert.equal(errors.join("\n").includes("secretA"), false);
  assert.equal(JSON.stringify(view).includes("secretA"), false);

  const re = await updateSlackSettings("wsA", { enabled: true }, "adminA");
  assert.equal(re.ok && re.settings.alert, null);
});

test("succès après des échecs : compteur remis à zéro", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a1", "p1", "Oui", "wsA", { messageId: "<s1@x>" }, positiveAi);
  await processSlackQueue(slackFetch(500).deps);
  assert.equal((await readSlackSettings("wsA")).consecutiveFailures, 1);
  await recordReplyClassification("a1", "p1", "Oui", "wsA", { messageId: "<s2@x>" }, positiveAi);
  await processSlackQueue(slackFetch(200).deps);
  assert.equal((await readSlackSettings("wsA")).consecutiveFailures, 0);
});

// ─── Ajout manuel dans « Réponse positive » ──────────────

test("glissé manuellement : 1 notification par prospect et par campagne", async () => {
  reset();
  await enableSlackA();
  assert.equal(await enqueueManualPositiveNotification({ workspaceId: "wsA", prospectId: "p1" }), true);
  assert.equal(await enqueueManualPositiveNotification({ workspaceId: "wsA", prospectId: "p1" }), false);
  const slack = slackFetch();
  await processSlackQueue(slack.deps);
  assert.equal(slack.calls.length, 1);
  assert.ok(slack.calls[0].body.includes("ajout manuel"));
});

test("glissé manuellement après une réponse positive déjà notifiée : rien de plus", async () => {
  reset();
  await enableSlackA();
  await recordReplyClassification("a1b", "p1", "Oui appelez-moi", "wsA", { messageId: "<m9@x>" }, positiveAi);
  assert.equal(await enqueueManualPositiveNotification({ workspaceId: "wsA", prospectId: "p1" }), false);
});

test("glissé manuellement : prospect d'un autre workspace ignoré", async () => {
  reset();
  await enableSlackA();
  await enqueueManualPositiveNotification({ workspaceId: "wsB", prospectId: "p1" });
  const slack = slackFetch();
  await processSlackQueue(slack.deps);
  // wsB a Slack activé, mais p1 appartient à wsA : aucune donnée de wsA ne part vers le Slack de wsB
  assert.equal(slack.calls.some((c) => c.url === WEBHOOK_B), false);
});

// ─── Paramètres : autorisation, isolation, secret ────────

test("autorisation : seul OWNER/ADMIN du workspace", async () => {
  reset();
  assert.equal(await isWorkspaceAdmin("adminA", "wsA"), true);
  assert.equal(await isWorkspaceAdmin("memberA", "wsA"), false);
  assert.equal(await isWorkspaceAdmin("adminA", "wsB"), false, "admin A ne peut pas lire/modifier wsB");
  assert.equal(await isWorkspaceAdmin("adminB", "wsA"), false, "admin B ne peut pas lire/modifier wsA");
  assert.equal(await isWorkspaceAdmin("inconnu", "wsA"), false);
});

test("isolation : modifier wsA ne touche pas wsB, et la lecture ne mélange pas", async () => {
  reset();
  await enableSlackA({ threshold: 0.8 });
  const b = await readSlackSettings("wsB");
  assert.equal(b.threshold, 0.5);
  assert.ok(b.webhookUrlMasked?.endsWith("0000") && !JSON.stringify(b).includes("secretB"));
  const a = await readSlackSettings("wsA");
  assert.equal(a.threshold, 0.8);
  const rawB = db._tables.appSettings.find((s) => s.workspaceId === "wsB")!.data as { slack: { webhookUrl: string } };
  assert.equal(rawB.slack.webhookUrl.startsWith("enc:"), true);
});

test("secret : URL chiffrée au repos, jamais renvoyée en clair", async () => {
  reset();
  await enableSlackA();
  const raw = JSON.stringify(db._tables.appSettings.find((s) => s.workspaceId === "wsA")!.data);
  assert.equal(raw.includes("secretA"), false);
  const view = await readSlackSettings("wsA");
  assert.equal(JSON.stringify(view).includes("secretA"), false);
  assert.equal(view.configured, true);
});

test("paramètres : URL non Slack refusée ; activer sans URL refusé ; défauts", async () => {
  reset();
  const bad = await updateSlackSettings("wsA", { webhookUrl: "https://evil.com/services/x" });
  assert.equal(bad.ok, false);
  const noUrl = await updateSlackSettings("wsA", { enabled: true });
  assert.equal(noUrl.ok, false);
  const v = await readSlackSettings("wsA");
  assert.deepEqual([v.enabled, v.threshold, v.events, v.includeExcerpt], [false, 0.7, { positive: true, allReplies: false, unsubscribes: false }, true]);
});

test("paramètres : sans ENCRYPTION_KEY, l'URL n'est jamais stockée en clair", async () => {
  reset();
  const key = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    const r = await updateSlackSettings("wsA", { webhookUrl: WEBHOOK_A });
    assert.equal(r.ok, false);
    assert.equal(JSON.stringify(db._tables.appSettings).includes("secretA"), false);
  } finally {
    process.env.ENCRYPTION_KEY = key;
  }
});

run("Slack : intégration, idempotence, autorisation");
