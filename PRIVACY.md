# Privacy

DailyOps is built so that your personal information never leaves your device.

## What stays on your device

Everything you create — tasks, subtasks, groups, categories, projects, repeating
series, time sessions, Islamic reminder history and settings — is stored in your
browser's **IndexedDB** on the device you are using. There are no accounts, no
login and no server-side database.

- Nothing is synchronized between devices or browsers; each keeps its own copy.
- Clearing this site's data in your browser, or browsing in a private window,
  can erase it. Use **Settings → Backup and restore** to keep a copy.
- A backup is a JSON file that **you** download. DailyOps never uploads it.

## Islamic reminders

The Quran verses, dhikr and duas are bundled with the app. Showing them makes no
network request, and which reminders you see or tick is stored only on your
device. The sources are documented in the README.

## What is sent over the network

When you open DailyOps, your browser downloads the app's own files from the
website that hosts it (for example GitHub Pages). Like any web host, that host may
keep standard server logs (IP address, user agent, time of request) under its own
privacy policy. DailyOps loads no fonts, scripts or trackers from other sites.

### Optional anonymous visit counting

The site owner can enable anonymous visit counting to learn roughly how many
people visit. It is **off** unless a GoatCounter code is set in
[`js/config.js`](js/config.js), and it is implemented in
[`js/ui/visits.js`](js/ui/visits.js).

When enabled, each visit sends **one** request to
[GoatCounter](https://www.goatcounter.com) (open source, no cookies) containing only:

| Sent | Value |
| --- | --- |
| Page path | always `/` (the in-app page is never included) |
| Page title | always `DailyOps` |
| A random number | prevents browser caching |

The request is sent without a referrer. As with any web request, GoatCounter
receives your **IP address** and **browser user agent**. According to GoatCounter's
documentation, it uses them to tell unique visits apart with a hash that is not
stored, and keeps only aggregate counts (for example browser, operating system,
screen-size class and country derived from the IP address).

The counting function takes no arguments and reads no app data, so tasks,
projects, notes, times and reminders can never be included.

No request is made when:

- the site owner has not configured a GoatCounter code,
- the page runs on a local development host (`localhost`, `*.test`, …),
- your browser sends **Do Not Track** or **Global Privacy Control**, or
- you turn off **Settings → Privacy → Count my visits anonymously** (stored only
  in your browser).

Because there are no accounts, these figures are **visits and approximate unique
visitors**, not registered users.

### Links you choose to open

Reminder references link to quran.com and sunnah.com. They open only if you click
them, in a new tab, like any other link.
