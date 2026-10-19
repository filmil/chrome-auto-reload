// SPDX-License-Identifier: Apache-2.0
// Loads the extension into a real Chrome (Chrome for Testing, from
// Puppeteer), starts reloading a local page at the shortest interval, and
// counts the page's loads on the server. Takes about a minute.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const extension = fileURLToPath(new URL("../extension", import.meta.url));
let browser, server, worker, page, base;
let loads = 0;

// Chrome names an unpacked extension after its folder's path: the first 32
// hex digits of the path's SHA-256, written with the letters a to p.
function extensionId(path) {
  const hex = createHash("sha256").update(path).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/page") loads++;
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>test page</title><p>hello</p>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  browser = await puppeteer.launch({
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      // Only for hosts where Chrome's sandbox cannot start (Ubuntu 23.10+
      // restricts the user namespaces it needs). The test page is local.
      ...(process.env.E2E_NO_SANDBOX ? ["--no-sandbox"] : []),
    ],
  });
  // Puppeteer can miss a worker that started before it attached. Opening
  // one of the extension's pages starts the worker if it is asleep, and
  // shows it to Puppeteer either way.
  const id = extensionId(extension);
  const wake = await browser.newPage();
  await wake.goto(`chrome-extension://${id}/popup.html`);
  const target = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.url() === `chrome-extension://${id}/background.js`);
  worker = await target.worker();
  await wake.close();
  page = await browser.newPage();
  await page.goto(`${base}/page`);
  await page.bringToFront();
});

after(async () => {
  await browser?.close();
  server?.close();
});

// The test page's tab, as the extension sees it (by ID only).
async function pageTabId() {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab.id;
  });
}

test("reloads the tab on its alarm, and stops when told", { timeout: 120_000 }, async () => {
  const tabId = await pageTabId();
  const before = loads;
  await worker.evaluate((id) => globalThis.autoReload.start(id, 30, false), tabId);
  try {
    await checkReloads(tabId, before);
  } finally {
    // Leave no alarm behind for the other tests, even on failure.
    await worker.evaluate((id) => globalThis.autoReload.stop(id), tabId);
  }
  const stopped = await worker.evaluate((id) => globalThis.autoReload.status(id), tabId);
  assert.equal(stopped.active, false);
  assert.equal(await worker.evaluate(() => chrome.alarms.getAll().then((a) => a.length)), 0);
});

async function checkReloads(tabId, before) {
  const state = await worker.evaluate((id) => globalThis.autoReload.status(id), tabId);
  assert.equal(state.active, true);
  assert.equal(state.seconds, 30);
  const wait = state.nextAt - Date.now();
  assert.ok(wait > 20_000 && wait <= 31_000, `next reload in ${wait} ms`);

  // Chrome may run an alarm a little late; allow for it.
  const deadline = Date.now() + 75_000;
  while (loads === before && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
  assert.ok(loads > before, "the page was not reloaded");
}

test("the popup refuses an interval under 30 seconds", async () => {
  const id = new URL(worker.url()).host;
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.$eval("#value", (el) => { el.value = "10"; });
  await popup.select("#unit", "s");
  await popup.click("#start");
  await popup.waitForFunction(() => document.getElementById("error").textContent !== "");
  assert.match(await popup.$eval("#error", (el) => el.textContent), /30 seconds/);
  assert.equal(await worker.evaluate(() => chrome.alarms.getAll().then((a) => a.length)), 0);
  await popup.close();
});

test("closing a tab clears its alarm", async () => {
  const other = await browser.newPage();
  await other.goto(`${base}/other`);
  await other.bringToFront();
  const tabId = await pageTabId();
  await worker.evaluate((id) => globalThis.autoReload.start(id, 60, true), tabId);
  assert.equal(await worker.evaluate(() => chrome.alarms.getAll().then((a) => a.length)), 1);
  await other.close();
  const deadline = Date.now() + 5_000;
  let left = 1;
  while (left && Date.now() < deadline) {
    left = await worker.evaluate(() => chrome.alarms.getAll().then((a) => a.length));
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(left, 0);
});
