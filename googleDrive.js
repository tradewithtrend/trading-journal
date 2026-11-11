/**
 * Google Drive & Google Cloud Sync Engine
 * Handles Google Identity Services (GIS) OAuth2 token authentication,
 * Drive API v3 file search/upload/download, and Google Sheet Webhooks.
 */

const GoogleDriveSync = (function() {
  const STORAGE_KEY_TOKEN = 'tj_gdrive_access_token';
  const STORAGE_KEY_TOKEN_EXP = 'tj_gdrive_token_expires_at';
  const STORAGE_KEY_CLIENT_ID = 'tj_gdrive_client_id';
  const STORAGE_KEY_FILE_ID = 'tj_gdrive_file_id';
  const STORAGE_KEY_LAST_SYNC = 'tj_gdrive_last_sync';
  const STORAGE_KEY_WEBHOOK = 'tj_sheet_webhook_url';

  const DRIVE_FILE_NAME = 'Trading_Journal_100_Trades.json';
  const DRIVE_CSV_NAME = 'Trading_Journal_100_Trades.csv';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file';

  // Default Webhook URL (Bake your Google Apps Script URL here so ANY browser connects automatically!)
  const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbypofeTGIkqqx3_HstCLC5b3Ip0knZHQZs5PyD2-Wfn_hwad2HYww81mDbUsE4lweQ86A/exec';

  let tokenClient = null;
  let accessToken = localStorage.getItem(STORAGE_KEY_TOKEN) || null;
  let tokenExpiresAt = parseInt(localStorage.getItem(STORAGE_KEY_TOKEN_EXP) || '0', 10);
  let clientId = localStorage.getItem(STORAGE_KEY_CLIENT_ID) || '';
  let fileId = localStorage.getItem(STORAGE_KEY_FILE_ID) || null;
  let webhookUrl = localStorage.getItem(STORAGE_KEY_WEBHOOK) || DEFAULT_WEBHOOK_URL;

  // Initialize GIS Token Client
  function initClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      console.warn('Google Identity Services script not yet loaded.');
      return false;
    }
    if (!clientId) {
      return false;
    }

    try {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: handleTokenResponse,
      });
      return true;
    } catch (err) {
      console.error('Failed to init Google Token Client:', err);
      return false;
    }
  }

  function handleTokenResponse(response) {
    if (response.error !== undefined) {
      console.error('Google OAuth error:', response);
      showToast('Google Sign-In failed: ' + response.error, 'error');
      updateStatusUI('error', 'Auth Failed');
      return;
    }
    accessToken = response.access_token;
    // Set expiry 50 minutes from now (Google tokens last 60 mins)
    tokenExpiresAt = Date.now() + (parseInt(response.expires_in, 10) || 3600) * 1000 - 60000;
    localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEY_TOKEN_EXP, tokenExpiresAt.toString());

    showToast('Connected to Google Drive!', 'success');
    updateStatusUI('connected', 'Connected');
    
    // Automatically perform initial sync or check for existing file
    syncToDrive();
  }

  function isAuthenticated() {
    return accessToken && Date.now() < tokenExpiresAt;
  }

  function hasWebhook() {
    return Boolean(webhookUrl && webhookUrl.trim().length > 10);
  }

  function getWebhookUrl() {
    return webhookUrl;
  }

  function connect() {
    if (!clientId) {
      showToast('Please enter your Google OAuth Client ID in Settings first.', 'error');
      const gdriveSection = document.getElementById('view-gdrive');
      if (gdriveSection) {
        document.getElementById('nav-btn-gdrive').click();
        const input = document.getElementById('input-gdrive-client-id');
        if (input) input.focus();
      }
      return;
    }

    if (!tokenClient) {
      const initialized = initClient();
      if (!initialized) {
        showToast('Google API library is still loading. Please try again in 3 seconds.', 'error');
        return;
      }
    }

    tokenClient.requestAccessToken({ prompt: isAuthenticated() ? '' : 'consent' });
  }

  // Upload or update trades data into Google Drive
  async function syncToDrive(customData = null) {
    const trades = customData || TradeApp.getTrades();
    const payload = {
      meta: {
        app: '100 Trades Journal — Phase 1',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        totalTrades: trades.length,
        milestoneProgress: `${trades.length}/100`,
      },
      trades: trades,
      stats: TradeApp.calculateStats(trades)
    };

    let syncedAnywhere = false;

    // 1. If Webhook URL is set, send to Google Sheet webhook
    if (webhookUrl) {
      await syncToGoogleSheetWebhook(payload);
      syncedAnywhere = true;
    }

    // 2. If OAuth Drive is authenticated, upload JSON directly to Google Drive
    if (isAuthenticated()) {
      updateStatusUI('syncing', 'Syncing...');
      try {
        await saveJsonFileToDrive(payload);
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem(STORAGE_KEY_LAST_SYNC, nowStr);
        updateStatusUI('connected', 'Synced (' + nowStr + ')');
        showToast(`Synced ${trades.length} trade(s) to Google Drive!`, 'success');
        syncedAnywhere = true;
      } catch (err) {
        console.error('Error syncing to Google Drive:', err);
        updateStatusUI('error', 'Sync Error');
        showToast('Google Drive sync failed: ' + (err.message || 'Network error'), 'error');
      }
    }

    if (!syncedAnywhere && !isAuthenticated() && !webhookUrl) {
      showToast('No cloud sync configured. Downloaded local backup copy.', 'info');
      exportJson(trades);
    }
  }

  // Save/Update file via Google Drive API v3
  async function saveJsonFileToDrive(dataObj) {
    const content = JSON.stringify(dataObj, null, 2);

    if (!fileId) {
      fileId = await findExistingFile(DRIVE_FILE_NAME);
    }

    if (fileId) {
      await updateDriveFile(fileId, content, 'application/json');
    } else {
      fileId = await createDriveFile(DRIVE_FILE_NAME, content, 'application/json');
      if (fileId) {
        localStorage.setItem(STORAGE_KEY_FILE_ID, fileId);
      }
    }

    if (fileId) {
      const fileLinkEl = document.getElementById('gdrive-open-file-link');
      if (fileLinkEl) {
        fileLinkEl.href = `https://drive.google.com/file/d/${fileId}/view`;
        fileLinkEl.classList.remove('hidden');
      }
    }
  }

  // Find file in Google Drive by name
  async function findExistingFile(fileName) {
    const query = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Drive search failed: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  // Create file in Google Drive
  async function createDriveFile(fileName, content, mimeType) {
    const metadata = {
      name: fileName,
      mimeType: mimeType,
      description: '100 Trades Journal data file created by Phase 1 Trading Journal',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    let multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + mimeType + '\r\n\r\n' +
      content +
      close_delim;

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'multipart/related; boundary="' + boundary + '"',
        },
        body: multipartRequestBody,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Drive create file failed: ${errText}`);
    }

    const file = await res.json();
    return file.id;
  }

  // Update existing file in Google Drive
  async function updateDriveFile(existingFileId, content, mimeType) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
        },
        body: content,
      }
    );

    if (!res.ok) {
      if (res.status === 404) {
        localStorage.removeItem(STORAGE_KEY_FILE_ID);
        fileId = null;
        return saveJsonFileToDrive(JSON.parse(content));
      }
      const errText = await res.text();
      throw new Error(`Drive update failed: ${errText}`);
    }

    return await res.json();
  }

  /**
   * Merge charts across remote (Sheet), local state, and IndexedDB without losing
   * unsynced local charts or extra local charts when an older single-chart Apps Script responds.
   * Returns { charts, hasUnsyncedLocal }.
   */
  function mergeTradeCharts(remoteTrade, localTrade, dbCharts) {
    const normalize = (typeof TradeApp !== 'undefined' && TradeApp.normalizeTradeCharts)
      ? TradeApp.normalizeTradeCharts
      : (t => (t && Array.isArray(t.charts) ? t.charts : []));

    const remoteHasExplicitCharts = remoteTrade && Array.isArray(remoteTrade.charts);
    const remoteCharts = normalize(remoteTrade);
    const localCharts = normalize(localTrade);
    const storedCharts = Array.isArray(dbCharts) ? dbCharts : [];

    // Combine local state and IndexedDB backup into one local chart list (preserving base64)
    const combinedLocal = localCharts.map(c => Object.assign({}, c));
    storedCharts.forEach((sc, idx) => {
      if (!sc) return;
      const match = combinedLocal.find(lc => (lc.id && lc.id === sc.id) || (lc.chartUrl && sc.chartUrl && lc.chartUrl === sc.chartUrl)) || combinedLocal[idx];
      if (match) {
        if (!match.screenshot && sc.screenshot) match.screenshot = sc.screenshot;
        if (!match.chartUrl && sc.chartUrl) match.chartUrl = sc.chartUrl;
      } else {
        combinedLocal.push(Object.assign({}, sc));
      }
    });

    if (remoteCharts.length === 0) {
      const hasUnsyncedLocal = combinedLocal.some(c => !c.chartUrl && c.screenshot);
      return { charts: combinedLocal, hasUnsyncedLocal };
    }

    const matchedLocalSet = new Set();
    const merged = remoteCharts.map((rc, idx) => {
      const copy = Object.assign({}, rc);
      let matchIdx = combinedLocal.findIndex(lc => copy.chartUrl && lc.chartUrl && lc.chartUrl === copy.chartUrl);
      if (matchIdx === -1 && combinedLocal[idx] && (!combinedLocal[idx].chartUrl || !copy.chartUrl)) {
        matchIdx = idx;
      }

      if (matchIdx >= 0) {
        matchedLocalSet.add(matchIdx);
        const localMatch = combinedLocal[matchIdx];
        if (localMatch.screenshot && !copy.screenshot) {
          copy.screenshot = localMatch.screenshot;
        }
        if (localMatch.label && (!copy.label || copy.label === `Chart ${idx + 1}` || (idx === 0 && copy.label === 'Entry / Setup' && localMatch.label !== 'Entry / Setup'))) {
          copy.label = localMatch.label;
        }
        if (localMatch.id) copy.id = localMatch.id;
      }
      return copy;
    });

    const seenUrls = new Set(merged.map(c => c.chartUrl).filter(Boolean));
    let hasUnsyncedLocal = false;

    combinedLocal.forEach((lc, idx) => {
      if (lc.screenshot && !lc.chartUrl && !matchedLocalSet.has(idx)) {
        // Newly added locally and not yet written to Drive/Sheet
        merged.push(Object.assign({}, lc));
        hasUnsyncedLocal = true;
      } else if (!remoteHasExplicitCharts && !matchedLocalSet.has(idx) && (!lc.chartUrl || !seenUrls.has(lc.chartUrl)) && (lc.screenshot || lc.chartUrl)) {
        // Older single-chart Apps Script only returns index 0; preserve local charts 2+
        merged.push(Object.assign({}, lc));
      }
    });

    return { charts: merged, hasUnsyncedLocal };
  }

  // Smart Two-Way Synchronizer (Pulls remote trades, merges, and updates UI)
  async function smartSync(options = { notify: true, silentIfEmpty: false }) {
    if (webhookUrl) {
      updateStatusUI('syncing', 'Syncing Sheet...');
      try {
        const res = await fetch(webhookUrl, { cache: 'no-store' });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('Non-JSON response from Google Apps Script:', text);
          throw new Error('Google Apps Script did not return JSON. Please verify web app access is set to "Anyone".');
        }

        if (data && data.status === 'success' && Array.isArray(data.trades)) {
          const remoteTrades = data.trades;
          const localTrades = TradeApp.getTrades() || [];

          const compareNewestFirst = (a, b) => {
            const numDiff = (parseInt(b.tradeNum, 10) || 0) - (parseInt(a.tradeNum, 10) || 0);
            if (numDiff !== 0) return numDiff;
            return new Date(b.date || 0) - new Date(a.date || 0);
          };
          const isOutOfOrder = list => list.some((t, i) => i > 0 && compareNewestFirst(list[i - 1], t) > 0);
          const syncTradeFields = (typeof TradeApp !== 'undefined' && TradeApp.syncLegacyChartFields)
            ? TradeApp.syncLegacyChartFields
            : (t => t);

          let hasUnsyncedCharts = false;

          // Hydrate & normalize charts for all remote trades from local state or IndexedDB
          for (const remoteTrade of remoteTrades) {
            const num = parseInt(remoteTrade.tradeNum, 10);
            const localTrade = localTrades.find(t => parseInt(t.tradeNum, 10) === num);
            const dbCharts = (typeof TradeStorage !== 'undefined')
              ? (TradeStorage.getTradeCharts
                  ? await TradeStorage.getTradeCharts(localTrade ? localTrade.id : remoteTrade.id, num)
                  : await (async () => {
                      const img = await TradeStorage.getScreenshot(localTrade ? localTrade.id : remoteTrade.id, num);
                      return img ? [{ id: 'ch_0', label: 'Entry / Setup', screenshot: img, chartUrl: '' }] : null;
                    })())
              : null;

            const mergedChartsRes = mergeTradeCharts(remoteTrade, localTrade, dbCharts);
            if (mergedChartsRes.hasUnsyncedLocal) hasUnsyncedCharts = true;
            remoteTrade.charts = mergedChartsRes.charts;
            syncTradeFields(remoteTrade);
          }

          if (remoteTrades.length === 0 && localTrades.length === 0) {
            if (!options.silentIfEmpty && options.notify) {
              showToast('Google Sheet is connected, but has no trades yet.', 'info');
            }
          } else if (remoteTrades.length > 0 && localTrades.length === 0) {
            // Restore all remote trades to local (newest first) and flip sheet if ascending
            const sortedRemote = [...remoteTrades].sort(compareNewestFirst);
            TradeApp.setTrades(sortedRemote);
            if (remoteTrades.length > 1 && isOutOfOrder(remoteTrades)) {
              syncToGoogleSheetWebhook({ trades: sortedRemote });
            }
            if (options.notify) {
              showToast(`Restored ${sortedRemote.length} trade(s) from your Google Sheet!`, 'success');
            }
          } else if (remoteTrades.length === 0 && localTrades.length > 0) {
            // Push local trades to remote sheet
            await syncToGoogleSheetWebhook({ trades: localTrades });
            if (options.notify) {
              showToast(`Backed up ${localTrades.length} trade(s) to your Google Sheet!`, 'success');
            }
          } else {
            // Merge both sets by tradeNum PRESERVING multi-chart screenshots & Drive links
            const mergedMap = new Map();
            localTrades.forEach(t => mergedMap.set(parseInt(t.tradeNum, 10), t));
            for (const remoteTrade of remoteTrades) {
              const num = parseInt(remoteTrade.tradeNum, 10);
              const localTrade = mergedMap.get(num);
              if (localTrade) {
                remoteTrade.id = localTrade.id || remoteTrade.id;
              }
              mergedMap.set(num, syncTradeFields(remoteTrade));
            }
            const mergedList = Array.from(mergedMap.values()).sort(compareNewestFirst);

            TradeApp.setTrades(mergedList);
            if (options.notify) {
              showToast(`Synchronized ${mergedList.length} trade(s) with Google Sheet!`, 'success');
            }

            if (mergedList.length > remoteTrades.length || hasUnsyncedCharts || (remoteTrades.length > 1 && isOutOfOrder(remoteTrades))) {
              syncToGoogleSheetWebhook({ trades: mergedList });
            }
          }

          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          localStorage.setItem(STORAGE_KEY_LAST_SYNC, nowStr);
          const lastSyncEl = document.getElementById('gdrive-last-synced');
          if (lastSyncEl) lastSyncEl.textContent = nowStr;

          updateStatusUI('connected', 'Sheet: Synced');
          return { success: true, count: TradeApp.getTrades().length };
        } else if (data && data.status === 'online') {
          // Old Google Apps Script version deployed
          openAppsScriptModal();
          showToast('Google Sheet Webhook is active! Deploy "New version" in Apps Script to enable reading rows.', 'info');
          updateStatusUI('connected', 'Sheet: Active');
          return { success: false, reason: 'script_v1' };
        } else {
          showToast('Google Sheet: ' + (data?.message || 'Empty response'), 'info');
          updateStatusUI('connected', 'Sheet: Synced');
          return { success: false, reason: data?.message };
        }
      } catch (err) {
        console.error('Smart sync error:', err);
        if (!options.silentIfEmpty && options.notify) {
          showToast('Failed to sync from Google Sheet: ' + err.message, 'error');
        }
        updateStatusUI('error', 'Sync Error');
        return { success: false, error: err };
      }
    }

    // Direct Google Drive OAuth fallback
    if (isAuthenticated()) {
      return pullFromDrive();
    } else {
      if (options.notify && !options.silentIfEmpty) {
        showToast('Google Drive/Sheet not configured yet. Open Google Drive Sync settings.', 'info');
      }
      return { success: false, reason: 'not_connected' };
    }
  }

  // Pull / download data from Google Drive (Supports both Google Sheet Webhook and Drive OAuth)
  async function pullFromDrive(silent = false) {
    return smartSync({ notify: !silent, silentIfEmpty: silent });
  }

  /** Prepare a lightweight copy of webhook payload: omit base64 for charts already uploaded to Drive. */
  function buildWebhookPayload(payload) {
    if (!payload || !Array.isArray(payload.trades)) return payload;
    const normalize = (typeof TradeApp !== 'undefined' && TradeApp.normalizeTradeCharts)
      ? TradeApp.normalizeTradeCharts
      : (t => (t && Array.isArray(t.charts) ? t.charts : []));

    const lightTrades = payload.trades.map(t => {
      const charts = normalize(t).map(c => ({
        id: c.id || '',
        label: c.label || '',
        chartUrl: c.chartUrl || '',
        screenshot: c.chartUrl ? '' : (c.screenshot || ''),
        addedAt: c.addedAt || ''
      }));
      const primary = charts[0] || {};
      return Object.assign({}, t, {
        charts,
        chartUrl: primary.chartUrl || t.chartUrl || '',
        chartUrls: charts.map(c => c.chartUrl).filter(Boolean),
        screenshot: (primary.chartUrl || t.chartUrl) ? '' : (primary.screenshot || t.screenshot || ''),
        hasScreenshot: charts.length > 0 || Boolean(t.hasScreenshot)
      });
    });

    return Object.assign({}, payload, { trades: lightTrades });
  }

  // Google Sheets Webhook Sync (Alternate zero-OAuth solution)
  async function syncToGoogleSheetWebhook(payload) {
    if (!webhookUrl) return;

    updateStatusUI('syncing', 'Syncing Sheet...');
    try {
      const preparedPayload = buildWebhookPayload(payload);
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preparedPayload),
      });

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem(STORAGE_KEY_LAST_SYNC, nowStr);
      
      const lastSyncEl = document.getElementById('gdrive-last-synced');
      if (lastSyncEl) lastSyncEl.textContent = nowStr;

      const fileNameEl = document.getElementById('gdrive-file-name');
      if (fileNameEl) fileNameEl.textContent = '100 Trades Journal (Google Sheet)';

      updateStatusUI('connected', 'Sheet: Synced');
      showToast('Synced trades to Google Sheet in Drive!', 'success');
    } catch (err) {
      console.error('Google Sheet Webhook sync error:', err);
      updateStatusUI('error', 'Sheet Sync Error');
    }
  }

  // Refresh status based on active connection mode
  function refreshStatus() {
    if (webhookUrl) {
      updateStatusUI('connected', 'Sheet: Synced');
      const desc = document.getElementById('gdrive-status-desc');
      if (desc) desc.textContent = 'Connected (Google Sheet)';
      const fileNameEl = document.getElementById('gdrive-file-name');
      if (fileNameEl) fileNameEl.textContent = '100 Trades Journal (Google Sheet)';
    } else if (isAuthenticated()) {
      updateStatusUI('connected', 'Drive: Synced');
    } else {
      updateStatusUI('disconnected', 'Drive: Offline');
    }
  }

  // Update Status UI
  function updateStatusUI(status, label) {
    const dot = document.getElementById('gdrive-status-dot');
    const pillLabel = document.getElementById('gdrive-status-label');
    const syncIcon = document.getElementById('gdrive-sync-icon');
    const desc = document.getElementById('gdrive-status-desc');
    const circle = document.getElementById('gdrive-status-circle');

    if (!dot || !pillLabel) return;

    dot.className = 'w-2 h-2 rounded-full';
    if (syncIcon) syncIcon.classList.remove('animate-spin');

    if (status === 'connected') {
      dot.classList.add('bg-emerald-400');
      pillLabel.textContent = label || 'Drive: Synced';
      if (desc) desc.textContent = 'Connected (Google Sheet)';
      if (circle) circle.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
    } else if (status === 'syncing') {
      dot.classList.add('bg-indigo-400');
      if (syncIcon) syncIcon.classList.add('animate-spin');
      pillLabel.textContent = label || 'Drive: Syncing...';
      if (desc) desc.textContent = 'Syncing to Drive...';
      if (circle) circle.className = 'w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse';
    } else if (status === 'error') {
      dot.classList.add('bg-rose-500');
      pillLabel.textContent = label || 'Drive: Error';
      if (desc) desc.textContent = 'Sync Error';
      if (circle) circle.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    } else {
      dot.classList.add('bg-slate-500');
      pillLabel.textContent = label || 'Drive: Offline';
      if (desc) desc.textContent = 'Not Connected';
      if (circle) circle.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
    }
  }

  // Helper toast notification
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colorClasses =
      type === 'success'
        ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
        : type === 'error'
        ? 'bg-rose-950/90 border-rose-500 text-rose-200'
        : 'bg-slate-900/90 border-indigo-500 text-slate-200';

    toast.className = `toast px-4 py-2.5 rounded-xl border shadow-xl text-xs flex items-center space-x-2 backdrop-blur-md ${colorClasses}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Open Apps Script Modal
  function openAppsScriptModal() {
    const modal = document.getElementById('modal-apps-script');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    populateScriptCodeArea();
    if (window.lucide) window.lucide.createIcons();
  }

  function closeAppsScriptModal() {
    const modal = document.getElementById('modal-apps-script');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  // Populate script code area in modal
  async function populateScriptCodeArea() {
    const textarea = document.getElementById('apps-script-code-area');
    if (!textarea) return;
    try {
      const res = await fetch('google-apps-script.js');
      if (res.ok) {
        textarea.value = await res.text();
      }
    } catch (e) {
      console.warn('Could not load google-apps-script.js directly:', e);
    }
  }

  // Restore Trade #1 (ETH) into journal directly
  function restoreTrade1Directly() {
    const sampleTrade1 = {
      id: 'trade_1_' + Date.now(),
      tradeNum: 1,
      date: new Date().toISOString().slice(0, 16),
      isMissed: false,
      symbol: 'ETH',
      direction: 'LONG',
      realizedPnL: 0,
      realizedR: 0,
      outcome: 'WIN',
      strategy: 'Breakout & Retest',
      planFollowed: true,
      mistakes: [],
      emotion: 'Calm & Patient',
      missedReason: '',
      notes: 'Trade #1 of 100-Trade Journey. Executed with plan and discipline!'
    };

    TradeApp.setTrades([sampleTrade1]);
    showToast('Restored Trade #1 (ETH LONG WIN) into your journal!', 'success');
    closeAppsScriptModal();
  }

  // Test Webhook Connection live
  async function testSheetConnection() {
    const indicator = document.getElementById('script-test-indicator');
    const statusText = document.getElementById('script-test-status');

    if (!webhookUrl) {
      if (statusText) statusText.textContent = 'Please enter a Google Apps Script Webhook URL first in Settings.';
      if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
      return;
    }

    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-indigo-500 animate-spin';
    if (statusText) statusText.textContent = 'Testing connection & querying Google Sheet...';

    try {
      const res = await fetch(webhookUrl, { cache: 'no-store' });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Google Apps Script did not return JSON. Make sure Web App access is set to "Anyone".');
      }

      if (data && data.status === 'success' && Array.isArray(data.trades)) {
        if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
        if (statusText) statusText.textContent = `Connected! Found ${data.trades.length} trade(s) in your Google Sheet.`;
        if (data.trades.length > 0) {
          TradeApp.setTrades(data.trades);
          showToast(`Loaded ${data.trades.length} trade(s) from Google Sheet!`, 'success');
        }
      } else if (data && data.status === 'online') {
        if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
        if (statusText) statusText.textContent = 'Webhook is online, but running script v1. Please deploy "New version" (Step 4 above).';
      } else {
        if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
        if (statusText) statusText.textContent = 'Response: ' + (data.message || 'Unknown response');
      }
    } catch (err) {
      if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
      if (statusText) statusText.textContent = 'Connection error: ' + err.message;
    }
  }

  // Export JSON file locally (Blob URL for reliable large image payload downloads)
  function exportJson(trades) {
    try {
      const data = trades || (typeof TradeApp !== 'undefined' ? TradeApp.getTrades() : []);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute('href', url);
      dlAnchorElem.setAttribute('download', `100_Trades_Journal_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(dlAnchorElem);
      dlAnchorElem.click();
      document.body.removeChild(dlAnchorElem);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Journal backup exported (JSON)!', 'success');
    } catch (e) {
      console.error('Export JSON error:', e);
      showToast('Export failed: ' + e.message, 'error');
    }
  }

  // Import JSON file locally and restore into journal & IndexedDB
  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        const importedTrades = Array.isArray(parsed) ? parsed : (parsed.trades || []);
        if (!Array.isArray(importedTrades) || importedTrades.length === 0) {
          showToast('No trades found in selected file.', 'error');
          return;
        }

        // Save screenshots / multi-charts to IndexedDB if present
        if (typeof TradeStorage !== 'undefined') {
          for (const t of importedTrades) {
            if (typeof TradeApp !== 'undefined' && TradeApp.syncLegacyChartFields) {
              TradeApp.syncLegacyChartFields(t);
            }
            if (Array.isArray(t.charts) && t.charts.length > 0 && TradeStorage.saveTradeCharts) {
              await TradeStorage.saveTradeCharts(t.id, t.charts, t.tradeNum);
            } else if (t.screenshot) {
              await TradeStorage.saveScreenshot(t.id, t.screenshot, t.tradeNum);
            }
          }
        }

        TradeApp.setTrades(importedTrades);
        showToast(`Successfully imported ${importedTrades.length} trade(s) with charts!`, 'success');

        // Sync with Google Sheet if connected
        if (webhookUrl) {
          syncToGoogleSheetWebhook({ trades: importedTrades });
        }
      } catch (err) {
        console.error('Import JSON error:', err);
        showToast('Invalid JSON backup file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  // Export CSV file locally
  function exportCsv(trades) {
    if (!trades || !trades.length) {
      showToast('No trades to export yet!', 'info');
      return;
    }

    const headers = [
      'Trade #',
      'Date',
      'Type',
      'Symbol',
      'Direction',
      'Realized PnL ($)',
      'Realized R',
      'Outcome',
      'Setup / Strategy',
      'Rules Kept?',
      'Mistakes / Rule Breaks',
      'Psychology / Emotion',
      'Missed Reason',
      '1 Key Lesson / Notes'
    ];

    const rows = trades.map(t => [
      t.tradeNum || '',
      `"${t.date || ''}"`,
      t.isMissed ? '"Missed Trade"' : '"Executed"',
      `"${t.symbol || ''}"`,
      `"${t.direction || ''}"`,
      t.isMissed ? (t.missedPnL || 0) : (t.realizedPnL || 0),
      t.isMissed ? (t.missedR || 0) : (t.realizedR || 0),
      `"${t.outcome || ''}"`,
      `"${(t.strategy || '').replace(/"/g, '""')}"`,
      t.isMissed ? 'N/A' : (t.planFollowed ? 'Yes' : 'NO (Rule Broken)'),
      `"${(Array.isArray(t.mistakes) ? t.mistakes.join('; ') : (t.mistake || '')).replace(/"/g, '""')}"`,
      `"${t.emotion || ''}"`,
      `"${(t.missedReason || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Trading_Journal_100_Trades_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV Exported successfully!', 'success');
  }

  return {
    init: function() {
      // 1. Auto-detect URL query parameters (?webhook=... or ?sync=...) for instant 1-click multi-browser connection
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const paramWebhook = urlParams.get('webhook') || urlParams.get('sync');
        if (paramWebhook) {
          let clean = paramWebhook.trim();
          if (clean.startsWith('AKfycb')) {
            clean = `https://script.google.com/macros/s/${clean}/exec`;
          } else if (clean.includes('script.google.com') && !clean.endsWith('/exec')) {
            clean = clean.replace(/\/+$/, '') + '/exec';
          }
          webhookUrl = clean;
          localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
          // Clean address bar URL cleanly without reloading
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
          showToast('Webhook URL connected from link!', 'success');
        }
      } catch (e) {
        console.warn('Could not parse URL query parameters:', e);
      }

      // 2. Fall back to hardcoded DEFAULT_WEBHOOK_URL if not in localStorage
      if (!webhookUrl && DEFAULT_WEBHOOK_URL) {
        webhookUrl = DEFAULT_WEBHOOK_URL;
        localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
      }

      // Clean up accidental Apps Script deployment ID in OAuth Client ID box if present
      if (clientId && clientId.startsWith('AKfycb')) {
        clientId = '';
        localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
        const clientInput = document.getElementById('input-gdrive-client-id');
        if (clientInput) clientInput.value = '';
      }

      // Check if Webhook URL needs auto-completion (/exec)
      if (webhookUrl) {
        if (webhookUrl.startsWith('AKfycb')) {
          webhookUrl = `https://script.google.com/macros/s/${webhookUrl}/exec`;
          localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
        } else if (webhookUrl.includes('script.google.com') && !webhookUrl.endsWith('/exec')) {
          webhookUrl = webhookUrl.replace(/\/+$/, '') + '/exec';
          localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
        }
      }

      // Update initial UI state based on active method
      refreshStatus();

      const clientInput = document.getElementById('input-gdrive-client-id');
      if (clientInput && clientId) {
        clientInput.value = clientId;
      }

      const webhookInput = document.getElementById('input-sheet-webhook-url');
      if (webhookInput && webhookUrl) {
        webhookInput.value = webhookUrl;
      }

      const lastSync = localStorage.getItem(STORAGE_KEY_LAST_SYNC);
      const lastSyncEl = document.getElementById('gdrive-last-synced');
      if (lastSync && lastSyncEl) {
        lastSyncEl.textContent = lastSync;
      }

      if (fileId) {
        const linkEl = document.getElementById('gdrive-open-file-link');
        if (linkEl) {
          linkEl.href = `https://drive.google.com/file/d/${fileId}/view`;
          linkEl.classList.remove('hidden');
        }
      }

      if (typeof google !== 'undefined' && google.accounts && clientId) {
        initClient();
      }
    },
    connect,
    syncToDrive,
    pullFromDrive,
    smartSync,
    hasWebhook,
    getWebhookUrl,
    isAuthenticated,
    openAppsScriptModal,
    closeAppsScriptModal,
    restoreTrade1Directly,
    testSheetConnection,
    exportCsv,
    exportJson,
    importJson,
    showToast,
    refreshStatus,
    setClientId: function(id) {
      clientId = id.trim();
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId);
      initClient();
      showToast('Google Client ID saved!', 'success');
      refreshStatus();
    },
    setWebhookUrl: function(url) {
      let clean = url.trim();
      if (clean.startsWith('AKfycb')) {
        clean = `https://script.google.com/macros/s/${clean}/exec`;
      } else if (clean.includes('script.google.com') && !clean.endsWith('/exec')) {
        clean = clean.replace(/\/+$/, '') + '/exec';
      }
      webhookUrl = clean;
      localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);

      const webhookInput = document.getElementById('input-sheet-webhook-url');
      if (webhookInput) webhookInput.value = webhookUrl;

      refreshStatus();
      showToast('Google Sheet Webhook saved & connected!', 'success');

      // Trigger automatic smartSync immediately
      smartSync({ notify: true, silentIfEmpty: false });
    }
  };
})();
