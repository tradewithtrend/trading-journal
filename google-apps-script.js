/**
 * Google Apps Script Web App for 100 Trades Journal
 * 
 * HOW TO SET THIS UP IN 1 MINUTE:
 * 1. Go to Google Drive (https://drive.google.com).
 * 2. Click "+ New" -> "Google Sheets" and name it "100 Trades Trading Journal".
 * 3. In the top menu, click "Extensions" -> "Apps Script".
 * 4. Delete any code in the editor, paste this entire file, and click Save (💾).
 * 5. Click "Deploy" (top right) -> "New deployment".
 * 6. Select type: "Web app".
 * 7. Set:
 *    - Description: "Trading Journal Sync"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (allows your Netlify web app to send trade data securely)
 * 8. Click "Deploy", copy the "Web app URL" (starts with https://script.google.com/macros/s/...)
 * 9. Paste this URL into the "Google Sheet Webhook URL" in your Trading Journal settings!
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // If sheet is empty, create headers
    if (sheet.getLastRow() === 0) {
      setupHeaders(sheet);
    }

    var trades = data.trades || [];

    // Clear existing data rows if receiving a full sync
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
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "100 Trades Journal Google Sheet Webhook is active."
  })).setMimeType(ContentService.MimeType.JSON);
}
