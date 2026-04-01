"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROWSER_ARGS = void 0;
// Chromium launch flags — stable for both local and containerized environments
exports.BROWSER_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--no-first-run",
];
//# sourceMappingURL=browserArgs.js.map