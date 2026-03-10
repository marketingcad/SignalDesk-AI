export type Platform = "Facebook" | "LinkedIn" | "Reddit" | "X";

export interface ScrapedPost {
  platform: Platform;
  author: string;
  text: string;
  url: string;
  timestamp: string;
  engagement: number;
  source: string;
}

export interface ScrapeResult {
  platform: Platform;
  posts: ScrapedPost[];
  duration: number;
  errors: string[];
}

export interface ScraperModule {
  name: Platform;
  scrape(): Promise<ScrapeResult>;
}
