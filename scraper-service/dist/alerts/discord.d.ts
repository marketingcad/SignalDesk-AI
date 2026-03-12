import type { Platform, ScrapeResult, ScrapedPost } from "../types";
import type { BatchResponse } from "../api/backendClient";
export declare function sendRunSummary(results: ScrapeResult[]): Promise<void>;
export declare function sendNewLeadsAlert(sourceUrl: string, platform: Platform, posts: ScrapedPost[], batch: BatchResponse): Promise<void>;
export declare function sendErrorAlert(platform: Platform, error: string): Promise<void>;
