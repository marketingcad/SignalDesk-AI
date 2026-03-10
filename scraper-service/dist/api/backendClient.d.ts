import type { ScrapedPost } from "../types";
export interface BatchResponse {
    success: boolean;
    processed: number;
    inserted: number;
    duplicates: number;
    results: Array<{
        url: string;
        leadId?: string;
        intentScore?: number;
        intentLevel?: string;
        duplicate?: boolean;
        error?: string;
    }>;
}
export declare function sendLeadsBatch(posts: ScrapedPost[]): Promise<BatchResponse | null>;
