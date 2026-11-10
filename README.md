# 100 Trades Journal — Phase 1 Mastery

A high-performance trading journal specifically engineered for traders tackling the **"First 100 Trades Challenge"** — focusing on discipline, rule adherence, and statistical edge rather than hasty profits.

Stores all 100 trades directly in **Google Drive** (via direct Google Drive API or Google Sheets Webhook), and deploys to **Netlify** with zero build configuration.

---

## 🚀 Features

- **Phase 1 Tracker (1 to 100 Trades)**:
  - Live progress bar & milestone roadmap (Trades 1-25 Calibration, 26-50 Neutrality, 51-75 Statistical Edge, 76-100 Graduation).
  - Auto-increments trade numbers from #1 to #100.
- **Statistical Expectancy Engine**:
  - Net Cumulative P&L ($ and %).
  - Win Rate %, Profit Factor, Realized Avg R:R, Expectancy ($/trade and R/trade).
  - Max Win Streak & Max Loss Streak.
  - Discipline Adherence Score (% of trades where execution followed your trading plan 100%).
- **Interactive Visualizations (Chart.js)**:
  - Real-time Equity Curve (Cumulative P&L in $ or R-Multiple).
  - Strategy Performance breakdown (Net PnL per setup).
  - Discipline vs Profitability comparison (Rules followed vs Rules broken).
  - Market & Direction distribution (Crypto, Forex, Stocks, Futures).
- **Google Drive Cloud Sync**:
  - **Method A (Google Drive OAuth)**: Automatically creates and syncs `Trading_Journal_100_Trades.json` and CSV directly in your Google Drive using the secure `drive.file` scope.
  - **Method B (Google Sheet Webhook)**: Logs every trade directly as a clean row into an actual Google Sheet on your Google Drive via Google Apps Script.
  - **Local-First Reliability**: Always saves to `localStorage` instantly. Nothing is ever lost if offline or disconnected.
  - **One-Click Exports**: Export CSV or JSON at any time.

---

## ⚡ How to Deploy to Netlify (Get Your Live URL)

### Option 1: Instant Drag & Drop (Takes 15 seconds, No command line)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Sign in to your Netlify account (free).
3. Drag and drop this entire `trading-journal` folder directly onto the drop zone.
4. Netlify will immediately publish your application and give you a live HTTPS URL (e.g., `https://my-100-trades.netlify.app`)!

### Option 2: Netlify CLI
Run in terminal:
```bash
npx netlify-cli deploy --prod
```
Follow the interactive prompts to link your site or create a new one.

### Option 3: Continuous Deployment via GitHub
1. Push this folder to a GitHub repository.
2. In Netlify Dashboard, click **Add new site** > **Import an existing project** > **GitHub**.
3. Select your repository. Netlify reads `netlify.toml` and deploys automatically on every push!

---

## ☁️ Setting Up Google Drive Storage

You have two simple methods to store your trades in Google Drive:

### Method 1: Direct Google Drive API (OAuth 2.0)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Trading Journal`).
3. Under **APIs & Services** > **Library**, search for **Google Drive API** and click **Enable**.
4. Under **OAuth consent screen**:
   - User Type: **External**
   - App Name: `100 Trades Journal`
   - Scopes: Add `https://www.googleapis.com/auth/drive.file` (access only files created by the app).
   - Test Users: Add your Google email address.
5. Under **Credentials** > **Create Credentials** > **OAuth client ID**:
   - Application Type: **Web application**.
   - **Authorized JavaScript origins**: Add `http://localhost:3000` (for local testing) and your Netlify URL: `https://<your-app>.netlify.app`.
6. Copy the **Client ID** (e.g. `123456789-xyz.apps.googleusercontent.com`).
7. In the Trading Journal app, go to **Google Drive Sync**, paste your Client ID, and click **Save** & **Connect Google Drive**!

---

### Method 2: Google Sheets Webhook (Zero OAuth Setup)
If you prefer viewing and editing your trades in an actual Google Sheet on your Drive:

1. Open [Google Drive](https://drive.google.com) and click **+ New** > **Google Sheets**.
2. Name it `100 Trades Journal`.
3. In the top menu, go to **Extensions** > **Apps Script**.
4. Delete any boilerplate code, open `google-apps-script.js` from this folder, and paste its full contents.
5. Click **Deploy** (top right) > **New deployment**.
   - Select type: **Web app**
   - Execute as: **Me** (your account)
   - Who has access: **Anyone**
6. Click **Deploy**, authorize access, and copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).
7. In the Trading Journal app, paste this URL into the **Google Sheet Webhook URL** field and click **Save**!
Every trade logged will now automatically sync to your Google Spreadsheet in Google Drive!

---

## 🧪 Local Testing

You can run the journal locally in your browser:
- Simply double-click `index.html` to open it in Chrome, Edge, or Firefox.
- Or start a local server:
  ```bash
  python -m http.server 8000
  ```
  Then open `http://localhost:8000` in your browser.
