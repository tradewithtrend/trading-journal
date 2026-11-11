/**
 * Google Apps Script Web App for 100 Trades Journal
 * Two-Way Realtime Sync with Google Drive Spreadsheet & Automated Chart Image Uploads
 * 
 * =========================================================================
 * HOW TO ACTIVATE DRIVE PERMISSIONS (TAKES 10 SECONDS):
 * =========================================================================
 * 1. Open your Google Sheet in Google Drive.
 * 2. In the top menu, click: Extensions -> Apps Script.
 * 3. Replace all code in the editor with this entire file.
 * 4. Click the Save icon (💾).
 * 5. In the toolbar at the top, select "authorizePermissions" from the function dropdown.
 * 6. Click "Run" (▶️).
 * 7. When Google asks for "Authorization required":
 *    - Click "Review permissions"
 *    - Choose your Google account
 *    - Click "Advanced" (small link at bottom)
 *    - Click "Go to 100 Trades Journal (unsafe)"
 *    - Click "Allow"
 * 8. Now click "Deploy" (top right) -> "Manage deployments" -> Pencil (Edit)
 *    -> Under Version choose "New version" -> Click "Deploy" -> Click "Done".
 * 
 * That's it! Your Google Spreadsheet can now automatically create the
 * "100 Trades Journal Charts" folder and insert clickable chart links!
 * =========================================================================
 */

// Run this once inside Apps Script to grant Google Drive upload permissions
function authorizePermissions() {
  var folderName = "100 Trades Journal Charts";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  setupHeaders(sheet);
  Logger.log("SUCCESS: Both Google Sheets and Google Drive permissions are authorized!");
}

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

    var trades = sortTradesNewestFirst_(data.trades || []);

    // Clear existing data rows if receiving a valid sync payload
    if (trades.length > 0) {
      var lastRow = sheet.getLastRow();
      var lastCol = Math.max(sheet.getLastColumn(), 15);

      // Read existing chart links keyed by Trade # before clearing so sorting & updates preserve charts
      var existingValues = (lastRow > 1) ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
      var existingFormulas = (lastRow > 1) ? sheet.getRange(2, 1, lastRow - 1, lastCol).getFormulas() : [];
      var existingRichTexts = [];
      try {
        if (lastRow > 1) existingRichTexts = sheet.getRange(2, 1, lastRow - 1, lastCol).getRichTextValues();
      } catch (e) {}

      var existingChartsByKey = {};
      for (var r = 0; r < existingValues.length; r++) {
        var existingRt = (existingRichTexts && existingRichTexts[r]) ? existingRichTexts[r][14] : null;
        var existingFm = (existingFormulas && existingFormulas[r]) ? existingFormulas[r][14] : '';
        var extracted = extractChartsFromCell_(existingRt, existingFm, existingValues[r][14]);
        if (!extracted.length) continue;

        var numKey = String(existingValues[r][0] !== undefined ? existingValues[r][0] : '').trim();
        var rawExistingDate = existingValues[r][1];
        var dateKey = rawExistingDate instanceof Date ? rawExistingDate.toISOString() : String(rawExistingDate || '').trim();
        if (numKey && dateKey) {
          existingChartsByKey[numKey + '|' + dateKey] = extracted;
        }
        if (numKey && numKey !== '0') {
          existingChartsByKey[numKey] = extracted;
        }
      }

      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }

      var colORichTexts = [];
      var rows = trades.map(function(t) {
        var mistakeText = Array.isArray(t.mistakes) ? t.mistakes.join('; ') : (t.mistake || '');

        var tNumKey = String(t.tradeNum !== undefined ? t.tradeNum : '').trim();
        var tDateKey = String(t.date || '').trim();
        var existingCharts = (tNumKey && tDateKey && existingChartsByKey[tNumKey + '|' + tDateKey])
          || (tNumKey && tNumKey !== '0' && existingChartsByKey[tNumKey])
          || [];

        // Collect normalized incoming charts (supports new t.charts array & legacy t.screenshot / t.chartUrl)
        var hasChartsArr = Array.isArray(t.charts);
        var incomingCharts = hasChartsArr
          ? t.charts
          : ((t.screenshot || t.chartUrl)
              ? [{ label: 'Entry / Setup', screenshot: t.screenshot || '', chartUrl: t.chartUrl || '' }]
              : []);

        // Legacy fallback when payload omits charts altogether
        if (!hasChartsArr && incomingCharts.length === 0 && existingCharts.length > 0) {
          incomingCharts = existingCharts;
        }

        var resolvedCharts = [];
        var needsAuthWarning = false;

        for (var ci = 0; ci < incomingCharts.length; ci++) {
          var ch = incomingCharts[ci] || {};
          var label = String(ch.label || (ci === 0 ? 'Entry / Setup' : 'After / Chart ' + (ci + 1))).trim();
          var url = ch.chartUrl || '';

          if (!url && ch.screenshot && typeof ch.screenshot === 'string' && ch.screenshot.indexOf('base64') !== -1) {
            url = saveChartToDrive(ch.screenshot, t.tradeNum, t.symbol, label, ci + 1);
          }

          if (!url && existingCharts.length > 0) {
            var matchedExisting = existingCharts[ci];
            if (!matchedExisting) {
              for (var ei = 0; ei < existingCharts.length; ei++) {
                if (existingCharts[ei].label === label) {
                  matchedExisting = existingCharts[ei];
                  break;
                }
              }
            }
            if (matchedExisting && matchedExisting.chartUrl) {
              url = matchedExisting.chartUrl;
            }
          }

          if (url === 'AUTHORIZATION_NEEDED') {
            needsAuthWarning = true;
          } else if (url && url.indexOf('http') === 0) {
            resolvedCharts.push({ label: label, chartUrl: url });
          }
        }

        // Build RichTextValue for Column O (supports 1 or multiple clickable chart links in one cell)
        var rtBuilder = SpreadsheetApp.newRichTextValue();
        if (needsAuthWarning) {
          rtBuilder.setText('⚠️ Click Run "authorizePermissions" in Apps Script');
        } else if (resolvedCharts.length > 0) {
          var lines = [];
          for (var li = 0; li < resolvedCharts.length; li++) {
            lines.push('↗ ' + (resolvedCharts[li].label || ('Chart ' + (li + 1))));
          }
          var fullText = lines.join('\n');
          rtBuilder.setText(fullText);
          var offset = 0;
          for (var lj = 0; lj < lines.length; lj++) {
            var lineText = lines[lj];
            rtBuilder.setLinkUrl(offset, offset + lineText.length, resolvedCharts[lj].chartUrl);
            offset += lineText.length + 1;
          }
        } else {
          rtBuilder.setText('-');
        }
        colORichTexts.push([rtBuilder.build()]);

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
          '-'
        ];
      });

      sheet.getRange(2, 1, rows.length, 15).setValues(rows);
      var colORange = sheet.getRange(2, 15, rows.length, 1);
      colORange.setRichTextValues(colORichTexts);
      colORange.setWrap(true);

      // Format header row across 15 columns
      sheet.getRange(1, 1, 1, 15).setFontWeight("bold").setBackground("#131B2E").setFontColor("#FFFFFF");
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

function saveChartToDrive(base64Data, tradeNum, symbol, chartLabel, chartIndex) {
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
    var safeLabel = chartLabel
      ? '_' + String(chartLabel).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
      : '';
    var idxPart = chartIndex ? '_Chart' + chartIndex : '';
    var fileName = 'Trade_' + (tradeNum || 'X') + '_' + (symbol || 'Chart') + idxPart + safeLabel + '_' + Date.now() + ext;
    var blob = Utilities.newBlob(decoded, contentType, fileName);
    var file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}

    return file.getUrl();
  } catch (err) {
    Logger.log('Could not save chart to Drive: ' + err.toString());
    if (err.toString().indexOf('permission') !== -1 || err.toString().indexOf('DriveApp') !== -1) {
      return 'AUTHORIZATION_NEEDED';
    }
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

function sortTradesNewestFirst_(list) {
  return (list || []).slice().sort(function(a, b) {
    var numA = parseInt(a.tradeNum, 10) || 0;
    var numB = parseInt(b.tradeNum, 10) || 0;
    if (numB !== numA) return numB - numA;
    var timeA = a.date ? new Date(a.date).getTime() : 0;
    var timeB = b.date ? new Date(b.date).getTime() : 0;
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });
}

function extractChartsFromCell_(richText, formula, cellText) {
  var results = [];
  var seen = {};

  function addChart(label, url) {
    if (!url || typeof url !== 'string') return;
    var cleanUrl = url.trim();
    if (!cleanUrl || seen[cleanUrl]) return;
    seen[cleanUrl] = true;
    var cleanLabel = String(label || '')
      .replace(/^(?:📈|📊|🖼️|\u2197|•|-|\s)+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanLabel || cleanLabel === 'View Chart') {
      cleanLabel = results.length === 0 ? 'Entry / Setup' : 'After / Chart ' + (results.length + 1);
    }
    results.push({ label: cleanLabel, chartUrl: cleanUrl });
  }

  if (richText) {
    try {
      var runs = richText.getRuns ? richText.getRuns() : [];
      for (var i = 0; i < runs.length; i++) {
        var rUrl = runs[i].getLinkUrl ? (runs[i].getLinkUrl() || '') : '';
        if (rUrl) {
          addChart(runs[i].getText ? runs[i].getText() : '', rUrl);
        }
      }
    } catch (e) {}

    if (results.length === 0 && richText.getLinkUrl) {
      var singleUrl = richText.getLinkUrl() || '';
      if (singleUrl) addChart('Entry / Setup', singleUrl);
    }
  }

  if (results.length === 0 && formula) {
    var fMatch = String(formula).match(/https?:\/\/[^\s"\)]+/g);
    if (fMatch) {
      for (var fi = 0; fi < fMatch.length; fi++) {
        addChart('', fMatch[fi]);
      }
    }
  }

  if (results.length === 0 && cellText) {
    var rawStr = String(cellText);
    if (rawStr.indexOf('http') !== -1) {
      var cMatch = rawStr.match(/https?:\/\/[^\s"\)]+/g);
      if (cMatch) {
        for (var ci = 0; ci < cMatch.length; ci++) {
          addChart('', cMatch[ci]);
        }
      }
    }
  }

  return results;
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
    var formulas = sheet.getRange(2, 1, lastRow - 1, lastCol).getFormulas();
    var richTexts = [];
    try {
      richTexts = sheet.getRange(2, 1, lastRow - 1, lastCol).getRichTextValues();
    } catch (e) {}

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

      var parsedNum = parseInt(row[0], 10);
      var tradeNum = !isNaN(parsedNum) ? parsedNum : (isMissed ? 0 : (data.length - idx));

      // Extract all chart links + labels from Column 15 (Column O)
      var cellRt = (richTexts && richTexts[idx]) ? richTexts[idx][14] : null;
      var cellFm = (formulas && formulas[idx]) ? formulas[idx][14] : '';
      var extractedCharts = extractChartsFromCell_(cellRt, cellFm, row[14]);
      var chartUrl = extractedCharts.length > 0 ? extractedCharts[0].chartUrl : '';
      var chartUrls = extractedCharts.map(function(c) { return c.chartUrl; });
      var chartsList = extractedCharts.map(function(c, ci) {
        return {
          id: 'ch_' + tradeNum + '_' + ci,
          label: c.label,
          chartUrl: c.chartUrl,
          addedAt: dateStr
        };
      });

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
        charts: chartsList,
        chartUrl: chartUrl,
        chartUrls: chartUrls,
        hasScreenshot: chartsList.length > 0
      };
    });

    trades = sortTradesNewestFirst_(trades);

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
