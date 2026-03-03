import type { StartAutoScrollMessage } from "../types";

let scrollIntervalHandle: ReturnType<typeof setInterval> | null = null;
let scrollStopTimeout: ReturnType<typeof setTimeout> | null = null;

export function startAutoScroll(config: StartAutoScrollMessage): void {
  stopAutoScroll();

  console.log(
    `[SignalDesk] [AutoScroll] Starting: step=${config.scrollStepPx}px, interval=${config.scrollIntervalMs}ms, duration=${config.durationMs}ms`
  );

  scrollIntervalHandle = setInterval(() => {
    window.scrollBy({ top: config.scrollStepPx, behavior: "smooth" });
  }, config.scrollIntervalMs);

  scrollStopTimeout = setTimeout(() => {
    stopAutoScroll();
    console.log("[SignalDesk] [AutoScroll] Stopped — duration elapsed, waiting for reload");
  }, config.durationMs);
}

export function stopAutoScroll(): void {
  if (scrollIntervalHandle !== null) {
    clearInterval(scrollIntervalHandle);
    scrollIntervalHandle = null;
  }
  if (scrollStopTimeout !== null) {
    clearTimeout(scrollStopTimeout);
    scrollStopTimeout = null;
  }
}
