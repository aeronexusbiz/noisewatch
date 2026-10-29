/* AeroNexus noisewatch — 실시간 소음면: 서버(/noise/field)가 계산한 격자 값을 지도에 칠한다. 화면은 그리기만 한다. */
(function () {
  'use strict';
  var SUB = 2, MIN_DB = 50, MAX_M = 15000, UP = 6;
  var N = { map: null, g: null, on: false, ov: null, cv: null, big: null, val: null, last: null, leg: null };
  /* 순간 dB 색 — 측정기 표지와 같은 눈금(50 초록 → 90 빨강) */
  var STOPS = [[50, [34, 197, 94]], [60, [132, 204, 22]], [70, [234, 179, 8]], [80, [249, 115, 22]], [90, [239, 68, 68]]];
  function rgb(v) {
    for (var i = 1; i < STOPS.length; i++) if (v <= STOPS[i][0]) { var a = STOPS[i - 1], b = STOPS[i], f = Math.max(0, (v - a[0]) / (b[0] - a[0])); return a[1].map(function (x, k) { return Math.round(x + (b[1][k] - x) * f); }); }
    return STOPS[STOPS.length - 1][1];
  }

  function init(map, apt) {
    N.map = map; N.apt = apt;
    fetch('/noise/grid?apt=' + apt, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.ok || !r.grid) return;
      var g = r.grid;
      N.g = { s: g.s, w: g.w, dlat: g.dlat / SUB, dlon: g.dlon / SUB, nx: g.nx * SUB, ny: g.ny * SUB, cell: g.cell / SUB, elev: g.elev || 0, types: r.types };
      var C = L.Control.extend({ options: { position: 'bottomright' }, onAdd: function () { var d = L.DomUtil.create('div', 'nl-leg'); L.DomEvent.disableClickPropagation(d); return d; } });
      N.ctl = new C(); N.ctl.addTo(map); N.leg = N.ctl.getContainer(); N.leg.hidden = true;
      N.leg.innerHTML = '<b>실시간 소음면</b> <small>항공기 소음만 · 모의</small><div class="nl-bar"><span>50</span><i></i><span>90 dB</span></div><div class="nl-pt">지도 위에 마우스를 올리면 그 지점의 지금 값</div>' +
        '<div class="nl-src">서버 예측 모형 · 항공기 소음만 · 예측값(실측 아님)</div>';
      var cb = document.getElementById('nzLive');
      if (cb) { cb.onchange = function () { toggle(this.checked); }; if (cb.checked) toggle(true); }
      map.on('mousemove', function (e) { if (N.on) point(e.latlng); });
    }).catch(function () {});
  }
  function toggle(on) {
    N.on = on && !!N.g;
    if (N.leg) N.leg.hidden = !N.on;
    if (!N.on) { if (N.ov) { N.ov.remove(); N.ov = null; } return; }
    if (N.last) frame(N.last);
  }

  /* 서버 격자 값을 받아 그린다(4초마다 · 리플레이는 프레임 시각마다) */
  function frame(d) {
    N.last = d;
    if (!N.on || !N.g || !d) return;
    // 10-29 성능 리뷰 — 리플레이는 프레임마다(초당 여러 번) 요청해 한도(분 300)를 넘겼다 → 1초에 한 번 · 시각은 초 단위로
    var rp = d.mode === 'replay' ? '&t=' + Math.floor(d.now) : '';
    if (N.busy || (!rp && Date.now() - (N.ft || 0) < 3500) || (rp && (N.rpT === Math.floor(d.now) || Date.now() - (N.ft || 0) < 1000))) return;
    N.busy = true;
    fetch('/noise/field?apt=' + encodeURIComponent(N.apt) + '&sub=' + SUB + rp, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (F) {
      N.busy = false; N.ft = Date.now(); if (rp) N.rpT = Math.floor(d.now);
      if (F && F.ok && F.nx === N.g.nx && F.ny === N.g.ny) { N.model = F.model; N.wind = F.wind; paint(F.db); }
    }).catch(function () { N.busy = false; });
  }
  /* 10-29 운영자 화면 — 격자 끝에서 색이 네모나게 잘렸다 → 가장자리 EDGE 칸 안에서 투명도를 0 까지 부드럽게 줄인다(그리기만 · 값은 그대로) */
  function edge(k, g) {
    var i = k % g.nx, j = Math.floor(k / g.nx), E = Math.max(6, Math.round(Math.min(g.nx, g.ny) * 0.12));
    var d = Math.min(i, g.nx - 1 - i, j, g.ny - 1 - j) / E;
    return d >= 1 ? 1 : d * d * (3 - 2 * d);
  }
  function paint(db) {
    var g = N.g, n = g.nx * g.ny, val = new Float32Array(n);
    if (!N.cv) N.cv = document.createElement('canvas');
    N.cv.width = g.nx; N.cv.height = g.ny;
    var ctx = N.cv.getContext('2d'), img = ctx.createImageData(g.nx, g.ny);
    for (var k = 0; k < n; k++) {
      var v = db[k]; if (!v) continue;
      val[k] = v;
      if (v < MIN_DB - 3) continue;
      var c = rgb(v), al = (v < MIN_DB ? (v - MIN_DB + 3) / 3 * 0.25 : Math.min(0.3 + (v - MIN_DB) / 30 * 0.45, 0.75)) * edge(k, g);
      var o = ((g.ny - 1 - Math.floor(k / g.nx)) * g.nx + k % g.nx) * 4;   // 격자 0행 = 남쪽 · 그림 0행 = 북쪽
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = Math.round(al * 255);
    }
    N.val = val;
    ctx.putImageData(img, 0, 0);
    if (!N.big) N.big = document.createElement('canvas');           // 부드럽게 늘려 싣는다(작은 그림 그대로면 확대할 때 칸이 보인다)
    N.big.width = g.nx * UP; N.big.height = g.ny * UP;
    var bx = N.big.getContext('2d'); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.drawImage(N.cv, 0, 0, N.big.width, N.big.height);
    var url = N.big.toDataURL(), b = [[g.s, g.w], [g.s + g.ny * g.dlat, g.w + g.nx * g.dlon]];
    if (!N.ov) N.ov = L.imageOverlay(url, b, { className: 'nl-ov', interactive: false, zIndex: 260 }).addTo(N.map); else N.ov.setUrl(url);
    var src = N.leg && N.leg.querySelector('.nl-src');
    if (src) src.textContent = '서버 예측 모형 · ' + (N.wind ? '바람 반영' : '바람 자료 없음') + ' · 예측값(실측 아님)';
    if (N.pt) point(N.pt);
  }
  function point(ll) {
    N.pt = ll;
    var g = N.g, el = N.leg && N.leg.querySelector('.nl-pt'); if (!el || !N.val) return;
    var i = Math.floor((ll.lng - g.w) / g.dlon), j = Math.floor((ll.lat - g.s) / g.dlat);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) { el.textContent = '격자 밖 — 측정기 둘레 6km 안만 계산'; return; }
    var v = N.val[j * g.nx + i];
    el.innerHTML = '커서 지점 지금 <b style="color:rgb(' + rgb(Math.max(v, 50)).join(',') + ')">' + (v >= 35 ? v.toFixed(0) + 'dB' : '35dB 미만') + '</b> <small>(항공기만 · ' + ll.lat.toFixed(4) + ', ' + ll.lng.toFixed(4) + ')</small>';
  }
  window.NoiseLive = { init: init, frame: frame, toggle: toggle };
})();
