import { config } from "./config.js";

const MAX_RETRIES = 3;

/**
 * Send normalized posts to the SignalDesk backend /api/leads/batch endpoint.
 * Uses exponential backoff for retries.
 * @param {Array} posts - Normalized post objects
 * @returns {Promise<{inserted: number, duplicates: number} | null>}
 */
export async function sendToBackend(posts) {
  if (!config.backendAuthToken) {
    console.warn("[backend] No BACKEND_AUTH_TOKEN — cannot send posts");
    return null;
  }

  if (posts.length === 0) {
    console.log("[backend] No posts to send");
    return { inserted: 0, duplicates: 0 };
  }

  const endpoint = `${config.backendApiUrl}/api/leads/batch`;
  const payload = { posts };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.backendAuthToken}`,
          "X-Source": "signaldesk-apify",
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        console.error("[backend] 401 Unauthorized — check BACKEND_AUTH_TOKEN");
        return null;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[backend] Error ${res.status} (attempt ${attempt}/${MAX_RETRIES}): ${errText}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        return null;
      }

      const result = await res.json();
      console.log(`[backend] Batch result: inserted=${result.inserted}, duplicates=${result.duplicates}`);
      return result;
    } catch (err) {
      console.error(`[backend] Fetch error (attempt ${attempt}/${MAX_RETRIES}):`, err.message);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      return null;
    }
  }

  return null;
}
