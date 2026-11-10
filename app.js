/**
 * 100 Trades Journal — Phase 1 Mastery Application
 * Core Application Logic, Calculations, Chart.js Integrations & Event Handlers
 */

const TradeApp = (function() {
  const STORAGE_KEY_TRADES = '100_trades_journal_trades';
  const STORAGE_KEY_SETTINGS = '100_trades_journal_settings';

  let trades = [];
  let settings = {
    initialBalance: 10000,
    maxRiskPct: 1.0,
  };

  // Active filter state
  let currentFilter = {
    search: '',
    market: 'ALL',
    outcome: 'ALL',
    direction: 'ALL',
    plan: 'ALL'
  };

  // Chart instances
  let equityChart = null;
  let strategyChart = null;
  let disciplineChart = null;
  let marketChart = null;
  let chartMode = 'dollar'; // 'dollar' or 'r'

  // Initialize
  function init() {
    loadSettings();
    loadTrades();
    bindEvents();
    GoogleDriveSync.init();
    renderAll();
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        settings = Object.assign(settings, JSON.parse(saved));
      }
      const balanceInput = document.getElementById('setting-initial-balance');
      const riskInput = document.getElementById('setting-max-risk-pct');
      if (balanceInput) balanceInput.value = settings.initialBalance;
      if (riskInput) riskInput.value = settings.maxRiskPct;
    } catch (e) {
      console.warn('Could not load settings:', e);
    }
  }

  function saveSettings() {
    const balanceInput = document.getElementById('setting-initial-balance');
    const riskInput = document.getElementById('setting-max-risk-pct');
    if (balanceInput) settings.initialBalance = parseFloat(balanceInput.value) || 10000;
    if (riskInput) settings.maxRiskPct = parseFloat(riskInput.value) || 1.0;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    GoogleDriveSync.showToast('Settings saved successfully', 'success');
    renderKPIs();
  }

  function loadTrades() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRADES);
      if (saved) {
        trades = JSON.parse(saved);
      } else {
        trades = [];
      }
    } catch (e) {
      console.warn('Could not load trades:', e);
      trades = [];
    }
  }

  function saveTrades(triggerSync = true) {
    // Sort trades ascending by tradeNum
    trades.sort((a, b) => (parseInt(a.tradeNum, 10) || 0) - (parseInt(b.tradeNum, 10) || 0));
    localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(trades));
    renderAll();

    if (triggerSync) {
      // Auto sync to Drive in background if configured
      GoogleDriveSync.syncToDrive(trades);
    }
  }

  // Calculate high-precision statistics
  function calculateStats(tradeList = trades) {
    const closed = tradeList.filter(t => t.outcome !== 'OPEN' && t.exitPrice !== null && t.exitPrice !== '');
    const wins = closed.filter(t => t.outcome === 'WIN');
    const losses = closed.filter(t => t.outcome === 'LOSS');
    const bes = closed.filter(t => t.outcome === 'BE');

    const totalTradesCount = tradeList.length;
    const closedCount = closed.length;
    const winCount = wins.length;
    const lossCount = losses.length;
    const beCount = bes.length;

    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;

    let netPnL = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let totalRealizedR = 0;

    closed.forEach(t => {
      const pnl = parseFloat(t.realizedPnL) || 0;
      netPnL += pnl;
      if (pnl > 0) grossWins += pnl;
      if (pnl < 0) grossLosses += Math.abs(pnl);

      const r = parseFloat(t.realizedR) || 0;
      totalRealizedR += r;
    });

    const profitFactor = grossLosses > 0 ? (grossWins / grossLosses) : (grossWins > 0 ? 99.0 : 0);
    const avgWin = winCount > 0 ? grossWins / winCount : 0;
    const avgLoss = lossCount > 0 ? grossLosses / lossCount : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Discipline adherence
    const followedCount = tradeList.filter(t => t.planFollowed === true || t.planFollowed === 'true').length;
    const disciplineScore = totalTradesCount > 0 ? (followedCount / totalTradesCount) * 100 : 100;

    // Expectancy
    const expectancyDollar = closedCount > 0 ? (netPnL / closedCount) : 0;
    const expectancyR = closedCount > 0 ? (totalRealizedR / closedCount) : 0;

    // Streaks
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempWin = 0;
    let tempLoss = 0;

    closed.forEach(t => {
      if (t.outcome === 'WIN') {
        tempWin++;
        tempLoss = 0;
        if (tempWin > maxWinStreak) maxWinStreak = tempWin;
      } else if (t.outcome === 'LOSS') {
        tempLoss++;
        tempWin = 0;
        if (tempLoss > maxLossStreak) maxLossStreak = tempLoss;
      } else {
        tempWin = 0;
        tempLoss = 0;
      }
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
      winLossRatio,
      totalRealizedR,
      followedCount,
      disciplineScore,
      expectancyDollar,
      expectancyR,
      maxWinStreak,
      maxLossStreak
    };
  }

  // Render Top KPI Cards and 100-Trade Progress Bar
  function renderKPIs() {
    const stats = calculateStats();
    const count = stats.totalTradesCount;
    const pct = Math.min(100, Math.round((count / 100) * 100));

    // Milestone text
    document.getElementById('banner-progress-text').textContent = `${count} / 100 Trades (${pct}%)`;
    document.getElementById('banner-progress-bar').style.width = `${pct}%`;

    // Card 1: 100 Trades
    document.getElementById('kpi-trade-count').textContent = count;
    document.getElementById('kpi-trades-remaining').textContent = `${Math.max(0, 100 - count)} to go`;
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

    // Card 3: Win Rate
    document.getElementById('kpi-win-rate').textContent = `${stats.winRate.toFixed(1)}%`;
    document.getElementById('kpi-win-count').textContent = stats.winCount;
    document.getElementById('kpi-loss-count').textContent = stats.lossCount;
    document.getElementById('kpi-be-count').textContent = stats.beCount;

    // Card 4: Profit Factor
    document.getElementById('kpi-profit-factor').textContent = stats.profitFactor > 50 ? '99+' : stats.profitFactor.toFixed(2);
    document.getElementById('kpi-win-loss-ratio').textContent = `$${Math.round(stats.avgWin)} / $${Math.round(stats.avgLoss)}`;

    // Card 5: Realized R:R
    document.getElementById('kpi-avg-rr').textContent = `1:${stats.winLossRatio.toFixed(1)}`;
    document.getElementById('kpi-total-r').textContent = `${stats.totalRealizedR >= 0 ? '+' : ''}${stats.totalRealizedR.toFixed(1)}R`;

    // Card 6: Discipline Score
    const discEl = document.getElementById('kpi-discipline-score');
    discEl.textContent = `${Math.round(stats.disciplineScore)}%`;
    discEl.className = `text-2xl font-black ${stats.disciplineScore >= 80 ? 'text-tradeGreen' : 'text-amber-400'}`;
    document.getElementById('kpi-discipline-count').textContent = `${stats.followedCount} / ${stats.totalTradesCount}`;

    // Scorecard stats in Analytics Tab
    const expDollarEl = document.getElementById('stat-expectancy-dollar');
    if (expDollarEl) {
      expDollarEl.textContent = (stats.expectancyDollar >= 0 ? '+$' : '-$') + Math.abs(stats.expectancyDollar).toFixed(2);
      expDollarEl.className = `text-lg font-bold mt-1 ${stats.expectancyDollar >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`;
    }
    const expREl = document.getElementById('stat-expectancy-r');
    if (expREl) {
      expREl.textContent = (stats.expectancyR >= 0 ? '+' : '') + stats.expectancyR.toFixed(2) + 'R';
    }
    const winStreakEl = document.getElementById('stat-max-win-streak');
    if (winStreakEl) winStreakEl.textContent = `${stats.maxWinStreak} Trades`;
    const lossStreakEl = document.getElementById('stat-max-loss-streak');
    if (lossStreakEl) lossStreakEl.textContent = `${stats.maxLossStreak} Trades`;

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

  // Render Table
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
          (t.tradeNum && t.tradeNum.toString().includes(query));
        if (!matchesSearch) return false;
      }
      if (currentFilter.market !== 'ALL' && t.market !== currentFilter.market) return false;
      if (currentFilter.outcome !== 'ALL' && t.outcome !== currentFilter.outcome) return false;
      if (currentFilter.direction !== 'ALL' && t.direction !== currentFilter.direction) return false;
      if (currentFilter.plan !== 'ALL') {
        const isYes = t.planFollowed === true || t.planFollowed === 'true';
        if (currentFilter.plan === 'YES' && !isYes) return false;
        if (currentFilter.plan === 'NO' && isYes) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    } else {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }

    filtered.forEach(t => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-borderSubtle hover:bg-slate-800/40 cursor-pointer';

      const isLong = (t.direction || 'LONG').toUpperCase() === 'LONG';
      const outcome = t.outcome || 'OPEN';

      let outcomeBadgeClass = 'badge-outcome-open';
      if (outcome === 'WIN') outcomeBadgeClass = 'badge-outcome-win';
      else if (outcome === 'LOSS') outcomeBadgeClass = 'badge-outcome-loss';
      else if (outcome === 'BE') outcomeBadgeClass = 'badge-outcome-be';

      const pnlNum = parseFloat(t.realizedPnL) || 0;
      const formattedPnL = (pnlNum >= 0 ? '+$' : '-$') + Math.abs(pnlNum).toFixed(2);
      const pnlColorClass = pnlNum > 0 ? 'text-tradeGreen font-bold' : pnlNum < 0 ? 'text-tradeRed font-bold' : 'text-slate-400';

      const rNum = parseFloat(t.realizedR) || 0;
      const formattedR = (rNum >= 0 ? '+' : '') + rNum.toFixed(1) + 'R';

      const isFollowed = t.planFollowed === true || t.planFollowed === 'true';

      const dateStr = t.date ? new Date(t.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

      tr.innerHTML = `
        <td class="py-3 px-4 text-center font-bold text-slate-300">
          <span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 border border-slate-700 text-slate-300 text-[11px]">
            ${t.tradeNum || '-'}
          </span>
        </td>
        <td class="py-3 px-3 text-slate-400 whitespace-nowrap">${dateStr}</td>
        <td class="py-3 px-3">
          <div class="font-bold text-white flex items-center space-x-1.5">
            <span>${t.symbol || 'N/A'}</span>
            ${t.chartUrl ? `<a href="${t.chartUrl}" target="_blank" class="text-indigo-400 hover:text-indigo-300" title="View Chart Screenshot"><i data-lucide="image" class="w-3.5 h-3.5"></i></a>` : ''}
          </div>
        </td>
        <td class="py-3 px-3 text-slate-400">${t.market || 'Crypto'}</td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isLong ? 'badge-long' : 'badge-short'}">
            ${isLong ? 'BUY' : 'SELL'}
          </span>
        </td>
        <td class="py-3 px-3 text-right font-mono text-slate-300">$${formatNum(t.entryPrice)}</td>
        <td class="py-3 px-3 text-right font-mono text-slate-300">${t.exitPrice ? '$' + formatNum(t.exitPrice) : '<span class="text-slate-500">Open</span>'}</td>
        <td class="py-3 px-3 text-right font-mono text-indigo-400">1:${formatNum(t.plannedRR, 1)}</td>
        <td class="py-3 px-3 text-right font-mono ${pnlColorClass}">
          <div>${outcome === 'OPEN' ? '<span class="text-slate-500 font-normal">Holding</span>' : formattedPnL}</div>
          ${outcome !== 'OPEN' ? `<div class="text-[10px] text-slate-400">${formattedR}</div>` : ''}
        </td>
        <td class="py-3 px-3 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${outcomeBadgeClass}">
            ${outcome}
          </span>
        </td>
        <td class="py-3 px-3 text-slate-300 truncate max-w-[130px]" title="${t.strategy || ''}">${t.strategy || '-'}</td>
        <td class="py-3 px-3 text-center">
          ${isFollowed ? '<span class="text-emerald-400 font-bold" title="Followed Plan">✓</span>' : '<span class="text-rose-400 font-bold" title="Broke Rules">✗</span>'}
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

      // Clicking row opens detail view modal
      tr.addEventListener('click', () => openDetailModal(t));

      tbody.appendChild(tr);
    });

    // Bind action icons inside table
    tbody.querySelectorAll('.btn-edit-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        openTradeModal(id);
      });
    });

    tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm('Delete this trade entry?')) {
          deleteTrade(id);
        }
      });
    });

    lucide.createIcons();
  }

  function formatNum(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Render Charts in Analytics Tab
  function renderCharts() {
    renderEquityCurve();
    renderStrategyChart();
    renderDisciplineChart();
    renderMarketChart();
  }

  function renderEquityCurve() {
    const canvas = document.getElementById('equity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (equityChart) equityChart.destroy();

    const closed = trades.filter(t => t.outcome !== 'OPEN' && t.exitPrice !== null && t.exitPrice !== '');
    closed.sort((a, b) => (parseInt(a.tradeNum, 10) || 0) - (parseInt(b.tradeNum, 10) || 0));

    const labels = ['Start'];
    const pnlData = [0];
    let cumulative = 0;

    closed.forEach(t => {
      labels.push(`Trade #${t.tradeNum}`);
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
    gradient.addColorStop(1, 'rgba(11, 15, 25, 0)');

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
          pointBorderColor: '#131B2E',
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
            backgroundColor: '#0F172A',
            titleColor: '#F8FAFC',
            bodyColor: '#94A3B8',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
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
          x: {
            grid: { color: '#1E293B' },
            ticks: { color: '#64748B', font: { size: 10 } }
          },
          y: {
            grid: { color: '#1E293B' },
            ticks: {
              color: '#64748B',
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

    const stratMap = {};
    trades.forEach(t => {
      const s = t.strategy ? t.strategy.trim() : 'Unspecified';
      if (!stratMap[s]) stratMap[s] = { pnl: 0, wins: 0, count: 0 };
      stratMap[s].count++;
      stratMap[s].pnl += parseFloat(t.realizedPnL) || 0;
      if (t.outcome === 'WIN') stratMap[s].wins++;
    });

    const labels = Object.keys(stratMap).slice(0, 6);
    const data = labels.map(l => Math.round(stratMap[l].pnl));
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
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { color: '#1E293B' }, ticks: { color: '#64748B', font: { size: 9 } } },
          y: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } }
        }
      }
    });
  }

  function renderDisciplineChart() {
    const canvas = document.getElementById('discipline-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (disciplineChart) disciplineChart.destroy();

    let planYesPnL = 0;
    let planNoPnL = 0;

    trades.forEach(t => {
      const pnl = parseFloat(t.realizedPnL) || 0;
      const isYes = t.planFollowed === true || t.planFollowed === 'true';
      if (isYes) planYesPnL += pnl;
      else planNoPnL += pnl;
    });

    disciplineChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Plan Followed', 'Plan Broken'],
        datasets: [{
          label: 'Total P&L ($)',
          data: [Math.round(planYesPnL), Math.round(planNoPnL)],
          backgroundColor: [planYesPnL >= 0 ? '#10B981' : '#EF4444', planNoPnL >= 0 ? '#10B981' : '#EF4444'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#CBD5E1', font: { size: 10 } } },
          y: { grid: { color: '#1E293B' }, ticks: { color: '#64748B', font: { size: 9 } } }
        }
      }
    });
  }

  function renderMarketChart() {
    const canvas = document.getElementById('market-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (marketChart) marketChart.destroy();

    const markets = {};
    trades.forEach(t => {
      const m = t.market || 'Crypto';
      markets[m] = (markets[m] || 0) + 1;
    });

    const labels = Object.keys(markets);
    const data = labels.map(l => markets[l]);

    marketChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: ['#6366F1', '#10B981', '#38BDF8', '#F59E0B', '#EC4899', '#8B5CF6'],
          borderColor: '#131B2E',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94A3B8', font: { size: 10 } }
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

  // Live Modal Real-time Calculation
  function updateModalLiveCalculations() {
    const entry = parseFloat(document.getElementById('input-entry-price').value) || 0;
    const stopLoss = parseFloat(document.getElementById('input-stop-loss').value) || 0;
    const takeProfit = parseFloat(document.getElementById('input-take-profit').value) || 0;
    const exitPrice = parseFloat(document.getElementById('input-exit-price').value) || null;
    const quantity = parseFloat(document.getElementById('input-quantity').value) || 0;
    const fees = parseFloat(document.getElementById('input-fees').value) || 0;
    const isLong = document.getElementById('toggle-dir-long').classList.contains('active');

    // 1. Planned Risk
    let plannedRisk = 0;
    if (entry > 0 && stopLoss > 0 && quantity > 0) {
      plannedRisk = Math.abs(entry - stopLoss) * quantity;
    }
    document.getElementById('calc-planned-risk').textContent = `$${plannedRisk.toFixed(2)}`;

    // 2. Planned R:R
    let plannedRR = 0;
    if (entry > 0 && stopLoss > 0 && takeProfit > 0) {
      const riskPerUnit = Math.abs(entry - stopLoss);
      const rewardPerUnit = Math.abs(takeProfit - entry);
      if (riskPerUnit > 0) {
        plannedRR = rewardPerUnit / riskPerUnit;
      }
    }
    document.getElementById('calc-planned-rr').textContent = `1:${plannedRR.toFixed(1)}`;

    // 3. Realized PnL & R
    let realizedPnL = 0;
    let realizedR = 0;
    const pnlEl = document.getElementById('calc-realized-pnl');
    const rEl = document.getElementById('calc-realized-r');

    if (entry > 0 && exitPrice !== null && !isNaN(exitPrice) && quantity > 0) {
      if (isLong) {
        realizedPnL = (exitPrice - entry) * quantity - fees;
      } else {
        realizedPnL = (entry - exitPrice) * quantity - fees;
      }

      if (plannedRisk > 0) {
        realizedR = realizedPnL / plannedRisk;
      }

      pnlEl.textContent = (realizedPnL >= 0 ? '+$' : '-$') + Math.abs(realizedPnL).toFixed(2);
      pnlEl.className = `font-bold ${realizedPnL >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`;

      rEl.textContent = (realizedR >= 0 ? '+' : '') + realizedR.toFixed(1) + 'R';
      rEl.className = `font-bold ${realizedR >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`;

      // Auto update outcome dropdown if set to AUTO
      const outcomeSelect = document.getElementById('input-outcome');
      if (outcomeSelect.value === 'AUTO') {
        if (Math.abs(realizedPnL) < 1.0) outcomeSelect.dataset.autoVal = 'BE';
        else if (realizedPnL > 0) outcomeSelect.dataset.autoVal = 'WIN';
        else outcomeSelect.dataset.autoVal = 'LOSS';
      }
    } else {
      pnlEl.textContent = '$0.00';
      pnlEl.className = 'font-bold text-slate-300';
      rEl.textContent = '0.0R';
      rEl.className = 'font-bold text-slate-300';
    }
  }

  // Open Trade Modal for Add or Edit
  function openTradeModal(editId = null) {
    const modal = document.getElementById('modal-trade');
    const title = document.getElementById('modal-trade-title');
    const badge = document.getElementById('modal-trade-badge');
    const deleteBtn = document.getElementById('btn-delete-trade');
    const form = document.getElementById('form-trade');

    form.reset();
    document.getElementById('trade-id').value = '';

    if (editId) {
      const trade = trades.find(t => t.id === editId);
      if (!trade) return;

      document.getElementById('trade-id').value = trade.id;
      document.getElementById('input-trade-num').value = trade.tradeNum;
      document.getElementById('input-trade-date').value = trade.date ? trade.date.slice(0, 16) : '';
      document.getElementById('input-trade-market').value = trade.market || 'Crypto';
      document.getElementById('input-trade-symbol').value = trade.symbol || '';
      document.getElementById('input-entry-price').value = trade.entryPrice || '';
      document.getElementById('input-stop-loss').value = trade.stopLoss || '';
      document.getElementById('input-take-profit').value = trade.takeProfit || '';
      document.getElementById('input-exit-price').value = trade.exitPrice || '';
      document.getElementById('input-quantity').value = trade.quantity || '';
      document.getElementById('input-fees').value = trade.fees || 0;
      document.getElementById('input-outcome').value = trade.outcome || 'AUTO';
      document.getElementById('input-strategy').value = trade.strategy || '';
      document.getElementById('input-session').value = trade.session || 'New York Morning';
      document.getElementById('input-emotion').value = trade.emotion || 'Calm & Disciplined';
      document.getElementById('input-mistake').value = trade.mistake || 'None';
      document.getElementById('input-notes').value = trade.notes || '';
      document.getElementById('input-chart-url').value = trade.chartUrl || '';

      const isLong = (trade.direction || 'LONG').toUpperCase() === 'LONG';
      setDirection(isLong ? 'LONG' : 'SHORT');

      const planRadios = document.getElementsByName('plan_followed');
      const followed = trade.planFollowed === true || trade.planFollowed === 'true';
      planRadios[0].checked = followed;
      planRadios[1].checked = !followed;

      title.textContent = `Edit Trade #${trade.tradeNum}`;
      badge.textContent = `Trade #${trade.tradeNum} / 100`;
      deleteBtn.classList.remove('hidden');
    } else {
      // New Trade
      const nextNum = Math.min(100, trades.length + 1);
      document.getElementById('input-trade-num').value = nextNum;

      // Default date to current local datetime
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      document.getElementById('input-trade-date').value = now.toISOString().slice(0, 16);

      setDirection('LONG');
      title.textContent = `Log Trade #${nextNum}`;
      badge.textContent = `Phase 1: Trade #${nextNum} / 100`;
      deleteBtn.classList.add('hidden');
    }

    updateModalLiveCalculations();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('input-trade-symbol').focus();
  }

  function closeTradeModal() {
    const modal = document.getElementById('modal-trade');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function setDirection(dir) {
    const longBtn = document.getElementById('toggle-dir-long');
    const shortBtn = document.getElementById('toggle-dir-short');

    if (dir === 'LONG') {
      longBtn.className = 'dir-btn active py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1 bg-tradeGreen-bg border-tradeGreen text-tradeGreen';
      shortBtn.className = 'dir-btn py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1 bg-slate-900 border-slate-700 text-slate-400';
    } else {
      shortBtn.className = 'dir-btn active py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1 bg-tradeRed-bg border-tradeRed text-tradeRed';
      longBtn.className = 'dir-btn py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1 bg-slate-900 border-slate-700 text-slate-400';
    }
    updateModalLiveCalculations();
  }

  // Handle Form Submit
  function handleTradeFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('trade-id').value || 'tr_' + Date.now();
    const tradeNum = parseInt(document.getElementById('input-trade-num').value, 10) || 1;
    const date = document.getElementById('input-trade-date').value;
    const market = document.getElementById('input-trade-market').value;
    const symbol = document.getElementById('input-trade-symbol').value.trim().toUpperCase();
    const isLong = document.getElementById('toggle-dir-long').classList.contains('active');
    const direction = isLong ? 'LONG' : 'SHORT';

    const entryPrice = parseFloat(document.getElementById('input-entry-price').value) || 0;
    const stopLoss = parseFloat(document.getElementById('input-stop-loss').value) || 0;
    const takeProfit = parseFloat(document.getElementById('input-take-profit').value) || 0;
    const exitPriceInput = document.getElementById('input-exit-price').value;
    const exitPrice = exitPriceInput !== '' ? parseFloat(exitPriceInput) : null;
    const quantity = parseFloat(document.getElementById('input-quantity').value) || 0;
    const fees = parseFloat(document.getElementById('input-fees').value) || 0;

    // Calculations
    const plannedRisk = (entryPrice > 0 && stopLoss > 0 && quantity > 0)
      ? Math.abs(entryPrice - stopLoss) * quantity
      : 0;

    let plannedRR = 0;
    if (entryPrice > 0 && stopLoss > 0 && takeProfit > 0) {
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      const rewardPerUnit = Math.abs(takeProfit - entryPrice);
      if (riskPerUnit > 0) plannedRR = rewardPerUnit / riskPerUnit;
    }

    let realizedPnL = 0;
    let realizedR = 0;
    if (entryPrice > 0 && exitPrice !== null && !isNaN(exitPrice) && quantity > 0) {
      realizedPnL = isLong
        ? (exitPrice - entryPrice) * quantity - fees
        : (entryPrice - exitPrice) * quantity - fees;
      if (plannedRisk > 0) {
        realizedR = realizedPnL / plannedRisk;
      }
    }

    // Outcome determination
    const outcomeSelect = document.getElementById('input-outcome');
    let outcome = outcomeSelect.value;
    if (outcome === 'AUTO') {
      if (exitPrice === null || isNaN(exitPrice)) {
        outcome = 'OPEN';
      } else if (Math.abs(realizedPnL) < 1.0) {
        outcome = 'BE';
      } else if (realizedPnL > 0) {
        outcome = 'WIN';
      } else {
        outcome = 'LOSS';
      }
    }

    const strategy = document.getElementById('input-strategy').value.trim();
    const session = document.getElementById('input-session').value;
    const emotion = document.getElementById('input-emotion').value;
    const mistake = document.getElementById('input-mistake').value;
    const planRadios = document.getElementsByName('plan_followed');
    const planFollowed = planRadios[0].checked;
    const notes = document.getElementById('input-notes').value.trim();
    const chartUrl = document.getElementById('input-chart-url').value.trim();

    const tradeObj = {
      id,
      tradeNum,
      date,
      market,
      symbol,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      exitPrice,
      quantity,
      fees,
      plannedRisk,
      plannedRR,
      realizedPnL,
      realizedR,
      outcome,
      strategy,
      session,
      emotion,
      mistake,
      planFollowed,
      notes,
      chartUrl,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = trades.findIndex(t => t.id === id);
    if (existingIndex >= 0) {
      trades[existingIndex] = tradeObj;
      GoogleDriveSync.showToast(`Updated Trade #${tradeNum}`, 'success');
    } else {
      trades.push(tradeObj);
      GoogleDriveSync.showToast(`Logged Trade #${tradeNum} of 100!`, 'success');
    }

    saveTrades(true);
    closeTradeModal();
  }

  function deleteTrade(id) {
    trades = trades.filter(t => t.id !== id);
    saveTrades(true);
    GoogleDriveSync.showToast('Trade deleted', 'info');
    closeTradeModal();
  }

  // Open Trade Detail View Modal
  function openDetailModal(trade) {
    const modal = document.getElementById('modal-trade-detail');
    const title = document.getElementById('detail-modal-title');
    const content = document.getElementById('detail-modal-content');

    title.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="px-2 py-0.5 rounded text-xs font-bold bg-indigo-500/20 text-indigo-300">#${trade.tradeNum}</span>
        <span>${trade.symbol} (${trade.direction})</span>
      </div>
    `;

    const isLong = (trade.direction || 'LONG').toUpperCase() === 'LONG';
    const isWin = trade.outcome === 'WIN';
    const isLoss = trade.outcome === 'LOSS';

    content.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div class="p-3 bg-slate-900 rounded-xl">
          <span class="text-[10px] text-slate-400 block uppercase">Entry Price</span>
          <span class="text-sm font-bold text-white font-mono">$${formatNum(trade.entryPrice)}</span>
        </div>
        <div class="p-3 bg-slate-900 rounded-xl">
          <span class="text-[10px] text-slate-400 block uppercase">Exit Price</span>
          <span class="text-sm font-bold text-white font-mono">${trade.exitPrice ? '$' + formatNum(trade.exitPrice) : 'Open'}</span>
        </div>
        <div class="p-3 bg-slate-900 rounded-xl">
          <span class="text-[10px] text-slate-400 block uppercase">Net P&L</span>
          <span class="text-sm font-bold font-mono ${isWin ? 'text-tradeGreen' : isLoss ? 'text-tradeRed' : 'text-slate-300'}">
            ${trade.realizedPnL >= 0 ? '+$' : '-$'}${Math.abs(trade.realizedPnL || 0).toFixed(2)}
          </span>
        </div>
        <div class="p-3 bg-slate-900 rounded-xl">
          <span class="text-[10px] text-slate-400 block uppercase">Realized R</span>
          <span class="text-sm font-bold font-mono ${isWin ? 'text-tradeGreen' : isLoss ? 'text-tradeRed' : 'text-slate-300'}">
            ${trade.realizedR >= 0 ? '+' : ''}${(trade.realizedR || 0).toFixed(1)}R
          </span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
          <div class="text-slate-400">Stop Loss: <span class="text-white font-mono">$${formatNum(trade.stopLoss)}</span></div>
          <div class="text-slate-400">Take Profit: <span class="text-white font-mono">$${formatNum(trade.takeProfit)}</span></div>
          <div class="text-slate-400">Planned R:R: <span class="text-indigo-400 font-bold">1:${formatNum(trade.plannedRR, 1)}</span></div>
          <div class="text-slate-400">Risked Amount: <span class="text-rose-400 font-mono">$${formatNum(trade.plannedRisk)}</span></div>
        </div>
        <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
          <div class="text-slate-400">Strategy: <span class="text-white font-semibold">${trade.strategy || 'None'}</span></div>
          <div class="text-slate-400">Session: <span class="text-white">${trade.session || 'N/A'}</span></div>
          <div class="text-slate-400">Pre-Trade Emotion: <span class="text-purple-300">${trade.emotion || 'Calm'}</span></div>
          <div class="text-slate-400">Discipline Check: <span class="${trade.planFollowed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">${trade.planFollowed ? '✓ Plan Followed' : '✗ Rules Broken'}</span></div>
        </div>
      </div>

      ${trade.notes ? `
        <div class="p-3 bg-slate-900/40 rounded-xl border border-slate-800">
          <div class="text-slate-400 font-semibold mb-1 uppercase text-[10px]">Trade Notes & Execution Review</div>
          <div class="text-slate-200 leading-relaxed whitespace-pre-wrap">${trade.notes}</div>
        </div>
      ` : ''}

      ${trade.chartUrl ? `
        <div class="p-3 bg-slate-900/40 rounded-xl border border-slate-800">
          <div class="text-slate-400 font-semibold mb-2 uppercase text-[10px]">Chart Screenshot</div>
          <a href="${trade.chartUrl}" target="_blank" class="block rounded-lg overflow-hidden border border-slate-700 hover:opacity-90 transition">
            <img src="${trade.chartUrl}" alt="Trade Chart" class="w-full max-h-64 object-contain bg-black" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'text-indigo-400 underline\\'>${trade.chartUrl}</span>';" />
          </a>
        </div>
      ` : ''}

      <div class="pt-3 border-t border-borderSubtle flex items-center justify-end space-x-2">
        <button id="detail-btn-edit" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition">Edit Trade</button>
      </div>
    `;

    document.getElementById('detail-btn-edit').addEventListener('click', () => {
      modal.classList.add('hidden');
      openTradeModal(trade.id);
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
  }

  // Load realistic sample data so trader can immediately preview the 100-trade baseline
  function loadDemoTrades() {
    const sampleSet = [
      {
        id: 'tr_demo_1', tradeNum: 1, date: '2026-10-15T09:35', market: 'Crypto', symbol: 'BTCUSDT', direction: 'LONG',
        entryPrice: 66500, stopLoss: 65800, takeProfit: 68600, exitPrice: 68500, quantity: 0.25, fees: 5.0,
        plannedRisk: 175, plannedRR: 3.0, realizedPnL: 495.0, realizedR: 2.83, outcome: 'WIN',
        strategy: 'Fair Value Gap / Liquidity Sweep', session: 'New York Morning', emotion: 'Calm & Disciplined', mistake: 'None', planFollowed: true,
        notes: 'Swept 15m liquidity during NY open. Clean displacement into 5m FVG with high volume. Followed plan completely.'
      },
      {
        id: 'tr_demo_2', tradeNum: 2, date: '2026-10-16T10:15', market: 'Stocks', symbol: 'NVDA', direction: 'LONG',
        entryPrice: 135.0, stopLoss: 133.5, takeProfit: 139.5, exitPrice: 133.5, quantity: 100, fees: 2.0,
        plannedRisk: 150, plannedRR: 3.0, realizedPnL: -152.0, realizedR: -1.01, outcome: 'LOSS',
        strategy: 'Opening Range Breakout (ORB)', session: 'New York Morning', emotion: 'Confident / Prepared', mistake: 'None', planFollowed: true,
        notes: 'ORB broke high but tech selloff dragged market down. Stop loss respected without hesitation. Good loss.'
      },
      {
        id: 'tr_demo_3', tradeNum: 3, date: '2026-10-18T04:20', market: 'Forex', symbol: 'EURUSD', direction: 'SHORT',
        entryPrice: 1.0850, stopLoss: 1.0875, takeProfit: 1.0800, exitPrice: 1.0802, quantity: 100000, fees: 4.0,
        plannedRisk: 250, plannedRR: 2.0, realizedPnL: 476.0, realizedR: 1.90, outcome: 'WIN',
        strategy: '20 EMA Trend Pullback', session: 'London Open', emotion: 'Calm & Disciplined', mistake: 'None', planFollowed: true,
        notes: 'London session continuation downward. Clean rejection of 1h 20 EMA.'
      },
      {
        id: 'tr_demo_4', tradeNum: 4, date: '2026-10-20T14:10', market: 'Futures', symbol: 'NQ', direction: 'LONG',
        entryPrice: 20250, stopLoss: 20200, takeProfit: 20400, exitPrice: 20380, quantity: 2, fees: 8.0,
        plannedRisk: 200, plannedRR: 3.0, realizedPnL: 512.0, realizedR: 2.56, outcome: 'WIN',
        strategy: 'Supply / Demand Order Block', session: 'New York Afternoon', emotion: 'Calm & Disciplined', mistake: 'None', planFollowed: true,
        notes: 'Bounced right out of daily demand zone during late afternoon squeeze.'
      },
      {
        id: 'tr_demo_5', tradeNum: 5, date: '2026-10-22T11:00', market: 'Crypto', symbol: 'ETHUSDT', direction: 'SHORT',
        entryPrice: 2620, stopLoss: 2650, takeProfit: 2540, exitPrice: 2652, quantity: 5, fees: 6.0,
        plannedRisk: 150, plannedRR: 2.67, realizedPnL: -166.0, realizedR: -1.11, outcome: 'LOSS',
        strategy: 'Breakout & Retest', session: 'New York Morning', emotion: 'FOMO / Chasing', mistake: 'Chased Entry', planFollowed: false,
        notes: 'Entered late after candle had already extended 15 points. Poor execution due to impatience.'
      },
      {
        id: 'tr_demo_6', tradeNum: 6, date: '2026-10-25T09:45', market: 'Stocks', symbol: 'SPY', direction: 'LONG',
        entryPrice: 580.20, stopLoss: 578.80, takeProfit: 584.00, exitPrice: 583.90, quantity: 150, fees: 3.0,
        plannedRisk: 210, plannedRR: 2.71, realizedPnL: 552.0, realizedR: 2.63, outcome: 'WIN',
        strategy: 'Fair Value Gap / Liquidity Sweep', session: 'New York Morning', emotion: 'Calm & Disciplined', mistake: 'None', planFollowed: true,
        notes: 'Classic opening drive liquidity sweep.'
      },
      {
        id: 'tr_demo_7', tradeNum: 7, date: '2026-10-28T13:30', market: 'Futures', symbol: 'ES', direction: 'SHORT',
        entryPrice: 5860, stopLoss: 5875, takeProfit: 5820, exitPrice: 5860, quantity: 2, fees: 6.0,
        plannedRisk: 150, plannedRR: 2.67, realizedPnL: -6.0, realizedR: -0.04, outcome: 'BE',
        strategy: 'Mean Reversion / VWAP', session: 'New York Afternoon', emotion: 'Calm & Disciplined', mistake: 'None', planFollowed: true,
        notes: 'Market stalled at 1R profit, moved stop to breakeven before choppy news event.'
      },
      {
        id: 'tr_demo_8', tradeNum: 8, date: '2026-11-01T10:00', market: 'Crypto', symbol: 'SOLUSDT', direction: 'LONG',
        entryPrice: 175.0, stopLoss: 170.0, takeProfit: 190.0, exitPrice: 189.5, quantity: 30, fees: 4.0,
        plannedRisk: 150, plannedRR: 3.0, realizedPnL: 431.0, realizedR: 2.87, outcome: 'WIN',
        strategy: 'Breakout & Retest', session: 'New York Morning', emotion: 'Confident / Prepared', mistake: 'None', planFollowed: true,
        notes: 'Daily resistance breakout with huge spot volume confirmation.'
      }
    ];

    trades = sampleSet;
    saveTrades(true);
    GoogleDriveSync.showToast('Loaded 8 demo trades to preview analytics!', 'success');
  }

  // Bind all event listeners
  function bindEvents() {
    // Nav tabs
    const tabs = [
      { btn: 'nav-btn-trades', view: 'view-trades' },
      { btn: 'nav-btn-analytics', view: 'view-analytics' },
      { btn: 'nav-btn-roadmap', view: 'view-roadmap' },
      { btn: 'nav-btn-gdrive', view: 'view-gdrive' },
    ];

    tabs.forEach(tab => {
      const btnEl = document.getElementById(tab.btn);
      if (!btnEl) return;
      btnEl.addEventListener('click', () => {
        tabs.forEach(t => {
          document.getElementById(t.btn).className = 'nav-tab px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all text-slate-400 hover:text-white hover:bg-slate-800';
          document.getElementById(t.view).classList.add('hidden');
        });
        btnEl.className = 'nav-tab active px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all text-white bg-indigo-600 shadow-sm';
        document.getElementById(tab.view).classList.remove('hidden');

        if (tab.view === 'view-analytics') {
          renderCharts();
        }
      });
    });

    // Header buttons
    document.getElementById('btn-open-new-trade').addEventListener('click', () => openTradeModal());
    document.getElementById('header-gdrive-pill').addEventListener('click', () => document.getElementById('nav-btn-gdrive').click());
    document.getElementById('btn-backup-drive').addEventListener('click', () => GoogleDriveSync.syncToDrive());
    document.getElementById('btn-export-csv').addEventListener('click', () => GoogleDriveSync.exportCsv(trades));
    document.getElementById('btn-load-samples').addEventListener('click', () => {
      if (confirm('Load demo trades to preview analytics? (Will replace empty journal)')) {
        loadDemoTrades();
      }
    });

    // Empty state buttons
    const emptyAdd = document.getElementById('btn-empty-add-trade');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openTradeModal());
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

    document.getElementById('btn-show-netlify-guide').addEventListener('click', () => {
      settingsModal.classList.remove('hidden');
      settingsModal.classList.add('flex');
    });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all 100 trades? This cannot be undone.')) {
        trades = [];
        saveTrades(true);
        settingsModal.classList.add('hidden');
        settingsModal.classList.remove('flex');
        GoogleDriveSync.showToast('All trades reset. Ready for Trade #1.', 'info');
      }
    });

    // Trade Modal Controls
    document.getElementById('btn-close-trade-modal').addEventListener('click', closeTradeModal);
    document.getElementById('btn-cancel-trade').addEventListener('click', closeTradeModal);
    document.getElementById('form-trade').addEventListener('submit', handleTradeFormSubmit);
    document.getElementById('btn-delete-trade').addEventListener('click', () => {
      const id = document.getElementById('trade-id').value;
      if (id && confirm('Delete this trade?')) {
        deleteTrade(id);
      }
    });

    // Direction Toggle
    document.getElementById('toggle-dir-long').addEventListener('click', () => setDirection('LONG'));
    document.getElementById('toggle-dir-short').addEventListener('click', () => setDirection('SHORT'));

    // Real-time calculation on inputs
    document.querySelectorAll('.calc-input').forEach(input => {
      input.addEventListener('input', updateModalLiveCalculations);
    });

    // Quick Symbol Tags
    document.querySelectorAll('.quick-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const symbolInput = document.getElementById('input-trade-symbol');
        symbolInput.value = tag.textContent.trim();
        updateModalLiveCalculations();
      });
    });

    // Trade Detail Modal Close
    document.getElementById('btn-close-detail-modal').addEventListener('click', () => {
      const modal = document.getElementById('modal-trade-detail');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });

    // Filters
    document.getElementById('filter-search').addEventListener('input', (e) => {
      currentFilter.search = e.target.value;
      renderTable();
    });
    document.getElementById('filter-market').addEventListener('change', (e) => {
      currentFilter.market = e.target.value;
      renderTable();
    });
    document.getElementById('filter-outcome').addEventListener('change', (e) => {
      currentFilter.outcome = e.target.value;
      renderTable();
    });
    document.getElementById('filter-direction').addEventListener('change', (e) => {
      currentFilter.direction = e.target.value;
      renderTable();
    });
    document.getElementById('filter-plan').addEventListener('change', (e) => {
      currentFilter.plan = e.target.value;
      renderTable();
    });

    // Chart Mode Toggle
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

    document.getElementById('btn-view-apps-script').addEventListener('click', () => {
      alert(
        "Google Apps Script Code is available in google-apps-script.js in your project folder!\n\n" +
        "1. Open drive.google.com -> Create a Google Sheet.\n" +
        "2. Click Extensions -> Apps Script.\n" +
        "3. Paste the code from google-apps-script.js and click Deploy as Web App.\n" +
        "4. Paste your Web App URL into the Webhook input above."
      );
    });
  }

  return {
    init,
    getTrades: () => trades,
    setTrades: (newTrades) => {
      trades = newTrades;
      saveTrades(false);
    },
    calculateStats
  };
})();

// Start App when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  TradeApp.init();
});
