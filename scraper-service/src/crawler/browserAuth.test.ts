import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";

// ---------------------------------------------------------------------------
// In-memory filesystem that ONLY intercepts paths under scraper-service/auth.
// Everything else (incl. Playwright's own fs use) delegates to the real fs, and
// the developer's real auth/storage-state.json is never read or clobbered.
//
// vi.hoisted runs before the vi.mock factory and before imports, so the shared
// store and path constants are available to both the mock and the tests.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const p = require("path") as typeof import("path");
  const AUTH_ROOT = p.resolve(__dirname, "../../auth");
  return {
    AUTH_ROOT,
    STORAGE_STATE_PATH: p.join(AUTH_ROOT, "storage-state.json"),
    PROFILE_DIR: p.join(AUTH_ROOT, "browser-profile"),
    files: new Map<string, string>(),
    dirs: new Set<string>(),
    managed(target: unknown): boolean {
      const s = String(target);
      return s === AUTH_ROOT || s.startsWith(AUTH_ROOT + p.sep) || s.startsWith(AUTH_ROOT + "/");
    },
  };
});

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const real = (actual as { default?: typeof import("fs") }).default ?? actual;

  const wrapped = {
    ...real,
    existsSync: (target: unknown) =>
      h.managed(target)
        ? h.files.has(String(target)) || h.dirs.has(String(target))
        : real.existsSync(target as never),
    readdirSync: (target: unknown, ...rest: unknown[]) => {
      if (!h.managed(target)) return (real.readdirSync as never as (...a: unknown[]) => unknown)(target, ...rest);
      const prefix = String(target).replace(/[\\/]+$/, "");
      const names = new Set<string>();
      for (const f of h.files.keys()) {
        if (f.startsWith(prefix + path.sep) || f.startsWith(prefix + "/")) {
          names.add(f.slice(prefix.length + 1).split(/[\\/]/)[0]);
        }
      }
      return [...names];
    },
    mkdirSync: (target: unknown, ...rest: unknown[]) => {
      if (!h.managed(target)) return (real.mkdirSync as never as (...a: unknown[]) => unknown)(target, ...rest);
      h.dirs.add(String(target));
      return undefined;
    },
    writeFileSync: (target: unknown, data: unknown, ...rest: unknown[]) => {
      if (!h.managed(target)) return (real.writeFileSync as never as (...a: unknown[]) => unknown)(target, data, ...rest);
      h.files.set(String(target), String(data));
      h.dirs.add(path.dirname(String(target)));
    },
    readFileSync: (target: unknown, ...rest: unknown[]) => {
      if (!h.managed(target)) return (real.readFileSync as never as (...a: unknown[]) => unknown)(target, ...rest);
      const v = h.files.get(String(target));
      if (v === undefined) {
        const err = new Error(`ENOENT: no such file '${String(target)}'`) as Error & { code: string };
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
  };

  return { ...wrapped, default: wrapped };
});

// Imported AFTER the mock is registered so browserAuth picks up the mocked fs.
import {
  hasSavedCookies,
  shouldUseStorageState,
  getStorageState,
  saveStorageState,
  getAuthenticatedPlatforms,
} from "./browserAuth";

const { STORAGE_STATE_PATH, PROFILE_DIR } = h;

beforeEach(() => {
  h.files.clear();
  h.dirs.clear();
  delete process.env.BROWSER_STORAGE_STATE;
});

// ---------------------------------------------------------------------------
// hasSavedCookies
// ---------------------------------------------------------------------------
describe("hasSavedCookies", () => {
  it("returns false when there is no env var, file, or profile", () => {
    expect(hasSavedCookies()).toBe(false);
  });

  it("returns true when BROWSER_STORAGE_STATE env var is set", () => {
    process.env.BROWSER_STORAGE_STATE = '{"cookies":[]}';
    expect(hasSavedCookies()).toBe(true);
  });

  it("returns true when the rolling storage-state.json file exists", () => {
    h.files.set(STORAGE_STATE_PATH, '{"cookies":[]}');
    expect(hasSavedCookies()).toBe(true);
  });

  it("returns true when a non-empty persistent profile dir exists", () => {
    h.dirs.add(PROFILE_DIR);
    h.files.set(path.join(PROFILE_DIR, "Default", "Cookies"), "x");
    expect(hasSavedCookies()).toBe(true);
  });

  it("returns false when the profile dir exists but is empty", () => {
    h.dirs.add(PROFILE_DIR);
    expect(hasSavedCookies()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldUseStorageState — drives storageState mode vs persistent-profile mode
// ---------------------------------------------------------------------------
describe("shouldUseStorageState", () => {
  it("is false with nothing saved", () => {
    expect(shouldUseStorageState()).toBe(false);
  });

  it("is true with the env var", () => {
    process.env.BROWSER_STORAGE_STATE = "{}";
    expect(shouldUseStorageState()).toBe(true);
  });

  it("is true with the storage-state.json file", () => {
    h.files.set(STORAGE_STATE_PATH, "{}");
    expect(shouldUseStorageState()).toBe(true);
  });

  it("is false when only a persistent profile exists (uses profile mode, not storageState)", () => {
    h.dirs.add(PROFILE_DIR);
    h.files.set(path.join(PROFILE_DIR, "Cookies"), "x");
    expect(shouldUseStorageState()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStorageState — the rolling-session priority logic (the core of the fix)
// ---------------------------------------------------------------------------
describe("getStorageState", () => {
  it("returns undefined when no auth is available", () => {
    expect(getStorageState()).toBeUndefined();
  });

  it("returns the storage-state.json path when the rolling file exists", () => {
    h.files.set(STORAGE_STATE_PATH, '{"cookies":[{"name":"xs"}]}');
    expect(getStorageState()).toBe(STORAGE_STATE_PATH);
  });

  it("bootstraps the rolling file from the env var on first use", () => {
    process.env.BROWSER_STORAGE_STATE = '{"cookies":[{"name":"seed"}]}';
    expect(h.files.has(STORAGE_STATE_PATH)).toBe(false);

    const result = getStorageState();

    expect(result).toBe(STORAGE_STATE_PATH);
    // The env var was seeded into the rolling file so it can be refreshed later.
    expect(h.files.get(STORAGE_STATE_PATH)).toBe('{"cookies":[{"name":"seed"}]}');
  });

  it("prefers the refreshed file over the env var and never overwrites it (rolling session)", () => {
    // Simulate a previously-refreshed rolling file AND a now-stale env var seed.
    h.files.set(STORAGE_STATE_PATH, '{"cookies":[{"name":"REFRESHED"}]}');
    process.env.BROWSER_STORAGE_STATE = '{"cookies":[{"name":"STALE_SEED"}]}';

    const result = getStorageState();

    expect(result).toBe(STORAGE_STATE_PATH);
    // Critical regression guard: the stale env var must NOT clobber fresh cookies.
    expect(h.files.get(STORAGE_STATE_PATH)).toBe('{"cookies":[{"name":"REFRESHED"}]}');
  });
});

// ---------------------------------------------------------------------------
// saveStorageState — re-exports rotated cookies so the login never ages out
// ---------------------------------------------------------------------------
describe("saveStorageState", () => {
  function fakeContext(impl?: () => Promise<void>) {
    return {
      storageState: vi.fn(async ({ path: target }: { path?: string }) => {
        if (impl) return impl();
        // Simulate Playwright writing the freshly-rotated cookies to disk.
        h.files.set(String(target), '{"cookies":[{"name":"xs","value":"rotated"}]}');
      }),
    };
  }

  it("exports the current cookies to the rolling storage-state.json path", async () => {
    const ctx = fakeContext();

    await saveStorageState(ctx as never);

    expect(ctx.storageState).toHaveBeenCalledWith({ path: STORAGE_STATE_PATH });
    expect(h.files.get(STORAGE_STATE_PATH)).toContain("rotated");
  });

  it("makes the session self-sustaining: after a save, getStorageState resolves with no env var", async () => {
    // No env var at all — only a refresh keeps the session alive.
    expect(getStorageState()).toBeUndefined();

    await saveStorageState(fakeContext() as never);

    // The next scheduled run finds the refreshed cookies — no re-login required.
    expect(getStorageState()).toBe(STORAGE_STATE_PATH);
    expect(hasSavedCookies()).toBe(true);
  });

  it("never throws if export fails (must not break the scrape run)", async () => {
    const ctx = fakeContext(() => Promise.reject(new Error("context closed")));

    await expect(saveStorageState(ctx as never)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAuthenticatedPlatforms — per-platform login status from marker cookies
// ---------------------------------------------------------------------------
describe("getAuthenticatedPlatforms", () => {
  const stateWith = (cookies: Array<{ name: string; value?: string; domain: string }>) =>
    JSON.stringify({ cookies });

  it("reports all false when no session exists", () => {
    expect(getAuthenticatedPlatforms()).toEqual({ facebook: false, linkedin: false, x: false });
  });

  it("detects only the platforms whose marker cookie is present (the LinkedIn bug)", () => {
    // Facebook logged in (c_user), LinkedIn NOT — must not show LinkedIn as active.
    h.files.set(
      STORAGE_STATE_PATH,
      stateWith([
        { name: "c_user", value: "100012345", domain: ".facebook.com" },
        { name: "xs", value: "abc", domain: ".facebook.com" },
      ])
    );
    expect(getAuthenticatedPlatforms()).toEqual({ facebook: true, linkedin: false, x: false });
  });

  it("detects LinkedIn via li_at and X via auth_token (x.com or twitter.com)", () => {
    h.files.set(
      STORAGE_STATE_PATH,
      stateWith([
        { name: "li_at", value: "tok", domain: ".linkedin.com" },
        { name: "auth_token", value: "tok", domain: ".twitter.com" },
      ])
    );
    expect(getAuthenticatedPlatforms()).toEqual({ facebook: false, linkedin: true, x: true });
  });

  it("detects Facebook from a minimally-seeded session (xs, no domain field)", () => {
    // Real-world durable session shape: a single `xs` session cookie with no
    // domain. FB is genuinely logged in; LinkedIn/X are not.
    h.files.set(STORAGE_STATE_PATH, stateWith([{ name: "xs", value: "abc1234" }]));
    expect(getAuthenticatedPlatforms()).toEqual({ facebook: true, linkedin: false, x: false });
  });

  it("treats a marker cookie with an empty value as not authenticated", () => {
    h.files.set(STORAGE_STATE_PATH, stateWith([{ name: "c_user", value: "", domain: ".facebook.com" }]));
    expect(getAuthenticatedPlatforms().facebook).toBe(false);
  });

  it("reads from the BROWSER_STORAGE_STATE env var when no file exists", () => {
    process.env.BROWSER_STORAGE_STATE = stateWith([
      { name: "c_user", value: "1", domain: ".facebook.com" },
    ]);
    expect(getAuthenticatedPlatforms().facebook).toBe(true);
  });

  it("returns all false on malformed JSON instead of throwing", () => {
    h.files.set(STORAGE_STATE_PATH, "not json{");
    expect(getAuthenticatedPlatforms()).toEqual({ facebook: false, linkedin: false, x: false });
  });
});
