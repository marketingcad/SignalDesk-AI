"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendRunSummary = sendRunSummary;
exports.sendErrorAlert = sendErrorAlert;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const PLATFORM_EMOJI = {
    Facebook: "📘",
    LinkedIn: "💼",
    Reddit: "🟠",
    X: "𝕏",
};
async function sendRunSummary(results) {
    if (!config_1.config.discordWebhookUrl) {
        console.log("[discord] No webhook URL configured — skipping summary");
        return;
    }
    const totalPosts = results.reduce((sum, r) => sum + r.posts.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const platformLines = results
        .map((r) => {
        const emoji = PLATFORM_EMOJI[r.platform] || "📌";
        const errorTag = r.errors.length > 0 ? ` (⚠️ ${r.errors.length} errors)` : "";
        return `${emoji} **${r.platform}**: ${r.posts.length} posts${errorTag}`;
    })
        .join("\n");
    const embed = {
        title: "🤖 SignalDesk Scraper Run Complete",
        description: platformLines,
        color: totalErrors > 0 ? 0xf59e0b : 0x22c55e,
        fields: [
            { name: "📋 Total Posts", value: `**${totalPosts}**`, inline: true },
            {
                name: "⏱️ Duration",
                value: `**${(totalDuration / 1000).toFixed(1)}s**`,
                inline: true,
            },
            {
                name: "⚠️ Errors",
                value: `**${totalErrors}**`,
                inline: true,
            },
        ],
        footer: { text: "SignalDesk AI • Playwright Scraper" },
        timestamp: new Date().toISOString(),
    };
    try {
        await axios_1.default.post(config_1.config.discordWebhookUrl, {
            username: "SignalDesk Scraper",
            embeds: [embed],
        });
        console.log("[discord] Run summary sent");
    }
    catch (err) {
        console.error("[discord] Failed to send summary:", err);
    }
}
async function sendErrorAlert(platform, error) {
    if (!config_1.config.discordWebhookUrl)
        return;
    try {
        await axios_1.default.post(config_1.config.discordWebhookUrl, {
            username: "SignalDesk Scraper",
            embeds: [
                {
                    title: `❌ Scraper Error — ${platform}`,
                    description: `\`\`\`${error.slice(0, 1000)}\`\`\``,
                    color: 0xef4444,
                    timestamp: new Date().toISOString(),
                },
            ],
        });
    }
    catch {
        // Swallow — don't let Discord errors crash the scraper
    }
}
//# sourceMappingURL=discord.js.map