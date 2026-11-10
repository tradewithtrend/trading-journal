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

  let tokenClient = null;
  let accessToken = localStorage.getItem(STORAGE_KEY_TOKEN) || null;
  let tokenExpiresAt = parseInt(localStorage.getItem(STORAGE_KEY_TOKEN_EXP) || '0', 10);
  let clientId = localStorage.getItem(STORAGE_KEY_CLIENT_ID) || '';
  let fileId = localStorage.getItem(STORAGE_KEY_FILE_ID) || null;
  let webhookUrl = localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';

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

    // Trigger Google Sign-in popup
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
      syncToGoogleSheetWebhook(payload);
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
        showToast(`Synced ${trades.length} trades to Google Drive!`, 'success');
        syncedAnywhere = true;
      } catch (err) {
        console.error('Error syncing to Google Drive:', err);
        updateStatusUI('error', 'Sync Error');
        showToast('Google Drive sync failed: ' + (err.message || 'Network error'), 'error');
      }
    }

    if (!syncedAnywhere && !isAuthenticated() && !webhookUrl) {
      showToast('Google Drive not configured yet. Downloaded backup copy locally.', 'info');
      exportJson(trades);
    }
  }

  // Save/Update file via Google Drive API v3
  async function saveJsonFileToDrive(dataObj) {
    const content = JSON.stringify(dataObj, null, 2);

    // If we don't have a fileId, search for existing file first
    if (!fileId) {
      fileId = await findExistingFile(DRIVE_FILE_NAME);
    }

    if (fileId) {
      // Update existing file
      await updateDriveFile(fileId, content, 'application/json');
    } else {
      // Create new file
      fileId = await createDriveFile(DRIVE_FILE_NAME, content, 'application/json');
      if (fileId) {
        localStorage.setItem(STORAGE_KEY_FILE_ID, fileId);
      }
    }

    // Update UI link to file
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
      // If 404, file might have been deleted from Drive, clear cached ID and re-create
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

  // Pull / download data from Google Drive
  async function pullFromDrive() {
    if (!isAuthenticated()) {
      showToast('Please connect to Google Drive first.', 'error');
      connect();
      return;
    }

    try {
      updateStatusUI('syncing', 'Pulling...');
      if (!fileId) {
        fileId = await findExistingFile(DRIVE_FILE_NAME);
      }

      if (!fileId) {
        showToast('No journal file found in Google Drive yet.', 'info');
        updateStatusUI('connected', 'Connected');
        return;
      }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to read file: ${res.statusText}`);
      }

      const remoteData = await res.json();
      if (remoteData && remoteData.trades && Array.isArray(remoteData.trades)) {
        if (confirm(`Found ${remoteData.trades.length} trades on Google Drive. Replace current local trades with Google Drive copy?`)) {
          TradeApp.setTrades(remoteData.trades);
          showToast(`Successfully restored ${remoteData.trades.length} trades from Google Drive!`, 'success');
        }
      } else {
        showToast('Google Drive file has invalid structure.', 'error');
      }
      updateStatusUI('connected', 'Connected');
    } catch (err) {
      console.error('Error pulling from Drive:', err);
      showToast('Error pulling from Drive: ' + err.message, 'error');
      updateStatusUI('error', 'Error');
    }
  }

  // Google Sheets Webhook Sync (Alternate zero-OAuth solution)
  async function syncToGoogleSheetWebhook(payload) {
    if (!webhookUrl) return;

    try {
      // Uses standard no-cors POST to Google Apps Script Web App
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      showToast('Synced to Google Sheet in Drive!', 'success');
    } catch (err) {
      console.error('Google Sheet Webhook sync error:', err);
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

    // Reset styles
    dot.className = 'w-2 h-2 rounded-full';
    syncIcon.classList.remove('animate-spin');

    if (status === 'connected') {
      dot.classList.add('bg-emerald-400');
      pillLabel.textContent = label || 'Drive: Synced';
      if (desc) desc.textContent = 'Connected (Google Drive)';
      if (circle) circle.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
    } else if (status === 'syncing') {
      dot.classList.add('bg-indigo-400');
      syncIcon.classList.add('animate-spin');
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

  // Export JSON file locally
  function exportJson(trades) {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(trades, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `100_Trades_Journal_${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchorElem.click();
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
      'Symbol',
      'Market',
      'Direction',
      'Entry Price',
      'Exit Price',
      'Stop Loss',
      'Take Profit',
      'Quantity',
      'Planned Risk ($)',
      'Planned R:R',
      'Realized PnL ($)',
      'Realized R',
      'Outcome',
      'Strategy',
      'Session',
      'Emotion',
      'Mistake',
      'Plan Followed',
      'Notes',
      'Chart URL'
    ];

    const rows = trades.map(t => [
      t.tradeNum,
      `"${t.date || ''}"`,
      `"${t.symbol || ''}"`,
      `"${t.market || ''}"`,
      `"${t.direction || ''}"`,
      t.entryPrice || 0,
      t.exitPrice || 0,
      t.stopLoss || 0,
      t.takeProfit || 0,
      t.quantity || 0,
      t.plannedRisk || 0,
      t.plannedRR || 0,
      t.realizedPnL || 0,
      t.realizedR || 0,
      `"${t.outcome || ''}"`,
      `"${(t.strategy || '').replace(/"/g, '""')}"`,
      `"${t.session || ''}"`,
      `"${t.emotion || ''}"`,
      `"${t.mistake || ''}"`,
      t.planFollowed ? 'Yes' : 'No',
      `"${(t.notes || '').replace(/"/g, '""')}"`,
      `"${(t.chartUrl || '').replace(/"/g, '""')}"`
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
      // Update initial UI state
      if (isAuthenticated()) {
        updateStatusUI('connected', 'Connected');
      } else {
        updateStatusUI('disconnected', 'Drive: Offline');
      }

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

      // Check if file ID already cached
      if (fileId) {
        const linkEl = document.getElementById('gdrive-open-file-link');
        if (linkEl) {
          linkEl.href = `https://drive.google.com/file/d/${fileId}/view`;
          linkEl.classList.remove('hidden');
        }
      }

      // Try initializing GIS if available
      if (typeof google !== 'undefined' && google.accounts && clientId) {
        initClient();
      }
    },
    connect,
    syncToDrive,
    pullFromDrive,
    exportCsv,
    exportJson,
    showToast,
    setClientId: function(id) {
      clientId = id.trim();
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId);
      initClient();
      showToast('Google Client ID saved!', 'success');
    },
    setWebhookUrl: function(url) {
      webhookUrl = url.trim();
      localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
      showToast('Google Sheet Webhook URL saved!', 'success');
    }
  };
})();
