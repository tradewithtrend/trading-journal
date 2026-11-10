/**
 * Google Apps Script Web App for 100 Trades Journal
 * Two-Way Realtime Sync with Google Drive Spreadsheet & Automated Chart Image Uploads
 * 
 * =========================================================================
 * HOW TO UPDATE / DEPLOY IN 30 SECONDS:
 * =========================================================================
 * 1. Open your Google Sheet in Google Drive.
 * 2. In the top menu, click: Extensions -> Apps Script.
 * 3. Replace all code in the editor with this entire file.
 * 4. Click the Save icon (💾).
 * 5. Click "Deploy" (top right button) -> "Manage deployments".
 * 6. Click the Pencil icon (Edit) on your active deployment.
 * 7. Under "Version", select: "New version".
 * 8. Click "Deploy" -> Click "Done".
 * 
 * (If prompted with "Authorization Required", click "Review permissions" 
 * -> select your account -> "Advanced" -> "Go to 100 Trades Journal (unsafe)" -> "Allow".)
 * 
 * That's it! Your Google Spreadsheet will now automatically upload and display charts in Column O!
 * =========================================================================
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // If sheet is empty, setup headers
    if (sheet.getLastRow() === 0) {
      setupHeaders(sheet);
    } else {
      // Ensure column 15 header exists
      var headerVal = sheet.getRange(1, 15).getValue();
      if (!headerVal || headerVal === '') {
        sheet.getRange(1, 15).setValue("Chart Screenshot")
          .setFontWeight("bold").setBackground("#131B2E").setFontColor("#FFFFFF");
      }
    }

    var trades = data.trades || [];

    // Clear existing data rows if receiving a valid sync payload
    if (trades.length > 0) {
      var lastRow = sheet.getLastRow();
      var lastCol = Math.max(sheet.getLastColumn(), 15);
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }

      var rows = trades.map(function(t) {
        var mistakeText = Array.isArray(t.mistakes) ? t.mistakes.join('; ') : (t.mistake || '');
        
        // 1. Process Chart Screenshot: upload to Google Drive if new base64 image
        var chartUrl = t.chartUrl || '';
        if (!chartUrl && t.screenshot && typeof t.screenshot === 'string' && t.screenshot.indexOf('base64') !== -1) {
          chartUrl = saveChartToDrive(t.screenshot, t.tradeNum, t.symbol);
        }

        // Formula for Column O
        var chartCellFormula = '';
        if (chartUrl) {
          chartCellFormula = '=HYPERLINK("' + chartUrl + '", "📈 View Chart")';
        } else {
          chartCellFormula = '-';
        }

        return [
          t.tradeNum || '',
          t.date || '',
          t.isMissed ? 'Missed Trade' : 'Executed',
          t.symbol || '',
          t.direction || '',
          t.isMissed ? (t.missedPnL || 0) : (t.realizedPnL || 0),
          t.isMissed ? (t.missedR || 0) : (t.realizedR || 0),
          t.outcome || '',
          t.strategy || '',
          t.isMissed ? 'N/A' : (t.planFollowed ? 'Yes' : 'NO (Rule Broken)'),
          mistakeText,
          t.emotion || '',
          t.missedReason || '',
          t.notes || '',
          chartCellFormula
        ];
      });

      sheet.getRange(2, 1, rows.length, 15).setValues(rows);

      // Format header row across 15 columns
      sheet.getRange(1, 1, 1, 15).setFontWeight("bold").setBackground("#131B2E").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      tradesCount: trades.length,
      message: "Synced " + trades.length + " trades (with charts) to Google Drive Spreadsheet!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function saveChartToDrive(base64Data, tradeNum, symbol) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  if (base64Data.indexOf('http://') === 0 || base64Data.indexOf('https://') === 0) {
    return base64Data;
  }

  try {
    var folderName = "100 Trades Journal Charts";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var contentType = 'image/jpeg';
    var cleanBase64 = base64Data;
    if (cleanBase64.indexOf('data:image/png;base64,') === 0) {
      contentType = 'image/png';
      cleanBase64 = cleanBase64.replace('data:image/png;base64,', '');
    } else if (cleanBase64.indexOf('data:image/jpeg;base64,') === 0) {
      contentType = 'image/jpeg';
      cleanBase64 = cleanBase64.replace('data:image/jpeg;base64,', '');
    } else if (cleanBase64.indexOf('data:image/webp;base64,') === 0) {
      contentType = 'image/webp';
      cleanBase64 = cleanBase64.replace('data:image/webp;base64,', '');
    } else if (cleanBase64.indexOf('base64,') !== -1) {
      cleanBase64 = cleanBase64.split('base64,')[1];
    }

    var decoded = Utilities.base64Decode(cleanBase64);
    var ext = (contentType === 'image/png') ? '.png' : '.jpg';
    var fileName = 'Trade_' + (tradeNum || 'X') + '_' + (symbol || 'Chart') + '_' + Date.now() + ext;
    var blob = Utilities.newBlob(decoded, contentType, fileName);
    var file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Ignore domain permission restriction
    }

    return file.getUrl();
  } catch (err) {
    Logger.log('Could not save chart to Drive: ' + err.toString());
    return '';
  }
}

function setupHeaders(sheet) {
  var headers = [
    "Trade #", "Date & Time", "Type", "Symbol", "Direction",
    "Realized P&L ($)", "Realized R", "Outcome", "Setup / Strategy",
    "Rules Kept?", "Mistakes / Rule Breaks", "Psychology / Emotion",
    "Missed Reason", "1 Key Lesson / Notes", "Chart Screenshot"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#131B2E").setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", trades: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var lastCol = Math.max(sheet.getLastColumn(), 15);
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var trades = data.map(function(row, idx) {
      var isMissed = String(row[2]).toLowerCase().indexOf('missed') !== -1;
      var mistakesStr = String(row[10] || '');
      var mistakes = mistakesStr ? mistakesStr.split(';').map(function(s) { return s.trim(); }).filter(Boolean) : [];
      var pnlVal = parseFloat(row[5]) || 0;
      var rVal = parseFloat(row[6]) || 0;
      
      var rawDate = row[1];
      var dateStr = '';
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString();
      } else {
        dateStr = String(rawDate || '');
      }

      var tradeNum = parseInt(row[0], 10) || (idx + 1);

      // Extract chart URL from Column 15 (Column O)
      var chartCellVal = String(row[14] || '');
      var chartUrl = '';
      if (chartCellVal.indexOf('http') !== -1) {
        var match = chartCellVal.match(/https?:\/\/[^\s"\)]+/);
        chartUrl = match ? match[0] : chartCellVal;
      }

      return {
        id: 'trade_' + tradeNum + '_' + (Date.now() + idx),
        tradeNum: tradeNum,
        date: dateStr,
        isMissed: isMissed,
        symbol: String(row[3] || '').toUpperCase(),
        direction: String(row[4] || 'LONG').toUpperCase(),
        realizedPnL: !isMissed ? pnlVal : 0,
        realizedR: !isMissed ? rVal : 0,
        missedPnL: isMissed ? pnlVal : 0,
        missedR: isMissed ? rVal : 0,
        outcome: String(row[7] || (isMissed ? 'MISSED' : 'WIN')).toUpperCase(),
        strategy: String(row[8] || 'Breakout & Retest'),
        planFollowed: String(row[9]).toLowerCase().indexOf('yes') !== -1,
        mistakes: mistakes,
        emotion: String(row[11] || 'Calm & Patient'),
        missedReason: String(row[12] || ''),
        notes: String(row[13] || ''),
        chartUrl: chartUrl,
        hasScreenshot: Boolean(chartUrl)
      };
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      trades: trades,
      count: trades.length,
      syncedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
