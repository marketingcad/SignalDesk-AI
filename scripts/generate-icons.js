#!/usr/bin/env node
/**
 * Generates Tauri app icons (PNG, ICO, ICNS placeholder) using sharp.
 * Run: node scripts/generate-icons.js
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ICONS_DIR = path.join(__dirname, "..", "src-tauri", "icons");

function makeSvg(size) {
  const rx = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.38);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" rx="${rx}" fill="#6366f1"/>` +
      `<text x="50%" y="55%" font-family="Arial,Helvetica,sans-serif" font-weight="bold" ` +
      `font-size="${fontSize}" fill="white" text-anchor="middle" dominant-baseline="middle">VA</text>` +
      `</svg>`
  );
}

async function generatePngs() {
  await sharp(makeSvg(32)).png().toFile(path.join(ICONS_DIR, "32x32.png"));
  await sharp(makeSvg(128)).png().toFile(path.join(ICONS_DIR, "128x128.png"));
  await sharp(makeSvg(256)).png().toFile(path.join(ICONS_DIR, "128x128@2x.png"));
  await sharp(makeSvg(512)).png().toFile(path.join(ICONS_DIR, "icon.png"));
  console.log("[icons] PNGs generated");
}

async function generateIco() {
  const sizes = [16, 32, 48, 256];
  const buffers = await Promise.all(
    sizes.map((s) => sharp(makeSvg(s)).resize(s, s).png().toBuffer())
  );

  // ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(buffers.length, 4);

  let offset = 6 + 16 * buffers.length;
  const entries = [];

  for (let i = 0; i < buffers.length; i++) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0); // width
    entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffers[i].length, 8); // image size
    entry.writeUInt32LE(offset, 12); // data offset
    entries.push(entry);
    offset += buffers[i].length;
  }

  const ico = Buffer.concat([header, ...entries, ...buffers]);
  fs.writeFileSync(path.join(ICONS_DIR, "icon.ico"), ico);
  console.log("[icons] ICO generated");
}

async function generateIcns() {
  // Tauri accepts a PNG file renamed to .icns for dev/CI builds
  fs.copyFileSync(
    path.join(ICONS_DIR, "icon.png"),
    path.join(ICONS_DIR, "icon.icns")
  );
  console.log("[icons] ICNS generated (PNG copy)");
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  await generatePngs();
  await generateIco();
  await generateIcns();

  // Verify all PNGs have valid signatures
  for (const name of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png"]) {
    const buf = fs.readFileSync(path.join(ICONS_DIR, name));
    const sig = buf.slice(0, 4).toString("hex");
    if (sig !== "89504e47") {
      console.error(`[icons] ERROR: ${name} has invalid PNG signature: ${sig}`);
      process.exit(1);
    }
  }
  console.log("[icons] All icons verified");
}

main().catch((err) => {
  console.error("[icons] Failed:", err);
  process.exit(1);
});
