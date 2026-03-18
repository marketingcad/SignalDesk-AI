// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{Manager, RunEvent, WindowEvent};

// ---------------------------------------------------------------------------
// Global state — set once during setup, read by helper functions
// ---------------------------------------------------------------------------
static SERVER_ROOT: OnceLock<PathBuf> = OnceLock::new();
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

struct ManagedProcesses {
    nextjs: Option<Child>,
    scraper: Option<Child>,
    tunnel: Option<Child>,
    tunnel_url: Option<String>,
    auth: Option<Child>,
}

impl ManagedProcesses {
    fn kill_all(&mut self) {
        for (name, child) in [
            ("Next.js", &mut self.nextjs),
            ("Scraper", &mut self.scraper),
            ("Tunnel", &mut self.tunnel),
            ("Auth", &mut self.auth),
        ] {
            if let Some(ref mut c) = child {
                log::info!("[tauri] Killing {} (pid={})", name, c.id());
                let _ = c.kill();
                let _ = c.wait();
            }
            *child = None;
        }
        self.tunnel_url = None;
    }
}

// ===========================================================================
// Path helpers
// ===========================================================================

/// Dev-mode project root: walk up from CARGO_MANIFEST_DIR / exe / cwd
/// looking for a directory that contains `package.json`.
fn project_root() -> PathBuf {
    fn is_root(dir: &Path) -> bool {
        dir.join("package.json").exists()
    }

    // Compile-time path (correct on the build machine)
    let manifest_parent = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf());
    if let Some(ref p) = manifest_parent {
        if is_root(p) {
            return p.clone();
        }
    }

    // Walk up from the executable
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().take(10) {
            if is_root(ancestor) {
                return ancestor.to_path_buf();
            }
        }
    }

    // Walk up from cwd
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors().take(6) {
            if is_root(ancestor) {
                return ancestor.to_path_buf();
            }
        }
    }

    manifest_parent.unwrap_or_else(|| PathBuf::from("."))
}

fn server_root() -> PathBuf {
    SERVER_ROOT
        .get()
        .cloned()
        .unwrap_or_else(project_root)
}

/// Search common install locations for a binary.
/// macOS GUI apps don't inherit the shell PATH, so `node` / `npm`
/// installed via Homebrew or nvm won't be found by default.
fn find_binary(name: &str) -> String {
    if cfg!(target_os = "windows") {
        // Windows: just use the name; it's in the system PATH
        let win_name = if name == "node" { "node.exe" } else { "npm.cmd" };
        return win_name.to_string();
    }

    // Common Node.js install locations on macOS / Linux
    let candidates: &[&str] = &[
        // Homebrew Apple Silicon
        "/opt/homebrew/bin",
        // Homebrew Intel
        "/usr/local/bin",
        // Official Node.js installer / Volta
        "/usr/local/bin",
        // nvm (check common default version paths)
        // We'll also try to resolve nvm below
        "/usr/bin",
    ];

    // 1. Check if it's already on PATH
    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                log::info!("[tauri] Found {} via which: {}", name, path);
                return path;
            }
        }
    }

    // 2. Check common directories
    for dir in candidates {
        let full = format!("{}/{}", dir, name);
        if std::path::Path::new(&full).exists() {
            log::info!("[tauri] Found {} at {}", name, full);
            return full;
        }
    }

    // 3. Check nvm directories (common pattern: ~/.nvm/versions/node/v*/bin/)
    if let Ok(home) = std::env::var("HOME") {
        let nvm_dir = std::path::PathBuf::from(&home).join(".nvm").join("versions").join("node");
        if nvm_dir.exists() {
            // Find the latest installed version
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                let mut versions: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().join("bin").join(name).exists())
                    .collect();
                versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                if let Some(latest) = versions.first() {
                    let path = latest.path().join("bin").join(name);
                    let path_str = path.to_string_lossy().to_string();
                    log::info!("[tauri] Found {} via nvm: {}", name, path_str);
                    return path_str;
                }
            }
        }
    }

    // 4. Fallback: just the name (hope it's on PATH)
    log::warn!("[tauri] Could not find {} in common locations, using bare name", name);
    name.to_string()
}

fn find_node() -> String {
    find_binary("node")
}

fn find_npm() -> String {
    find_binary("npm")
}

/// Build a PATH string that includes common Node.js install directories.
/// This ensures child processes (node server.js) can find node and npm
/// even when launched from a macOS GUI app that has a minimal PATH.
fn enriched_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();

    if cfg!(target_os = "windows") {
        return current;
    }

    let extras = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ];

    // Also add the directory where we found node
    let node_path = find_node();
    let node_dir = std::path::Path::new(&node_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut parts: Vec<String> = Vec::new();
    if !node_dir.is_empty() {
        parts.push(node_dir);
    }
    for extra in extras {
        if !current.contains(extra) {
            parts.push(extra.to_string());
        }
    }
    parts.push(current);
    parts.join(":")
}

// ===========================================================================
// Logging — redirect child stdout/stderr to files
// ===========================================================================

fn log_file(name: &str) -> std::process::Stdio {
    let log_dir = LOG_DIR
        .get()
        .cloned()
        .unwrap_or_else(|| project_root().join("logs"));
    let _ = std::fs::create_dir_all(&log_dir);
    let path = log_dir.join(format!("{}.log", name));
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(file) => file.into(),
        Err(_) => std::process::Stdio::null(),
    }
}

// ===========================================================================
// Bundle extraction (production mode)
// ===========================================================================

/// Find bundle.tar.gz — Tauri v2 places resources in different locations
/// depending on the platform and how the app is packaged.
fn find_bundle_archive(resource_dir: &Path) -> Option<PathBuf> {
    let mut candidates = vec![
        resource_dir.join("bundle.tar.gz"),
    ];

    // macOS: Tauri v2 resource_dir() may return .../Resources/_up_/Resources/
    // but the actual file is in .../Resources/
    if cfg!(target_os = "macos") {
        // Walk up from resource_dir looking for bundle.tar.gz
        for ancestor in resource_dir.ancestors().take(5) {
            let candidate = ancestor.join("bundle.tar.gz");
            if !candidates.iter().any(|c| c == &candidate) {
                candidates.push(candidate);
            }
            // Also check Resources/ directly
            let res = ancestor.join("Resources").join("bundle.tar.gz");
            if !candidates.iter().any(|c| c == &res) {
                candidates.push(res);
            }
        }

        // Try the known macOS .app bundle structure
        if let Ok(exe) = std::env::current_exe() {
            // exe is at VA Hub.app/Contents/MacOS/va-hub
            if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
                let res = contents.join("Resources").join("bundle.tar.gz");
                if !candidates.iter().any(|c| c == &res) {
                    candidates.push(res);
                }
            }
        }
    }

    // Windows: also check next to the executable
    if cfg!(target_os = "windows") {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let candidate = exe_dir.join("bundle.tar.gz");
                if !candidates.iter().any(|c| c == &candidate) {
                    candidates.push(candidate);
                }
            }
        }
    }

    for candidate in &candidates {
        log::info!("[tauri] Checking for bundle at {:?} → exists={}", candidate, candidate.exists());
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }

    log::error!("[tauri] bundle.tar.gz not found. Searched: {:?}", candidates);
    None
}

/// Extract `bundle.tar.gz` into `target`.
/// Skips extraction if the version marker already matches the current build.
fn extract_bundle(resource_dir: &Path, target: &Path) {
    let version = env!("CARGO_PKG_VERSION");
    let version_file = target.join(".bundle-version");

    // Already up-to-date?
    if version_file.exists() {
        if let Ok(v) = std::fs::read_to_string(&version_file) {
            if v.trim() == version {
                log::info!("[tauri] Bundle v{} already extracted", version);
                return;
            }
        }
    }

    let archive = match find_bundle_archive(resource_dir) {
        Some(a) => a,
        None => return,
    };

    log::info!("[tauri] Extracting bundle v{} from {:?} to {:?} ...", version, archive, target);

    // Clean previous extraction
    let _ = std::fs::remove_dir_all(target);
    std::fs::create_dir_all(target).ok();

    let status = Command::new("tar")
        .arg("-xzf")
        .arg(archive.as_os_str())
        .arg("-C")
        .arg(target.as_os_str())
        .status();

    match status {
        Ok(s) if s.success() => {
            let _ = std::fs::write(&version_file, version);
            log::info!("[tauri] Bundle extracted successfully");
        }
        Ok(s) => log::error!("[tauri] tar exited with status {}", s),
        Err(e) => log::error!("[tauri] Failed to run tar: {}", e),
    }
}

// ===========================================================================
// Process spawning
// ===========================================================================

/// Spawn Next.js from the **bundled** standalone server.
fn spawn_nextjs_bundled(root: &Path) -> Option<Child> {
    let server_js = root.join("nextjs").join("server.js");
    if !server_js.exists() {
        log::error!("[tauri] Bundled server.js not found at {:?}", server_js);
        return None;
    }

    let node = find_node();
    let nextjs_dir = root.join("nextjs");
    log::info!("[tauri] Starting bundled Next.js from {:?}", nextjs_dir);

    match Command::new(&node)
        .arg("server.js")
        .current_dir(&nextjs_dir)
        .env("PATH", enriched_path())
        .stdout(log_file("nextjs-stdout"))
        .stderr(log_file("nextjs-stderr"))
        .spawn()
    {
        Ok(c) => {
            log::info!("[tauri] Next.js started (pid={})", c.id());
            Some(c)
        }
        Err(e) => {
            log::error!("[tauri] Failed to start Next.js: {}", e);
            None
        }
    }
}

/// Spawn Next.js from the **project source** (dev / legacy).
fn spawn_nextjs_dev(root: &Path) -> Option<Child> {
    if !root.join("package.json").exists() {
        log::error!("[tauri] package.json not found at {:?}", root);
        return None;
    }

    let npm = find_npm();
    let has_build = root.join(".next").exists();
    let script = if has_build { "start" } else { "dev" };
    log::info!("[tauri] Starting Next.js via `npm run {}` from {:?}", script, root);

    match Command::new(&npm)
        .arg("run")
        .arg(script)
        .current_dir(root)
        .env("PATH", enriched_path())
        .stdout(log_file("nextjs-stdout"))
        .stderr(log_file("nextjs-stderr"))
        .spawn()
    {
        Ok(c) => {
            log::info!("[tauri] Next.js started (pid={})", c.id());
            Some(c)
        }
        Err(e) => {
            log::error!("[tauri] Failed to start Next.js: {}", e);
            None
        }
    }
}

/// Spawn the scraper service from the **bundled** dist.
fn spawn_scraper_bundled(root: &Path) -> Option<Child> {
    let entry = root.join("scraper").join("dist").join("index.js");
    if !entry.exists() {
        log::warn!("[tauri] Bundled scraper not found at {:?}", entry);
        return None;
    }

    let node = find_node();
    let scraper_dir = root.join("scraper");
    log::info!("[tauri] Starting bundled scraper from {:?}", scraper_dir);

    match Command::new(&node)
        .arg(entry.as_os_str())
        .current_dir(&scraper_dir)
        .env("PATH", enriched_path())
        .stdout(log_file("scraper-stdout"))
        .stderr(log_file("scraper-stderr"))
        .spawn()
    {
        Ok(c) => {
            log::info!("[tauri] Scraper started (pid={})", c.id());
            Some(c)
        }
        Err(e) => {
            log::error!("[tauri] Failed to start scraper: {}", e);
            None
        }
    }
}

/// Spawn the scraper service from the **project source** (dev / legacy).
fn spawn_scraper_dev(root: &Path) -> Option<Child> {
    let scraper_dir = root.join("scraper-service");
    if !scraper_dir.exists() {
        log::warn!("[tauri] scraper-service not found at {:?}", scraper_dir);
        return None;
    }

    let node = find_node();
    let entry = scraper_dir.join("dist").join("index.js");

    if entry.exists() {
        log::info!("[tauri] Starting scraper from {:?}", entry);
        match Command::new(&node)
            .arg(&entry)
            .current_dir(&scraper_dir)
            .env("PATH", enriched_path())
            .stdout(log_file("scraper-stdout"))
            .stderr(log_file("scraper-stderr"))
            .spawn()
        {
            Ok(c) => {
                log::info!("[tauri] Scraper started (pid={})", c.id());
                return Some(c);
            }
            Err(e) => log::error!("[tauri] Failed to start scraper: {}", e),
        }
    }

    // Fallback: ts-node
    let npm = find_npm();
    log::info!("[tauri] Starting scraper via ts-node from {:?}", scraper_dir);
    match Command::new(&npm)
        .arg("run")
        .arg("dev")
        .current_dir(&scraper_dir)
        .env("PATH", enriched_path())
        .stdout(log_file("scraper-stdout"))
        .stderr(log_file("scraper-stderr"))
        .spawn()
    {
        Ok(c) => {
            log::info!("[tauri] Scraper (ts-node) started (pid={})", c.id());
            Some(c)
        }
        Err(e) => {
            log::error!("[tauri] Failed to start scraper (ts-node): {}", e);
            None
        }
    }
}

/// Determine whether we are running in bundled mode or dev mode,
/// then spawn the appropriate processes.
fn resolve_and_spawn(app: &tauri::App) -> (PathBuf, Option<Child>, Option<Child>) {
    // --- Try bundled mode (production) ---
    if let Ok(app_data) = app.path().app_data_dir() {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let server_dir = app_data.join("server");
            extract_bundle(&resource_dir, &server_dir);

            if server_dir.join("nextjs").join("server.js").exists() {
                log::info!("[tauri] Using BUNDLED server from {:?}", server_dir);
                let nextjs = spawn_nextjs_bundled(&server_dir);
                let scraper = spawn_scraper_bundled(&server_dir);
                return (server_dir, nextjs, scraper);
            }
        }
    }

    // --- Fallback: dev / source mode ---
    let root = project_root();
    log::info!("[tauri] Using DEV project root: {:?}", root);
    let nextjs = spawn_nextjs_dev(&root);
    let scraper = spawn_scraper_dev(&root);
    (root, nextjs, scraper)
}

// ===========================================================================
// Async helpers
// ===========================================================================

async fn wait_for_server(url: &str, timeout_secs: u64) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(timeout_secs);

    while tokio::time::Instant::now() < deadline {
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() || resp.status().is_redirection() {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

// ===========================================================================
// Tauri commands
// ===========================================================================

#[tauri::command]
async fn check_auth_status() -> serde_json::Value {
    let scraper_dir = find_scraper_dir();
    log::info!("[tauri] Checking auth status in {:?}", scraper_dir);

    let storage_state = scraper_dir.join("auth").join("storage-state.json");
    let profile_dir = scraper_dir.join("auth").join("browser-profile");

    let has_storage_state = storage_state.exists();
    let has_profile = profile_dir.exists()
        && std::fs::read_dir(&profile_dir)
            .map(|entries| entries.count() > 0)
            .unwrap_or(false);
    let has_env = std::env::var("BROWSER_STORAGE_STATE").is_ok();

    serde_json::json!({
        "authenticated": has_storage_state || has_profile || has_env,
        "hasStorageState": has_storage_state,
        "hasProfile": has_profile,
        "hasEnvVar": has_env,
    })
}

/// Locate the scraper directory — checks bundled location first, then source.
fn find_scraper_dir() -> PathBuf {
    let root = server_root();

    // Bundled layout: <server_root>/scraper/
    let bundled = root.join("scraper");
    if bundled.join("dist").join("index.js").exists() || bundled.join("package.json").exists() {
        return bundled;
    }

    // Dev layout: <project_root>/scraper-service/
    let dev = root.join("scraper-service");
    if dev.exists() {
        return dev;
    }

    // Walk up from exe as last resort
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().take(8) {
            let candidate = ancestor.join("scraper-service");
            if candidate.exists() {
                return candidate;
            }
        }
    }

    log::error!("[tauri] Could not find scraper directory");
    root.join("scraper-service")
}

#[tauri::command]
async fn launch_auth_login(
    state: tauri::State<'_, Mutex<ManagedProcesses>>,
    platform: Option<String>,
) -> Result<String, String> {
    {
        let procs = state.lock().map_err(|e| e.to_string())?;
        if procs.auth.is_some() {
            return Err("Auth login is already running. Close the browser first.".to_string());
        }
    }

    let scraper_dir = find_scraper_dir();
    let scraper_dir = scraper_dir
        .canonicalize()
        .unwrap_or_else(|_| scraper_dir.clone());

    log::info!("[tauri] Launching auth:login from {:?}", scraper_dir);

    // In bundled mode, run via ts-node from the source dir if available,
    // otherwise use npm run auth:login from the dev source.
    let npm = find_npm();

    let mut cmd = Command::new(&npm);
    cmd.arg("run").arg("auth:login");

    if let Some(ref p) = platform {
        cmd.arg("--").arg(p);
    }

    cmd.current_dir(&scraper_dir);

    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let child = cmd
        .stdout(log_file("auth-stdout"))
        .stderr(log_file("auth-stderr"))
        .spawn()
        .map_err(|e| format!("Failed to launch auth login (dir={:?}): {}", scraper_dir, e))?;

    let pid = child.id();
    log::info!("[tauri] Auth login started (pid={})", pid);

    let mut procs = state.lock().map_err(|e| e.to_string())?;
    procs.auth = Some(child);

    let platform_name = platform.unwrap_or_else(|| "all platforms".to_string());
    Ok(format!(
        "Auth browser opened for {}. Log in, then close the browser.",
        platform_name
    ))
}

#[tauri::command]
async fn check_auth_login_status(
    state: tauri::State<'_, Mutex<ManagedProcesses>>,
) -> Result<serde_json::Value, String> {
    let mut procs = state.lock().map_err(|e| e.to_string())?;

    let running = if let Some(ref mut child) = procs.auth {
        match child.try_wait() {
            Ok(Some(status)) => {
                log::info!("[tauri] Auth login exited with: {}", status);
                procs.auth = None;
                false
            }
            Ok(None) => true,
            Err(e) => {
                log::error!("[tauri] Error checking auth process: {}", e);
                procs.auth = None;
                false
            }
        }
    } else {
        false
    };

    Ok(serde_json::json!({ "running": running }))
}

#[tauri::command]
async fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn get_backend_status() -> serde_json::Value {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    let nextjs_ok = client
        .get("http://localhost:3000")
        .send()
        .await
        .map(|r| r.status().is_success() || r.status().is_redirection())
        .unwrap_or(false);

    let scraper_health = client
        .get("http://localhost:4000/health")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    serde_json::json!({
        "nextjs": nextjs_ok,
        "scraper": scraper_health,
    })
}

#[tauri::command]
async fn start_tunnel(state: tauri::State<'_, Mutex<ManagedProcesses>>) -> Result<String, String> {
    let cloudflared = if cfg!(target_os = "windows") {
        std::env::var("CLOUDFLARED_PATH").unwrap_or_else(|_| "cloudflared.exe".to_string())
    } else {
        std::env::var("CLOUDFLARED_PATH").unwrap_or_else(|_| "cloudflared".to_string())
    };

    let child = Command::new(&cloudflared)
        .arg("tunnel")
        .arg("--url")
        .arg("http://localhost:3000")
        .stdout(log_file("tunnel-stdout"))
        .stderr(log_file("tunnel-stderr"))
        .spawn()
        .map_err(|e| format!("Failed to start cloudflared: {}", e))?;

    log::info!("[tauri] Cloudflare Tunnel started (pid={})", child.id());

    let mut procs = state.lock().map_err(|e| e.to_string())?;
    procs.tunnel = Some(child);

    Ok("Tunnel starting... URL will appear in a few seconds.".to_string())
}

#[tauri::command]
async fn stop_tunnel(state: tauri::State<'_, Mutex<ManagedProcesses>>) -> Result<String, String> {
    let mut procs = state.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = procs.tunnel {
        let _ = child.kill();
        let _ = child.wait();
    }
    procs.tunnel = None;
    procs.tunnel_url = None;
    Ok("Tunnel stopped.".to_string())
}

#[tauri::command]
async fn restart_services(
    state: tauri::State<'_, Mutex<ManagedProcesses>>,
) -> Result<String, String> {
    let root = server_root();

    {
        let mut procs = state.lock().map_err(|e| e.to_string())?;
        procs.kill_all();
    }

    // Determine mode based on what exists at root
    let is_bundled = root.join("nextjs").join("server.js").exists();
    let (nextjs, scraper) = if is_bundled {
        (spawn_nextjs_bundled(&root), spawn_scraper_bundled(&root))
    } else {
        (spawn_nextjs_dev(&root), spawn_scraper_dev(&root))
    };

    {
        let mut procs = state.lock().map_err(|e| e.to_string())?;
        procs.nextjs = nextjs;
        procs.scraper = scraper;
    }

    Ok("Services restarting...".to_string())
}

// ===========================================================================
// Entry point
// ===========================================================================

fn main() {
    env_logger::init();

    let processes = Mutex::new(ManagedProcesses {
        nextjs: None,
        scraper: None,
        tunnel: None,
        tunnel_url: None,
        auth: None,
    });

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(processes)
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_backend_status,
            restart_services,
            start_tunnel,
            stop_tunnel,
            check_auth_status,
            launch_auth_login,
            check_auth_login_status,
        ])
        .setup(|app| {
            // Set up log directory
            if let Ok(app_data) = app.path().app_data_dir() {
                let _ = LOG_DIR.set(app_data.join("logs"));
            }

            // Resolve server root and start services
            let (root, nextjs, scraper) = resolve_and_spawn(app);
            let _ = SERVER_ROOT.set(root);

            log::info!(
                "[tauri] Server root: {:?}",
                SERVER_ROOT.get().unwrap_or(&PathBuf::from("?"))
            );

            // Store spawned processes
            {
                let state: tauri::State<'_, Mutex<ManagedProcesses>> = app.state();
                let mut procs = state.lock().expect("lock poisoned");
                procs.nextjs = nextjs;
                procs.scraper = scraper;
            }

            // Wait for Next.js then show the window
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                log::info!("[tauri] Waiting for Next.js to start...");
                let ready = wait_for_server("http://localhost:3000", 60).await;

                if ready {
                    log::info!("[tauri] Next.js is ready — showing window");
                } else {
                    log::warn!("[tauri] Next.js did not respond in time — showing window anyway");
                }

                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to build Tauri application");

    app.run(|app_handle, event| {
        let shutdown = |msg: &str| {
            log::info!("[tauri] {}", msg);
            let state: tauri::State<'_, Mutex<ManagedProcesses>> = app_handle.state();
            if let Ok(mut procs) = state.inner().lock() {
                procs.kill_all();
            }
        };

        match event {
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { .. },
                ..
            } => {
                if label == "main" {
                    shutdown("Main window closed — shutting down services");
                }
            }
            RunEvent::ExitRequested { .. } => {
                shutdown("Exit requested — shutting down services");
            }
            _ => {}
        }
    });
}
