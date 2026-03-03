import type { DetectedMessage, Stats } from "../types";

const DEFAULT_API_URL = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Message listener — relay posts from content scripts to backend
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: DetectedMessage, sender, sendResponse) => {
    if (message.type !== "POST_DETECTED") return false;

    const { platform, username, text } = message.payload;
    console.log(
      `[SignalDesk] [SW] POST_DETECTED from ${sender.tab?.url || "unknown tab"}:`,
      `\n  Platform: ${platform}`,
      `\n  User: ${username}`,
      `\n  Text: ${text.slice(0, 120)}...`
    );

    processPost(message.payload)
      .then((result) => {
        console.log(`[SignalDesk] [SW] API success:`, result);
        sendResponse({ success: true, ...result });
      })
      .catch((err) => {
        console.error(`[SignalDesk] [SW] API error:`, err.message);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep channel open for async response
  }
);

// ---------------------------------------------------------------------------
// Process a detected post — send to backend API
// ---------------------------------------------------------------------------

async function processPost(
  payload: DetectedMessage["payload"]
): Promise<Record<string, unknown>> {
  const { apiUrl, authToken } = await chrome.storage.local.get([
    "apiUrl",
    "authToken",
  ]);
  const baseUrl = apiUrl || DEFAULT_API_URL;

  if (!authToken) {
    console.warn(`[SignalDesk] [SW] No auth token — user not signed in`);
    throw new Error("Not authenticated. Please sign in via the popup.");
  }

  const endpoint = `${baseUrl}/api/leads/process`;
  console.log(`[SignalDesk] [SW] POSTing to ${endpoint}...`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "X-Source": "signaldesk-extension",
    },
    body: JSON.stringify(payload),
  });

  console.log(`[SignalDesk] [SW] Response status: ${response.status}`);

  if (response.status === 401) {
    console.error(`[SignalDesk] [SW] 401 Unauthorized — clearing auth token`);
    await chrome.storage.local.set({ authToken: null });
    throw new Error("Session expired. Please sign in again.");
  }

  if (!response.ok) {
    await incrementStat("errors");
    const errText = await response.text();
    console.error(`[SignalDesk] [SW] API error response: ${errText}`);
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const result = await response.json();
  console.log(
    `[SignalDesk] [SW] Lead processed:`,
    `\n  Lead ID: ${result.leadId}`,
    `\n  Intent Score: ${result.intentScore}`,
    `\n  Intent Level: ${result.intentLevel}`,
    `\n  Duplicate: ${result.duplicate || false}`
  );

  if (!result.duplicate) {
    await incrementStat("totalSent");
    await incrementPlatformCount(payload.platform);
    console.log(`[SignalDesk] [SW] Stats updated — new lead counted for ${payload.platform}`);
  }
  await chrome.storage.local.set({ lastSentAt: new Date().toISOString() });
  await updateBadge();

  return result;
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

async function getStats(): Promise<Stats> {
  const { stats } = await chrome.storage.local.get("stats");
  return (
    stats || { totalSent: 0, byPlatform: {}, lastSentAt: null, errors: 0 }
  );
}

async function incrementStat(key: "totalSent" | "errors") {
  const stats = await getStats();
  stats[key]++;
  await chrome.storage.local.set({ stats });
}

async function incrementPlatformCount(platform: string) {
  const stats = await getStats();
  stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;
  await chrome.storage.local.set({ stats });
}

async function updateBadge() {
  const stats = await getStats();
  const total = stats.totalSent;
  const text = total > 99 ? "99+" : total > 0 ? String(total) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
}

// ---------------------------------------------------------------------------
// Initialize defaults on install
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[SignalDesk] [SW] Extension installed/updated — reason: ${details.reason}`);

  chrome.storage.local.set({
    platformToggles: {
      Facebook: true,
      LinkedIn: true,
      Reddit: true,
      X: false,
    },
    stats: {
      totalSent: 0,
      byPlatform: {},
      lastSentAt: null,
      errors: 0,
    },
    authToken: null,
    apiUrl: DEFAULT_API_URL,
  });

  console.log(`[SignalDesk] [SW] Default storage values initialized`);
});
