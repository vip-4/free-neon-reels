/*!
 * Neon Reels — lightweight browser slot machine
 * Zero dependencies. ~9 KB unminified. MIT licensed.
 * Virtual credits only. No real money, no network requests, no tracking.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Game model
   * ------------------------------------------------------------------ */

  var SYMBOLS = [
    { id: 'cherry',  glyph: '\uD83C\uDF52',            label: 'Cherry',  weight: 30, mult: 2  },
    { id: 'lemon',   glyph: '\uD83C\uDF4B',            label: 'Lemon',   weight: 25, mult: 3  },
    { id: 'bell',    glyph: '\uD83D\uDD14',            label: 'Bell',    weight: 18, mult: 5  },
    { id: 'star',    glyph: '\u2B50',                  label: 'Star',    weight: 12, mult: 10 },
    { id: 'seven',   glyph: '<b class="seven">7</b>',  label: 'Seven',   weight: 9,  mult: 25 },
    { id: 'diamond', glyph: '\uD83D\uDC8E',            label: 'Diamond', weight: 6,  mult: 50 }
  ];

  var TOTAL_WEIGHT = SYMBOLS.reduce(function (a, s) { return a + s.weight; }, 0);

  // Row index triples for each of the five fixed paylines (left to right).
  var LINES = [
    { id: 1, rows: [0, 0, 0], name: 'Top row' },
    { id: 2, rows: [1, 1, 1], name: 'Middle row' },
    { id: 3, rows: [2, 2, 2], name: 'Bottom row' },
    { id: 4, rows: [0, 1, 2], name: 'Downward V' },
    { id: 5, rows: [2, 1, 0], name: 'Upward V' }
  ];

  // Diamond scatter: pays on total diamonds anywhere on the 9-cell grid.
  var SCATTER = { 3: 2, 4: 5, 5: 10, 6: 25, 7: 50, 8: 50, 9: 50 };

  var BETS = [5, 10, 25, 50, 100];
  var START_BALANCE = 1000;
  var TOPUP = 500;
  var STORAGE_KEY = 'neonreels:v1';

  var state = {
    balance: START_BALANCE,
    betIndex: 1,
    spinning: false,
    sound: true,
    best: START_BALANCE
  };

  /* ------------------------------------------------------------------ *
   * Persistence (fails silently in private / sandboxed contexts)
   * ------------------------------------------------------------------ */

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (typeof d.balance === 'number' && isFinite(d.balance)) state.balance = Math.max(0, Math.floor(d.balance));
      if (typeof d.betIndex === 'number' && BETS[d.betIndex]) state.betIndex = d.betIndex;
      if (typeof d.sound === 'boolean') state.sound = d.sound;
      if (typeof d.best === 'number' && isFinite(d.best)) state.best = d.best;
    } catch (e) { /* ignore */ }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        balance: state.balance, betIndex: state.betIndex, sound: state.sound, best: state.best
      }));
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ *
   * Cryptographically seeded RNG
   * ------------------------------------------------------------------ */

  var cryptoObj = window.crypto || window.msCrypto;
  var buffer = new Uint32Array(1);

  function rand() {
    if (cryptoObj && cryptoObj.getRandomValues) {
      cryptoObj.getRandomValues(buffer);
      return buffer[0] / 4294967296;
    }
    return Math.random();
  }

  function drawSymbol() {
    var roll = rand() * TOTAL_WEIGHT;
    for (var i = 0; i < SYMBOLS.length; i++) {
      roll -= SYMBOLS[i].weight;
      if (roll < 0) return SYMBOLS[i];
    }
    return SYMBOLS[0];
  }

  /* ------------------------------------------------------------------ *
   * Audio — synthesised on demand, no asset downloads
   * ------------------------------------------------------------------ */

  var audioCtx = null;

  function ensureAudio() {
    if (!state.sound) return null;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) {
      try { audioCtx = new Ctx(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function blip(freq, duration, type, gain, delay) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function sfxStop() { blip(320, 0.09, 'triangle', 0.045, 0); }

  function sfxWin(tier) {
    var notes = tier > 1 ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach(function (f, i) { blip(f, 0.16, 'sine', 0.06, i * 0.075); });
  }

  /* ------------------------------------------------------------------ *
   * DOM handles
   * ------------------------------------------------------------------ */

  var el = {};
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function cacheDom() {
    el.reels = Array.prototype.slice.call(document.querySelectorAll('.reel'));
    el.balance = document.getElementById('balance');
    el.bet = document.getElementById('bet');
    el.win = document.getElementById('win');
    el.best = document.getElementById('best');
    el.spin = document.getElementById('spin');
    el.betDown = document.getElementById('bet-down');
    el.betUp = document.getElementById('bet-up');
    el.topup = document.getElementById('topup');
    el.sound = document.getElementById('sound');
    el.status = document.getElementById('status');
    el.result = document.getElementById('result');
    el.machine = document.getElementById('machine');
    el.reset = document.getElementById('reset');
  }

  function money(n) { return n.toLocaleString('en-US'); }

  function renderHud() {
    el.balance.textContent = money(state.balance);
    el.bet.textContent = money(BETS[state.betIndex]);
    el.best.textContent = money(state.best);
    var bet = BETS[state.betIndex];
    el.spin.disabled = state.spinning || state.balance < bet;
    el.betDown.disabled = state.spinning || state.betIndex === 0;
    el.betUp.disabled = state.spinning || state.betIndex === BETS.length - 1;
    el.topup.hidden = state.balance >= BETS[state.betIndex];
  }

  function announce(text) {
    el.result.textContent = text;
  }

  /* ------------------------------------------------------------------ *
   * Reel rendering
   * ------------------------------------------------------------------ */

  function cellHtml(symbol) {
    return '<div class="cell"><span class="glyph" aria-hidden="true">' + symbol.glyph + '</span></div>';
  }

  function resetReel(reel, columnSymbols) {
    var strip = reel.querySelector('.strip');
    strip.style.transition = 'none';
    strip.style.transform = 'translate3d(0,0,0)';
    strip.innerHTML = columnSymbols.map(cellHtml).join('');
    // Force reflow so the next transition is not batched away.
    void strip.offsetHeight;
  }

  function spinReel(reel, columnSymbols, index, done) {
    var strip = reel.querySelector('.strip');
    var filler = 14 + index * 4;
    var html = '';
    for (var i = 0; i < filler; i++) html += cellHtml(drawSymbol());
    for (var j = 0; j < 3; j++) html += cellHtml(columnSymbols[j]);

    strip.style.transition = 'none';
    strip.style.transform = 'translate3d(0,0,0)';
    strip.innerHTML = html;
    void strip.offsetHeight;

    var cellH = strip.firstElementChild.getBoundingClientRect().height || 92;
    var distance = (filler) * cellH;
    var duration = 760 + index * 190;

    strip.style.transition = 'transform ' + duration + 'ms cubic-bezier(.15,.72,.16,1)';
    strip.style.transform = 'translate3d(0,' + (-distance) + 'px,0)';

    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      resetReel(reel, columnSymbols);
      sfxStop();
      done();
    }
    strip.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, duration + 90); // safety net
  }

  /* ------------------------------------------------------------------ *
   * Evaluation
   * ------------------------------------------------------------------ */

  function evaluate(grid, totalBet) {
    var lineBet = totalBet / LINES.length;
    var wins = [];
    var total = 0;
    var winningCells = new Set();

    LINES.forEach(function (line) {
      var a = grid[0][line.rows[0]];
      var b = grid[1][line.rows[1]];
      var c = grid[2][line.rows[2]];
      if (a.id === b.id && b.id === c.id) {
        var amount = Math.round(lineBet * a.mult);
        total += amount;
        wins.push({ line: line, symbol: a, amount: amount });
        winningCells.add('0-' + line.rows[0]);
        winningCells.add('1-' + line.rows[1]);
        winningCells.add('2-' + line.rows[2]);
      }
    });

    var diamonds = 0;
    for (var col = 0; col < 3; col++) {
      for (var row = 0; row < 3; row++) {
        if (grid[col][row].id === 'diamond') {
          diamonds++;
          winningCells.add(col + '-' + row);
        }
      }
    }

    var scatterWin = 0;
    if (diamonds >= 3) {
      scatterWin = Math.round(totalBet * SCATTER[Math.min(diamonds, 9)]);
      total += scatterWin;
    }

    return { total: total, wins: wins, diamonds: diamonds, scatterWin: scatterWin, winningCells: winningCells };
  }

  function highlight(cells) {
    var nodes = el.machine.querySelectorAll('.cell');
    Array.prototype.forEach.call(nodes, function (n) { n.classList.remove('win'); });
    if (!cells || !cells.size) return;
    el.reels.forEach(function (reel, col) {
      var strip = reel.querySelector('.strip');
      Array.prototype.forEach.call(strip.children, function (cellNode, row) {
        if (cells.has(col + '-' + row)) cellNode.classList.add('win');
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Spin cycle
   * ------------------------------------------------------------------ */

  function spin() {
    if (state.spinning) return;
    var bet = BETS[state.betIndex];
    if (state.balance < bet) {
      announce('Not enough credits. Claim a free top-up to keep playing.');
      return;
    }

    state.spinning = true;
    state.balance -= bet;
    el.win.textContent = '0';
    highlight(null);
    el.status.textContent = 'Spinning…';
    announce('Spinning. Bet ' + money(bet) + ' credits.');
    renderHud();

    // Build the outcome grid up-front: 3 columns x 3 rows.
    var grid = [[], [], []];
    for (var c = 0; c < 3; c++) {
      for (var r = 0; r < 3; r++) grid[c].push(drawSymbol());
    }

    var pending = 3;
    var results = [];

    function onReelDone() {
      pending--;
      if (pending > 0) return;

      var res = evaluate(grid, bet);
      results = res;

      highlight(res.winningCells);
      el.win.textContent = money(res.total);

      if (res.total > 0) {
        state.balance += res.total;
        if (state.balance > state.best) state.best = state.balance;
        var tier = res.total >= bet * 10 ? 2 : 1;
        sfxWin(tier);
        el.status.textContent = 'Win';
        announce(describeWin(res, bet));
      } else {
        el.status.textContent = 'No win';
        announce('No win this spin. Balance ' + money(state.balance) + ' credits.');
      }

      state.spinning = false;
      save();
      renderHud();
    }

    el.reels.forEach(function (reel, i) {
      if (prefersReduced) {
        resetReel(reel, grid[i]);
        setTimeout(onReelDone, 0);
      } else {
        setTimeout(function () { spinReel(reel, grid[i], i, onReelDone); }, i * 60);
      }
    });
  }

  function describeWin(res, bet) {
    var parts = [];
    res.wins.forEach(function (w) {
      parts.push(w.line.name + ': three ' + w.symbol.label + ' for ' + money(w.amount));
    });
    if (res.scatterWin > 0) {
      parts.push(res.diamonds + ' diamonds for ' + money(res.scatterWin));
    }
    return 'Win ' + money(res.total) + ' credits. ' + parts.join('. ') + '.';
  }

  /* ------------------------------------------------------------------ *
   * Controls
   * ------------------------------------------------------------------ */

  function bind() {
    el.spin.addEventListener('click', spin);

    el.betDown.addEventListener('click', function () {
      if (state.betIndex > 0) { state.betIndex--; save(); renderHud(); }
    });

    el.betUp.addEventListener('click', function () {
      if (state.betIndex < BETS.length - 1) { state.betIndex++; save(); renderHud(); }
    });

    el.topup.addEventListener('click', function () {
      state.balance += TOPUP;
      if (state.balance > state.best) state.best = state.balance;
      save();
      renderHud();
      announce('Added ' + TOPUP + ' free practice credits. Balance ' + money(state.balance) + '.');
      blip(660, 0.14, 'sine', 0.05, 0);
    });

    el.sound.addEventListener('click', function () {
      state.sound = !state.sound;
      el.sound.setAttribute('aria-pressed', String(state.sound));
      el.sound.querySelector('.label').textContent = state.sound ? 'Sound on' : 'Sound off';
      save();
      if (state.sound) blip(880, 0.1, 'sine', 0.04, 0);
    });

    el.reset.addEventListener('click', function () {
      state.balance = START_BALANCE;
      state.best = START_BALANCE;
      state.betIndex = 1;
      save();
      renderHud();
      announce('Session reset. Balance ' + money(START_BALANCE) + ' credits.');
    });

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var tag = t && t.tagName ? t.tagName : '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.code !== 'Space') return;
      var onControl = t && typeof t.closest === 'function' &&
        t.closest('button, a, summary, details, input, textarea, select');
      if (onControl) return;
      e.preventDefault();
      spin();
    });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    if (!el.spin) return;
    load();

    // Prime each reel with a static, visually balanced starting grid.
    el.reels.forEach(function (reel) {
      resetReel(reel, [drawSymbol(), drawSymbol(), drawSymbol()]);
    });

    el.sound.setAttribute('aria-pressed', String(state.sound));
    el.sound.querySelector('.label').textContent = state.sound ? 'Sound on' : 'Sound off';

    bind();
    renderHud();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
