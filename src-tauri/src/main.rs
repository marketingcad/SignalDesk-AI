// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WindowEvent};

struct ManagedProcesses {
    nextjs: Option<Child>,
    scraper: Option<Child>,
    tunnel: Option<Child>,
    tunnel_url: Option<String>,
}

impl ManagedProcesses {
    fn kill_all(&mut self) {
        for (name, child) in [
            ("Next.js", &mut self.nextjs),
            ("Scraper", &mut self.scraper),
            ("Tunnel", &mut self.tunnel),
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

/// Resolve the project root (parent of src-tauri in dev, or resource dir in prod)
fn project_root() -> std::path::PathBuf {
    // In development, src-tauri is a subdirectory of the project root
    if cfg!(debug_assertions) {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| ".".to_string());
        std::path::PathBuf::from(manifest_dir)
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf()
    } else {
        // In production, the bundled app includes the backend next to the executable
        std::env::current_exe()
            .unwrap_or_default()
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf()
    }
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

fn spawn_nextjs(root: &std::path::Path) -> Option<Child> {
    let npm = find_npm();
    log::info!("[tauri] Starting Next.js from {:?}", root);

    let child = if cfg!(debug_assertions) {
        // Dev: run `npm run dev`
        Command::new(&npm)
            .arg("run")
            .arg("dev")
            .current_dir(root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    } else {
        // Production: run `npm run start` (serves .next build)
        Command::new(&npm)
            .arg("run")
            .arg("start")
            .current_dir(root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    };

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

    if !entry.exists() {
        // Fallback: try ts-node in dev mode
        if cfg!(debug_assertions) {
            let npm = find_npm();
            log::info!("[tauri] Starting scraper via ts-node (dev) from {:?}", scraper_dir);
            match Command::new(&npm)
                .arg("run")
                .arg("dev")
                .current_dir(&scraper_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
            {
                Ok(c) => {
                    log::info!("[tauri] Scraper (dev) started (pid={})", c.id());
                    return Some(c);
                }
                Err(e) => {
                    log::error!("[tauri] Failed to start scraper (dev): {}", e);
                    return None;
                }
            }
        }
        log::warn!("[tauri] Scraper dist/index.js not found — run `npm run build` in scraper-service");
        return None;
    }

    log::info!("[tauri] Starting scraper from {:?}", entry);
    match Command::new(&node)
        .arg(&entry)
        .current_dir(&scraper_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
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
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
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

    // Spawn backend processes
    let nextjs = spawn_nextjs(&root);
    let scraper = spawn_scraper(&root);

    let processes = Mutex::new(ManagedProcesses {
        nextjs,
        scraper,
        tunnel: None,
        tunnel_url: None,
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
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Wait for Next.js to be ready, then show the window
            tauri::async_runtime::spawn(async move {
                log::info!("[tauri] Waiting for Next.js to start...");
                let ready = wait_for_server("http://localhost:3000", 30).await;

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
