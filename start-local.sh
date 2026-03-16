#!/bin/bash
# ================================================================
# SignalDesk AI — Local Development Launcher
# Starts: Scraper (4000) + Next.js (3000) + Cloudflare Tunnel
# ================================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLOUDFLARED="/c/Program Files (x86)/cloudflared/cloudflared.exe"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      SignalDesk AI — Starting Local Server       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Cleanup all child processes on exit
cleanup() {
  echo ""
  echo "[shutdown] Stopping all services..."
  kill $SCRAPER_PID $NEXTJS_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# 1. Start scraper service in background
echo "[1/3] Starting scraper service on port 4000..."
(cd "$PROJECT_DIR/scraper-service" && npm run dev) &
SCRAPER_PID=$!

sleep 3

# 2. Start Next.js in background
echo "[2/3] Starting Next.js on port 3000..."
(cd "$PROJECT_DIR" && npm run dev) &
NEXTJS_PID=$!

sleep 5

# 3. Start Cloudflare Tunnel and capture the URL
echo "[3/3] Starting Cloudflare Tunnel..."
echo ""

"$CLOUDFLARED" tunnel --url http://localhost:3000 2>&1 | while IFS= read -r line; do
  if echo "$line" | grep -q "trycloudflare.com"; then
    URL=$(echo "$line" | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com')
    if [ -n "$URL" ]; then
      echo ""
      echo "╔══════════════════════════════════════════════════════════════╗"
      echo "║                                                              ║"
      echo "║   YOUR PUBLIC URL:                                           ║"
      echo "║   $URL"
      echo "║                                                              ║"
      echo "║   Share this URL with anyone to access your dashboard        ║"
      echo "║                                                              ║"
      echo "║   Local:   http://localhost:3000                             ║"
      echo "║   Scraper: http://localhost:4000                             ║"
      echo "║                                                              ║"
      echo "╚══════════════════════════════════════════════════════════════╝"
      echo ""
    fi
  fi
done

wait
