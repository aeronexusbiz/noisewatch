/* 지점 설명 풍선 (2026-10-31 · 운영자 「지도에 지점 이름은 빼고 숫자만 · 숫자를 누르면 지역 설명」) — 이름표 숨김은 noise-senpop.css(폰).
 *   지도 위 지점 동그라미를 누르면 그 자리에 풍선: 이름 · 지금 dB·체감 등급 · 공항에서 방향·거리 · 배경 소음 · 지금 원인 항공기 · 「목록에서 보기」.
 *   ⛔ 공개 화면은 지점 주소·측정소 정보를 내지 않는다(server.py _public · 국가소음정보시스템) — 설명은 공개된 좌표·값으로만 만든다.
 *   값은 noise.js 가 그리는 지점 카드(#nzCards .nz-card)에서 읽는다(새 요청 없음 · 좌표만 /noise/sensors 한 번). noise.js 는 고치지 않는다. */
(function () {
  'use strict';
  var DIR = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  var pos = {}, arp = null, aptName = '', aptKey = '', box = null, cur = null, tick = null;
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function apt() { var s = document.getElementById('nzApt'); return (s && s.value) || new URLSearchParams(location.search).get('apt') || 'RKSS'; }
  function load() {                                                     // 공항이 바뀔 때만 좌표를 다시 받는다
    var a = apt(); if (a === aptKey) return; aptKey = a; pos = {}; arp = null;
    fetch('/noise/sensors?apt=' + a, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { (d.sensors || []).forEach(function (s) { pos[s.id] = s; }); if (cur) paint(); }).catch(function () {});
    fetch('/airports.json').then(function (r) { return r.json(); }).then(function (d) {
      var x = (d.airports || []).filter(function (y) { return y.icao === a; })[0]; if (x) { arp = x.arp; aptName = x.name + '공항'; if (cur) paint(); }
    }).catch(function () {});
  }
  function where(s) {
    if (!s || !arp) return '';
    var r = Math.PI / 180, dy = (s.lat - arp[0]) * 111.2, dx = (s.lon - arp[1]) * 111.2 * Math.cos(arp[0] * r), km = Math.sqrt(dx * dx + dy * dy);
    var b = (Math.atan2(dx, dy) / r + 360) % 360;
    return aptName + '에서 ' + DIR[Math.round(b / 45) % 8] + '쪽 약 ' + (km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km');
  }
  function close() { if (box) box.hidden = true; cur = null; clearInterval(tick); document.body.classList.remove('nsp-open'); }
  function paint() {
    if (!cur || !box) return;
    var c = document.querySelector('#nzCards .nz-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(cur) : cur) + '"]'); if (!c) { close(); return; }
    var s = pos[cur], q = function (x) { return c.querySelector(x); };
    var db = (q('.big b') || {}).textContent || '–', lv = c.dataset.lv || 'ok', word = (q('.st') || {}).textContent || '';
    box.dataset.lv = lv;
    box.querySelector('.nsp-name').textContent = (q('.h b') || {}).textContent || '';
    box.querySelector('.nsp-db').innerHTML = esc(db) + '<small>dB(A)</small>';
    box.querySelector('.nsp-lv').textContent = c.dataset.label || word;
    var w = where(s), bg = s && s.bg != null ? '배경 소음 약 ' + s.bg + 'dB' : '';
    box.querySelector('.nsp-where').textContent = [w, bg].filter(Boolean).join('. ') + (w || bg ? '.' : '');
    box.querySelector('.nsp-why').textContent = c.dataset.cause ? '지금 원인: ' + c.dataset.cause : '지금은 항공기 영향이 없습니다(배경 수준).';
    place();
  }
  function place() {                                                    // 동그라미 바로 위 · 지도 밖으로 나가지 않게
    var st = $('.nz-stage'), dot = document.querySelector('.nz-sen .dot[data-sid="' + (window.CSS && CSS.escape ? CSS.escape(cur) : cur) + '"]');
    if (!st || !dot) return;
    var a = st.getBoundingClientRect(), d = dot.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    var x = d.left + d.width / 2 - a.left - w / 2, y = d.top - a.top - h - 12;
    if (y < 8) y = d.bottom - a.top + 12;                               // 위에 자리가 없으면 아래로
    box.style.left = Math.max(8, Math.min(a.width - w - 8, x)) + 'px'; box.style.top = Math.max(8, y) + 'px';
  }
  function open(id) {
    load(); cur = id;
    if (!box) {
      box = document.createElement('div'); box.className = 'nsp'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '지점 설명');
      box.innerHTML = '<button type="button" class="nsp-x" aria-label="닫기">×</button>' +
        '<div class="nsp-h"><b class="nsp-name" translate="no"></b><span class="nsp-lv"></span></div><div class="nsp-db"></div>' +
        '<p class="nsp-where"></p><p class="nsp-why"></p><button type="button" class="nsp-go">목록에서 자세히 보기</button>';
      box.querySelector('.nsp-x').onclick = close;
      box.querySelector('.nsp-go').onclick = function () {
        var c = document.querySelector('#nzCards .nz-card[data-id="' + cur + '"]'); close(); if (!c) return;
        if (!c.classList.contains('sel')) c.click();
        setTimeout(function () { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 350);
      };
      ['click', 'pointerdown', 'touchstart', 'wheel', 'dblclick'].forEach(function (k) { box.addEventListener(k, function (e) { e.stopPropagation(); }); });   // 풍선을 누른 것이 지도 끌기·확대로 가지 않게
      ($('.nz-stage') || document.body).appendChild(box);
    }
    box.hidden = false; document.body.classList.add('nsp-open');
    paint();
    clearInterval(tick); tick = setInterval(paint, 1000);              // 값·자리(지도 이동)를 1초마다
  }
  document.addEventListener('click', function (e) {
    if (box && !box.hidden && box.contains(e.target)) return;
    var m = e.target.closest && e.target.closest('.nz-sen');
    if (m) { var d = m.querySelector('.dot'); if (d && d.dataset.sid) { e.stopPropagation(); if (cur === d.dataset.sid && box && !box.hidden) close(); else open(d.dataset.sid); } return; }
    if (cur && e.target.closest && e.target.closest('#nzMap')) close();   // 지도 빈 곳을 누르면 닫는다
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cur) close(); });
  window.addEventListener('resize', function () { if (cur) place(); });
  document.addEventListener('DOMContentLoaded', function () { var s = document.getElementById('nzApt'); if (s) s.addEventListener('change', close); });
})();
