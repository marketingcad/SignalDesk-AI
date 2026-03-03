import type {
  DetectedMessage,
  Stats,
  AutoMonitorConfig,
  MonitoredTabMap,
  MonitoredUrl,
  StartAutoScrollMessage,
} from "../types";

const DEFAULT_API_URL = "http://localhost:3000";
const ALARM_NAME_MONITOR = "auto-monitor-cycle";
const SCROLL_START_DELAY_MS = 5_000;

const DEFAULT_AUTO_CONFIG: AutoMonitorConfig = {
  urls: [],
  intervalMinutes: 2,
  isRunning: false,
  scrollDurationMs: 105_000,
  scrollStepPx: 500,
  scrollIntervalMs: 2_000,
};

// ---------------------------------------------------------------------------
// Message listener — relay posts from content scripts to backend
// + handle auto-monitor commands from popup
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: DetectedMessage & { type: string }, sender, sendResponse) => {
    // --- Post detection (from content scripts) ---
    if (message.type === "POST_DETECTED") {
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

      return true;
    }

    // --- Auto-monitor commands (from popup) ---
    if (message.type === "START_AUTO_MONITOR") {
      startAutoMonitor()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    if (message.type === "STOP_AUTO_MONITOR") {
      stopAutoMonitor()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    if (message.type === "GET_AUTO_MONITOR_STATUS") {
      Promise.all([getAutoMonitorConfig(), getMonitoredTabMap()]).then(
        ([config, tabMap]) => {
          const activeTabCount = Object.values(tabMap).filter(
            (id) => id !== null
          ).length;
          sendResponse({
            isRunning: config.isRunning,
            tabCount: activeTabCount,
          });
        }
      );
      return true;
    }

    return false;
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
    console.log(
      `[SignalDesk] [SW] Stats updated — new lead counted for ${payload.platform}`
    );
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
// Auto-monitor storage helpers
// ---------------------------------------------------------------------------

async function getAutoMonitorConfig(): Promise<AutoMonitorConfig> {
  const { autoMonitorConfig } = await chrome.storage.local.get(
    "autoMonitorConfig"
  );
  return autoMonitorConfig ?? { ...DEFAULT_AUTO_CONFIG };
}

async function getMonitoredTabMap(): Promise<MonitoredTabMap> {
  const { monitoredTabMap } = await chrome.storage.local.get("monitoredTabMap");
  return monitoredTabMap ?? {};
}

async function saveMonitoredTabMap(map: MonitoredTabMap): Promise<void> {
  await chrome.storage.local.set({ monitoredTabMap: map });
}

// ---------------------------------------------------------------------------
// Auto-monitor: Start / Stop
// ---------------------------------------------------------------------------

async function startAutoMonitor(): Promise<void> {
  const config = await getAutoMonitorConfig();
  const enabledUrls = config.urls.filter((u) => u.enabled);

  if (enabledUrls.length === 0) {
    console.warn(
      "[SignalDesk] [AutoMonitor] No enabled URLs configured — not starting"
    );
    return;
  }

  console.log(
    `[SignalDesk] [AutoMonitor] Starting with ${enabledUrls.length} URLs, interval=${config.intervalMinutes}min`
  );

  await chrome.storage.local.set({
    autoMonitorConfig: { ...config, isRunning: true },
  });

  await chrome.alarms.clear(ALARM_NAME_MONITOR);
  chrome.alarms.create(ALARM_NAME_MONITOR, {
    delayInMinutes: config.intervalMinutes,
    periodInMinutes: config.intervalMinutes,
  });

  await openMonitoredTabs(enabledUrls, config);
}

async function stopAutoMonitor(): Promise<void> {
  console.log("[SignalDesk] [AutoMonitor] Stopping");

  const config = await getAutoMonitorConfig();
  await chrome.storage.local.set({
    autoMonitorConfig: { ...config, isRunning: false },
  });

  await chrome.alarms.clear(ALARM_NAME_MONITOR);

  const tabMap = await getMonitoredTabMap();
  const tabIds = Object.values(tabMap).filter(
    (id): id is number => id !== null
  );

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab already closed — ignore
    }
  }

  await saveMonitoredTabMap({});
  console.log(
    `[SignalDesk] [AutoMonitor] Stopped — closed ${tabIds.length} monitored tabs`
  );
}

// ---------------------------------------------------------------------------
// Auto-monitor: Tab management
// ---------------------------------------------------------------------------

async function openMonitoredTabs(
  urls: MonitoredUrl[],
  config: AutoMonitorConfig
): Promise<void> {
  const tabMap = await getMonitoredTabMap();
  const newTabMap: MonitoredTabMap = {};

  for (const monitoredUrl of urls) {
    const existingTabId = tabMap[monitoredUrl.id];
    if (existingTabId !== null && existingTabId !== undefined) {
      try {
        await chrome.tabs.get(existingTabId);
        newTabMap[monitoredUrl.id] = existingTabId;
        console.log(
          `[SignalDesk] [AutoMonitor] Tab ${existingTabId} still alive for ${monitoredUrl.label}`
        );
        continue;
      } catch {
        // Tab was closed — create new one
      }
    }

    try {
      const tab = await chrome.tabs.create({
        url: monitoredUrl.url,
        active: false,
      });
      newTabMap[monitoredUrl.id] = tab.id ?? null;
      console.log(
        `[SignalDesk] [AutoMonitor] Opened tab ${tab.id} for ${monitoredUrl.url}`
      );
    } catch (err) {
      console.error(
        `[SignalDesk] [AutoMonitor] Failed to open tab for ${monitoredUrl.url}:`,
        err
      );
      newTabMap[monitoredUrl.id] = null;
    }
  }

  await saveMonitoredTabMap(newTabMap);

  setTimeout(() => {
    sendScrollMessageToAllTabs(newTabMap, config);
  }, SCROLL_START_DELAY_MS);
}

async function sendScrollMessageToAllTabs(
  tabMap: MonitoredTabMap,
  config: AutoMonitorConfig
): Promise<void> {
  const message: StartAutoScrollMessage = {
    type: "START_AUTO_SCROLL",
    scrollStepPx: config.scrollStepPx,
    scrollIntervalMs: config.scrollIntervalMs,
    durationMs: config.scrollDurationMs,
  };

  for (const tabId of Object.values(tabMap)) {
    if (tabId === null) continue;
    try {
      await chrome.tabs.sendMessage(tabId, message);
      console.log(
        `[SignalDesk] [AutoMonitor] START_AUTO_SCROLL sent to tab ${tabId}`
      );
    } catch (err) {
      console.warn(
        `[SignalDesk] [AutoMonitor] Could not send scroll to tab ${tabId}:`,
        err
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Alarm handler — periodic reload + scroll
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME_MONITOR) return;

  console.log(
    "[SignalDesk] [AutoMonitor] Alarm fired — reloading monitored tabs"
  );

  const config = await getAutoMonitorConfig();
  if (!config.isRunning) {
    await chrome.alarms.clear(ALARM_NAME_MONITOR);
    return;
  }

  const tabMap = await getMonitoredTabMap();
  const newTabMap: MonitoredTabMap = {};

  for (const [urlId, tabId] of Object.entries(tabMap)) {
    if (tabId === null) {
      // Tab was closed — re-open from config
      const urlEntry = config.urls.find((u) => u.id === urlId);
      if (urlEntry?.enabled) {
        try {
          const newTab = await chrome.tabs.create({
            url: urlEntry.url,
            active: false,
          });
          newTabMap[urlId] = newTab.id ?? null;
          console.log(
            `[SignalDesk] [AutoMonitor] Re-opened closed tab as ${newTab.id} for ${urlEntry.url}`
          );
        } catch {
          newTabMap[urlId] = null;
        }
      } else {
        newTabMap[urlId] = null;
      }
      continue;
    }

    try {
      await chrome.tabs.get(tabId);
      await chrome.tabs.reload(tabId);
      newTabMap[urlId] = tabId;
      console.log(`[SignalDesk] [AutoMonitor] Reloaded tab ${tabId}`);
    } catch {
      // Tab gone — re-open
      const urlEntry = config.urls.find((u) => u.id === urlId);
      if (urlEntry?.enabled) {
        try {
          const newTab = await chrome.tabs.create({
            url: urlEntry.url,
            active: false,
          });
          newTabMap[urlId] = newTab.id ?? null;
          console.log(
            `[SignalDesk] [AutoMonitor] Re-opened tab as ${newTab.id} for ${urlEntry.url}`
          );
        } catch {
          newTabMap[urlId] = null;
        }
      } else {
        newTabMap[urlId] = null;
      }
    }
  }

  await saveMonitoredTabMap(newTabMap);

  setTimeout(() => {
    sendScrollMessageToAllTabs(newTabMap, config);
  }, SCROLL_START_DELAY_MS);
});

// ---------------------------------------------------------------------------
// Tab removal listener — track when user closes a monitored tab
// ---------------------------------------------------------------------------

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabMap = await getMonitoredTabMap();
  const entry = Object.entries(tabMap).find(([, id]) => id === tabId);
  if (!entry) return;

  console.log(
    `[SignalDesk] [AutoMonitor] Monitored tab ${tabId} was closed — will re-open on next cycle`
  );
  const updated = { ...tabMap, [entry[0]]: null };
  await saveMonitoredTabMap(updated);
});

// ---------------------------------------------------------------------------
// Initialize defaults on install / recover on update & startup
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(
    `[SignalDesk] [SW] Extension installed/updated — reason: ${details.reason}`
  );

  if (details.reason === "install") {
    await chrome.storage.local.set({
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
      autoMonitorConfig: { ...DEFAULT_AUTO_CONFIG },
      monitoredTabMap: {},
    });
    console.log(`[SignalDesk] [SW] Default storage values initialized`);
  }

  if (details.reason === "update") {
    const config = await getAutoMonitorConfig();
    if (config.isRunning) {
      console.log(
        "[SignalDesk] [SW] Extension updated while auto-monitor running — re-registering alarm"
      );
      await saveMonitoredTabMap({});
      chrome.alarms.create(ALARM_NAME_MONITOR, {
        delayInMinutes: 0.1,
        periodInMinutes: config.intervalMinutes,
      });
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log(
    "[SignalDesk] [SW] Browser started — checking auto-monitor state"
  );
  const config = await getAutoMonitorConfig();
  if (config.isRunning) {
    console.log(
      "[SignalDesk] [SW] Auto-monitor was running — re-registering alarm"
    );
    await saveMonitoredTabMap({});
    chrome.alarms.create(ALARM_NAME_MONITOR, {
      delayInMinutes: 0.1,
      periodInMinutes: config.intervalMinutes,
    });
  }
});
