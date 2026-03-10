"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLeadsBatch = sendLeadsBatch;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const client = axios_1.default.create({
    baseURL: config_1.config.backendApiUrl,
    timeout: config_1.config.requestTimeoutMs,
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config_1.config.backendAuthToken}`,
        "X-Source": "signaldesk-scraper",
    },
});
async function sendLeadsBatch(posts) {
    if (posts.length === 0) {
        console.log("[backend] No posts to send");
        return null;
    }
    console.log(`[backend] Sending ${posts.length} posts to ${config_1.config.backendApiUrl}/api/leads/batch`);
    try {
        const { data } = await client.post("/api/leads/batch", {
            posts,
        });
        console.log(`[backend] Response: ${data.inserted} inserted, ${data.duplicates} duplicates`);
        return data;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[backend] Failed to send batch: ${message}`);
        if (axios_1.default.isAxiosError(err) && err.response) {
            console.error(`[backend] Status: ${err.response.status}`, err.response.data);
        }
        return null;
    }
}
//# sourceMappingURL=backendClient.js.map