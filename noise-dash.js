/* AeroNexus Biz 소음 대시보드(모의) (2026-10-27) — 서버 noise_store 와 짝.
 * 운영자 「민원이 들어오면 그 시간대 소음이 얼마였는지 · 대시보드로 소음 상태 모니터링」.
 * 타일(오늘 요약) · 시간별(측정기마다 작은 차트: Leq 합성/항공기 선 + 사건 막대) · 14일 Lden(추정, 기준선 61 확인 필요) · 사건 분석 · 민원 시각 조회(곡선+사건+답변용 요약).
 * 차트는 캔버스로 직접 그린다(외부 라이브러리 없음) — 한 축만, 2계열 이하 + 범례, 마우스 올리면 값, 「표」 단추로 같은 자료를 표로. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var C = { s1: '#3b82f6', s2: '#d97706', s3: '#8b5cf6', night: '#4c3a8a', ref: '#ef4444', mut: '#8b949e', grid: 'rgba(255,255,255,.08)' };
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '통과', roll_land: '착륙 활주' };   // 10-29 리뷰: roll_land 가 코드 그대로 보였다
  var S = { apt: null, names: {}, sens: [], day: null, sid: '', hourly: null, daily: null, stats: null, live: null, tables: {} };
  var LDEN_REF = 61;                                                 // 소음대책지역 기준(확인 필요)

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function kst(t) { return new Date(t * 1000); }
  function hms(t) { var d = kst(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function hm(t) { return hms(t).slice(0, 5); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ymdhms(t) { var d = kst(t); return ymd(d) + ' ' + hms(t); }
  function f1(v) { return v == null ? '–' : (+v).toFixed(1); }
  function f0(v) { return v == null ? '–' : Math.round(v); }
  function get(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function sName(id) { var s = (S.all || S.sens).filter(function (x) { return x.id === id; })[0]; return s ? s.name + (s.retired ? '(옛)' : '') : id; }
  function sensOf(id) { return (S.all || S.sens).filter(function (x) { return x.id === id; })[0]; }

  /* ── 시작 ── */
  function boot() {
    var q = new URLSearchParams(location.search);
    get('/airports.json').then(function (d) {
      var apts = (d.airports || []).filter(function (a) { return (d.served || []).indexOf(a.icao) >= 0; });
      apts.forEach(function (a) { S.names[a.icao] = a.name; });
      var want = (q.get('apt') || '').toUpperCase();
      S.apt = S.names[want] ? want : (S.names.RKSS ? 'RKSS' : apts[0].icao);
      $('ndApt').innerHTML = apts.map(function (a) { return '<option value="' + a.icao + '">' + esc(a.name) + ' ' + a.icao + '</option>'; }).join('');
      $('ndApt').value = S.apt;
      $('ndApt').onchange = function () { location.href = '/noise-dash.html?apt=' + this.value; };
      $('ndMap').href = $('ndLive').href = '/noise.html?apt=' + S.apt; $('ndWatch').href = '/noise-watch.html?apt=' + S.apt; $('ndPeriod').href = '/noise-period.html?apt=' + S.apt;
      S.day = q.get('day') || ymd(new Date());
      $('ndDay').value = S.day; $('ndDay').max = ymd(new Date());
      $('ndDay').onchange = function () { S.day = this.value; loadDay(); };
      $('ndSen').onchange = function () { S.sid = this.value; render(); };
      $('ndRange').onchange = loadStats;
      return get('/noise/sensors?apt=' + S.apt + '&all=1');
    }).then(function (d) {
      S.all = (d && d.sensors) || [];                                   // 옛 측정기 포함(민원 목록·조회의 이름 찾기)
      S.sens = S.all.filter(function (s) { return !s.retired; });
      $('ndSen').innerHTML = '<option value="">측정기 전체</option>' + S.sens.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
      $('ndQS').innerHTML = $('ndCpS').innerHTML = S.sens.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
      cpInit();
      if (!S.sens.length) { $('ndTiles').innerHTML = '<div class="nd-empty">' + esc(S.names[S.apt]) + ' — 가정한 측정기가 없습니다(noise_sensors.json).</div>'; return; }
      var t = q.get('t');
      if (t) { $('ndQT').value = t; }
      else { var n = new Date(Date.now() - 1800000); $('ndQT').value = ymd(n) + 'T' + pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':00'; }
      if (q.get('sid')) $('ndQS').value = q.get('sid');
      loadDay(); loadStats(); pollLive(); pollStore(); validation();
      if (window.NoiseHourMx) NoiseHourMx.mount($('ndHourMx'), { apt: S.apt, sensors: S.sens, day: function () { return S.day; }, dayInput: $('ndDay'), onPick: function (s, h, c) { location.href = '/noise.html?apt=' + S.apt + '&heat=' + c.day + ':' + Math.min(c.days, 7) + ':' + h; } });   // 측정기 × 시간대(noise-hourmx.js)
      if (t) query();
    });
  }
  function loadDay() {
    Promise.all([get('/noise/hourly?apt=' + S.apt + '&day=' + S.day), get('/noise/daily?apt=' + S.apt + '&days=14')]).then(function (r) { S.hourly = r[0]; S.daily = r[1]; render(); });
  }
  function pollLive() { get('/noise/live?apt=' + S.apt).then(function (d) { S.live = d; tiles(); }).catch(function () {}).then(function () { setTimeout(pollLive, 5000); }); }
  function pollStore() {
    get('/noise/status?apt=' + S.apt).then(function (d) {
      $('ndStore').textContent = '저장 ' + (d.samples || 0).toLocaleString() + '표본 · 사건 ' + (d.events || 0) + ' · ' + d.dbMB + '/' + d.maxMB + 'MB' + (d.from ? ' · ' + ymdhms(d.from).slice(5, 16) + '부터' : '');
    }).catch(function () {}).then(function () { setTimeout(pollStore, 60000); });
  }

  /* ── 타일: 측정기마다 (지금 · 오늘 Lden · Lmax · 사건) ── */
  function tiles() {
    var today = ymd(new Date()), isToday = S.day === today;
    var el = $('ndTiles'); el.innerHTML = '';
    S.sens.forEach(function (s) {
      var live = S.live && S.live.sensors.filter(function (x) { return x.id === s.id; })[0];
      var dd = ((S.daily && S.daily.sensors[s.id]) || []).filter(function (r) { return r.day === S.day; })[0] || {};
      var hh = (S.hourly && S.hourly.sensors[s.id]) || [];
      var lmaxH = hh.reduce(function (m, o) { return o.lmax != null && (m == null || o.lmax > m.lmax) ? o : m; }, null);
      var st = dd.lden == null ? ['', '자료 모이는 중'] : dd.lden >= LDEN_REF ? ['bad', '▲ 기준선 ' + LDEN_REF + ' 이상(참고 기준)'] : dd.lden >= LDEN_REF - 5 ? ['warn', '기준선 −5dB 안'] : ['ok', '기준선 아래'];
      var c = dd.lden == null ? '' : dd.lden >= LDEN_REF ? '#ef4444' : dd.lden >= LDEN_REF - 5 ? '#d29922' : '#3fb950';
      var div = document.createElement('div'); div.className = 'nd-tile'; div.style.setProperty('--c', c || '#30363d');
      div.innerHTML = '<div class="n">' + esc(s.name) + '<small>' + (isToday && live ? '지금 <b style="color:#fff">' + f0(live.db) + '</b> dB' : esc(S.day.slice(5))) + '</small></div>' +
        '<div class="big">' + f1(dd.lden) + '<span>Lden · 항공기 · ' + (isToday ? '진행 중 예측치' : '추정') + (S.valRmse ? ' ±' + S.valRmse : '') + '</span></div>' +
        '<div class="row"><span>Lmax <b>' + f0(dd.lmax) + '</b>' + (lmaxH ? ' <small>' + pad(lmaxH.h) + '시</small>' : '') + '</span><span>사건 <b>' + (dd.nev || 0) + '</b> (밤 ' + (dd.nevNight || 0) + ')</span></div>' +
        '<div class="row"><span>낮 ' + f0(dd.ld) + ' · 저녁 ' + f0(dd.le) + ' · 밤 ' + f0(dd.ln) + '</span><span>Leq합성 ' + f0(dd.leq) + '</span></div>' +
        '<div class="st ' + st[0] + '">' + st[1] + '</div>';
      div.onclick = function () { $('ndSen').value = s.id; S.sid = s.id; render(); };
      el.appendChild(div);
    });
  }

  function render() { tiles(); hourly(); daily(); }
  function pick() { return S.sid ? S.sens.filter(function (s) { return s.id === S.sid; }) : S.sens; }

  /* ── 시간별: 측정기마다 작은 차트 ── */
  function hourly() {
    var el = $('ndHourly'); el.innerHTML = ''; $('ndHourlyT').textContent = S.day;
    pick().forEach(function (s) {
      var rows = (S.hourly && S.hourly.sensors[s.id]) || [];
      var box = card(el, s.name, rows.length ? '' : '자료 없음');
      if (!rows.length) return;
      var xs = rows.map(function (o) { return o.h; });
      lineChart(box.cv, { xs: xs, xLabel: function (x) { return pad(x) + '시'; }, yMin: 40, yMax: 90, unit: 'dB',
        series: [{ name: 'Leq 합성', color: C.s1, ys: rows.map(function (o) { return o.leq; }) }, { name: 'Leq 항공기', color: C.s2, ys: rows.map(function (o) { return o.leqa; }) }],
        bars: { name: '사건 수', color: C.s3, ys: rows.map(function (o) { return o.nev; }) }, ref: null });
      legend(box.lg, [['Leq 합성', C.s1], ['Leq 항공기', C.s2]], [['사건 수', C.s3]]);
      S.tables['ndHourly:' + s.id] = { head: ['시', 'Leq 합성', 'Leq 항공기', 'Lmax', '사건'], rows: rows.map(function (o) { return [pad(o.h), f1(o.leq), f1(o.leqa), f1(o.lmax), o.nev]; }) };
    });
  }
  /* ── 14일 Lden ── */
  function daily() {
    var el = $('ndDaily'); el.innerHTML = '';
    pick().forEach(function (s) {
      var rows = (S.daily && S.daily.sensors[s.id]) || [];
      var box = card(el, s.name, rows.length ? '' : '자료 없음');
      if (!rows.length) return;
      lineChart(box.cv, { xs: rows.map(function (r) { return r.day; }), xLabel: function (x) { return x.slice(5); }, yMin: 40, yMax: 90, unit: 'dB',
        series: [{ name: 'Lden 항공기(예측)', color: C.s2, ys: rows.map(function (r) { return r.lden; }) }],
        bars: { name: '사건 수', color: C.s3, ys: rows.map(function (r) { return r.nev; }), ys2: rows.map(function (r) { return r.nevNight; }), color2: C.night }, ref: { y: LDEN_REF, label: LDEN_REF + ' 기준선(확인 필요)', color: C.ref } });
      legend(box.lg, [['Lden 항공기(예측)', C.s2], ['기준선 ' + LDEN_REF, C.ref]], [['사건(낮·저녁)', C.s3], ['사건(밤)', C.night]]);
      S.tables['ndDaily:' + s.id] = { head: ['날짜', 'Lden', '낮', '저녁', '밤', 'Lmax', '사건', '밤 사건', '분'], rows: rows.map(function (r) { return [r.day, f1(r.lden), f1(r.ld), f1(r.le), f1(r.ln), f1(r.lmax), r.nev, r.nevNight, r.minutes]; }) };
    });
  }
  function card(parent, title, note) {
    var d = document.createElement('div'); d.className = 'ch';
    d.innerHTML = '<div class="t">' + esc(title) + '<small>' + esc(note) + '</small></div><canvas class="nd-cv"></canvas><div class="nd-legend"></div>';
    parent.appendChild(d);
    return { cv: d.querySelector('canvas'), lg: d.querySelector('.nd-legend') };
  }
  function legend(el, lines, bars) {
    el.innerHTML = lines.map(function (l) { return '<span><i style="--c:' + l[1] + '"></i>' + esc(l[0]) + '</span>'; }).join('') + (bars || []).map(function (b) { return '<span><i class="bar" style="--c:' + b[1] + '"></i>' + esc(b[0]) + '</span>'; }).join('');
  }
  /* 「표」 단추 — 그 절의 차트 자료를 표로(접근성·숫자 확인) */
  document.querySelectorAll('.nd-tbl').forEach(function (b) {
    b.onclick = function () {
      var sec = b.closest('.nd-sec'), old = sec.querySelector('.nd-table.alt');
      if (old) { old.remove(); b.textContent = '표'; return; }
      var html = '';
      Object.keys(S.tables).forEach(function (k) {
        if (k.indexOf(b.dataset.for + ':') !== 0) return;
        var t = S.tables[k];
        html += '<tr><th colspan="' + t.head.length + '">' + esc(sName(k.split(':')[1])) + '</th></tr><tr>' + t.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' +
          t.rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('');
      });
      var tb = document.createElement('table'); tb.className = 'nd-table alt'; tb.innerHTML = html || '<tr><td>자료 없음</td></tr>';
      sec.appendChild(tb); b.textContent = '표 닫기';
    };
  });

  /* ── 선+막대 차트(한 축: dB · 막대는 아래 띠에 건수) ── */
  function lineChart(cv, o) {
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 400, H = cv.clientHeight || 150;
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    var L = 30, R = 8, T = 8, BH = o.bars ? 34 : 0, B = 18 + BH, pw = W - L - R, ph = H - T - B;
    var n = o.xs.length, x = function (i) { return L + (n > 1 ? i / (n - 1) * pw : pw / 2); }, y = function (v) { return T + (1 - (v - o.yMin) / (o.yMax - o.yMin)) * ph; };
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px system-ui'; ctx.fillStyle = C.mut; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (var g = o.yMin; g <= o.yMax; g += 10) { ctx.beginPath(); ctx.moveTo(L, y(g)); ctx.lineTo(W - R, y(g)); ctx.stroke(); ctx.fillText(g, 2, y(g) + 3); }
    var step = Math.max(1, Math.ceil(n / 8));
    for (var i = 0; i < n; i += step) { ctx.fillText(o.xLabel(o.xs[i]), x(i) - 10, H - 4); }
    if (o.bars) {                                                    // 아래 띠: 막대(건수) — 선과 축을 섞지 않는다(막대 자체 눈금은 툴팁으로)
      var mx = Math.max(1, Math.max.apply(null, o.bars.ys.map(function (v) { return v || 0; })));
      var bw = Math.max(2, pw / n - 2), y0 = T + ph + 2 + BH;
      o.bars.ys.forEach(function (v, i) {
        var h = (v || 0) / mx * (BH - 4), h2 = o.bars.ys2 ? (o.bars.ys2[i] || 0) / mx * (BH - 4) : 0;
        ctx.fillStyle = o.bars.color; ctx.globalAlpha = 0.8; ctx.fillRect(x(i) - bw / 2, y0 - h, bw, h - h2);
        if (h2) { ctx.fillStyle = o.bars.color2; ctx.fillRect(x(i) - bw / 2, y0 - h2, bw, h2); }
        ctx.globalAlpha = 1;
      });
      ctx.fillStyle = C.mut; ctx.fillText(mx + '건', W - R - 22, y0 - BH + 8);
    }
    if (o.ref) { ctx.strokeStyle = o.ref.color; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(L, y(o.ref.y)); ctx.lineTo(W - R, y(o.ref.y)); ctx.stroke(); ctx.setLineDash([]); }
    o.series.forEach(function (s) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath(); var on = false;
      s.ys.forEach(function (v, i) { if (v == null) { on = false; return; } if (on) ctx.lineTo(x(i), y(v)); else ctx.moveTo(x(i), y(v)); on = true; });
      ctx.stroke();
      s.ys.forEach(function (v, i) { if (v == null) return; ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x(i), y(v), 2.5, 0, 7); ctx.fill(); });
    });
    cv.onmousemove = function (e) {
      var r = cv.getBoundingClientRect(), px = e.clientX - r.left, i = Math.round((px - L) / pw * (n - 1));
      if (i < 0 || i >= n) return tip(null);
      var html = '<div>' + esc(o.xLabel(o.xs[i])) + '</div>' + o.series.map(function (s) { return '<div><i style="color:' + s.color + '">■</i> ' + esc(s.name) + ' <b>' + f1(s.ys[i]) + '</b> ' + o.unit + '</div>'; }).join('') +
        (o.bars ? '<div><i style="color:' + o.bars.color + '">■</i> ' + esc(o.bars.name) + ' <b>' + (o.bars.ys[i] || 0) + '</b>' + (o.bars.ys2 ? ' (밤 ' + (o.bars.ys2[i] || 0) + ')' : '') + '</div>' : '');
      tip(html, e.clientX, e.clientY);
    };
    cv.onmouseleave = function () { tip(null); };
  }
  function tip(html, x, y) {
    var t = $('ndTip');
    if (!html) { t.hidden = true; return; }
    t.innerHTML = html; t.hidden = false;
    var w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.min(x + 12, window.innerWidth - w - 8) + 'px'; t.style.top = Math.max(4, y - h - 10) + 'px';
  }

  /* ── 사건 분석 ── */
  function loadStats() {
    var days = +$('ndRange').value, now = Date.now() / 1000;
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var from = days === 1 ? d0.getTime() / 1000 : now - days * 86400;
    get('/noise/stats?apt=' + S.apt + '&from=' + from + '&to=' + now + (S.sid ? '&sid=' + S.sid : '')).then(function (d) {
      S.stats = d;
      $('ndStatsN').textContent = d.n + '건 (밤 ' + d.night + ')';
      bars($('ndByPhase'), d.phase.map(function (x) { return [PH[x[0]] || x[0], x[1]]; }));
      bars($('ndByAirline'), d.airline);
      bars($('ndByType'), d.type);
      var mx = Math.max(1, Math.max.apply(null, d.hour));
      $('ndByHour').innerHTML = d.hour.map(function (v, h) { return '<i class="' + (h >= 22 || h < 7 ? 'night' : '') + '" style="--h:' + Math.round(v / mx * 100) + '%" data-h="' + h + '" title="' + h + '시 ' + v + '건"></i>'; }).join('');
      $('ndTop').querySelector('tbody').innerHTML = d.top.length ? d.top.map(function (e) {
        return '<tr><td><a href="#" data-t="' + e.t + '" data-sid="' + esc(e.sid) + '" class="nd-go">' + ymdhms(e.t).slice(5) + '</a></td><td>' + esc(sName(e.sid)) + '</td><td>' + esc(e.flight || e.hex) + '</td><td>' + esc(e.type || e.cls || '') + '</td><td>' + (PH[e.phase] || '') + '</td><td class="r">' + (e.dist / 1000).toFixed(1) + 'km</td><td class="r"><b>' + f0(e.lmax) + '</b></td></tr>';
      }).join('') : '<tr><td colspan="7" class="nd-empty">아직 사건이 없습니다.</td></tr>';
    });
  }
  function bars(el, list) {
    if (!list.length) { el.innerHTML = '<div class="nd-empty">없음</div>'; return; }
    var mx = list[0][1] || 1;
    el.innerHTML = list.map(function (x) { return '<div class="b"><span title="' + esc(x[0]) + '">' + esc(x[0]) + '</span><i style="--w:' + Math.round(x[1] / mx * 100) + '%"></i><b>' + x[1] + '</b></div>'; }).join('');
  }
  document.addEventListener('click', function (e) {                   // 사건 시각을 누르면 민원 조회로
    var a = e.target.closest('.nd-go'); if (!a) return;
    e.preventDefault();
    var t = +a.dataset.t; $('ndQT').value = ymdhms(t).replace(' ', 'T'); $('ndQS').value = a.dataset.sid; $('ndQW').value = '5';
    query(); $('ndQ').scrollIntoView({ behavior: 'smooth' });
  });

  /* ── 민원 시각 조회 ── */
  $('ndQ').onsubmit = function (e) { e.preventDefault(); query(); };
  $('ndQNow').onclick = function () { var n = new Date(); $('ndQT').value = ymd(n) + 'T' + pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds()); query(); };
  function query() {
    var t = new Date($('ndQT').value).getTime() / 1000, w = +$('ndQW').value * 60, sid = $('ndQS').value;
    if (!isFinite(t) || !sid) return;
    history.replaceState(null, '', '/noise-dash.html?apt=' + S.apt + '&t=' + encodeURIComponent($('ndQT').value) + '&sid=' + sid);
    get('/noise/range?apt=' + S.apt + '&sid=' + sid + '&from=' + (t - w) + '&to=' + (t + w)).then(function (d) {
      $('ndQOut').hidden = false; $('ndQReport').hidden = false;
      var s = sensOf(sid), pk = d.summary.peak, sm = d.summary;
      if (!d.points.length) { $('ndQSum').innerHTML = '<b>' + esc(s.name) + '</b> · ' + ymdhms(t) + ' 전후 ' + (w / 60) + '분 — <span style="color:#d29922">저장된 표본이 없습니다</span>(그 시각에 서버가 꺼져 있었거나 보관 기간이 지났습니다).'; $('ndQCv').getContext('2d').clearRect(0, 0, 9999, 9999); $('ndQEv').querySelector('tbody').innerHTML = ''; $('ndQTxt').textContent = ''; return; }
      var ev = d.events.slice().sort(function (a, b) { return a.t - b.t; });
      var near = ev.reduce(function (m, e) { return m == null || Math.abs(e.t - t) < Math.abs(m.t - t) ? e : m; }, null);
      $('ndQSum').innerHTML = '<b>' + esc(s.name) + '</b> · ' + ymdhms(t) + ' 전후 ' + (w / 60) + '분 (' + (d.src === 'sample' ? '1초 표본' : '1분 집계') + ')<br>' +
        '구간 Leq <b>' + f1(sm.leq) + '</b> dB(A) (항공기 ' + f1(sm.leqa) + ') · 최대 <b>' + f1(pk.db) + '</b> dB ' + hms(pk.t) + (pk.flight ? ' · ' + esc(pk.flight) : '') + ' · 사건 <b>' + sm.nEvents + '</b>건' +
        (near ? '<br>민원 시각에 가장 가까운 사건: ' + hms(near.t) + ' <b>' + esc(near.flight || near.hex) + '</b> ' + esc(near.type || '') + ' ' + (PH[near.phase] || '') + ' ' + (near.dist / 1000).toFixed(1) + 'km · Lmax ' + f0(near.lmax) + 'dB (' + (Math.abs(near.t - t) < 60 ? Math.round(Math.abs(near.t - t)) + '초' : Math.round(Math.abs(near.t - t) / 60) + '분') + ' 차이)' : '<br>구간 안에 소음 사건이 없습니다 — 배경 수준');
      qChart($('ndQCv'), d, t, s);
      legend($('ndQLeg'), [['합성(배경 포함)', C.s1], ['항공기 기여', C.s2], ['민원 시각', '#fff']], [['사건(Lmax)', C.s3]]);
      $('ndQEv').querySelector('tbody').innerHTML = ev.length ? ev.map(function (e) { return '<tr><td>' + hms(e.t) + '</td><td>' + esc(e.flight || e.hex) + '</td><td>' + esc(e.reg || '') + '</td><td>' + esc(e.type || e.cls || '') + '</td><td>' + (PH[e.phase] || '') + '</td><td class="r">' + (e.dist / 1000).toFixed(1) + 'km</td><td class="r"><b>' + f0(e.lmax) + '</b></td></tr>'; }).join('') : '<tr><td colspan="7" class="nd-empty">사건 없음</td></tr>';
      $('ndQTxt').textContent = '[소음 조회 — 모의값] ' + esc(S.names[S.apt]) + '공항 ' + s.name + ' 측정기(가정 위치)\n' +
        '조회 시각: ' + ymdhms(t) + ' (전후 ' + (w / 60) + '분)\n' +
        '구간 등가소음 Leq ' + f1(sm.leq) + ' dB(A) · 최대 ' + f1(pk.db) + ' dB(A) ' + hms(pk.t) + (pk.flight ? ' (' + pk.flight + ')' : '') + '\n' +
        '소음 사건 ' + sm.nEvents + '건:\n' + (ev.length ? ev.map(function (e) { return '  ' + hms(e.t) + ' ' + (e.flight || e.hex) + ' ' + (e.type || '') + ' ' + (PH[e.phase] || '') + ' 거리 ' + (e.dist / 1000).toFixed(1) + 'km · Lmax ' + f0(e.lmax) + ' dB(A)'; }).join('\n') : '  없음') +
        '\n※ 실제 측정기가 아닌 항적 기반 추정(±5~10dB)이며 법적 기준 판단에 쓸 수 없습니다.';
    });
  }
  /* 검증 절은 관리용 별도 파일(noise-dash-val.js) — 공개 주소에서는 싣지 않는다(10-29 운영자 「웹에 계산·검증 로직을 두지 않는다」) */
  function validation() {
    if (window.NW_PUBLIC) return;
    var go = function () { if (window.NoiseDashVal) NoiseDashVal.run(S, $, get, esc, f1, tiles); };
    if (window.NoiseDashVal) return go();
    var s = document.createElement('script'); s.src = '/noise-dash-val.js?v=1'; s.onload = go; document.head.appendChild(s);
  }

  $('ndQReport').onclick = function () { location.href = '/noise-report.html?apt=' + S.apt + '&sid=' + $('ndQS').value + '&t=' + encodeURIComponent($('ndQT').value) + '&w=' + $('ndQW').value; };

  /* ── 민원 접수부 — 접수하면 바로 분석보고서로(상태 접수→확인→답변은 보고서 화면에서) ── */
  var CP_ST = { '접수': '#d29922', '확인': '#58a6ff', '답변': '#3fb950' };
  function cpInit() {
    var n = new Date(Date.now() - 600000); $('ndCpT').value = ymd(n) + 'T' + pad(n.getHours()) + ':' + pad(n.getMinutes());
    $('ndCp').onsubmit = function (e) {
      e.preventDefault();
      var t = new Date($('ndCpT').value).getTime() / 1000; if (!isFinite(t)) return;
      fetch('/noise/complaint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apt: S.apt, sid: $('ndCpS').value, t: t, w: +$('ndCpW').value, area: $('ndCpA').value, note: $('ndCpN').value }) })
        .then(function (r) { return r.json(); }).then(function (d) { if (d.ok) location.href = '/noise-report.html?apt=' + S.apt + '&cid=' + d.id; else alert(d.why || '접수 실패'); });
    };
    cpList();
  }
  function cpList() {
    if (window.NW_PUBLIC) return;                                     // 공개 화면엔 민원 접수부가 없다(서버도 404)
    get('/noise/complaints?apt=' + S.apt).then(function (d) {
      var tb = $('ndCpList').querySelector('tbody');
      tb.innerHTML = (d.items || []).length ? d.items.map(function (c) {
        return '<tr><td>C-' + c.id + '</td><td>' + ymdhms(c.created).slice(5, 16) + '</td><td>' + ymdhms(c.t).slice(5, 16) + '</td><td>' + esc(sName(c.sid)) + '</td><td>' + esc(c.area || '') + '</td><td>' + esc((c.note || '').slice(0, 40)) + '</td><td><b style="color:' + (CP_ST[c.status] || '#fff') + '">' + esc(c.status) + '</b></td><td><a href="/noise-report.html?apt=' + S.apt + '&cid=' + c.id + '">보고서</a></td></tr>';
      }).join('') : '<tr><td colspan="8" class="nd-empty">접수된 민원이 없습니다.</td></tr>';
    }).catch(function () {});
  }

  $('ndQCopy').onclick = function () {
    navigator.clipboard.writeText($('ndQTxt').textContent).then(function () { $('ndQMsg').textContent = '복사했습니다'; setTimeout(function () { $('ndQMsg').textContent = ''; }, 2000); }, function () { $('ndQMsg').textContent = '복사 실패 — 아래 글을 직접 선택하세요'; });
  };
  function qChart(cv, d, t, s) {
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600, H = 200;
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    var L = 30, R = 8, T = 10, B = 18, pw = W - L - R, ph = H - T - B, t0 = d.from, t1 = d.to;
    var ys = d.points.map(function (p) { return p.db; }).concat(d.points.map(function (p) { return p.dba; })).filter(function (v) { return v != null; });
    var yMin = Math.floor(Math.min(40, Math.min.apply(null, ys) - 2) / 10) * 10, yMax = Math.ceil(Math.max(70, Math.max.apply(null, ys) + 3) / 10) * 10;
    var x = function (tt) { return L + (tt - t0) / (t1 - t0) * pw; }, y = function (v) { return T + (1 - (v - yMin) / (yMax - yMin)) * ph; };
    ctx.clearRect(0, 0, W, H); ctx.font = '10px system-ui'; ctx.fillStyle = C.mut; ctx.strokeStyle = C.grid;
    for (var g = yMin; g <= yMax; g += 10) { ctx.beginPath(); ctx.moveTo(L, y(g)); ctx.lineTo(W - R, y(g)); ctx.stroke(); ctx.fillText(g, 2, y(g) + 3); }
    for (var k = 0; k <= 6; k++) { var tt = t0 + (t1 - t0) * k / 6; ctx.fillText(hm(tt), x(tt) - 14, H - 4); }
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L, y(s.bg)); ctx.lineTo(W - R, y(s.bg)); ctx.stroke(); ctx.setLineDash([]);
    [['db', C.s1], ['dba', C.s2]].forEach(function (k) {
      ctx.strokeStyle = k[1]; ctx.lineWidth = k[0] === 'db' ? 2 : 1.5; ctx.beginPath(); var on = false;
      d.points.forEach(function (p) { var v = p[k[0]]; if (v == null) { on = false; return; } if (on) ctx.lineTo(x(p.t), y(v)); else ctx.moveTo(x(p.t), y(v)); on = true; });
      ctx.stroke();
    });
    d.events.forEach(function (e) { ctx.strokeStyle = C.s3; ctx.lineWidth = 2; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(x(e.t), y(yMin)); ctx.lineTo(x(e.t), y(e.lmax)); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = '#e6edf3'; ctx.fillText(e.flight || e.hex, x(e.t) + 3, y(e.lmax) - 2); });
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x(t), T); ctx.lineTo(x(t), T + ph); ctx.stroke();
    cv.onmousemove = function (e) {
      var r = cv.getBoundingClientRect(), tt = t0 + (e.clientX - r.left - L) / pw * (t1 - t0);
      var p = d.points.reduce(function (m, q) { return m == null || Math.abs(q.t - tt) < Math.abs(m.t - tt) ? q : m; }, null);
      if (!p) return tip(null);
      tip('<div>' + hms(p.t) + '</div><div><i style="color:' + C.s1 + '">■</i> 합성 <b>' + f1(p.db) + '</b> dB</div><div><i style="color:' + C.s2 + '">■</i> 항공기 <b>' + f1(p.dba) + '</b></div>' + (p.flight ? '<div>' + esc(p.flight) + '</div>' : ''), e.clientX, e.clientY);
    };
    cv.onmouseleave = function () { tip(null); };
  }

  window.addEventListener('resize', function () { clearTimeout(render.t); render.t = setTimeout(render, 200); });
  boot();
})();
