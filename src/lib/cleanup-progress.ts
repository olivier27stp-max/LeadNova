// In-memory progress tracker for cleanup jobs
export interface CleanupProgress {
  status: "running" | "done" | "cancelled";
  checked: number;
  total: number;
  archived: number;
  currentProspect: string;
  startedAt: number;
}

interface CleanupState {
  progress: CleanupProgress | null;
  cancelRequested: boolean;
}

const GLOBAL_KEY = "__cleanup_progress__";

function getState(): CleanupState {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      progress: null,
      cancelRequested: false,
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CleanupState;
}

export function getCleanupProgress(): CleanupProgress | null {
  return getState().progress;
}

export function setCleanupProgress(progress: CleanupProgress | null) {
  const state = getState();
  state.progress = progress;
  if (progress === null || progress.status === "running") {
    state.cancelRequested = false;
  }
}

export function updateCleanupProgress(update: Partial<CleanupProgress>) {
  const state = getState();
  if (state.progress) {
    Object.assign(state.progress, update);
  }
}

export function requestCancelCleanup() {
  getState().cancelRequested = true;
}

export function isCleanupCancelRequested(): boolean {
  return getState().cancelRequested;
}
