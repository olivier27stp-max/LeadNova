/**
 * ETA Calculator with exponential moving average smoothing.
 *
 * Produces stable, credible time-remaining estimates that don't jump
 * around wildly on every poll tick.
 */

export interface EtaSnapshot {
  /** Percentage 0-100 */
  percent: number;
  /** Smoothed seconds remaining (NaN when not enough data) */
  remainingSeconds: number;
  /** Estimated completion time (Date) or null */
  estimatedEnd: Date | null;
  /** Items processed per minute (smoothed) */
  itemsPerMinute: number;
  /** Human-readable remaining time string */
  remainingLabel: string;
  /** Human-readable estimated end time "HH:MM" */
  endTimeLabel: string;
  /** Human-readable speed */
  speedLabel: string;
}

const EMA_ALPHA = 0.3; // smoothing factor – 0 = very smooth, 1 = no smoothing
const MIN_ELAPSED_MS = 2000; // don't estimate until 2 s have passed

/**
 * Computes a smoothed ETA snapshot.
 *
 * @param processed  Items completed so far
 * @param total      Total items expected
 * @param startedAt  Timestamp (ms) when the job started
 * @param prevRate   Previous smoothed rate (items/ms) – pass null on first call
 * @param sampleCount How many times we've called this (for min-samples gate)
 * @returns [snapshot, newSmoothedRate, newSampleCount]
 */
export function computeEta(
  processed: number,
  total: number,
  startedAt: number,
  prevRate: number | null,
  sampleCount: number,
): [EtaSnapshot, number | null, number] {
  const now = Date.now();
  const elapsedMs = now - startedAt;
  const percent = total > 0 ? Math.min(100, (processed / total) * 100) : 0;

  // Not enough data yet
  if (
    processed <= 0 ||
    total <= 0 ||
    elapsedMs < MIN_ELAPSED_MS
  ) {
    return [
      {
        percent,
        remainingSeconds: NaN,
        estimatedEnd: null,
        itemsPerMinute: 0,
        remainingLabel: "Calcul en cours…",
        endTimeLabel: "",
        speedLabel: "",
      },
      prevRate,
      sampleCount + 1,
    ];
  }

  // Instantaneous rate (items per ms)
  const instantRate = processed / elapsedMs;

  // Exponential moving average
  const smoothedRate =
    prevRate === null
      ? instantRate
      : EMA_ALPHA * instantRate + (1 - EMA_ALPHA) * prevRate;

  const remaining = total - processed;
  const remainingMs = smoothedRate > 0 ? remaining / smoothedRate : 0;
  const remainingSeconds = Math.max(0, Math.round(remainingMs / 1000));

  const estimatedEnd = new Date(now + remainingMs);
  const itemsPerMinute = smoothedRate * 60_000;

  return [
    {
      percent,
      remainingSeconds,
      estimatedEnd,
      itemsPerMinute,
      remainingLabel: formatDuration(remainingSeconds),
      endTimeLabel: formatTime(estimatedEnd),
      speedLabel: `~${Math.round(itemsPerMinute)} /min`,
    },
    smoothedRate,
    sampleCount + 1,
  ];
}

// --------------- Formatting helpers ---------------

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "Presque terminé";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    if (minutes === 0) return `Environ ${hours} h restante${hours > 1 ? "s" : ""}`;
    return `Environ ${hours} h ${minutes} min restantes`;
  }
  if (minutes > 0) {
    return `Environ ${minutes} min ${seconds > 0 && minutes < 5 ? `${seconds} s` : ""} restantes`.replace(/\s+/g, " ");
  }
  return `${seconds} s restantes`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}
