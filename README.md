[![test](https://github.com/filmil/chrome-auto-reload/actions/workflows/test.yml/badge.svg)](https://github.com/filmil/chrome-auto-reload/actions/workflows/test.yml)
[![release](https://github.com/filmil/chrome-auto-reload/actions/workflows/release.yml/badge.svg)](https://github.com/filmil/chrome-auto-reload/actions/workflows/release.yml)

# filmil's Auto Reload

A Chrome extension that reloads a tab every so many seconds, minutes or
hours, and can do nothing else. It shows no ads, tracks nothing, and has
no access to the pages it reloads. The name says who made it: it is
filmil's, from this repository, and not one of the many extensions with
the same purpose and a generic name.

Auto-reload extensions are a common place for trouble: many ask to "read
and change all your data on all websites", and some have been sold and
turned into adware. This one is built so that you can check, quickly,
that it cannot do that.

## What it can and cannot do

- **Permissions: `alarms` and `storage`, nothing else.** No host
  permissions and no content scripts, so it cannot read or change any
  page. No `tabs` permission, so it never sees a tab's address or title,
  only its ID. Chrome shows no permission warning when you install it.
- **No network.** It makes no requests and loads no remote code. A test
  fails if any of its files names `fetch`, `XMLHttpRequest`, `WebSocket`,
  `eval`, or a URL, or if the manifest asks for more.
- **Small.** About 300 lines of JavaScript, HTML and CSS in
  [`extension/`](extension/), with no dependencies and no build step: the
  release zip is that folder, with the version filled in.
- **Forgets on restart.** Reload settings live in session storage, and end
  with the browser session. Only the last interval you chose is kept, to
  fill in the popup next time.

**The shortest interval is 30 seconds.** That is the most often Chrome
fires an extension's alarm. Reloading faster would need permission to run
code in every page you visit, which is exactly what this extension does
not ask for.

## Use

Click the extension's icon on the tab to reload, choose an interval, and
press **Start**. On a tab that is reloading, the icon shows the minutes
left until the next reload, rounded up: **5** means at most 5 minutes, and
**1** means the last minute. Above 999 minutes it shows hours, such as
**17h**. Chrome runs an alarm no sooner than 30 seconds after it is set,
so for an interval that is not a whole number of minutes, the badge can
show the next number up to 30 seconds late. The popup counts down to the
next reload in seconds. **Stop** ends it; closing the tab
does too. **Bypass the cache** reloads as Shift+Reload does.

## Install

From a [release](https://github.com/filmil/chrome-auto-reload/releases):
download `auto-reload-<version>.zip`, check it against the `.sha256`
file beside it, and unzip it. In Chrome, open `chrome://extensions`, turn
on **Developer mode**, choose **Load unpacked**, and pick the unzipped
folder.

Or from source: clone this repository and load its `extension/` folder
the same way.

Chrome 120 or later.

## Releases

[`release.yml`](.github/workflows/release.yml) runs every day. If
`extension/` changed since the last release, it runs the tests, builds
the zip with Bazel, tests that zip in Chrome, and publishes a release
named after the date (for example `v2026.10.19`). It can also be run by hand from the Actions tab, with
**force** to release without changes.

## Chrome Web Store

[`webstore.yml`](.github/workflows/webstore.yml) sends the newest release
to the Chrome Web Store and submits it for review, if the store does not
have that version yet. It runs after each release and once a day. While
a version is in review it sends nothing, and it never sends a rejected
version again; the next release goes instead. It logs in to Google
without a stored key: GitHub Actions proves which repository it runs for,
and Google lets only this repository act as the store's service account.

Until the setup below is done, the workflow skips. The setup is one time:

1. **Register** as a Chrome Web Store developer, with 2-step verification
   on the Google account.
2. **Upload the first version by hand.** In the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   add a new item with the zip from the newest release. Fill in the
   **Store listing** and **Privacy** tabs, and submit it. The privacy
   tab asks for these:
   - Single purpose: reload the current tab on a timer.
   - `alarms`: runs the timer.
   - `storage`: keeps each tab's interval for the browser session.
   - Remote code: none. Data collected: none.
3. **Create the Google login** for the workflow, in a Google Cloud
   project you own: `scripts/webstore-setup.sh PROJECT_ID`. It creates a
   service account and the federation that ties it to this repository,
   and prints the next two steps.
4. **Add the service account** in the Dashboard, under **Account**.
5. **Set the repository variables** it prints: the provider, the service
   account, the publisher ID (Dashboard, **Publisher**, **Settings**) and
   the item ID.

Then run the workflow by hand once from the Actions tab, to check it.

## Development

[Bazel](https://bazel.build) builds the release zip and runs the unit
tests. Use [Bazelisk](https://github.com/bazelbuild/bazelisk), which runs
the version in `.bazelversion`. Bazel downloads Node by itself, so the
machine needs no Node for these.

```sh
bazel test //...                          # unit tests, and the permission and network checks
bazel build //:zip --//:version=1.2.3     # bazel-bin/auto-reload-1.2.3.zip
```

The same source and version build the same zip, byte for byte. The
version is 1 to 4 integers, each 0 to 65535 with no leading zeros, as
Chrome requires. Left out, it is the source manifest's version.

The end-to-end test needs Node and npm, since Puppeteer downloads its own
Chrome:

```sh
npm ci
npm run test:e2e    # loads the extension into Chrome for Testing; ~2 min
```

The end-to-end test starts a local web page, has the extension reload it
on a real 30-second alarm, and counts the page loads. On Ubuntu 23.10 and
later, Chrome's sandbox cannot start without user namespaces; run it with
`E2E_NO_SANDBOX=1`, or allow them with
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. It loads
`extension/` unless `E2E_EXTENSION_DIR` names another folder; the release
points it at the unzipped zip.

The icons are drawn by [`scripts/make_icons.py`](scripts/make_icons.py)
(`npm run icons`), and CI checks that the committed PNGs match it.

## License

Apache 2.0; see [LICENSE](LICENSE).
