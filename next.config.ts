import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js runs as a local server in both web and desktop (Tauri) mode.
  // API routes require server-side rendering, so we do NOT use static export.
  // Tauri's devUrl and production mode both point to http://localhost:3000.
};

export default nextConfig;
