// In-memory progress tracker for enrich jobs
// Uses globalThis to ensure state is shared across module instances (Turbopack)
export interface EnrichProgress {
  status: "running" | "done" | "error" | "cancelled";
  target: number;
  enriched: number;
  failed: number;
  noData: number;
  currentProspect: string;
  startedAt: number;
}

interface EnrichState {
  progress: EnrichProgress | null;
  cancelRequested: boolean;
}

const GLOBAL_KEY = "__enrich_progress__";

function getState(): EnrichState {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      progress: null,
      cancelRequested: false,
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as EnrichState;
}

export function getEnrichProgress(): EnrichProgress | null {
  return getState().progress;
}

export function setEnrichProgress(progress: EnrichProgress | null) {
  const state = getState();
  state.progress = progress;
  if (progress === null || progress.status === "running") {
    state.cancelRequested = false;
  }
}

export function updateEnrichProgress(update: Partial<EnrichProgress>) {
  const state = getState();
  if (state.progress) {
    Object.assign(state.progress, update);
  }
}

export function requestCancelEnrich() {
  getState().cancelRequested = true;
}

export function isCancelEnrichRequested(): boolean {
  return getState().cancelRequested;
}

export function isEnrichRunning(): boolean {
  return getState().progress?.status === "running";
}
