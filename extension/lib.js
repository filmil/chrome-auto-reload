// SPDX-License-Identifier: Apache-2.0
// Pure helpers, shared by the service worker and the popup, and unit-tested
// in Node. Nothing here touches the chrome.* APIs.

// Chrome runs an alarm at most every 30 seconds (Chrome 120 and later).
// Reloading faster would need permission to run code in every page, which
// this extension does not ask for.
export const MIN_SECONDS = 30;
export const MAX_SECONDS = 7 * 24 * 60 * 60;

export const UNITS = { s: 1, min: 60, h: 3600 };

// Returns { seconds } for a valid interval, or { error } with a message for
// the user.
export function toSeconds(value, unit) {
  const factor = UNITS[unit];
  if (factor === undefined) return { error: `Unknown unit: ${unit}` };
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "Enter a number, like 30 or 1.5." };
  const seconds = Math.round(Number(text) * factor);
  if (seconds < MIN_SECONDS) return { error: `The shortest interval is ${MIN_SECONDS} seconds.` };
  if (seconds > MAX_SECONDS) return { error: "The longest interval is 7 days." };
  return { seconds };
}

// Each reload can run up to this many seconds after its interval ends, by a
// random amount, so that tabs started together do not all reload at once.
export const MAX_JITTER_SECONDS = 5;

// Returns { seconds } for a valid jitter, or { error } with a message for
// the user. The jitter is a whole number of seconds; empty means 0.
export function toJitter(value) {
  const text = String(value ?? "").trim();
  if (text === "") return { seconds: 0 };
  const seconds = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(seconds <= MAX_JITTER_SECONDS)) {
    return { error: `Enter the jitter in whole seconds, from 0 to ${MAX_JITTER_SECONDS}.` };
  }
  return { seconds };
}

// The next reload, counted from `now` (in milliseconds): `due` is when the
// interval ends, and `at` is when the reload runs, a random 0 to
// jitterSeconds later. `random` returns a number in [0, 1), as Math.random
// does.
export function nextReload(now, seconds, jitterSeconds = 0, random = Math.random) {
  const due = now + seconds * 1000;
  const jitterMs = Math.floor(random() * (jitterSeconds * 1000 + 1));
  return { due, at: due + jitterMs };
}

// "45 s", "5 min", "1 h 30 min", "2 h".
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (sec || parts.length === 0) parts.push(`${sec} s`);
  return parts.join(" ");
}

// Two alarms per tab, named after it: one reloads the tab, and one updates
// the countdown on the tab's badge.
const PREFIX = "reload:";
const BADGE_PREFIX = "badge:";
function parseAlarm(name, prefix) {
  if (typeof name !== "string" || !name.startsWith(prefix)) return null;
  const digits = name.slice(prefix.length);
  return /^\d+$/.test(digits) ? Number(digits) : null;
}
export function alarmName(tabId) {
  return `${PREFIX}${tabId}`;
}
export function tabIdFromAlarm(name) {
  return parseAlarm(name, PREFIX);
}
export function badgeAlarmName(tabId) {
  return `${BADGE_PREFIX}${tabId}`;
}
export function tabIdFromBadgeAlarm(name) {
  return parseAlarm(name, BADGE_PREFIX);
}

// The badge shows the minutes left until the next reload, rounded up: "5"
// from 5 minutes down to just over 4, and "1" in the last minute. A badge
// fits about four characters, so above 999 minutes it shows hours, rounded
// up the same way ("17h"); the longest interval, 7 days, is "168h".
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MAX_BADGE_MINUTES = 999;

export function badgeText(msLeft) {
  const minutes = Math.max(1, Math.ceil(msLeft / MINUTE));
  if (minutes <= MAX_BADGE_MINUTES) return String(minutes);
  return `${Math.ceil(msLeft / HOUR)}h`;
}

// How long until badgeText(msLeft) changes, in milliseconds, or null when
// it stays "1" until the reload.
export function msUntilBadgeChange(msLeft) {
  if (msLeft <= MINUTE) return null;
  const minutes = Math.ceil(msLeft / MINUTE);
  if (minutes <= MAX_BADGE_MINUTES) return msLeft - (minutes - 1) * MINUTE;
  const hours = Math.ceil(msLeft / HOUR);
  return msLeft - Math.max((hours - 1) * HOUR, MAX_BADGE_MINUTES * MINUTE);
}
