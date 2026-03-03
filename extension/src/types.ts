export type Platform = "Facebook" | "LinkedIn" | "Reddit" | "X";

export interface ExtractedPost {
  platform: Platform;
  text: string;
  username: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;
}

export interface DetectedMessage {
  type: "POST_DETECTED";
  payload: ExtractedPost;
}

export interface PlatformToggles {
  Facebook: boolean;
  LinkedIn: boolean;
  Reddit: boolean;
  X: boolean;
}

export interface Stats {
  totalSent: number;
  byPlatform: Record<string, number>;
  lastSentAt: string | null;
  errors: number;
}

// ---------------------------------------------------------------------------
// Auto-Monitor types
// ---------------------------------------------------------------------------

export interface MonitoredUrl {
  id: string;
  url: string;
  platform: Platform;
  label: string;
  enabled: boolean;
}

export interface AutoMonitorConfig {
  urls: MonitoredUrl[];
  intervalMinutes: number;
  isRunning: boolean;
  scrollDurationMs: number;
  scrollStepPx: number;
  scrollIntervalMs: number;
}

export interface MonitoredTabMap {
  [urlId: string]: number | null;
}

export interface StartAutoScrollMessage {
  type: "START_AUTO_SCROLL";
  scrollStepPx: number;
  scrollIntervalMs: number;
  durationMs: number;
}

export interface StopAutoScrollMessage {
  type: "STOP_AUTO_SCROLL";
}

export interface StartAutoMonitorMessage {
  type: "START_AUTO_MONITOR";
}

export interface StopAutoMonitorMessage {
  type: "STOP_AUTO_MONITOR";
}

export interface GetAutoMonitorStatusMessage {
  type: "GET_AUTO_MONITOR_STATUS";
}
