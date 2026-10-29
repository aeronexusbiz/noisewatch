/* AeroNexus Biz 소음 — 누적 소음 히트맵 (2026-10-28 · 서버 noise_heat.heat 와 짝)
 * 운영자 「지도 히트맵 누적으로 어느 곳이 특히 시끄러운지 눈으로」 — 저장된 항적으로 지면 격자 칸마다 항공기 Leq(추정)를 시간 24층으로 받아
 * 고른 시간대(전체·낮·저녁·밤·Lden 가중·한 시간)로 합쳐 지도에 칠한다. 시간 띠(24칸)를 누르거나 ▶ 로 시간마다 넘겨 보며 «언제 어디가» 를 본다.
 *   NoiseHeat.init(map, apt, sensors, meta, { mxEl }) — noise.js 가 측정기를 불러온 뒤 한 번. 머리의 #nzHeatBtn 으로 켜고 끈다.
 *   주소 ?heat=YYYY-MM-DD:일수:시 로 바로 열린다(대시보드 시간대표에서 넘어올 때).
 * ⚠ 모의값 — 측정기 값이 아니라 항적에서 모든 칸을 추정한 것. 활주로 둘레 400m 칸은 «시끄러운 곳» 순위에서 뺀다(주거지 비교용). */
(function () {
  'use strict';
  var PRE = {
    all: { name: '하루 전체', hours: range(0, 24) },
    day: { name: '낮 07–19', hours: range(7, 19) },
    eve: { name: '저녁 19–22', hours: range(19, 22) },
    night: { name: '밤 22–07', hours: range(22, 24).concat(range(0, 7)) },
    lden: { name: 'Lden(가중)', hours: range(0, 24), lden: true }
  };
  var RWY_EX_M = 400, HOT_N = 5, HOT_SEP_M = 2000, HOT_MIN = 50, PLAY_MS = 1300, UP = 8;
  var H = { map: null, apt: null, sens: [], meta: null, on: false, d: null, E: null, mode: 'all', hour: null, end: 0, days: 1, op: 0.75, ov: null, cv: null, val: null,
            hot: [], hotL: null, play: null, rwy: [], ex: null, mx: null, timer: null };
  function range(a, b) { var o = []; for (var i = a; i < b; i++) o.push(i); return o; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s) { return H.el.querySelector(s); }
  function pen(h) { return h >= 7 && h < 19 ? 0 : h >= 19 && h < 22 ? 5 : 10; }           // Lden 가중 — 낮·저녁+5·밤+10 (시간대 구분 확인 필요)
  function rgba(v, a) { return 'rgba(' + NoiseHourMx.rgb(v).join(',') + ',' + a + ')'; }

  function init(map, apt, sens, meta, opt) {
    H.map = map; H.apt = apt; H.sens = sens || []; H.meta = meta; opt = opt || {};
    H.rwy = ((meta && meta.pairs) || []).map(function (p) { var a = meta.thr[p[0]], b = meta.thr[p[1]]; return a && b ? [a, b] : null; }).filter(Boolean);
    var C = L.Control.extend({ options: { position: 'bottomleft' }, onAdd: function () { var d = L.DomUtil.create('div', 'nh-pan'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; } });
    H.ctl = new C(); H.ctl.addTo(map); H.el = H.ctl.getContainer(); H.el.hidden = true;
    H.el.innerHTML =
      '<div class="nh-h"><b>누적 소음 히트맵</b><small>항공기 Leq · 추정(모의)</small><button type="button" class="nh-x" title="닫기"><i class="nic" data-ic="close"></i></button></div>' +
      '<div class="nh-row"><select class="nh-per" aria-label="기간"><option value="0:1">오늘</option><option value="1:1">어제</option><option value="0:3">최근 3일</option><option value="0:7">최근 7일</option></select>' +
      '<span class="nh-pre">' + Object.keys(PRE).map(function (k) { return '<button type="button" data-m="' + k + '">' + PRE[k].name + '</button>'; }).join('') + '</span></div>' +
      '<div class="nh-hrs"><button type="button" class="nh-play" title="시간마다 넘겨 보기"><i class="nic" data-ic="play"></i></button><div class="nh-strip" aria-label="시간 띠 — 칸을 누르면 그 한 시간"></div></div>' +
      '<div class="nh-leg"><span>45</span><i></i><span>75+ dB</span><label>진하기 <input type="range" class="nh-op" min="0.2" max="1" step="0.05" value="0.75"></label></div>' +
      '<div class="nh-sum"></div><ol class="nh-hot"></ol><div class="nh-pt">지도 위에 마우스를 올리면(폰은 누르면) 그 지점의 시간대별 소음</div>' +
      '<div class="nh-foot">저장된 항적으로 계산한 예측값(실측 아님) · 서버가 꺼졌던 시간은 평균에서 뺌 · 활주로 바로 옆(' + RWY_EX_M + 'm)은 순위에서 뺌</div>';   // 10-29 리뷰: 모형 설명·빈 괄호 「칸()」을 공개 화면에서 뺐다
    $('.nh-x').onclick = function () { toggle(false); };
    $('.nh-per').onchange = function () { var p = this.value.split(':'); H.end = +p[0]; H.days = +p[1]; load(); };
    $('.nh-pre').onclick = function (e) { var b = e.target.closest('button[data-m]'); if (b) { stop(); setMode(b.dataset.m, null); } };
    $('.nh-strip').onclick = function (e) { var b = e.target.closest('b[data-h]'); if (b) { stop(); setMode('hour', +b.dataset.h); } };
    $('.nh-play').onclick = function () { if (H.play) stop(); else start(); };
    $('.nh-op').oninput = function () { H.op = +this.value; paint(); };
    var btn = document.getElementById('nzHeatBtn');
    if (btn) btn.onclick = function () { toggle(!H.on); };
    map.on('mousemove click', function (e) { if (H.on) point(e.latlng); });
    if (opt.mxEl && window.NoiseHourMx) {                              // 측정기 × 시간대 표 — 칸을 누르면 히트맵을 그 날·그 시간으로
      H.mx = NoiseHourMx.mount(opt.mxEl, { apt: apt, sensors: H.sens, onPick: function (s, h) { toggle(true); stop(); setMode('hour', h); if (s) map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), 13)); } });
    }
    var q = new URLSearchParams(location.search).get('heat');          // ?heat=2026-10-28:7:6 (끝 날:일수:시)
    if (q) {
      var p = q.split(':'), off = Math.round((new Date(ymd(new Date()) + 'T00:00:00') - new Date(p[0] + 'T00:00:00')) / 86400000);
      H.end = Math.max(0, off || 0); H.days = Math.max(1, Math.min(+p[1] || 1, 7));
      var ov = $('.nh-per'); if (!ov.querySelector('option[value="' + H.end + ':' + H.days + '"]')) ov.insertAdjacentHTML('beforeend', '<option value="' + H.end + ':' + H.days + '">' + p[0] + (H.days > 1 ? ' 까지 ' + H.days + '일' : '') + '</option>');
      ov.value = H.end + ':' + H.days;
      if (p[2] !== undefined && p[2] !== '') { H.mode = 'hour'; H.hour = +p[2]; }
      toggle(true);
    }
  }

  function toggle(on) {
    H.on = on; H.el.hidden = !on;
    var btn = document.getElementById('nzHeatBtn'); if (btn) btn.classList.toggle('on', on);
    if (on) { if (!H.d) load(); else paint(); clearInterval(H.timer); H.timer = setInterval(function () { if (H.on && H.end === 0) load(); }, 300000); }   // 오늘은 5분마다 새로(서버 캐시도 5분)
    else { stop(); clearInterval(H.timer); if (H.ov) { H.ov.remove(); H.ov = null; } if (H.hotL) { H.hotL.remove(); H.hotL = null; } }
  }

  function load() {
    var d = new Date(Date.now() - H.end * 86400000);
    $('.nh-sum').textContent = '불러오는 중…';
    fetch('/noise/heat?apt=' + H.apt + '&day=' + ymd(d) + '&days=' + H.days, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.ok) { $('.nh-sum').textContent = r.why || '불러오지 못했습니다'; return; }
      H.d = r; decode(); exclusion(); strip(); paint();
    }).catch(function () { $('.nh-sum').textContent = '불러오지 못했습니다'; });
  }
  /* 시간층 바이트 → 에너지(시간 Leq 를 10^(L/10) 로) · 덮인 초는 따로(합칠 때 가중) */
  function decode() {
    var g = H.d.grid, n = g.nx * g.ny, f = H.d.enc.floor, st = H.d.enc.step;
    H.E = H.d.layers.map(function (b64) {
      if (!b64) return null;
      var s = atob(b64), e = new Float64Array(n);
      for (var i = 0; i < n; i++) { var b = s.charCodeAt(i); e[i] = b ? Math.pow(10, (f + b * st) / 10) : 0; }
      return e;
    });
    var nc = $('.nh-cell'); if (nc) nc.textContent = g.cell + 'm';   // 10-29 설명에서 칸 크기를 뺐다(있을 때만)
  }
  /* 활주로 둘레 칸(순위 제외) — 활주로 끝 쌍을 잇는 선분까지 RWY_EX_M 안 */
  function exclusion() {
    var g = H.d.grid, ex = new Uint8Array(g.nx * g.ny), ky = 110574, kx = 111320 * Math.cos(g.s * Math.PI / 180);
    H.rwy.forEach(function (r) {
      var ax = (r[0].lon - g.w) * kx, ay = (r[0].lat - g.s) * ky, bx = (r[1].lon - g.w) * kx, by = (r[1].lat - g.s) * ky, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (var j = 0; j < g.ny; j++) for (var i = 0; i < g.nx; i++) {
        var px = (i + 0.5) * g.dlon * kx, py = (j + 0.5) * g.dlat * ky, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
        if (Math.hypot(px - ax - t * dx, py - ay - t * dy) < RWY_EX_M) ex[j * g.nx + i] = 1;
      }
    });
    H.ex = ex;
  }
  /* 고른 시간들 → 칸 Leq. 일반: Σ(덮인 초·에너지)/Σ 덮인 초 · Lden: 덮인 시간마다 가중을 더해 평균 */
  function compose(hours, lden) {
    var g = H.d.grid, n = g.nx * g.ny, cov = H.d.cov, out = new Float32Array(n), acc = new Float64Array(n), w = 0;
    hours.forEach(function (h) {
      if (!cov[h]) return;
      var e = H.E[h], k = lden ? Math.pow(10, pen(h) / 10) : cov[h];
      w += lden ? 1 : cov[h];
      if (e) for (var i = 0; i < n; i++) acc[i] += k * e[i];
    });
    for (var i = 0; i < n; i++) out[i] = w && acc[i] ? 10 * Math.log10(acc[i] / w) : -Infinity;
    return { v: out, covered: w > 0 };
  }
  function sel() { return H.mode === 'hour' ? { hours: [H.hour], lden: false, name: pad(H.hour) + '시' } : { hours: PRE[H.mode].hours, lden: !!PRE[H.mode].lden, name: PRE[H.mode].name }; }
  function setMode(m, h) { H.mode = m; H.hour = h; paint(); }

  function color(v, op) {
    if (!(v >= 45)) return null;
    var c = NoiseHourMx.rgb(v), a = (v < 50 ? 0.15 + (v - 45) / 5 * 0.4 : Math.min(0.55 + (v - 50) / 20 * 0.3, 0.85)) * op;
    return [c[0], c[1], c[2], Math.round(a * 255)];
  }
  function paint() {
    if (!H.on || !H.d) return;
    var g = H.d.grid, s = sel(), r = compose(s.hours, s.lden);
    H.val = r.v;
    if (!H.cv) { H.cv = document.createElement('canvas'); }
    H.cv.width = g.nx; H.cv.height = g.ny;
    var ctx = H.cv.getContext('2d'), img = ctx.createImageData(g.nx, g.ny);
    for (var j = 0; j < g.ny; j++) for (var i = 0; i < g.nx; i++) {
      var c = color(r.v[j * g.nx + i], H.op); if (!c) continue;
      var o = ((g.ny - 1 - j) * g.nx + i) * 4;                      // 격자 0행 = 남쪽 · 그림 0행 = 북쪽
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
    }
    ctx.putImageData(img, 0, 0);
    // 칸 그림(nx×ny)을 UP 배로 부드럽게 늘려 싣는다 — 작은 그림을 그대로 실으면 크게 확대할 때 칸이 네모로 보인다
    if (!H.big) H.big = document.createElement('canvas');
    H.big.width = g.nx * UP; H.big.height = g.ny * UP;
    var bx = H.big.getContext('2d'); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.drawImage(H.cv, 0, 0, H.big.width, H.big.height);
    var b = [[g.s, g.w], [g.s + g.ny * g.dlat, g.w + g.nx * g.dlon]], url = H.big.toDataURL();
    if (!H.ov) H.ov = L.imageOverlay(url, b, { className: 'nh-ov', interactive: false, zIndex: 250 }).addTo(H.map); else H.ov.setUrl(url);
    hotspots(r.v, s);
    H.el.querySelectorAll('.nh-pre button').forEach(function (x) { x.classList.toggle('on', x.dataset.m === H.mode); });
    H.el.querySelectorAll('.nh-strip b').forEach(function (x) { x.classList.toggle('on', H.mode === 'hour' && +x.dataset.h === H.hour); });
    var cov = s.hours.reduce(function (a, h) { return a + (H.d.cov[h] || 0); }, 0) / 3600;
    $('.nh-sum').innerHTML = '<b>' + esc(s.name) + '</b>' + (s.lden ? ' · 61dB 기준선(확인 필요)' : ' Leq') + ' · ' + (H.days > 1 ? H.d.day + ' 까지 ' + H.days + '일 누적' : H.d.day) +
      (r.covered ? ' · 자료 ' + (H.days > 1 ? H.days + '일 중 ' : '') + cov.toFixed(1) + '시간' : ' · <span class="na">이 시간대 자료 없음</span>');
  }
  /* 시간 띠 — 시마다 «활주로 둘레 밖 최고 칸» 색·숫자 · 자료 없는 시는 빗금 */
  function strip() {
    var g = H.d.grid, n = g.nx * g.ny, html = '', best = null;
    for (var h = 0; h < 24; h++) {
      var e = H.E[h], mx = 0, area = 0;
      if (e) for (var i = 0; i < n; i++) { if (H.ex[i] || !e[i]) continue; var v = 10 * Math.log10(e[i]); if (v > mx) mx = v; if (v >= 55) area++; }
      var km2 = area * g.cell * g.cell / 1e6;
      if (mx && (!best || mx > best.v)) best = { h: h, v: mx };
      html += '<b data-h="' + h + '" class="' + (H.d.cov[h] ? '' : 'na') + '" title="' + pad(h) + '시 — ' + (H.d.cov[h] ? (mx ? '활주로 밖 최고 ' + mx.toFixed(1) + 'dB · 55dB 이상 ' + km2.toFixed(1) + 'km²' : '항공기 소음 없음') : '자료 없음') + '"' +
        (mx >= 45 ? ' style="background:' + rgba(mx, 0.9) + '"' : '') + '><u>' + (h % 3 === 0 ? h : '') + '</u>' + (mx >= 45 ? Math.round(mx) : '') + '</b>';
    }
    $('.nh-strip').innerHTML = html;
    H.loudH = best;
  }
  /* 시끄러운 곳 순위 — 큰 칸부터, 이미 고른 곳과 HOT_SEP_M 이상 떨어진 것만 · 활주로 둘레 제외 */
  function hotspots(v, s) {
    var g = H.d.grid, ky = 110574, kx = 111320 * Math.cos(g.s * Math.PI / 180), idx = [];
    for (var i = 0; i < v.length; i++) if (v[i] >= HOT_MIN && !H.ex[i]) idx.push(i);
    idx.sort(function (a, b) { return v[b] - v[a]; });
    var pick = [];
    for (var k = 0; k < idx.length && pick.length < HOT_N; k++) {
      var c = idx[k], x = (c % g.nx + 0.5) * g.dlon * kx, y = (Math.floor(c / g.nx) + 0.5) * g.dlat * ky;
      if (pick.every(function (p) { return Math.hypot(p.x - x, p.y - y) >= HOT_SEP_M; })) pick.push({ c: c, x: x, y: y, v: v[c], lat: g.s + y / ky, lon: g.w + x / kx });
    }
    if (H.hotL) H.hotL.remove();
    H.hotL = L.layerGroup().addTo(H.map);
    pick.forEach(function (p, i) {
      p.where = where(p.lat, p.lon);
      L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'nh-hm', html: '<span style="--c:' + rgba(p.v, 1) + '">' + (i + 1) + ' · ' + p.v.toFixed(0) + 'dB</span>', iconSize: null }), zIndexOffset: 600 })
        .bindTooltip(esc(p.where) + ' — ' + esc(s.name) + ' ' + p.v.toFixed(1) + 'dB(추정)', { className: 'nz-tip', direction: 'top' }).addTo(H.hotL);
    });
    var lh = H.loudH;
    $('.nh-hot').innerHTML = (pick.length ? pick.map(function (p, i) {
      return '<li data-i="' + i + '"><b style="color:' + rgba(p.v, 1) + '">' + p.v.toFixed(1) + '</b> ' + esc(p.where) + '</li>';
    }).join('') : '<li class="none">' + HOT_MIN + 'dB 넘는 칸 없음(활주로 둘레 제외)</li>') + (lh ? '<li class="lh">가장 시끄러운 시간 <b>' + pad(lh.h) + '시</b> (활주로 밖 최고 ' + lh.v.toFixed(0) + 'dB)</li>' : '');
    $('.nh-hot').onclick = function (e) { var li = e.target.closest('li[data-i]'); if (li) { var p = pick[+li.dataset.i]; H.map.flyTo([p.lat, p.lon], Math.max(H.map.getZoom(), 14)); point(L.latLng(p.lat, p.lon)); } };
  }
  /* 위치 이름 — 측정기 1.5km 안이면 「○○ 측정기 부근」, 아니면 가장 가까운 측정기에서 방위·거리 */
  function where(lat, lon) {
    var kx = 111.32 * Math.cos(lat * Math.PI / 180), best = null;
    H.sens.forEach(function (s) { var d = Math.hypot((s.lat - lat) * 110.574, (s.lon - lon) * kx); if (!best || d < best.d) best = { s: s, d: d }; });
    if (!best) return lat.toFixed(4) + ', ' + lon.toFixed(4);
    if (best.d < 1.5) return best.s.name + ' 측정기 부근';
    var b = (Math.atan2((lon - best.s.lon) * kx, (lat - best.s.lat) * 110.574) * 180 / Math.PI + 360) % 360;
    return best.s.name + ' ' + ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(b / 45) % 8] + ' ' + best.d.toFixed(1) + 'km';
  }
  /* 커서 지점 — 고른 시간대 값 + 24시간 막대 */
  function point(ll) {
    if (!H.d) return;
    var g = H.d.grid, i = Math.floor((ll.lng - g.w) / g.dlon), j = Math.floor((ll.lat - g.s) / g.dlat), el = $('.nh-pt');
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) { el.textContent = '격자 밖 — 측정기 둘레 6km 안만 계산합니다'; return; }
    var c = j * g.nx + i, v = H.val && H.val[c], bars = '';
    for (var h = 0; h < 24; h++) {
      var e = H.E[h] && H.E[h][c], L0 = e ? 10 * Math.log10(e) : null, ht = L0 ? Math.max(4, Math.min(100, (L0 - 35) / 45 * 100)) : 0;
      bars += '<i title="' + pad(h) + '시 ' + (H.d.cov[h] ? (L0 ? L0.toFixed(1) + 'dB' : '항공기 소음 없음') : '자료 없음') + '" class="' + (H.d.cov[h] ? '' : 'na') + '"><s style="height:' + ht + '%;background:' + (L0 ? rgba(L0, 0.95) : 'transparent') + '"></s></i>';
    }
    el.innerHTML = '<div><b>' + esc(where(ll.lat, ll.lng)) + '</b> · ' + esc(sel().name) + ' <b class="v">' + (v > 0 ? v.toFixed(1) + 'dB' : '45dB 미만') + '</b>' + (H.ex[c] ? ' <small>(활주로 둘레)</small>' : '') + '</div><div class="nh-bars">' + bars + '</div><div class="nh-ax"><span>0시</span><span>6</span><span>12</span><span>18</span><span>23</span></div>';
  }
  /* ▶ 시간마다 — 자료 있는 시만 차례로 */
  function start() {
    var hs = range(0, 24).filter(function (h) { return H.d && H.d.cov[h]; }); if (!hs.length) return;
    var k = H.mode === 'hour' ? Math.max(0, hs.indexOf(H.hour)) : 0;
    $('.nh-play').innerHTML = '<i class="nic" data-ic="pause"></i>';
    setMode('hour', hs[k]);
    H.play = setInterval(function () { k = (k + 1) % hs.length; setMode('hour', hs[k]); }, PLAY_MS);
  }
  function stop() { if (H.play) { clearInterval(H.play); H.play = null; } var b = H.el && $('.nh-play'); if (b) b.innerHTML = '<i class="nic" data-ic="play"></i>'; }

  window.NoiseHeat = { init: init, toggle: toggle };
})();
