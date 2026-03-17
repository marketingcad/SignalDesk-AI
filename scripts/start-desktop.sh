#!/bin/bash
# =============================================================================
# VA Hub — Desktop Development Launcher
# Starts: Next.js (3000) + Scraper (4000) + Tauri window
# =============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      VA Hub — Starting Desktop App               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check if scraper-service is built
if [ ! -d "$PROJECT_DIR/scraper-service/dist" ]; then
  echo "[setup] Building scraper-service..."
  (cd "$PROJECT_DIR/scraper-service" && npm run build)
fi

# Run Tauri dev (this starts Next.js + Tauri window automatically)
echo "[start] Launching Tauri dev mode..."
echo "  Next.js: http://localhost:3000"
echo "  Scraper: http://localhost:4000"
echo ""

export PATH="$HOME/.cargo/bin:$PATH"
cargo tauri dev
