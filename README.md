# Asif Schedule Assistant

Created by **Dr. Asif Ahmad**.

A private app to keep meeting, appointment, and task records; review Gmail invitations; sync Google Calendar; keep an auto-updating worksheet in Google Drive; and receive Gmail reminders 30 minutes before scheduled events.

## Start

1. Install **Node.js 24 LTS or newer** from https://nodejs.org and Google Chrome.
2. Extract this complete folder into a permanent location.
3. On Windows, double-click **Start-Windows.cmd**. The first run installs dependencies.
4. Open **http://127.0.0.1:4318** if the browser does not open automatically.
5. Follow **EASY-SETUP.md** (simple guide) or **SETUP.md** (technical reference) to connect Google.

On macOS/Linux: run `bash start.sh`, then open the same address.

## What works

- Create, edit, cancel, complete, search, and export meeting/task records.
- SQLite storage survives browser closure and app restarts.
- All dates display in Pakistan time (Asia/Karachi); times are stored in UTC.
- Gmail invitation search and calendar synchronization every five minutes, once connected.
- English date suggestions require your approval before scheduling.
- **Google Drive worksheet**: every entry is automatically written as a row in the "Asif Schedule Assistant" spreadsheet (Schedule tab + Dashboard tab with live counts), updated within seconds of any change.
- Reminders are checked every 15 seconds. They are due 30 minutes before the event and delivered once per channel per occurrence.
- A reminder can be late if the app or computer was offline. Its text shows the actual minutes remaining. No reminders are sent after an event has already started.
- Unconfirmed deliveries are not automatically replayed; Reminder history offers an explicit retry.
- Saving a meeting to Google adds Google's own 30-minute email and popup reminders.

## Current connection status

This download contains connection code, **not an already connected account**. Your ChatGPT Google connection is separate from this standalone app. Google requires your own Desktop OAuth client setup and one sign-in click. Default account: **asifahmad1@gmail.com**.

## Running reminders

The Node process must remain running and the computer must be awake and online for Gmail reminders. The browser may be closed. Google Calendar's own reminders work independently after you click **Save to Google**.

Existing all-day Google events are not imported automatically because they have no meeting start time. Create a timed event manually if you need a reminder.

## Phone access

Run **Start-Phone-Access.cmd** and open the printed LAN address on your Android phone (same Wi-Fi), then Add to Home screen. The server accepts only loopback and the machine's own LAN addresses.

## Data and privacy

The server binds to **127.0.0.1** by default (or the machine's LAN addresses with `ASIF_BIND=lan`), checks request origin and a CSRF token, and rejects other Host values. Do not expose it publicly or through port forwarding.

On Windows, records are under `%LOCALAPPDATA%\AsifScheduleAssistant`. On macOS/Linux, they are under `~/AsifScheduleAssistant`. You may override this with `ASIF_DATA_DIR`. Google tokens and the OAuth client are encrypted locally using AES-256-GCM with a key in the same protected user folder. Keep this folder private and back it up securely; deleting it removes account connections and records.

The Export button exports records, not tokens or session credentials. The Drive worksheet ID is stored locally so reconnects reuse the same spreadsheet.

## Tests

Run `npm test`. Tests use temporary folders and never send real emails or touch real Google APIs.

Live Google sign-in and real worksheet sync must be checked after connecting your account. They could not be exercised without that sign-in.
