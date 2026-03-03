import type { DetectedMessage, Stats } from "../types";

const DEFAULT_API_URL = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Message listener — relay posts from content scripts to backend
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: DetectedMessage, _sender, sendResponse) => {
    if (message.type !== "POST_DETECTED") return false;

    processPost(message.payload)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

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
    throw new Error("Not authenticated. Please sign in via the popup.");
  }

  const response = await fetch(`${baseUrl}/api/leads/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "X-Source": "signaldesk-extension",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    await chrome.storage.local.set({ authToken: null });
    throw new Error("Session expired. Please sign in again.");
  }

  if (!response.ok) {
    await incrementStat("errors");
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const result = await response.json();

  if (!result.duplicate) {
    await incrementStat("totalSent");
    await incrementPlatformCount(payload.platform);
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

chrome.runtime.onInstalled.addListener(() => {
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
});
