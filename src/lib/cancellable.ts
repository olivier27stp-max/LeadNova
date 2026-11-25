// Arrêt rapide des tâches longues (découverte, enrichissement) :
// le bouton « Arrêter » pose un drapeau ; sans ceci, la boucle ne le voyait qu'après
// l'étape en cours (jusqu'à 90 s par prospect, plus encore pour une recherche Google Maps).

export class CancelledError extends Error {
  constructor() {
    super("Arrêté par l'utilisateur");
    this.name = "CancelledError";
  }
}

/**
 * Attend `work`, mais rejette avec CancelledError dès que `isCancelled()` devient vrai
 * (vérifié toutes les `intervalMs`). Le travail déjà lancé n'est pas interrompu :
 * on arrête seulement de l'attendre, pour que la boucle sorte tout de suite.
 */
export async function untilCancelled<T>(
  work: Promise<T>,
  isCancelled: () => boolean,
  intervalMs = 500
): Promise<T> {
  if (isCancelled()) {
    work.catch(() => {});
    throw new CancelledError();
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      if (isCancelled()) reject(new CancelledError());
    }, intervalMs);
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    if (timer) clearInterval(timer);
    work.catch(() => {}); // pas de rejet non géré si on a cessé d'attendre
  }
}
