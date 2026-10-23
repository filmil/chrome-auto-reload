// SPDX-License-Identifier: Apache-2.0
// Stands in for the chrome.* API, so the popup shows a tab that is
// reloading every 5 minutes, with 4 min 12 s left.
// The clock is frozen, so every render shows the same countdown.
const now = Date.now();
Date.now = () => now;
const nextAt = now + 252_000;
window.chrome = {
  tabs: { query: async () => [{ id: 7 }] },
  storage: { local: { get: async () => ({}), set: async () => {} } },
  runtime: {
    sendMessage: async () => ({ ok: true, result: { active: true, seconds: 300, bypassCache: false, nextAt } }),
  },
};
