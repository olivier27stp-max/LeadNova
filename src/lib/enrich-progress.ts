// In-memory progress tracker for enrich jobs — scoped per workspace
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

const GLOBAL_KEY = "__enrich_progress_map__";

function getMap(): Map<string, EnrichState> {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<string, EnrichState>();
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<string, EnrichState>;
}

function getState(workspaceId: string = "default"): EnrichState {
  const map = getMap();
  if (!map.has(workspaceId)) {
    map.set(workspaceId, { progress: null, cancelRequested: false });
  }
  return map.get(workspaceId)!;
}

export function getEnrichProgress(workspaceId: string = "default"): EnrichProgress | null {
  return getState(workspaceId).progress;
}

export function setEnrichProgress(progress: EnrichProgress | null, workspaceId: string = "default") {
  const state = getState(workspaceId);
  state.progress = progress;
  if (progress === null || progress.status === "running") {
    state.cancelRequested = false;
  }
}

export function updateEnrichProgress(update: Partial<EnrichProgress>, workspaceId: string = "default") {
  const state = getState(workspaceId);
  if (state.progress) {
    Object.assign(state.progress, update);
  }
}

export function requestCancelEnrich(workspaceId: string = "default") {
  getState(workspaceId).cancelRequested = true;
}

export function isCancelEnrichRequested(workspaceId: string = "default"): boolean {
  return getState(workspaceId).cancelRequested;
}

export function isEnrichRunning(workspaceId: string = "default"): boolean {
  return getState(workspaceId).progress?.status === "running";
}
