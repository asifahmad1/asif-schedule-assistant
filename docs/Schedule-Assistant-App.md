# Schedule Assistant — App

**Creator:** Prof. Dr. Asif Ahmad
**Version:** 2.0 (14 October 2026)
**Type:** Private web application + installable Android PWA
**Status:** Built and tested — 15/15 tests pass

## Overview

The Schedule Assistant is a private meeting and task scheduler that lives on your
own computer. It keeps your meetings, appointments, and tasks in one place, watches
your Gmail for invitations, syncs with Google Calendar, maintains an auto-updating
worksheet in your Google Drive, and emails you a reminder 30 minutes before every
scheduled event.

Everything runs locally: the app is a small Node.js server you start on your
laptop. Your records are stored in a database file on your computer — not on
someone else's cloud. The only outside service it talks to is your own Google
account (Gmail, Calendar, Drive, Sheets), and only after you connect it with one
sign-in click.

## Applications

- **Meeting scheduling** — create, edit, cancel, and complete meetings with title,
  date, time, duration, location, and notes.
- **Appointment and task tracking** — three event types (meeting, task,
  appointment) with status tracking (scheduled, completed, cancelled).
- **Invitation inbox** — Gmail is scanned for meeting invitations; each one lands
  in a review inbox with a suggested date and time. Nothing is scheduled until you
  approve it.
- **Calendar consolidation** — two-way sync with Google Calendar: import existing
  events, push new ones with "Save to Google".
- **Reminder automation** — a 30-minute reminder before every event, by email and
  in the dashboard, with a full delivery history.
- **Worksheet reporting** — every entry is automatically written as a row in the
  "Asif Schedule Assistant" spreadsheet in Google Drive (Schedule tab + Dashboard
  tab with live counts), updated within seconds of any change.

## How it works

**Architecture.** A Node.js HTTP server (`server.mjs`) serves the web UI and a
JSON API. All records live in a local SQLite database (`core.mjs`). Google
integration (Gmail, Calendar, Drive, Sheets) uses OAuth2 with a Desktop client
and PKCE; tokens are encrypted on disk with AES-256-GCM.

**Event flow.** Events are created in the UI, validated (title 1–180 chars, valid
start/end, max 7 days), and stored with times in UTC. All display is in Pakistan
time (Asia/Karachi).

**Invitation inbox.** Every 5 minutes the server searches Gmail for recent
messages mentioning meetings/appointments. Each new message becomes an inbox
item; `chrono-node` parses English dates to suggest a start/end time with a
confidence note. You review each suggestion and accept or dismiss it — English
date suggestions always need your approval before scheduling.

**Reminders.** A background tick runs every 15 seconds. Any scheduled event
starting within the next 30 minutes gets a reminder: an email to yourself (via
Gmail) and a dashboard entry. Each delivery is claimed once (no duplicates) and
recorded as sent, uncertain, or dashboard. Unconfirmed deliveries are never
auto-replayed; the Reminder History page offers an explicit retry button.

**Worksheet sync.** After any change, a debounced sync (4 seconds) rewrites the
Schedule tab (one row per event, PK times, status colours) and stamps the
Dashboard tab's "Last synced" cell. The spreadsheet is created automatically on
first connect and reused afterwards.

## Workflow

```
Add event (UI) ──▶ validate ──▶ SQLite ──▶ worksheet sync (4s debounce)
                        │
Invitation (Gmail) ──▶ inbox ──▶ your approval ──▶ event ──▶ ...
                        │
Save to Google ──▶ Google Calendar (with Google's own 30-min reminders)
                        │
T-30 min ──▶ reminder tick ──▶ email + dashboard ──▶ history log
```

## How to use

### First-time setup (Windows, beginner steps)

1. Install **Node.js 24 LTS** from https://nodejs.org and Google Chrome.
2. Extract the app zip into a permanent folder (e.g. Documents).
3. Double-click **Start-Windows.cmd**. The first run installs dependencies.
4. Open **http://127.0.0.1:4318** if the browser does not open by itself.
5. Follow **EASY-SETUP.md** in the folder to connect Google:
   - Create a Desktop OAuth client in Google Cloud Console; enable the Gmail,
     Google Calendar, Google Drive, and Google Sheets APIs.
   - In the app's Connections page, upload the client JSON, then click
     "Sign in with Google" and choose **asifahmad1@gmail.com** (one consent click).
6. On macOS/Linux: run `bash start.sh`, then open the same address.

### Phone access (Android)

1. On the laptop, run **Start-Phone-Access.cmd** (sets `ASIF_BIND=lan`).
2. On your phone (same Wi-Fi), open the printed LAN address.
3. Use "Add to Home screen" — the app installs as an icon and opens standalone.

### Daily use

- **Overview** — today's schedule, this week's count, invitations waiting, next event.
- **My schedule** — search and filter all records; edit, complete, cancel, or
  "Save to Google" any event.
- **Invitation inbox** — review Gmail suggestions or paste an invitation manually.
- **Connections** — Google status, sync now, worksheet link, app download.
- **Reminder history** — every reminder delivery with status; retry unconfirmed ones.
- **Settings** — your email, reminder toggles, auto-sync toggle, export backup.

## Features

| Feature | Detail |
|---|---|
| Events | Create, edit, cancel, complete; meeting/task/appointment types |
| Search & filter | By text, upcoming/all/completed/cancelled |
| Week view | 7-day calendar, click a day to add an event |
| Invitation inbox | Gmail scan + manual paste, approval-first scheduling |
| Google Calendar | Two-way sync, "Save to Google" adds Google's own 30-min reminders |
| Drive worksheet | Auto-created spreadsheet, Schedule + Dashboard tabs, live formulas |
| Reminders | Email + dashboard at T-30 min, delivery receipts, manual retry |
| Export | One-click JSON backup of all records |
| PWA | Installable on Android, standalone display, app icons |
| Tests | 15 automated tests (`npm test`), no real emails/APIs touched |

## Benefits

- **Private by design** — binds to localhost by default; records stay on your
  computer; Google tokens encrypted with AES-256-GCM; CSRF and host checks on
  every request.
- **Free forever** — no subscription, no per-user fees; the only account needed
  is your own Google account.
- **No data harvesting** — nothing is sent anywhere except to your own Google
  account, and only what the features need.
- **Honest reminders** — every delivery is logged; unconfirmed ones are flagged,
  never silently replayed.
- **Beginner-friendly** — EASY-SETUP.md walks through every step with no assumed
  knowledge.

## Limitations

- The Node process must be running and the computer awake and online for Gmail
  reminders; the browser may be closed. (Google's own reminders work
  independently after "Save to Google".)
- Google sign-in needs your one manual consent click — it cannot be fully automatic.
- Existing all-day Google events are not imported (they have no start time);
  create a timed event manually if you need a reminder for one.
- Invitation date parsing supports English; review other languages manually.
- A reminder can arrive late if the app or computer was offline; its text shows
  the actual minutes remaining. No reminders are sent after an event has started.
- v2 has no WhatsApp control (removed at your request).

## Uniqueness

Unlike cloud schedulers, this app is **self-hosted and private**: your data file
sits on your own disk, not a vendor's server. The invitation inbox with
**approval-first scheduling** means no email ever becomes a calendar event
without your say-so. The **auto-updating Drive worksheet** gives you a live
spreadsheet of your schedule with zero manual work. And the **delivery receipt
system** treats reminders like registered post — every one is accounted for.

## Security model

- Server binds to `127.0.0.1` by default; LAN mode (`ASIF_BIND=lan`) only adds
  the machine's own LAN addresses. Never expose publicly or port-forward.
- Every request's Host header is checked against an allow-list; non-GET requests
  need the matching Origin and CSRF token.
- Google OAuth uses a Desktop client with PKCE (S256); loopback redirect only.
- Tokens and client secrets are sealed with AES-256-GCM; the key file
  (`local.key`) has owner-only permissions.
- Data folder: `%LOCALAPPDATA%\AsifScheduleAssistant` on Windows,
  `~/AsifScheduleAssistant` on macOS/Linux (overridable with `ASIF_DATA_DIR`).
  Keep it private and back it up; deleting it removes records and connections.

## Deployment on other machines

1. Copy the zip to the new computer (USB, email, cloud drive).
2. Extract, install Node.js 24 LTS, run the start script.
3. Reconnect Google (one sign-in click) — or copy the data folder to carry
   records and the encrypted connection over.

## Operating systems

- **Windows 10/11** — double-click `Start-Windows.cmd` / `Start-Phone-Access.cmd`.
- **macOS / Linux** — `bash start.sh`; same browser UI.
- **ChromeOS** — via Linux (Crostini) with Node 24.
- **Android** — PWA through the LAN address; Add to Home screen.
- **iOS** — the web UI works in Safari over LAN; install prompts vary by iOS version.
