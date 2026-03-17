# VA Hub — Desktop App Setup Guide

## Prerequisites

1. **Node.js 20+** — [nodejs.org](https://nodejs.org)
2. **Rust** — [rustup.rs](https://rustup.rs)
3. **Visual Studio Build Tools** (Windows only) — C++ workload required
4. **Tauri CLI** — `cargo install tauri-cli --version "^2"`

### Platform-specific

| Platform | Extra Requirements |
|----------|-------------------|
| Windows  | VS Build Tools 2022 with "Desktop development with C++" |
| macOS    | Xcode Command Line Tools (`xcode-select --install`) |
| Linux    | `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev` |

---

## Quick Start

```bash
# 1. Run the automated setup
bash scripts/setup-desktop.sh

# 2. Start the desktop app in dev mode
npm run tauri:dev
```

---

## Project Structure

```
signal-desk-ai/
├── app/                    # Next.js pages + API routes (frontend + backend)
├── components/             # React UI components
│   └── desktop-status-bar.tsx  # Desktop-only status bar
├── lib/
│   └── tauri.ts           # Tauri IPC + updater wrapper
├── scraper-service/        # Playwright scraper (Express on :4000)
├── src-tauri/              # Tauri desktop shell
│   ├── src/main.rs         # Rust: spawns Next.js + scraper + lifecycle
│   ├── tauri.conf.json     # Window config, updater, CSP
│   ├── Cargo.toml          # Rust dependencies
│   ├── capabilities/       # Tauri permission capabilities
│   ├── icons/              # App icons (generate with `cargo tauri icon`)
│   └── keys/               # Updater signing keys (gitignored)
├── .github/workflows/
│   └── release.yml         # CI/CD: build + sign + release
├── scripts/
│   ├── setup-desktop.sh    # Automated setup
│   └── start-desktop.sh    # Dev launcher
└── .env.desktop            # Desktop environment template
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Start desktop app in development mode |
| `npm run tauri:build` | Build production desktop installer |
| `npm run desktop:dev` | Start Next.js + scraper without Tauri window |
| `npm run scraper:auth` | Open browser for social media login (saves cookies) |
| `npm run scraper:dev` | Start scraper service only |
| `npm run updater:keygen` | Generate updater signing keys |

---

## How It Works

### App Startup Flow

1. Tauri launches → Rust `main.rs` executes
2. Rust spawns **Next.js** (`npm run dev` / `npm run start`)
3. Rust spawns **scraper-service** (`node dist/index.js`)
4. Rust polls `http://localhost:3000` until Next.js is ready
5. Tauri window becomes visible, loading the Next.js frontend
6. Desktop status bar shows service health + version + update status
7. On close → Rust kills all child processes

### Auto-Update Flow

1. User has v1.0.0 installed
2. Developer pushes tag `v1.0.1` → GitHub Actions builds all platforms
3. CI uploads binaries + `latest.json` to GitHub Release
4. App checks `latest.json` endpoint on startup
5. If new version found → "Update to v1.0.1" button appears in status bar
6. User clicks → downloads, installs, restarts automatically

---

## Signing Keys Setup

### Generate Keys

```bash
npm run updater:keygen
# Or manually:
cargo tauri signer generate -w src-tauri/keys/updater.key
```

This creates:
- `src-tauri/keys/updater.key` — **PRIVATE** (gitignored, keep secret)
- `src-tauri/keys/updater.key.pub` — **PUBLIC** (goes in tauri.conf.json)

### Configure

1. Copy the public key content into `src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "<paste public key here>"
     }
   }
   ```

2. Add to GitHub repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY` → entire content of `updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → the password you chose

3. Update the updater endpoint URL in `tauri.conf.json`:
   ```json
   "endpoints": [
     "https://github.com/YOUR_USERNAME/signal-desk-ai/releases/latest/download/latest.json"
   ]
   ```

---

## CI/CD Release Process

### Creating a Release

```bash
# 1. Update version in package.json and src-tauri/tauri.conf.json
# 2. Commit changes
git add -A && git commit -m "bump: v1.0.1"

# 3. Create and push a tag
git tag v1.0.1
git push origin main --tags
```

### What Happens

1. GitHub Actions triggers on the `v*` tag
2. Builds for Windows, macOS (ARM + Intel), and Linux
3. Generates signed update artifacts
4. Creates `latest.json` with download URLs and signatures
5. Publishes a GitHub Release with all binaries

---

## Cloudflare Tunnel (Optional)

To expose your local dashboard publicly:

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. The app has built-in tunnel support — use the `startTunnel()` / `stopTunnel()` commands from the Tauri API
3. Or set `ENABLE_CLOUDFLARE_TUNNEL=true` in `.env.local` for auto-start

---

## Troubleshooting

### "Failed to start Next.js"
- Ensure `npm install` was run in the root directory
- Check that port 3000 is not in use: `npx kill-port 3000`

### "Scraper dist/index.js not found"
- Run `cd scraper-service && npm run build`

### Rust compilation fails on Windows
- Install VS Build Tools 2022 with "Desktop development with C++"
- Restart your terminal after installation

### "Application Control policy has blocked this file" (os error 4551)
- **Windows Smart App Control** blocks newly compiled executables
- Fix: Go to **Settings > Privacy & Security > Windows Security > App & browser control > Smart App Control** → set to **Off**
- This is required for any Rust/Cargo development on Windows 11
- Alternatively, build in CI/CD (GitHub Actions) where this isn't an issue

### "link.exe" errors during Rust build
- Git's `link.exe` is conflicting with MSVC's
- The `.cargo/config.toml` in `src-tauri/` fixes this by specifying the MSVC linker path
- If using a different MSVC version, update the path in `.cargo/config.toml`

### Updater says "no update available" even after publishing
- Verify `latest.json` is uploaded to the GitHub Release
- Check that the version in `latest.json` is higher than current
- Verify the public key in `tauri.conf.json` matches the key used for signing

### Window is blank / white screen
- Next.js may still be starting — wait a few seconds
- Check browser console (right-click → Inspect) for errors
- Verify `.env.local` has correct Supabase keys
