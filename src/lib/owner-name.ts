/** Valeur de {{contact_name}} : prénom du propriétaire s'il a été trouvé de façon fiable. */
export function contactGreetingName(prospect: { ownerFirstName?: string | null; ownerConfidence?: string | null }): string {
  if (prospect.ownerFirstName && (prospect.ownerConfidence === "high" || prospect.ownerConfidence === "medium")) {
    return prospect.ownerFirstName;
  }
  return "Madame, Monsieur";
}
