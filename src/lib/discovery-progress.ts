// In-memory progress tracker for discovery jobs
// Uses globalThis to ensure state is shared across module instances (Turbopack)
export interface DiscoveryProgress {
  status: "running" | "done" | "error" | "cancelled";
  target: number;
  found: number;
  newCount: number;
  filteredOut?: number;
  filterPhase?: string;
  currentCity: string;
  round: number;
  startedAt: number;
  totalCities: number;
  completedCities: number;
  error?: string;
  // Résultat final (même forme que l'ancienne réponse du POST), lu par la page à la fin
  result?: Record<string, unknown>;
}

interface DiscoveryState {
  progress: DiscoveryProgress | null;
  cancelRequested: boolean;
}

// Un état par espace de travail : deux espaces ne voient ni n'arrêtent la recherche de l'autre
const GLOBAL_KEY = "__discovery_progress_by_workspace__";
const NO_WORKSPACE = "__none__";

function getState(workspaceId?: string | null): DiscoveryState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, DiscoveryState>();
  const map = g[GLOBAL_KEY] as Map<string, DiscoveryState>;
  const key = workspaceId || NO_WORKSPACE;
  let state = map.get(key);
  if (!state) {
    state = { progress: null, cancelRequested: false };
    map.set(key, state);
  }
  return state;
}

export function getDiscoveryProgress(workspaceId?: string | null): DiscoveryProgress | null {
  return getState(workspaceId).progress;
}

export function setDiscoveryProgress(workspaceId: string | null | undefined, progress: DiscoveryProgress | null) {
  const state = getState(workspaceId);
  state.progress = progress;
  if (progress === null || progress.status === "running") {
    state.cancelRequested = false;
  }
}

export function updateDiscoveryProgress(workspaceId: string | null | undefined, update: Partial<DiscoveryProgress>) {
  const state = getState(workspaceId);
  if (state.progress) {
    Object.assign(state.progress, update);
  }
}

export function requestCancelDiscovery(workspaceId?: string | null) {
  getState(workspaceId).cancelRequested = true;
}

export function isCancelRequested(workspaceId?: string | null): boolean {
  return getState(workspaceId).cancelRequested;
}
