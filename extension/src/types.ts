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
