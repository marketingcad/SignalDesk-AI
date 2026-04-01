"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
const cron = __importStar(require("node-cron"));
const config_1 = require("../config");
const crawlerManager_1 = require("../crawler/crawlerManager");
const backendClient_1 = require("../api/backendClient");
const activeTasks = [];
function scheduleJob(platform, expression, label) {
    if (!cron.validate(expression)) {
        console.warn(`[scheduler] Invalid cron expression for ${platform}: "${expression}" — skipping`);
        return;
    }
    const task = cron.schedule(expression, async () => {
        if ((0, crawlerManager_1.isRunning)()) {
            console.log(`[scheduler] ${platform} — skipped (another run in progress)`);
            return;
        }
        console.log(`[scheduler] ${platform} — triggered by cron (${expression})`);
        try {
            // Refresh keywords from /settings before each cron run
            await (0, backendClient_1.fetchKeywords)(true).catch(() => console.warn(`[scheduler] ${platform} — keyword refresh failed, using cached`));
            await (0, crawlerManager_1.runPlatform)(platform);
        }
        catch (err) {
            console.error(`[scheduler] ${platform} cron job failed:`, err);
        }
    });
    activeTasks.push(task);
    console.log(`[scheduler] ✅ ${label} scheduled: ${expression}`);
}
function startScheduler() {
    console.log("\n[scheduler] ═══════════════════════════════════");
    console.log("[scheduler] Starting cron scheduler...");
    console.log("[scheduler] ═══════════════════════════════════\n");
    scheduleJob("Reddit", config_1.config.cron.reddit, "Reddit (subreddit search)");
    scheduleJob("X", config_1.config.cron.x, "X/Twitter (Google dork)");
    scheduleJob("LinkedIn", config_1.config.cron.linkedin, "LinkedIn (Google dork)");
    scheduleJob("Facebook", config_1.config.cron.facebook, "Facebook (Google dork)");
    // Full run every 6 hours (free-tier friendly)
    const fullRunTask = cron.schedule("0 */6 * * *", async () => {
        if ((0, crawlerManager_1.isRunning)()) {
            console.log("[scheduler] Full run — skipped (another run in progress)");
            return;
        }
        console.log("[scheduler] Full scraper run — triggered by cron");
        try {
            // Refresh keywords from /settings before full run
            await (0, backendClient_1.fetchKeywords)(true).catch(() => console.warn("[scheduler] Full run — keyword refresh failed, using cached"));
            await (0, crawlerManager_1.runAllPlatforms)();
        }
        catch (err) {
            console.error("[scheduler] Full run cron job failed:", err);
        }
    });
    activeTasks.push(fullRunTask);
    console.log("[scheduler] ✅ Full run scheduled: every 6 hours\n");
}
function stopScheduler() {
    for (const task of activeTasks) {
        task.stop();
    }
    activeTasks.length = 0;
    console.log("[scheduler] All cron jobs stopped");
}
//# sourceMappingURL=cronJobs.js.map