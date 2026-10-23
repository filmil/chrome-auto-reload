[![test](https://github.com/filmil/chrome-auto-reload/actions/workflows/test.yml/badge.svg)](https://github.com/filmil/chrome-auto-reload/actions/workflows/test.yml)
[![release](https://github.com/filmil/chrome-auto-reload/actions/workflows/release.yml/badge.svg)](https://github.com/filmil/chrome-auto-reload/actions/workflows/release.yml)

# Auto Reload

A Chrome extension that reloads a tab every so many seconds, minutes or
hours, and can do nothing else.

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
**17h**. The popup counts down to the next reload in seconds. **Stop** ends it; closing the tab
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

[`release.yml`](.github/workflows/release.yml) runs every Monday. If
`extension/` changed since the last release, it runs the tests, packages
the extension and publishes a release named after the date (for example
`v2026.10.19`). It can also be run by hand from the Actions tab, with
**force** to release without changes.

## Development

```sh
npm ci
npm test            # unit tests, and the permission and network checks
npm run test:e2e    # loads the extension into Chrome for Testing; ~40 s
scripts/package.sh 1.2.3 dist
```

The end-to-end test starts a local web page, has the extension reload it
on a real 30-second alarm, and counts the page loads. On Ubuntu 23.10 and
later, Chrome's sandbox cannot start without user namespaces; run it with
`E2E_NO_SANDBOX=1`, or allow them with
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.

The icons are drawn by [`scripts/make_icons.py`](scripts/make_icons.py)
(`npm run icons`), and CI checks that the committed PNGs match it.

## License

Apache 2.0; see [LICENSE](LICENSE).
