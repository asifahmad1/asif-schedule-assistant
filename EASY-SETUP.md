# Easy Setup Guide — Asif Schedule Assistant (Windows)

No programming needed. Just follow the steps in order. It takes about 30–45 minutes, mostly because of the Google sign-in part (Step 5).

**What this app does:** keeps your meetings and tasks, sends you a Gmail reminder 30 minutes before each one, and automatically keeps a smart worksheet in your Google Drive up to date — every entry becomes a row, with a dashboard of live counts.

---

## Step 1 — Install Node.js (the engine the app runs on)

1. Open https://nodejs.org in your browser.
2. Download the **LTS** version for Windows (the big green button).
3. Open the downloaded file and click **Next** through everything. Accept all defaults.
4. Done. You will not need to open Node.js itself — the app uses it quietly in the background.

## Step 2 — Make sure Google Chrome is installed

1. If you already use Chrome, skip this.
2. Otherwise install it from https://www.google.com/chrome — click Download, open the file, follow the prompts.

## Step 3 — Unzip the app into a permanent home

1. Find the file **Asif-Schedule-Assistant.zip** (probably in Downloads).
2. Right-click it → **Extract All…** → choose a permanent place, for example `C:\Users\YourName\Asif-Schedule-Assistant`.
3. Open that folder. You should see files like `Start-Windows.cmd`, `server.mjs`, `EASY-SETUP.md`.

## Step 4 — Start the app (first run installs its parts)

1. Double-click **Start-Windows.cmd**.
2. A black window opens. The first time, it downloads the app's parts (needs internet — takes 2–5 minutes). Later starts are instant.
3. Your browser should open **http://127.0.0.1:4318** automatically. If not, type that address yourself.
4. You should see the Asif Schedule Assistant page, with **"Created by Dr. Asif Ahmad"** at the bottom.
5. **Keep that black window open** whenever you want reminders. You may minimize it, but don't close it.

## Step 5 — Connect your Google account (one-time, the longest step)

Sign in once with **asifahmad1@gmail.com**. Google makes you register the app yourself — follow carefully:

1. Go to https://console.cloud.google.com and sign in with **asifahmad1@gmail.com**.
2. At the top, click the project dropdown (it may say "Select a project") → **New Project** → name it `Asif Schedule Assistant` → **Create**. Wait ~30 seconds, then select it.
3. Left menu → **APIs & Services** → **Library**. Enable these four, one by one (search → click → **Enable**):
   - **Gmail API**
   - **Google Calendar API**
   - **Google Drive API**
   - **Google Sheets API**
4. Left menu → **APIs & Services** → **OAuth consent screen**:
   - Choose **External** → **Create**.
   - App name: `Asif Schedule Assistant`. User support email: your email. Developer contact: your email. → **Save and Continue**.
   - On the Scopes page, click **Add or Remove Scopes**, tick these five, then **Update**:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/drive.file`
     - `https://www.googleapis.com/auth/spreadsheets`
   - **Save and Continue**.
   - On Test users, click **Add Users** → add **asifahmad1@gmail.com** → **Save**.
5. Left menu → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Desktop app**. Name: `Asif Schedule Assistant`. → **Create**.
   - Click **Download JSON** and save the file somewhere you can find it.
6. Back in the assistant app → **Connections** → **Gmail & Google Calendar**:
   - Click **Upload** and choose the JSON file you just downloaded.
   - Click **Sign in with Google** → choose **asifahmad1@gmail.com** → tick the permission boxes → **Continue**.
   - The status should change to **Connected**. Click **Sync now**.

Notes:
- If Google warns the app is "unverified", that is expected for a personal app — click Advanced → Go to Asif Schedule Assistant.
- In test mode Google may ask you to sign in again after 7 days. Just repeat the "Sign in with Google" click.
- This is the only sign-in you ever do — after this, everything is automatic.

## Step 6 — Your Google Drive worksheet (automatic)

As soon as Google is connected, the app creates a worksheet named **Asif Schedule Assistant** in your Google Drive:

- **Schedule** tab — every entry as a row: title, type, date, start/end (Pakistan time), duration, location, status, reminder time, notes. Status cells are colour-coded (green = scheduled, red = cancelled, blue = completed). New, edited, cancelled or completed entries update their rows automatically within seconds.
- **Dashboard** tab — live counts: total entries, upcoming, due today, completed, cancelled, plus the last-sync time and your creator credit.

Open it any time from the app: **Connections** → **Google Drive worksheet** → **Open worksheet**. You can also open it directly from Google Drive / Google Sheets on any device.

## Step 7 — Try your first meeting

1. In the app, click **＋ New event**. Fill in title, date, Pakistan time, duration. Save.
2. Within seconds, a new row appears in your Drive worksheet.
3. For a quick reminder test, create an event starting **31 minutes from now**. About a minute later the 30-minute reminder should arrive by Gmail.

## Step 8 — Install the app on your Android phone (optional)

Your laptop runs the app; your phone opens it like any other app. Both must be on the **same Wi-Fi**.

1. On the laptop, double-click **Start-Phone-Access.cmd**. The black window prints a phone address like `http://192.168.1.5:4318`.
2. On your Android phone, open **Chrome** and type that exact address.
3. In Chrome, tap the **⋮ menu** (top right) → **Add to Home screen** → **Install**.
4. An app icon appears on your home screen. Open it — it runs full-screen, with your creator credit at the bottom.

Note: do the Google sign-in (Step 5) from the **laptop** browser, not the phone.

## Daily use

- **Keep the black window open** and the laptop awake and online — reminders and worksheet updates only work while it runs. The browser itself may be closed.
- For extra safety, click **Save to Google** on important meetings: Google Calendar then sends its own reminders even if this app is off.
- Your records are stored on your computer and survive restarts. The worksheet in Drive is your live backup.

## If something goes wrong

| Problem | Fix |
|---|---|
| Browser says "can't reach the page" | The black window was closed. Double-click Start-Windows.cmd again. |
| First start seems stuck | It's downloading parts — give it 5 minutes on first run. Needs internet. |
| Google says access expired | Connections → Sign in with Google again (normal every ~7 days in test mode). |
| Worksheet not updating | Connections → Google Drive worksheet → Sync worksheet now. Check the status badge for errors. |
| No reminder arrived | Check the app is running, laptop awake, and look at **Reminder History** for the delivery status. |
| Phone can't reach the page | Both on the same Wi-Fi? Allow Node.js through Windows Firewall if asked. |

## Stopping / uninstalling

- Close the black window to stop the app.
- In Connections you can Disconnect Google any time (the worksheet stays in your Drive).
- To remove everything, delete the app folder and the data folder at `%LOCALAPPDATA%\AsifScheduleAssistant`.

---

*Technical reference: see SETUP.md. This guide is the simple path for daily use.*
