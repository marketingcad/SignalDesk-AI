"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStorageDir = useStorageDir;
exports.cleanStorage = cleanStorage;
const path_1 = __importDefault(require("path"));
const STORAGE_ROOT = path_1.default.resolve(__dirname, "../../storage");
/**
 * Disables Crawlee's disk persistence globally and sets an isolated
 * storage dir per platform. With CRAWLEE_PERSIST_STORAGE=false,
 * Crawlee keeps everything in memory — no file read/write race conditions.
 */
function useStorageDir(platform) {
    process.env.CRAWLEE_PERSIST_STORAGE = "false";
    process.env.CRAWLEE_STORAGE_DIR = path_1.default.join(STORAGE_ROOT, platform.toLowerCase());
}
/**
 * No-op now that persistence is disabled. Kept for API compatibility.
 */
function cleanStorage(_platform) {
    // Nothing to clean — storage is in-memory only
}
//# sourceMappingURL=storage.js.map