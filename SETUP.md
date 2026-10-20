# Connect your accounts

**Your name as creator:** "Created by Dr. Asif Ahmad" appears in the footer on every page of the app, including the phone version.

## A. Open the app

Install Node.js 24 LTS and Google Chrome. Extract the ZIP. Run Start-Windows.cmd, then open http://127.0.0.1:4318.

Keep the app process running for reminders. You do not need to keep the browser open after setup.

## B. Connect Google (Gmail + Calendar + Drive worksheet)

Your Google account connected to ChatGPT cannot be reused automatically by this standalone app. Google always requires one consent click in the app — after the one-time setup below, everything is automatic.

1. Open https://console.cloud.google.com/ and create or select a project.
2. Under APIs & Services → Library, enable **Gmail API**, **Google Calendar API**, **Google Drive API** and **Google Sheets API**.
3. Open Google Auth Platform and configure the consent screen (app name: Asif Schedule Assistant).
4. Add these scopes: `gmail.readonly`, `gmail.send`, `calendar.events`, `drive.file`, `spreadsheets`.
5. If using an External app in Testing, add **asifahmad1@gmail.com** as a test user. If your institution permits an Internal app, that may suit a university account.
6. Create an OAuth client with application type **Desktop app** and download its JSON file. Do not use a service-account JSON.
7. In the runnable app → Connections, upload that JSON and click Sign in with Google.
8. Select **asifahmad1@gmail.com** and approve the displayed permissions. The app verifies that it matches Settings.
9. Wait for Connected, then click Sync now. Calendar events appear under My schedule; candidate email invitations appear in the Invitation inbox.

Google OAuth for an External project in Testing can issue refresh tokens that expire after seven days for these scopes. Reconnect if prompted, or configure the project's appropriate production/internal access. Never enter your Google password into this app.

Official Google guidance: https://developers.google.com/identity/protocols/oauth2/native-app

## C. Google Drive worksheet (automatic)

Once Google is connected, the app creates (or reuses) a spreadsheet named **Asif Schedule Assistant** in your Google Drive:

- **Schedule** tab: one row per entry — title, type, date, start/end (Pakistan time), duration, location, status, reminder time, notes, source, last updated. Header frozen with filters; status cells colour-coded.
- **Dashboard** tab: live `COUNTIFS`/`COUNTA` formulas — total entries, upcoming, due today, completed, cancelled — plus the last-sync timestamp and creator credit.

Every create, edit, cancel or complete triggers a worksheet update within seconds (debounced). A manual **Sync worksheet now** button lives in Connections. The worksheet ID is stored locally; disconnecting Google keeps the sheet in your Drive.

The app only touches the spreadsheet it created/found by name (`drive.file` scope limits it to app-created files plus the named lookup).

## D. First meeting and reminders

1. Click New event. Enter the title, date, Pakistan time, duration, location, and notes.
2. Save. The app records reminders for **30 minutes before** the start, and queues a worksheet row update.
3. If Google is connected, click Save to Google. This creates Google Calendar's own email and popup reminders as a backup.
4. In Settings, enable Gmail reminders.
5. Keep the app process running, the computer awake, and internet connected.
6. Check Reminder history for provider acceptance or unconfirmed delivery. Browser notifications need an open page and permission.

For a short live check, create a real event starting **31 minutes from now**. Its reminder should become due about one minute later. Only test after Google shows Connected. This setup does not send any test messages automatically.

## E. Phone access (Android)

Run **Start-Phone-Access.cmd** instead of Start-Windows.cmd. It prints the LAN address (e.g. `http://192.168.1.5:4318`). On the phone's Chrome (same Wi-Fi), open that address, then ⋮ → Add to Home screen → Install. Do the Google sign-in from the laptop browser. The server only accepts the machine's own loopback and LAN addresses — never expose it publicly or via port forwarding.

## F. Start automatically on Windows (optional)

Create a Task Scheduler task that runs `node.exe` with the full path to `server.mjs` as its argument, and the app folder as Start in. Run under your own Windows account at logon. Enable “Restart on failure.” This remains dependent on the computer being on and online. Disable sleep while using reminders.

Use `%LOCALAPPDATA%\AsifScheduleAssistant` to back up data. Keep the encryption key private.

## G. Disconnect

Use Disconnect in Connections. You can also revoke the app from your Google account's connected apps. The Drive worksheet remains yours.
