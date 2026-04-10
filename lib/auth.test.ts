import { describe, it, expect, vi } from "vitest";

// Mock jose so we don't depend on real crypto or env vars
vi.mock("jose", () => {
  class MockSignJWT {
    private payload: Record<string, unknown>;
    constructor(payload: Record<string, unknown>) {
      this.payload = { ...payload };
    }
    setProtectedHeader() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    async sign() { return JSON.stringify(this.payload); }
  }

  return {
    SignJWT: MockSignJWT,
    jwtVerify: async (token: string) => {
      try {
        const parsed = JSON.parse(token);
        return { payload: parsed };
      } catch {
        throw new Error("Invalid token");
      }
    },
  };
});

// Must set env var before import
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-min-32-chars!!";

import {
  createSession,
  verifySession,
  createResetToken,
  verifyResetToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "./auth";

describe("createSession / verifySession", () => {
  it("creates a token that can be verified back to the payload", async () => {
    const token = await createSession({ userId: "user-123", email: "test@example.com" });
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-123");
    expect(payload!.email).toBe("test@example.com");
  });

  it("returns null for unparseable tokens", async () => {
    expect(await verifySession("not-valid-json")).toBeNull();
  });
});

describe("createResetToken / verifyResetToken", () => {
  it("creates a reset token with type field", async () => {
    const token = await createResetToken("reset@example.com");
    expect(token).toBeTruthy();

    const result = await verifyResetToken(token);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("reset@example.com");
  });

  it("rejects session tokens (missing type: password-reset)", async () => {
    // Session tokens don't have type: "password-reset"
    const sessionToken = await createSession({ userId: "u1", email: "e@e.com" });
    expect(await verifyResetToken(sessionToken)).toBeNull();
  });
});

describe("constants", () => {
  it("SESSION_COOKIE_NAME is 'session'", () => {
    expect(SESSION_COOKIE_NAME).toBe("session");
  });

  it("SESSION_COOKIE_OPTIONS has correct structure", () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(SESSION_COOKIE_OPTIONS.path).toBe("/");
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(60 * 60 * 24 * 7);
  });
});
