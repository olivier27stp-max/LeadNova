// Texte des réponses de prospects : extraction du corps (MIME), nettoyage du texte cité et des
// signatures, et classement de secours par mots-clés FR/EN quand l'IA n'est pas disponible.
// Module pur (aucune dépendance serveur) : testé dans tests/reply-text.test.ts.

export const REPLY_CATEGORIES = ["positive", "neutral", "negative", "unsubscribe", "out_of_office", "bounce"] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const REPLY_CATEGORY_LABELS: Record<ReplyCategory, string> = {
  positive: "Positive",
  neutral: "Neutre / question",
  negative: "Négative",
  unsubscribe: "Désabonnement",
  out_of_office: "Réponse automatique",
  bounce: "Rebond / erreur",
};

export interface ReplyClassification {
  category: ReplyCategory;
  /** 0 à 1 */
  confidence: number;
  /** Raison courte, en français */
  reason: string;
  source: "ai" | "keywords";
}

export function isReplyCategory(v: unknown): v is ReplyCategory {
  return typeof v === "string" && (REPLY_CATEGORIES as readonly string[]).includes(v);
}

// ─── Extraction du corps ─────────────────────────────────

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  const src = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // caractères déjà décodés (UTF-8 multioctets) : on les réencode tels quels
      for (const b of Buffer.from(c, "utf8")) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodePart(headers: string, body: string): string {
  const enc = headers.match(/content-transfer-encoding:\s*([\w-]+)/i)?.[1]?.toLowerCase();
  if (enc === "base64") {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

function splitHeaders(raw: string): { headers: string; body: string } {
  const i = raw.indexOf("\n\n");
  if (i < 0) return { headers: "", body: raw };
  return { headers: raw.slice(0, i), body: raw.slice(i + 2) };
}

/** Corps texte d'un message brut (RFC 822) : partie text/plain de préférence, sinon text/html sans balises. */
export function extractMessageBody(raw: string): string {
  const t = raw.replace(/\r/g, "");
  const looksLikeHeaders = /^[\w-]+: /m.test(t.slice(0, 300)) && t.includes("\n\n");
  if (!looksLikeHeaders) return t;
  const { headers, body } = splitHeaders(t);
  return extractFromEntity(headers, body, 0);
}

function extractFromEntity(headers: string, body: string, depth: number): string {
  const unfolded = headers.replace(/\n[ \t]+/g, " ");
  const boundary = unfolded.match(/boundary="?([^";\n]+)"?/i)?.[1];
  if (/content-type:\s*multipart\//i.test(unfolded) && boundary && depth < 5) {
    const parts = body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith("--"));
    let html: string | null = null;
    for (const part of parts) {
      const { headers: ph, body: pb } = splitHeaders(part.replace(/^\n/, ""));
      const phu = ph.replace(/\n[ \t]+/g, " ");
      if (/content-type:\s*multipart\//i.test(phu)) {
        const nested = extractFromEntity(ph, pb, depth + 1);
        if (nested.trim()) return nested;
      } else if (/content-type:\s*text\/plain/i.test(phu) || !/content-type:/i.test(phu)) {
        return decodePart(ph, pb);
      } else if (/content-type:\s*text\/html/i.test(phu) && html === null) {
        html = htmlToText(decodePart(ph, pb));
      }
    }
    return html ?? "";
  }
  const decoded = decodePart(unfolded, body);
  return /content-type:\s*text\/html/i.test(unfolded) ? htmlToText(decoded) : decoded;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

// ─── Nettoyage : texte cité + signature ──────────────────

// Début du message cité : « Le … a écrit : », « On … wrote: », en-têtes Outlook, « Message d'origine »
const QUOTE_START =
  /(^|\n)[ \t]*(Le\s[^\n]{3,200}?(\n[^\n]{0,120}?)?\s*a\s+écrit\s*:|On\s[^\n]{3,200}?(\n[^\n]{0,120}?)?\s*wrote\s*:|-{2,}\s*(Original Message|Message d'origine|Forwarded message|Message transféré)\s*-{2,}|De\s*:[^\n]*\n\s*(Envoy[ée]|Date)\s*:|From\s*:[^\n]*\n\s*(Sent|Date)\s*:|_{10,})/i;

// Début d'une signature
const SIGNATURE_LINE =
  /^\s*(--\s*|—\s*|envoyé de mon .*|envoyé depuis .*|sent from my .*|get outlook for .*|obtenir outlook pour .*|(cordialement|salutations( distinguées)?|bien à vous|bonne (journée|fin de journée|soirée)|au plaisir|merci( beaucoup| encore)?|kind regards|best regards|best|regards|thanks|thank you|cheers)\s*[,.!]?)\s*$/i;

/** Retire le message cité, les lignes « > » et la signature. Résultat limité à 2000 caractères. */
export function cleanReplyText(raw: string): string {
  if (!raw) return "";
  let t = extractMessageBody(raw).replace(/\r/g, "").replace(/ /g, " ");
  const cut = t.search(QUOTE_START);
  if (cut >= 0) t = t.slice(0, cut);

  const lines = t
    .split("\n")
    .filter((l) => !l.trim().startsWith(">") && !/^content-|^--[\w=_.-]{10,}/i.test(l.trim()));

  // Signature : on coupe à la première ligne de formule de politesse / délimiteur,
  // sauf si elle est en tête (on garderait alors un texte vide).
  const sigIdx = lines.findIndex((l, i) => i > 0 && SIGNATURE_LINE.test(l) && lines.slice(0, i).some((x) => x.trim()));
  const kept = sigIdx > 0 ? lines.slice(0, sigIdx) : lines;

  return kept
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

/** Extrait d'une ligne pour Slack : espaces normalisés, max `max` caractères. */
export function replyExcerpt(cleaned: string, max = 300): string {
  const one = cleaned.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

// ─── Classement par mots-clés (secours) ──────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ");
}

const BOUNCE = [
  /delivery status notification/, /undeliverable/, /undelivered mail/, /mail delivery (failed|subsystem)/,
  /address not found/, /adresse (introuvable|inexistante)/, /n'a pas pu être (remis|livré)/, /non remis/,
  /user unknown/, /mailbox (unavailable|not found|full)/, /recipient address rejected/, /\b55[0-4][ -]5\.\d\.\d\b/,
];

const OUT_OF_OFFICE = [
  /absente? du bureau/, /out of (the )?office/, /je suis (présentement |actuellement )?(absente?|en vacances|en congé)/,
  /(de retour|back) (le|on|au bureau|in the office)/, /réponse automatique/, /automatic reply/, /auto-?reply/,
  /accusé de réception/, /nous avons bien reçu votre (message|courriel)/, /we (have )?received your (message|email)/,
  /i am (currently )?(away|on vacation|out)/, /congé parental|congés? fériés?/,
];

// « non merci » est l'instruction de désinscription de nos courriels : toujours un désabonnement.
const UNSUBSCRIBE = [
  /\bnon,? merci\b/, /\bno,? thanks?( you)?\b/, /retire[sz]?[- ](moi|nous)/, /enlève[sz]?[- ](moi|nous)/, /désabonn/, /desabonn/,
  /\bunsubscribe\b/, /remove (me|us)\b/, /take (me|us) off/, /ne (plus|pas) (m'|nous )?(écrire|contacter|envoyer)/,
  /ne m'écrivez plus/, /ne me contactez plus/, /cessez de m'écrire/, /arrêtez de m'écrire/, /stop (emailing|sending)/,
  /^\s*stop\s*[.!]*\s*$/m,
];

const NEGATIVE = [
  /pas (du tout |vraiment |trop )?intéress/, /not (really )?interested/, /aucun intérêt/, /pas besoin/, /no need/,
  /on (a|utilise) déjà/, /we already (have|use)/, /ça ne nous intéresse pas/, /pas pour (nous|moi)/, /no interest/,
];

const POSITIVE_STRONG = [
  /appel(ez|le|lez)[- ]moi/, /rappel(ez|le|lez)[- ]moi/, /téléphonez[- ]moi/, /call me/, /give me a call/,
  /\bd[ée]mo\b/, /combien (ça|ca|cela) co[uû]te/, /combien (pour|ça|ca)/, /\bprix\b/, /\btarifs?\b/, /\bco[uû]ts?\b/,
  /how much/, /pricing/, /\bprice\b/, /intéressée?s?/, /\binterested\b/, /rendez-vous/, /\bmeeting\b/,
  /prendre un (appel|rdv|café)/, /book a (call|time)/, /plus d'(info|information)s?/, /more info/, /envoyez[- ]moi/,
  /send me (more|info|details)/, /quand (êtes-vous|es-tu) disponible/, /when are you available/,
];

const POSITIVE_WEAK = [/^\s*(oui|yes|ok|d'accord|parfait|sure)\b/, /ça m'intéresse/, /pourquoi pas/, /why not/];

function matches(text: string, patterns: RegExp[]): RegExp | undefined {
  return patterns.find((p) => p.test(text));
}

/** Demande explicite de désinscription : prime toujours sur l'IA (jamais notifiée comme positive). */
export function isExplicitUnsubscribe(cleaned: string): boolean {
  return !!matches(norm(cleaned), UNSUBSCRIBE);
}

/**
 * Classement de secours, sans IA. `subject` et `from` aident à repérer les rebonds et les absences.
 * Le texte doit déjà être nettoyé (cleanReplyText).
 */
export function classifyByKeywords(cleaned: string, meta: { subject?: string; from?: string } = {}): ReplyClassification {
  const text = norm(cleaned);
  const subject = norm(meta.subject || "");
  const from = norm(meta.from || "");
  const r = (category: ReplyCategory, confidence: number, reason: string): ReplyClassification => ({
    category, confidence, reason, source: "keywords",
  });

  if (/mailer-daemon|postmaster|mail-daemon/.test(from) || matches(subject, BOUNCE) || matches(text, BOUNCE)) {
    return r("bounce", 0.9, "Message d'erreur de livraison");
  }
  if (matches(subject, OUT_OF_OFFICE) || matches(text, OUT_OF_OFFICE)) {
    return r("out_of_office", 0.85, "Réponse automatique (absence ou accusé de réception)");
  }
  if (matches(text, UNSUBSCRIBE)) return r("unsubscribe", 0.95, "Demande de ne plus recevoir de courriels");
  if (matches(text, NEGATIVE)) return r("negative", 0.75, "Le prospect dit ne pas être intéressé");
  if (!text.trim()) return r("neutral", 0.3, "Réponse vide");
  if (matches(text, POSITIVE_STRONG)) return r("positive", 0.75, "Intérêt : demande un appel, une démo, le prix ou des infos");
  if (matches(text, POSITIVE_WEAK)) return r("positive", 0.6, "Réponse affirmative courte");
  if (text.includes("?")) return r("neutral", 0.55, "Question du prospect");
  return r("neutral", 0.4, "Ni intérêt ni refus clair");
}
