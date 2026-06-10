import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://signaldesk-ai-i7mbo.ondigitalocean.app";

/**
 * Only the public landing page (/) should be indexable. Everything else is an
 * authenticated app surface, an auth screen, or an API route — keep it out of
 * search indexes. (Auth is still enforced by proxy.ts; this is hygiene, not
 * a security control.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/leads",
        "/pipeline",
        "/alerts",
        "/bookmarks",
        "/reports",
        "/settings",
        "/users",
        "/scrape-url",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
