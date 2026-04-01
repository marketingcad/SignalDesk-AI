"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabase = getSupabase;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
let _client = null;
/**
 * Lazily initialise a Supabase client for the scraper service.
 * Returns `null` if the required env vars are not set — the caller
 * should fall back to JSON file persistence.
 */
function getSupabase() {
    if (_client)
        return _client;
    const url = config_1.config.supabaseUrl;
    const key = config_1.config.supabaseServiceRoleKey;
    if (!url || !key)
        return null;
    _client = (0, supabase_js_1.createClient)(url, key);
    return _client;
}
//# sourceMappingURL=supabase.js.map