/* AeroNexus Biz 소음 지도 — 지금 쓰는 활주로의 착륙·이륙 방향 (2026-10-29 · 운영자 「현재 활주로 출발 도착 방향도 같이 표시」)
 *   NoiseRwy.init(map, apt, meta) — noise.js 가 한 줄. meta = 공항 정보(thr 활주로 끝 좌표 · pairs 짝).
 *   /rwy/flow?icao= (AeroNexus 중계 · 25초 캐시) 를 30초마다 — 활주로 고르기는 서버 noise_soon._runway 와 같다(now → cur · 가장 많이 쓴 것).
 *   그림: 착륙 = 연장선 9km 밖 → 문턱(하늘색 화살) · 이륙 = 반대 끝 → 밖 7km(보라 화살) · 오른쪽 위 안내판.
 * ⚠ 리플레이 중에도 «지금» 방향이다(과거 운영 방향을 다시 만들지 않는다) — 안내판에 밝힌다. */
(function () {
  'use strict';
  var POLL_MS = 30000, ARR_KM = 9, DEP_KM = 7;
  var R = { map: null, apt: null, meta: null, g: null, ctl: null, timer: null, key: '' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(n) { return window.NIcon ? NIcon(n) : ''; }
  function brg(a, b) {                                                  // a→b 방위(도, 북=0 시계방향)
    var f1 = a.lat * Math.PI / 180, f2 = b.lat * Math.PI / 180, dl = (b.lon - a.lon) * Math.PI / 180;
    return (Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
  }
  function move(p, deg, km) {                                           // 짧은 거리 — 평면 근사
    var r = deg * Math.PI / 180;
    return { lat: p.lat + km * Math.cos(r) / 110.574, lon: p.lon + km * Math.sin(r) / (111.32 * Math.cos(p.lat * Math.PI / 180)) };
  }
  function pick(flow, kind) {
    var m = R.meta; if (!m || !flow || !flow.ok) return null;
    var srcs = [(flow.now || {})[kind] || {}, (flow.cur || {})[kind] || {}];
    for (var i = 0; i < srcs.length; i++) {
      var ks = Object.keys(srcs[i]); if (!ks.length) continue;
      var name = ks.reduce(function (a, b) { return srcs[i][b] > srcs[i][a] ? b : a; });
      var pair = (m.pairs || []).filter(function (p) { return p.indexOf(name) >= 0; })[0];
      if (pair && m.thr && m.thr[name]) { var o = pair[0] === name ? pair[1] : pair[0]; if (m.thr[o]) return { name: name, thr: m.thr[name], far: m.thr[o], now: i === 0 }; }
    }
    return null;
  }
  function chev(p, deg, cls) {
    return L.marker([p.lat, p.lon], { interactive: false, keyboard: false, zIndexOffset: -400,
      icon: L.divIcon({ className: 'nrw-chev ' + cls, iconSize: null, html: '<svg viewBox="0 0 24 24" style="transform:rotate(' + deg.toFixed(1) + 'deg)"><path d="M5 15.5 12 8.5l7 7"/></svg>' }) });
  }
  function arrow(g, a, b, cls, n) {                                     // a→b 선 + 갈매기표 n개
    L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { className: 'nrw-ln ' + cls, interactive: false, weight: 3, dashArray: '2 7', lineCap: 'round' }).addTo(g);
    var d = brg(a, b);
    for (var i = 1; i <= n; i++) { var t = i / (n + 1); chev({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }, d, cls).addTo(g); }
  }
  function tag(g, p, html, cls) {
    L.marker([p.lat, p.lon], { interactive: false, keyboard: false, zIndexOffset: -300, icon: L.divIcon({ className: 'nrw-tag ' + cls, iconSize: null, html: '<span>' + html + '</span>' }) }).addTo(g);
  }
  function draw(flow) {
    var a = pick(flow, 'arr'), d = pick(flow, 'dep');
    var key = (a ? a.name : '-') + '/' + (d ? d.name : '-');
    if (key !== R.key) {
      R.key = key; R.g.clearLayers();
      if (a) {
        var hd = brg(a.far, a.thr), out = move(a.thr, hd, ARR_KM);  // 문턱 바깥(접근 쪽)
        arrow(R.g, out, a.thr, 'arr', 4);
        L.polyline([[a.thr.lat, a.thr.lon], [a.far.lat, a.far.lon]], { className: 'nrw-rw arr', interactive: false, weight: 6, lineCap: 'round' }).addTo(R.g);
        tag(R.g, out, ic('arrive') + ' 착륙 <b translate="no">' + esc(a.name) + '</b>', 'arr');
      }
      if (d) {
        var hd2 = brg(d.thr, d.far), end = move(d.far, hd2, DEP_KM);
        L.polyline([[d.thr.lat, d.thr.lon], [d.far.lat, d.far.lon]], { className: 'nrw-rw dep', interactive: false, weight: 6, lineCap: 'round' }).addTo(R.g);
        arrow(R.g, d.far, end, 'dep', 3);
        tag(R.g, end, ic('depart') + ' 이륙 <b translate="no">' + esc(d.name) + '</b>', 'dep');
      }
    }
    var dir = flow && flow.cur && flow.cur.dir, pend = flow && flow.pend;
    R.ctl.getContainer().classList.toggle('empty', !(a || d));
    R.ctl.getContainer().innerHTML = (a || d)
      ? '<div class="nrw-h">사용 활주로' + (dir ? ' <small>' + esc(dir) + ' 방향 운영</small>' : '') + '</div>' +
        '<div class="nrw-r arr">' + ic('arrive') + '<span>착륙</span><b translate="no">' + (a ? esc(a.name) : '–') + '</b></div>' +
        '<div class="nrw-r dep">' + ic('depart') + '<span>이륙</span><b translate="no">' + (d ? esc(d.name) : '–') + '</b></div>' +
        '<div class="nrw-f">' + ((a && !a.now) || (d && !d.now) ? '오늘 운영 방향 기준' : '최근 항적 기준') + (pend ? ' · <em>방향 전환 감지</em>' : '') + '<span class="nrw-rp"> · 리플레이 중에도 지금 값</span></div>'
      : '<div class="nrw-h">사용 활주로</div><div class="nrw-f">판정할 항적이 아직 없습니다</div>';
  }
  function load() {
    clearTimeout(R.timer);
    var apt = R.apt;
    fetch('/rwy/flow?icao=' + encodeURIComponent(apt), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (f) { if (apt === R.apt && f) draw(f); }).catch(function () {})
      .then(function () { if (apt === R.apt) R.timer = setTimeout(load, POLL_MS); });
  }
  function init(map, apt, meta) {
    R.map = map; R.apt = apt; R.meta = meta; R.key = '';
    if (!meta || !meta.thr) return;
    if (!R.g) R.g = L.layerGroup().addTo(map); else R.g.clearLayers();
    if (!R.ctl) {
      var C = L.Control.extend({ options: { position: 'topright' }, onAdd: function () { var el = L.DomUtil.create('div', 'nrw-box'); L.DomEvent.disableClickPropagation(el); return el; } });
      R.ctl = new C(); R.ctl.addTo(map);
    }
    load();
  }
  window.NoiseRwy = { init: init };
})();
