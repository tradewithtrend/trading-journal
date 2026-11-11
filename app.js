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

  async function saveScreenshot(tradeId, screenshotBase64, tradeNum = null) {
    if (!screenshotBase64) return;
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(STORE_SCREENSHOTS, 'readwrite');
      const store = tx.objectStore(STORE_SCREENSHOTS);

      const now = Date.now();
      if (tradeId) {
        store.put({
          key: String(tradeId),
          tradeId: String(tradeId),
          tradeNum: tradeNum ? parseInt(tradeNum, 10) : null,
          screenshot: screenshotBase64,
          updatedAt: now
        });
      }
      if (tradeNum) {
        store.put({
          key: `num_${tradeNum}`,
          tradeId: tradeId ? String(tradeId) : '',
          tradeNum: parseInt(tradeNum, 10),
          screenshot: screenshotBase64,
          updatedAt: now
        });
      }
    } catch (err) {
      console.warn('TradeStorage saveScreenshot error:', err);
    }
  }

  async function getScreenshot(tradeId, tradeNum = null) {
    try {
      const db = await getDB();
      if (!db) return null;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_SCREENSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SCREENSHOTS);

        if (tradeId) {
          const req1 = store.get(String(tradeId));
          req1.onsuccess = function() {
            if (req1.result && req1.result.screenshot) {
              return resolve(req1.result.screenshot);
            }
            if (tradeNum) {
              const req2 = store.get(`num_${tradeNum}`);
              req2.onsuccess = function() {
                resolve(req2.result && req2.result.screenshot ? req2.result.screenshot : null);
              };
              req2.onerror = () => resolve(null);
            } else {
              resolve(null);
            }
          };
          req1.onerror = () => resolve(null);
        } else if (tradeNum) {
          const req2 = store.get(`num_${tradeNum}`);
          req2.onsuccess = function() {
            resolve(req2.result && req2.result.screenshot ? req2.result.screenshot : null);
          };
          req2.onerror = () => resolve(null);
        } else {
          resolve(null);
        }
      });
    } catch (err) {
      console.warn('TradeStorage getScreenshot error:', err);
      return null;
    }
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
  };

  // Active filter state
  let currentFilter = {
    search: '',
    type: 'ALL', // 'ALL', 'EXECUTED', 'MISSED'
    outcome: 'ALL',
    plan: 'ALL'
  };

  // Form state
  let currentScreenshot = '';
  let activeMistakes = new Set();
  let chartMode = 'dollar'; // 'dollar' or 'r'

  // Chart instances
  let equityChart = null;
  let strategyChart = null;
  let disciplineChart = null;
  let marketChart = null;

  // Initialize
  async function init() {
    initTheme();
    initAuth();
    loadSettings();
    await loadTrades();
    bindEvents();
    bindPasteAndUpload();
    GoogleDriveSync.init();
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

  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        settings = Object.assign(settings, JSON.parse(saved));
      }
      const balanceInput = document.getElementById('setting-initial-balance');
      if (balanceInput) balanceInput.value = settings.initialBalance;
    } catch (e) {
      console.warn('Could not load settings:', e);
    }
  }

  function saveSettings() {
    const balanceInput = document.getElementById('setting-initial-balance');
    if (balanceInput) settings.initialBalance = parseFloat(balanceInput.value) || 10000;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    GoogleDriveSync.showToast('Settings saved', 'success');
    renderKPIs();
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

  async function hydrateScreenshots() {
    if (typeof TradeStorage === 'undefined') return;
    let anyHydrated = false;
    for (const t of trades) {
      if (!t.screenshot) {
        const img = await TradeStorage.getScreenshot(t.id, t.tradeNum);
        if (img) {
          t.screenshot = img;
          t.hasScreenshot = true;
          anyHydrated = true;
        }
      } else {
        t.hasScreenshot = true;
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
    const formattedPnL = (stats.netPnL >= 0 ? '+$' : '-$') + Math.abs(stats.netPnL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    costBrokenEl.textContent = stats.costOfBrokenRules > 0 ? `-$${Math.round(stats.costOfBrokenRules).toLocaleString()}` : '$0.00';
    costBrokenEl.className = `text-2xl font-black ${stats.costOfBrokenRules > 0 ? 'text-rose-400' : 'text-slate-400'}`;
    
    const topMistakeEl = document.getElementById('kpi-top-mistake');
    topMistakeEl.textContent = stats.topMistake;
    topMistakeEl.title = stats.topMistake;

    // Card 6: Missed Trades
    document.getElementById('kpi-missed-count').textContent = stats.missedTradesCount;
    document.getElementById('kpi-missed-pnl').textContent = (stats.missedTradesPotentialPnL >= 0 ? '+$' : '-$') + Math.abs(Math.round(stats.missedTradesPotentialPnL)).toLocaleString();

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
          ${(t.screenshot || t.chartUrl || t.hasScreenshot) ? `
            <button type="button" class="btn-preview-thumb p-1 rounded-md hover:bg-slate-700 text-indigo-400 transition" data-id="${t.id}" data-num="${t.tradeNum}" title="Click to view chart screenshot">
              <i data-lucide="image" class="w-4 h-4"></i>
            </button>
          ` : '<span class="text-slate-600">-</span>'}
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
        let img = trade ? trade.screenshot : null;
        if (!img && typeof TradeStorage !== 'undefined') {
          img = await TradeStorage.getScreenshot(tradeId, tradeNum);
          if (trade && img) {
            trade.screenshot = img;
            trade.hasScreenshot = true;
          }
        }
        const driveUrl = trade ? (trade.chartUrl || '') : '';
        if (img) {
          openLightbox(img, `${trade ? trade.symbol : 'Trade'} (${trade ? trade.direction : ''}) — Trade #${trade ? trade.tradeNum : tradeNum}`, driveUrl);
        } else if (driveUrl) {
          const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          const directImg = fileIdMatch ? `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}` : driveUrl;
          openLightbox(directImg, `${trade ? trade.symbol : 'Trade'} (${trade ? trade.direction : ''}) — Trade #${trade ? trade.tradeNum : tradeNum}`, driveUrl);
        } else {
          GoogleDriveSync.showToast('Chart screenshot not found.', 'info');
        }
      });
    });

    lucide.createIcons();
  }

  // Render Charts in Analytics Tab
  function renderCharts() {
    renderEquityCurve();
    renderStrategyChart();
    renderDisciplineChart();
    renderPsychologyChart();
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
                return chartMode === 'r'
                  ? `Cumulative: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)}R`
                  : `Cumulative: ${context.parsed.y >= 0 ? '+$' : '-$'}${Math.abs(context.parsed.y).toLocaleString()}`;
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
                return chartMode === 'r' ? `${value}R` : `$${value}`;
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
    const data = labels.map(l => Math.round(stratMap[l]));
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
          x: { grid: { color: gridColor }, ticks: { color: '#64748B', font: { size: 9 } } },
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
          data: [Math.round(planYesPnL), Math.round(planNoPnL)],
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
          y: { grid: { color: gridColor }, ticks: { color: '#64748B', font: { size: 9 } } }
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

  // COPY-PASTE SCREENSHOT & UPLOAD ENGINE
  function bindPasteAndUpload() {
    const dropzone = document.getElementById('screenshot-dropzone');
    const fileInput = document.getElementById('file-screenshot-input');
    const modal = document.getElementById('modal-trade');

    // 1. Global Clipboard Paste Listener (Ctrl + V anywhere when modal is open)
    window.addEventListener('paste', function(e) {
      if (modal.classList.contains('hidden')) return;

      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          processScreenshotFile(blob);
          GoogleDriveSync.showToast('Screenshot pasted from clipboard!', 'success');
          e.preventDefault();
          break;
        }
      }
    });

    // 2. Dropzone Click to Browse
    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-remove-screenshot') || e.target.closest('#btn-view-screenshot-fullscreen')) {
        return;
      }
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (fileInput.files && fileInput.files[0]) {
        processScreenshotFile(fileInput.files[0]);
      }
    });

    // 3. Drag and Drop onto Dropzone
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
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processScreenshotFile(e.dataTransfer.files[0]);
      }
    });

    // 4. Remove Screenshot Button
    document.getElementById('btn-remove-screenshot').addEventListener('click', (e) => {
      e.stopPropagation();
      clearScreenshot();
    });

    // 5. Fullscreen Preview from Modal
    document.getElementById('btn-view-screenshot-fullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentScreenshot) {
        openLightbox(currentScreenshot, 'Pasted Trade Chart Screenshot');
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
        setScreenshot(compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setScreenshot(base64) {
    currentScreenshot = base64;
    document.getElementById('trade-screenshot-data').value = base64;
    document.getElementById('screenshot-preview-img').src = base64;
    document.getElementById('dropzone-empty-state').classList.add('hidden');
    document.getElementById('dropzone-preview-state').classList.remove('hidden');
    document.getElementById('dropzone-preview-state').classList.add('flex');
    document.getElementById('screenshot-dropzone').classList.add('has-image');
  }

  function clearScreenshot() {
    currentScreenshot = '';
    document.getElementById('trade-screenshot-data').value = '';
    document.getElementById('screenshot-preview-img').src = '';
    document.getElementById('dropzone-empty-state').classList.remove('hidden');
    document.getElementById('dropzone-preview-state').classList.add('hidden');
    document.getElementById('dropzone-preview-state').classList.remove('flex');
    document.getElementById('screenshot-dropzone').classList.remove('has-image');
  }

  // Lightbox Modal Controller
  function openLightbox(imgSrc, caption = '', externalUrl = '') {
    const lightbox = document.getElementById('modal-lightbox');
    const imgEl = document.getElementById('lightbox-img');
    const capEl = document.getElementById('lightbox-caption');
    const driveLink = document.getElementById('lightbox-drive-link');

    imgEl.src = imgSrc;
    capEl.textContent = caption;

    if (driveLink) {
      if (externalUrl) {
        driveLink.href = externalUrl;
        driveLink.classList.remove('hidden');
      } else {
        driveLink.classList.add('hidden');
      }
    }

    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
    if (typeof lucide !== 'undefined') lucide.createIcons();
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

      // Screenshot
      if (trade.screenshot) {
        setScreenshot(trade.screenshot);
      } else if (trade.chartUrl) {
        const fileIdMatch = trade.chartUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const directImg = fileIdMatch ? `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}` : trade.chartUrl;
        setScreenshot(directImg);
      } else if ((trade.hasScreenshot || trade.tradeNum) && typeof TradeStorage !== 'undefined') {
        TradeStorage.getScreenshot(trade.id, trade.tradeNum).then(img => {
          if (img) {
            trade.screenshot = img;
            trade.hasScreenshot = true;
            setScreenshot(img);
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

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('input-trade-symbol').focus();
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

    let screenshot = '';
    let chartUrl = '';
    if (currentScreenshot) {
      if (currentScreenshot.startsWith('https://lh3.googleusercontent.com') || currentScreenshot.startsWith('https://drive.google.com')) {
        screenshot = existingTrade ? (existingTrade.screenshot || '') : '';
        chartUrl = existingTrade ? (existingTrade.chartUrl || currentScreenshot) : currentScreenshot;
      } else if (currentScreenshot.startsWith('data:')) {
        screenshot = currentScreenshot;
        chartUrl = (existingTrade && currentScreenshot === existingTrade.screenshot)
          ? (existingTrade.chartUrl || '')
          : '';
      } else {
        screenshot = existingTrade ? (existingTrade.screenshot || '') : '';
        chartUrl = currentScreenshot;
      }
    }

    let tradeObj = {
      id,
      tradeNum,
      date: (existingTrade && existingTrade.date) ? existingTrade.date : new Date().toISOString(),
      symbol,
      direction,
      strategy,
      emotion,
      notes,
      screenshot,
      chartUrl,
      hasScreenshot: Boolean(screenshot || chartUrl),
      isMissed
    };

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

    saveTrades(true);
    if (typeof TradeStorage !== 'undefined') {
      if (screenshot && screenshot.startsWith('data:')) {
        TradeStorage.saveScreenshot(id, screenshot, tradeNum);
      } else if (!currentScreenshot) {
        TradeStorage.deleteScreenshot(id, tradeNum);
      }
    }
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
    // Nav tabs (Desktop and Mobile)
    const tabs = [
      { btn: 'nav-btn-trades', mobBtn: 'mobile-nav-btn-trades', view: 'view-trades' },
      { btn: 'nav-btn-analytics', mobBtn: 'mobile-nav-btn-analytics', view: 'view-analytics' },
      { btn: 'nav-btn-roadmap', mobBtn: 'mobile-nav-btn-roadmap', view: 'view-roadmap' },
      { btn: 'nav-btn-gdrive', mobBtn: 'mobile-nav-btn-gdrive', view: 'view-gdrive' },
    ];

    function switchTab(viewId) {
      sessionStorage.setItem('tj_active_view', viewId);
      tabs.forEach(t => {
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
          if (t.view === 'view-analytics') renderCharts();
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

    tabs.forEach(tab => {
      const desktopBtn = document.getElementById(tab.btn);
      if (desktopBtn) desktopBtn.addEventListener('click', () => switchTab(tab.view));

      const mobBtn = document.getElementById(tab.mobBtn);
      if (mobBtn) mobBtn.addEventListener('click', () => switchTab(tab.view));
    });

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

    // Settings Modal
    const settingsModal = document.getElementById('modal-settings');
    document.getElementById('btn-open-settings').addEventListener('click', () => {
      settingsModal.classList.remove('hidden');
      settingsModal.classList.add('flex');
    });
    document.getElementById('btn-close-settings-modal').addEventListener('click', () => {
      settingsModal.classList.add('hidden');
      settingsModal.classList.remove('flex');
      saveSettings();
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

    // Lightbox Close
    document.getElementById('btn-close-lightbox').addEventListener('click', closeLightbox);
    document.getElementById('modal-lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'modal-lightbox') closeLightbox();
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
      trades = newTrades;
      saveTrades(false);
      hydrateScreenshots();
    },
    calculateStats
  };
})();

// Start App when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  TradeApp.init();
});
