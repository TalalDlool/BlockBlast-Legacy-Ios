(function () {
  'use strict';

  var ROWS = 8, COLS = 8, PAD = 6, GAP = 2, PITCH = 36;
  var boardEl, fxEl, cvEl, cvx;
  var board = [], cells = [], slots = [];
  var pieces = [];
  var score = 0, best = 0, combo = 0, over = false;
  var drag = null;
  var ghostList = [];
  var bLeft = 0, bTop = 0;
  var actx = null, lastT = 0;
  var soundsLoaded = false, buffers = {}, sndLoading = false;
  var masterGain = null;
  var wantStart = false, startPlayed = false, startPolls = 0;

  var debris = [], waves = [], fxRunning = false;

  var COLORS = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff7ab6'];

  var SHAPES = [
    { m: [[1]], w: 3 },
    { m: [[1, 1]], w: 5 }, { m: [[1], [1]], w: 5 },
    { m: [[1, 1, 1]], w: 6 }, { m: [[1], [1], [1]], w: 6 },
    { m: [[1, 1, 1, 1]], w: 4 }, { m: [[1], [1], [1], [1]], w: 4 },
    { m: [[1, 1, 1, 1, 1]], w: 2 }, { m: [[1], [1], [1], [1], [1]], w: 2 },
    { m: [[1, 1], [1, 1]], w: 6 },
    { m: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], w: 1 },
    { m: [[1, 0], [1, 1]], w: 4 },
    { m: [[0, 1], [1, 1]], w: 4 },
    { m: [[1, 1], [1, 0]], w: 4 },
    { m: [[1, 1], [0, 1]], w: 4 },
    { m: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], w: 1 },
    { m: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], w: 1 },
    { m: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], w: 1 },
    { m: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], w: 1 },
    { m: [[1, 1, 1], [0, 1, 0]], w: 3 },
    { m: [[0, 1, 0], [1, 1, 1]], w: 3 },
    { m: [[1, 0], [1, 1], [1, 0]], w: 3 },
    { m: [[0, 1], [1, 1], [0, 1]], w: 3 },
    { m: [[0, 1, 1], [1, 1, 0]], w: 2 },
    { m: [[1, 1, 0], [0, 1, 1]], w: 2 },
    { m: [[1, 0], [1, 1], [0, 1]], w: 1 },
    { m: [[0, 1], [1, 1], [1, 0]], w: 1 }
  ];

  var SND = {
    start: ['assets/sfx/start.ogg'],
    pick: ['assets/sfx/pickup.ogg'],
    place: ['assets/sfx/place.ogg'],
    clear1: ['assets/sfx/clear1.ogg'],
    clear2: ['assets/sfx/clear2.ogg'],
    clear3: ['assets/sfx/clear3.ogg'],
    combo: ['assets/sfx/combo.ogg'],
    over: ['assets/sfx/over.ogg'],
    vgood: ['assets/sfx/good1.ogg', 'assets/sfx/good2.ogg'],
    vgreat: ['assets/sfx/great1.ogg', 'assets/sfx/great2.ogg'],
    vamz: ['assets/sfx/amz1.ogg', 'assets/sfx/amz2.ogg'],
    vunv: ['assets/sfx/unv1.ogg', 'assets/sfx/unv2.ogg']
  };

  var PRAISE = [
    { key: 'vgood', word: '!Good', cls: 'p-good' },
    { key: 'vgreat', word: '!Great', cls: 'p-great' },
    { key: 'vamz', word: '!Amazing', cls: 'p-amz' },
    { key: 'unv', word: '!unbelievable', cls: 'p-unv' }
  ];

  function $(id) { return document.getElementById(id); }
  function addC(el, c) { el.classList.add(c); }
  function rmC(el, c) { el.classList.remove(c); }
  function setTF(el, t) { el.style.webkitTransform = t; el.style.transform = t; }
  function countCells(m) {
    var n = 0, i, j;
    for (i = 0; i < m.length; i++) for (j = 0; j < m[i].length; j++) if (m[i][j]) n++;
    return n;
  }
  function eachCell(m, r, c, fn) {
    for (var i = 0; i < m.length; i++)
      for (var j = 0; j < m[i].length; j++)
        if (m[i][j]) fn(r + i, c + j);
  }
  function inBounds(m, r, c) {
    var ok = true;
    eachCell(m, r, c, function (rr, cc) {
      if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) ok = false;
    });
    return ok;
  }
  function canPlace(m, r, c) {
    if (!inBounds(m, r, c)) return false;
    var ok = true;
    eachCell(m, r, c, function (rr, cc) {
      if (board[rr][cc] >= 0) ok = false;
    });
    return ok;
  }
  function anyWhere(m) {
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++)
        if (canPlace(m, r, c)) return true;
    return false;
  }
  function pick() {
    var tot = 0, i;
    for (i = 0; i < SHAPES.length; i++) tot += SHAPES[i].w;
    var x = Math.random() * tot;
    for (i = 0; i < SHAPES.length; i++) {
      x -= SHAPES[i].w;
      if (x < 0) return SHAPES[i];
    }
    return SHAPES[0];
  }
  function makePiece() {
    var s = pick();
    return { m: s.m, ci: Math.floor(Math.random() * COLORS.length), used: false };
  }
  function spawn() {
    var trio, t, k, ok;
    for (t = 0; t < 40; t++) {
      trio = [makePiece(), makePiece(), makePiece()];
      ok = false;
      for (k = 0; k < trio.length; k++) if (anyWhere(trio[k].m)) { ok = true; break; }
      if (ok || t === 39) { pieces = trio; break; }
    }
    renderTray();
  }

  function drawBlocks(el, m, ci, cs, gap) {
    el.innerHTML = '';
    var color = COLORS[ci];
    var pr = cs + gap;
    var mr = m.length, mc = m[0].length;
    el.style.width = (mc * pr - gap) + 'px';
    el.style.height = (mr * pr - gap) + 'px';
    for (var i = 0; i < mr; i++) {
      for (var j = 0; j < mc; j++) {
        if (!m[i][j]) continue;
        var b = document.createElement('div');
        b.className = 'blk';
        b.style.left = (j * pr) + 'px';
        b.style.top = (i * pr) + 'px';
        b.style.width = cs + 'px';
        b.style.height = cs + 'px';
        b.style.background = color;
        el.appendChild(b);
      }
    }
  }

  function renderTray() {
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i].firstChild;
      var p = pieces[i];
      if (!p || p.used) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = 'visible';
      var mr = p.m.length, mc = p.m[0].length;
      var maxS = Math.min(slots[i].clientWidth - 10, 72);
      var cs = Math.floor(Math.min(22, maxS / Math.max(mr, mc)));
      if (cs < 7) cs = 7;
      drawBlocks(el, p.m, p.ci, cs, 1);
    }
  }

  function buildCells() {
    board = []; cells = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [], crow = [];
      for (var c = 0; c < COLS; c++) {
        var d = document.createElement('div');
        d.className = 'cell';
        boardEl.appendChild(d);
        crow.push(d);
        row.push(-1);
      }
      cells.push(crow);
      board.push(row);
    }
  }

  function layout() {
    var wrap = $('wrap'), tray = $('tray');
    var head = document.querySelector('header');
    var aw = wrap.clientWidth - 10;
    var ah = window.innerHeight - head.offsetHeight - tray.offsetHeight - 18;
    var sz = Math.min(aw, ah) * 0.92;
    if (sz < 150) sz = 150;
    PITCH = Math.floor(sz / ROWS);
    var inner = PITCH * ROWS;
    boardEl.style.width = (inner + PAD * 2) + 'px';
    boardEl.style.height = (inner + PAD * 2) + 'px';
    boardEl.style.padding = PAD + 'px';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var d = cells[r][c];
        d.style.left = (PAD + c * PITCH + 1) + 'px';
        d.style.top = (PAD + r * PITCH + 1) + 'px';
        d.style.width = (PITCH - GAP) + 'px';
        d.style.height = (PITCH - GAP) + 'px';
      }
    }
    var rc = boardEl.getBoundingClientRect();
    bLeft = rc.left; bTop = rc.top;
    sizeCanvas();
    renderTray();
  }

  /* ---------- particle fx ---------- */
  var fxW = 0, fxH = 0;

  function sizeCanvas() {
    if (!cvEl) return;
    fxW = window.innerWidth;
    fxH = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvEl.width = Math.round(fxW * dpr);
    cvEl.height = Math.round(fxH * dpr);
    cvEl.style.width = fxW + 'px';
    cvEl.style.height = fxH + 'px';
    cvx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cellCenterPx(r, c) {
    var cr = cvEl.getBoundingClientRect();
    var el = cells[r][c].getBoundingClientRect();
    return [el.left - cr.left + el.width / 2, el.top - cr.top + el.height / 2];
  }

  function burstCell(r, c, color) {
    var pt = cellCenterPx(r, c);
    var n = 7;
    for (var k = 0; k < n; k++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = (60 + Math.random() * 190) * (PITCH / 34);
      debris.push({
        x: pt[0] + (Math.random() - .5) * PITCH * .4,
        y: pt[1] + (Math.random() - .5) * PITCH * .4,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 130 * (PITCH / 34),
        s: PITCH * (.16 + Math.random() * .22),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - .5) * 12,
        col: color,
        ttl: .55 + Math.random() * .35,
        t: 0
      });
    }
    waves.push({ x: pt[0], y: pt[1], r: PITCH * .2, a: .55, v: PITCH * 6 });
    startFx();
  }

  function wipeCanvas() {
    debris.length = 0;
    waves.length = 0;
    try {
      cvx.setTransform(1, 0, 0, 1, 0, 0);
      cvx.clearRect(0, 0, cvEl.width, cvEl.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } catch (e) {}
    fxRunning = false;
  }

  var dbgFrames = 0, dbgErr = '', dbgLastT = 0;

  function stepFx(now) {
    var dt = Math.min(Math.max((now - dbgPrevT) / 1000, 0), .05);
    dbgPrevT = now;
    cvx.clearRect(0, 0, fxW, fxH);
    var g = 1500 * (PITCH / 34), alive = false;

    for (var i = debris.length - 1; i >= 0; i--) {
      var d = debris[i];
      d.t += dt;
      if (d.t >= d.ttl) { debris.splice(i, 1); continue; }
      d.vy += g * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y - d.s > fxH + 40 || d.x < -60 || d.x > fxW + 60 || d.y < -fxH) {
        debris.splice(i, 1);
        continue;
      }
      alive = true;
      d.rot += d.vr * dt;
      var k = 1 - d.t / d.ttl;
      cvx.save();
      cvx.globalAlpha = Math.max(0, Math.min(1, k * 1.6));
      cvx.translate(d.x, d.y);
      cvx.rotate(d.rot);
      cvx.fillStyle = d.col;
      var s = Math.max(0, d.s * (.5 + k * .5));
      cvx.fillRect(-s / 2, -s / 2, s, s);
      cvx.fillStyle = 'rgba(255,255,255,.45)';
      cvx.fillRect(-s / 2, -s / 2, s, s * .28);
      cvx.restore();
    }
    for (var j = waves.length - 1; j >= 0; j--) {
      var wv = waves[j];
      wv.r += wv.v * dt;
      wv.a -= dt * 2.2;
      if (wv.a <= 0) { waves.splice(j, 1); continue; }
      alive = true;
      cvx.beginPath();
      cvx.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
      cvx.strokeStyle = 'rgba(255,255,255,' + Math.max(0, wv.a).toFixed(3) + ')';
      cvx.lineWidth = 3;
      cvx.stroke();
    }
    if (!alive && !debris.length && !waves.length) wipeCanvas();
  }

  var dbgPrevT = 0;

  function startFx() {
    if (fxRunning) return;
    fxRunning = true;
    dbgPrevT = performance.now();
    dbgLastT = dbgPrevT;
    var startedAt = dbgPrevT;
    function frame(now) {
      dbgFrames++;
      dbgLastT = now;
      if (!fxRunning) return;
      if (now - startedAt > 4000) { wipeCanvas(); return; }
      try {
        stepFx(now);
        if (fxRunning) requestAnimationFrame(frame);
      } catch (err) {
        dbgErr = String(err && err.message || err);
        wipeCanvas();
      }
    }
    requestAnimationFrame(frame);
  }

  setInterval(function () {
    if (!fxRunning) return;
    var now = performance.now();
    if (now - dbgLastT > 700) wipeCanvas();
  }, 400);

  function shakeBoard() {
    rmC(boardEl, 'shake');
    void boardEl.offsetWidth;
    addC(boardEl, 'shake');
    setTimeout(function () { rmC(boardEl, 'shake'); }, 320);
  }

  /* ---------- audio ---------- */
  function pollStart() {
    if (!wantStart || startPlayed) return;
    if (++startPolls > 250) return;
    if (actx && actx.state === 'running' && buffers.start && buffers.start.length) {
      startPlayed = true;
      playBuf('start', .95);
      return;
    }
    setTimeout(pollStart, 180);
  }

  function requestStartSound() {
    wantStart = true;
    startPolls = 0;
    pollStart();
  }

  function unlockAudio() {
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) actx = new AC();
      } catch (e) { actx = null; }
      if (actx && actx.createGain) {
        masterGain = actx.createGain();
        masterGain.gain.value = .85;
        masterGain.connect(actx.destination);
      }
    }
    if (actx && actx.state === 'suspended' && actx.resume) {
      try { actx.resume()['catch'](function () {}); } catch (e) {}
    }
    if (actx && !soundsLoaded && !sndLoading) {
      try { loadSounds(); } catch (e) { sndLoading = false; }
    }
    pollStart();
  }

  function fetchBuf(u) {
    return new Promise(function (res, rej) {
      if (!window.fetch) {
        try {
          var x = new XMLHttpRequest();
          x.open('GET', u, true);
          x.responseType = 'arraybuffer';
          x.onload = function () {
            if ((x.status >= 200 && x.status < 300) || (x.status === 0 && x.response)) res(x.response);
            else rej(new Error('http ' + x.status));
          };
          x.onerror = function () { rej(new Error('xhr error')); };
          x.send();
        } catch (e) { rej(e); }
        return;
      }
      window.fetch(u).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      }).then(res)['catch'](rej);
    });
  }

  function loadSounds() {
    sndLoading = true;
    var pending = 0;
    Object.keys(SND).forEach(function (key) {
      var urls = SND[key];
      urls.forEach(function (u) {
        pending++;
        fetchBuf(u).then(function (ab) {
          return new Promise(function (res, rej) {
            try { actx.decodeAudioData(ab, res, rej); }
            catch (e) { rej(e); }
          });
        }).then(function (buf) {
          if (!buffers[key]) buffers[key] = [];
          buffers[key].push(buf);
          soundsLoaded = true;
        }).catch(function () {}).then(function () {
          if (--pending === 0) sndLoading = false;
        });
      });
    });
  }

  function playBuf(key, vol, rate) {
    if (!actx) return false;
    var arr = buffers[key];
    if (!arr || !arr.length) return false;
    try {
      var src = actx.createBufferSource();
      src.buffer = arr[Math.floor(Math.random() * arr.length)];
      src.playbackRate.value = rate || 1;
      var g = actx.createGain();
      g.gain.value = vol == null ? 1 : vol;
      src.connect(g);
      g.connect(masterGain || actx.destination);
      src.start(0);
      return true;
    } catch (e) { return false; }
  }

  function sfx(fr, dur, type, vol) {
    try {
      if (!actx) return;
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type;
      o.frequency.value = fr;
      var t = actx.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(masterGain || actx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function sndPick() {
    if (!playBuf('pick', .8, .92 + Math.random() * .16)) sfx(340, .05, 'sine', .03);
  }
  function sndPlace() {
    if (!playBuf('place', .9)) sfx(230, .06, 'triangle', .05);
  }
  function sndClear(lc) {
    var key = lc >= 3 ? 'clear3' : (lc === 2 ? 'clear2' : 'clear1');
    if (!playBuf(key, .95)) {
      sfx(520, .09, 'square', .05);
      setTimeout(function () { sfx(720, .12, 'square', .05); }, 70);
      if (lc > 1) setTimeout(function () { sfx(880, .14, 'square', .04); }, 140);
    }
    if (combo > 1) setTimeout(function () { playBuf('combo', .8); }, 120);
  }
  function sndOver() {
    if (!playBuf('over', .9)) {
      sfx(300, .15, 'sawtooth', .05);
      setTimeout(function () { sfx(200, .25, 'sawtooth', .05); }, 160);
    }
  }

  /* ---------- game flow ---------- */
  function fillCell(r, c, color) {
    var cell = cells[r][c];
    var f = cell.firstChild;
    if (!f) {
      f = document.createElement('div');
      cell.appendChild(f);
    }
    f.className = 'fill';
    f.style.background = color;
    f.style.opacity = '1';
    setTF(f, 'scale(1)');
  }
  function clearVisual(r, c) {
    var cell = cells[r][c];
    while (cell.firstChild) cell.removeChild(cell.firstChild);
  }

  function popCell(r, c, color) {
    var cell = cells[r][c];
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    var f = document.createElement('div');
    f.className = 'fill';
    f.style.background = color;
    f.style.opacity = '0';
    setTF(f, 'scale(0)');
    cell.appendChild(f);
    void f.offsetWidth;
    f.style.opacity = '1';
    setTF(f, 'scale(1)');
  }

  function introFill() {
    var r, c, maxD = ROWS + COLS - 2, base = 150, perD = 42;
    requestStartSound();
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        (function (rr, cc) {
          setTimeout(function () {
            popCell(rr, cc, COLORS[Math.floor(Math.random() * COLORS.length)]);
          }, base + (rr + cc) * perD + Math.random() * 40);
        })(r, c);
      }
    }
    var holdAt = base + maxD * perD + 500;
    setTimeout(function () {
      for (r = 0; r < ROWS; r++)
        for (c = 0; c < COLS; c++) {
          (function (rr, cc) {
            setTimeout(function () {
              var f = cells[rr][cc].firstChild;
              if (!f) return;
              f.style.opacity = '0';
              setTF(f, 'scale(0)');
            }, ((ROWS - 1 - rr) + (COLS - 1 - cc)) * 16);
          })(r, c);
        }
    }, holdAt);
    setTimeout(function () {
      for (r = 0; r < ROWS; r++)
        for (c = 0; c < COLS; c++) clearVisual(r, c);
      spawn();
    }, holdAt + maxD * 16 + 300);
  }

  function hud() {
    $('score').innerHTML = score;
    $('best').innerHTML = best;
    var mb = $('menuBest');
    if (mb) mb.innerHTML = best;
  }

  /* localStorage guard: old iOS Safari throws on access (private mode / full quota) */
  var BEST_KEY = 'bb4s_best';
  var memBest = 0;
  function getStore() {
    try {
      if (!window.localStorage) return null;
      var s = window.localStorage;
      var probe = '__bb_t';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) { return null; }
  }
  function loadBest() {
    var s = getStore();
    if (!s) return memBest;
    try {
      var v = parseInt(s.getItem(BEST_KEY), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) { return memBest; }
  }
  function saveBest() {
    memBest = best;
    var s = getStore();
    if (!s) return;
    try { s.setItem(BEST_KEY, String(best)); } catch (e) {}
  }
  function floatTxt(t, cls) {
    var s = document.createElement('span');
    s.className = 'fl ' + cls;
    s.innerHTML = t;
    fxEl.appendChild(s);
    setTimeout(function () {
      s.style.opacity = '0';
      setTF(s, 'translateY(-44px)');
    }, 30);
    setTimeout(function () {
      if (s.parentNode) s.parentNode.removeChild(s);
    }, 950);
  }

  function getXY(e) {
    if (e.touches && e.touches.length > 0)
      return [e.touches[0].clientX, e.touches[0].clientY];
    if (e.changedTouches && e.changedTouches.length > 0)
      return [e.changedTouches[0].clientX, e.changedTouches[0].clientY];
    return [e.clientX, e.clientY];
  }

  function slotDown(i, ev, x, y) {
    lastT = Date.now();
    if (over || drag) return;
    ev.preventDefault();
    unlockAudio();
    if (!pieces[i] || pieces[i].used) return;
    startDrag(i, x, y);
  }

  function startDrag(i, x, y) {
    var p = pieces[i];
    var el = document.createElement('div');
    el.className = 'dpiece';
    drawBlocks(el, p.m, p.ci, PITCH - GAP, GAP);
    document.body.appendChild(el);
    var rc = boardEl.getBoundingClientRect();
    bLeft = rc.left; bTop = rc.top;
    var slotPiece = slots[i].firstChild;
    slotPiece.style.visibility = 'hidden';
    drag = { i: i, p: p, el: el, x: 0, y: 0, v: false, r: -9, c: -9, slotPiece: slotPiece };
    moveDrag(x, y);
    sndPick();
  }

  function moveDrag(x, y) {
    var w = drag.el.offsetWidth, h = drag.el.offsetHeight;
    var tx = x - w / 2;
    var ty = y - h - Math.max(20, PITCH * 0.55);
    drag.x = tx; drag.y = ty;
    setTF(drag.el, 'translate3d(' + tx + 'px,' + ty + 'px,0)');
    updateGhost();
  }

  function updateGhost() {
    clearGhost();
    var r = Math.round((drag.y - (bTop + PAD)) / PITCH);
    var c = Math.round((drag.x - (bLeft + PAD)) / PITCH);
    drag.r = r; drag.c = c;
    drag.v = false;
    if (!inBounds(drag.p.m, r, c)) return;
    var ok = canPlace(drag.p.m, r, c);
    var cls = ok ? 'g-ok' : 'g-bad';
    eachCell(drag.p.m, r, c, function (rr, cc) {
      addC(cells[rr][cc], cls);
      ghostList.push(cells[rr][cc]);
    });
    if (ok) drag.v = true;
  }
  function clearGhost() {
    for (var k = 0; k < ghostList.length; k++) {
      rmC(ghostList[k], 'g-ok');
      rmC(ghostList[k], 'g-bad');
    }
    ghostList.length = 0;
  }

  function endDrag(drop) {
    var d = drag;
    drag = null;
    clearGhost();
    if (drop && d.v) {
      place(d.i, d.r, d.c);
      if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
    } else {
      if (d.slotPiece) {
        d.slotPiece.style.visibility = 'visible';
        d.slotPiece.style.opacity = '0';
        setTimeout(function () { d.slotPiece.style.opacity = '1'; }, 30);
      }
      d.el.style.opacity = '0';
      setTimeout(function () {
        if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
      }, 150);
    }
  }

  function allUsed() {
    for (var i = 0; i < pieces.length; i++)
      if (pieces[i] && !pieces[i].used) return false;
    return true;
  }

  function place(i, r, c) {
    var p = pieces[i];
    var n = countCells(p.m);
    eachCell(p.m, r, c, function (rr, cc) {
      board[rr][cc] = p.ci;
      fillCell(rr, cc, COLORS[p.ci]);
    });
    p.used = true;
    renderTray();
    score += n;
    hud();

    var f = findFull();
    var lc = f.rows.length + f.cols.length;
    if (lc > 0) {
      combo++;
      doClear(f, lc);
    } else {
      combo = 0;
      sndPlace();
    }
    if (allUsed()) spawn();
    if (score > best) { best = score; saveBest(); hud(); }
    setTimeout(checkOver, lc > 0 ? 420 : 160);
  }

  function findFull() {
    var rows = [], cols = [], r, c, full;
    for (r = 0; r < ROWS; r++) {
      full = true;
      for (c = 0; c < COLS; c++) if (board[r][c] < 0) { full = false; break; }
      if (full) rows.push(r);
    }
    for (c = 0; c < COLS; c++) {
      full = true;
      for (r = 0; r < ROWS; r++) if (board[r][c] < 0) { full = false; break; }
      if (full) cols.push(c);
    }
    return { rows: rows, cols: cols };
  }

  function doClear(f, lc) {
    var seen = {}, k, i;
    var mark = function (rr, cc) {
      var key = rr * COLS + cc;
      if (seen[key]) return;
      seen[key] = 1;
      var ci = board[rr][cc];
      board[rr][cc] = -1;
      var fl = cells[rr][cc].firstChild;
      if (fl) { addC(fl, 'flash'); }
      burstCell(rr, cc, COLORS[ci >= 0 ? ci : 0]);
    };
    for (k = 0; k < f.rows.length; k++)
      for (i = 0; i < COLS; i++) mark(f.rows[k], i);
    for (k = 0; k < f.cols.length; k++)
      for (i = 0; i < ROWS; i++) mark(i, f.cols[k]);

    shakeBoard();
    sndClear(lc);

    var mult = combo > 1 ? combo : 1;
    var pts = (lc * 10 + (lc - 1) * 10) * mult;
    score += pts;
    hud();
    floatTxt('+' + pts, 'gain');
    if (combo > 1)
      setTimeout(function () { floatTxt('كومبو ×' + combo, 'combo'); }, 170);

    var tier = lc >= 4 || combo >= 4 ? 3 : (lc >= 3 || combo === 3 ? 2 : (lc === 2 || combo === 2 ? 1 : 0));
    (function (ti) {
      setTimeout(function () {
        var p = PRAISE[ti];
        floatTxt(p.word, 'praise ' + p.cls);
        playBuf(p.key, .95, .96 + Math.random() * .08);
      }, 160);
    })(tier);

    setTimeout(sweepFills, 200);
  }

  function sweepFills() {
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++)
        if (board[r][c] < 0) clearVisual(r, c);
  }

  function checkOver() {
    if (over) return;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (p && !p.used && anyWhere(p.m)) return;
    }
    doOver();
  }

  function doOver() {
    over = true;
    if (score > best) { best = score; saveBest(); }
    hud();
    $('fscore').innerHTML = score;
    $('fbest').innerHTML = best;
    unlockAudio();
    sndOver();
    setTimeout(function () { addC($('over'), 'show'); }, 350);
  }

  function restart() {
    over = false; combo = 0; score = 0;
    rmC($('over'), 'show');
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++) {
        board[r][c] = -1;
        clearVisual(r, c);
      }
    hud();
    spawn();
  }

  function bind() {
    slots = document.querySelectorAll('.slot');
    for (var i = 0; i < slots.length; i++) {
      (function (idx) {
        slots[idx].addEventListener('touchstart', function (e) {
          var t = getXY(e);
          slotDown(idx, e, t[0], t[1]);
        }, false);
        slots[idx].addEventListener('mousedown', function (e) {
          if (Date.now() - lastT < 500) return;
          slotDown(idx, e, e.clientX, e.clientY);
        }, false);
      })(i);
    }
    document.addEventListener('touchmove', function (e) {
      if (drag) {
        e.preventDefault();
        var t = getXY(e);
        moveDrag(t[0], t[1]);
      }
    }, false);
    document.addEventListener('touchend', function (e) {
      if (drag) {
        e.preventDefault();
        endDrag(true);
      }
    }, false);
    document.addEventListener('touchcancel', function () {
      if (drag) endDrag(false);
    }, false);
    document.addEventListener('mousemove', function (e) {
      if (drag) moveDrag(e.clientX, e.clientY);
    }, false);
    document.addEventListener('mouseup', function () {
      if (drag) endDrag(true);
    }, false);
    document.addEventListener('gesturestart', function (e) {
      e.preventDefault();
    });
    document.addEventListener('gesturechange', function (e) {
      e.preventDefault();
    });

    var lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouchEnd < 350) e.preventDefault();
      lastTouchEnd = now;
    }, false);
    $('again').addEventListener('click', restart, false);
    $('again').addEventListener('touchstart', function (e) {
      e.preventDefault();
      restart();
    }, false);
  }

  function startFromMenu() {
    var menu = $('menu');
    if (menu.classList.contains('hide')) return;
    addC(menu, 'hide');
    unlockAudio();
    introFill();
  }

  function bindMenu() {
    $('playBtn').addEventListener('click', startFromMenu, false);
    $('playBtn').addEventListener('touchstart', function (e) {
      e.preventDefault();
      startFromMenu();
    }, false);
  }

  function boot() {
    boardEl = $('board');
    fxEl = $('fx');
    cvEl = $('fxc');
    cvx = cvEl.getContext('2d');
    buildCells();
    best = loadBest();
    bind();
    layout();
    window.addEventListener('resize', function () { setTimeout(layout, 60); }, false);
    window.addEventListener('orientationchange', function () { setTimeout(layout, 250); }, false);
    hud();
    unlockAudio();
    bindMenu();
    document.addEventListener('touchstart', unlockAudio, false);
    document.addEventListener('mousedown', unlockAudio, false);
  }

  boot();
})();
