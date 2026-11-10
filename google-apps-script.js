/**
 * Google Apps Script Web App for 100 Trades Journal
 * Two-Way Realtime Sync with Google Drive Spreadsheet
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
 * That's it! Your journal web app can now automatically read & write trades!
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
    }

    var trades = data.trades || [];

    // Clear existing data rows if receiving a valid sync payload
    if (trades.length > 0) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn() || 14;
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }

      var rows = trades.map(function(t) {
        var mistakeText = Array.isArray(t.mistakes) ? t.mistakes.join('; ') : (t.mistake || '');
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
          t.notes || ''
        ];
      });

      sheet.getRange(2, 1, rows.length, 14).setValues(rows);

      // Format header row
      sheet.getRange(1, 1, 1, 14).setFontWeight("bold").setBackground("#131B2E").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      tradesCount: trades.length,
      message: "Synced " + trades.length + " trades to Google Drive Spreadsheet!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function setupHeaders(sheet) {
  var headers = [
    "Trade #", "Date & Time", "Type", "Symbol", "Direction",
    "Realized P&L ($)", "Realized R", "Outcome", "Setup / Strategy",
    "Rules Kept?", "Mistakes / Rule Breaks", "Psychology / Emotion",
    "Missed Reason", "1 Key Lesson / Notes"
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

    var lastCol = sheet.getLastColumn() || 14;
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
        notes: String(row[13] || '')
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
