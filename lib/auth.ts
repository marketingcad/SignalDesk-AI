import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export interface SessionPayload {
  userId: string;
  email: string;
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "session";

// In the desktop app (Tauri), the server runs on http://localhost:3000
// even in production. Secure cookies require HTTPS, so we must disable
// the secure flag when running on localhost to allow cookies to be set.
const isLocalhost =
  typeof window === "undefined" &&
  !process.env.VERCEL &&
  !process.env.VERCEL_URL;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" && !isLocalhost,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function createResetToken(email: string): Promise<string> {
  return new SignJWT({ email, type: "password-reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

export async function verifyResetToken(
  token: string
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== "password-reset") return null;
    return { email: payload.email as string };
  } catch {
    return null;
  }
}
