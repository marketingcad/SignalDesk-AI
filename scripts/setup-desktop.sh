#!/bin/bash
# =============================================================================
# VA Hub — Desktop App Setup Script
# Run this once to set up the desktop development environment
# =============================================================================

set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      VA Hub — Desktop App Setup                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 1. Check prerequisites
# ---------------------------------------------------------------------------
echo "[1/6] Checking prerequisites..."

check_cmd() {
  if ! command -v "$1" &> /dev/null; then
    echo "  ✗ $1 not found — $2"
    return 1
  else
    echo "  ✓ $1 found: $($1 --version 2>/dev/null | head -1)"
    return 0
  fi
}

check_cmd "node" "Install Node.js 20+ from https://nodejs.org"
check_cmd "npm" "Comes with Node.js"
check_cmd "rustc" "Install Rust from https://rustup.rs"
check_cmd "cargo" "Install Rust from https://rustup.rs"

# ---------------------------------------------------------------------------
# 2. Install Tauri CLI
# ---------------------------------------------------------------------------
echo ""
echo "[2/6] Installing Tauri CLI..."
if command -v cargo-tauri &> /dev/null; then
  echo "  ✓ cargo-tauri already installed"
else
  cargo install tauri-cli --version "^2"
  echo "  ✓ cargo-tauri installed"
fi

# ---------------------------------------------------------------------------
# 3. Install npm dependencies
# ---------------------------------------------------------------------------
echo ""
echo "[3/6] Installing root npm dependencies..."
npm install

echo ""
echo "[3/6] Installing scraper-service dependencies..."
cd "$PROJECT_DIR/scraper-service"
npm install
npm run build
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 4. Generate updater signing keys
# ---------------------------------------------------------------------------
echo ""
echo "[4/6] Generating updater signing keys..."

KEYS_DIR="$PROJECT_DIR/src-tauri/keys"
mkdir -p "$KEYS_DIR"

if [ -f "$KEYS_DIR/updater.key" ]; then
  echo "  ✓ Updater keys already exist at src-tauri/keys/"
else
  echo "  Generating new key pair..."
  echo "  ⚠ You will be prompted for a password. Remember it!"
  echo "  ⚠ Store the password as TAURI_SIGNING_PRIVATE_KEY_PASSWORD in GitHub Secrets"
  echo ""
  cargo tauri signer generate -w "$KEYS_DIR/updater.key"
  echo ""
  echo "  ✓ Private key: src-tauri/keys/updater.key (DO NOT COMMIT)"
  echo "  ✓ Public key:  src-tauri/keys/updater.key.pub"
  echo ""
  echo "  IMPORTANT:"
  echo "  1. Copy the ENTIRE content of updater.key → GitHub Secret: TAURI_SIGNING_PRIVATE_KEY"
  echo "  2. Set your password → GitHub Secret: TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  echo "  3. Copy the public key into src-tauri/tauri.conf.json → plugins.updater.pubkey"
fi

# ---------------------------------------------------------------------------
# 5. Generate placeholder icons
# ---------------------------------------------------------------------------
echo ""
echo "[5/6] Checking app icons..."

if [ -f "$PROJECT_DIR/src-tauri/icons/icon.ico" ]; then
  echo "  ✓ Icons already exist"
else
  if [ -f "$PROJECT_DIR/public/icon.png" ]; then
    echo "  Generating icons from public/icon.png..."
    cargo tauri icon "$PROJECT_DIR/public/icon.png"
    echo "  ✓ Icons generated"
  else
    echo "  ⚠ No icon.png found in public/ — place a 1024x1024 PNG there and run:"
    echo "    cargo tauri icon public/icon.png"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Copy desktop env
# ---------------------------------------------------------------------------
echo ""
echo "[6/6] Setting up environment..."

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo "  ⚠ No .env.local found — copy .env.desktop and fill in your keys:"
  echo "    cp .env.desktop .env.local"
else
  echo "  ✓ .env.local already exists"
fi

# ---------------------------------------------------------------------------
# Done!
# ---------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Setup complete! Next steps:                     ║"
echo "║                                                  ║"
echo "║  Development:                                    ║"
echo "║    npm run tauri:dev                             ║"
echo "║                                                  ║"
echo "║  Production build:                               ║"
echo "║    npm run tauri:build                           ║"
echo "║                                                  ║"
echo "║  Auth setup (browser login for scrapers):        ║"
echo "║    npm run scraper:auth                          ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
