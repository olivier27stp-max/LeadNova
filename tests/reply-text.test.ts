/**
 * Nettoyage du texte cité/signatures et classement des réponses (mots-clés + IA simulée).
 * Run with: npx tsx tests/reply-text.test.ts
 */
import assert from "node:assert/strict";
import { test, run } from "./helpers/harness";
import { classifyByKeywords, cleanReplyText, replyExcerpt, extractMessageBody } from "../src/lib/reply-text";
import { classifyReply } from "../src/lib/reply-classifier";

delete process.env.ANTHROPIC_API_KEY;

// ─── Nettoyage ───────────────────────────────────────────

test("retire « Le … a écrit : » et le message cité", () => {
  const raw = "Oui, appelez-moi demain.\n\nLe mer. 26 nov. 2026 à 10 h 02, Olivier <o@lume.ca> a écrit :\n> Bonjour,\n> Voulez-vous une démo ?";
  assert.equal(cleanReplyText(raw), "Oui, appelez-moi demain.");
});

test("retire « On … wrote: » coupé sur deux lignes (Gmail)", () => {
  const raw = "Sounds good, call me.\n\nOn Wed, Nov 26, 2026 at 10:02 AM Olivier Lume <\no@lume.ca> wrote:\n> Hi";
  assert.equal(cleanReplyText(raw), "Sounds good, call me.");
});

test("retire les lignes « > » et l'en-tête Outlook « De : / Envoyé : »", () => {
  const raw = "Combien ça coûte ?\n> ancienne ligne\n\nDe : Olivier <o@lume.ca>\nEnvoyé : 26 novembre 2026\nObjet : Lume";
  assert.equal(cleanReplyText(raw), "Combien ça coûte ?");
});

test("retire la signature (formule de politesse, « -- », Envoyé de mon iPhone)", () => {
  assert.equal(cleanReplyText("Intéressé, envoyez-moi les prix.\n\nCordialement,\nJean Tremblay\nGestion JT inc.\n514-555-1234"), "Intéressé, envoyez-moi les prix.");
  assert.equal(cleanReplyText("Pas intéressé.\n--\nMarie\nDirectrice"), "Pas intéressé.");
  assert.equal(cleanReplyText("Oui\n\nEnvoyé de mon iPhone"), "Oui");
});

test("garde une réponse d'un seul mot qui ressemble à une formule (« Merci ! »)", () => {
  assert.equal(cleanReplyText("Merci !"), "Merci !");
});

test("décode un message MIME multipart quoted-printable (accents UTF-8)", () => {
  const raw = [
    "From: Jean <jean@gestionjt.ca>",
    "Subject: Re: Lume",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Oui, je suis int=C3=A9ress=C3=A9. Appelez-moi.",
    "",
    "Le 26 nov. 2026, Olivier a =C3=A9crit :",
    "> Bonjour",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>Oui</p>",
    "--b1--",
  ].join("\r\n");
  assert.equal(cleanReplyText(raw), "Oui, je suis intéressé. Appelez-moi.");
});

test("décode une partie base64", () => {
  const body = Buffer.from("Non merci.", "utf8").toString("base64");
  const raw = `Subject: Re\nContent-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${body}`;
  assert.equal(extractMessageBody(raw).trim(), "Non merci.");
});

test("extrait : une ligne, 300 caractères max", () => {
  const ex = replyExcerpt("a ".repeat(400));
  assert.ok(ex.length <= 300);
  assert.ok(ex.endsWith("…"));
  assert.equal(replyExcerpt("Oui\n\nappelez-moi"), "Oui appelez-moi");
});

// ─── Mots-clés FR/EN ─────────────────────────────────────

const cases: Array<[string, string, { subject?: string; from?: string }?]> = [
  ["oui appelez-moi", "positive"],
  ["Oui appelez-moi demain matin", "positive"],
  ["combien ça coûte ?", "positive"],
  ["C'est quoi vos tarifs?", "positive"],
  ["Sure, how much is it?", "positive"],
  ["I'm interested, can we book a call?", "positive"],
  ["non merci", "unsubscribe"],
  ["Non merci!", "unsubscribe"],
  ["Retirez-moi de votre liste", "unsubscribe"],
  ["STOP", "unsubscribe"],
  ["Please remove me from your list", "unsubscribe"],
  ["pas intéressé", "negative"],
  ["Not interested, we already use Jobber.", "negative"],
  ["Je suis absent du bureau jusqu'au 3 décembre.", "out_of_office"],
  ["Thank you for your email. I am currently out of the office.", "out_of_office"],
  ["", "out_of_office", { subject: "Réponse automatique : Lume" }],
  ["Delivery to the following recipient failed permanently: 550 5.1.1 user unknown", "bounce"],
  ["", "bounce", { subject: "Undeliverable: Lume", from: "postmaster@outlook.com" }],
  ["Vous êtes qui exactement ?", "neutral"],
];
for (const [text, expected, meta] of cases) {
  test(`mots-clés : « ${text || meta?.subject} » → ${expected}`, () => {
    assert.equal(classifyByKeywords(cleanReplyText(text), meta).category, expected);
  });
}

test("mots-clés : confiance + raison courte", () => {
  const r = classifyByKeywords("oui appelez-moi");
  assert.ok(r.confidence >= 0.7 && r.confidence <= 1);
  assert.ok(r.reason.length > 0 && r.reason.length < 120);
  assert.equal(r.source, "keywords");
});

// ─── classifyReply : IA + secours + règle « non merci » ───

test("IA disponible : son résultat est utilisé", async () => {
  const { classification } = await classifyReply("Oui appelez-moi", {}, async () => ({ category: "positive", confidence: 0.93, reason: "Veut un appel" }));
  assert.deepEqual(classification, { category: "positive", confidence: 0.93, reason: "Veut un appel", source: "ai" });
});

test("IA en panne : repli sur les mots-clés", async () => {
  const { classification } = await classifyReply("combien ça coûte ?", {}, async () => { throw new Error("529 overloaded"); });
  assert.equal(classification.category, "positive");
  assert.equal(classification.source, "keywords");
});

test("IA absente (pas de clé) : repli sur les mots-clés", async () => {
  const { classification } = await classifyReply("pas intéressé");
  assert.equal(classification.category, "negative");
});

test("« non merci » reste un désabonnement même si l'IA dit positif", async () => {
  const { classification } = await classifyReply("Non merci, bonne journée", {}, async () => ({ category: "positive", confidence: 0.9, reason: "Poli" }));
  assert.equal(classification.category, "unsubscribe");
});

test("le texte cité n'influence pas le classement", async () => {
  const raw = "Pas intéressé.\n\nLe 26 nov. 2026, Olivier a écrit :\n> Voulez-vous une démo ? Appelez-moi, voici nos prix.";
  const seen: string[] = [];
  const { classification } = await classifyReply(raw, {}, async (t) => { seen.push(t); return null; });
  assert.equal(seen[0], "Pas intéressé.");
  assert.equal(classification.category, "negative");
});

test("rebond : pas d'appel IA", async () => {
  let called = false;
  const { classification } = await classifyReply("Address not found", { from: "mailer-daemon@googlemail.com" }, async () => { called = true; return null; });
  assert.equal(classification.category, "bounce");
  assert.equal(called, false);
});

run("Réponses : nettoyage et classement");
