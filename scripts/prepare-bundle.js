/**
 * prepare-bundle.js
 *
 * Assembles the Next.js standalone server and scraper-service into a single
 * tar.gz archive that Tauri bundles as a resource. On first launch the
 * desktop app extracts this archive into its AppData directory so it can
 * run the servers without requiring the project source code on disk.
 *
 * Run: node scripts/prepare-bundle.js
 */

const { execSync } = require("child_process");
const {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  copyFileSync,
} = require("fs");
const path = require("path");

const root = process.cwd();
const stageDir = path.join(root, "src-tauri", "_bundle-stage");
const archivePath = path.join(root, "src-tauri", "bundle.tar.gz");

// -------------------------------------------------------------------
// 0. Clean previous staging directory
// -------------------------------------------------------------------
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

// -------------------------------------------------------------------
// 1. Next.js standalone output
// -------------------------------------------------------------------
const standaloneDir = path.join(root, ".next", "standalone");
if (!existsSync(standaloneDir)) {
  console.error(
    "ERROR: .next/standalone not found. Make sure next.config.ts has output: 'standalone' and run 'npm run build' first."
  );
  process.exit(1);
}

console.log("Copying Next.js standalone...");
cpSync(standaloneDir, path.join(stageDir, "nextjs"), { recursive: true });

// Static assets must be placed inside the standalone tree
const staticDir = path.join(root, ".next", "static");
if (existsSync(staticDir)) {
  cpSync(staticDir, path.join(stageDir, "nextjs", ".next", "static"), {
    recursive: true,
  });
}

// Public folder
const publicDir = path.join(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(stageDir, "nextjs", "public"), {
    recursive: true,
  });
}

// Copy env files so the standalone server can read runtime vars
for (const envFile of [".env.local", ".env"]) {
  const src = path.join(root, envFile);
  if (existsSync(src)) {
    copyFileSync(src, path.join(stageDir, "nextjs", envFile));
    console.log(`  Copied ${envFile}`);
  }
}

// -------------------------------------------------------------------
// 2. Scraper service (compiled JS + production node_modules)
// -------------------------------------------------------------------
const scraperSrc = path.join(root, "scraper-service");
const scraperDest = path.join(stageDir, "scraper");
mkdirSync(scraperDest, { recursive: true });

const scraperDist = path.join(scraperSrc, "dist");
if (existsSync(scraperDist)) {
  console.log("Copying scraper-service/dist...");
  cpSync(scraperDist, path.join(scraperDest, "dist"), { recursive: true });
}

// package.json (needed for potential npm scripts)
if (existsSync(path.join(scraperSrc, "package.json"))) {
  copyFileSync(
    path.join(scraperSrc, "package.json"),
    path.join(scraperDest, "package.json")
  );
}

// Production node_modules
const scraperModules = path.join(scraperSrc, "node_modules");
if (existsSync(scraperModules)) {
  console.log("Copying scraper-service/node_modules (this may take a moment)...");
  cpSync(scraperModules, path.join(scraperDest, "node_modules"), {
    recursive: true,
  });
}

// Create empty directories that the scraper expects
mkdirSync(path.join(scraperDest, "storage"), { recursive: true });
mkdirSync(path.join(scraperDest, "auth"), { recursive: true });

// -------------------------------------------------------------------
// 3. Create the archive
// -------------------------------------------------------------------
console.log("Creating bundle.tar.gz...");

// On Windows, tar interprets "C:" as a remote host. Use --force-local
// to treat the archive name as a local file, and use forward slashes.
const isWin = process.platform === "win32";
const tarArgs = [
  "-czf",
  archivePath,
  ...(isWin ? ["--force-local"] : []),
  "-C",
  stageDir,
  ".",
];

execSync(`tar ${tarArgs.map((a) => `"${a}"`).join(" ")}`, {
  stdio: "inherit",
});

// Clean staging
rmSync(stageDir, { recursive: true, force: true });

const sizeMB = (
  require("fs").statSync(archivePath).size /
  1024 /
  1024
).toFixed(1);
console.log(`Bundle created: ${archivePath} (${sizeMB} MB)`);
