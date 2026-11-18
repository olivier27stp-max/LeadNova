// Options du journal d'appels (partagées entre l'API et l'interface)

export const CALL_OUTCOMES = {
  NO_ANSWER: "Pas de réponse",
  VOICEMAIL: "Boîte vocale",
  WRONG_NUMBER: "Mauvais numéro",
  REFUSED: "Refus",
  CALLBACK: "Rappeler",
  CONNECTED: "Conversation",
  DEMO_BOOKED: "Démo prise",
} as const;

export const CALL_WHO = {
  OWNER: "Propriétaire",
  EMPLOYEE: "Employé",
  RECEPTIONIST: "Réceptionniste",
  UNKNOWN: "Inconnu",
} as const;

export const CURRENT_TOOLS = {
  JOBBER: "Jobber",
  HOUSECALL: "Housecall Pro",
  OTHER_CRM: "Autre CRM",
  GOOGLE_FORMS: "Formulaire Google / site",
  EXCEL: "Excel / Sheets",
  PAPER: "Papier / agenda",
  NONE: "Rien",
  OTHER: "Autre",
} as const;

export const OBJECTIONS = {
  NONE: "Aucune",
  PRICE: "Prix",
  TIMING: "Pas le bon moment",
  HAS_TOOL: "A déjà un outil",
  NO_NEED: "Pas besoin",
  OTHER: "Autre",
} as const;

export const SALES_STAGES = {
  DEMO_BOOKED: "Démo prise",
  DEMO_DONE: "Démo faite",
  TRIAL: "Essai gratuit",
  WON: "Vendu",
  LOST: "Perdu",
} as const;

export const LOST_REASONS = {
  PRICE: "Prix",
  TIMING: "Timing",
  COMPETITOR: "A choisi un concurrent",
  NO_NEED: "Pas besoin",
  NO_RESPONSE: "Ne répond plus",
  OTHER: "Autre",
} as const;

/** Issues où on a vraiment parlé à quelqu'un (signal d'engagement) */
export const CONNECTED_OUTCOMES = new Set(["REFUSED", "CALLBACK", "CONNECTED", "DEMO_BOOKED"]);
