// SPDX-License-Identifier: Apache-2.0
// Keeps one Chrome alarm per tab that should reload, and reloads the tab
// when its alarm fires. It needs no access to the page: chrome.tabs.reload
// and the tab's ID work without the "tabs" or any host permission.
import {
  alarmName, badgeAlarmName, badgeText, msUntilBadgeChange, tabIdFromAlarm,
  tabIdFromBadgeAlarm,
} from "./lib.js";

// Settings per tab, in session storage: they end with the browser session,
// as tab IDs do.
async function getConfig(tabId) {
  const key = alarmName(tabId);
  return (await chrome.storage.session.get(key))[key] ?? null;
}

// When the tab reloads next, in milliseconds since the epoch, or null.
async function nextReloadAt(tabId, config) {
  const alarm = await chrome.alarms.get(alarmName(tabId));
  if (!alarm) return null;
  // Read while the alarm fires, the time may still be the one that fired.
  let at = alarm.scheduledTime;
  while (at <= Date.now()) at += config.seconds * 1000;
  return at;
}

// Shows the minutes until the next reload on the tab's badge, and sets an
// alarm for when that number changes. The worker sleeps between events, so
// an alarm, not a timer, wakes it. Chrome runs an alarm no sooner than 30
// seconds after it is set, so a change due sooner shows up to 30 s late.
async function showBadge(tabId) {
  const config = await getConfig(tabId);
  const at = config && (await nextReloadAt(tabId, config));
  if (!at) return;
  const left = at - Date.now();
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1a73e8" });
  await chrome.action.setBadgeText({ tabId, text: badgeText(left) });
  const change = msUntilBadgeChange(left);
  if (change === null) await chrome.alarms.clear(badgeAlarmName(tabId));
  else await chrome.alarms.create(badgeAlarmName(tabId), { when: Date.now() + change });
}

async function start(tabId, seconds, bypassCache) {
  const name = alarmName(tabId);
  await chrome.storage.session.set({ [name]: { seconds, bypassCache } });
  await chrome.alarms.create(name, {
    delayInMinutes: seconds / 60,
    periodInMinutes: seconds / 60,
  });
  await showBadge(tabId);
}

async function stop(tabId) {
  const name = alarmName(tabId);
  await chrome.alarms.clear(name);
  await chrome.alarms.clear(badgeAlarmName(tabId));
  await chrome.storage.session.remove(name);
  // The tab may be gone already.
  await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
}

async function status(tabId) {
  const config = await getConfig(tabId);
  const alarm = await chrome.alarms.get(alarmName(tabId));
  if (!config || !alarm) return { active: false };
  return { active: true, ...config, nextAt: alarm.scheduledTime };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const badgeTab = tabIdFromBadgeAlarm(alarm.name);
  if (badgeTab !== null) {
    await showBadge(badgeTab).catch(() => stop(badgeTab));
    return;
  }
  const tabId = tabIdFromAlarm(alarm.name);
  if (tabId === null) return;
  const config = await getConfig(tabId);
  if (!config) {
    await chrome.alarms.clear(alarm.name);
    return;
  }
  try {
    await chrome.tabs.reload(tabId, { bypassCache: config.bypassCache });
    await showBadge(tabId);
  } catch {
    // The tab no longer exists.
    await stop(tabId);
  }
});

// Chrome clears a tab's badge when the tab loads a new page; put it back.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === "complete" && (await getConfig(tabId))) await showBadge(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stop(tabId);
});

// Tab IDs do not survive a browser restart, so neither do the alarms.
chrome.runtime.onStartup.addListener(async () => {
  for (const alarm of await chrome.alarms.getAll()) {
    if (tabIdFromAlarm(alarm.name) !== null || tabIdFromBadgeAlarm(alarm.name) !== null) {
      await chrome.alarms.clear(alarm.name);
    }
  }
});

// Only this extension's own popup can send these.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handlers = {
    start: () => start(message.tabId, message.seconds, Boolean(message.bypassCache)),
    stop: () => stop(message.tabId),
    status: () => status(message.tabId),
  };
  const handler = handlers[message.type];
  if (!handler) return false;
  handler().then(
    (result) => reply({ ok: true, result }),
    (error) => reply({ ok: false, error: String(error) }),
  );
  return true; // reply is sent asynchronously
});

// For the end-to-end test, which drives the worker directly.
globalThis.autoReload = { start, stop, status };
