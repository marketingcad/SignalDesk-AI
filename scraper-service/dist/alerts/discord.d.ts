import type { Platform, ScrapeResult } from "../types";
export declare function sendRunSummary(results: ScrapeResult[]): Promise<void>;
export declare function sendErrorAlert(platform: Platform, error: string): Promise<void>;
