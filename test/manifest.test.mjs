// SPDX-License-Identifier: Apache-2.0
// The extension's promise is how little it can do. These tests fail if a
// change widens that.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../extension/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));

test("permissions are only alarms and storage", () => {
  assert.deepEqual([...manifest.permissions].sort(), ["alarms", "storage"]);
  for (const key of ["host_permissions", "optional_permissions",
    "optional_host_permissions", "content_scripts", "externally_connectable",
    "web_accessible_resources"]) {
    assert.equal(manifest[key], undefined, `manifest has ${key}`);
  }
});

test("no code reaches the network or evaluates strings", () => {
  const code = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))
    .map((f) => [f, readFileSync(new URL(f, dir), "utf8")]);
  assert.ok(code.length >= 4);
  for (const [file, text] of code) {
    for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/,
      /sendBeacon/, /\beval\s*\(/, /new Function\b/, /https?:\/\//, /importScripts/]) {
      assert.doesNotMatch(text, bad, `${file} matches ${bad}`);
    }
  }
});

test("the name says whose extension it is", () => {
  const name = "filmil's Auto Reload";
  assert.equal(manifest.name, name);
  assert.equal(manifest.action.default_title, name);
  const popup = readFileSync(new URL("popup.html", dir), "utf8");
  assert.match(popup, new RegExp(`<title>${name}</title>`));
  assert.match(popup, new RegExp(`<h1>${name}</h1>`));
  assert.ok(manifest.description.length <= 132, "Chrome allows 132 characters");
});
