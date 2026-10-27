// SPDX-License-Identifier: Apache-2.0
// Keeps two Chrome alarms per tab that should reload: one reloads the tab
// when it fires, and one updates the countdown on the tab's badge. It needs no access to the page: chrome.tabs.reload
// and the tab's ID work without the "tabs" or any host permission.
// The reload alarm fires once, and is set again for the next reload, so
// that each reload can have its own random jitter.
import {
  MAX_JITTER_SECONDS, alarmName, badgeAlarmName, badgeText, msUntilBadgeChange, nextReload,
  tabIdFromAlarm, tabIdFromBadgeAlarm,
} from "./lib.js";

// Settings per tab, in session storage: they end with the browser session,
// as tab IDs do. A tab's settings are { seconds, bypassCache, jitter }, and
// only start() writes them. Beside them, under their own key, is when the
// current interval ends, without the jitter.
async function getConfig(tabId) {
  const key = alarmName(tabId);
  return (await chrome.storage.session.get(key))[key] ?? null;
}
function dueKey(tabId) {
  return `due:${tabId}`;
}
async function getDue(tabId) {
  const key = dueKey(tabId);
  return (await chrome.storage.session.get(key))[key] ?? null;
}

// Sets the reload alarm for the end of the next interval, plus the jitter.
// A stop that runs while this one waits removes the tab's settings; then
// this takes back the alarm and the end time it set.
async function schedule(tabId) {
  const config = await getConfig(tabId);
  if (!config) return;
  const { due, at } = nextReload(Date.now(), config.seconds, config.jitter);
  await chrome.storage.session.set({ [dueKey(tabId)]: due });
  await chrome.alarms.create(alarmName(tabId), { when: at });
  if (!(await getConfig(tabId))) await stop(tabId);
}

// Shows the minutes until the next reload on the tab's badge, and sets an
// alarm for when that number changes. The worker sleeps between events, so
// an alarm, not a timer, wakes it. Chrome runs an alarm no sooner than 30
// seconds after it is set, so a change due sooner shows up to 30 s late.
// A reload that is overdue shows "1", and sets no badge alarm: the reload
// alarm fires soon, and the reload shows the badge again.
// The countdown leaves out the jitter: it ends when the interval does.
async function showBadge(tabId) {
  const config = await getConfig(tabId);
  const alarm = config && (await chrome.alarms.get(alarmName(tabId)));
  if (!alarm) return;
  const left = ((await getDue(tabId)) ?? alarm.scheduledTime) - Date.now();
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1a73e8" });
  await chrome.action.setBadgeText({ tabId, text: badgeText(left) });
  const change = msUntilBadgeChange(left);
  if (change === null) await chrome.alarms.clear(badgeAlarmName(tabId));
  else await chrome.alarms.create(badgeAlarmName(tabId), { when: Date.now() + change });
  // A stop that ran while this one waited would leave a badge behind.
  if (!(await getConfig(tabId))) await stop(tabId);
}

async function start(tabId, seconds, bypassCache, jitter = 0) {
  await chrome.storage.session.set({ [alarmName(tabId)]: { seconds, bypassCache, jitter } });
  await schedule(tabId);
  await showBadge(tabId);
}

// Removes the settings first, then the alarms. A schedule() that runs at
// the same time then either sees the settings gone, after it set its alarm,
// and stops the tab again, or set its alarm before this clears it.
async function stop(tabId) {
  const name = alarmName(tabId);
  await chrome.storage.session.remove([name, dueKey(tabId)]);
  await chrome.alarms.clear(name);
  await chrome.alarms.clear(badgeAlarmName(tabId));
  // The tab may be gone already.
  await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
}

async function status(tabId) {
  const config = await getConfig(tabId);
  const alarm = await chrome.alarms.get(alarmName(tabId));
  if (!config || !alarm) return { active: false };
  const due = (await getDue(tabId)) ?? alarm.scheduledTime;
  return { active: true, jitter: 0, ...config, due, nextAt: alarm.scheduledTime };
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
    // The next interval counts from now, when this alarm fired.
    await schedule(tabId);
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

// The popup checks the jitter; this keeps a bad one from reaching an alarm.
function validJitter(jitter) {
  return Number.isInteger(jitter) && jitter >= 0 && jitter <= MAX_JITTER_SECONDS ? jitter : 0;
}

// Only this extension's own popup can send these.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handlers = {
    start: () => start(message.tabId, message.seconds, Boolean(message.bypassCache),
      validJitter(message.jitter)),
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
globalThis.autoReload = { start, stop, status, schedule };
