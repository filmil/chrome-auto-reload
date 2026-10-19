// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_SECONDS, alarmName, formatDuration, tabIdFromAlarm, toSeconds,
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
