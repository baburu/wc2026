// ══════════════════════════════════════════════════════
//  Shared Performance Ticker — IPO Stock Market Model
//  Loaded on EVERY page (index.html, article.html, etc.)
//  Wrapped in an IIFE so it never collides with script.js's
//  own variables when both are loaded on the same page.
// ══════════════════════════════════════════════════════
(function () {
  const LEAD_ENDPOINT         = '/preview';
  const SCORING_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8fEdr0djoTa4bc8diSdwH2xSDJ4JTlNgHUWho8lQ5btMR9Joe3sXhZPP72oTSE9MBdoYKrY4DlFl9/pub?gid=865998988&single=true&output=csv';

  const PLAYER_NAMES = new Set([
    'Babu', 'Hotarou', 'Ziggs', 'Trel', 'Scorpy', 'Pyro', 'Edna', 'BimBim',
    'Squally', 'Hype', 'Sunny', 'D4', 'Nyte', 'Pffq',
  ]);

  const IPO_PRICE     = 100;
  const TICKER_WINDOW = 5;

  async function fetchFresh(url) {
    const sep = url.includes('?') ? '&' : '?';
    return fetch(`${url}${sep}_cb=${Date.now()}`, { cache: 'no-store' });
  }

  async function buildTickerData() {
    const freshLeadEndpoint = `${LEAD_ENDPOINT}?_cb=${Date.now()}`;
    const [overallRes, scoringRes] = await Promise.all([
      fetch(freshLeadEndpoint).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchFresh(SCORING_SHEET_CSV_URL).catch(() => null),
    ]);

    if (!overallRes || !overallRes.ok || !overallRes.players.length) return null;

    const playerSeq = {};

    if (scoringRes && scoringRes.ok) {
      const csvText = await scoringRes.text();
      const rows = csvText.split(/\r?\n/).map(row => row.split(','));

      const headerRow = rows[2] || [];
      const colToPlayer = {};
      headerRow.forEach((cell, idx) => {
        const name = cell.trim();
        if (PLAYER_NAMES.has(name)) {
          colToPlayer[idx] = name;
          playerSeq[name]  = [];
        }
      });

      const playerCols = Object.keys(colToPlayer).map(Number);

      for (let r = 3; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length < 3) continue;

        const matchNumStr = (row[1] || '').trim();
        const matchNum = parseInt(matchNumStr, 10);

        if (isNaN(matchNum) || matchNum < 1 || matchNum > 104) continue;

        const isPlayedRow = playerCols.some(idx => {
          const v = (row[idx] || '').trim();
          return v === '1' || v === '0';
        });
        if (!isPlayedRow) continue;

        playerCols.forEach(idx => {
          const name = colToPlayer[idx];
          const val  = (row[idx] || '').trim();
          if (val === '1') playerSeq[name].push(1);
          if (val === '0') playerSeq[name].push(0);
        });
      }
    }

    function getPrice(name) {
      const seq = playerSeq[name] || [];
      if (!seq.length) return IPO_PRICE;
      const net = seq.reduce((a, b) => a + (b === 1 ? 1 : -1), 0);
      return IPO_PRICE + net;
    }

    function getChange(name) {
      const seq = playerSeq[name] || [];
      if (seq.length < TICKER_WINDOW + 1) return { pct: null, trend: 'flat' };

      const window   = seq.slice(-TICKER_WINDOW);
      const netMoves = window.reduce((a, b) => a + (b === 1 ? 1 : -1), 0);

      const before    = seq.slice(0, -TICKER_WINDOW);
      const beforeNet = before.reduce((a, b) => a + (b === 1 ? 1 : -1), 0);
      const basePrice = IPO_PRICE + beforeNet;

      const pct = (netMoves / basePrice) * 100;

      return {
        pct,
        net:   netMoves,
        trend: netMoves > 0 ? 'up' : netMoves < 0 ? 'down' : 'flat',
      };
    }

    return overallRes.players.map((p, i) => {
      const price  = getPrice(p.name);
      const change = getChange(p.name);
      return {
        rank:   i + 1,
        name:   p.name,
        price,
        ytd:    price - IPO_PRICE,
        change,
        played: (playerSeq[p.name] || []).length,
      };
    });
  }

  function renderTickerItem(p) {
    const priceStr = '$' + p.price.toFixed(2);

    const ytdPct  = ((p.price - IPO_PRICE) / IPO_PRICE) * 100;
    const ytdSign = ytdPct >= 0 ? '+' : '';
    const ytdCls  = ytdPct > 0 ? 'up' : ytdPct < 0 ? 'down' : 'flat';

    let changeStr = '';
    let changeCls = 'flat';
    let arrow     = '●';

    if (p.change.pct !== null) {
      const sign = p.change.pct >= 0 ? '+' : '';
      changeStr  = sign + p.change.pct.toFixed(2) + '%';
      changeCls  = p.change.trend;
      arrow      = p.change.trend === 'up' ? '▲' : p.change.trend === 'down' ? '▼' : '●';
    }

    const tooltip = [
      p.name,
      `Price: ${priceStr}`,
      `YTD: ${ytdSign}${ytdPct.toFixed(2)}%`,
      p.change.pct !== null ? `Last ${TICKER_WINDOW}: ${arrow}${changeStr}` : '',
      `${p.played} predictions`,
    ].filter(Boolean).join(' · ');

    return `<span class="ticker-item" title="${tooltip}">
      <span class="ticker-rank">${p.rank}</span>
      <span class="ticker-name">${p.name}</span>
      <span class="ticker-price">${priceStr}</span>
      <span class="ticker-ytd ${ytdCls}">${ytdSign}${ytdPct.toFixed(2)}%</span>
      ${p.change.pct !== null
        ? `<span class="ticker-delta ${changeCls}">${arrow}${changeStr}</span>`
        : ''}
    </span>`;
  }

  async function initTicker() {
    const track = document.getElementById('ticker-track');
    if (!track) return;

    try {
      const players = await buildTickerData();

      if (!players || !players.length) {
        track.innerHTML = `<span class="ticker-loading">World Cup 2026 — Predictions League</span>`;
        return;
      }

      const html = players.map(renderTickerItem).join('');
      track.innerHTML = html + html;
      track.classList.add('running');

      const totalW = track.scrollWidth / 2;
      const speed = Math.max(30, Math.min(60, totalW / 80));
      track.style.animationDuration = speed + 's';
    } catch (e) {
      // Fall back to the static label rather than leaving a blank/error state
      track.innerHTML = `<span class="ticker-loading">World Cup 2026 — Predictions League</span>`;
    }
  }

  // Expose globally ONLY as initTicker — this lets script.js's refresh
  // button re-trigger it on index.html without redefining anything else.
  window.initTicker = initTicker;

  // Run automatically as soon as this file loads, on every page.
  initTicker();
})();