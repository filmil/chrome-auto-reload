# Chrome Web Store listing

What the Developer Dashboard holds for this extension, field by field, so
that it can be filled in again or checked. The images are in this folder;
`npm run store-assets` renders them again from `src/` (see
`scripts/make_store_assets.mjs`).

## Store listing tab

Description (paste as is):

```text
filmil's Auto Reload reloads a tab every few seconds, minutes or hours, and does nothing else.

Pick the tab, choose an interval, and press Start. The icon then shows the minutes left until the next reload, so you can see at a glance that the tab is being kept fresh. Press Stop, or close the tab, to end it. "Bypass the cache" reloads as Shift+Reload does.

Why another auto-reload extension: many of them ask to "read and change all your data on all websites", and some have been sold and turned into adware. This one is built to be unable to do that:

- No ads, no tracking, no analytics.
- No access to page content: it never sees a page's address, title or text, only the tab's number.
- No network access: it makes no requests of its own.
- Two permissions only: "alarms" for the timer and "storage" for your settings. Chrome shows no permission warning when you install it.
- Settings for a tab end with the browser session.

It is open source, under the Apache 2.0 license, and every release is built and tested in public: https://github.com/filmil/chrome-auto-reload

The shortest interval is 30 seconds, which is the shortest timer Chrome gives an extension.
```

Category: Tools (under Productivity)
Language: English

Graphic assets:
- Store icon (128x128): icon-128x128.png
- Screenshot (1280x800): screenshot-1280x800.png
- Small promo tile (440x280): promo-tile-440x280.png
- Marquee promo tile: leave empty (optional)

Additional fields:
- Homepage URL: https://github.com/filmil/chrome-auto-reload
- Support URL: https://github.com/filmil/chrome-auto-reload/issues
- Mature content: No


## Privacy tab

Single purpose description:
Reloads the current tab on a timer that the user sets, and shows the minutes until the next reload on the extension's icon.

Permission justification, "alarms":
Runs the reload timer: one alarm per tab that should reload, which reloads the tab when it fires, and one that updates the countdown on the icon.

Permission justification, "storage":
Keeps each tab's reload interval for the browser session (session storage), and remembers the last interval chosen as the default for the next tab (local storage). Nothing leaves the browser.

Host permission justification: none requested (leave empty, or the field is absent).

Are you using remote code?  No, I am not using remote code.

Data usage: tick none of the data types. It collects no user data.

Certifications: tick all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: not required when no data is collected. If the form insists,
the README's privacy section: https://github.com/filmil/chrome-auto-reload#privacy


## Distribution tab

Payments: Free of charge
Visibility: Public
Regions: All regions


Then: "Submit for review". Review usually takes a few days.
After submitting, note the item ID (32 letters, in the item's URL) and your
publisher ID (Publisher, Settings), for the repository variables.
