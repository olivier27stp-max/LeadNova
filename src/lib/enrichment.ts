import * as cheerio from "cheerio";
import { prisma } from "./db";
import { calculateLeadScore } from "./lead-scoring";
import { logActivity } from "./activity";

// Yield DB connection between prospects so other requests can get through
// (critical for connection_limit=1 local Prisma Postgres)
const DB_YIELD_MS = 300;
function yieldForDb(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DB_YIELD_MS));
}

// ─── Safe prospect update (handles unique constraint conflicts) ──
async function safeUpdateProspect(id: string, data: Record<string, unknown>) {
  try {
    return await prisma.prospect.update({ where: { id }, data });
  } catch (err: unknown) {
    // P2002 = unique constraint violation (companyName + city)
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      // Retry without city to avoid duplicate
      const { city, ...rest } = data;
      if (Object.keys(rest).length > 0) {
        return await prisma.prospect.update({ where: { id }, data: rest });
      }
      // Nothing left to update
      return await prisma.prospect.findUnique({ where: { id } });
    }
    throw err;
  }
}

// ─── Regex ───────────────────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const LINKEDIN_REGEX =
  /https?:\/\/(www\.)?linkedin\.com\/company\/[a-zA-Z0-9_-]+/g;

// Obfuscated email patterns: [at], (at), {at}, " at ", [dot], (dot), etc.
const OBFUSCATED_AT = /\s*[\[({]\s*(?:at|@|arobase|chez)\s*[\])}]\s*/gi;
const OBFUSCATED_DOT = /\s*[\[({]\s*(?:dot|point|\.)\s*[\])}]\s*/gi;

// ─── Max pages to fetch per prospect (performance cap) ──
const MAX_PAGES_PER_PROSPECT = 12;

// ─── Pages to scan (French + English, ordered by priority) ──
const CONTACT_PATHS = [
  "/contact",
  "/contactez-nous",
  "/nous-joindre",
  "/contact-us",
  "/nous-contacter",
  "/a-propos",
  "/about",
  "/equipe",
  "/team",
  "/info",
];

// Keywords to identify contact-related links in the page
const CONTACT_LINK_KEYWORDS = [
  "contact", "nous-joindre", "contactez", "nous-contacter",
  "joindre", "equipe", "team", "a-propos", "about",
  "mentions-legales", "legal", "info", "support",
];

// ─── False positive domains / extensions to filter out ──
const EMAIL_BLACKLIST_PATTERNS = [
  "example.com", "sentry.io", "wixpress.com", "wordpress.org",
  "gravatar.com", "schema.org", "w3.org", "googleapis.com",
  "googletagmanager.com", "facebook.com", "twitter.com",
  "jquery.com", "cloudflare.com", "gstatic.com", "jsdelivr.net",
  "bootstrapcdn.com", "fontawesome.com", "google-analytics.com",
  "doubleclick.net", "googleadservices.com", "pxhere.com",
  "unsplash.com", "placeholder.com", "lorem.com",
];
const EMAIL_BLACKLIST_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot", ".map",
];

// ─── User-Agent rotation (look like a real browser) ─────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Fetch with better headers + timeout ─────────────────
async function fetchPage(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: {
        "User-Agent": randomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!res.ok) {
      console.warn(`[fetchPage] HTTP ${res.status} for ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("xml")) {
      console.warn(`[fetchPage] Non-HTML content-type "${contentType}" for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg.includes("abort") || msg.includes("timeout")) {
      console.warn(`[fetchPage] Timeout (${timeoutMs}ms) for ${url}`);
    } else {
      console.warn(`[fetchPage] Failed ${url}: ${msg}`);
    }
    return null;
  }
}

// ─── Deobfuscate emails ─────────────────────────────────
function deobfuscateEmails(text: string): string[] {
  const results: string[] = [];

  // Decode HTML entities first
  const decoded = text
    .replace(/&#64;/g, "@")
    .replace(/&#46;/g, ".")
    .replace(/&commat;/g, "@")
    .replace(/&period;/g, ".")
    .replace(/&#x40;/g, "@")
    .replace(/&#x2e;/g, ".");

  // Find patterns like "name [at] domain [dot] com"
  const obfuscatedPattern = /([a-zA-Z0-9._%+-]+)\s*[\[({]\s*(?:at|@|arobase|chez)\s*[\])}]\s*([a-zA-Z0-9.-]+)\s*[\[({]\s*(?:dot|point|\.)\s*[\])}]\s*([a-zA-Z]{2,})/gi;
  let match;
  while ((match = obfuscatedPattern.exec(text)) !== null) {
    results.push(`${match[1]}@${match[2]}.${match[3]}`.toLowerCase());
  }

  // Also try simpler: "name [at] domain.com"
  const simpleObfuscated = /([a-zA-Z0-9._%+-]+)\s*[\[({]\s*(?:at|@|arobase|chez)\s*[\])}]\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  while ((match = simpleObfuscated.exec(text)) !== null) {
    results.push(`${match[1]}@${match[2]}`.toLowerCase());
  }

  // Standard regex on decoded text
  const standard = decoded.match(EMAIL_REGEX) || [];
  results.push(...standard);

  return results;
}

// ─── Selectors for footer & contact sections (where emails/phones live) ──
const FOOTER_CONTACT_SELECTORS = [
  "footer", "#footer", ".footer", ".site-footer", ".main-footer",
  '[role="contentinfo"]', "#colophon",
  ".footer-contact", ".footer-info", ".contact-info",
  ".coordonnees", "#coordonnees", ".adresse", "#adresse",
  '[class*="contact"]', '[class*="footer"]',
  '[id*="contact"]', '[id*="footer"]',
];

// ─── Extract emails from footer & contact sections (high confidence) ──
function extractFooterContactEmails(html: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];

  for (const sel of FOOTER_CONTACT_SELECTORS) {
    $(sel).each((_, el) => {
      const sectionHtml = $.html(el);
      // mailto: links in these sections
      const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
      let match;
      while ((match = mailtoRegex.exec(sectionHtml)) !== null) {
        found.push(match[1].toLowerCase().trim());
      }
      // Plain text emails in these sections
      const textEmails = sectionHtml.match(EMAIL_REGEX) || [];
      found.push(...textEmails);
    });
  }

  return [...new Set(found.map((e) => e.toLowerCase().trim()))].filter(isValidEmail);
}

// ─── Extract emails (comprehensive) ─────────────────────
// Returns deduplicated emails. Also populates the optional mailtoEmails set
// so callers can boost the score of emails found in mailto: links or footer/contact sections.
function extractEmails(html: string, mailtoEmails?: Set<string>): string[] {
  const found: string[] = [];

  // 0) PRIORITY: Footer & contact sections — most reliable for business emails
  const footerEmails = extractFooterContactEmails(html);
  found.push(...footerEmails);
  if (mailtoEmails) {
    for (const e of footerEmails) mailtoEmails.add(e);
  }

  // 1) Standard regex (full page)
  const standard = html.match(EMAIL_REGEX) || [];
  found.push(...standard);

  // 2) Deobfuscated emails
  found.push(...deobfuscateEmails(html));

  // 3) mailto: links (most reliable source)
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let match;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const email = match[1].toLowerCase().trim();
    found.push(email);
    if (mailtoEmails) mailtoEmails.add(email);
  }

  // 4) JSON-LD / structured data emails
  const jsonLdRegex = /"email"\s*:\s*"([^"]+)"/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    if (match[1].includes("@")) found.push(match[1]);
  }

  // 5) Schema.org itemprop="email"
  const $ = cheerio.load(html);
  $('[itemprop="email"]').each((_, el) => {
    const content = $(el).attr("content") || $(el).attr("href") || $(el).text();
    const cleaned = content?.replace("mailto:", "").trim();
    if (cleaned && cleaned.includes("@")) {
      found.push(cleaned);
      if (mailtoEmails) mailtoEmails.add(cleaned.toLowerCase().trim());
    }
  });

  // 6) data-email attributes
  $("[data-email]").each((_, el) => {
    const email = $(el).attr("data-email");
    if (email && email.includes("@")) found.push(email);
  });

  // Filter & deduplicate
  return [...new Set(found.map((e) => e.toLowerCase().trim()))].filter(isValidEmail);
}

// ─── Email validation ───────────────────────────────────
function isValidEmail(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  if (email.length < 5 || email.length > 254) return false;

  // Check blacklisted domains
  for (const pattern of EMAIL_BLACKLIST_PATTERNS) {
    if (email.includes(pattern)) return false;
  }

  // Check blacklisted extensions
  for (const ext of EMAIL_BLACKLIST_EXTENSIONS) {
    if (email.endsWith(ext)) return false;
  }

  // Basic structural check
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  if (parts[0].length === 0 || parts[1].length < 3) return false;
  if (!parts[1].includes(".")) return false;

  return true;
}

// ─── Email priority scoring ─────────────────────────────
function scoreEmail(email: string, companyDomain: string, mailtoEmails?: Set<string>): number {
  let score = 0;
  const lower = email.toLowerCase();
  const domain = lower.split("@")[1];

  // Emails found in mailto: links are explicitly published — very high confidence
  if (mailtoEmails?.has(lower)) {
    score += 50;
  }

  // Emails on the company's own domain are highest value
  if (domain === companyDomain || domain === `www.${companyDomain}`) {
    score += 100;
  }

  // Prefer specific contact-type emails
  if (lower.startsWith("info@")) score += 20;
  if (lower.startsWith("contact@")) score += 18;
  if (lower.startsWith("admin@")) score += 10;
  if (lower.startsWith("reception@")) score += 15;
  if (lower.startsWith("direction@")) score += 12;
  if (lower.startsWith("ventes@") || lower.startsWith("sales@")) score += 14;
  if (lower.startsWith("service@")) score += 13;
  if (lower.startsWith("support@")) score += 8;

  // Penalize generic / noreply
  if (lower.startsWith("noreply@") || lower.startsWith("no-reply@")) score -= 50;
  if (lower.startsWith("mailer-daemon@")) score -= 100;
  if (lower.includes("unsubscribe")) score -= 30;
  if (lower.includes("newsletter")) score -= 10;

  // Gmail/outlook personal emails — only penalize if NOT found via mailto
  // (small businesses often use gmail as their real contact email)
  if (domain === "gmail.com" || domain === "hotmail.com" || domain === "yahoo.com" || domain === "outlook.com") {
    if (!mailtoEmails?.has(lower)) {
      score -= 5;
    }
  }

  return score;
}

// ─── Extract LinkedIn ───────────────────────────────────
function extractLinkedIn(html: string): string | null {
  const matches = html.match(LINKEDIN_REGEX) || [];
  return matches[0] || null;
}

// ─── Extract phone numbers ──────────────────────────────
function extractPhones(html: string): string[] {
  // North American format + international
  const phoneRegex = /(?:tel:|phone:|téléphone|tél\.|fax)?[\s:]*(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/gi;
  const $ = cheerio.load(html);

  const phones: string[] = [];

  // From tel: links (most reliable)
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const num = href.replace("tel:", "").replace(/\s+/g, "");
      if (num.replace(/\D/g, "").length >= 10) phones.push(num);
    }
  });

  // From text content
  const textContent = $("body").text();
  const matches = textContent.match(phoneRegex) || [];
  for (const m of matches) {
    const cleaned = m.trim();
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      phones.push(cleaned);
    }
  }

  // Final validation: only keep phones with at least 10 digits
  return [...new Set(phones)].filter((p) => p.replace(/\D/g, "").length >= 10);
}

// ─── Find ALL relevant internal links ───────────────────
function findRelevantLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string
): { contactUrls: string[]; otherUrls: string[] } {
  const contactUrls: string[] = [];
  const otherUrls: string[] = [];
  const seen = new Set<string>();

  let baseHost: string;
  try {
    baseHost = new URL(baseUrl).hostname;
  } catch {
    return { contactUrls, otherUrls };
  }

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const urlObj = new URL(resolved);

      // Only same-domain links
      if (urlObj.hostname !== baseHost) return;

      // Skip anchors, files, etc.
      const path = urlObj.pathname.toLowerCase();
      if (path.match(/\.(pdf|doc|docx|xls|xlsx|zip|png|jpg|jpeg|gif|svg|css|js|mp4|mp3)$/)) return;

      const clean = `${urlObj.origin}${urlObj.pathname}`;
      if (seen.has(clean)) return;
      seen.add(clean);

      // Check if it's a contact-type page
      const isContact = CONTACT_LINK_KEYWORDS.some((kw) => path.includes(kw));
      if (isContact) {
        contactUrls.push(clean);
      } else {
        otherUrls.push(clean);
      }
    } catch {
      // Skip invalid URLs
    }
  });

  return { contactUrls, otherUrls };
}

// ─── Try to find sitemap and extract contact URLs ───────
async function findContactPagesFromSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapUrls = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap1.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchPage(sitemapUrl);
    if (!xml) continue;

    // Extract URLs from sitemap
    const urlMatches = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
    for (const m of urlMatches) {
      const url = m.replace(/<\/?loc>/gi, "");
      const lower = url.toLowerCase();
      if (CONTACT_LINK_KEYWORDS.some((kw) => lower.includes(kw))) {
        urls.push(url);
      }
    }

    // If it's a sitemap index, we already have enough from the first one
    if (urls.length > 0) break;
  }

  return urls;
}

// ─── Known Quebec/Canadian cities for validation ─────────
const KNOWN_CITIES = new Set([
  "montreal", "montréal", "quebec", "québec", "laval", "gatineau", "longueuil",
  "sherbrooke", "levis", "lévis", "saguenay", "trois-rivieres", "trois-rivières",
  "terrebonne", "saint-jean-sur-richelieu", "repentigny", "brossard", "drummondville",
  "saint-jerome", "saint-jérôme", "granby", "blainville", "saint-hyacinthe",
  "shawinigan", "dollard-des-ormeaux", "rimouski", "victoriaville", "saint-eustache",
  "mascouche", "chateauguay", "châteauguay", "alma", "rouyn-noranda", "joliette",
  "sorel-tracy", "boucherville", "val-d'or", "val-d-or", "saint-bruno-de-montarville",
  "sainte-julie", "varennes", "mirabel", "vaudreuil-dorion", "saint-constant",
  "candiac", "la prairie", "laprairie", "chambly", "beauport", "charlesbourg",
  "sainte-foy", "cap-rouge", "lachine", "lasalle", "verdun", "outremont",
  "westmount", "saint-laurent", "anjou", "riviere-du-loup", "rivière-du-loup",
  "matane", "baie-comeau", "sept-iles", "sept-îles", "thetford mines",
  "cowansville", "magog", "saint-georges", "beloeil", "mont-saint-hilaire",
  "sainte-therese", "sainte-thérèse", "boisbriand", "rosemere", "rosemère",
  "lorraine", "prevost", "prévost", "saint-sauveur", "mont-tremblant",
  "saint-colomban", "rawdon", "l'assomption", "lachenaie", "le gardeur",
  "pointe-aux-trembles", "saint-leonard", "saint-léonard", "pierrefonds",
  "kirkland", "beaconsfield", "pointe-claire", "dorval", "cote-saint-luc",
  "côte-saint-luc", "mont-royal", "hampstead", "saint-lambert", "greenfield park",
  "saint-hubert", "sainte-catherine", "delson", "saint-philippe",
  "ottawa", "toronto", "mississauga", "brampton", "hamilton", "london", "markham",
  "vaughan", "kitchener", "windsor", "richmond hill", "oakville", "burlington",
  "oshawa", "barrie", "st. catharines", "cambridge", "guelph",
  "calgary", "edmonton", "vancouver", "burnaby", "surrey", "victoria",
  "winnipeg", "saskatoon", "regina", "halifax", "fredericton", "moncton",
  "saint john", "charlottetown", "st. john's",
]);

// Province codes / names for address matching
const PROVINCE_PATTERN = /(?:QC|Qc|Québec|Quebec|ON|Ontario|AB|Alberta|BC|MB|SK|NB|NS|PE|NL|NWT|YT|NU)/;

// ─── Extract city from HTML (comprehensive) ──────────────
function extractCity(html: string): string | null {
  const $ = cheerio.load(html);

  // 1) Schema.org / JSON-LD addressLocality
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const data = JSON.parse($(jsonLdScripts[i]).html() || "");
      const locality = findAddressLocality(data);
      if (locality && isCityPlausible(locality)) return normalizeCity(locality);
    } catch {
      // ignore
    }
  }

  // 2) itemprop="addressLocality"
  const localityEl = $('[itemprop="addressLocality"]');
  if (localityEl.length > 0) {
    const text = localityEl.first().attr("content") || localityEl.first().text();
    if (text?.trim() && isCityPlausible(text.trim())) return normalizeCity(text.trim());
  }

  // 3) meta geo.placename
  const geoPlace = $('meta[name="geo.placename"]').attr("content");
  if (geoPlace?.trim() && isCityPlausible(geoPlace.trim())) return normalizeCity(geoPlace.trim());

  // 4) <address> HTML elements - very reliable when present
  const addressEls = $("address");
  for (let i = 0; i < addressEls.length; i++) {
    const addrText = $(addressEls[i]).text();
    const city = extractCityFromAddressText(addrText);
    if (city) return normalizeCity(city);
  }

  // 5) Google Maps iframe - extract city from src URL
  const iframes = $('iframe[src*="google.com/maps"], iframe[src*="maps.google"]');
  for (let i = 0; i < iframes.length; i++) {
    const src = $(iframes[i]).attr("src") || "";
    const city = extractCityFromMapUrl(src);
    if (city) return normalizeCity(city);
  }

  // 6) Footer scanning - businesses almost always put address in footer
  const footerSelectors = [
    "footer", "#footer", ".footer", "#pied-page", ".pied-page",
    '[role="contentinfo"]', ".site-footer", ".main-footer",
    "#colophon", ".widget-area", ".footer-widget",
    ".footer-contact", ".footer-info", ".contact-info",
    ".coordonnees", "#coordonnees", ".adresse", "#adresse",
  ];
  for (const sel of footerSelectors) {
    const el = $(sel);
    if (el.length > 0) {
      const text = el.text();
      const city = extractCityFromAddressText(text);
      if (city) return normalizeCity(city);
    }
  }

  // 7) Look for "contact" or "address" sections/divs
  const contactSections = $('[class*="contact"], [class*="address"], [class*="adresse"], [class*="location"], [class*="coordonn"], [id*="contact"], [id*="address"], [id*="adresse"], [id*="location"]');
  for (let i = 0; i < Math.min(contactSections.length, 5); i++) {
    const text = $(contactSections[i]).text();
    const city = extractCityFromAddressText(text);
    if (city) return normalizeCity(city);
  }

  // 8) Full body text scan with multiple patterns
  const bodyText = $("body").text();
  const city = extractCityFromAddressText(bodyText);
  if (city) return normalizeCity(city);

  // 9) Last resort - scan for known city names in body text (case-insensitive)
  const bodyLower = bodyText.toLowerCase();
  for (const knownCity of KNOWN_CITIES) {
    // Match as a whole word (with word boundaries for accented chars)
    const idx = bodyLower.indexOf(knownCity);
    if (idx !== -1) {
      // Verify it's a word boundary (not part of a larger word)
      const before = idx > 0 ? bodyLower[idx - 1] : " ";
      const after = idx + knownCity.length < bodyLower.length ? bodyLower[idx + knownCity.length] : " ";
      if (/[\s,.()\-\/]/.test(before) && /[\s,.()\-\/]/.test(after)) {
        // Extract the original casing from the body
        const original = bodyText.substring(idx, idx + knownCity.length);
        return normalizeCity(original);
      }
    }
  }

  return null;
}

// ─── Extract city from address-like text ─────────────────
function extractCityFromAddressText(text: string): string | null {
  // Clean up the text
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 10000) return null;

  // Pattern 1: Street address followed by city, province
  // e.g. "123 rue Principale, Sherbrooke, QC" or "456 boul. des Laurentides, Laval, Québec"
  const streetThenCity = /(?:\d+[A-Za-z]?\s*,?\s*(?:rue|av(?:enue)?|boul(?:evard)?|ch(?:emin)?|rang|route|place|cour|croissant|impasse|allée|montée|côte|(?:1er|2e|3e|4e|5e|6e|7e|8e|9e|\d+e)\s+(?:rue|av))\s+[^,\n]{3,40})\s*[,\n]\s*([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü]?[a-zà-ü]+)*)/gm;
  let match = streetThenCity.exec(cleaned);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (isCityPlausible(candidate)) return candidate;
  }

  // Pattern 2: City, Province Code (with optional postal code)
  // e.g. "Montréal, QC H2X 1Y4" or "Laval (Québec)"
  const cityProvince = /(?:^|[,\n•|])\s*([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü]?[a-zà-ü]+){0,4})\s*[,(]\s*(?:QC|Qc|Québec|Quebec|ON|Ontario|AB|Alberta|BC|MB|SK|NB|NS|PE|NL)\b/gm;
  match = cityProvince.exec(cleaned);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (isCityPlausible(candidate)) return candidate;
  }

  // Pattern 3: City before postal code (Canadian: A1A 1A1)
  // e.g. "Sherbrooke J1H 5N4" or "Montréal, H2X 1Y4"
  const cityPostalCode = /(?:^|[,\n•|])\s*([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü]?[a-zà-ü]+){0,4})\s*[,\s]\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d/gm;
  match = cityPostalCode.exec(cleaned);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (isCityPlausible(candidate)) return candidate;
  }

  // Pattern 4: Province code then city in nearby text
  // e.g. "QC, Montréal" (less common but happens)
  const provinceCity = /(?:QC|Québec|Quebec)\s*[,\s]\s*([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü]?[a-zà-ü]+){0,3})/gm;
  match = provinceCity.exec(cleaned);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (isCityPlausible(candidate) && !PROVINCE_PATTERN.test(candidate)) return candidate;
  }

  // Pattern 5: "situé à/located in/basé à" City
  const locatedIn = /(?:situ[ée]s?\s+[àa]|bas[ée]s?\s+[àa]|located\s+in|based\s+in|établis?\s+[àa])\s+([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü]?[a-zà-ü]+){0,3})/gi;
  match = locatedIn.exec(cleaned);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (isCityPlausible(candidate)) return candidate;
  }

  // Pattern 6: "Ville:" or "City:" label
  const cityLabel = /(?:ville|city|municipalit[ée]|localit[ée])\s*[:]\s*([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü]?[a-zà-ü]+){0,3})/gi;
  match = cityLabel.exec(cleaned);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (isCityPlausible(candidate)) return candidate;
  }

  return null;
}

// ─── Extract city from Google Maps URL ───────────────────
function extractCityFromMapUrl(url: string): string | null {
  try {
    // Try "q=" parameter: often contains the full address
    const qMatch = url.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      const decoded = decodeURIComponent(qMatch[1]).replace(/\+/g, " ");
      const city = extractCityFromAddressText(decoded);
      if (city) return city;
    }
    // Try "!2s" parameter in embed URLs
    const sMatch = url.match(/!2s([^!]+)/);
    if (sMatch) {
      const decoded = decodeURIComponent(sMatch[1]).replace(/\+/g, " ");
      const city = extractCityFromAddressText(decoded);
      if (city) return city;
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Validate a city candidate ───────────────────────────
function isCityPlausible(candidate: string): boolean {
  if (!candidate || candidate.length < 3 || candidate.length > 50) return false;
  // Reject if it looks like a street name fragment
  if (/^\d/.test(candidate)) return false;
  // Reject common false positives
  const lower = candidate.toLowerCase();
  const rejects = [
    "canada", "suite", "local", "bureau", "case", "postale", "cedex",
    "téléphone", "telephone", "fax", "courriel", "email", "accueil",
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
    "heures", "horaire", "ouvert", "fermé", "services", "contact",
    "page", "menu", "navigation", "copyright", "all rights",
  ];
  if (rejects.some((r) => lower === r || lower.startsWith(r + " "))) return false;
  // Must contain at least one letter
  if (!/[a-zA-ZÀ-ü]/.test(candidate)) return false;
  return true;
}

function findAddressLocality(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findAddressLocality(item);
      if (result) return result;
    }
    return null;
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.addressLocality === "string" && record.addressLocality.trim()) {
    return record.addressLocality.trim();
  }
  if (record.address && typeof record.address === "object") {
    return findAddressLocality(record.address);
  }
  for (const val of Object.values(record)) {
    if (val && typeof val === "object") {
      const result = findAddressLocality(val);
      if (result) return result;
    }
  }
  return null;
}

// ─── Canonical city names (merge variants) ───────────────
const CITY_CANONICAL: Record<string, string> = {
  "montreal": "Montréal", "montréal": "Montréal",
  "quebec": "Québec", "québec": "Québec", "quebec city": "Québec",
  "trois-rivieres": "Trois-Rivières", "trois-rivières": "Trois-Rivières",
  "trois rivieres": "Trois-Rivières", "trois rivières": "Trois-Rivières",
  "levis": "Lévis", "lévis": "Lévis",
  "saint-jerome": "Saint-Jérôme", "saint-jérôme": "Saint-Jérôme",
  "saint-jean-sur-richelieu": "Saint-Jean-sur-Richelieu",
  "riviere-du-loup": "Rivière-du-Loup", "rivière-du-loup": "Rivière-du-Loup",
  "sept-iles": "Sept-Îles", "sept-îles": "Sept-Îles",
  "val-d'or": "Val-d'Or",
  "sainte-therese": "Sainte-Thérèse", "sainte-thérèse": "Sainte-Thérèse",
  "rosemere": "Rosemère", "rosemère": "Rosemère",
  "prevost": "Prévost", "prévost": "Prévost",
  "chateauguay": "Châteauguay", "châteauguay": "Châteauguay",
  "cote-saint-luc": "Côte-Saint-Luc", "côte-saint-luc": "Côte-Saint-Luc",
  // ── MRC → ville principale ────────────────────────────────
  "desjardins": "Lévis",
  "les chutes-de-la-chaudière-est": "Lévis",
  "les chutes-de-la-chaudière-ouest": "Lévis",
  "la nouvelle-beauce": "Sainte-Marie",
  "beauce-sartigan": "Saint-Georges",
  "robert-cliche": "Beauceville",
  "les appalaches": "Thetford Mines",
  "la côte-de-beaupré": "Beaupré",
  "la jacques-cartier": "Shannon",
  "portneuf": "Donnacona",
  "l'île-d'orléans": "Saint-Pierre",
  "bellechasse": "Saint-Raphaël",
  "charlevoix": "Baie-Saint-Paul",
  "charlevoix-est": "La Malbaie",
  "mékinac": "Saint-Tite",
  "les chenaux": "Sainte-Anne-de-la-Pérade",
  "maskinongé": "Louiseville",
  "matawinie": "Rawdon",
  "montcalm": "Saint-Lin–Laurentides",
  "d'autray": "Berthierville",
  "les moulins": "Terrebonne",
  "antoine-labelle": "Mont-Laurier",
  "argenteuil": "Lachute",
  "la rivière-du-nord": "Saint-Jérôme",
  "les laurentides": "Mont-Tremblant",
  "les pays-d'en-haut": "Sainte-Adèle",
  "thérèse-de blainville": "Blainville",
  "la haute-yamaska": "Granby",
  "brome-missisquoi": "Cowansville",
  "le haut-richelieu": "Saint-Jean-sur-Richelieu",
  "la vallée-du-richelieu": "Beloeil",
  "roussillon": "La Prairie",
  "les jardins-de-napierville": "Saint-Rémi",
  "le bas-richelieu": "Sorel-Tracy",
  "les maskoutains": "Saint-Hyacinthe",
  "rouville": "Marieville",
  "vaudreuil-soulanges": "Vaudreuil-Dorion",
  "beauharnois-salaberry": "Salaberry-de-Valleyfield",
  "le haut-saint-laurent": "Huntingdon",
  "le granit": "Lac-Mégantic",
  "le haut-saint-françois": "Cookshire-Eaton",
  "le val-saint-françois": "Windsor",
  "les sources": "Asbestos",
  "memphrémagog": "Magog",
  "abitibi-ouest": "La Sarre",
  "témiscamingue": "Ville-Marie",
  "vallée-de-l'or": "Val-d'Or",
  "kamouraska": "Saint-Pascal",
  "la matapédia": "Amqui",
  "la mitis": "Mont-Joli",
  "les basques": "Trois-Pistoles",
  "rimouski-neigette": "Rimouski",
  "témiscouata": "Témiscouata-sur-le-Lac",
  "avignon": "Carleton-sur-Mer",
  "la côte-de-gaspé": "Gaspé",
  "la haute-gaspésie": "Sainte-Anne-des-Monts",
  "rocher-percé": "Chandler",
  "manicouagan": "Baie-Comeau",
  "sept-rivières": "Sept-Îles",
  "la haute-côte-nord": "Les Escoumins",
  "lac-saint-jean-est": "Alma",
  "le domaine-du-roy": "Roberval",
  "maria-chapdelaine": "Dolbeau-Mistassini",
  "le fjord-du-saguenay": "Saguenay",
  "collines-de-l'outaouais": "Chelsea",
  "papineau": "Papineauville",
  "pontiac": "Campbell's Bay",
  // ── Arrondissements Québec → "Québec" ────────────────────
  "sainte-foy–sillery–cap-rouge": "Québec",
  "les rivières": "Québec",
  "la cité-limoilou": "Québec",
  "la haute-saint-charles": "Québec",
  "charlesbourg": "Québec",
  "beauport": "Québec",
  // ── Arrondissements Montréal → "Montréal" ────────────────
  "villeray—saint-michel—parc-extension": "Montréal",
  "rosemont - la petite-patrie": "Montréal",
  "lachine": "Montréal",
  "verdun": "Montréal",
  "montréal-nord": "Montréal",
  "le sud-ouest": "Montréal",
  "saint-michel": "Montréal",
  // ── Arrondissements Longueuil → "Longueuil" ──────────────
  "le vieux-longueuil": "Longueuil",
  // ── Arrondissements Laval → "Laval" ──────────────────────
  "chomedey": "Laval",
  "sainte-rose": "Laval",
  // ── Variantes / alias ─────────────────────────────────────
  "hull": "Gatineau",
  "hull (gatineau)": "Gatineau",
  "ville de gatineau": "Gatineau",
  "valleyfield": "Salaberry-de-Valleyfield",
  "salaberry-de-valleyfield": "Salaberry-de-Valleyfield",
  "l'ancienne-lorette": "L'Ancienne-Lorette",
  "montmorency": "Beauport",
};

function normalizeCity(city: string): string {
  const lower = city.toLowerCase().trim();
  if (CITY_CANONICAL[lower]) return CITY_CANONICAL[lower];
  // Capitalize first letter of each word, handle accents
  return city
    .toLowerCase()
    .replace(/(^|\s|-)[a-zà-ü]/g, (c) => c.toUpperCase())
    .trim();
}

// ─── Google Places API (Text Search + Place Details) ─────
interface MapsResult {
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  city?: string;
}

async function searchGoogleMaps(companyName: string, city?: string): Promise<MapsResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("[Google Places] ⚠️ GOOGLE_PLACES_API_KEY manquante — impossible de chercher sur Google Maps");
    return null;
  }

  const query = city ? `${companyName} ${city}` : `${companyName} Québec`;

  try {
    // Step 1: Text Search to find the place
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.addressComponents",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "fr",
        regionCode: "CA",
        maxResultCount: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text().catch(() => "");
      if (searchRes.status === 403 || errText.includes("API_KEY")) {
        console.error("[Google Places] ⚠️ Clé API invalide ou API non activée. Activez 'Places API (New)' sur console.cloud.google.com");
      } else {
        console.warn(`[Google Places] Text Search returned ${searchRes.status}: ${errText.substring(0, 200)}`);
      }
      return null;
    }

    const searchData = await searchRes.json();
    const places: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      addressComponents?: Array<{
        longText?: string;
        types?: string[];
      }>;
    }> = searchData.places || [];

    if (places.length === 0) return null;

    // Find best match: prefer results whose name matches the company name
    const companyLower = companyName.toLowerCase();
    const bestMatch = places.find((p) => {
      const name = p.displayName?.text?.toLowerCase() || "";
      return name.includes(companyLower) || companyLower.includes(name);
    }) || places[0];

    // Extract city from addressComponents
    let extractedCity: string | null = null;
    if (bestMatch.addressComponents) {
      for (const comp of bestMatch.addressComponents) {
        if (comp.types?.includes("locality") || comp.types?.includes("sublocality")) {
          extractedCity = comp.longText || null;
          break;
        }
      }
    }
    // Fallback: extract city from formatted address
    if (!extractedCity && bestMatch.formattedAddress) {
      extractedCity = extractCityFromAddressText(bestMatch.formattedAddress);
    }

    // Validate phone (must have at least 10 digits)
    const rawPhone = bestMatch.nationalPhoneNumber || bestMatch.internationalPhoneNumber || "";
    const phoneDigits = rawPhone.replace(/\D/g, "");
    const validPhone = phoneDigits.length >= 10 ? rawPhone : undefined;

    return {
      title: bestMatch.displayName?.text,
      address: bestMatch.formattedAddress,
      phone: validPhone,
      website: bestMatch.websiteUri,
      city: extractedCity ? normalizeCity(extractedCity) : undefined,
    };
  } catch (err) {
    console.warn("[Google Places] Error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Web search via Google Places (no Serper needed) ─────
interface WebSearchResult {
  website: string | null;
  phone: string | null;
  city: string | null;
  email: string | null;
  address: string | null;
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperSearchPayload {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: {
    website?: string;
    description?: string;
    phoneNumber?: string;
    address?: string;
  };
}

function isLikelyBusinessWebsite(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const blockedHosts = [
      "google.com",
      "maps.google.com",
      "facebook.com",
      "instagram.com",
      "linkedin.com",
      "yelp.ca",
      "yelp.com",
      "canada411.ca",
      "pagesjaunes.ca",
    ];

    return !blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

async function searchSerperWeb(companyName: string, city?: string): Promise<WebSearchResult> {
  const apiKey = process.env.SERPER_API_KEY;
  const empty: WebSearchResult = { website: null, phone: null, city: null, email: null, address: null };

  if (!apiKey) {
    return empty;
  }

  const query = city ? `${companyName} ${city}` : `${companyName} Quebec`;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "ca",
        hl: "fr",
        num: 10,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[Serper] search failed ${res.status}: ${text}`);
      return empty;
    }

    const data = await res.json() as SerperSearchPayload;
    const snippets = [
      data.knowledgeGraph?.description,
      ...(data.organic || []).map((result) => result.snippet),
    ].filter((value): value is string => !!value);

    const website =
      data.knowledgeGraph?.website ||
      (data.organic || [])
        .map((result) => result.link)
        .find((link): link is string => !!link && isLikelyBusinessWebsite(link)) ||
      null;

    let phone: string | null = data.knowledgeGraph?.phoneNumber || null;
    let cityFound: string | null = null;
    let email: string | null = null;
    let address: string | null = data.knowledgeGraph?.address || null;

    for (const snippet of snippets) {
      if (!phone) {
        const phones = extractPhones(snippet);
        if (phones.length > 0) {
          phone = phones[0];
        }
      }

      if (!cityFound) {
        cityFound = extractCityFromAddressText(snippet);
      }

      if (!email) {
        const emails = extractEmails(snippet);
        if (emails.length > 0) {
          email = emails[0];
        }
      }

      if (!address) {
        address = snippet;
      }
    }

    return {
      website,
      phone,
      city: cityFound ? normalizeCity(cityFound) : null,
      email,
      address,
    };
  } catch (err) {
    console.warn("[Serper] Error:", err instanceof Error ? err.message : err);
    return empty;
  }
}

async function searchWebForCompany(companyName: string, city?: string): Promise<WebSearchResult> {
  return searchSerperWeb(companyName, city);
}

// ─── Normalize base URL ─────────────────────────────────
function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    u = `https://${u}`;
  }
  // Remove trailing slash
  return u.replace(/\/+$/, "");
}

function isValidWebsiteCandidate(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const normalized = normalizeBaseUrl(url);
    const hostname = new URL(normalized).hostname.replace(/^www\./, "");
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(hostname);
  } catch {
    return false;
  }
}

async function findFallbackProspectData(prospect: {
  id: string;
  companyName: string;
  city: string | null;
  phone: string | null;
  address: string | null;
}) {
  const updateData: Record<string, unknown> = {};

  console.log(`[enrich:fallback] ${prospect.companyName} — searching Google Maps + Web...`);
  const mapsResult = await searchGoogleMaps(prospect.companyName, prospect.city || undefined);
  console.log(`[enrich:fallback] ${prospect.companyName} — Maps result: ${mapsResult ? `website=${mapsResult.website || "NONE"}, phone=${mapsResult.phone || "NONE"}, city=${mapsResult.city || "NONE"}` : "NULL (API failed or no result)"}`);
  if (mapsResult) {
    if (mapsResult.website && isValidWebsiteCandidate(mapsResult.website)) {
      updateData.website = normalizeBaseUrl(mapsResult.website);
    }
    if (mapsResult.phone && !prospect.phone) updateData.phone = mapsResult.phone;
    if (mapsResult.city && !prospect.city) updateData.city = mapsResult.city;
    if (mapsResult.address && !prospect.address) updateData.address = mapsResult.address;
  }

  const webResult = await searchWebForCompany(prospect.companyName, prospect.city || undefined);
  console.log(`[enrich:fallback] ${prospect.companyName} — Web result: website=${webResult.website || "NONE"}, phone=${webResult.phone || "NONE"}, email=${webResult.email || "NONE"}`);
  if (!updateData.website && webResult.website && isValidWebsiteCandidate(webResult.website)) {
    updateData.website = normalizeBaseUrl(webResult.website);
  }
  if (!updateData.phone && !prospect.phone && webResult.phone) updateData.phone = webResult.phone;
  if (!updateData.city && !prospect.city && webResult.city) updateData.city = webResult.city;
  if (webResult.email) updateData.email = webResult.email;
  if (!updateData.address && !prospect.address && webResult.address) updateData.address = webResult.address;

  return updateData;
}

// ═══════════════════════════════════════════════════════════
// MAIN ENRICHMENT FUNCTION
// ═══════════════════════════════════════════════════════════
export async function enrichProspect(prospectId: string): Promise<{
  email?: string;
  secondaryEmail?: string;
  contactPageUrl?: string;
  linkedinUrl?: string;
  phone?: string;
  city?: string;
  noData?: boolean;
}> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    console.warn(`[enrich] Prospect ${prospectId} not found`);
    return {};
  }

  console.log(`[enrich] START ${prospect.companyName} | website="${prospect.website || "NONE"}" | city="${prospect.city || "NONE"}" | email="${prospect.email || "NONE"}"`);

  if (prospect.website && !isValidWebsiteCandidate(prospect.website)) {
    console.warn(`[enrich] Invalid website cleared for ${prospect.companyName}: "${prospect.website}"`);
    await safeUpdateProspect(prospectId, { website: null });
    prospect.website = null;
  }

  // ── Step 0: If no website, search Google Maps + Web ────
  if (!prospect.website) {
    const updateData = await findFallbackProspectData(prospect);

    if (Object.keys(updateData).length > 0) {
      const updated = await safeUpdateProspect(prospectId, updateData);
      if (updateData.website) {
        // Re-fetch the prospect with the updated website and continue to scraping
        const refreshed = await prisma.prospect.findUnique({ where: { id: prospectId } });
        if (refreshed) {
          Object.assign(prospect, refreshed);
        }
      } else {
        // No website found, but we have data from Maps/Web
        const score = calculateLeadScore(updated!);
        await safeUpdateProspect(prospectId, { leadScore: score, status: "ENRICHED" });
        return {
          phone: (updateData.phone as string) || undefined,
          city: (updateData.city as string) || undefined,
          email: (updateData.email as string) || undefined,
        };
      }
    }
  }

  if (!prospect.website) {
    console.warn(`[enrich] No website found for ${prospect.companyName}`);
    return { noData: true };
  }

  const baseUrl = normalizeBaseUrl(prospect.website);
  let companyDomain: string;
  try {
    const hostname = new URL(baseUrl).hostname.replace(/^www\./, "");
    if (!isValidWebsiteCandidate(baseUrl)) {
      // Clear the invalid website and try Maps + Web search as fallback
      await safeUpdateProspect(prospectId, { website: null });
      prospect.website = null;
      const fallbackData = await findFallbackProspectData(prospect);

      if (Object.keys(fallbackData).length > 0) {
        const updated = await safeUpdateProspect(prospectId, fallbackData);
        if (fallbackData.website) {
          const refreshed = await prisma.prospect.findUnique({ where: { id: prospectId } });
          if (refreshed?.website) {
            prospect.website = refreshed.website;
            companyDomain = new URL(normalizeBaseUrl(refreshed.website)).hostname.replace(/^www\./, "");
          } else {
            const score = calculateLeadScore(updated!);
            await safeUpdateProspect(prospectId, { leadScore: score, status: "ENRICHED" });
            return {
              phone: (fallbackData.phone as string) || undefined,
              city: (fallbackData.city as string) || undefined,
              email: (fallbackData.email as string) || undefined,
            };
          }
        } else {
          const score = calculateLeadScore(updated!);
          await safeUpdateProspect(prospectId, { leadScore: score, status: "ENRICHED" });
          return {
            phone: (fallbackData.phone as string) || undefined,
            city: (fallbackData.city as string) || undefined,
            email: (fallbackData.email as string) || undefined,
          };
        }
      } else {
        return { noData: true };
      }
    } else {
      companyDomain = hostname;
    }
  } catch (err) {
    console.warn(`[enrich] Invalid URL for ${prospect.companyName}: ${prospect.website}`, err);
    await safeUpdateProspect(prospectId, { website: null });
    prospect.website = null;
    const fallbackData = await findFallbackProspectData(prospect);
    if (Object.keys(fallbackData).length === 0) {
      return { noData: true };
    }

    const updated = await safeUpdateProspect(prospectId, fallbackData);
    if (fallbackData.website) {
      const refreshed = await prisma.prospect.findUnique({ where: { id: prospectId } });
      if (refreshed?.website && isValidWebsiteCandidate(refreshed.website)) {
        prospect.website = refreshed.website;
        companyDomain = new URL(normalizeBaseUrl(refreshed.website)).hostname.replace(/^www\./, "");
      } else {
        const score = calculateLeadScore(updated!);
        await safeUpdateProspect(prospectId, { leadScore: score, status: "ENRICHED" });
        return {
          phone: (fallbackData.phone as string) || undefined,
          city: (fallbackData.city as string) || undefined,
          email: (fallbackData.email as string) || undefined,
        };
      }
    } else {
      const score = calculateLeadScore(updated!);
      await safeUpdateProspect(prospectId, { leadScore: score, status: "ENRICHED" });
      return {
        phone: (fallbackData.phone as string) || undefined,
        city: (fallbackData.city as string) || undefined,
        email: (fallbackData.email as string) || undefined,
      };
    }
  }

  const allEmails: string[] = [];
  const mailtoEmails = new Set<string>(); // Track emails found via mailto: links (highest confidence)
  let linkedinUrl: string | null = null;
  let contactPageUrl: string | null = null;
  // Only keep existing phone if it has at least 10 digits (valid)
  const existingPhoneValid = prospect.phone && prospect.phone.replace(/\D/g, "").length >= 10;
  let foundPhone: string | null = existingPhoneValid ? prospect.phone : null;
  let foundCity: string | null = prospect.city || null; // Keep city from Google Places if found in Step 0
  const visitedUrls = new Set<string>();
  let pagesScanned = 0;

  // Helper to process a page (with global page limit)
  async function processPage(url: string): Promise<boolean> {
    if (visitedUrls.has(url)) return false;
    if (pagesScanned >= MAX_PAGES_PER_PROSPECT) return false;
    visitedUrls.add(url);
    pagesScanned++;

    const html = await fetchPage(url);
    if (!html) return false;

    allEmails.push(...extractEmails(html, mailtoEmails));
    if (!linkedinUrl) linkedinUrl = extractLinkedIn(html);
    if (!foundPhone) {
      const phones = extractPhones(html);
      if (phones.length > 0) foundPhone = phones[0];
    }
    if (!foundCity) {
      foundCity = extractCity(html);
    }

    return true;
  }

  // ── Step 1: Homepage ──────────────────────────────────
  const homeHtml = await fetchPage(baseUrl);
  visitedUrls.add(baseUrl);
  if (!homeHtml) {
    console.warn(`[enrich] Homepage FAILED for ${prospect.companyName}: ${baseUrl}`);
  }

  let discoveredContactUrls: string[] = [];
  let discoveredOtherUrls: string[] = [];

  if (homeHtml) {
    const $ = cheerio.load(homeHtml);
    allEmails.push(...extractEmails(homeHtml, mailtoEmails));
    linkedinUrl = extractLinkedIn(homeHtml);
    if (!foundPhone) {
      const phones = extractPhones(homeHtml);
      if (phones.length > 0) foundPhone = phones[0];
    }
    if (!foundCity) {
      foundCity = extractCity(homeHtml);
    }

    // Discover all links from homepage
    const links = findRelevantLinks($, baseUrl);
    discoveredContactUrls = links.contactUrls;
    discoveredOtherUrls = links.otherUrls;
  }

  // ── Step 2: Contact page IMMEDIATELY (most valuable after homepage footer) ──
  // Try discovered contact links first, then common contact paths
  const hasEverything = () => allEmails.length > 0 && foundCity && foundPhone;

  if (!hasEverything()) {
    // 2a: Contact links found on homepage
    for (const url of discoveredContactUrls) {
      await processPage(url);
      if (!contactPageUrl) contactPageUrl = url;
      if (hasEverything()) break;
    }
  }

  if (!hasEverything() || !contactPageUrl) {
    // 2b: Try common contact paths (/contact, /nous-joindre, etc.)
    for (const path of CONTACT_PATHS) {
      if (pagesScanned >= MAX_PAGES_PER_PROSPECT) break;
      const url = `${baseUrl}${path}`;
      if (visitedUrls.has(url)) continue;

      const found = await processPage(url);
      if (found && !contactPageUrl) contactPageUrl = url;

      if (hasEverything() && contactPageUrl) break;
    }
  }

  // ── Step 3: Try https if http failed (or vice versa) ──
  if (!homeHtml) {
    const altProtocol = baseUrl.startsWith("https://")
      ? baseUrl.replace("https://", "http://")
      : baseUrl.replace("http://", "https://");
    const altHtml = await fetchPage(altProtocol);
    if (altHtml) {
      const $ = cheerio.load(altHtml);
      allEmails.push(...extractEmails(altHtml, mailtoEmails));
      linkedinUrl = extractLinkedIn(altHtml);
      const links = findRelevantLinks($, altProtocol);
      discoveredContactUrls = links.contactUrls;
      discoveredOtherUrls = links.otherUrls;
    }
  }

  // ── Step 3b: If website is completely unreachable, use Maps + Web ──
  if (!homeHtml && visitedUrls.size <= 2) {
    const mapsResult = await searchGoogleMaps(prospect.companyName, prospect.city || undefined);
    if (mapsResult) {
      if (mapsResult.phone && !foundPhone) foundPhone = mapsResult.phone;
      if (mapsResult.city && !foundCity) foundCity = mapsResult.city;
    }
    const webResult = await searchWebForCompany(prospect.companyName, prospect.city || undefined);
    if (webResult.phone && !foundPhone) foundPhone = webResult.phone;
    if (webResult.city && !foundCity) foundCity = webResult.city;
    if (webResult.email) allEmails.push(webResult.email);
  }

  // ── Step 4: Check sitemap for more pages ──────────────
  if (!hasEverything()) {
    const sitemapUrls = await findContactPagesFromSitemap(baseUrl);
    for (const url of sitemapUrls.slice(0, 5)) {
      await processPage(url);
      if (!contactPageUrl && allEmails.length > 0) contactPageUrl = url;
      if (hasEverything()) break;
    }
  }

  // ── Step 5: Scan a few other internal pages ───────────
  if (!hasEverything() && discoveredOtherUrls.length > 0) {
    // Prioritize pages that might have address/emails
    const prioritized = discoveredOtherUrls.sort((a, b) => {
      const keywords = ["service", "accueil", "soumission", "devis", "estimation", "quote", "location", "lieu", "bureau", "office"];
      const aScore = keywords.some((kw) => a.toLowerCase().includes(kw)) ? 0 : 1;
      const bScore = keywords.some((kw) => b.toLowerCase().includes(kw)) ? 0 : 1;
      return aScore - bScore;
    });

    // Scan up to 4 more pages
    for (const url of prioritized.slice(0, 4)) {
      if (pagesScanned >= MAX_PAGES_PER_PROSPECT) break;
      await processPage(url);
      if (hasEverything()) break;
    }
  }

  // ── Step 6: Try www / non-www variant ─────────────────
  if (allEmails.length === 0) {
    const urlObj = new URL(baseUrl);
    const variant = urlObj.hostname.startsWith("www.")
      ? baseUrl.replace("www.", "")
      : baseUrl.replace("://", "://www.");
    if (!visitedUrls.has(variant)) {
      await processPage(variant);
    }
  }

  // ── Step 7: Google Maps + Web search fallback ──────────
  if (!hasEverything()) {
    const mapsResult = await searchGoogleMaps(prospect.companyName, prospect.city || foundCity || undefined);
    if (mapsResult) {
      if (!foundCity && mapsResult.city) foundCity = mapsResult.city;
      if (!foundPhone && mapsResult.phone) foundPhone = mapsResult.phone;
    }

    // Also try web search for any remaining missing data
    if (!foundCity || !foundPhone || allEmails.length === 0) {
      const webResult = await searchWebForCompany(prospect.companyName, prospect.city || foundCity || undefined);
      if (!foundCity && webResult.city) foundCity = webResult.city;
      if (!foundPhone && webResult.phone) foundPhone = webResult.phone;
      if (allEmails.length === 0 && webResult.email) allEmails.push(webResult.email);
    }
  }

  // ── Step 8: Guess emails as last resort ───────────────
  // Only guess if NO real emails were found (mailto or otherwise)
  let emailGuessed = false;
  const hasRealEmails = allEmails.length > 0;
  const isValidDomain = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(companyDomain);
  if (!hasRealEmails && isValidDomain) {
    const guesses = [
      `info@${companyDomain}`,
      `contact@${companyDomain}`,
      `admin@${companyDomain}`,
      `reception@${companyDomain}`,
      `direction@${companyDomain}`,
      `ventes@${companyDomain}`,
      `service@${companyDomain}`,
    ];
    allEmails.push(...guesses);
    emailGuessed = true;
  }

  // ── Prioritize & deduplicate emails ───────────────────
  const uniqueEmails = [...new Set(allEmails.map((e) => e.toLowerCase().trim()))];
  const sorted = uniqueEmails.sort(
    (a, b) => scoreEmail(b, companyDomain, mailtoEmails) - scoreEmail(a, companyDomain, mailtoEmails)
  );

  // If the top email was found via mailto: or on the actual site, it's not guessed
  const topEmail = sorted[0]?.toLowerCase();
  const topEmailIsReal = topEmail && (mailtoEmails.has(topEmail) || !emailGuessed);

  const enrichedData = {
    email: sorted[0] || undefined,
    secondaryEmail: sorted[1] || undefined,
    contactPageUrl: contactPageUrl || undefined,
    linkedinUrl: linkedinUrl || undefined,
    emailGuessed: topEmailIsReal ? false : emailGuessed,
    ...(foundPhone ? { phone: foundPhone } : {}),
    ...(foundCity ? { city: foundCity } : {}),
  };

  // Determine if we actually found useful data
  const foundSomething = !!(enrichedData.email || enrichedData.phone || enrichedData.city || enrichedData.linkedinUrl || enrichedData.contactPageUrl);
  const status = foundSomething ? "ENRICHED" : prospect.status;

  // ── Enrichment summary log ─────────────────────────────
  console.log(
    `[enrich] ${prospect.companyName} | website=${prospect.website || "NONE"} | pages=${pagesScanned} | emails=${uniqueEmails.length} (mailto: ${mailtoEmails.size})${enrichedData.emailGuessed ? " (guessed)" : ""} | top=${sorted[0] || "NONE"} score=${sorted[0] ? scoreEmail(sorted[0], companyDomain, mailtoEmails) : 0} | phone=${foundPhone || "NONE"} | city=${foundCity || "NONE"} | linkedin=${linkedinUrl ? "YES" : "NO"} | status=${status}`
  );

  // Update prospect (safe: handles unique constraint conflicts)
  const updatedProspect = await safeUpdateProspect(prospectId, {
    ...enrichedData,
    status,
  });

  // Recalculate lead score
  if (updatedProspect) {
    const score = calculateLeadScore(updatedProspect);
    await safeUpdateProspect(prospectId, { leadScore: score });
  }

  return {
    ...enrichedData,
    noData: !foundSomething,
  };
}

// ─── Per-prospect timeout wrapper (max 90s per prospect) ──
const PROSPECT_TIMEOUT_MS = 90_000;

async function enrichWithTimeout(prospectId: string): Promise<Awaited<ReturnType<typeof enrichProspect>>> {
  return Promise.race([
    enrichProspect(prospectId),
    new Promise<Awaited<ReturnType<typeof enrichProspect>>>((_, reject) =>
      setTimeout(() => reject(new Error("Enrichment timeout (90s)")), PROSPECT_TIMEOUT_MS)
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════
// ENRICH BY IDS (selected prospects, re-enriches already enriched)
// ═══════════════════════════════════════════════════════════
export async function enrichByIds(
  ids: string[]
): Promise<{ enriched: number; total: number; skipped: number; cancelled: boolean; failed: number; noData: number }> {
  const { setEnrichProgress, updateEnrichProgress, isCancelEnrichRequested } = await import("./enrich-progress");

  console.log("[enrichByIds] Received", ids.length, "IDs, first 3:", ids.slice(0, 3));

  const prospects = await prisma.prospect.findMany({
    where: { id: { in: ids }, archivedAt: null },
  });

  console.log("[enrichByIds] Found", prospects.length, "prospects out of", ids.length, "IDs");

  setEnrichProgress({
    status: "running",
    target: prospects.length,
    enriched: 0,
    failed: 0,
    noData: 0,
    currentProspect: "",
    startedAt: Date.now(),
  });

  let enriched = 0;
  let failed = 0;
  let noData = 0;
  for (const prospect of prospects) {
    if (isCancelEnrichRequested()) break;
    updateEnrichProgress({ currentProspect: prospect.companyName });
    try {
      const result = await enrichWithTimeout(prospect.id);
      const foundSomething = !!(result.email || result.phone || result.city || result.linkedinUrl || result.contactPageUrl);
      if (foundSomething) {
        enriched++;
      } else if (result.noData) {
        noData++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : "unknown";
      console.error(`[enrichByIds] Failed for ${prospect.companyName}: ${msg}`);
    }
    updateEnrichProgress({ enriched, failed, noData });
    // Yield DB connection so other pages/requests can query
    await yieldForDb();
  }

  const wasCancelled = isCancelEnrichRequested();
  setEnrichProgress({
    status: wasCancelled ? "cancelled" : "done",
    target: prospects.length,
    enriched,
    failed,
    noData,
    currentProspect: "",
    startedAt: 0,
  });

  // Log activity
  await logActivity({
    action: wasCancelled ? "enrichment_started" : "enrichment_completed",
    type: wasCancelled ? "warning" : (enriched > 0 ? "success" : "info"),
    title: wasCancelled ? "Enrichissement arrêté" : "Enrichissement terminé",
    details: `${enriched} prospect${enriched > 1 ? "s" : ""} enrichi${enriched > 1 ? "s" : ""} sur ${prospects.length}${failed > 0 ? `, ${failed} échoué${failed > 1 ? "s" : ""}` : ""}`,
    metadata: {
      prospects_created: enriched,
      total: prospects.length,
      failed,
      noData,
      cancelled: wasCancelled,
    },
  });

  return { enriched, total: prospects.length, skipped: 0, cancelled: wasCancelled, failed, noData };
}

// ═══════════════════════════════════════════════════════════
// BATCH ENRICHMENT
// ═══════════════════════════════════════════════════════════
export async function enrichBatch(
  limit: number = 10
): Promise<{ enriched: number; total: number; cancelled: boolean; failed: number; noData: number }> {
  const { setEnrichProgress, updateEnrichProgress, isCancelEnrichRequested } = await import("./enrich-progress");

  const prospects = await prisma.prospect.findMany({
    where: { status: "NEW", archivedAt: null },
    take: limit,
    orderBy: { dateDiscovered: "desc" },
  });

  setEnrichProgress({
    status: "running",
    target: prospects.length,
    enriched: 0,
    failed: 0,
    noData: 0,
    currentProspect: "",
    startedAt: Date.now(),
  });

  let enriched = 0;
  let failed = 0;
  let noData = 0;
  for (const prospect of prospects) {
    if (isCancelEnrichRequested()) break;
    updateEnrichProgress({ currentProspect: prospect.companyName });
    try {
      const result = await enrichWithTimeout(prospect.id);
      const foundSomething = !!(result.email || result.phone || result.city || result.linkedinUrl || result.contactPageUrl);
      if (foundSomething) {
        enriched++;
      } else if (result.noData) {
        noData++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      const msg = error instanceof Error ? error.message : "unknown";
      console.error(`[enrichBatch] Failed for ${prospect.companyName}: ${msg}`);
    }
    updateEnrichProgress({ enriched, failed, noData });
    // Yield DB connection so other pages/requests can query
    await yieldForDb();
  }

  const wasCancelled = isCancelEnrichRequested();
  setEnrichProgress({
    status: wasCancelled ? "cancelled" : "done",
    target: prospects.length,
    enriched,
    failed,
    noData,
    currentProspect: "",
    startedAt: 0,
  });

  // Log activity
  await logActivity({
    action: wasCancelled ? "enrichment_started" : "enrichment_completed",
    type: wasCancelled ? "warning" : (enriched > 0 ? "success" : "info"),
    title: wasCancelled ? "Enrichissement batch arrêté" : "Enrichissement batch terminé",
    details: `${enriched} prospect${enriched > 1 ? "s" : ""} enrichi${enriched > 1 ? "s" : ""} sur ${prospects.length}${failed > 0 ? `, ${failed} échoué${failed > 1 ? "s" : ""}` : ""}`,
    metadata: {
      prospects_created: enriched,
      total: prospects.length,
      failed,
      noData,
      cancelled: wasCancelled,
    },
  });

  return { enriched, total: prospects.length, cancelled: wasCancelled, failed, noData };
}
