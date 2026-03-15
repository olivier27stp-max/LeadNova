import dns from "node:dns/promises";

export type EmailStatus = "valid" | "invalid" | "risky" | "catch-all" | "disposable" | "unknown";

export interface VerificationResult {
  status: EmailStatus;
  reason: string;
  mxFound: boolean;
  disposable: boolean;
}

// Known disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwam.com",
  "yopmail.com", "sharklasers.com", "grr.la", "guerrillamail.info",
  "guerrillamail.biz", "guerrillamail.de", "guerrillamail.net", "guerrillamail.org",
  "spam4.me", "trashmail.com", "trashmail.at", "trashmail.io", "trashmail.me",
  "trashmail.net", "fakeinbox.com", "maildrop.cc", "dispostable.com",
  "spamgourmet.com", "mailnull.com", "tempemail.com", "tempemail.net",
  "tempinbox.com", "tempmailer.com", "temporaryemail.net", "throwaway.email",
  "throwme.co", "10minutemail.com", "10minutemail.net", "airmail.cc",
  "binkmail.com", "bobmail.info", "dayrep.com", "discard.email",
  "discardmail.com", "discardmail.de", "disposableaddress.com",
  "dodgeit.com", "dodgit.com", "dontreg.com", "dontsendmespam.de",
  "duck2.com", "e4ward.com", "emailias.com", "emailinfive.com",
  "emailtemporanea.net", "emailto.de", "emailwarden.com", "fastacura.com",
  "filzmail.com", "fivemail.de", "fleckens.hu", "frapmail.com",
  "garliclife.com", "getonemail.com", "getonemail.net", "girlsundertheinfluence.com",
  "gishpuppy.com", "haltospam.com", "hulapla.de", "ichimail.com",
  "inoutmail.de", "inoutmail.eu", "inoutmail.info", "inoutmail.net",
  "internet-e-mail.de", "jetable.com", "jetable.fr.nf", "jetable.net",
  "jetable.org", "kasmail.com", "klassmaster.com", "klzlk.com",
  "lol.ovpn.to", "lookugly.com", "lortemail.dk", "m21.cc",
  "mail-temporaire.fr", "mail.mezimages.net", "mail2rss.org", "mailbidon.com",
  "mailblocks.com", "mailbucket.org", "mailcat.biz", "mailcatch.com",
  "maildu.de", "maileater.com", "mailexpire.com", "mailfreeonline.com",
  "mailguard.me", "mailimate.com", "mailme.lv", "mailme24.com",
  "mailmetrash.com", "mailmoat.com", "mailnew.com", "mailnull.com",
  "mailseal.de", "mailshell.com", "mailsiphon.com", "mailslite.com",
  "mailtemporaire.com", "mailtemporaire.fr", "mailtome.de", "mailtothis.com",
  "mailzilla.com", "mbx.cc", "mega.zik.dj", "meltmail.com",
  "mierdamail.com", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
  "msa.minsmail.com", "mt2009.com", "mt2014.com", "mytempemail.com",
  "nada.email", "nospam.ze.tc", "nospamfor.us", "nowmymail.com",
  "objectmail.com", "obobbo.com", "oneoffemail.com", "onewaymail.com",
  "pookmail.com", "proxymail.eu", "rcpt.at", "reallymymail.com",
  "shredmail.com", "skeefmail.com", "slopsbox.com", "smellfear.com",
  "snkmail.com", "sogetthis.com", "soodo.com", "soodonims.com",
  "spam.la", "spamcero.com", "spamcon.org", "spamdecoy.net",
  "spamfree.eu", "spamgob.com", "spamherelots.com", "spamhereplease.com",
  "spamhole.com", "spamify.com", "spaminator.de", "spamkill.info",
  "spamslicer.com", "spamspot.com", "spamthis.co.uk", "spamthisplease.com",
  "spamusers.com", "spamweed.net", "speed.1s.fr", "spoofmail.de",
  "squizzy.de", "squizzy.eu", "squizzy.net", "stinkefinger.net",
  "suckmyd.com", "tagyourself.com", "techemail.com", "tempalias.com",
]);

// Free consumer email domains (risky for B2B)
const CONSUMER_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "yahoo.ca", "yahoo.fr", "hotmail.com",
  "hotmail.ca", "hotmail.fr", "outlook.com", "outlook.ca", "outlook.fr",
  "icloud.com", "me.com", "live.com", "live.ca", "live.fr",
  "msn.com", "aol.com", "videotron.ca", "videotron.net",
  "bell.net", "bellnet.ca", "cogeco.ca", "cogeco.net",
  "rogers.com", "sympatico.ca", "telus.net", "shaw.ca",
  "protonmail.com", "pm.me",
]);

// Role-based email prefixes (risky)
const ROLE_BASED = new Set([
  "info", "contact", "admin", "support", "hello", "noreply", "no-reply",
  "webmaster", "postmaster", "sales", "marketing", "team", "help",
  "abuse", "security", "billing", "newsletter", "notifications",
  "service", "office", "reception", "accueil", "general", "bonjour",
]);

function isValidFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function verifyEmail(email: string): Promise<VerificationResult> {
  if (!email || typeof email !== "string") {
    return { status: "invalid", reason: "Email manquant", mxFound: false, disposable: false };
  }

  const trimmed = email.trim().toLowerCase();

  if (!isValidFormat(trimmed)) {
    return { status: "invalid", reason: "Format invalide", mxFound: false, disposable: false };
  }

  const [localPart, domain] = trimmed.split("@");

  // Disposable check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: "disposable", reason: "Domaine jetable détecté", mxFound: false, disposable: true };
  }

  // MX record lookup
  let mxRecords: Array<{ exchange: string; priority: number }> = [];
  try {
    mxRecords = await dns.resolveMx(domain);
  } catch {
    // DNS lookup failed - invalid or unreachable domain
    return { status: "invalid", reason: "Aucun enregistrement MX — domaine inexistant", mxFound: false, disposable: false };
  }

  if (!mxRecords || mxRecords.length === 0) {
    return { status: "invalid", reason: "Aucun enregistrement MX trouvé", mxFound: false, disposable: false };
  }

  // Consumer domain check (risky for B2B)
  if (CONSUMER_DOMAINS.has(domain)) {
    return { status: "risky", reason: "Adresse personnelle (non professionnelle)", mxFound: true, disposable: false };
  }

  // Role-based emails (info@, contact@) — valid for B2B, just flag it in reason
  if (ROLE_BASED.has(localPart)) {
    return { status: "valid", reason: "Email générique de rôle", mxFound: true, disposable: false };
  }

  return { status: "valid", reason: "Email valide", mxFound: true, disposable: false };
}

export async function verifyEmailBatch(
  emails: Array<{ id: string; email: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<Array<{ id: string; result: VerificationResult }>> {
  const results: Array<{ id: string; result: VerificationResult }> = [];
  const BATCH_SIZE = 10;
  const DELAY_MS = 200;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    for (const item of batch) {
      const result = await verifyEmail(item.email);
      results.push({ id: item.id, result });
    }
    onProgress?.(Math.min(i + BATCH_SIZE, emails.length), emails.length);
    if (i + BATCH_SIZE < emails.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}
