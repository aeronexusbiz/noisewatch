/* AeroNexus Biz 소음 — 마우스로 그린 구역(박스)의 소음 추정 (2026-10-28 · 서버 noise_box.box 와 짝)
 * 운영자 「항공기 주변에 소음 표시가 나지 않는 곳도 마우스로 박스를 그리면 대충 소음값을 예측할 수 있는가」.
 *   머리 #nzBoxBtn → 지도에서 끌어 박스 · /noise/box 2초마다(리플레이 중이면 그 시각 t) · 박스 안 작은 소음 그림 + 판(지금 · 누적).
 *   계산은 서버가 한다 — 화면은 그리기만.
 *   NoiseBox.init(map, apt) · NoiseBox.frame(d)(리플레이 시각을 따라가려고) — noise.js 가 한 줄씩.
 * ⚠ 모의값 · 항공기 소음만(배경 제외). 폰 터치로 그리기는 아직 없음(마우스). */
(function () {
  'use strict';
  var POLL_MS = 2000;
  var B = { map: null, apt: null, arm: false, a: null, rect: null, ov: null, bb: null, t: null, mode: 'live', days: 1, timer: null, busy: false, el: null, cv: null };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function f1(v) { return v == null ? '–' : (+v).toFixed(1); }
  var STOPS = [[40, [56, 189, 248]], [50, [34, 197, 94]], [60, [132, 204, 22]], [70, [234, 179, 8]], [80, [249, 115, 22]], [90, [239, 68, 68]]];
  function rgb(v) { for (var i = 1; i < STOPS.length; i++) if (v <= STOPS[i][0]) { var a = STOPS[i - 1], b = STOPS[i], f = Math.max(0, (v - a[0]) / (b[0] - a[0])); return a[1].map(function (x, k) { return Math.round(x + (b[1][k] - x) * f); }); } return STOPS[STOPS.length - 1][1]; }
  function col(v) { return v == null ? '#6e7681' : 'rgb(' + rgb(v).join(',') + ')'; }
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '통과' };

  function init(map, apt) {
    B.map = map; B.apt = apt;
    var C = L.Control.extend({ options: { position: 'topright' }, onAdd: function () { var d = L.DomUtil.create('div', 'nb-pan'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; } });
    B.ctl = new C(); B.ctl.addTo(map); B.el = B.ctl.getContainer(); B.el.hidden = true;
    var btn = document.getElementById('nzBoxBtn');
    if (btn) btn.onclick = function () { arm(!B.arm); };
    map.on('mousedown', down); map.on('mousemove', move); map.on('mouseup', up);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && B.arm) arm(false); });
  }
  function arm(on) {
    B.arm = on;
    var btn = document.getElementById('nzBoxBtn'); if (btn) { btn.classList.toggle('on', on || !!B.bb); btn.innerHTML = on ? '<i class="nic" data-ic="box"></i> 지도에서 끌어 그리기…' : '<i class="nic" data-ic="box"></i> 구역 소음'; }
    B.map.getContainer().classList.toggle('nb-arm', on);
    if (on) B.map.dragging.disable(); else B.map.dragging.enable();
  }
  function down(e) { if (!B.arm) return; B.a = e.latlng; if (B.rect) B.rect.remove(); B.rect = L.rectangle([B.a, B.a], { color: '#e0e7ff', weight: 2, dashArray: '6 4', fill: false, interactive: false }).addTo(B.map); }
  function move(e) { if (B.arm && B.a && B.rect) B.rect.setBounds([B.a, e.latlng]); }
  function up(e) {
    if (!B.arm || !B.a) return;
    var bnd = L.latLngBounds(B.a, e.latlng); B.a = null; arm(false);
    var px = B.map.latLngToContainerPoint(bnd.getNorthEast()).subtract(B.map.latLngToContainerPoint(bnd.getSouthWest()));
    if (Math.abs(px.x) < 8 || Math.abs(px.y) < 8) { clear(); return; }      // 그냥 누른 것 — 박스 아님
    B.bb = [bnd.getSouth(), bnd.getWest(), bnd.getNorth(), bnd.getEast()];
    B.rect.setStyle({ dashArray: null, color: '#a5b4fc' });
    var btn = document.getElementById('nzBoxBtn'); if (btn) btn.classList.add('on');
    B.el.hidden = false; B.el.innerHTML = '<div class="nb-h"><b>구역 소음</b><small>계산 중…</small></div>';
    load(); clearInterval(B.timer); B.timer = setInterval(load, POLL_MS);
  }
  function clear() {
    clearInterval(B.timer); B.timer = null; B.bb = null;
    if (B.rect) { B.rect.remove(); B.rect = null; } if (B.ov) { B.ov.remove(); B.ov = null; }
    B.el.hidden = true; var btn = document.getElementById('nzBoxBtn'); if (btn) btn.classList.remove('on');
  }
  function frame(d) { if (d) { B.mode = d.mode; B.t = d.mode === 'replay' ? d.now : null; } }
  function load() {
    if (!B.bb || B.busy) return;
    B.busy = true;
    var q = '/noise/box?apt=' + B.apt + '&s=' + B.bb[0] + '&w=' + B.bb[1] + '&n=' + B.bb[2] + '&e=' + B.bb[3] + '&days=' + B.days + (B.t ? '&t=' + Math.round(B.t) : '');
    fetch(q, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(draw).catch(function () {}).then(function () { B.busy = false; });
  }
  function draw(d) {
    if (!B.bb) return;
    if (!d.ok) { B.el.innerHTML = '<div class="nb-h"><b>구역 소음</b><button type="button" class="nb-x"><i class="nic" data-ic="close"></i></button></div><div class="nb-mut">' + esc(d.why || '계산 못 함') + '</div>'; B.el.querySelector('.nb-x').onclick = clear; return; }
    var nw = d.now, ac = d.acc, n = nw.n;
    if (!B.cv) B.cv = document.createElement('canvas');                // 박스 안 작은 소음 그림(점 N×N → 부드럽게)
    B.cv.width = n; B.cv.height = n;
    var ctx = B.cv.getContext('2d'), img = ctx.createImageData(n, n);
    nw.vals.forEach(function (v, k) {
      if (v == null || v < 40) return;
      var c = rgb(v), o = ((n - 1 - Math.floor(k / n)) * n + k % n) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = Math.round(Math.min(0.25 + (v - 40) / 40 * 0.5, 0.75) * 255);
    });
    ctx.putImageData(img, 0, 0);
    var big = document.createElement('canvas'); big.width = n * 12; big.height = n * 12;
    var bx = big.getContext('2d'); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.drawImage(B.cv, 0, 0, big.width, big.height);
    var bnd = [[B.bb[0], B.bb[1]], [B.bb[2], B.bb[3]]];
    if (!B.ov) B.ov = L.imageOverlay(big.toDataURL(), bnd, { interactive: false, zIndex: 270 }).addTo(B.map); else { B.ov.setUrl(big.toDataURL()); B.ov.setBounds(L.latLngBounds(bnd)); }
    var hrs = ac && ac.inGrid ? ac.hours.map(function (v, h) {
      var ht = v == null ? 0 : Math.max(4, Math.min(100, (v - 35) / 45 * 100));
      return '<i class="' + (ac.cov[h] ? '' : 'na') + '" title="' + pad(h) + '시 ' + (ac.cov[h] ? (v == null ? '항공기 소음 없음' : v.toFixed(1) + 'dB') : '자료 없음') + '"><s style="height:' + ht + '%;background:' + col(v) + '"></s></i>';
    }).join('') : '';
    B.el.innerHTML = '<div class="nb-h"><b>구역 소음</b><small>' + nw.km2.toFixed(1) + 'km² · ' + (d.mode === 'replay' ? '리플레이 시각' : '지금') + ' · 모의</small><button type="button" class="nb-x" title="박스 지우기"><i class="nic" data-ic="close"></i></button></div>' +
      '<div class="nb-now"><div><span>최대</span><b style="color:' + col(nw.max && nw.max.db) + '">' + (nw.max ? f1(nw.max.db) : '–') + '</b></div><div><span>평균</span><b style="color:' + col(nw.mean) + '">' + f1(nw.mean) + '</b></div>' +
      '<div><span>60dB↑</span><b>' + nw.area['60'].toFixed(2) + '</b><em>km²</em></div><div><span>70dB↑</span><b>' + nw.area['70'].toFixed(2) + '</b><em>km²</em></div></div>' +
      '<div class="nb-top">' + (nw.top.length ? nw.top.slice(0, 3).map(function (t) { return '<div><b translate="no">' + esc(t.flight || t.reg || t.hex) + '</b> ' + esc(t.type || '') + ' <span class="ph">' + (PH[t.phase] || '') + '</span> → <b style="color:' + col(t.db) + '">' + Math.round(t.db) + 'dB</b></div>'; }).join('') : '<div class="nb-mut">지금 이 구역에 영향 주는 항공기 없음</div>') + '</div>' +
      '<div class="nb-acc"><div class="nb-ah"><b>누적</b><select class="nb-days"><option value="1">' + (ac && ac.day || '오늘') + '</option><option value="7">7일 누적</option></select></div>' +
      (ac && ac.inGrid ? '<div class="nb-kv"><span>하루 Leq <b style="color:' + col(ac.leq) + '">' + f1(ac.leq) + '</b></span><span>Lden(추정) <b style="color:' + col(ac.lden) + '">' + f1(ac.lden) + '</b></span><span>가장 시끄러운 <b>' + (ac.loudHour == null ? '–' : pad(ac.loudHour) + '시') + '</b></span></div>' +
        '<div class="nb-bars">' + hrs + '</div><div class="nb-ax"><span>0시</span><span>6</span><span>12</span><span>18</span><span>23</span></div><div class="nb-mut">저장 항적 ' + ac.covH + '시간 · ' + ac.cells + '칸(' + ac.cell + 'm)</div>'
        : '<div class="nb-mut">누적 격자(측정기 둘레 6km) 밖입니다</div>') + '</div>' +
      '<div class="nb-f">점 ' + n + '×' + n + '마다 서버 예측 모형 · 항공기 소음만 · Lden 기준선 61(그 밖 지역)</div>';
    B.el.querySelector('.nb-x').onclick = clear;
    var sel = B.el.querySelector('.nb-days'); sel.value = String(B.days); sel.onchange = function () { B.days = +this.value; load(); };
  }
  window.NoiseBox = { init: init, frame: frame, clear: clear };
})();
