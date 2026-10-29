/* AeroNexus Biz 소음 관제판(모의) (2026-10-28) — 지도 없이 측정기 전체(통합)·한 곳(지역별)을 실시간으로 감시.
 * 운영자 「지도 화면이 없어도 대시보드로 각 지역별 또는 통합 감시하는 화면」.
 *   통합: 요약 줄(지금 가장 시끄러운 곳·경보·오늘 사건·기준선 넘은 곳) + 측정기 판(지금 dB·상태·10분 추이·기여 항공기·오늘 24시간 막대) + 사건·경보 기록
 *   지역별: 측정기 탭 + 큰 숫자·최근 1시간 곡선·오늘 시간별·오늘 요약·오늘 사건 표
 *   원천(새 API 없음): /noise/live 1초 · /noise/hist 처음 · /noise/hourmatrix·/noise/daily·/noise/events 1분 · /noise/range 15초(지역별)
 *   주소: ?apt=RKSS&v=one&sid=gochon
 * ⚠ 모의값 — 상태 문턱(주의 배경+8 = 사건 문턱 · 경보 배경+15)은 화면 감시용이고 법적 기준이 아니다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var HIST_S = 600, WARN = 8, ALARM = 15, LDEN_REF = 61, ALOG_MAX = 50;
  var S = { apt: null, sens: [], live: null, hist: {}, mx: null, daily: null, evs: [], view: 'all', sid: null, rng: null, alog: [], st: {}, seenEv: {}, firstEv: true };
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '통과' };
  var CLS = { wide: '광동체', quad: '대형 4발', narrow: '협동체', prop: '터보프롭', small: '소형기', helicopter: '헬기', mil: '군용', '?': '기종 미상' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hms(t) { var d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function f0(v) { return v == null ? '–' : Math.round(v); }
  function f1(v) { return v == null ? '–' : (+v).toFixed(1); }
  function get(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  /* 순간 dB 색 — 지도(noise.js)와 같은 눈금: 50 초록 · 60 연두 · 70 노랑 · 80 주황 · 90 빨강 */
  var STOPS = [[50, [34, 197, 94]], [60, [132, 204, 22]], [70, [234, 179, 8]], [80, [249, 115, 22]], [90, [239, 68, 68]]];
  function color(db) {
    if (db != null && window.NoiseBrief) return NoiseBrief.level(db).c;   // 10-29 리뷰: 숫자 색도 체감 등급(60·70) 하나로 — 칩은 「경보」인데 숫자는 노랑이던 것(CLAUDE.md 5-1)
    if (db == null || db <= STOPS[0][0]) return 'rgb(' + STOPS[0][1].join(',') + ')';
    for (var i = 1; i < STOPS.length; i++) if (db <= STOPS[i][0]) { var a = STOPS[i - 1], b = STOPS[i], f = (db - a[0]) / (b[0] - a[0]); return 'rgb(' + a[1].map(function (v, k) { return Math.round(v + (b[1][k] - v) * f); }).join(',') + ')'; }
    return 'rgb(' + STOPS[STOPS.length - 1][1].join(',') + ')';
  }
  function hcol(v) { return v == null || v < 45 ? null : 'rgb(' + NoiseHourMx.rgb(v).join(',') + ')'; }   // 시간 Leq 색 — 히트맵·시간대 표와 같은 눈금
  function warnThr(s) { return Math.max((s && s.bg || 40) + WARN, 60); }
  function alarmThr(s) { return Math.max((s && s.bg || 40) + ALARM, 70); }
  // 10-29 운영자 목업 4번 — 카드 상태는 체감 절대값(~59 평온 · 60~69 주의 · 70+ 경보 · NoiseBrief.level 과 같은 칸) · 경보 기록 문턱(alarmThr)은 그대로
  function lvl(db) { return window.NoiseBrief ? NoiseBrief.level(db) : (db >= 70 ? { k: 'bad', word: '경보', c: '#f43f5e' } : db >= 60 ? { k: 'warn', word: '주의', c: '#f59e0b' } : { k: 'ok', word: '평온', c: '#10b981' }); }
  function state(s, lv) { var l = lvl(lv ? lv.db : 0); return [l.k, l.word]; }
  function sById(id) { return S.sens.filter(function (x) { return x.id === id; })[0]; }
  function lvById(id) { return S.live && S.live.sensors.filter(function (x) { return x.id === id; })[0]; }
  function dayRow(id) { return ((S.daily && S.daily.sensors[id]) || [])[0] || {}; }

  /* ── 시작 ── */
  function boot() {
    var q = new URLSearchParams(location.search);
    get('/airports.json').then(function (d) {
      var apts = (d.airports || []).filter(function (a) { return (d.served || []).indexOf(a.icao) >= 0; }), names = {};
      apts.forEach(function (a) { names[a.icao] = a.name; });
      var want = (q.get('apt') || '').toUpperCase();
      S.apt = names[want] ? want : (names.RKSS ? 'RKSS' : apts[0].icao);
      $('nwApt').innerHTML = apts.map(function (a) { return '<option value="' + a.icao + '">' + esc(a.name) + ' ' + a.icao + '</option>'; }).join('');
      $('nwApt').value = S.apt;
      $('nwApt').onchange = function () { location.href = '/noise-watch.html?apt=' + this.value; };
      $('nwMap').href = '/noise.html?apt=' + S.apt; $('nwDash').href = '/noise-dash.html?apt=' + S.apt; $('nwPeriod').href = '/noise-period.html?apt=' + S.apt;
      return Promise.all([get('/noise/sensors?apt=' + S.apt), get('/noise/hist?apt=' + S.apt).catch(function () { return {}; })]);
    }).then(function (r) {
      S.sens = (r[0] && r[0].sensors) || [];
      S.hist = (r[1] && r[1].sensors) || {};
      if (!S.sens.length) { document.body.classList.add('nw-nosen'); $('nwGrid').innerHTML = '<div class="nw-empty">이 공항에는 아직 예측 지점이 없습니다 — <a href="/noise.html?apt=' + S.apt + '">지도 화면</a>에서 항적 기반 예측 소음면을 볼 수 있습니다.</div>'; return; }   // 10-29 리뷰: 빈 카드들은 숨긴다(noise-watch.css)
      S.sid = sById(q.get('sid')) ? q.get('sid') : S.sens[0].id;
      build();
      if (window.NoiseSoon) NoiseSoon.mount($('nwSoon'), { apt: S.apt });   // 곧 보일 항공기(noise-soon.js)
      document.querySelectorAll('.nw-view button').forEach(function (b) { b.onclick = function () { setView(b.dataset.v); }; });
      setView(q.get('v') === 'one' ? 'one' : 'all');
      poll(); slow(); setInterval(slow, 60000); setInterval(function () { if (S.view === 'one') loadRange(); }, 15000);
    }).catch(function () { $('nwGrid').innerHTML = '<div class="nw-empty">불러오지 못했습니다</div>'; });
    setInterval(function () { $('nwClock').textContent = hms(Date.now() / 1000) + ' KST'; }, 1000);
    $('nwFull').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  }
  function setView(v) {
    S.view = v;
    document.querySelectorAll('.nw-view button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    $('nwAll').hidden = v !== 'all'; $('nwOne').hidden = v !== 'one';
    history.replaceState(null, '', '/noise-watch.html?apt=' + S.apt + (v === 'one' ? '&v=one&sid=' + S.sid : ''));
    if (v === 'one') { tabs(); detail(); loadRange(); } else { panels(); focusDraw(); }
  }
  function pick(id) { S.sid = id; setView('one'); }
  function focusPick(id) {
    if (S.sid === id && S.view === 'all') { setView('one'); return; }
    S.sid = id;
    panels(); focusDraw();
  }

  /* ── 자료 ── */
  function poll() {
    get('/noise/live?apt=' + S.apt).then(function (d) {
      if (!d || !d.ok) return;
      S.live = d;
      d.sensors.forEach(function (s) {
        var h = (S.hist[s.id] = S.hist[s.id] || []), t = Math.round(d.now);
        if (!h.length || t > h[h.length - 1][0]) h.push([t, s.db]);
        while (h.length && h[0][0] < t - HIST_S) h.shift();
        var ns = state(s, s)[0], prev = S.st[s.id];
        if (ns === 'bad' && prev !== 'bad') {                          // 경보로 들어간 순간만 기록(머무는 동안은 한 건)
          var top = (s.src || [])[0];
          S.alog.unshift({ t: t, id: s.id, db: s.db, over: s.db - s.bg, top: top });
          if (S.alog.length > ALOG_MAX) S.alog.pop();
          alogDraw();
        }
        S.st[s.id] = ns;
      });
      if (d.sensors.some(function (s) { return (s.new_events || []).length; })) slowEvents();   // 새 사건이 확정되면 바로 목록을 새로
      if (S.view === 'all') { summary(); panels(); focusDraw(); } else { tabs(); detailLive(); }
    }).catch(function () {}).then(function () { setTimeout(poll, 1000); });
  }
  function slow() {
    var day = ymd(new Date());
    Promise.all([get('/noise/hourmatrix?apt=' + S.apt + '&day=' + day + '&days=1'), get('/noise/daily?apt=' + S.apt + '&days=1')]).then(function (r) {
      S.mx = r[0]; S.daily = r[1];
      if (S.view === 'one') detail(); else { panels(); focusDraw(); }
    }).catch(function () {});
    slowEvents();
  }
  function slowEvents() {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    get('/noise/events?apt=' + S.apt + '&from=' + d0.getTime() / 1000 + '&to=' + (Date.now() / 1000 + 5) + '&limit=500').then(function (r) {
      S.evs = r.events || [];
      feed();
      if (S.view === 'one') evTable();
    }).catch(function () {});
  }
  function loadRange() {
    var now = Date.now() / 1000, sid = S.sid;
    get('/noise/range?apt=' + S.apt + '&sid=' + sid + '&from=' + (now - 3600) + '&to=' + now).then(function (r) { if (sid === S.sid) { S.rng = r; drawHour(); } }).catch(function () {});
  }

  /* ── 통합: 요약 줄 ── */
  function summary() {
    var L = S.live.sensors, top = L.slice().sort(function (a, b) { return (b.db - b.bg) - (a.db - a.bg); })[0];
    var nb = L.filter(function (s) { return state(s, s)[0] === 'bad'; }).length, nw = L.filter(function (s) { return state(s, s)[0] === 'warn'; }).length;
    var ac = {}; L.forEach(function (s) { (s.src || []).forEach(function (p) { if (p.db >= s.bg) ac[p.hex] = 1; }); });
    var nev = S.evs.length, nevN = S.evs.filter(function (e) { var h = new Date(e.t * 1000).getHours(); return h >= 22 || h < 7; }).length;
    var over = S.sens.filter(function (s) { var r = dayRow(s.id); return r.lden != null && r.lden >= LDEN_REF; });
    var loudH = null;
    if (S.mx) S.sens.forEach(function (s) { ((S.mx.sensors || {})[s.id] || []).forEach(function (c) { if (c.leqa != null && (!loudH || c.leqa > loudH.v)) loudH = { v: c.leqa, s: s, h: c.h }; }); });
    $('nwSum').innerHTML =
      tile('지금 가장 시끄러운 곳', top ? esc(top.name) + ' <b style="color:' + color(top.db) + '">' + top.db.toFixed(1) + '</b><small>dB · 배경+' + Math.max(0, top.db - top.bg).toFixed(0) + '</small>' : '–', top && state(top, top)[0], top && top.id) +
      tile('상태', '<span class="c bad">경보 ' + nb + '</span> <span class="c warn">주의 ' + nw + '</span> <span class="c ok">정상 ' + (L.length - nb - nw) + '</span>', nb ? 'bad' : nw ? 'warn' : 'ok') +
      tile('지금 영향 항공기', '<b>' + Object.keys(ac).length + '</b><small>대 · 배경보다 큰 기여</small>') +
      tile('오늘 소음 사건', '<b>' + nev + '</b><small>건 · 밤(22~07) ' + nevN + '</small>', nevN ? 'warn' : '') +
      tile('오늘 Lden ' + LDEN_REF + ' 이상', '<b>' + over.length + '</b><small>곳' + (over.length ? ' · ' + over.map(function (s) { return esc(s.name); }).join('·') : '') + ' · 추정</small>', over.length ? 'bad' : 'ok') +
      tile('오늘 가장 시끄러운 시간', loudH ? esc(loudH.s.name) + ' <b>' + pad(loudH.h) + '시</b><small>' + loudH.v.toFixed(1) + 'dB 항공기 Leq</small>' : '–', '', loudH && loudH.s.id);
    $('nwSum').querySelectorAll('[data-id]').forEach(function (el) { el.onclick = function () { pick(el.dataset.id); }; });
  }
  function tile(h, body, st, id) { return '<div class="nw-st ' + (st || '') + '"' + (id ? ' data-id="' + esc(id) + '" title="누르면 이 측정기 자세히"' : '') + '><h3>' + h + '</h3><div>' + body + '</div></div>'; }

  /* ── 통합: 측정기 판 (8개 카드는 핵심 수치만 깔끔하게 · 선택 지점 상세 차트는 #nwFocus 하나에 집중) ── */
  function build() {
    $('nwGrid').innerHTML = S.sens.map(function (s) {
      return '<article class="nw-p" data-id="' + esc(s.id) + '" title="누르면 아래 집중 브리핑에 표시 · 한 번 더 누르면 1시간 상세"><div class="h"><b>' + esc(s.name) + '</b><span class="chip">–</span></div>' +
        '<div class="big"><b>–</b><span>dB(A)</span><em></em></div><div class="bar"><u style="left:' + pct(s.bg) + '%"></u><i></i></div>' +
        '<canvas class="sp" width="600" height="90"></canvas><div class="src">–</div>' +
        '<div class="day"><span>오늘 Lden <b class="ld">–</b></span><span>Lmax <b class="lm">–</b></span><span>사건 <b class="ne">–</b></span></div>' +
        '<div class="hrs" aria-label="오늘 시간별 항공기 Leq"></div></article>';
    }).join('');
    $('nwGrid').querySelectorAll('.nw-p').forEach(function (el) { el.onclick = function () { focusPick(el.dataset.id); }; });
    if ($('nwFocus')) {
      $('nwFocus').innerHTML =
        '<div class="nwf-head">' +
          '<div class="nwf-title"><span class="nwf-kicker">선택 지점 집중 모니터링</span><b id="nwfName">–</b><span class="chip" id="nwfChip">–</span><span class="nwf-db" id="nwfDb">–</span><span class="nwf-src" id="nwfSrc">–</span></div>' +
          '<button type="button" class="nwf-more" id="nwfMore">1시간 상세 · 사건 표 보기 →</button>' +
        '</div>' +
        '<div class="nwf-body">' +
          '<div class="nwf-col"><h3>최근 10분 실시간 소음 추이 <small>점선 = 배경 · 노랑/빨강 = 주의(60)·경보(70) 구간</small></h3><canvas class="nwf-sp" id="nwfSp" width="600" height="110"></canvas></div>' +
          '<div class="nwf-col"><h3>오늘 시간대별 평균 소음 (0~23시) <small>항공기 Leq · 흰 테두리 = 현재 시간</small></h3><div class="hrs big" id="nwfHrs"></div></div>' +
        '</div>';
      $('nwfMore').onclick = function () { if (S.sid) setView('one'); };
    }
  }
  function pct(db) { return Math.max(0, Math.min(100, (db - 45) / 50 * 100)); }
  function panels() {
    S.sens.forEach(function (s) {
      var el = $('nwGrid').querySelector('.nw-p[data-id="' + s.id + '"]'), lv = lvById(s.id); if (!el || !lv) return;
      var st = state(s, lv), c = lvl(lv.db).c, r = dayRow(s.id), nev = S.evs.filter(function (e) { return e.sid === s.id; }).length;
      el.className = 'nw-p ' + st[0] + (s.id === S.sid ? ' sel' : ''); el.style.setProperty('--c', c);
      el.querySelector('.chip').textContent = st[1];
      el.querySelector('.big b').textContent = lv.db.toFixed(1);
      el.querySelector('.big em').textContent = '10분 최대 ' + f1(lv.peak10);
      el.querySelector('.bar i').style.left = pct(lv.db) + '%'; el.querySelector('.bar').style.setProperty('--p', pct(lv.db) + '%');   // 목업: 등급색 막대 채움
      el.querySelector('.src').innerHTML = srcLine(lv, 1);
      el.querySelector('.ld').textContent = f1(r.lden); el.querySelector('.ld').className = 'ld ' + (r.lden == null ? '' : r.lden >= LDEN_REF ? 'bad' : r.lden >= LDEN_REF - 5 ? 'warn' : 'ok');
      el.querySelector('.lm').textContent = f0(r.lmax); el.querySelector('.ne').textContent = nev;
    });
  }
  function focusDraw() {
    var box = $('nwFocus'); if (!box) return;
    var s = sById(S.sid) || S.sens[0]; if (!s) return;
    var lv = lvById(s.id);
    var st = state(s, lv), c = lv ? color(lv.db) : '#22c55e';
    box.className = 'nw-focus ' + st[0];
    $('nwfName').textContent = s.name;
    $('nwfChip').textContent = st[1];
    $('nwfDb').innerHTML = lv ? '<b style="color:' + c + '">' + lv.db.toFixed(1) + '</b> <small>dB(A) · 10분 최대 ' + f1(lv.peak10) + '</small>' : '–';
    $('nwfSrc').innerHTML = lv ? srcLine(lv, 2) : '';
    hours($('nwfHrs'), s.id, true);
    if (lv) spark($('nwfSp'), S.hist[s.id] || [], s.bg, lv.events, HIST_S);
  }
  function srcLine(lv, n) {
    var top = (lv.src || []).filter(function (p) { return p.db >= lv.bg - 3; });
    return top.length ? top.slice(0, n).map(function (p) {
      return '<b>' + esc(p.flight || p.hex) + '</b> ' + esc(p.type || CLS[p.cls] || '') + ' <span class="ph">' + (PH[p.phase] || '') + '</span> ' + (p.dist / 1000).toFixed(1) + 'km → <span style="color:' + color(p.db) + '">' + p.db.toFixed(0) + 'dB</span>';
    }).join('<br>') : '<span class="mut">항공기 영향 없음 — 배경소음 수준</span>';
  }
  /* 오늘 24시간 막대(항공기 Leq) — 지금 시간은 테두리 · 자료 없는 시는 빗금 */
  function hours(el, id, big) {
    var rows = (S.mx && S.mx.sensors && S.mx.sensors[id]) || [], nowH = new Date().getHours(), html = '';
    for (var h = 0; h < 24; h++) {
      var c = rows[h], v = c && c.leqa, ht = v == null ? 0 : Math.max(6, Math.min(100, (v - 35) / 45 * 100)), col = hcol(v) || '#30363d';
      html += '<i class="' + (c && c.min ? '' : 'na') + (h === nowH ? ' now' : '') + '" title="' + pad(h) + '시 — ' + (c && c.min ? '항공기 Leq ' + f1(v) + ' · Lmax ' + f0(c.lmax) + ' · 사건 ' + c.nev + '건' : '자료 없음') + '"><s style="height:' + ht + '%;background:' + col + '"></s>' +
        (big ? '<u>' + (v != null && v >= 45 ? Math.round(v) : '') + '</u><em>' + (h % 3 === 0 ? h : '') + '</em>' : '') + '</i>';
    }
    el.innerHTML = html;
  }
  /* 곡선(10분·1시간 공용) — 배경 점선 · 사건 세로선 · 문턱(주의·경보) 옅은 띠 */
  function spark(cv, pts, bg, evs, span, t1) {
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || cv.width, Hh = cv.clientHeight || cv.height;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
    var now = t1 || Date.now() / 1000, t0 = now - span, lo = 40, hi = 95;
    var y = function (db) { return Hh - 3 - Math.max(0, Math.min(1, (db - lo) / (hi - lo))) * (Hh - 6); }, x = function (t) { return (t - t0) / span * W; };
    var wDb = Math.max(bg + WARN, 60), aDb = Math.max(bg + ALARM, 70);
    ctx.fillStyle = 'rgba(210,153,34,.07)'; ctx.fillRect(0, y(aDb), W, y(wDb) - y(aDb));
    ctx.fillStyle = 'rgba(248,81,73,.07)'; ctx.fillRect(0, 0, W, y(aDb));
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, y(bg)); ctx.lineTo(W, y(bg)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '9px ui-monospace, monospace';
    [60, 70, 80, 90].forEach(function (v) { ctx.fillText(v, 2, y(v) - 1); });
    (evs || []).forEach(function (e) { var px = x(e.t); if (px < 0 || px > W) return; ctx.strokeStyle = color(e.lmax); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(px, 2); ctx.lineTo(px, Hh - 2); ctx.stroke(); ctx.globalAlpha = 1; });
    if (!pts.length) return;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(x(p[0]), y(p[1])); else ctx.moveTo(x(p[0]), y(p[1])); });
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  /* ── 통합: 사건 피드·경보 기록 ── */
  function feed() {
    var el = $('nwFeed');
    if (!S.evs.length) { el.innerHTML = '<div class="nw-empty">오늘은 아직 없습니다</div>'; return; }
    el.innerHTML = S.evs.slice(0, 40).map(function (e) {
      var k = e.sid + e.t + e.hex, fresh = !S.firstEv && !S.seenEv[k]; S.seenEv[k] = 1;
      var s = sById(e.sid), h = new Date(e.t * 1000).getHours(), night = h >= 22 || h < 7;
      return '<div class="it' + (fresh ? ' fresh' : '') + '" data-id="' + esc(e.sid) + '"><time>' + hms(e.t).slice(0, 5) + (night ? ' <i class="n">밤</i>' : '') + '</time><span><b>' + esc(s ? s.name : e.sid) + '</b> · ' + esc(e.flight || e.reg || e.hex) + ' ' + esc(e.type || CLS[e.cls] || '') + ' <span class="ph">' + (PH[e.phase] || '') + '</span> ' + (e.dist / 1000).toFixed(1) + 'km</span><b style="color:' + color(e.lmax) + '">' + e.lmax.toFixed(0) + 'dB</b></div>';
    }).join('');
    S.firstEv = false;
    el.querySelectorAll('.it').forEach(function (it) { it.onclick = function () { pick(it.dataset.id); }; });
  }
  function alogDraw() {
    var el = $('nwAlog');
    el.innerHTML = S.alog.length ? S.alog.map(function (a) {
      var s = sById(a.id);
      return '<div class="it bad" data-id="' + esc(a.id) + '"><time>' + hms(a.t) + '</time><span><b>' + esc(s ? s.name : a.id) + '</b> 배경+' + a.over.toFixed(0) + 'dB' + (a.top ? ' · ' + esc(a.top.flight || a.top.hex) + ' ' + esc(a.top.type || '') + ' ' + (PH[a.top.phase] || '') : '') + '</span><b style="color:' + color(a.db) + '">' + a.db.toFixed(0) + 'dB</b></div>';
    }).join('') : '<div class="nw-empty">아직 없음 — 측정기가 배경보다 15dB 넘게 올라가면 여기에 남습니다</div>';
    el.querySelectorAll('.it').forEach(function (it) { it.onclick = function () { pick(it.dataset.id); }; });
  }

  /* ── 지역별 ── */
  function tabs() {
    $('nwTabs').innerHTML = S.sens.map(function (s) {
      var lv = lvById(s.id), st = state(s, lv);
      return '<button type="button" class="' + st[0] + (s.id === S.sid ? ' on' : '') + '" data-id="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><span style="color:' + (lv ? color(lv.db) : '#8b949e') + '">' + (lv ? lv.db.toFixed(0) : '–') + '</span></button>';
    }).join('');
    $('nwTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { if (b.dataset.id !== S.sid) { S.sid = b.dataset.id; S.rng = null; setView('one'); } }; });
  }
  function detail() {
    var s = sById(S.sid); if (!s) return;
    var r = dayRow(s.id), q = '/noise-dash.html?apt=' + S.apt + '&sid=' + s.id;
    $('nwDet').innerHTML =
      '<div class="nw-d1"><div class="nw-now"><div class="h"><b>' + esc(s.name) + '</b><span class="chip">–</span></div><div class="big"><b>–</b><span>dB(A) · 모의</span></div>' +
      '<div class="bar"><u style="left:' + pct(s.bg) + '%"></u><i></i></div><div class="sub"><span>배경 ' + s.bg + '</span><span class="pk">10분 최대 –</span></div><div class="src">–</div>' +
      '<div class="note">' + esc(s.note || '') + ' · 표고 ' + (s.elev || 0) + 'm</div>' +
      '<div class="lnk"><a href="/noise.html?apt=' + S.apt + '"><i class="nic" data-ic="map"></i> 지도에서</a><a href="' + q + '"><i class="nic" data-ic="dash"></i> 대시보드</a><a class="qnow" href="#"><i class="nic" data-ic="search"></i> 지금 전후 민원 조회</a></div></div>' +
      '<div class="nw-today"><h2>오늘 요약 <small>항공기 소음 · 추정</small></h2><div class="kv">' +
      kv('Lden', f1(r.lden), r.lden == null ? '' : r.lden >= LDEN_REF ? 'bad' : r.lden >= LDEN_REF - 5 ? 'warn' : 'ok', '기준선 ' + LDEN_REF + '(확인 필요)') +
      kv('낮 Ld', f1(r.ld), '', '07~19') + kv('저녁 Le', f1(r.le), '', '19~22') + kv('밤 Ln', f1(r.ln), '', '22~07') +
      kv('Lmax', f1(r.lmax), '', '하루 최대') + kv('사건', r.nev == null ? '–' : r.nev, '', '밤 ' + (r.nevNight || 0)) + kv('Leq 합성', f1(r.leq), '', '배경 포함') + kv('자료', r.minutes ? (r.minutes / 60).toFixed(1) + 'h' : '–', '', '서버가 쌓은 시간') +
      '</div></div></div>' +
      '<div class="nw-box"><h2>최근 1시간 <small>1초 표본(묶음 최대) · 점선 = 배경 · 옅은 띠 = 주의·경보 구간 · 세로선 = 사건</small></h2><canvas class="nw-hr" id="nwHr"></canvas></div>' +
      '<div class="nw-box"><h2>오늘 시간별 <small>항공기 Leq · 지금 시간 테두리</small></h2><div class="hrs big" id="nwHrs"></div></div>' +
      '<div class="nw-box"><h2>오늘 사건 <small id="nwEvN"></small></h2><table class="nw-tb"><thead><tr><th>시각</th><th>편명</th><th>등록기호</th><th>기종</th><th>단계</th><th>거리</th><th>Lmax</th><th></th></tr></thead><tbody id="nwEvT"></tbody></table></div>';
    $('nwDet').querySelector('.qnow').onclick = function (e) {
      e.preventDefault(); var d = new Date(); location.href = q + '&t=' + ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
    };
    hours($('nwHrs'), s.id, true); evTable(); detailLive(); drawHour();
  }
  function kv(k, v, st, sub) { return '<div class="' + (st || '') + '"><span>' + k + '</span><b>' + v + '</b><small>' + sub + '</small></div>'; }
  function detailLive() {
    var s = sById(S.sid), lv = lvById(S.sid), el = $('nwDet').querySelector('.nw-now'); if (!s || !lv || !el) return;
    var st = state(s, lv);
    el.className = 'nw-now ' + st[0]; el.style.setProperty('--c', color(lv.db));
    el.querySelector('.chip').textContent = st[1];
    el.querySelector('.big b').textContent = lv.db.toFixed(1);
    el.querySelector('.bar i').style.left = pct(lv.db) + '%';
    el.querySelector('.pk').textContent = '10분 최대 ' + f1(lv.peak10);
    el.querySelector('.src').innerHTML = srcLine(lv, 4);
    if (S.rng) {                                                       // 1시간 곡선 끝에 지금 값을 이어 붙인다(15초마다 저장값으로 다시)
      var p = S.rng.points, t = Math.round(S.live.now);
      if (!p.length || t > p[p.length - 1].t) p.push({ t: t, db: lv.db });
      drawHour();
    }
  }
  function drawHour() {
    var cv = $('nwHr'), s = sById(S.sid); if (!cv || !s) return;
    var pts = S.rng ? S.rng.points.map(function (p) { return [p.t, p.db]; }) : [];
    spark(cv, pts, s.bg, S.evs.filter(function (e) { return e.sid === S.sid; }), 3600);
  }
  function evTable() {
    var tb = $('nwEvT'); if (!tb) return;
    var ev = S.evs.filter(function (e) { return e.sid === S.sid; });
    $('nwEvN').textContent = ev.length + '건 · 최근순';
    tb.innerHTML = ev.length ? ev.slice(0, 100).map(function (e) {
      return '<tr><td>' + hms(e.t) + '</td><td><b>' + esc(e.flight || '–') + '</b></td><td>' + esc(e.reg || e.hex) + '</td><td>' + esc(e.type || CLS[e.cls] || '') + '</td><td>' + (PH[e.phase] || '') + '</td><td>' + (e.dist / 1000).toFixed(1) + 'km</td><td style="color:' + color(e.lmax) + ';font-weight:700">' + e.lmax.toFixed(1) + '</td>' +
        '<td><a href="/noise.html?apt=' + S.apt + '&rp=' + ymd(new Date(e.t * 1000)) + 'T' + hms(e.t - 30) + '" title="지도 리플레이로 이 사건 30초 전부터"><i class="nic" data-ic="replay"></i></a></td></tr>';
    }).join('') : '<tr><td colspan="8" class="mut">오늘은 아직 없습니다</td></tr>';
  }

  boot();
})();
