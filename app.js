/**
 * 100 Trades Journal — Phase 1 Mastery Application
 * Ultra-Streamlined Edition: Least Writing, Copy-Paste Screenshots, Robust Rule-Breaking & Psychology Review
 */

/**
 * TradeStorage — High Capacity IndexedDB Persistence Layer
 * Completely eliminates browser localStorage 5MB quota crashes and
 * ensures heavy chart screenshots & full backups persist permanently across refreshes.
 */
const TradeStorage = (function() {
  const DB_NAME = '100_trades_journal_db';
  const DB_VERSION = 1;
  const STORE_SCREENSHOTS = 'chart_screenshots';
  const STORE_BACKUPS = 'trades_backup';

  let dbPromise = null;

  function getDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
          console.warn('IndexedDB is not supported in this environment');
          return resolve(null);
        }
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_SCREENSHOTS)) {
              db.createObjectStore(STORE_SCREENSHOTS, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
              db.createObjectStore(STORE_BACKUPS, { keyPath: 'key' });
            }
          };
          req.onsuccess = function(e) {
            resolve(e.target.result);
          };
          req.onerror = function(e) {
            console.error('IndexedDB open error:', e);
            resolve(null);
          };
          req.onblocked = function() {
            console.warn('IndexedDB database open blocked');
            resolve(null);
          };
        } catch (err) {
          console.error('IndexedDB init exception:', err);
          resolve(null);
        }
      });
    }
    return dbPromise;
  }

  async function saveTradeCharts(tradeId, chartsList, tradeNum = null) {
    try {
      const cleanCharts = (Array.isArray(chartsList) ? chartsList : [])
        .filter(c => c && (c.screenshot || c.chartUrl))
        .map((c, idx) => ({
          id: c.id || `ch_${idx}`,
          label: c.label || `Chart ${idx + 1}`,
          screenshot: (c.screenshot && typeof c.screenshot === 'string' && c.screenshot.startsWith('data:')) ? c.screenshot : '',
          chartUrl: c.chartUrl || '',
          addedAt: c.addedAt || ''
        }));

      const primaryImg = (cleanCharts.find(c => c.screenshot) || {}).screenshot || '';
      if (!primaryImg && !cleanCharts.some(c => c.chartUrl)) {
        return deleteScreenshot(tradeId, tradeNum);
      }

      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(STORE_SCREENSHOTS, 'readwrite');
      const store = tx.objectStore(STORE_SCREENSHOTS);
      const now = Date.now();

      const buildRecord = (key, tNum) => ({
        key,
        tradeId: tradeId ? String(tradeId) : '',
        tradeNum: tNum ? parseInt(tNum, 10) : null,
        screenshot: primaryImg,
        charts: cleanCharts,
        updatedAt: now
      });

      if (tradeId) store.put(buildRecord(String(tradeId), tradeNum));
      if (tradeNum) store.put(buildRecord(`num_${tradeNum}`, tradeNum));
    } catch (err) {
      console.warn('TradeStorage saveTradeCharts error:', err);
    }
  }

  async function saveScreenshot(tradeId, screenshotBase64, tradeNum = null) {
    if (!screenshotBase64) return;
    return saveTradeCharts(tradeId, [{
      id: 'ch_0',
      label: 'Entry / Setup',
      screenshot: screenshotBase64,
      chartUrl: ''
    }], tradeNum);
  }

  async function getTradeCharts(tradeId, tradeNum = null) {
    try {
      const db = await getDB();
      if (!db) return null;

      const extractCharts = (rec) => {
        if (!rec) return null;
        if (Array.isArray(rec.charts) && rec.charts.length > 0) return rec.charts;
        if (rec.screenshot) {
          return [{ id: 'ch_0', label: 'Entry / Setup', screenshot: rec.screenshot, chartUrl: rec.chartUrl || '' }];
        }
        return null;
      };

      const readKey = (key) => new Promise((resolve) => {
        const tx = db.transaction(STORE_SCREENSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SCREENSHOTS);
        const req = store.get(key);
        req.onsuccess = () => resolve(extractCharts(req.result));
        req.onerror = () => resolve(null);
      });

      if (tradeId) {
        const byId = await readKey(String(tradeId));
        if (byId) return byId;
      }
      if (tradeNum) {
        return await readKey(`num_${tradeNum}`);
      }
      return null;
    } catch (err) {
      console.warn('TradeStorage getTradeCharts error:', err);
      return null;
    }
  }

  async function getScreenshot(tradeId, tradeNum = null) {
    const charts = await getTradeCharts(tradeId, tradeNum);
    if (!charts || !charts.length) return null;
    const withImg = charts.find(c => c && c.screenshot);
    return withImg ? withImg.screenshot : null;
  }

  async function deleteScreenshot(tradeId, tradeNum = null) {
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(STORE_SCREENSHOTS, 'readwrite');
      const store = tx.objectStore(STORE_SCREENSHOTS);
      if (tradeId) store.delete(String(tradeId));
      if (tradeNum) store.delete(`num_${tradeNum}`);
    } catch (err) {
      console.warn('TradeStorage deleteScreenshot error:', err);
    }
  }

  async function saveTradesBackup(tradesList) {
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(STORE_BACKUPS, 'readwrite');
      const store = tx.objectStore(STORE_BACKUPS);
      store.put({
        key: 'latest_trades',
        trades: tradesList,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('TradeStorage saveTradesBackup error:', err);
    }
  }

  async function getTradesBackup() {
    try {
      const db = await getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_BACKUPS, 'readonly');
        const store = tx.objectStore(STORE_BACKUPS);
        const req = store.get('latest_trades');
        req.onsuccess = () => resolve(req.result ? req.result.trades : null);
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.warn('TradeStorage getTradesBackup error:', err);
      return null;
    }
  }

  return {
    saveTradeCharts,
    getTradeCharts,
    saveScreenshot,
    getScreenshot,
    deleteScreenshot,
    saveTradesBackup,
    getTradesBackup
  };
})();

const TradeApp = (function() {
  const STORAGE_KEY_TRADES = '100_trades_journal_trades';
  const STORAGE_KEY_SETTINGS = '100_trades_journal_settings';
  const STORAGE_KEY_THEME = 'trading_journal_theme';
  const STORAGE_KEY_AUTH_HASH = 'tj_auth_passcode_hash';
  const STORAGE_KEY_AUTH_REMEMBER = 'tj_auth_remember_device';
  const STORAGE_KEY_AUTH_SESSION = 'tj_auth_unlocked_session';

  let trades = [];

  // Default to White (Light) Theme
  const THEME_MIGRATION_KEY = 'tj_theme_white_default_v1';
  if (!localStorage.getItem(THEME_MIGRATION_KEY)) {
    localStorage.setItem(STORAGE_KEY_THEME, 'light');
    localStorage.setItem(THEME_MIGRATION_KEY, 'true');
  }
  let currentTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'light';

  let settings = {
    initialBalance: 10000,
    maxRiskPct: 1.0,
    dailyLossLimit: 100,
    dailyTradeLimit: 3,
    updatedAt: 0,
  };
  let lastSettingsSaveAt = 0;

  const NAV_TABS = [
    { btn: 'nav-btn-trades', mobBtn: 'mobile-nav-btn-trades', view: 'view-trades' },
    { btn: 'nav-btn-analytics', mobBtn: 'mobile-nav-btn-analytics', view: 'view-analytics' },
    { btn: 'nav-btn-roadmap', mobBtn: 'mobile-nav-btn-roadmap', view: 'view-roadmap' },
    { btn: 'nav-btn-gdrive', mobBtn: 'mobile-nav-btn-gdrive', view: 'view-gdrive' },
  ];

  function switchTab(viewId) {
    sessionStorage.setItem('tj_active_view', viewId);
    NAV_TABS.forEach(t => {
      const desktopBtn = document.getElementById(t.btn);
      const mobBtn = document.getElementById(t.mobBtn);
      const viewEl = document.getElementById(t.view);

      if (t.view === viewId) {
        if (desktopBtn) {
          desktopBtn.className = 'nav-tab active px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all text-white bg-indigo-600 shadow-sm';
        }
        if (mobBtn) {
          mobBtn.className = 'mobile-nav-item active flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold text-indigo-600 transition';
        }
        if (viewEl) viewEl.classList.remove('hidden');
        if (t.view === 'view-analytics') {
          renderCharts();
          if (typeof GoogleDriveSync !== 'undefined' && GoogleDriveSync.syncIfStale) {
            GoogleDriveSync.syncIfStale(10000);
          }
        }
      } else {
        if (desktopBtn) {
          desktopBtn.className = 'nav-tab px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all text-slate-400 hover:text-white hover:bg-slate-800';
        }
        if (mobBtn) {
          mobBtn.className = 'mobile-nav-item flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium text-slate-400 hover:text-indigo-600 transition';
        }
        if (viewEl) viewEl.classList.add('hidden');
      }
    });
  }

  // Active filter state
  let currentFilter = {
    search: '',
    type: 'ALL', // 'ALL', 'EXECUTED', 'MISSED'
    outcome: 'ALL',
    plan: 'ALL'
  };

  // Form & Gallery state
  let currentCharts = [];
  let nextChartLabel = 'Entry / Setup';
  let lightboxState = { items: [], index: 0, baseCaption: '' };
  let activeMistakes = new Set();
  let chartMode = 'dollar'; // 'dollar' or 'r'

  /** Convert a Google Drive share URL to a direct loadable image URL. */
  function driveUrlToDirectImg(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? `https://lh3.googleusercontent.com/d/${match[1]}` : url;
  }

  /** Return the best display image src for a chart entry (local base64 first, then Drive). */
  function getChartDisplaySrc(chart) {
    if (!chart) return '';
    if (chart.screenshot && typeof chart.screenshot === 'string' && chart.screenshot.startsWith('data:')) {
      return chart.screenshot;
    }
    if (chart.chartUrl) {
      return driveUrlToDirectImg(chart.chartUrl);
    }
    return chart.screenshot || '';
  }

  /** Normalize single-chart and legacy chart fields into a canonical charts array. */
  function normalizeTradeCharts(trade) {
    if (!trade) return [];
    if (Array.isArray(trade.charts)) {
      return trade.charts
        .filter(c => c && (c.screenshot || c.chartUrl || c.id || c.label))
        .map((c, idx) => ({
          id: c.id || `ch_${idx}`,
          label: (c.label || (idx === 0 ? 'Entry / Setup' : `After / Chart ${idx + 1}`)).trim(),
          screenshot: typeof c.screenshot === 'string' ? c.screenshot : '',
          chartUrl: typeof c.chartUrl === 'string' ? c.chartUrl : '',
          addedAt: c.addedAt || trade.date || ''
        }));
    }

    if (Array.isArray(trade.chartUrls) && trade.chartUrls.length > 0) {
      return trade.chartUrls
        .filter(Boolean)
        .map((url, idx) => ({
          id: `ch_${idx}`,
          label: idx === 0 ? 'Entry / Setup' : `After / Chart ${idx + 1}`,
          screenshot: idx === 0 ? (trade.screenshot || '') : '',
          chartUrl: url,
          addedAt: trade.date || ''
        }));
    }

    if (trade.screenshot || trade.chartUrl) {
      return [{
        id: 'ch_0',
        label: 'Entry / Setup',
        screenshot: trade.screenshot || '',
        chartUrl: trade.chartUrl || '',
        addedAt: trade.date || ''
      }];
    }

    return [];
  }

  /** Keep legacy single-chart fields synchronized with trade.charts. */
  function syncLegacyChartFields(trade) {
    if (!trade) return trade;
    const hasExplicitArr = Array.isArray(trade.charts);
    const normalized = normalizeTradeCharts(trade);
    trade.charts = normalized;
    trade.screenshot = (normalized.find(c => c.screenshot && c.screenshot.startsWith('data:')) || normalized[0] || {}).screenshot || '';
    trade.chartUrl = (normalized.find(c => c.chartUrl) || {}).chartUrl || '';
    trade.chartUrls = normalized.map(c => c.chartUrl).filter(Boolean);
    trade.hasScreenshot = normalized.length > 0 || (!hasExplicitArr && Boolean(trade.hasScreenshot));
    return trade;
  }

  // Chart instances
  let equityChart = null;
  let strategyChart = null;
  let disciplineChart = null;
  let marketChart = null;
  let dailyLossChart = null;
  let dailyTradesChart = null;

  // Initialize
  async function init() {
    initTheme();
    initAuth();
    loadSettings();
    await loadTrades();
    bindEvents();
    bindPasteAndUpload();
    GoogleDriveSync.init();
    updateLimitsSyncBadge();
    renderAll();

    // Restore active tab
    const savedTab = sessionStorage.getItem('tj_active_view') || 'view-trades';
    switchTab(savedTab);

    // Auto-sync with Google Sheet on startup if configured
    if (GoogleDriveSync.hasWebhook() || GoogleDriveSync.isAuthenticated()) {
      GoogleDriveSync.smartSync({ notify: false, silentIfEmpty: true });
    }
  }

  // Password & Authentication Gate Engine
  async function hashPasscode(pass) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pass + '_salt_100trades_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function initAuth() {
    const savedHash = localStorage.getItem(STORAGE_KEY_AUTH_HASH);
    const remembered = localStorage.getItem(STORAGE_KEY_AUTH_REMEMBER) === 'true';
    const sessionUnlocked = sessionStorage.getItem(STORAGE_KEY_AUTH_SESSION) === 'true';

    const loginGate = document.getElementById('login-gate');
    const loginTitle = document.getElementById('login-title');
    const loginSubtitle = document.getElementById('login-subtitle');
    const submitBtn = document.getElementById('btn-submit-unlock');

    if (!savedHash) {
      // First time setup mode
      loginTitle.textContent = 'Set Master Passcode';
      loginSubtitle.textContent = 'Create a PIN or password to secure your trading journal';
      submitBtn.textContent = 'Set Passcode & Enter';
      loginGate.classList.remove('hidden');
      setTimeout(() => document.getElementById('input-login-passcode')?.focus(), 100);
    } else if (remembered || sessionUnlocked) {
      // Already unlocked
      loginGate.classList.add('hidden');
    } else {
      // Locked state
      loginTitle.textContent = 'Trade Terminal Locked';
      loginSubtitle.textContent = 'Enter your master passcode to access your journal';
      submitBtn.textContent = 'Unlock Journal';
      loginGate.classList.remove('hidden');
      setTimeout(() => document.getElementById('input-login-passcode')?.focus(), 100);
    }
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('input-login-passcode');
    const entered = input.value.trim();
    if (!entered) return;

    const savedHash = localStorage.getItem(STORAGE_KEY_AUTH_HASH);
    const rememberDevice = document.getElementById('check-remember-device').checked;
    const errorMsg = document.getElementById('login-error-msg');
    const loginCard = document.getElementById('login-card');
    const loginGate = document.getElementById('login-gate');

    const enteredHash = await hashPasscode(entered);

    if (!savedHash) {
      // Setting passcode for first time
      localStorage.setItem(STORAGE_KEY_AUTH_HASH, enteredHash);
      if (rememberDevice) {
        localStorage.setItem(STORAGE_KEY_AUTH_REMEMBER, 'true');
      }
      sessionStorage.setItem(STORAGE_KEY_AUTH_SESSION, 'true');
      loginGate.classList.add('hidden');
      GoogleDriveSync.showToast('Master Passcode created! Journal secured.', 'success');
      input.value = '';
    } else if (enteredHash === savedHash) {
      // Correct passcode
      errorMsg.classList.add('hidden');
      if (rememberDevice) {
        localStorage.setItem(STORAGE_KEY_AUTH_REMEMBER, 'true');
      }
      sessionStorage.setItem(STORAGE_KEY_AUTH_SESSION, 'true');
      loginGate.classList.add('hidden');
      GoogleDriveSync.showToast('Welcome back! Journal unlocked.', 'success');
      input.value = '';
    } else {
      // Wrong passcode
      errorMsg.classList.remove('hidden');
      loginCard.classList.add('shake-error');
      setTimeout(() => loginCard.classList.remove('shake-error'), 400);
      input.select();
    }
  }

  function lockJournal() {
    sessionStorage.removeItem(STORAGE_KEY_AUTH_SESSION);
    localStorage.removeItem(STORAGE_KEY_AUTH_REMEMBER);
    initAuth();
    GoogleDriveSync.showToast('Journal locked.', 'info');
  }

  async function updatePasscode(newPin) {
    if (!newPin || newPin.trim().length < 2) {
      GoogleDriveSync.showToast('Passcode must be at least 2 characters.', 'error');
      return;
    }
    const hash = await hashPasscode(newPin.trim());
    localStorage.setItem(STORAGE_KEY_AUTH_HASH, hash);
    GoogleDriveSync.showToast('Master Passcode updated successfully!', 'success');
    document.getElementById('setting-new-passcode').value = '';
  }

  function resetPasscode() {
    if (confirm('Reset Master Passcode? You will be prompted to create a new one.')) {
      localStorage.removeItem(STORAGE_KEY_AUTH_HASH);
      localStorage.removeItem(STORAGE_KEY_AUTH_REMEMBER);
      sessionStorage.removeItem(STORAGE_KEY_AUTH_SESSION);
      initAuth();
      GoogleDriveSync.showToast('Passcode reset. Please set a new passcode.', 'info');
    }
  }

  // Theme Management (Dark & White / Light theme)
  function initTheme() {
    applyTheme(currentTheme, false);
  }

  function applyTheme(theme, notify = true) {
    currentTheme = theme;
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(STORAGE_KEY_THEME, theme);

    // Update icons & label
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    const label = document.getElementById('theme-label');

    if (sunIcon && moonIcon) {
      if (isDark) {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
        if (label) label.textContent = 'Light Mode';
      } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
        if (label) label.textContent = 'Dark Mode';
      }
    }

    if (notify) {
      GoogleDriveSync.showToast(`Switched to ${isDark ? 'Dark' : 'White'} theme!`, 'info');
    }

    // Re-render charts with matching colors
    renderCharts();
    lucide.createIcons();
  }

  function toggleTheme() {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, true);
  }

  function parseNonNegLimit(rawVal, fallback) {
    const parsed = parseFloat(rawVal);
    return (!isNaN(parsed) && parsed >= 0) ? parsed : fallback;
  }

  function syncLimitInputs() {
    const lossVal = parseNonNegLimit(settings.dailyLossLimit, 100);
    const tradeVal = Math.floor(parseNonNegLimit(settings.dailyTradeLimit, 3));
    const balVal = parseFloat(settings.initialBalance);
    const balClean = (!isNaN(balVal) && balVal > 0) ? balVal : 10000;
    const balanceInput = document.getElementById('setting-initial-balance');
    if (balanceInput) balanceInput.value = balClean;

    ['setting-daily-loss-limit', 'analytics-daily-loss-limit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = lossVal;
    });
    ['setting-daily-trade-limit', 'analytics-daily-trade-limit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = tradeVal;
    });
  }

  function settingsValuesDiffer(a, b) {
    return (
      parseFloat(a?.initialBalance) !== parseFloat(b?.initialBalance) ||
      parseNonNegLimit(a?.dailyLossLimit, 100) !== parseNonNegLimit(b?.dailyLossLimit, 100) ||
      Math.floor(parseNonNegLimit(a?.dailyTradeLimit, 3)) !== Math.floor(parseNonNegLimit(b?.dailyTradeLimit, 3))
    );
  }

  function updateLimitsSyncBadge() {
    const badgeEl = document.getElementById('daily-limits-sync-status');
    const updateBtn = document.getElementById('btn-limits-update-script');
    if (!badgeEl && !updateBtn) return;

    const hasCloud = typeof GoogleDriveSync !== 'undefined' && (GoogleDriveSync.hasWebhook() || GoogleDriveSync.isAuthenticated());
    const supported = typeof GoogleDriveSync !== 'undefined' && GoogleDriveSync.isSettingsSyncSupported ? GoogleDriveSync.isSettingsSyncSupported() : null;

    if (!hasCloud) {
      if (badgeEl) {
        badgeEl.textContent = 'Local Browser Only';
        badgeEl.className = 'inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-400';
      }
      if (updateBtn) updateBtn.classList.add('hidden');
      return;
    }

    if (GoogleDriveSync.hasWebhook() && supported === false) {
      if (badgeEl) badgeEl.classList.add('hidden');
      if (updateBtn) updateBtn.classList.remove('hidden');
      return;
    }

    if (updateBtn) updateBtn.classList.add('hidden');
    if (badgeEl) {
      const hasRemote = GoogleDriveSync.hasRemoteSettings ? GoogleDriveSync.hasRemoteSettings() : false;
      if (supported === true) {
        badgeEl.textContent = hasRemote ? 'Synced Across Browsers' : 'Ready — Click Save Limits';
        badgeEl.className = hasRemote
          ? 'inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500'
          : 'inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400';
      } else {
        badgeEl.textContent = 'Cloud Sync Ready';
        badgeEl.className = 'inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500';
      }
    }
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        const hadTimestamp = parsed && parsed.updatedAt !== undefined && parsed.updatedAt !== null;
        settings = Object.assign(settings, parsed);
        if (!hadTimestamp) {
          const differsFromDefaults =
            Number(settings.initialBalance) !== 10000 ||
            Number(settings.maxRiskPct) !== 1.0 ||
            Number(settings.dailyLossLimit) !== 100 ||
            Number(settings.dailyTradeLimit) !== 3;
          settings.updatedAt = differsFromDefaults ? Date.now() : 0;
          if (differsFromDefaults) {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
          }
        } else {
          settings.updatedAt = Number(settings.updatedAt) || 0;
        }
      }
      syncLimitInputs();
    } catch (e) {
      console.warn('Could not load settings:', e);
    }
  }

  function applyRemoteSettings(remoteRaw, { notify = true } = {}) {
    if (!remoteRaw || typeof remoteRaw !== 'object') return false;
    const balParsed = parseFloat(remoteRaw.initialBalance);
    const riskParsed = parseFloat(remoteRaw.maxRiskPct);
    const next = {
      initialBalance: (!isNaN(balParsed) && balParsed > 0) ? balParsed : (settings.initialBalance || 10000),
      maxRiskPct: (!isNaN(riskParsed) && riskParsed >= 0) ? riskParsed : (settings.maxRiskPct ?? 1.0),
      dailyLossLimit: parseNonNegLimit(remoteRaw.dailyLossLimit, settings.dailyLossLimit ?? 100),
      dailyTradeLimit: Math.floor(parseNonNegLimit(remoteRaw.dailyTradeLimit, settings.dailyTradeLimit ?? 3)),
      updatedAt: Number(remoteRaw.updatedAt) || settings.updatedAt || 0,
    };

    const changed = settingsValuesDiffer(settings, next);
    const newerTimestamp = next.updatedAt > (Number(settings.updatedAt) || 0);
    if (!changed && !newerTimestamp) return false;

    settings = Object.assign(settings, next);
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    syncLimitInputs();

    if (changed) {
      renderKPIs();
      renderCharts();
      updateModalDailyLimitWarning();
      if (notify && typeof GoogleDriveSync !== 'undefined' && GoogleDriveSync.showToast) {
        GoogleDriveSync.showToast(
          `Synced limits from Google Sheet ($${settings.dailyLossLimit} max loss, ${settings.dailyTradeLimit}/day)`,
          'info'
        );
      }
    }
    return changed;
  }

  function saveSettings(source = 'settings', opts = {}) {
    const balanceInput = document.getElementById('setting-initial-balance');
    const balParsed = (source === 'settings' && balanceInput) ? parseFloat(balanceInput.value) : settings.initialBalance;
    const nextBalance = (!isNaN(balParsed) && balParsed > 0) ? balParsed : 10000;

    const lossEl = document.getElementById(source === 'analytics' ? 'analytics-daily-loss-limit' : 'setting-daily-loss-limit');
    const tradeEl = document.getElementById(source === 'analytics' ? 'analytics-daily-trade-limit' : 'setting-daily-trade-limit');
    const nextLoss = lossEl ? parseNonNegLimit(lossEl.value, settings.dailyLossLimit ?? 100) : parseNonNegLimit(settings.dailyLossLimit, 100);
    const nextTrade = tradeEl ? Math.floor(parseNonNegLimit(tradeEl.value, settings.dailyTradeLimit ?? 3)) : Math.floor(parseNonNegLimit(settings.dailyTradeLimit, 3));

    const candidate = {
      initialBalance: nextBalance,
      dailyLossLimit: nextLoss,
      dailyTradeLimit: nextTrade,
    };
    const changed = settingsValuesDiffer(settings, candidate);

    if (opts.onlyIfChanged && !changed) return;
    if (!changed && (Date.now() - lastSettingsSaveAt < 350) && (Number(settings.updatedAt) || 0) > 0) {
      return;
    }

    lastSettingsSaveAt = Date.now();
    settings.initialBalance = nextBalance;
    settings.dailyLossLimit = nextLoss;
    settings.dailyTradeLimit = nextTrade;
    settings.updatedAt = Date.now();

    syncLimitInputs();
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    renderKPIs();
    renderCharts();
    updateModalDailyLimitWarning();

    const hasCloud = typeof GoogleDriveSync !== 'undefined' && (GoogleDriveSync.hasWebhook() || GoogleDriveSync.isAuthenticated());
    if (hasCloud && GoogleDriveSync.syncSettings) {
      GoogleDriveSync.syncSettings(Object.assign({}, settings), { notify: opts.notify !== false });
    } else if (opts.notify !== false && typeof GoogleDriveSync !== 'undefined') {
      GoogleDriveSync.showToast('Settings & daily limits saved locally', 'success');
    }
  }

  async function loadTrades() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRADES);
      if (saved) {
        trades = JSON.parse(saved);
      } else if (typeof TradeStorage !== 'undefined') {
        const backup = await TradeStorage.getTradesBackup();
        trades = Array.isArray(backup) ? backup : [];
      } else {
        trades = [];
      }
    } catch (e) {
      console.warn('Could not load trades from localStorage:', e);
      if (typeof TradeStorage !== 'undefined') {
        const backup = await TradeStorage.getTradesBackup();
        trades = Array.isArray(backup) ? backup : [];
      } else {
        trades = [];
      }
    }

    hydrateScreenshots();
  }

  async function hydrateTradeChartsFromStorage(trade, tradeId = null, tradeNum = null) {
    if (typeof TradeStorage === 'undefined') {
      return trade ? syncLegacyChartFields(trade).charts : [];
    }
    const id = trade ? trade.id : tradeId;
    const num = trade ? trade.tradeNum : tradeNum;
    const storedCharts = await TradeStorage.getTradeCharts(id, num);
    if (!storedCharts || !storedCharts.length) {
      return trade ? syncLegacyChartFields(trade).charts : [];
    }
    if (!trade) return storedCharts;

    const existingCharts = normalizeTradeCharts(trade);
    if (existingCharts.length === 0) {
      trade.charts = storedCharts;
    } else {
      storedCharts.forEach((sc, idx) => {
        if (!sc.screenshot) return;
        const match = existingCharts.find(ec => ec.id === sc.id) || existingCharts[idx];
        if (match && !match.screenshot) {
          match.screenshot = sc.screenshot;
        } else if (!match) {
          existingCharts.push(sc);
        }
      });
      trade.charts = existingCharts;
    }
    syncLegacyChartFields(trade);
    return trade.charts;
  }

  async function hydrateScreenshots() {
    if (typeof TradeStorage === 'undefined') return;
    let anyHydrated = false;
    for (const t of trades) {
      const chartsBefore = normalizeTradeCharts(t);
      const missingLocalImg = chartsBefore.length === 0 || chartsBefore.some(c => !c.screenshot);
      if (missingLocalImg) {
        const beforeDataCount = chartsBefore.filter(c => c.screenshot && c.screenshot.startsWith('data:')).length;
        const hydrated = await hydrateTradeChartsFromStorage(t);
        const afterDataCount = hydrated.filter(c => c.screenshot && c.screenshot.startsWith('data:')).length;
        if (afterDataCount > beforeDataCount || hydrated.length > chartsBefore.length) {
          anyHydrated = true;
        }
      } else {
        syncLegacyChartFields(t);
      }
    }
    if (anyHydrated) {
      renderTable();
    }
  }

  // Sort trades newest/last trade on top (descending by tradeNum, then date)
  function sortTradesNewestFirst(list) {
    return list.sort((a, b) => {
      const numDiff = (parseInt(b.tradeNum, 10) || 0) - (parseInt(a.tradeNum, 10) || 0);
      if (numDiff !== 0) return numDiff;
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
  }

  function saveTrades(triggerSync = true) {
    sortTradesNewestFirst(trades);

    // 1. Always save a complete backup in high-capacity IndexedDB
    if (typeof TradeStorage !== 'undefined') {
      TradeStorage.saveTradesBackup(trades);
    }

    // 2. Save to localStorage safely (with quota overflow fallback)
    try {
      localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(trades));
    } catch (quotaErr) {
      console.warn('localStorage quota exceeded. Storing lightweight metadata (screenshots preserved in IndexedDB):', quotaErr);
      try {
        const lightweightTrades = trades.map(t => {
          const c = Object.assign({}, t);
          if (c.screenshot) {
            c.hasScreenshot = true;
            delete c.screenshot;
          }
          if (Array.isArray(c.charts)) {
            c.charts = c.charts.map(ch => {
              const stripped = Object.assign({}, ch);
              if (stripped.screenshot) delete stripped.screenshot;
              return stripped;
            });
            if (c.charts.length > 0) c.hasScreenshot = true;
          }
          return c;
        });
        localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(lightweightTrades));
      } catch (innerErr) {
        console.error('Critical: unable to store even lightweight trades in localStorage:', innerErr);
      }
    }

    renderAll();

    if (triggerSync) {
      GoogleDriveSync.syncToDrive(trades);
    }
  }

  // Robust Statistical Metrics Calculation
  function calculateStats(tradeList = trades) {
    const executedTrades = tradeList.filter(t => !t.isMissed);
    const missedTrades = tradeList.filter(t => t.isMissed);

    const closed = executedTrades.filter(t => t.outcome !== 'OPEN');
    const wins = closed.filter(t => t.outcome === 'WIN');
    const losses = closed.filter(t => t.outcome === 'LOSS');
    const bes = closed.filter(t => t.outcome === 'BE');

    const totalTradesCount = executedTrades.length;
    const closedCount = closed.length;
    const winCount = wins.length;
    const lossCount = losses.length;
    const beCount = bes.length;

    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;

    let netPnL = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let totalRealizedR = 0;

    // Rule breaking tracking
    let costOfBrokenRules = 0;
    const mistakeCounts = {};

    closed.forEach(t => {
      const pnl = parseFloat(t.realizedPnL) || 0;
      netPnL += pnl;
      if (pnl > 0) grossWins += pnl;
      if (pnl < 0) grossLosses += Math.abs(pnl);

      const r = parseFloat(t.realizedR) || 0;
      totalRealizedR += r;

      // Check rule breaking cost
      const brokeRules = t.planFollowed === false || t.planFollowed === 'false';
      if (brokeRules && pnl < 0) {
        costOfBrokenRules += Math.abs(pnl);
      }

      // Count mistakes
      if (Array.isArray(t.mistakes)) {
        t.mistakes.forEach(m => {
          mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
        });
      }
    });

    const profitFactor = grossLosses > 0 ? (grossWins / grossLosses) : (grossWins > 0 ? 99.0 : 0);
    const avgWin = winCount > 0 ? grossWins / winCount : 0;
    const avgLoss = lossCount > 0 ? grossLosses / lossCount : 0;

    // Discipline adherence
    const followedCount = executedTrades.filter(t => t.planFollowed === true || t.planFollowed === 'true').length;
    const disciplineScore = totalTradesCount > 0 ? (followedCount / totalTradesCount) * 100 : 100;

    // Top Mistake
    let topMistake = 'None';
    let maxMistakeCount = 0;
    Object.keys(mistakeCounts).forEach(m => {
      if (mistakeCounts[m] > maxMistakeCount) {
        maxMistakeCount = mistakeCounts[m];
        topMistake = m;
      }
    });

    // Missed Trades stats
    const missedTradesCount = missedTrades.length;
    let missedTradesPotentialPnL = 0;
    missedTrades.forEach(m => {
      missedTradesPotentialPnL += parseFloat(m.missedPnL) || 0;
    });

    const netReturnPct = settings.initialBalance > 0 ? (netPnL / settings.initialBalance) * 100 : 0;

    return {
      totalTradesCount,
      closedCount,
      winCount,
      lossCount,
      beCount,
      winRate,
      netPnL,
      netReturnPct,
      grossWins,
      grossLosses,
      profitFactor,
      avgWin,
      avgLoss,
      totalRealizedR,
      followedCount,
      disciplineScore,
      costOfBrokenRules,
      topMistake,
      missedTradesCount,
      missedTradesPotentialPnL
    };
  }

  // Render Top KPI Cards and 100-Trade Progress Bar
  function renderKPIs() {
    const stats = calculateStats();
    const count = stats.totalTradesCount;
    const pct = Math.min(100, Math.round((count / 100) * 100));

    // Milestone text
    document.getElementById('banner-progress-text').textContent = `${count} / 100 (${pct}%)`;
    document.getElementById('banner-progress-bar').style.width = `${pct}%`;

    // Card 1: 100 Trades Goal
    document.getElementById('kpi-trade-count').textContent = count;
    document.getElementById('kpi-trades-remaining').textContent = `${Math.max(0, 100 - count)} remaining`;
    document.getElementById('kpi-pct-complete').textContent = `${pct}%`;
    document.getElementById('kpi-progress-bar').style.width = `${pct}%`;

    // Card 2: Net PnL
    const netPnLEl = document.getElementById('kpi-net-pnl');
    const returnEl = document.getElementById('kpi-net-return');
    const formattedPnL = formatSignedCurrency(stats.netPnL, { zeroText: '+$0.00' });
    netPnLEl.textContent = formattedPnL;
    netPnLEl.className = `text-2xl font-black ${stats.netPnL > 0 ? 'text-tradeGreen' : stats.netPnL < 0 ? 'text-tradeRed' : 'text-slate-200'}`;

    const formattedReturn = (stats.netReturnPct >= 0 ? '+' : '') + stats.netReturnPct.toFixed(2) + '%';
    returnEl.textContent = formattedReturn;
    returnEl.className = `font-semibold ${stats.netReturnPct > 0 ? 'text-tradeGreen' : stats.netReturnPct < 0 ? 'text-tradeRed' : 'text-slate-400'}`;

    // Card 3: Win Rate / PF
    document.getElementById('kpi-win-rate').textContent = `${Math.round(stats.winRate)}%`;
    document.getElementById('kpi-profit-factor').textContent = `PF: ${stats.profitFactor > 50 ? '99+' : stats.profitFactor.toFixed(2)}`;
    document.getElementById('kpi-win-count').textContent = stats.winCount;
    document.getElementById('kpi-loss-count').textContent = stats.lossCount;
    document.getElementById('kpi-be-count').textContent = stats.beCount;

    // Card 4: Discipline Score
    const discEl = document.getElementById('kpi-discipline-score');
    discEl.textContent = `${Math.round(stats.disciplineScore)}%`;
    discEl.className = `text-2xl font-black ${stats.disciplineScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}`;
    document.getElementById('kpi-discipline-count').textContent = `${stats.followedCount} / ${stats.totalTradesCount}`;

    // Card 5: Cost of Broken Rules (Highlighting rule breaking leak!)
    const costBrokenEl = document.getElementById('kpi-cost-broken');
    costBrokenEl.textContent = formatSignedCurrency(stats.costOfBrokenRules, { forceNegative: true, zeroText: '$0.00' });
    costBrokenEl.className = `text-2xl font-black ${stats.costOfBrokenRules > 0 ? 'text-rose-400' : 'text-slate-400'}`;
    
    const topMistakeEl = document.getElementById('kpi-top-mistake');
    topMistakeEl.textContent = stats.topMistake;
    topMistakeEl.title = stats.topMistake;

    // Card 6: Missed Trades
    document.getElementById('kpi-missed-count').textContent = stats.missedTradesCount;
    document.getElementById('kpi-missed-pnl').textContent = formatSignedCurrency(stats.missedTradesPotentialPnL, { zeroText: '+$0.00' });

    // Roadmap milestone badges
    updateMilestoneBadges(count);
  }

  function updateMilestoneBadges(count) {
    const m1 = document.getElementById('badge-m1');
    const m2 = document.getElementById('badge-m2');
    const m3 = document.getElementById('badge-m3');
    const m4 = document.getElementById('badge-m4');

    if (m1) {
      m1.textContent = count >= 25 ? '✅ Completed' : `⏳ ${count}/25 Trades`;
      m1.className = count >= 25 ? 'text-emerald-400 font-bold' : 'text-indigo-400 font-semibold';
    }
    if (m2) {
      m2.textContent = count >= 50 ? '✅ Completed' : count >= 25 ? `⏳ ${count}/50 Trades` : '🔒 Locked';
      m2.className = count >= 50 ? 'text-emerald-400 font-bold' : count >= 25 ? 'text-indigo-400 font-semibold' : 'text-slate-500 font-semibold';
    }
    if (m3) {
      m3.textContent = count >= 75 ? '✅ Completed' : count >= 50 ? `⏳ ${count}/75 Trades` : '🔒 Locked';
      m3.className = count >= 75 ? 'text-emerald-400 font-bold' : count >= 50 ? 'text-indigo-400 font-semibold' : 'text-slate-500 font-semibold';
    }
    if (m4) {
      m4.textContent = count >= 100 ? '🎉 Phase 1 Master!' : count >= 75 ? `⏳ ${count}/100 Trades` : '🔒 Locked';
      m4.className = count >= 100 ? 'text-emerald-400 font-bold' : count >= 75 ? 'text-indigo-400 font-semibold' : 'text-slate-500 font-semibold';
    }
  }

  // Render Trades Table
  function renderTable() {
    const tbody = document.getElementById('trades-table-body');
    const emptyState = document.getElementById('empty-state');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Filter trades
    const filtered = trades.filter(t => {
      if (currentFilter.search) {
        const query = currentFilter.search.toLowerCase();
        const matchesSearch =
          (t.symbol && t.symbol.toLowerCase().includes(query)) ||
          (t.strategy && t.strategy.toLowerCase().includes(query)) ||
          (t.notes && t.notes.toLowerCase().includes(query)) ||
          (t.emotion && t.emotion.toLowerCase().includes(query)) ||
          (Array.isArray(t.mistakes) && t.mistakes.some(m => m.toLowerCase().includes(query)));
        if (!matchesSearch) return false;
      }
      if (currentFilter.type === 'EXECUTED' && t.isMissed) return false;
      if (currentFilter.type === 'MISSED' && !t.isMissed) return false;
      if (currentFilter.outcome !== 'ALL' && t.outcome !== currentFilter.outcome) return false;
      if (currentFilter.plan !== 'ALL') {
        const isYes = t.planFollowed === true || t.planFollowed === 'true';
        if (currentFilter.plan === 'YES' && !isYes) return false;
        if (currentFilter.plan === 'NO' && isYes) return false;
      }
      return true;
    });

    // Always show newest / last trade at the top of the table
    sortTradesNewestFirst(filtered);

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    } else {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }

    filtered.forEach(t => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-borderSubtle hover:bg-slate-800/40 cursor-pointer transition';

      const isLong = (t.direction || 'LONG').toUpperCase() === 'LONG';
      const isMissed = !!t.isMissed;
      const outcome = t.outcome || (isMissed ? 'MISSED' : 'OPEN');

      let outcomeBadgeClass = 'badge-outcome-open';
      if (outcome === 'WIN') outcomeBadgeClass = 'badge-outcome-win';
      else if (outcome === 'LOSS') outcomeBadgeClass = 'badge-outcome-loss';
      else if (outcome === 'BE') outcomeBadgeClass = 'badge-outcome-be';
      else if (isMissed) outcomeBadgeClass = 'badge-outcome-missed';

      const pnlNum = parseFloat(isMissed ? t.missedPnL : t.realizedPnL) || 0;
      const formattedPnL = (pnlNum >= 0 ? '+$' : '-$') + Math.abs(pnlNum).toFixed(2);
      const pnlColorClass = pnlNum > 0 ? 'text-tradeGreen font-bold' : pnlNum < 0 ? 'text-tradeRed font-bold' : 'text-slate-400';

      const rNum = parseFloat(isMissed ? t.missedR : t.realizedR) || 0;
      const formattedR = (rNum >= 0 ? '+' : '') + rNum.toFixed(1) + 'R';

      const isFollowed = t.planFollowed === true || t.planFollowed === 'true';

      const dateStr = t.date ? new Date(t.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

      // Mistakes / Psychology formatting
      let reviewInfo = '';
      if (isMissed) {
        reviewInfo = `<span class="text-amber-400 font-medium">Missed: ${t.missedReason || 'Hesitation'}</span>`;
      } else if (!isFollowed && Array.isArray(t.mistakes) && t.mistakes.length) {
        reviewInfo = `<span class="text-rose-400 font-semibold">⚠️ ${t.mistakes[0]}</span>`;
      } else {
        reviewInfo = `<span class="text-purple-300 font-medium">${t.emotion || 'Calm'}</span>`;
      }

      tr.innerHTML = `
        <td class="py-3 px-4 text-center font-bold text-slate-300">
          <span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 border border-slate-700 text-slate-300 text-[11px]">
            ${t.tradeNum || '-'}
          </span>
        </td>
        <td class="py-3 px-3 text-slate-400 whitespace-nowrap">${dateStr}</td>
        <td class="py-3 px-3">
          <div class="font-bold text-white">${t.symbol || 'N/A'}</div>
        </td>
        <td class="py-3 px-3">
          <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${isMissed ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}">
            ${isMissed ? '👁️ Missed' : '⚡ Executed'}
          </span>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isLong ? 'badge-long' : 'badge-short'}">
            ${isLong ? 'BUY' : 'SELL'}
          </span>
        </td>
        <td class="py-3 px-3 text-right font-mono ${pnlColorClass}">
          <div>${isMissed ? `(${formattedPnL})` : formattedPnL}</div>
        </td>
        <td class="py-3 px-3 text-right font-mono text-slate-300 font-semibold">
          ${formattedR}
        </td>
        <td class="py-3 px-3 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${outcomeBadgeClass}">
            ${isMissed ? 'MISSED' : outcome}
          </span>
        </td>
        <td class="py-3 px-3 text-slate-300 truncate max-w-[120px]" title="${t.strategy || ''}">${t.strategy || '-'}</td>
        <td class="py-3 px-3 text-center">
          ${isMissed ? '<span class="text-slate-500">-</span>' : isFollowed ? '<span class="text-emerald-400 font-bold" title="100% Disciplined">✓</span>' : '<span class="text-rose-400 font-bold" title="Rule Broken">⚠️</span>'}
        </td>
        <td class="py-3 px-3 text-xs truncate max-w-[150px]">
          ${reviewInfo}
        </td>
        <td class="py-3 px-3 text-center">
          ${(() => {
            const chartCount = normalizeTradeCharts(t).filter(c => getChartDisplaySrc(c)).length || ((t.screenshot || t.chartUrl || t.hasScreenshot) ? 1 : 0);
            if (!chartCount) return '<span class="text-slate-600">-</span>';
            return `
            <button type="button" class="btn-preview-thumb inline-flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-slate-700 text-indigo-400 transition" data-id="${t.id}" data-num="${t.tradeNum}" title="${chartCount > 1 ? `Click to view ${chartCount} charts` : 'Click to view chart screenshot'}">
              <i data-lucide="image" class="w-4 h-4"></i>
              ${chartCount > 1 ? `<span class="text-[10px] font-bold px-1 rounded bg-indigo-500/20 text-indigo-400 leading-tight">${chartCount}</span>` : ''}
            </button>
          `;
          })()}
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <div class="flex items-center justify-center space-x-1.5" onclick="event.stopPropagation()">
            <button class="btn-edit-row p-1 text-slate-400 hover:text-indigo-400 transition" data-id="${t.id}" title="Edit Trade">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-delete-row p-1 text-slate-400 hover:text-rose-400 transition" data-id="${t.id}" title="Delete Trade">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      `;

      // Clicking row opens trade edit
      tr.addEventListener('click', () => openTradeModal(t.id));

      tbody.appendChild(tr);
    });

    // Action listeners inside table
    tbody.querySelectorAll('.btn-edit-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTradeModal(btn.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this trade?')) {
          deleteTrade(btn.getAttribute('data-id'));
        }
      });
    });

    tbody.querySelectorAll('.btn-preview-thumb').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tradeId = btn.getAttribute('data-id');
        const tradeNum = btn.getAttribute('data-num');
        const trade = trades.find(t => t.id === tradeId || String(t.tradeNum) === String(tradeNum));
        let charts = trade ? normalizeTradeCharts(trade) : [];
        if (trade && (charts.length === 0 || charts.some(c => !c.screenshot))) {
          charts = await hydrateTradeChartsFromStorage(trade, tradeId, tradeNum);
        } else if (!trade) {
          charts = await hydrateTradeChartsFromStorage(null, tradeId, tradeNum);
        }

        const galleryItems = charts
          .map((c, idx) => ({
            src: getChartDisplaySrc(c),
            label: c.label || `Chart ${idx + 1}`,
            externalUrl: c.chartUrl || ''
          }))
          .filter(item => item.src);

        if (galleryItems.length > 0) {
          const baseTitle = `${trade ? trade.symbol : 'Trade'} (${trade ? trade.direction : ''}) — Trade #${trade ? trade.tradeNum : tradeNum}`;
          openLightboxGallery(galleryItems, 0, baseTitle);
        } else {
          GoogleDriveSync.showToast('Chart screenshot not found.', 'info');
        }
      });
    });

    lucide.createIcons();
  }

  function formatLocalYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getLocalDateKey(dateInput) {
    if (!dateInput) return formatLocalYMD(new Date());
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) return formatLocalYMD(d);
    const str = String(dateInput).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : formatLocalYMD(new Date());
  }

  function formatShortDayLabel(ymd, includeYear = false) {
    const parts = String(ymd || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return ymd || '-';
    const localDate = new Date(parts[0], parts[1] - 1, parts[2]);
    return localDate.toLocaleDateString('en-US', includeYear
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' });
  }

  function formatSignedCurrency(value, { forceNegative = false, zeroText = '$0.00' } = {}) {
    const num = Number(value) || 0;
    if (Math.abs(num) < 1e-9) return zeroText;
    const abs = Math.abs(num);
    const maxDigits = abs < 0.01 ? 4 : 2;
    const factor = Math.pow(10, maxDigits);
    const roundedAbs = Math.round(abs * factor) / factor;
    if (roundedAbs === 0) return zeroText;
    const absStr = roundedAbs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits });
    const sign = (forceNegative || num < 0) ? '-$' : '+$';
    return `${sign}${absStr}`;
  }

  function roundPnLValue(value) {
    const num = Number(value) || 0;
    if (Math.abs(num) < 1e-9) return 0;
    const factor = Math.abs(num) < 0.01 ? 10000 : 100;
    return Math.round(num * factor) / factor;
  }

  function formatCleanCurrencyTick(value) {
    const num = Number(value) || 0;
    if (Math.abs(num) < 1e-9) return '$0';
    if (Math.abs(num) < 0.01) {
      const tiny = Math.round(num * 10000) / 10000;
      const tinyStr = Math.abs(tiny).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      return `${tiny < 0 ? '-$' : '$'}${tinyStr}`;
    }
    const rounded = Math.round(num * 100) / 100;
    const hasFraction = Math.abs(rounded % 1) > 1e-6;
    const absStr = Math.abs(rounded).toLocaleString('en-US', {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2
    });
    return `${rounded < 0 ? '-$' : '$'}${absStr}`;
  }

  function formatCleanRTick(value) {
    const num = Number(value) || 0;
    const rounded = Math.abs(num) < 1e-9 ? 0 : Math.round(num * 100) / 100;
    return `${rounded}R`;
  }

  function getChartTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      isDark,
      gridColor: isDark ? '#1E293B' : '#E2E8F0',
      tickColor: isDark ? '#94A3B8' : '#475569',
      tooltipBg: isDark ? '#0F172A' : '#FFFFFF',
      tooltipTitle: isDark ? '#F8FAFC' : '#0F172A',
      tooltipBody: isDark ? '#94A3B8' : '#334155',
      tooltipBorder: isDark ? '#334155' : '#CBD5E1'
    };
  }

  /** Draw a full-width dashed limit reference line across any Chart.js bar/line plot. */
  function createHorizontalLimitPlugin(limitValue, color, labelText) {
    return {
      id: 'horizontalLimitLine',
      afterDatasetsDraw(chart) {
        if (limitValue === null || limitValue === undefined || isNaN(limitValue)) return;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales || !scales.y) return;
        const yPos = scales.y.getPixelForValue(limitValue);
        if (yPos < chartArea.top - 4 || yPos > chartArea.bottom + 4) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPos);
        ctx.lineTo(chartArea.right, yPos);
        ctx.stroke();
        if (labelText) {
          ctx.fillStyle = color;
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'right';
          const textY = Math.max(chartArea.top + 11, yPos - 5);
          ctx.fillText(labelText, chartArea.right - 4, textY);
        }
        ctx.restore();
      }
    };
  }

  /** Aggregate executed trades per local calendar day and evaluate Daily Loss & Daily Trade Limits. */
  function computeDailyStats(tradeList = trades) {
    const lossLimit = parseNonNegLimit(settings.dailyLossLimit, 100);
    const tradeLimit = Math.floor(parseNonNegLimit(settings.dailyTradeLimit, 3));
    const dayMap = new Map();

    tradeList.filter(t => !t.isMissed).forEach(t => {
      const dateKey = getLocalDateKey(t.date);
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, { dateKey, tradeCount: 0, netPnL: 0, netR: 0 });
      }
      const entry = dayMap.get(dateKey);
      entry.tradeCount += 1;
      entry.netPnL += parseFloat(t.realizedPnL) || 0;
      entry.netR += parseFloat(t.realizedR) || 0;
    });

    const days = Array.from(dayMap.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(d => {
        const netPnL = Math.round(d.netPnL * 100) / 100;
        const netR = Math.round(d.netR * 100) / 100;
        const dailyLoss = Math.round(Math.max(0, -netPnL) * 100) / 100;
        return {
          dateKey: d.dateKey,
          tradeCount: d.tradeCount,
          netPnL,
          netR,
          dailyLoss,
          lossHit: lossLimit > 0 && dailyLoss >= lossLimit,
          lossBreached: lossLimit > 0 && dailyLoss > lossLimit,
          tradesHit: tradeLimit > 0 && d.tradeCount >= tradeLimit,
          tradesBreached: tradeLimit > 0 && d.tradeCount > tradeLimit
        };
      });

    const todayKey = formatLocalYMD(new Date());
    const today = days.find(d => d.dateKey === todayKey) || {
      dateKey: todayKey,
      tradeCount: 0,
      netPnL: 0,
      netR: 0,
      dailyLoss: 0,
      lossHit: false,
      lossBreached: false,
      tradesHit: false,
      tradesBreached: false
    };

    const totalDays = days.length;
    const breachedLossDays = lossLimit > 0 ? days.filter(d => d.lossBreached).length : 0;
    const breachedTradeDays = tradeLimit > 0 ? days.filter(d => d.tradesBreached).length : 0;
    const withinLossDays = totalDays - breachedLossDays;
    const withinTradeDays = totalDays - breachedTradeDays;
    const worstDayLoss = days.reduce((max, d) => Math.max(max, d.dailyLoss), 0);
    const peakDayTrades = days.reduce((max, d) => Math.max(max, d.tradeCount), 0);

    return {
      days,
      today,
      lossLimit,
      tradeLimit,
      totalDays,
      breachedLossDays,
      withinLossDays,
      breachedTradeDays,
      withinTradeDays,
      worstDayLoss,
      peakDayTrades
    };
  }

  // Render Charts in Analytics Tab
  function renderCharts() {
    renderEquityCurve();
    renderDailyLimitsAnalytics();
    renderStrategyChart();
    renderDisciplineChart();
    renderPsychologyChart();
  }

  function renderDailyLimitsAnalytics() {
    syncLimitInputs();
    const stats = computeDailyStats();
    const { today, lossLimit, tradeLimit, totalDays, breachedLossDays, withinLossDays, breachedTradeDays, withinTradeDays, worstDayLoss, peakDayTrades } = stats;

    // 1. Today's Loss Used vs Limit Card
    const lossValEl = document.getElementById('dl-today-loss-value');
    const lossCapEl = document.getElementById('dl-today-loss-cap');
    const lossBadgeEl = document.getElementById('dl-today-loss-badge');
    const lossBarEl = document.getElementById('dl-today-loss-bar');
    const lossSubEl = document.getElementById('dl-today-loss-sub');

    if (lossValEl) {
      lossValEl.textContent = today.dailyLoss > 0 ? `-$${today.dailyLoss.toFixed(2)}` : `$0.00`;
      lossValEl.className = `text-lg font-black ${today.lossHit ? 'text-rose-500' : (today.dailyLoss > 0 ? 'text-amber-500' : 'text-emerald-500')}`;
    }
    if (lossCapEl) lossCapEl.textContent = lossLimit > 0 ? `/ -$${lossLimit.toLocaleString()} max` : 'Disabled';

    const lossPct = lossLimit > 0 ? Math.min(100, (today.dailyLoss / lossLimit) * 100) : 0;
    if (lossBarEl) {
      lossBarEl.style.width = `${lossPct}%`;
      lossBarEl.className = `h-1.5 rounded-full transition-all duration-300 ${
        lossLimit <= 0 ? 'bg-slate-500' :
        today.dailyLoss >= lossLimit ? 'bg-rose-500' :
        lossPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
      }`;
    }
    if (lossBadgeEl) {
      let badgeTxt = 'Safe';
      let badgeCls = 'bg-emerald-500/15 text-emerald-500';
      if (lossLimit <= 0) {
        badgeTxt = 'Off';
        badgeCls = 'bg-slate-500/15 text-slate-400';
      } else if (today.lossBreached) {
        badgeTxt = 'Breached';
        badgeCls = 'bg-rose-500/15 text-rose-500';
      } else if (today.lossHit) {
        badgeTxt = 'Limit Hit';
        badgeCls = 'bg-rose-500/15 text-rose-500';
      } else if (lossPct >= 75) {
        badgeTxt = 'Near Limit';
        badgeCls = 'bg-amber-500/15 text-amber-500';
      }
      lossBadgeEl.textContent = badgeTxt;
      lossBadgeEl.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}`;
    }
    if (lossSubEl) {
      if (lossLimit <= 0) {
        lossSubEl.textContent = today.netPnL >= 0 ? `+$${today.netPnL.toFixed(2)} net today` : `-$${today.dailyLoss.toFixed(2)} net today`;
      } else if (today.lossBreached) {
        lossSubEl.textContent = `Exceeded by $${(today.dailyLoss - lossLimit).toFixed(2)} — stop trading`;
      } else if (today.lossHit) {
        lossSubEl.textContent = '0 buffer left — respect your daily stop';
      } else {
        const bufferLeft = (lossLimit - today.dailyLoss).toFixed(2);
        lossSubEl.textContent = today.netPnL > 0
          ? `+$${today.netPnL.toFixed(2)} net today • $${lossLimit.toFixed(2)} limit intact`
          : `$${bufferLeft} loss buffer remaining today`;
      }
    }

    // 2. Today's Trade Count vs Limit Card
    const trValEl = document.getElementById('dl-today-trades-value');
    const trCapEl = document.getElementById('dl-today-trades-cap');
    const trBadgeEl = document.getElementById('dl-today-trades-badge');
    const trBarEl = document.getElementById('dl-today-trades-bar');
    const trSubEl = document.getElementById('dl-today-trades-sub');

    if (trValEl) {
      trValEl.textContent = String(today.tradeCount);
      trValEl.className = `text-lg font-black ${today.tradesBreached ? 'text-rose-500' : (today.tradesHit ? 'text-amber-500' : 'text-white')}`;
    }
    if (trCapEl) trCapEl.textContent = tradeLimit > 0 ? `/ ${tradeLimit} max` : 'Disabled';

    const trPct = tradeLimit > 0 ? Math.min(100, (today.tradeCount / tradeLimit) * 100) : 0;
    if (trBarEl) {
      trBarEl.style.width = `${trPct}%`;
      trBarEl.className = `h-1.5 rounded-full transition-all duration-300 ${
        tradeLimit <= 0 ? 'bg-slate-500' :
        today.tradesBreached ? 'bg-rose-500' :
        today.tradesHit ? 'bg-amber-500' : 'bg-indigo-500'
      }`;
    }
    if (trBadgeEl) {
      let badgeTxt = 'Within Cap';
      let badgeCls = 'bg-emerald-500/15 text-emerald-500';
      if (tradeLimit <= 0) {
        badgeTxt = 'Off';
        badgeCls = 'bg-slate-500/15 text-slate-400';
      } else if (today.tradesBreached) {
        badgeTxt = 'Over Limit';
        badgeCls = 'bg-rose-500/15 text-rose-500';
      } else if (today.tradesHit) {
        badgeTxt = 'Max Reached';
        badgeCls = 'bg-amber-500/15 text-amber-500';
      }
      trBadgeEl.textContent = badgeTxt;
      trBadgeEl.className = `px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}`;
    }
    if (trSubEl) {
      if (tradeLimit <= 0) {
        trSubEl.textContent = `${today.tradeCount} executed trade(s) today`;
      } else if (today.tradesBreached) {
        trSubEl.textContent = `${today.tradeCount - tradeLimit} trade(s) over your daily cap!`;
      } else if (today.tradesHit) {
        trSubEl.textContent = '0 trades left — step away for today';
      } else {
        const left = tradeLimit - today.tradeCount;
        trSubEl.textContent = `${left} trade${left === 1 ? '' : 's'} remaining today`;
      }
    }

    // 3. Multi-Day Compliance Summary Cards
    const lossCompPctEl = document.getElementById('dl-loss-compliance-pct');
    const lossCompSubEl = document.getElementById('dl-loss-compliance-sub');
    const worstDayEl = document.getElementById('dl-worst-day-sub');
    const lossCompPct = totalDays > 0 ? Math.round((withinLossDays / totalDays) * 100) : 100;
    if (lossCompPctEl) {
      lossCompPctEl.textContent = `${lossCompPct}%`;
      lossCompPctEl.className = `text-lg font-black ${breachedLossDays > 0 ? 'text-amber-500' : 'text-emerald-500'}`;
    }
    if (lossCompSubEl) lossCompSubEl.textContent = `${breachedLossDays} of ${totalDays} trading day(s) breached`;
    if (worstDayEl) worstDayEl.textContent = worstDayLoss > 0 ? `Worst day: -$${worstDayLoss.toFixed(2)}` : 'Worst day: $0.00';

    const trCompPctEl = document.getElementById('dl-trades-compliance-pct');
    const trCompSubEl = document.getElementById('dl-trades-compliance-sub');
    const peakTradesEl = document.getElementById('dl-peak-trades-sub');
    const trCompPct = totalDays > 0 ? Math.round((withinTradeDays / totalDays) * 100) : 100;
    if (trCompPctEl) {
      trCompPctEl.textContent = `${trCompPct}%`;
      trCompPctEl.className = `text-lg font-black ${breachedTradeDays > 0 ? 'text-amber-500' : 'text-indigo-500'}`;
    }
    if (trCompSubEl) trCompSubEl.textContent = `${breachedTradeDays} of ${totalDays} day(s) exceeded cap`;
    if (peakTradesEl) peakTradesEl.textContent = `Peak day: ${peakDayTrades} trade${peakDayTrades === 1 ? '' : 's'}`;

    renderDailyLossChart(stats);
    renderDailyTradesChart(stats);
    renderDailyLimitsTable(stats);
  }

  function renderDailyLossChart(stats) {
    const canvas = document.getElementById('daily-loss-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (dailyLossChart) dailyLossChart.destroy();

    const theme = getChartTheme();
    const days = stats.days.length > 0 ? stats.days : [stats.today];
    const labels = days.map(d => formatShortDayLabel(d.dateKey));
    const values = days.map(d => d.netPnL);
    const barColors = days.map(d => {
      if (d.netPnL >= 0) return '#10B981';
      if (stats.lossLimit > 0 && d.dailyLoss >= stats.lossLimit) return '#DC2626';
      return '#F87171';
    });

    const limitVal = stats.lossLimit > 0 ? -stats.lossLimit : null;
    const suggestedMin = stats.lossLimit > 0
      ? Math.min(-stats.lossLimit * 1.2, -stats.worstDayLoss * 1.1)
      : undefined;

    dailyLossChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Daily Net P&L ($)',
          data: values,
          backgroundColor: barColors,
          borderRadius: 6,
          maxBarThickness: 42
        }]
      },
      plugins: [createHorizontalLimitPlugin(limitVal, '#EF4444', stats.lossLimit > 0 ? `Max Loss: ${formatCleanCurrencyTick(-stats.lossLimit)}` : '')],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipTitle,
            bodyColor: theme.tooltipBody,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const v = context.parsed.y || 0;
                const d = days[context.dataIndex];
                const status = (stats.lossLimit > 0 && d && d.lossHit)
                  ? (d.lossBreached ? ' (BREACHED)' : ' (LIMIT HIT)')
                  : '';
                return `Net P&L: ${v >= 0 ? '+$' : '-$'}${Math.abs(v).toFixed(2)}${status}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.tickColor, font: { size: 10 } } },
          y: {
            suggestedMin,
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.tickColor,
              font: { size: 10 },
              callback: formatCleanCurrencyTick
            }
          }
        }
      }
    });
  }

  function renderDailyTradesChart(stats) {
    const canvas = document.getElementById('daily-trades-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (dailyTradesChart) dailyTradesChart.destroy();

    const theme = getChartTheme();
    const days = stats.days.length > 0 ? stats.days : [stats.today];
    const labels = days.map(d => formatShortDayLabel(d.dateKey));
    const values = days.map(d => d.tradeCount);
    const barColors = days.map(d => {
      if (stats.tradeLimit > 0 && d.tradesBreached) return '#EF4444';
      if (stats.tradeLimit > 0 && d.tradesHit) return '#F59E0B';
      return '#6366F1';
    });

    const limitVal = stats.tradeLimit > 0 ? stats.tradeLimit : null;
    const suggestedMax = stats.tradeLimit > 0
      ? Math.max(stats.tradeLimit + 1, stats.peakDayTrades + 1)
      : Math.max(3, stats.peakDayTrades + 1);

    dailyTradesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Executed Trades',
          data: values,
          backgroundColor: barColors,
          borderRadius: 6,
          maxBarThickness: 42
        }]
      },
      plugins: [createHorizontalLimitPlugin(limitVal, '#F59E0B', stats.tradeLimit > 0 ? `Max Trades: ${stats.tradeLimit}` : '')],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipTitle,
            bodyColor: theme.tooltipBody,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const cnt = context.parsed.y || 0;
                const capStr = stats.tradeLimit > 0 ? ` / ${stats.tradeLimit} limit` : '';
                return `Trades: ${cnt}${capStr}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.tickColor, font: { size: 10 } } },
          y: {
            beginAtZero: true,
            suggestedMax,
            grid: { color: theme.gridColor },
            ticks: {
              stepSize: 1,
              color: theme.tickColor,
              font: { size: 10 }
            }
          }
        }
      }
    });
  }

  function renderDailyLimitsTable(stats) {
    const tbody = document.getElementById('daily-limits-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (stats.days.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="py-5 px-4 text-center text-slate-400">No executed trades logged yet. Log a trade to track daily limits.</td>';
      tbody.appendChild(tr);
      return;
    }

    const daysDesc = [...stats.days].reverse();
    daysDesc.forEach(d => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/30 transition-colors';

      const pnlText = `${d.netPnL >= 0 ? '+$' : '-$'}${Math.abs(d.netPnL).toFixed(2)}`;
      const pnlCls = d.netPnL >= 0 ? 'text-emerald-500' : 'text-rose-500';
      const rText = `${d.netR >= 0 ? '+' : ''}${d.netR.toFixed(1)}R`;

      let lossBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500">Within Limit</span>';
      if (stats.lossLimit <= 0) {
        lossBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-400">Off</span>';
      } else if (d.lossBreached) {
        lossBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-500">Breached</span>';
      } else if (d.lossHit) {
        lossBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500">Limit Hit</span>';
      }

      let tradeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500">Within Cap</span>';
      if (stats.tradeLimit <= 0) {
        tradeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-400">Off</span>';
      } else if (d.tradesBreached) {
        tradeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-500">Over Limit</span>';
      } else if (d.tradesHit) {
        tradeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500">At Cap</span>';
      }

      const capLabel = stats.tradeLimit > 0 ? `${d.tradeCount} / ${stats.tradeLimit}` : `${d.tradeCount}`;
      const isToday = d.dateKey === stats.today.dateKey;

      tr.innerHTML = `
        <td class="py-2.5 px-3 font-semibold text-white whitespace-nowrap">
          ${formatShortDayLabel(d.dateKey, true)}
          ${isToday ? '<span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-bold">Today</span>' : ''}
        </td>
        <td class="py-2.5 px-3 text-center font-bold ${d.tradesBreached ? 'text-rose-500' : 'text-slate-300'}">${capLabel}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold ${pnlCls}">${pnlText}</td>
        <td class="py-2.5 px-3 text-right font-mono font-semibold ${d.netR >= 0 ? 'text-emerald-500' : 'text-rose-500'}">${rText}</td>
        <td class="py-2.5 px-3 text-center">${lossBadge}</td>
        <td class="py-2.5 px-3 text-center">${tradeBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderEquityCurve() {
    const canvas = document.getElementById('equity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (equityChart) equityChart.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? '#1E293B' : '#E2E8F0';
    const tickColor = isDark ? '#64748B' : '#475569';
    const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
    const tooltipTitle = isDark ? '#F8FAFC' : '#0F172A';
    const tooltipBody = isDark ? '#94A3B8' : '#334155';
    const tooltipBorder = isDark ? '#334155' : '#CBD5E1';

    const closed = trades.filter(t => !t.isMissed && t.outcome !== 'OPEN');
    closed.sort((a, b) => (parseInt(a.tradeNum, 10) || 0) - (parseInt(b.tradeNum, 10) || 0));

    const labels = ['Start'];
    const pnlData = [0];
    let cumulative = 0;

    closed.forEach(t => {
      labels.push(`#${t.tradeNum}`);
      if (chartMode === 'r') {
        cumulative += parseFloat(t.realizedR) || 0;
      } else {
        cumulative += parseFloat(t.realizedPnL) || 0;
      }
      pnlData.push(Math.round(cumulative * 100) / 100);
    });

    const isProfitable = cumulative >= 0;
    const lineColor = isProfitable ? '#10B981' : '#EF4444';
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, isProfitable ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)');
    gradient.addColorStop(1, isDark ? 'rgba(11, 15, 25, 0)' : 'rgba(248, 250, 252, 0)');

    equityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: chartMode === 'r' ? 'Cumulative R-Multiple' : 'Cumulative P&L ($)',
          data: pnlData,
          borderColor: lineColor,
          borderWidth: 2.5,
          pointBackgroundColor: lineColor,
          pointBorderColor: isDark ? '#131B2E' : '#FFFFFF',
          pointRadius: pnlData.length > 50 ? 2 : 4,
          pointHoverRadius: 6,
          fill: true,
          backgroundColor: gradient,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitle,
            bodyColor: tooltipBody,
            borderColor: tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const y = context.parsed.y || 0;
                const cleanY = Math.round(y * 100) / 100;
                return chartMode === 'r'
                  ? `Cumulative: ${cleanY >= 0 ? '+' : ''}${cleanY.toFixed(2)}R`
                  : `Cumulative: ${cleanY >= 0 ? '+$' : '-$'}${Math.abs(cleanY).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { size: 10 },
              callback: function(value) {
                return chartMode === 'r' ? formatCleanRTick(value) : formatCleanCurrencyTick(value);
              }
            }
          }
        }
      }
    });
  }

  function renderStrategyChart() {
    const canvas = document.getElementById('strategy-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (strategyChart) strategyChart.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? '#1E293B' : '#E2E8F0';
    const tickColor = isDark ? '#94A3B8' : '#334155';

    const stratMap = {};
    trades.filter(t => !t.isMissed).forEach(t => {
      const s = t.strategy ? t.strategy.trim() : 'Unspecified';
      if (!stratMap[s]) stratMap[s] = 0;
      stratMap[s] += parseFloat(t.realizedPnL) || 0;
    });

    const labels = Object.keys(stratMap).slice(0, 6);
    const data = labels.map(l => roundPnLValue(stratMap[l]));
    const colors = data.map(val => val >= 0 ? '#10B981' : '#EF4444');

    strategyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Net P&L ($)',
          data: data,
          backgroundColor: colors,
          borderRadius: 6,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: '#64748B', font: { size: 9 }, callback: formatCleanCurrencyTick } },
          y: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } }
        }
      }
    });
  }

  function renderDisciplineChart() {
    const canvas = document.getElementById('discipline-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (disciplineChart) disciplineChart.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? '#1E293B' : '#E2E8F0';
    const tickColor = isDark ? '#CBD5E1' : '#0F172A';

    let planYesPnL = 0;
    let planNoPnL = 0;

    trades.filter(t => !t.isMissed).forEach(t => {
      const pnl = parseFloat(t.realizedPnL) || 0;
      const isYes = t.planFollowed === true || t.planFollowed === 'true';
      if (isYes) planYesPnL += pnl;
      else planNoPnL += pnl;
    });

    disciplineChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Rules Followed', 'Rules Broken ⚠️'],
        datasets: [{
          label: 'Total P&L ($)',
          data: [roundPnLValue(planYesPnL), roundPnLValue(planNoPnL)],
          backgroundColor: [planYesPnL >= 0 ? '#10B981' : '#EF4444', '#EF4444'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } },
          y: { grid: { color: gridColor }, ticks: { color: '#64748B', font: { size: 9 }, callback: formatCleanCurrencyTick } }
        }
      }
    });
  }

  function renderPsychologyChart() {
    const canvas = document.getElementById('market-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (marketChart) marketChart.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const legendColor = isDark ? '#94A3B8' : '#334155';
    const borderColor = isDark ? '#131B2E' : '#FFFFFF';

    const emotions = {};
    trades.forEach(t => {
      const e = t.emotion || 'Calm';
      emotions[e] = (emotions[e] || 0) + 1;
    });

    const labels = Object.keys(emotions);
    const data = labels.map(l => emotions[l]);

    marketChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: ['#10B981', '#6366F1', '#A855F7', '#F59E0B', '#EF4444', '#38BDF8'],
          borderColor: borderColor,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: legendColor, font: { size: 10 } }
          }
        }
      }
    });
  }

  function renderAll() {
    renderKPIs();
    renderTable();
    renderCharts();
  }

  function setNextChartStage(label) {
    nextChartLabel = label || 'Entry / Setup';
    document.querySelectorAll('#chart-stage-chips .chart-stage-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === nextChartLabel);
    });
    const nextLblEl = document.getElementById('dropzone-next-label');
    if (nextLblEl) nextLblEl.textContent = nextChartLabel;
  }

  // COPY-PASTE SCREENSHOT & MULTI-CHART UPLOAD ENGINE
  function bindPasteAndUpload() {
    const dropzone = document.getElementById('screenshot-dropzone');
    const fileInput = document.getElementById('file-screenshot-input');
    const modal = document.getElementById('modal-trade');

    // Stage preset buttons
    document.querySelectorAll('#chart-stage-chips .chart-stage-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        setNextChartStage(chip.dataset.val);
      });
    });

    // 1. Global Clipboard Paste Listener (Ctrl + V anywhere when modal is open appends a chart)
    window.addEventListener('paste', function(e) {
      if (modal.classList.contains('hidden')) return;

      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;

      let pastedImage = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            processScreenshotFile(blob);
            pastedImage = true;
          }
        }
      }

      if (pastedImage) {
        GoogleDriveSync.showToast(`Added "${nextChartLabel}" chart from clipboard!`, 'success');
        e.preventDefault();
      }
    });

    // 2. Dropzone Click to Browse (supports multiple files)
    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        Array.from(fileInput.files).forEach(file => processScreenshotFile(file));
        fileInput.value = '';
      }
    });

    // 3. Drag and Drop onto Dropzone (supports multiple files)
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files)
          .filter(f => f.type.startsWith('image/'))
          .forEach(file => processScreenshotFile(file));
      }
    });
  }

  // Compress & Resize Image to prevent bloating JSON / Drive storage
  function processScreenshotFile(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1100;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG 0.82
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
        addModalChart(compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function addModalChart(imgDataUrl, explicitLabel = null, chartUrl = '') {
    const defaultLabel = nextChartLabel || (currentCharts.length === 0 ? 'Entry / Setup' : 'After / Follow-up');
    const label = (explicitLabel || defaultLabel).trim();
    currentCharts.push({
      id: 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      label,
      screenshot: (imgDataUrl && imgDataUrl.startsWith('data:')) ? imgDataUrl : '',
      chartUrl: chartUrl || (imgDataUrl && !imgDataUrl.startsWith('data:') ? imgDataUrl : ''),
      addedAt: new Date().toISOString()
    });
    if (currentCharts.length === 1 && !explicitLabel && nextChartLabel === 'Entry / Setup') {
      setNextChartStage('After / Follow-up');
    }
    renderModalCharts();
  }

  function openModalChartsLightbox(startIndex = 0) {
    const galleryItems = currentCharts
      .map((c, idx) => ({
        src: getChartDisplaySrc(c),
        label: c.label || `Chart ${idx + 1}`,
        externalUrl: c.chartUrl || ''
      }))
      .filter(item => item.src);
    if (!galleryItems.length) return;
    const sym = document.getElementById('input-trade-symbol')?.value.trim().toUpperCase() || 'Trade';
    openLightboxGallery(galleryItems, startIndex, `${sym} Chart Preview`);
  }

  function renderModalCharts() {
    const listEl = document.getElementById('modal-charts-list');
    const emptyEl = document.getElementById('dropzone-empty-state');
    const addMoreEl = document.getElementById('dropzone-add-more-state');
    const dropzone = document.getElementById('screenshot-dropzone');
    const countBadge = document.getElementById('modal-charts-count');
    const hiddenInput = document.getElementById('trade-screenshot-data');

    const count = currentCharts.length;
    if (countBadge) countBadge.textContent = String(count);
    if (hiddenInput) hiddenInput.value = count > 0 ? getChartDisplaySrc(currentCharts[0]) : '';

    if (count === 0) {
      emptyEl.classList.remove('hidden');
      addMoreEl.classList.add('hidden');
      addMoreEl.classList.remove('flex');
      dropzone.classList.remove('has-image');
      listEl.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }

    emptyEl.classList.add('hidden');
    addMoreEl.classList.remove('hidden');
    addMoreEl.classList.add('flex');
    dropzone.classList.add('has-image');
    listEl.classList.remove('hidden');
    listEl.innerHTML = '';

    currentCharts.forEach((chart, idx) => {
      const displaySrc = getChartDisplaySrc(chart);
      const card = document.createElement('div');
      card.className = 'chart-item-card p-2.5 flex flex-col';

      // Top bar: index + sync badge + controls
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-1.5 mb-2';

      const leftInfo = document.createElement('div');
      leftInfo.className = 'flex items-center space-x-1.5';
      const idxBadge = document.createElement('span');
      idxBadge.className = 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400';
      idxBadge.textContent = `#${idx + 1}`;
      leftInfo.appendChild(idxBadge);

      const syncBadge = document.createElement('span');
      syncBadge.className = chart.chartUrl
        ? 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400'
        : 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400';
      syncBadge.textContent = chart.chartUrl ? 'Drive' : 'New';
      leftInfo.appendChild(syncBadge);

      const actions = document.createElement('div');
      actions.className = 'flex items-center space-x-1';

      if (idx > 0) {
        const moveBtn = document.createElement('button');
        moveBtn.type = 'button';
        moveBtn.className = 'p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition';
        moveBtn.title = 'Move earlier';
        moveBtn.innerHTML = '<i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>';
        moveBtn.addEventListener('click', () => {
          const prev = currentCharts[idx - 1];
          currentCharts[idx - 1] = currentCharts[idx];
          currentCharts[idx] = prev;
          renderModalCharts();
        });
        actions.appendChild(moveBtn);
      }

      const zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition';
      zoomBtn.title = 'View fullscreen';
      zoomBtn.innerHTML = '<i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>';
      zoomBtn.addEventListener('click', () => openModalChartsLightbox(idx));
      actions.appendChild(zoomBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'p-1 rounded hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 transition';
      removeBtn.title = 'Remove this chart';
      removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>';
      removeBtn.addEventListener('click', () => {
        currentCharts.splice(idx, 1);
        if (currentCharts.length === 0) setNextChartStage('Entry / Setup');
        renderModalCharts();
      });
      actions.appendChild(removeBtn);

      header.appendChild(leftInfo);
      header.appendChild(actions);

      // Thumbnail
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'w-full h-32 rounded-lg overflow-hidden border border-slate-700 bg-black/50 flex items-center justify-center cursor-zoom-in';
      thumbWrap.addEventListener('click', () => openModalChartsLightbox(idx));
      const imgEl = document.createElement('img');
      imgEl.src = displaySrc;
      imgEl.alt = chart.label || `Chart ${idx + 1}`;
      imgEl.className = 'w-full h-full object-contain';
      thumbWrap.appendChild(imgEl);

      // Editable stage/notes label input
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = chart.label || '';
      labelInput.placeholder = 'Tag (e.g. Entry, 1H After, Exit)';
      labelInput.className = 'mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500';
      labelInput.addEventListener('input', () => {
        chart.label = labelInput.value;
      });

      card.appendChild(header);
      card.appendChild(thumbWrap);
      card.appendChild(labelInput);
      listEl.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function clearScreenshot() {
    currentCharts = [];
    setNextChartStage('Entry / Setup');
    renderModalCharts();
  }

  // Lightbox Gallery Modal Controller
  function renderLightboxSlide() {
    const items = lightboxState.items || [];
    if (!items.length) return;
    const total = items.length;
    const idx = ((lightboxState.index % total) + total) % total;
    lightboxState.index = idx;
    const item = items[idx];

    const imgEl = document.getElementById('lightbox-img');
    const capEl = document.getElementById('lightbox-caption');
    const driveLink = document.getElementById('lightbox-drive-link');
    const counterEl = document.getElementById('lightbox-counter');
    const headerNavEl = document.getElementById('lightbox-header-nav');
    const prevOverlay = document.getElementById('btn-lightbox-prev-overlay');
    const nextOverlay = document.getElementById('btn-lightbox-next-overlay');
    const thumbsEl = document.getElementById('lightbox-thumbs');

    imgEl.src = item.src;
    capEl.textContent = item.label
      ? `${lightboxState.baseCaption} • ${item.label}`
      : lightboxState.baseCaption;

    if (driveLink) {
      if (item.externalUrl) {
        driveLink.href = item.externalUrl;
        driveLink.classList.remove('hidden');
      } else {
        driveLink.classList.add('hidden');
      }
    }

    const multi = total > 1;
    if (counterEl) {
      counterEl.textContent = `${idx + 1} / ${total}`;
      counterEl.classList.toggle('hidden', !multi);
    }
    if (headerNavEl) {
      headerNavEl.classList.toggle('hidden', !multi);
      headerNavEl.classList.toggle('flex', multi);
    }
    if (prevOverlay) prevOverlay.classList.toggle('hidden', !multi);
    if (nextOverlay) nextOverlay.classList.toggle('hidden', !multi);

    if (thumbsEl) {
      thumbsEl.innerHTML = '';
      thumbsEl.classList.toggle('hidden', !multi);
      if (multi) {
        items.forEach((thumbItem, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `lightbox-thumb-btn shrink-0 rounded-lg p-1 flex items-center space-x-2 max-w-[180px] ${i === idx ? 'active' : 'opacity-75 hover:opacity-100'}`;
          const tImg = document.createElement('img');
          tImg.src = thumbItem.src;
          tImg.alt = thumbItem.label || `Chart ${i + 1}`;
          tImg.className = 'w-12 h-8 object-cover rounded';
          const tLbl = document.createElement('span');
          tLbl.className = 'text-[10px] font-semibold truncate';
          tLbl.textContent = thumbItem.label ? `#${i + 1} ${thumbItem.label}` : `Chart #${i + 1}`;
          btn.appendChild(tImg);
          btn.appendChild(tLbl);
          btn.addEventListener('click', () => {
            lightboxState.index = i;
            renderLightboxSlide();
          });
          thumbsEl.appendChild(btn);
        });
      }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function stepLightbox(delta) {
    if (!lightboxState.items || lightboxState.items.length <= 1) return;
    lightboxState.index += delta;
    renderLightboxSlide();
  }

  function openLightboxGallery(items, startIndex = 0, baseCaption = '') {
    const valid = (items || []).filter(it => it && it.src);
    if (!valid.length) return;
    lightboxState = { items: valid, index: startIndex || 0, baseCaption: baseCaption || '' };
    renderLightboxSlide();

    const lightbox = document.getElementById('modal-lightbox');
    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
  }

  function openLightbox(imgSrc, caption = '', externalUrl = '') {
    openLightboxGallery([{ src: imgSrc, label: '', externalUrl }], 0, caption);
  }

  function closeLightbox() {
    const lightbox = document.getElementById('modal-lightbox');
    lightbox.classList.add('hidden');
    lightbox.classList.remove('flex');
  }

  /** Compute the next unique trade number (max existing + 1, capped at 100). */
  function getNextTradeNum() {
    const maxNum = trades.reduce((max, t) => Math.max(max, parseInt(t.tradeNum, 10) || 0), 0);
    return Math.min(100, maxNum + 1);
  }

  // Open Trade Modal
  function openTradeModal(editId = null) {
    const modal = document.getElementById('modal-trade');
    const badge = document.getElementById('modal-trade-badge');
    const deleteBtn = document.getElementById('btn-delete-trade');
    const form = document.getElementById('form-trade');

    form.reset();
    clearScreenshot();
    activeMistakes.clear();

    // Reset detailed prices accordion
    document.getElementById('detailed-prices-box').classList.add('hidden');

    if (editId) {
      const trade = trades.find(t => t.id === editId);
      if (!trade) return;

      document.getElementById('trade-id').value = trade.id;
      badge.textContent = `Edit Trade #${trade.tradeNum}`;
      document.getElementById('input-trade-symbol').value = trade.symbol || '';

      // Direction
      setDirection(trade.direction || 'LONG');

      // Executed vs Missed Mode
      setTradeMode(trade.isMissed ? 'MISSED' : 'EXECUTED');

      if (trade.isMissed) {
        document.getElementById('input-missed-pnl').value = trade.missedPnL || '';
        document.getElementById('input-missed-r').value = trade.missedR || '';
        // Set missed reason
        document.querySelectorAll('#missed-reason-chips .chip-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.val === trade.missedReason);
        });
      } else {
        document.getElementById('input-quick-pnl').value = trade.realizedPnL || '';
        document.getElementById('input-quick-r').value = trade.realizedR || '';
        document.getElementById('input-quick-risk').value = trade.plannedRisk || '';

        // Outcome chips
        document.querySelectorAll('.outcome-chip').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.val === (trade.outcome || 'WIN'));
        });

        // Optional detailed prices
        if (trade.entryPrice) document.getElementById('input-det-entry').value = trade.entryPrice;
        if (trade.stopLoss) document.getElementById('input-det-sl').value = trade.stopLoss;
        if (trade.exitPrice) document.getElementById('input-det-exit').value = trade.exitPrice;
        if (trade.quantity) document.getElementById('input-det-qty').value = trade.quantity;
      }

      // Strategy
      selectStrategy(trade.strategy || 'Breakout & Retest');

      // Rule followed
      const followed = trade.planFollowed === true || trade.planFollowed === 'true';
      setRuleDiscipline(followed);

      // Mistakes
      if (Array.isArray(trade.mistakes)) {
        trade.mistakes.forEach(m => activeMistakes.add(m));
        document.querySelectorAll('#mistake-chips .chip-btn').forEach(btn => {
          btn.classList.toggle('active', activeMistakes.has(btn.dataset.val));
        });
      }

      // Emotion
      selectEmotion(trade.emotion || 'Calm & Patient');

      // Notes
      document.getElementById('input-trade-notes').value = trade.notes || '';

      // Charts (multi-chart support + IndexedDB fallback hydration)
      currentCharts = normalizeTradeCharts(trade).map(c => Object.assign({}, c));
      renderModalCharts();
      setNextChartStage(currentCharts.length > 0 ? 'After / Follow-up' : 'Entry / Setup');

      if ((currentCharts.length === 0 || currentCharts.some(c => !c.screenshot)) && typeof TradeStorage !== 'undefined') {
        const openedCount = currentCharts.length;
        hydrateTradeChartsFromStorage(trade).then(hydrated => {
          const activeId = document.getElementById('trade-id').value;
          if (modal.classList.contains('hidden') || activeId !== trade.id || !hydrated || !hydrated.length) return;
          let updated = false;
          if (currentCharts.length === 0 && openedCount === 0) {
            currentCharts = hydrated.map(c => Object.assign({}, c));
            updated = true;
          } else {
            currentCharts.forEach((mc, idx) => {
              if (!mc.screenshot) {
                const match = hydrated.find(hc => (hc.id && hc.id === mc.id) || (hc.chartUrl && hc.chartUrl === mc.chartUrl)) || hydrated[idx];
                if (match && match.screenshot) {
                  mc.screenshot = match.screenshot;
                  updated = true;
                }
              }
            });
          }
          if (updated) {
            renderModalCharts();
            setNextChartStage(currentCharts.length > 0 ? 'After / Follow-up' : 'Entry / Setup');
          }
        });
      }

      deleteBtn.classList.remove('hidden');
    } else {
      // New Trade
      const nextNum = getNextTradeNum();
      document.getElementById('trade-id').value = '';
      badge.textContent = `Phase 1: Trade #${nextNum} / 100`;

      setDirection('LONG');
      setTradeMode('EXECUTED');
      setRuleDiscipline(true);
      selectStrategy('Breakout & Retest');
      selectEmotion('Calm & Patient');

      // Default outcome to WIN
      document.querySelectorAll('.outcome-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === 'WIN');
      });

      deleteBtn.classList.add('hidden');
    }

    updateModalDailyLimitWarning();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('input-trade-symbol').focus();
  }

  function updateModalDailyLimitWarning() {
    const banner = document.getElementById('modal-daily-limit-warning');
    const textEl = document.getElementById('modal-daily-limit-warning-text');
    if (!banner || !textEl) return;

    const editId = document.getElementById('trade-id')?.value;
    const isMissed = document.getElementById('trade-is-missed')?.value === 'true';
    if (editId || isMissed) {
      banner.classList.add('hidden');
      return;
    }

    const stats = computeDailyStats();
    const alerts = [];
    if (stats.today.lossHit) {
      const verb = stats.today.lossBreached ? 'exceeded' : 'reached';
      alerts.push(`Daily loss limit ($${stats.lossLimit}) ${verb} today (-$${stats.today.dailyLoss.toFixed(2)}).`);
    }
    if (stats.today.tradesHit) {
      const verb = stats.today.tradesBreached ? 'exceeded' : 'reached';
      alerts.push(`Daily trade limit (${stats.tradeLimit}/day) ${verb} today (${stats.today.tradeCount} executed).`);
    }

    if (alerts.length > 0) {
      textEl.textContent = `${alerts.join(' ')} Stop or double-check your rules before taking another trade.`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  function closeTradeModal() {
    const modal = document.getElementById('modal-trade');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function setTradeMode(mode) {
    const isMissed = mode === 'MISSED';
    document.getElementById('trade-is-missed').value = isMissed ? 'true' : 'false';

    const execBtn = document.getElementById('tab-mode-executed');
    const missedBtn = document.getElementById('tab-mode-missed');
    const execSection = document.getElementById('section-executed-results');
    const missedSection = document.getElementById('section-missed-results');

    if (isMissed) {
      missedBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold text-white bg-amber-600 shadow-sm transition';
      execBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition';
      execSection.classList.add('hidden');
      missedSection.classList.remove('hidden');
    } else {
      execBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold text-white bg-indigo-600 shadow-sm transition';
      missedBtn.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition';
      execSection.classList.remove('hidden');
      missedSection.classList.add('hidden');
    }
    updateModalDailyLimitWarning();
  }

  function setDirection(dir) {
    const longBtn = document.getElementById('btn-dir-long');
    const shortBtn = document.getElementById('btn-dir-short');
    if (dir === 'LONG') {
      longBtn.classList.add('active');
      shortBtn.classList.remove('active');
    } else {
      shortBtn.classList.add('active');
      longBtn.classList.remove('active');
    }
  }

  function setRuleDiscipline(followed) {
    const btnFollowed = document.getElementById('btn-rule-followed');
    const btnBroken = document.getElementById('btn-rule-broken');
    const mistakesContainer = document.getElementById('mistakes-container');

    if (followed) {
      btnFollowed.classList.add('active');
      btnBroken.classList.remove('active');
      mistakesContainer.classList.add('hidden');
      activeMistakes.clear();
      document.querySelectorAll('#mistake-chips .chip-btn').forEach(btn => btn.classList.remove('active'));
    } else {
      btnBroken.classList.add('active');
      btnFollowed.classList.remove('active');
      mistakesContainer.classList.remove('hidden');
    }
  }

  function selectStrategy(strategyName) {
    document.getElementById('input-trade-strategy').value = strategyName;
    document.querySelectorAll('#strategy-chips .chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === strategyName);
    });
  }

  function selectEmotion(emotionName) {
    document.getElementById('input-trade-emotion').value = emotionName;
    document.querySelectorAll('#emotion-chips .chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === emotionName);
    });
  }

  // Handle Form Submit
  function handleTradeFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('trade-id').value || 'tr_' + Date.now();
    const existingTrade = trades.find(t => t.id === id) || null;
    const isMissed = document.getElementById('trade-is-missed').value === 'true';
    const tradeNum = existingTrade ? existingTrade.tradeNum : getNextTradeNum();

    const symbol = document.getElementById('input-trade-symbol').value.trim().toUpperCase();
    const isLong = document.getElementById('btn-dir-long').classList.contains('active');
    const direction = isLong ? 'LONG' : 'SHORT';
    const strategy = document.getElementById('input-trade-strategy').value;
    const emotion = document.getElementById('input-trade-emotion').value;
    const notes = document.getElementById('input-trade-notes').value.trim();

    const cleanCharts = currentCharts
      .map((c, idx) => ({
        id: c.id || `ch_${Date.now()}_${idx}`,
        label: (c.label || (idx === 0 ? 'Entry / Setup' : `After / Chart ${idx + 1}`)).trim(),
        screenshot: (c.screenshot && typeof c.screenshot === 'string' && c.screenshot.startsWith('data:')) ? c.screenshot : '',
        chartUrl: (c.chartUrl && typeof c.chartUrl === 'string') ? c.chartUrl : '',
        addedAt: c.addedAt || new Date().toISOString()
      }))
      .filter(c => c.screenshot || c.chartUrl);

    let tradeObj = {
      id,
      tradeNum,
      date: (existingTrade && existingTrade.date) ? existingTrade.date : new Date().toISOString(),
      symbol,
      direction,
      strategy,
      emotion,
      notes,
      charts: cleanCharts,
      isMissed
    };
    syncLegacyChartFields(tradeObj);

    if (isMissed) {
      // Missed trade details
      const activeMissedOutcome = document.querySelector('.missed-outcome-chip.active')?.dataset.val || 'WIN';
      const missedPnL = parseFloat(document.getElementById('input-missed-pnl').value) || 0;
      const missedR = parseFloat(document.getElementById('input-missed-r').value) || 0;
      const missedReason = document.querySelector('#missed-reason-chips .chip-btn.active')?.dataset.val || 'Hesitation / Fear';

      tradeObj = Object.assign(tradeObj, {
        outcome: 'MISSED',
        missedOutcome: activeMissedOutcome,
        missedPnL,
        missedR,
        missedReason,
        planFollowed: false
      });
    } else {
      // Executed trade details
      const outcome = document.querySelector('.outcome-chip.active')?.dataset.val || 'WIN';
      const pnlInput = parseFloat(document.getElementById('input-quick-pnl').value) || 0;
      const rInput = parseFloat(document.getElementById('input-quick-r').value) || 0;
      const riskInput = parseFloat(document.getElementById('input-quick-risk').value) || 0;

      // Optional detailed prices
      const entryPrice = parseFloat(document.getElementById('input-det-entry').value) || null;
      const stopLoss = parseFloat(document.getElementById('input-det-sl').value) || null;
      const exitPrice = parseFloat(document.getElementById('input-det-exit').value) || null;
      const quantity = parseFloat(document.getElementById('input-det-qty').value) || null;

      const planFollowed = document.getElementById('btn-rule-followed').classList.contains('active');
      const mistakes = Array.from(activeMistakes);

      tradeObj = Object.assign(tradeObj, {
        outcome,
        realizedPnL: pnlInput,
        realizedR: rInput,
        plannedRisk: riskInput,
        entryPrice,
        stopLoss,
        exitPrice,
        quantity,
        planFollowed,
        mistakes
      });
    }

    const existingIndex = trades.findIndex(t => t.id === id);
    if (existingIndex >= 0) {
      trades[existingIndex] = tradeObj;
      GoogleDriveSync.showToast(`Updated entry for ${symbol}`, 'success');
    } else {
      trades.push(tradeObj);
      GoogleDriveSync.showToast(`Logged Trade #${tradeNum} of 100!`, 'success');
    }

    if (typeof TradeStorage !== 'undefined') {
      if (cleanCharts.length > 0) {
        TradeStorage.saveTradeCharts(id, cleanCharts, tradeNum);
      } else {
        TradeStorage.deleteScreenshot(id, tradeNum);
      }
    }
    saveTrades(true);
    closeTradeModal();
  }

  function deleteTrade(id) {
    const tradeToDelete = trades.find(t => t.id === id);
    if (tradeToDelete && typeof TradeStorage !== 'undefined') {
      TradeStorage.deleteScreenshot(tradeToDelete.id, tradeToDelete.tradeNum);
    }
    trades = trades.filter(t => t.id !== id);
    saveTrades(true);
    GoogleDriveSync.showToast('Trade deleted', 'info');
    closeTradeModal();
  }

  // Load realistic demo trades to preview the 100-trade baseline & psychology review
  function loadDemoTrades() {
    trades = [
      {
        id: 'demo_1', tradeNum: 1, date: '2026-10-20T09:40', symbol: 'BTCUSDT', direction: 'LONG',
        outcome: 'WIN', realizedPnL: 380, realizedR: 2.5, plannedRisk: 150, strategy: 'Liquidity Sweep / FVG',
        planFollowed: true, emotion: 'Calm & Patient', mistakes: [], notes: 'Clean 15m sweep at NY open. Followed rules 100%.'
      },
      {
        id: 'demo_2', tradeNum: 2, date: '2026-10-21T10:15', symbol: 'NVDA', direction: 'LONG',
        outcome: 'LOSS', realizedPnL: -150, realizedR: -1.0, plannedRisk: 150, strategy: 'Breakout & Retest',
        planFollowed: true, emotion: 'Confident / Focused', mistakes: [], notes: 'Good trade, breakout failed, stop respected without emotion.'
      },
      {
        id: 'demo_3', tradeNum: 3, date: '2026-10-22T14:10', symbol: 'NQ', direction: 'SHORT',
        outcome: 'LOSS', realizedPnL: -320, realizedR: -2.1, plannedRisk: 150, strategy: 'Order Block / S&D',
        planFollowed: false, emotion: 'Frustrated / Revenge', mistakes: ['Moved Stop Loss', 'Revenge Trade'],
        notes: 'Violated rules: moved stop loss mid-trade during chop. Costly mistake.'
      },
      {
        id: 'demo_4', tradeNum: 4, date: '2026-10-24T11:00', symbol: 'ETHUSDT', direction: 'LONG',
        outcome: 'WIN', realizedPnL: 450, realizedR: 3.0, plannedRisk: 150, strategy: 'Trend Pullback (EMA)',
        planFollowed: true, emotion: 'Calm & Patient', mistakes: [], notes: 'Rode 4h trend pullback straight to target.'
      },
      {
        id: 'demo_5', tradeNum: 5, date: '2026-10-25T09:30', symbol: 'ES', direction: 'LONG',
        isMissed: true, outcome: 'MISSED', missedOutcome: 'WIN', missedPnL: 350, missedR: 2.3,
        strategy: 'Opening Range (ORB)', emotion: 'Hesitation / Fear', missedReason: 'Hesitation / Fear',
        notes: 'Hesitated on the trigger after previous loss. Missed an easy 2.3R winner.'
      },
      {
        id: 'demo_6', tradeNum: 6, date: '2026-10-28T13:45', symbol: 'SOLUSDT', direction: 'LONG',
        outcome: 'WIN', realizedPnL: 520, realizedR: 3.5, plannedRisk: 150, strategy: 'Breakout & Retest',
        planFollowed: true, emotion: 'Calm & Patient', mistakes: [], notes: 'Waited patiently for 1h candle close. Perfect execution.'
      },
      {
        id: 'demo_7', tradeNum: 7, date: '2026-10-30T10:00', symbol: 'EURUSD', direction: 'SHORT',
        outcome: 'LOSS', realizedPnL: -180, realizedR: -1.2, plannedRisk: 150, strategy: 'Liquidity Sweep / FVG',
        planFollowed: false, emotion: 'Greed / FOMO', mistakes: ['FOMO / Chased Entry'],
        notes: 'Jumped in late after candle was already extended 12 pips.'
      }
    ];

    saveTrades(true);
    GoogleDriveSync.showToast('Loaded sample trades to preview analytics!', 'success');
  }

  // Bind all UI events
  function bindEvents() {
    // Nav tabs (Desktop and Mobile) using module-level NAV_TABS & switchTab
    NAV_TABS.forEach(tab => {
      const desktopBtn = document.getElementById(tab.btn);
      if (desktopBtn) desktopBtn.addEventListener('click', () => switchTab(tab.view));

      const mobBtn = document.getElementById(tab.mobBtn);
      if (mobBtn) mobBtn.addEventListener('click', () => switchTab(tab.view));
    });

    // Background sync when returning to this browser tab/window (keeps Daily Limits synced across browsers)
    function triggerBackgroundSyncIfIdle() {
      const modalTradeOpen = !document.getElementById('modal-trade')?.classList.contains('hidden');
      const modalSettingsOpen = !document.getElementById('modal-settings')?.classList.contains('hidden');
      if (modalTradeOpen || modalSettingsOpen) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (typeof GoogleDriveSync !== 'undefined' && GoogleDriveSync.syncIfStale) {
        GoogleDriveSync.syncIfStale(5000);
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') triggerBackgroundSyncIfIdle();
    });
    window.addEventListener('focus', triggerBackgroundSyncIfIdle);

    const mobLogBtn = document.getElementById('mobile-btn-log-trade');
    if (mobLogBtn) mobLogBtn.addEventListener('click', () => openTradeModal());

    // Top buttons
    document.getElementById('btn-open-new-trade').addEventListener('click', () => openTradeModal());
    document.getElementById('header-gdrive-pill').addEventListener('click', () => {
      if (GoogleDriveSync.hasWebhook() || GoogleDriveSync.isAuthenticated()) {
        GoogleDriveSync.smartSync({ notify: true, silentIfEmpty: false });
      } else {
        document.getElementById('nav-btn-gdrive').click();
      }
    });
    document.getElementById('btn-backup-drive').addEventListener('click', () => GoogleDriveSync.smartSync({ notify: true, silentIfEmpty: false }));
    document.getElementById('btn-export-csv').addEventListener('click', () => GoogleDriveSync.exportCsv(trades));

    // Export & Import JSON Backup Buttons
    const exportJsonBtn = document.getElementById('btn-export-json');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => GoogleDriveSync.exportJson(trades));
    }
    const syncExportJsonBtn = document.getElementById('btn-sync-export-json');
    if (syncExportJsonBtn) {
      syncExportJsonBtn.addEventListener('click', () => GoogleDriveSync.exportJson(trades));
    }
    const importJsonInput = document.getElementById('file-import-json');
    const importJsonBtn = document.getElementById('btn-import-json');
    if (importJsonBtn && importJsonInput) {
      importJsonBtn.addEventListener('click', () => importJsonInput.click());
      importJsonInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          GoogleDriveSync.importJson(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    document.getElementById('btn-load-samples').addEventListener('click', () => {
      if (confirm('Load demo trades to preview analytics?')) loadDemoTrades();
    });

    // Theme Toggle Button
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
    }

    // Lock Button
    const lockBtn = document.getElementById('btn-lock-journal');
    if (lockBtn) {
      lockBtn.addEventListener('click', lockJournal);
    }

    // Login Form Submit
    const loginForm = document.getElementById('form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', handleLoginSubmit);
    }

    // Toggle show/hide password
    const togglePassBtn = document.getElementById('btn-toggle-show-passcode');
    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', () => {
        const passInput = document.getElementById('input-login-passcode');
        const eyeIcon = document.getElementById('icon-eye-login');
        if (passInput.type === 'password') {
          passInput.type = 'text';
          eyeIcon.setAttribute('data-lucide', 'eye-off');
        } else {
          passInput.type = 'password';
          eyeIcon.setAttribute('data-lucide', 'eye');
        }
        lucide.createIcons();
      });
    }

    // Reset Passcode from Login Screen
    const resetLoginBtn = document.getElementById('btn-reset-login-passcode');
    if (resetLoginBtn) {
      resetLoginBtn.addEventListener('click', resetPasscode);
    }

    // Update Passcode from Settings Modal
    const savePasscodeBtn = document.getElementById('btn-save-new-passcode');
    if (savePasscodeBtn) {
      savePasscodeBtn.addEventListener('click', () => {
        const newPin = document.getElementById('setting-new-passcode').value;
        updatePasscode(newPin);
      });
    }

    // Empty state
    const emptyAdd = document.getElementById('btn-empty-add-trade');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openTradeModal());
    const emptySync = document.getElementById('btn-empty-sync-sheet');
    if (emptySync) emptySync.addEventListener('click', () => GoogleDriveSync.smartSync({ notify: true, silentIfEmpty: false }));
    const emptyDemo = document.getElementById('btn-empty-demo');
    if (emptyDemo) emptyDemo.addEventListener('click', () => loadDemoTrades());

    // Settings Modal & Inline Daily Limit Controls
    const settingsModal = document.getElementById('modal-settings');
    document.getElementById('btn-open-settings').addEventListener('click', () => {
      syncLimitInputs();
      settingsModal.classList.remove('hidden');
      settingsModal.classList.add('flex');
    });
    document.getElementById('btn-close-settings-modal').addEventListener('click', () => {
      settingsModal.classList.add('hidden');
      settingsModal.classList.remove('flex');
      saveSettings('settings', { onlyIfChanged: true });
    });

    const btnLimitsUpdateScript = document.getElementById('btn-limits-update-script');
    if (btnLimitsUpdateScript) {
      btnLimitsUpdateScript.addEventListener('click', () => GoogleDriveSync.openAppsScriptModal());
    }

    const btnSaveDailyLimits = document.getElementById('btn-save-daily-limits');
    if (btnSaveDailyLimits) {
      btnSaveDailyLimits.addEventListener('click', () => saveSettings('analytics'));
    }

    [
      { ids: ['analytics-daily-loss-limit', 'analytics-daily-trade-limit'], source: 'analytics' },
      { ids: ['setting-initial-balance', 'setting-daily-loss-limit', 'setting-daily-trade-limit'], source: 'settings' }
    ].forEach(({ ids, source }) => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => saveSettings(source, { onlyIfChanged: true }));
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveSettings(source, { onlyIfChanged: true });
          }
        });
      });
    });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
      if (confirm('Delete all trades and reset to Trade #1?')) {
        trades = [];
        saveTrades(true);
        settingsModal.classList.add('hidden');
        settingsModal.classList.remove('flex');
        GoogleDriveSync.showToast('All trades reset. Ready for Trade #1.', 'info');
      }
    });

    // Modal controls
    document.getElementById('btn-close-trade-modal').addEventListener('click', closeTradeModal);
    document.getElementById('btn-cancel-trade').addEventListener('click', closeTradeModal);
    document.getElementById('form-trade').addEventListener('submit', handleTradeFormSubmit);
    document.getElementById('btn-delete-trade').addEventListener('click', () => {
      const id = document.getElementById('trade-id').value;
      if (id && confirm('Delete this trade?')) deleteTrade(id);
    });

    // Mode Switcher (Executed vs Missed)
    document.getElementById('tab-mode-executed').addEventListener('click', () => setTradeMode('EXECUTED'));
    document.getElementById('tab-mode-missed').addEventListener('click', () => setTradeMode('MISSED'));

    // Direction Toggle
    document.getElementById('btn-dir-long').addEventListener('click', () => setDirection('LONG'));
    document.getElementById('btn-dir-short').addEventListener('click', () => setDirection('SHORT'));

    // Quick symbol chips
    document.querySelectorAll('.quick-symbol').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('input-trade-symbol').value = chip.textContent.trim();
      });
    });

    // Outcome Chips
    document.querySelectorAll('.outcome-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.outcome-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        // Suggest PnL sign
        const pnlInput = document.getElementById('input-quick-pnl');
        if (chip.dataset.val === 'LOSS' && parseFloat(pnlInput.value) > 0) {
          pnlInput.value = -Math.abs(parseFloat(pnlInput.value));
        } else if (chip.dataset.val === 'WIN' && parseFloat(pnlInput.value) < 0) {
          pnlInput.value = Math.abs(parseFloat(pnlInput.value));
        }
      });
    });

    // Missed Outcome Chips
    document.querySelectorAll('.missed-outcome-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.missed-outcome-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Missed Reason Chips
    document.querySelectorAll('#missed-reason-chips .chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#missed-reason-chips .chip-btn').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Optional Detailed Prices Accordion
    document.getElementById('btn-toggle-detailed-prices').addEventListener('click', () => {
      const box = document.getElementById('detailed-prices-box');
      box.classList.toggle('hidden');
    });

    // Auto calculate if detailed prices entered
    ['input-det-entry', 'input-det-sl', 'input-det-exit', 'input-det-qty'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        const entry = parseFloat(document.getElementById('input-det-entry').value) || 0;
        const sl = parseFloat(document.getElementById('input-det-sl').value) || 0;
        const exit = parseFloat(document.getElementById('input-det-exit').value) || 0;
        const qty = parseFloat(document.getElementById('input-det-qty').value) || 0;
        const isLong = document.getElementById('btn-dir-long').classList.contains('active');

        if (entry > 0 && exit > 0 && qty > 0) {
          const pnl = isLong ? (exit - entry) * qty : (entry - exit) * qty;
          document.getElementById('input-quick-pnl').value = Math.round(pnl * 100) / 100;

          if (sl > 0) {
            const risk = Math.abs(entry - sl) * qty;
            document.getElementById('input-quick-risk').value = Math.round(risk * 100) / 100;
            if (risk > 0) {
              document.getElementById('input-quick-r').value = (pnl / risk).toFixed(1);
            }
          }

          // Outcome chip auto-select
          document.querySelectorAll('.outcome-chip').forEach(c => {
            if (pnl > 0 && c.dataset.val === 'WIN') c.classList.add('active');
            else if (pnl < 0 && c.dataset.val === 'LOSS') c.classList.add('active');
            else if (pnl === 0 && c.dataset.val === 'BE') c.classList.add('active');
            else c.classList.remove('active');
          });
        }
      });
    });

    // Strategy Chips
    document.querySelectorAll('#strategy-chips .chip-btn').forEach(chip => {
      chip.addEventListener('click', () => selectStrategy(chip.dataset.val));
    });

    // Rule Followed vs Broken
    document.getElementById('btn-rule-followed').addEventListener('click', () => setRuleDiscipline(true));
    document.getElementById('btn-rule-broken').addEventListener('click', () => setRuleDiscipline(false));

    // Mistake chips (Multi-select)
    document.querySelectorAll('#mistake-chips .chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.val;
        if (activeMistakes.has(val)) {
          activeMistakes.delete(val);
          chip.classList.remove('active');
        } else {
          activeMistakes.add(val);
          chip.classList.add('active');
        }
      });
    });

    // Emotion chips
    document.querySelectorAll('#emotion-chips .chip-btn').forEach(chip => {
      chip.addEventListener('click', () => selectEmotion(chip.dataset.val));
    });

    // Lightbox Close & Multi-Chart Navigation
    document.getElementById('btn-close-lightbox').addEventListener('click', closeLightbox);
    document.getElementById('modal-lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'modal-lightbox') closeLightbox();
    });
    ['btn-lightbox-prev', 'btn-lightbox-prev-overlay'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
    });
    ['btn-lightbox-next', 'btn-lightbox-next-overlay'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });
    });
    document.addEventListener('keydown', (e) => {
      const lightbox = document.getElementById('modal-lightbox');
      if (!lightbox || lightbox.classList.contains('hidden')) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });

    // Filter controls
    document.getElementById('filter-search').addEventListener('input', (e) => {
      currentFilter.search = e.target.value;
      renderTable();
    });
    document.getElementById('filter-type').addEventListener('change', (e) => {
      currentFilter.type = e.target.value;
      renderTable();
    });
    document.getElementById('filter-outcome').addEventListener('change', (e) => {
      currentFilter.outcome = e.target.value;
      renderTable();
    });
    document.getElementById('filter-plan').addEventListener('change', (e) => {
      currentFilter.plan = e.target.value;
      renderTable();
    });

    // Chart mode toggle
    document.getElementById('btn-chart-mode-dollar').addEventListener('click', () => {
      chartMode = 'dollar';
      document.getElementById('btn-chart-mode-dollar').className = 'px-3 py-1 rounded-lg font-medium bg-indigo-600 text-white transition';
      document.getElementById('btn-chart-mode-r').className = 'px-3 py-1 rounded-lg font-medium bg-slate-800 text-slate-400 hover:text-white transition';
      renderEquityCurve();
    });
    document.getElementById('btn-chart-mode-r').addEventListener('click', () => {
      chartMode = 'r';
      document.getElementById('btn-chart-mode-r').className = 'px-3 py-1 rounded-lg font-medium bg-indigo-600 text-white transition';
      document.getElementById('btn-chart-mode-dollar').className = 'px-3 py-1 rounded-lg font-medium bg-slate-800 text-slate-400 hover:text-white transition';
      renderEquityCurve();
    });

    // Google Drive Sync Tab Controls
    document.getElementById('btn-gdrive-connect').addEventListener('click', () => GoogleDriveSync.connect());
    document.getElementById('btn-gdrive-sync-now').addEventListener('click', () => GoogleDriveSync.syncToDrive());
    document.getElementById('btn-gdrive-pull-now').addEventListener('click', () => GoogleDriveSync.pullFromDrive());

    document.getElementById('btn-save-client-id').addEventListener('click', () => {
      const val = document.getElementById('input-gdrive-client-id').value;
      GoogleDriveSync.setClientId(val);
    });

    document.getElementById('btn-save-webhook-url').addEventListener('click', () => {
      const val = document.getElementById('input-sheet-webhook-url').value;
      GoogleDriveSync.setWebhookUrl(val);
    });

    const copyMultiBtn = document.getElementById('btn-copy-multibrowser-link');
    if (copyMultiBtn) {
      copyMultiBtn.addEventListener('click', () => {
        const url = GoogleDriveSync.getWebhookUrl();
        if (!url) {
          GoogleDriveSync.showToast('Please enter and save your Webhook URL first.', 'error');
          return;
        }
        const fullLink = window.location.origin + window.location.pathname + '?webhook=' + encodeURIComponent(url);
        navigator.clipboard.writeText(fullLink).then(() => {
          GoogleDriveSync.showToast('Copied Multi-Browser link! Open this link on any browser to connect automatically.', 'success');
        });
      });
    }

    document.getElementById('btn-view-apps-script').addEventListener('click', () => {
      GoogleDriveSync.openAppsScriptModal();
    });

    const closeScriptModalBtn = document.getElementById('btn-close-apps-script-modal');
    if (closeScriptModalBtn) {
      closeScriptModalBtn.addEventListener('click', () => GoogleDriveSync.closeAppsScriptModal());
    }

    const quickRestoreBtn = document.getElementById('btn-quick-restore-trade1');
    if (quickRestoreBtn) {
      quickRestoreBtn.addEventListener('click', () => GoogleDriveSync.restoreTrade1Directly());
    }

    const copyScriptBtn = document.getElementById('btn-copy-script-code');
    if (copyScriptBtn) {
      copyScriptBtn.addEventListener('click', () => {
        const area = document.getElementById('apps-script-code-area');
        if (area && area.value) {
          navigator.clipboard.writeText(area.value).then(() => {
            const btnText = document.getElementById('btn-copy-script-text');
            if (btnText) btnText.textContent = 'Copied!';
            GoogleDriveSync.showToast('Copied script code to clipboard!', 'success');
            setTimeout(() => { if (btnText) btnText.textContent = 'Copy Script Code'; }, 2000);
          });
        }
      });
    }

    const testConnBtn = document.getElementById('btn-test-sheet-connection');
    if (testConnBtn) {
      testConnBtn.addEventListener('click', () => GoogleDriveSync.testSheetConnection());
    }
  }

  return {
    init,
    getTrades: () => trades,
    setTrades: (newTrades) => {
      trades = Array.isArray(newTrades) ? newTrades.map(t => syncLegacyChartFields(Object.assign({}, t))) : [];
      saveTrades(false);
      hydrateScreenshots();
    },
    normalizeTradeCharts,
    syncLegacyChartFields,
    calculateStats,
    getSettings: () => Object.assign({}, settings),
    applyRemoteSettings,
    updateLimitsSyncBadge
  };
})();

// Start App when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  TradeApp.init();
});
