import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

// Dashboard route segments that require an authenticated session.
// API routes self-guard (they return JSON 401), so they are intentionally
// excluded here — redirecting an XHR to the /login HTML would be worse than a 401.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/scrape-url",
  "/alerts",
  "/bookmarks",
  "/reports",
  "/users",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token && (await verifySession(token))) {
    return NextResponse.next();
  }

  // Unauthenticated → bounce to login, preserving the intended destination.
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/leads/:path*",
    "/pipeline/:path*",
    "/scrape-url/:path*",
    "/alerts/:path*",
    "/bookmarks/:path*",
    "/reports/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
