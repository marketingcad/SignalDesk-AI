fn main() {
    // Create a placeholder bundle.tar.gz if it doesn't exist (dev mode).
    // In production, the real archive is created by scripts/prepare-bundle.js
    // via the beforeBuildCommand in tauri.conf.json.
    let bundle_path = std::path::Path::new("bundle.tar.gz");
    if !bundle_path.exists() {
        std::fs::write(bundle_path, b"").ok();
    }

    tauri_build::build()
}
