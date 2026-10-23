// SPDX-License-Identifier: Apache-2.0
// Renders the Chrome Web Store images in store/ from store/src/: the
// 1280x800 screenshot and the 440x280 promo tile. The screenshot holds the
// real popup, from extension/, with stub.js standing in for the chrome.*
// API so that it shows a tab reloading every 5 minutes.
//
// usage: npm run store-assets
// CHROME=/path/to/chrome picks the browser. Chrome for Testing, Puppeteer's
// default, draws no text on some Linux machines; a system Chrome does.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = mkdtempSync(join(tmpdir(), "store-assets-"));
cpSync(join(root, "extension"), site, { recursive: true });
cpSync(join(root, "store/src"), site, { recursive: true });
const popup = readFileSync(join(site, "popup.html"), "utf8");
writeFileSync(join(site, "popup-shot.html"),
  popup.replace('<link rel="stylesheet" href="popup.css">',
    '<link rel="stylesheet" href="popup.css">\n  <script src="stub.js"></script>'));

// Module scripts do not load from file:// pages, so serve the folder.
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = join(site, normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)));
  try {
    const body = readFileSync(path);
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || undefined,
  args: process.env.E2E_NO_SANDBOX ? ["--no-sandbox"] : [],
});
try {
  const page = await browser.newPage();
  for (const [src, width, height, out] of [
    ["shot.html", 1280, 800, "screenshot-1280x800.png"],
    ["tile.html", 440, 280, "promo-tile-440x280.png"],
  ]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${base}/${src}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1000)); // the popup's first status line
    await page.screenshot({ path: join(root, "store", out), clip: { x: 0, y: 0, width, height } });
    console.log(`store/${out}`);
  }
  cpSync(join(root, "extension/icons/icon128.png"), join(root, "store/icon-128x128.png"));
  console.log("store/icon-128x128.png");
} finally {
  await browser.close();
  server.close();
  rmSync(site, { recursive: true, force: true });
}
