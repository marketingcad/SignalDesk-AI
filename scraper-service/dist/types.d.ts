export type Platform = "Facebook" | "LinkedIn" | "Reddit" | "X" | "Other";
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
export interface UrlScrapeItemResult {
    url: string;
    success: boolean;
    platform: Platform | null;
    postsFound: number;
    duration: number;
    errors: string[];
    batch: {
        inserted: number;
        duplicates: number;
        results: Array<{
            url: string;
            leadId?: string;
            intentScore?: number;
            intentLevel?: string;
            matchedKeywords?: string[];
            duplicate?: boolean;
            error?: string;
        }>;
    } | null;
    scrapedPosts: Array<{
        author: string;
        text: string;
        url: string;
        platform: Platform;
        timestamp: string;
        matchedKeywords: string[];
    }>;
}
export type ScheduleStatus = "active" | "paused";
export interface UrlSchedule {
    id: string;
    name: string;
    url: string;
    cron: string;
    status: ScheduleStatus;
    createdAt: string;
    updatedAt: string;
    lastRunAt: string | null;
    lastRunStatus: "ok" | "error" | null;
    totalRuns: number;
}
export interface CreateScheduleInput {
    name: string;
    url: string;
    cron: string;
    status?: ScheduleStatus;
}
export interface UpdateScheduleInput {
    name?: string;
    url?: string;
    cron?: string;
    status?: ScheduleStatus;
}
