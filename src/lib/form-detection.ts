import * as cheerio from "cheerio";

/**
 * Détection des formulaires de contact / demande de soumission sur le site d'un prospect.
 *
 * Sert à segmenter les campagnes :
 *  - HAS_FORM   → le prospect reçoit déjà ses demandes par un formulaire (message A)
 *  - NO_FORM    → site sans formulaire détecté (message B)
 *  - NO_WEBSITE → aucun site web (message B)
 *  - UNREACHABLE → site injoignable lors de l'analyse (message A par défaut)
 *  - null       → pas encore analysé (message A par défaut)
 *
 * On repère aussi les CRM concurrents (Jobber, Housecall Pro…) : c'est le meilleur
 * signal d'achat pour Lume (ils paient déjà un CRM → argument migration).
 */

export type ContactFormStatus = "HAS_FORM" | "NO_FORM" | "NO_WEBSITE" | "UNREACHABLE";

export interface FormDetection {
  hasForm: boolean;
  provider: string | null;
  competitorCrm: string | null;
}

// CRM de services à domicile — leurs formulaires de demande / réservation sont hébergés chez eux
const CRM_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "Jobber", pattern: /clienthub\.getjobber\.com|getjobber\.com|jobber-?(work-?request|embed|forms?)/i },
  { name: "Housecall Pro", pattern: /housecallpro\.com|housecall-?pro/i },
  { name: "ServiceTitan", pattern: /servicetitan\.(com|io)|scheduler\.servicetitan/i },
  { name: "Workiz", pattern: /workiz\.com/i },
  { name: "ServiceM8", pattern: /servicem8\.com/i },
  { name: "GorillaDesk", pattern: /gorilladesk\.com/i },
  { name: "Markate", pattern: /markate\.com/i },
  { name: "Kickserv", pattern: /kickserv\.com/i },
  { name: "FieldEdge", pattern: /fieldedge\.com/i },
  { name: "Service Autopilot", pattern: /serviceautopilot\.com/i },
  { name: "Yardbook", pattern: /yardbook\.com/i },
  { name: "LMN", pattern: /golmn\.com/i },
  { name: "ResponsiBid", pattern: /responsibid\.com/i },
  { name: "Arborgold", pattern: /arborgold\.com/i },
];

// Outils de formulaires (souvent injectés en JavaScript, donc invisibles comme <form> dans le HTML brut)
const FORM_TOOL_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "Google Forms", pattern: /docs\.google\.com\/forms|forms\.gle\//i },
  { name: "Typeform", pattern: /typeform\.com\/to\/|embed\.typeform\.com|data-tf-widget/i },
  { name: "JotForm", pattern: /jotform\.(com|ca)|jotfor\.ms/i },
  { name: "HubSpot", pattern: /js\.hsforms\.net|hbspt\.forms\.create|\bhs-form\b/i },
  { name: "Wufoo", pattern: /wufoo\.com/i },
  { name: "Formstack", pattern: /formstack\.com/i },
  { name: "Tally", pattern: /tally\.so\//i },
  { name: "Cognito Forms", pattern: /cognitoforms\.com/i },
  { name: "Zoho Forms", pattern: /forms\.zoho(public)?\.(com|ca)/i },
  { name: "Microsoft Forms", pattern: /forms\.office\.com|forms\.microsoft\.com/i },
  { name: "Calendly", pattern: /calendly\.com\/[a-z0-9_-]+/i },
  { name: "GoHighLevel", pattern: /leadconnectorhq\.com|msgsndr\.com/i },
  { name: "WordPress (Contact Form 7)", pattern: /wpcf7/i },
  { name: "WordPress (Gravity Forms)", pattern: /gform_wrapper|gform_fields/i },
  { name: "WordPress (WPForms)", pattern: /wpforms-form|wpforms-container/i },
  { name: "WordPress (Ninja Forms)", pattern: /nf-form-cont|ninja-forms/i },
  { name: "WordPress (Formidable)", pattern: /frm_forms|frm-show-form/i },
  { name: "WordPress (Fluent Forms)", pattern: /fluentform/i },
  { name: "Elementor", pattern: /elementor-form/i },
  { name: "Divi", pattern: /et_pb_contact_form/i },
  { name: "Wix", pattern: /wixforms|wix-forms|"formFields"/i },
  { name: "Squarespace", pattern: /sqs-block-form|form-wrapper.*squarespace|squarespace.*form-block/i },
  { name: "GoDaddy", pattern: /widget-form-|data-aid="CONTACT_FORM/i },
  { name: "Weebly", pattern: /\bwsite-form/i },
  { name: "Webflow", pattern: /class="[^"]*\bw-form\b/i },
  { name: "Shopify", pattern: /id="contact_form"|form_type"\s*value="contact"/i },
  { name: "Formspree", pattern: /formspree\.io/i },
  { name: "Netlify Forms", pattern: /data-netlify="true"|netlify-honeypot/i },
];

function detectCrm(html: string): string | null {
  for (const sig of CRM_SIGNATURES) {
    if (sig.pattern.test(html)) return sig.name;
  }
  return null;
}

function detectFormTool(html: string): string | null {
  for (const sig of FORM_TOOL_SIGNATURES) {
    if (sig.pattern.test(html)) return sig.name;
  }
  return null;
}

/**
 * Un vrai formulaire de contact HTML : un champ message (textarea) ou au moins
 * un champ courriel/téléphone + 2 autres champs. On exclut la recherche et les
 * formulaires d'infolettre (un seul champ courriel).
 */
function hasNativeContactForm(html: string): boolean {
  const $ = cheerio.load(html);
  let found = false;
  $("form").each((_, el) => {
    if (found) return;
    const form = $(el);
    const action = (form.attr("action") || "").toLowerCase();
    const role = (form.attr("role") || "").toLowerCase();
    const idClass = `${form.attr("id") || ""} ${form.attr("class") || ""}`.toLowerCase();
    if (role === "search" || /search|recherche/.test(action) || /search|recherche|login|connexion|cart|panier/.test(idClass)) return;

    const fields = form.find("input, textarea, select").filter((_, f) => {
      const type = ($(f).attr("type") || "text").toLowerCase();
      return !["hidden", "submit", "button", "checkbox", "radio", "image", "reset"].includes(type);
    });
    const hasTextarea = form.find("textarea").length > 0;
    const hasEmailOrTel = form.find('input[type="email"], input[type="tel"], input[name*="mail" i], input[name*="phone" i], input[name*="tel" i]').length > 0;

    if (hasTextarea && fields.length >= 2) found = true;
    else if (hasEmailOrTel && fields.length >= 3) found = true;
  });
  return found;
}

/**
 * Page anti-robot (Cloudflare, Sucuri, captcha…) ou page d'erreur : elle ne dit rien du vrai site.
 * On ne la compte pas, sinon le prospect serait classé « sans formulaire » à tort.
 */
export function isBlockedPage(html: string): boolean {
  if (html.length > 60_000) return false; // une vraie page complète
  return /just a moment\.\.\.|cf-challenge|challenge-platform|cf_chl_|attention required! \| cloudflare|sucuri website firewall|access denied|request unsuccessful\. incapsula|g-recaptcha[^>]*data-callback="onSubmit"[\s\S]{0,200}verify you are human|verify you are human|ddos-guard/i.test(html);
}

/** Analyse une page HTML. */
export function detectFormsInHtml(html: string): FormDetection {
  const competitorCrm = detectCrm(html);
  if (competitorCrm) {
    // Un lien/iframe vers le portail du CRM = formulaire de demande hébergé par le CRM
    return { hasForm: true, provider: competitorCrm, competitorCrm };
  }
  const tool = detectFormTool(html);
  if (tool) return { hasForm: true, provider: tool, competitorCrm: null };
  if (hasNativeContactForm(html)) return { hasForm: true, provider: "Formulaire HTML", competitorCrm: null };
  return { hasForm: false, provider: null, competitorCrm: null };
}

/**
 * Accumule les détections sur plusieurs pages d'un même site.
 * Priorité : CRM concurrent > outil de formulaire nommé > formulaire HTML générique.
 */
export class FormDetectionAccumulator {
  private pagesAnalyzed = 0;
  private provider: string | null = null;
  private crm: string | null = null;

  add(html: string | null | undefined) {
    if (!html || isBlockedPage(html)) return;
    this.pagesAnalyzed++;
    const d = detectFormsInHtml(html);
    if (d.competitorCrm && !this.crm) this.crm = d.competitorCrm;
    if (d.hasForm) {
      if (!this.provider || this.provider === "Formulaire HTML") this.provider = d.provider;
    }
    if (this.crm) this.provider = this.crm;
  }

  get hasForm() {
    return !!this.provider;
  }

  /** Champs Prisma à écrire. Retourne null si aucune page n'a pu être lue (statut inconnu). */
  toProspectFields(): { contactFormStatus: ContactFormStatus; contactFormProvider: string | null; competitorCrm: string | null } | null {
    if (this.pagesAnalyzed === 0) return null;
    return {
      contactFormStatus: this.provider ? "HAS_FORM" : "NO_FORM",
      contactFormProvider: this.provider,
      competitorCrm: this.crm,
    };
  }
}

/** Le prospect doit-il recevoir la variante « sans formulaire » ? */
export function usesNoFormVariant(status: string | null | undefined): boolean {
  return status === "NO_FORM" || status === "NO_WEBSITE";
}

/**
 * Choisit le sujet et le corps à envoyer selon le segment du prospect.
 * Si la variante « sans formulaire » n'est pas rédigée, on retombe sur le message principal.
 */
export function pickCampaignMessage(
  campaign: { emailSubject: string; emailBody: string; emailSubjectNoForm?: string | null; emailBodyNoForm?: string | null },
  prospect: { contactFormStatus?: string | null }
): { subject: string; body: string; variant: "form" | "no_form" } {
  if (usesNoFormVariant(prospect.contactFormStatus) && campaign.emailBodyNoForm?.trim()) {
    return {
      subject: campaign.emailSubjectNoForm?.trim() || campaign.emailSubject,
      body: campaign.emailBodyNoForm,
      variant: "no_form",
    };
  }
  return { subject: campaign.emailSubject, body: campaign.emailBody, variant: "form" };
}

/** Valeur de la variable {{form_provider}} dans les gabarits. */
export function formProviderLabel(prospect: { contactFormProvider?: string | null }): string {
  const p = prospect.contactFormProvider;
  if (!p || p === "Formulaire HTML") return "votre formulaire de contact";
  return p;
}
