// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WindowEvent};

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

/// Resolve the project root (parent of src-tauri in dev, or source dir in prod).
/// In production, the exe lives in an install directory that does NOT contain
/// the project sources (package.json, .next, scraper-service, etc.), so we
/// must search for the real project root.
fn project_root() -> std::path::PathBuf {
    // Helper: a valid project root has a package.json
    fn is_project_root(dir: &std::path::Path) -> bool {
        dir.join("package.json").exists()
    }

    // 1. Compile-time path — always correct on the build machine
    let manifest_parent = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf());
    if let Some(ref p) = manifest_parent {
        if is_project_root(p) {
            return p.clone();
        }
    }

    // 2. Walk up from the executable (handles src-tauri/target/debug/... and installed paths)
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().take(10) {
            if is_project_root(ancestor) {
                return ancestor.to_path_buf();
            }
        }
    }

    // 3. Current working directory (user may launch from project root)
    if let Ok(cwd) = std::env::current_dir() {
        if is_project_root(&cwd) {
            return cwd;
        }
        // Also walk up from cwd
        for ancestor in cwd.ancestors().take(6) {
            if is_project_root(ancestor) {
                return ancestor.to_path_buf();
            }
        }
    }

    // 4. Fallback: original compile-time parent (may not exist but better than ".")
    manifest_parent.unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn find_npm() -> String {
    if cfg!(target_os = "windows") {
        "npm.cmd".to_string()
    } else {
        "npm".to_string()
    }
}

fn find_node() -> String {
    if cfg!(target_os = "windows") {
        "node.exe".to_string()
    } else {
        "node".to_string()
    }
}

/// Get a log file handle for child process output.
/// In release mode, stdout/stderr MUST go to a file (not Stdio::piped())
/// because piped buffers fill up and block the child process when nobody reads them.
fn log_file(name: &str) -> std::process::Stdio {
    let log_dir = project_root().join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let path = log_dir.join(format!("{}.log", name));
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(file) => file.into(),
        Err(_) => std::process::Stdio::null(),
    }
}

fn spawn_nextjs(root: &std::path::Path) -> Option<Child> {
    if !root.join("package.json").exists() {
        log::error!("[tauri] Cannot start Next.js — package.json not found at {:?}", root);
        return None;
    }

    let npm = find_npm();
    log::info!("[tauri] Starting Next.js from {:?}", root);

    // Use `npm run start` if .next build exists, otherwise `npm run dev`
    let has_build = root.join(".next").exists();
    let script = if has_build { "start" } else { "dev" };
    log::info!("[tauri] Using Next.js script: npm run {} (has_build={})", script, has_build);

    let child = Command::new(&npm)
        .arg("run")
        .arg(script)
        .current_dir(root)
        .stdout(log_file("nextjs-stdout"))
        .stderr(log_file("nextjs-stderr"))
        .spawn();

    match child {
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

fn spawn_scraper(root: &std::path::Path) -> Option<Child> {
    let scraper_dir = root.join("scraper-service");
    if !scraper_dir.exists() {
        log::warn!("[tauri] scraper-service directory not found at {:?}", scraper_dir);
        return None;
    }

    let node = find_node();
    let entry = scraper_dir.join("dist").join("index.js");

    if entry.exists() {
        // Production: use compiled dist/index.js
        log::info!("[tauri] Starting scraper from {:?}", entry);
        match Command::new(&node)
            .arg(&entry)
            .current_dir(&scraper_dir)
            .stdout(log_file("scraper-stdout"))
            .stderr(log_file("scraper-stderr"))
            .spawn()
        {
            Ok(c) => {
                log::info!("[tauri] Scraper started (pid={})", c.id());
                return Some(c);
            }
            Err(e) => {
                log::error!("[tauri] Failed to start scraper: {}", e);
                // Fall through to try ts-node
            }
        }
    }

    // Fallback: run via ts-node (works in both dev and prod if dist not built)
    let npm = find_npm();
    log::info!("[tauri] Starting scraper via ts-node from {:?}", scraper_dir);
    match Command::new(&npm)
        .arg("run")
        .arg("dev")
        .current_dir(&scraper_dir)
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

/// Wait until a URL responds with 200 (up to `timeout` seconds)
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

/// Check if browser auth cookies exist (storage-state.json or browser-profile)
#[tauri::command]
async fn check_auth_status() -> serde_json::Value {
    let scraper_dir = find_scraper_dir().unwrap_or_else(|| project_root().join("scraper-service"));
    let scraper_dir = scraper_dir.canonicalize().unwrap_or(scraper_dir);
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

/// Find the scraper-service directory by checking multiple possible locations
fn find_scraper_dir() -> Option<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    // 1. Compile-time path from CARGO_MANIFEST_DIR (baked into the binary at build time)
    //    In dev: src-tauri/ -> parent is project root
    let manifest_parent = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf());
    if let Some(parent) = manifest_parent {
        candidates.push(parent.join("scraper-service"));
    }

    // 2. Relative to project_root()
    candidates.push(project_root().join("scraper-service"));

    // 3. Relative to current working directory
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("scraper-service"));
    }

    // 4. Walk up from executable (handles src-tauri/target/debug/... layouts)
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().take(8) {
            let candidate = ancestor.join("scraper-service");
            if candidate.exists() {
                candidates.push(candidate);
                break;
            }
        }
    }

    for dir in &candidates {
        if dir.as_os_str().is_empty() {
            continue;
        }
        if dir.exists() && dir.join("package.json").exists() {
            log::info!("[tauri] Found scraper-service at {:?}", dir);
            return Some(dir.clone());
        }
    }

    log::error!("[tauri] Could not find scraper-service directory. Tried: {:?}", candidates);
    None
}

/// Launch the auth:login browser (interactive — opens visible Playwright browser)
#[tauri::command]
async fn launch_auth_login(
    state: tauri::State<'_, Mutex<ManagedProcesses>>,
    platform: Option<String>,
) -> Result<String, String> {
    // Check if auth process is already running
    {
        let procs = state.lock().map_err(|e| e.to_string())?;
        if procs.auth.is_some() {
            return Err("Auth login is already running. Close the browser first.".to_string());
        }
    }

    let scraper_dir = find_scraper_dir()
        .ok_or_else(|| "Could not find scraper-service directory. Make sure you're running from the project root.".to_string())?;

    // Canonicalize to resolve any relative segments (avoids OS error 267 on Windows)
    let scraper_dir = scraper_dir.canonicalize().map_err(|e| {
        format!("scraper-service directory {:?} is not accessible: {}", scraper_dir, e)
    })?;

    log::info!("[tauri] Launching auth:login from {:?}", scraper_dir);

    let npm = find_npm();

    let mut cmd = Command::new(&npm);
    cmd.arg("run").arg("auth:login");

    // Pass platform arg if specified (e.g., "facebook", "linkedin", "twitter")
    if let Some(ref p) = platform {
        cmd.arg("--").arg(p);
    }

    cmd.current_dir(&scraper_dir);

    // On Windows, hide the console window in release mode
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW — but Playwright opens its own GUI
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

/// Check if auth login process is still running, and clean up if done
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
            Ok(None) => true, // still running
            Err(e) => {
                log::error!("[tauri] Error checking auth process: {}", e);
                procs.auth = None;
                false
            }
        }
    } else {
        false
    };

    Ok(serde_json::json!({
        "running": running,
    }))
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
        .and_then(|r| Ok(r.status().is_success()))
        .unwrap_or(false);

    serde_json::json!({
        "nextjs": nextjs_ok,
        "scraper": scraper_health,
    })
}

#[tauri::command]
async fn start_tunnel(state: tauri::State<'_, Mutex<ManagedProcesses>>) -> Result<String, String> {
    let cloudflared = if cfg!(target_os = "windows") {
        std::env::var("CLOUDFLARED_PATH")
            .unwrap_or_else(|_| "cloudflared.exe".to_string())
    } else {
        std::env::var("CLOUDFLARED_PATH")
            .unwrap_or_else(|_| "cloudflared".to_string())
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
async fn restart_services(state: tauri::State<'_, Mutex<ManagedProcesses>>) -> Result<String, String> {
    {
        let mut procs = state.lock().map_err(|e| e.to_string())?;
        procs.kill_all();
    }

    let root = project_root();

    let nextjs = spawn_nextjs(&root);
    let scraper = spawn_scraper(&root);

    {
        let mut procs = state.lock().map_err(|e| e.to_string())?;
        procs.nextjs = nextjs;
        procs.scraper = scraper;
    }

    Ok("Services restarting...".to_string())
}

fn main() {
    env_logger::init();

    let root = project_root();
    log::info!("[tauri] Project root: {:?}", root);
    log::info!("[tauri] package.json exists: {}", root.join("package.json").exists());
    log::info!("[tauri] scraper-service exists: {}", root.join("scraper-service").exists());
    log::info!("[tauri] .next exists: {}", root.join(".next").exists());

    // Spawn backend processes
    let nextjs = spawn_nextjs(&root);
    let scraper = spawn_scraper(&root);

    let processes = Mutex::new(ManagedProcesses {
        nextjs,
        scraper,
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
            let app_handle = app.handle().clone();

            // Wait for Next.js to be ready, then show the window
            tauri::async_runtime::spawn(async move {
                log::info!("[tauri] Waiting for Next.js to start...");
                let ready = wait_for_server("http://localhost:3000", 45).await;

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
            let state: tauri::State<'_, Mutex<ManagedProcesses>> =
                app_handle.state();
            let mutex: &Mutex<ManagedProcesses> = state.inner();
            if let Ok(mut procs) = mutex.lock() {
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
