import type { Platform, ScrapeResult } from "../types";
export declare function isRunning(): boolean;
export declare function runPlatform(platform: Platform): Promise<ScrapeResult>;
export declare function runAllPlatforms(): Promise<ScrapeResult[]>;
