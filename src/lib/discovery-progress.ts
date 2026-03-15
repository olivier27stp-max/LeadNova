// In-memory progress tracker for discovery jobs
// Uses globalThis to ensure state is shared across module instances (Turbopack)
export interface DiscoveryProgress {
  status: "running" | "done" | "error" | "cancelled";
  target: number;
  found: number;
  newCount: number;
  currentCity: string;
  round: number;
  startedAt: number;
  totalCities: number;
  completedCities: number;
  error?: string;
}

interface DiscoveryState {
  progress: DiscoveryProgress | null;
  cancelRequested: boolean;
}

const GLOBAL_KEY = "__discovery_progress__";

function getState(): DiscoveryState {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      progress: null,
      cancelRequested: false,
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as DiscoveryState;
}

export function getDiscoveryProgress(): DiscoveryProgress | null {
  return getState().progress;
}

export function setDiscoveryProgress(progress: DiscoveryProgress | null) {
  const state = getState();
  state.progress = progress;
  if (progress === null || progress.status === "running") {
    state.cancelRequested = false;
  }
}

export function updateDiscoveryProgress(update: Partial<DiscoveryProgress>) {
  const state = getState();
  if (state.progress) {
    Object.assign(state.progress, update);
  }
}

export function requestCancelDiscovery() {
  getState().cancelRequested = true;
}

export function isCancelRequested(): boolean {
  return getState().cancelRequested;
}
