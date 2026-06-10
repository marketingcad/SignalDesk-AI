import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        // Authenticated app pages must never be cached by a shared CDN.
        // Without this, DigitalOcean/Cloudflare cached a prerendered RSC
        // ("text/x-component") prefetch and served that raw Flight payload
        // for full-page navigations. `no-store` stops the edge from caching
        // HTML, RSC, and API responses. Hashed assets under /_next/static
        // are excluded — they are immutable and safe to cache forever.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
