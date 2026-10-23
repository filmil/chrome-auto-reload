// SPDX-License-Identifier: Apache-2.0
// Renders the Chrome Web Store images in store/ from store/src/: the
// 1280x800 screenshot and the 440x280 promo tile. The screenshot holds the
// real popup, from extension/, with stub.js standing in for the chrome.*
// API so that it shows a tab reloading every 5 minutes.
//
// usage: npm ci; npm run store-assets
// The pages use the Noto Sans font, which must be installed (on Debian and
// Ubuntu, fonts-noto-core); without it the images change. CHROME=/path picks
// the browser: Chrome for Testing, Puppeteer's default, draws no text on
// some Linux machines, where a system Chrome does. E2E_NO_SANDBOX=1 runs
// Chrome without its sandbox, for Ubuntu 23.10 and later.
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
const css = '<link rel="stylesheet" href="popup.css">';
if (!popup.includes(css)) throw new Error(`extension/popup.html has no ${css}; update this script`);
writeFileSync(join(site, "popup-shot.html"),
  popup.replace(css, `${css}\n  <script src="stub.js"></script>`));

// Module scripts do not load from file:// pages, so serve the folder.
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = join(site, normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(site + "/")) {
    res.writeHead(403).end();
    return;
  }
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

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME || undefined,
    args: process.env.E2E_NO_SANDBOX ? ["--no-sandbox"] : [],
  });
  const page = await browser.newPage();
  for (const [src, width, height, out] of [
    ["shot.html", 1280, 800, "screenshot-1280x800.png"],
    ["tile.html", 440, 280, "promo-tile-440x280.png"],
  ]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${base}/${src}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    // The screenshot's popup: wait for its status line, and check that it
    // fits the frame shot.html gives it.
    const frame = page.frames().find((f) => f.url().endsWith("/popup-shot.html"));
    if (frame) {
      await frame.waitForFunction(() => document.getElementById("status").textContent !== "");
      await frame.evaluate(() => document.fonts.ready);
      const { w, h, fw, fh } = await frame.evaluate(() => ({
        w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight,
        fw: window.innerWidth, fh: window.innerHeight,
      }));
      if (w > fw || h > fh) {
        throw new Error(`the popup is ${w}x${h}, larger than its ${fw}x${fh} frame; grow .pop in store/src/shot.html`);
      }
    }
    await page.screenshot({ path: join(root, "store", out), clip: { x: 0, y: 0, width, height } });
    console.log(`store/${out}`);
  }
  cpSync(join(root, "extension/icons/icon128.png"), join(root, "store/icon-128x128.png"));
  console.log("store/icon-128x128.png");
} finally {
  await browser?.close();
  server.close();
  rmSync(site, { recursive: true, force: true });
}
