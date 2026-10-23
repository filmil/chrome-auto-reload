// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, plan } from "../scripts/webstore.mjs";

const revision = (state, ...versions) => ({
  state,
  distributionChannels: versions.map((crxVersion) => ({ crxVersion, deployPercentage: 100 })),
});

test("versions compare part by part, as Chrome compares them", () => {
  assert.ok(compareVersions("2026.10.23", "2026.10.9") > 0);
  assert.ok(compareVersions("2026.10.23.1", "2026.10.23") > 0);
  assert.equal(compareVersions("1.0", "1"), 0);
  assert.ok(compareVersions("2026.1.1", "2025.12.31") > 0);
});

test("a new release goes to the store", () => {
  assert.deepEqual(plan({}, "2026.10.23"), { upload: true });
  const status = { publishedItemRevisionStatus: revision("PUBLISHED", "2026.10.19") };
  assert.deepEqual(plan(status, "2026.10.23"), { upload: true });
});

test("a release the store has is not sent again", () => {
  const status = { publishedItemRevisionStatus: revision("PUBLISHED", "2026.10.23") };
  assert.match(plan(status, "2026.10.23").reason, /already has version 2026.10.23/);
  assert.equal(plan(status, "2026.10.19").upload, false);
});

test("nothing is sent while a version is in review", () => {
  const status = {
    publishedItemRevisionStatus: revision("PUBLISHED", "2026.10.19"),
    submittedItemRevisionStatus: revision("PENDING_REVIEW", "2026.10.23"),
  };
  assert.match(plan(status, "2026.10.24").reason, /2026.10.23 is still in review/);
});

test("a rejected version is not sent again, but the next one is", () => {
  const status = { submittedItemRevisionStatus: revision("REJECTED", "2026.10.23") };
  assert.equal(plan(status, "2026.10.23").upload, false);
  assert.equal(plan(status, "2026.10.24").upload, true);
});

test("an item taken down stops the release", () => {
  assert.throws(() => plan({ takenDown: true }, "2026.10.23"), /taken the item down/);
});

// Runs the script against a local server that answers as the store does.
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function runAgainst(answers) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = Buffer.alloc(0);
    req.on("data", (c) => { body = Buffer.concat([body, c]); });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, size: body.length });
      const answer = answers(req.url);
      res.writeHead(answer ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer ?? { error: "not found" }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const zip = join(mkdtempSync(join(tmpdir(), "cws")), "a.zip");
  writeFileSync(zip, "zip bytes");
  const script = fileURLToPath(new URL("../scripts/webstore.mjs", import.meta.url));
  const result = await new Promise((resolve) => {
    execFile(process.execPath, [script, "2026.10.23", zip], {
      env: {
        CWS_API_URL: `http://127.0.0.1:${server.address().port}`,
        CWS_PUBLISHER_ID: "pub", CWS_EXTENSION_ID: "ext", CWS_ACCESS_TOKEN: "tok",
      },
    }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
  server.close();
  return { ...result, requests };
}

test("the script uploads a new version, then submits it", async () => {
  const { code, stdout, requests } = await runAgainst((url) => ({
    "/v2/publishers/pub/items/ext:fetchStatus": { publishedItemRevisionStatus: revision("PUBLISHED", "2026.10.19") },
    "/upload/v2/publishers/pub/items/ext:upload": { uploadState: "SUCCEEDED", crxVersion: "2026.10.23" },
    "/v2/publishers/pub/items/ext:publish": { state: "PENDING_REVIEW" },
  })[url]);
  assert.equal(code, 0);
  assert.match(stdout, /2026.10.23 submitted: PENDING_REVIEW/);
  assert.deepEqual(requests.map((r) => `${r.method} ${r.url}`), [
    "GET /v2/publishers/pub/items/ext:fetchStatus",
    "POST /upload/v2/publishers/pub/items/ext:upload",
    "POST /v2/publishers/pub/items/ext:publish",
  ]);
  assert.ok(requests.every((r) => r.auth === "Bearer tok"));
  assert.equal(requests[1].size, "zip bytes".length);
});

test("the script stops when the store has the version", async () => {
  const { code, stdout, requests } = await runAgainst(() => ({
    publishedItemRevisionStatus: revision("PUBLISHED", "2026.10.23"),
  }));
  assert.equal(code, 0);
  assert.match(stdout, /not sending 2026.10.23/);
  assert.equal(requests.length, 1);
});

test("the script fails on a failed upload or an HTTP error", async () => {
  const failed = await runAgainst((url) => (url.includes("fetchStatus") ? {} : { uploadState: "FAILED" }));
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /upload ended as FAILED/);
  const missing = await runAgainst(() => undefined);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /HTTP 404/);
});
