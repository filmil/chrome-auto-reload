// SPDX-License-Identifier: Apache-2.0
import { formatDuration, toSeconds } from "./lib.js";

const $ = (id) => document.getElementById(id);
let tabId = null;
let ticker = null;

function send(message) {
  return chrome.runtime.sendMessage(message).then((reply) => {
    if (!reply?.ok) throw new Error(reply?.error ?? "No reply from the extension");
    return reply.result;
  });
}

async function refresh() {
  clearInterval(ticker);
  const state = await send({ type: "status", tabId });
  $("stop").disabled = !state.active;
  $("start").textContent = state.active ? "Restart" : "Start";
  if (!state.active) {
    $("status").textContent = "Not reloading this tab.";
    return;
  }
  const show = () => {
    const left = Math.max(0, (state.nextAt - Date.now()) / 1000);
    $("status").textContent =
      `Reloading every ${formatDuration(state.seconds)}` +
      `${state.bypassCache ? ", bypassing the cache" : ""}. Next in ${formatDuration(left)}.`;
  };
  show();
  ticker = setInterval(() => {
    // The alarm has fired and been rescheduled: read the new time.
    if (Date.now() > state.nextAt + 1000) refresh();
    else show();
  }, 1000);
}

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("error").textContent = "";
  const { seconds, error } = toSeconds($("value").value, $("unit").value);
  if (error) {
    $("error").textContent = error;
    return;
  }
  const bypassCache = $("bypass").checked;
  try {
    await send({ type: "start", tabId, seconds, bypassCache });
    // Remembered as the default for the next tab.
    await chrome.storage.local.set({
      last: { value: $("value").value, unit: $("unit").value, bypassCache },
    });
    await refresh();
  } catch (e) {
    $("error").textContent = e.message;
  }
});

$("stop").addEventListener("click", async () => {
  $("error").textContent = "";
  await send({ type: "stop", tabId });
  await refresh();
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  if (tabId === null) {
    $("error").textContent = "No tab to reload.";
    $("start").disabled = $("stop").disabled = true;
    return;
  }
  const { last } = await chrome.storage.local.get("last");
  if (last) {
    $("value").value = last.value;
    $("unit").value = last.unit;
    $("bypass").checked = Boolean(last.bypassCache);
  }
  const state = await send({ type: "status", tabId });
  if (state.active) {
    // Show this tab's own settings, not the last ones used elsewhere.
    const inMinutes = state.seconds % 60 === 0 && state.seconds % 3600 !== 0;
    const inHours = state.seconds % 3600 === 0;
    $("unit").value = inHours ? "h" : inMinutes ? "min" : "s";
    $("value").value = String(state.seconds / (inHours ? 3600 : inMinutes ? 60 : 1));
    $("bypass").checked = state.bypassCache;
  }
  await refresh();
}

init();
