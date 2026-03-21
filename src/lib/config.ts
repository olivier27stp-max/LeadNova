export const DAILY_EMAIL_LIMIT = parseInt(
  process.env.DAILY_EMAIL_LIMIT || "100",
  10
);

export const DAILY_DISCOVERY_LIMIT = Infinity;

export const EMAIL_DELAY_MIN_SECONDS = 120;
export const EMAIL_DELAY_MAX_SECONDS = 300;

export const COMPANY_INFO = {
  name: process.env.COMPANY_NAME || "",
  services: [
    "nettoyage de vitres",
    "nettoyage de gouttières",
    "lavage de surfaces extérieures",
  ],
  contactName: process.env.CONTACT_NAME || "Olivier",
  email: process.env.SMTP_FROM || "contact@freeleads.app",
};
