// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_SECONDS, alarmName, badgeAlarmName, badgeText, formatDuration,
  msUntilBadgeChange, tabIdFromAlarm, tabIdFromBadgeAlarm, toSeconds,
} from "../extension/lib.js";

test("toSeconds converts each unit", () => {
  assert.deepEqual(toSeconds("45", "s"), { seconds: 45 });
  assert.deepEqual(toSeconds("5", "min"), { seconds: 300 });
  assert.deepEqual(toSeconds("1.5", "h"), { seconds: 5400 });
  assert.deepEqual(toSeconds(" 2 ", "min"), { seconds: 120 });
});

test("toSeconds refuses what Chrome or the user cannot mean", () => {
  assert.match(toSeconds("10", "s").error, /30 seconds/);
  assert.equal(toSeconds(String(MIN_SECONDS), "s").seconds, MIN_SECONDS);
  assert.match(toSeconds("8", "h").error ?? "", /^$/); // 8 h is fine
  assert.match(toSeconds("200", "h").error, /7 days/);
  for (const bad of ["", "abc", "-5", "1e3", "5 min", "0x10"]) {
    assert.ok(toSeconds(bad, "s").error, `accepted ${JSON.stringify(bad)}`);
  }
  assert.match(toSeconds("5", "days").error, /Unknown unit/);
});

test("formatDuration", () => {
  assert.equal(formatDuration(0), "0 s");
  assert.equal(formatDuration(45), "45 s");
  assert.equal(formatDuration(300), "5 min");
  assert.equal(formatDuration(5400), "1 h 30 min");
  assert.equal(formatDuration(7200), "2 h");
  assert.equal(formatDuration(3661), "1 h 1 min 1 s");
  assert.equal(formatDuration(-3), "0 s");
});

test("alarm names round-trip, and others are ignored", () => {
  assert.equal(tabIdFromAlarm(alarmName(42)), 42);
  assert.equal(tabIdFromAlarm(alarmName(0)), 0);
  for (const other of ["reload:", "reload:x", "reload:-1", "reload:1.5", "other:3", null]) {
    assert.equal(tabIdFromAlarm(other), null, String(other));
  }
});

test("the badge shows minutes left, rounded up", () => {
  const min = 60 * 1000;
  assert.equal(badgeText(5 * min), "5");
  assert.equal(badgeText(4 * min + 1), "5");
  assert.equal(badgeText(4 * min), "4");
  assert.equal(badgeText(30 * 1000), "1");
  assert.equal(badgeText(0), "1"); // a late alarm still shows "1"
  assert.equal(badgeText(-5000), "1");
  assert.equal(badgeText(999 * min), "999");
  assert.equal(badgeText(999 * min + 1), "17h");
  assert.equal(badgeText(7 * 24 * 60 * min), "168h");
});

test("the badge changes when the rounded number does", () => {
  const min = 60 * 1000;
  assert.equal(msUntilBadgeChange(min), null);
  assert.equal(msUntilBadgeChange(30 * 1000), null);
  assert.equal(msUntilBadgeChange(min + 1), 1);
  assert.equal(msUntilBadgeChange(90 * 1000), 30 * 1000);
  assert.equal(msUntilBadgeChange(5 * min), min);
  assert.equal(msUntilBadgeChange(999 * min + 1), 1); // "17h" becomes "999"
  assert.equal(msUntilBadgeChange(20 * 60 * min), 60 * min); // "20h" becomes "19h"
  // After each change, the text is the one for the time then left.
  for (const left of [61 * 1000, 90 * 1000, 5 * min, 1000 * min, 7 * 24 * 60 * min]) {
    const change = msUntilBadgeChange(left);
    assert.notEqual(badgeText(left - change), badgeText(left), String(left));
    assert.equal(badgeText(left - change + 1), badgeText(left), String(left));
  }
});

test("badge alarms are told apart from reload alarms", () => {
  assert.equal(tabIdFromBadgeAlarm(badgeAlarmName(7)), 7);
  assert.equal(tabIdFromAlarm(badgeAlarmName(7)), null);
  assert.equal(tabIdFromBadgeAlarm(alarmName(7)), null);
});
