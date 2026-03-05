import { useState, useEffect } from "react";
import type { PlatformToggles, Stats, AutoMonitorConfig, MonitoredUrl, Platform } from "../types";

const PLATFORMS: (keyof PlatformToggles)[] = ["Facebook", "LinkedIn", "Reddit", "X"];

const PLATFORM_COLORS: Record<string, string> = {
  Facebook: "#1877F2",
  LinkedIn: "#0A66C2",
  Reddit: "#FF4500",
  X: "#a1a1aa",
};

export function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [toggles, setToggles] = useState<PlatformToggles | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoConfig, setAutoConfig] = useState<AutoMonitorConfig | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoTabCount, setAutoTabCount] = useState(0);
  const [newUrlInput, setNewUrlInput] = useState("");
  const [urlInputError, setUrlInputError] = useState("");
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    chrome.storage.local.get(
      ["authToken", "stats", "platformToggles", "apiUrl", "autoMonitorConfig", "customKeywords"],
      (result) => {
        setAuthToken(result.authToken || null);
        setStats(result.stats || { totalSent: 0, byPlatform: {}, lastSentAt: null, errors: 0 });
        setToggles(result.platformToggles || { Facebook: true, LinkedIn: true, Reddit: true, X: false });
        setApiUrl(result.apiUrl || "http://localhost:3000");
        setCustomKeywords(result.customKeywords || []);
        setAutoConfig(result.autoMonitorConfig || {
          urls: [],
          intervalMinutes: 2,
          isRunning: false,
          scrollDurationMs: 105_000,
          scrollStepPx: 500,
          scrollIntervalMs: 2_000,
        });
        setLoading(false);
      }
    );

    // Get auto-monitor running status from service worker
    chrome.runtime.sendMessage({ type: "GET_AUTO_MONITOR_STATUS" }, (res) => {
      if (res) {
        setAutoRunning(res.isRunning || false);
        setAutoTabCount(res.tabCount || 0);
      }
    });
  }, []);

  async function handleLogin() {
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      await chrome.storage.local.set({ authToken: data.token });
      setAuthToken(data.token);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  async function togglePlatform(platform: keyof PlatformToggles) {
    if (!toggles) return;
    const updated = { ...toggles, [platform]: !toggles[platform] };
    await chrome.storage.local.set({ platformToggles: updated });
    setToggles(updated);
  }

  async function handleLogout() {
    await chrome.storage.local.set({ authToken: null });
    setAuthToken(null);
  }

  async function handleApiUrlChange(url: string) {
    setApiUrl(url);
    await chrome.storage.local.set({ apiUrl: url });
  }

  // --- Auto-Monitor helpers ---

  function inferPlatform(url: string): Platform | null {
    if (url.includes("facebook.com")) return "Facebook";
    if (url.includes("linkedin.com")) return "LinkedIn";
    if (url.includes("reddit.com")) return "Reddit";
    if (url.includes("x.com") || url.includes("twitter.com")) return "X";
    return null;
  }

  function inferLabel(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/$/, "");
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2) return parts.slice(-1)[0];
      return u.hostname;
    } catch {
      return url.slice(0, 30);
    }
  }

  async function handleAddUrl() {
    setUrlInputError("");
    const trimmed = newUrlInput.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setUrlInputError("Enter a valid URL");
      return;
    }

    const platform = inferPlatform(trimmed);
    if (!platform) {
      setUrlInputError("URL must be from Facebook, LinkedIn, Reddit, or X");
      return;
    }

    if (!autoConfig) return;

    const newEntry: MonitoredUrl = {
      id: crypto.randomUUID(),
      url: trimmed,
      platform,
      label: inferLabel(trimmed),
      enabled: true,
    };

    const updated = { ...autoConfig, urls: [...autoConfig.urls, newEntry] };
    await chrome.storage.local.set({ autoMonitorConfig: updated });
    setAutoConfig(updated);
    setNewUrlInput("");
  }

  async function handleRemoveUrl(id: string) {
    if (!autoConfig) return;
    const updated = { ...autoConfig, urls: autoConfig.urls.filter((u) => u.id !== id) };
    await chrome.storage.local.set({ autoMonitorConfig: updated });
    setAutoConfig(updated);
  }

  async function handleToggleUrl(id: string) {
    if (!autoConfig) return;
    const updated = {
      ...autoConfig,
      urls: autoConfig.urls.map((u) => (u.id === id ? { ...u, enabled: !u.enabled } : u)),
    };
    await chrome.storage.local.set({ autoMonitorConfig: updated });
    setAutoConfig(updated);
  }

  async function handleIntervalChange(min: number) {
    if (!autoConfig) return;
    const clamped = Math.max(1, Math.min(60, min));
    const updated = { ...autoConfig, intervalMinutes: clamped };
    await chrome.storage.local.set({ autoMonitorConfig: updated });
    setAutoConfig(updated);
  }

  async function handleAutoStartStop() {
    if (autoRunning) {
      chrome.runtime.sendMessage({ type: "STOP_AUTO_MONITOR" }, (res) => {
        if (res?.ok) {
          setAutoRunning(false);
          setAutoTabCount(0);
        }
      });
    } else {
      chrome.runtime.sendMessage({ type: "START_AUTO_MONITOR" }, (res) => {
        if (res?.ok) {
          setAutoRunning(true);
          const enabledCount = autoConfig?.urls.filter((u) => u.enabled).length || 0;
          setAutoTabCount(enabledCount);
        }
      });
    }
  }

  // --- Keyword Manager helpers ---

  async function handleAddKeyword() {
    const trimmed = newKeyword.trim().toLowerCase();
    if (!trimmed || customKeywords.includes(trimmed)) return;
    const updated = [...customKeywords, trimmed];
    await chrome.storage.local.set({ customKeywords: updated });
    setCustomKeywords(updated);
    setNewKeyword("");
  }

  async function handleRemoveKeyword(keyword: string) {
    const updated = customKeywords.filter((k) => k !== keyword);
    await chrome.storage.local.set({ customKeywords: updated });
    setCustomKeywords(updated);
  }

  if (loading) {
    return <div style={styles.center}>Loading...</div>;
  }

  // --- Login Screen ---
  if (!authToken) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.logo}>S</div>
          <div>
            <div style={styles.title}>SignalDesk AI</div>
            <div style={styles.subtitle}>Sign in to start monitoring</div>
          </div>
        </div>

        <div style={styles.section}>
          <label style={styles.label}>API URL</label>
          <input
            style={styles.input}
            type="url"
            value={apiUrl}
            onChange={(e) => handleApiUrlChange(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>

        <div style={styles.section}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            value={loginForm.email}
            onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
          />
        </div>

        <div style={styles.section}>
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Enter password"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </div>

        {loginError && <div style={styles.error}>{loginError}</div>}

        <button
          style={{ ...styles.button, opacity: loginLoading ? 0.6 : 1 }}
          onClick={handleLogin}
          disabled={loginLoading}
        >
          {loginLoading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    );
  }

  // --- Authenticated Screen ---
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>S</div>
        <div>
          <div style={styles.title}>SignalDesk AI</div>
          <div style={{ ...styles.subtitle, color: "#34d399" }}>Connected</div>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Detection Stats</div>
        <div style={styles.statsGrid}>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats?.totalSent || 0}</div>
            <div style={styles.statLabel}>Leads Sent</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>{stats?.errors || 0}</div>
            <div style={styles.statLabel}>Errors</div>
          </div>
        </div>
        {stats?.lastSentAt && (
          <div style={styles.lastActive}>
            Last: {new Date(stats.lastSentAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Platform Toggles */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Platform Monitoring</div>
        {toggles &&
          PLATFORMS.map((platform) => (
            <div key={platform} style={styles.toggleRow}>
              <div style={styles.toggleLeft}>
                <div
                  style={{
                    ...styles.platformDot,
                    backgroundColor: toggles[platform]
                      ? PLATFORM_COLORS[platform]
                      : "#52525b",
                  }}
                />
                <span>{platform}</span>
                {stats?.byPlatform[platform] ? (
                  <span style={styles.badge}>{stats.byPlatform[platform]}</span>
                ) : null}
              </div>
              <button
                style={{
                  ...styles.toggle,
                  backgroundColor: toggles[platform] ? "#6366f1" : "#3f3f46",
                }}
                onClick={() => togglePlatform(platform)}
              >
                <div
                  style={{
                    ...styles.toggleKnob,
                    transform: toggles[platform]
                      ? "translateX(18px)"
                      : "translateX(2px)",
                  }}
                />
              </button>
            </div>
          ))}
      </div>

      {/* Auto-Monitor */}
      {autoConfig && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Auto-Monitor</div>

          {/* URL input */}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...styles.input, flex: 1, fontSize: 12, padding: "6px 10px" }}
              type="url"
              value={newUrlInput}
              onChange={(e) => { setNewUrlInput(e.target.value); setUrlInputError(""); }}
              placeholder="https://www.facebook.com/groups/..."
              onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
            />
            <button
              style={{ ...styles.button, padding: "6px 12px", fontSize: 12 }}
              onClick={handleAddUrl}
            >
              Add
            </button>
          </div>
          {urlInputError && <div style={{ ...styles.error, fontSize: 11 }}>{urlInputError}</div>}

          {/* URL list */}
          {autoConfig.urls.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {autoConfig.urls.map((entry) => (
                <div key={entry.id} style={styles.urlRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        ...styles.platformDot,
                        backgroundColor: entry.enabled
                          ? PLATFORM_COLORS[entry.platform]
                          : "#52525b",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      style={{
                        ...styles.toggle,
                        width: 32,
                        height: 16,
                        backgroundColor: entry.enabled ? "#6366f1" : "#3f3f46",
                      }}
                      onClick={() => handleToggleUrl(entry.id)}
                    >
                      <div
                        style={{
                          ...styles.toggleKnob,
                          width: 12,
                          height: 12,
                          transform: entry.enabled ? "translateX(14px)" : "translateX(2px)",
                        }}
                      />
                    </button>
                    <button
                      style={styles.removeBtn}
                      onClick={() => handleRemoveUrl(entry.id)}
                      title="Remove URL"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Interval config */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#a1a1aa" }}>Refresh every</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                style={{ ...styles.input, width: 48, textAlign: "center", fontSize: 12, padding: "4px 6px" }}
                type="number"
                min={1}
                max={60}
                value={autoConfig.intervalMinutes}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
              />
              <span style={{ fontSize: 12, color: "#71717a" }}>min</span>
            </div>
          </div>

          {/* Start / Stop button */}
          <button
            style={{
              ...styles.button,
              backgroundColor: autoRunning ? "#ef4444" : "#22c55e",
              opacity: autoConfig.urls.filter((u) => u.enabled).length === 0 && !autoRunning ? 0.5 : 1,
            }}
            onClick={handleAutoStartStop}
            disabled={autoConfig.urls.filter((u) => u.enabled).length === 0 && !autoRunning}
          >
            {autoRunning
              ? `Stop Monitoring (${autoTabCount} tab${autoTabCount !== 1 ? "s" : ""})`
              : "Start Auto-Monitor"}
          </button>
        </div>
      )}

      {/* Keyword Manager */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Custom Keywords</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...styles.input, flex: 1, fontSize: 12, padding: "6px 10px" }}
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="e.g. hiring executive assistant"
            onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
          />
          <button
            style={{ ...styles.button, padding: "6px 12px", fontSize: 12 }}
            onClick={handleAddKeyword}
          >
            Add
          </button>
        </div>
        {customKeywords.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {customKeywords.map((kw) => (
              <span key={kw} style={styles.keywordTag}>
                {kw}
                <button
                  style={styles.keywordRemove}
                  onClick={() => handleRemoveKeyword(kw)}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
        {customKeywords.length === 0 && (
          <div style={{ fontSize: 11, color: "#52525b" }}>
            Add keywords to boost detection. Built-in keywords are always active.
          </div>
        )}
      </div>

      <button style={styles.logoutButton} onClick={handleLogout}>
        Sign Out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles (avoids needing Tailwind/CSS build for popup)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 200,
    color: "#a1a1aa",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
    color: "#fff",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fafafa",
  },
  subtitle: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  input: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #27272a",
    backgroundColor: "#18181b",
    color: "#fafafa",
    fontSize: 13,
    outline: "none",
  },
  button: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#6366f1",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  error: {
    fontSize: 12,
    color: "#f87171",
    padding: "6px 10px",
    borderRadius: 6,
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  card: {
    padding: 14,
    borderRadius: 10,
    border: "1px solid #27272a",
    backgroundColor: "#18181b",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  statItem: {
    textAlign: "center" as const,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#fafafa",
  },
  statLabel: {
    fontSize: 11,
    color: "#71717a",
  },
  lastActive: {
    fontSize: 11,
    color: "#71717a",
    textAlign: "center" as const,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 0",
  },
  toggleLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  badge: {
    fontSize: 10,
    backgroundColor: "#27272a",
    padding: "1px 6px",
    borderRadius: 10,
    color: "#a1a1aa",
  },
  toggle: {
    width: 38,
    height: 20,
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    position: "relative" as const,
    transition: "background-color 0.2s",
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    backgroundColor: "#fff",
    position: "absolute" as const,
    top: 2,
    transition: "transform 0.2s",
  },
  logoutButton: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #27272a",
    backgroundColor: "transparent",
    color: "#a1a1aa",
    fontSize: 12,
    cursor: "pointer",
  },
  urlRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0",
    gap: 6,
  },
  removeBtn: {
    width: 18,
    height: 18,
    borderRadius: 4,
    border: "none",
    backgroundColor: "#3f3f46",
    color: "#a1a1aa",
    fontSize: 11,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  keywordTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 6,
    backgroundColor: "#27272a",
    color: "#a1a1aa",
    fontSize: 11,
  },
  keywordRemove: {
    width: 14,
    height: 14,
    borderRadius: 3,
    border: "none",
    backgroundColor: "transparent",
    color: "#71717a",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
};
