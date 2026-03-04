// ---------------------------------------------------------------------------
// Burst detector — pauses scanning if too many posts detected in a window.
// Prevents aggressive DOM scanning that could trigger platform detection.
// ---------------------------------------------------------------------------

const BURST_THRESHOLD = 100;     // posts within the window
const BURST_WINDOW_MS = 30_000;  // 30 seconds
const PAUSE_DURATION_MS = 120_000; // 2 minutes

let timestamps: number[] = [];
let paused = false;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;

/** Record a scan event. Returns false if scanning should be paused. */
export function recordScan(): boolean {
  if (paused) return false;

  const now = Date.now();
  timestamps.push(now);

  // Trim entries outside the window
  timestamps = timestamps.filter((t) => now - t < BURST_WINDOW_MS);

  if (timestamps.length > BURST_THRESHOLD) {
    console.warn(
      `[BurstDetector] ${timestamps.length} posts in ${BURST_WINDOW_MS / 1000}s — ` +
      `pausing for ${PAUSE_DURATION_MS / 1000}s`
    );
    paused = true;
    timestamps = [];

    pauseTimer = setTimeout(() => {
      paused = false;
      pauseTimer = null;
      console.log("[BurstDetector] Resuming after cooldown");
    }, PAUSE_DURATION_MS);

    return false;
  }

  return true;
}

/** Check if scanning is currently paused. */
export function isPaused(): boolean {
  return paused;
}

/** Force reset (useful for testing). */
export function reset(): void {
  paused = false;
  timestamps = [];
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}
