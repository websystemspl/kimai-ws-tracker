# WS Tracker - time tracking for Kimai

A browser add-on for starting and stopping Kimai timers without opening the panel.
Chrome, Edge and Brave from the store, Firefox from file.

Written from scratch by [Web Systems](https://www.web-systems.pl). It is not a fork of
"Time Tracker Addon for Kimai", whose licence forbids modification and derivative works.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/kimai-pomiar-czasu-web-sy/eliiemekophpilppaobljfjkhbkmchjg)

## What it does

- Start and stop a timer in one click, with the elapsed time on the toolbar badge.
- Projects grouped by customer, so a list of 75 stays usable. The last choice is remembered.
- Resume any past entry. If something is already running, resume stops it and switches over.
- Correct a running entry in place: description, start time, end time, billable.
- Daily and weekly totals in the header.
- A billable switch, and a `$` mark on every row of the list that flips one entry without
  opening Kimai.
- Polish and English, picked in the settings rather than following the browser.
- It refuses to start a timer on a worthless description. Empty, too short and generic
  ones ("fixes", "call", "bug fixing") are rejected. Kimai cannot do this on its own,
  where the description field is always optional.

Authentication uses the modern Bearer token. The legacy `X-AUTH` pair, which Kimai 2.65
deprecates and rate limits, is deliberately not supported.

## Install

The store version is the easy path and works in Edge and Brave too. Firefox has no store
build, so it is loaded from file, the same as a build straight from this repository.

**Chrome, Edge, Brave**

1. **Unpack the ZIP** somewhere permanent. Chrome does not read archives, and pointing it
   at a `.zip` fails with "Manifest file is missing or unreadable".
2. Open `chrome://extensions`.
3. Turn on Developer mode, top right.
4. Click "Load unpacked" and pick the **unpacked directory**. Step inside it before
   confirming: `manifest.json` has to sit directly in the chosen directory.

Do not delete that directory. Chrome reads from it on every start.

**Firefox** (for testing, gone after a restart)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on" and pick `manifest.json`.

## Configure

Click the add-on icon, then Settings:

| Field | Value |
|---|---|
| Kimai URL | your own instance, for example `https://kimai.example.com` |
| API token | your own, from Kimai: Profile > API |
| Language | Polish / English / follow the browser |
| Minimum description length | 15 (0 turns the check off) |

"Test connection" confirms the token works.

The token is not your login password. Everyone has their own and can revoke it in Kimai at
any time.

## Using it

The badge shows how long the current timer has been running. Clicking the icon opens the
window:

- **Idle** - pick a project and an activity, write what you are doing, press start.
- **Running** - see what and since when, press stop. Description, start time and billable
  can be corrected on the spot.
- **Recent entries** - the last twenty, split into days ("Today", "Yesterday", the date)
  with a total per day, and a duration and time range per entry. Resume copies the project,
  activity, description and billable flag back into the form. Each row carries a `$` mark
  that flips how that entry was billed. Below the list is a link to "My times" in Kimai.

Project and activity lock while a timer runs. Changing either is a different entry, not a
correction.

## Billable

Next to the project and activity is a switch with a currency mark. It is the same thing as
the "Billable" field in Kimai and the `$` button in Toggl.

- **green** - the hours go on the client's invoice
- **grey, struck through** - internal time, not billed

It follows what Kimai implies: a customer, project and activity each carry their own
billable flag, and turning any of them off makes the entry non billable. The switch changes
that for one entry and returns to the default when the project changes. An untouched switch
is not sent at all, leaving the decision to Kimai.

### The permission this needs

The billable field is not available to everyone in Kimai. It comes with
`edit_billable_own_timesheet`, which by default only teamlead and above hold. A plain
`ROLE_USER` has it neither in the panel nor in the API, the API form does not know the
`billable` field, and the **whole request** then fails with a 400 saying "This form should
not contain extra fields."

The add-on handles that itself: when Kimai rejects the billable flag, the entry is sent
again without it, the timer starts, Kimai decides billing from the customer, project and
activity, and the switch is dimmed with an explanation. The lock holds until the settings
are saved again, which is the moment to check once more.

To make the switch work, a Kimai administrator enables `edit_billable_own_timesheet` for
`ROLE_USER` under Administration > Roles, column `ROLE_USER`, section "Timesheet (own)".

## About descriptions

The description ends up in the report a client reads. It should answer "what did I get
done", not "what was I poking at".

| Poor | Good |
|---|---|
| `n8n` | `n8n: order sync workflow with the ERP` |
| `fixes` | `Fixed VAT number validation on the signup form` |
| `call` | `Client call: decisions on the payment integration` |
| `bug fixing` | `Fixed the 500 on saving a cart with variant products` |
| (empty) | anything specific |

A description carrying a link or a ticket number (`#412`, `PROJ-88`, a Trello card URL)
passes regardless of length, because an entry like that can be reconstructed anyway.

## Permissions

No server address is baked into the add-on. Saving the settings asks for access to the one
address you entered, and nothing else. The grant is made in a Chrome dialog and can be
revoked under `chrome://extensions`.

Beyond that it uses `storage` (settings and last choice) and `alarms` (refreshing the badge
once a minute). No other permissions, no telemetry.

## Layout

```
manifest.json         add-on declaration (Manifest V3)
background.js         the toolbar badge with the running duration
lib/api.js            Kimai REST API client
lib/i18n.js           translation loading with an explicit language choice
lib/validate.js       description quality check
popup/                the add-on window
options/              settings
_locales/pl, /en      texts
```

## Limits

- Loaded from file, Chrome warns about developer mode on every start. The store build does
  not.
- A Firefox add-on loaded through `about:debugging` is gone after a browser restart.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
