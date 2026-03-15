export const TARGET_INDUSTRIES = [
  "Property Management",
  "Condominium Management",
  "Commercial Property Management",
  "Facility Management",
  "Real Estate Asset Management",
  "Building Maintenance",
  "Gestion immobilière",
  "Gestion de copropriété",
  "Gestion de propriétés commerciales",
  "Gestion d'immeubles",
  "Entretien de bâtiments",
];

export const TARGET_CITIES = [
  "Montréal",
  "Québec",
  "Sherbrooke",
  "Drummondville",
  "Trois-Rivières",
  "Granby",
];

export const SEARCH_QUERIES = [
  "property management {city}",
  "gestion immobilière {city}",
  "condo management {city}",
  "gestion de copropriété {city}",
  "building management {city}",
  "facility management {city}",
  "gestion d'immeubles {city}",
  "commercial property management {city}",
];

export const DAILY_EMAIL_LIMIT = parseInt(
  process.env.DAILY_EMAIL_LIMIT || "30",
  10
);

export const DAILY_DISCOVERY_LIMIT = Infinity;

export const EMAIL_DELAY_MIN_SECONDS = 120;
export const EMAIL_DELAY_MAX_SECONDS = 300;

export const COMPANY_INFO = {
  name: process.env.COMPANY_NAME || "Free Leads",
  services: [
    "nettoyage de vitres",
    "nettoyage de gouttières",
    "lavage de surfaces extérieures",
  ],
  contactName: process.env.CONTACT_NAME || "Olivier",
  email: process.env.SMTP_FROM || "contact@freeleads.app",
};
