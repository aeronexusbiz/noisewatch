/* 리플레이 막대 (2026-10-31 · 운영자 「재생은 AeroNexus 재생 막대처럼 세련되게」) — 모양은 AeroNexus features/replay-today 를 따른다(어두운 판 + 노란 강조).
 *   기존 조작부(#nzRp 안의 날짜·▶·막대·배속·다음 사건·실시간으로)는 그대로 두고 숨긴다 — 이 막대는 그것을 대신 누르고 값을 읽는다. noise.js 는 고치지 않는다.
 *   날짜 칸 = 투명하게 덮은 날짜 입력(누르면 달력) · ▶/⏸ · ‹ › 5분 · 타임라인(끌면 놓을 때 한 번만 이동 — 이동마다 지점 8곳 10분 추이를 다시 받는다) · 다음 사건 · 배속 · ✕ 실시간으로 */
(function () {
  'use strict';
  var SPD = [1, 10, 30, 60, 300], WD = ['일', '월', '화', '수', '목', '금', '토'];
  var $ = function (id) { return document.getElementById(id); };
  var P = null, drag = null;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ico(n) { return window.NIcon ? NIcon(n) : ''; }
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hms(s) { s = Math.max(0, Math.min(86399, Math.round(s))); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); }

  function build() {
    var rp = $('nzRp'); if (!rp || P) return;
    P = document.createElement('div'); P.className = 'nrb'; P.setAttribute('role', 'group'); P.setAttribute('aria-label', '일별 리플레이');
    P.innerHTML =
        '<div class="nrb-sec nrb-day" title="날짜 바꾸기(최근 7일)"><span class="nrb-cap"></span><span class="nrb-date"></span></div>'
      + '<div class="nrb-sec nrb-main">'
      +   '<button type="button" class="nrb-play" aria-label="재생">' + svg('M9.5 7.2v9.6l7.6-4.8z') + '</button>'
      +   '<button type="button" class="nrb-arw" data-d="-300" aria-label="5분 뒤로" title="5분 뒤로">' + svg('M14.5 7l-5 5 5 5') + '</button>'
      +   '<div class="nrb-tl">'
      +     '<div class="nrb-hd"><span class="nrb-cap">재생 타임라인</span><span class="nrb-now"><b class="nrb-clk">--:--:--</b> KST</span><button type="button" class="nrb-ev" title="다음 소음 사건으로 건너뛰기"></button></div>'
      +     '<div class="nrb-track" role="slider" tabindex="0" aria-label="재생 시각" aria-valuemin="0" aria-valuemax="86399">'
      +       '<div class="nrb-rail"></div><div class="nrb-fill"></div><div class="nrb-fut"></div><div class="nrb-ticks"></div><div class="nrb-cur"></div></div>'
      +   '</div>'
      +   '<button type="button" class="nrb-arw" data-d="300" aria-label="5분 앞으로" title="5분 앞으로">' + svg('M9.5 7l5 5-5 5') + '</button>'
      + '</div>'
      + '<div class="nrb-sec nrb-spd" title="배속 — 1× = 실제 시간"><span class="nrb-cap">속도</span>'
      +   '<div class="nrb-row"><input type="range" class="nrb-range" min="0" max="' + (SPD.length - 1) + '" step="1" aria-label="배속"><b class="nrb-sv" role="button" tabindex="0" title="누르면 다음 배속"></b></div></div>'
      + '<button type="button" class="nrb-x" aria-label="리플레이 끝내고 실시간으로" title="실시간으로">' + svg('M6 6l12 12M18 6L6 18') + '</button>';
    rp.appendChild(P);
    var day = $('nzRpDay'); if (day) P.querySelector('.nrb-day').appendChild(day);   // 날짜 입력을 날짜 칸 위에 투명하게 — 누르면 그 기기의 달력
    ticks();
    wire();
    loop();
  }
  function ticks() {
    var h = '';
    for (var i = 0; i <= 24; i++) {
      var maj = i % 6 === 0, l = (i / 24 * 100).toFixed(3);
      h += '<i class="nrb-tk' + (maj ? ' maj' : '') + (i % 3 ? ' h1' : '') + '" style="left:' + l + '%"></i>';
      if (maj) h += '<span class="nrb-lb' + (i === 0 ? ' l0' : i === 24 ? ' r0' : '') + '" style="left:' + l + '%">' + pad(i) + ':00</span>';
    }
    P.querySelector('.nrb-ticks').innerHTML = h;
  }
  function seek(sec) {                                                   // 기존 막대에 값을 넣고 input — noise.js 가 그 시각으로 옮긴다
    var r = $('nzRpPos'); if (!r) return;
    r.value = Math.max(0, Math.min(maxSec(), Math.round(sec)));
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function maxSec() { var d = $('nzRpDay'); if (d && d.value === today()) { var n = new Date(); return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds(); } return 86399; }
  function secAt(e) { var b = P.querySelector('.nrb-track').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * 86399; }
  function setSpd(i) { var s = $('nzRpSpd'); if (!s) return; s.value = String(SPD[i]); s.dispatchEvent(new Event('change', { bubbles: true })); }
  function wire() {
    P.querySelector('.nrb-play').onclick = function () { var b = $('nzRpPlay'); if (b) b.click(); };
    P.querySelectorAll('.nrb-arw').forEach(function (a) { a.onclick = function () { seek(+$('nzRpPos').value + (+a.dataset.d)); }; });
    P.querySelector('.nrb-ev').onclick = function () { var n = $('nzRpNext'); if (n) n.click(); };
    P.querySelector('.nrb-x').onclick = function () { var x = $('nzRpLive'); if (x) x.click(); };
    var rg = P.querySelector('.nrb-range'); rg.oninput = function () { setSpd(+rg.value); };
    var sv = P.querySelector('.nrb-sv'); sv.onclick = function () { rg.value = (+rg.value + 1) % SPD.length; setSpd(+rg.value); };
    sv.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sv.onclick(); } };
    var tr = P.querySelector('.nrb-track');
    tr.addEventListener('pointerdown', function (e) { drag = secAt(e); tr.setPointerCapture(e.pointerId); e.preventDefault(); });
    tr.addEventListener('pointermove', function (e) { if (drag != null) drag = secAt(e); });
    var up = function () { if (drag == null) return; var s = drag; drag = null; seek(s); };
    tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', function () { drag = null; });
    tr.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowLeft' ? -60 : e.key === 'ArrowRight' ? 60 : e.key === 'PageDown' ? -600 : e.key === 'PageUp' ? 600 : 0;
      if (d) { e.preventDefault(); seek(+$('nzRpPos').value + d); }
    });
  }
  function paint() {
    var pos = $('nzRpPos'), dayI = $('nzRpDay'); if (!pos || !dayI) return;
    var cur = drag != null ? drag : +pos.value, p = cur / 86399 * 100, isToday = dayI.value === today();
    var fut = isToday ? maxSec() / 86399 * 100 : 100;
    P.querySelector('.nrb-fill').style.width = p + '%';
    var f = P.querySelector('.nrb-fut'); f.style.left = fut + '%'; f.style.width = (100 - fut) + '%';
    P.querySelector('.nrb-cur').style.left = p + '%';
    var clk = drag != null ? hms(drag) : (($('nzRpT') || {}).textContent || hms(cur));
    var k = P.querySelector('.nrb-clk'); if (k.textContent !== clk) k.textContent = clk;
    P.querySelector('.nrb-track').setAttribute('aria-valuenow', Math.round(cur)); P.querySelector('.nrb-track').setAttribute('aria-valuetext', clk + ' KST');
    var playing = !!document.querySelector('#nzRpPlay [data-ic="pause"]'), pl = P.querySelector('.nrb-play');
    if (pl._on !== playing) { pl._on = playing; pl.classList.toggle('on', playing); pl.setAttribute('aria-label', playing ? '일시정지' : '재생'); pl.innerHTML = playing ? svg('M9 7v10M15 7v10') : svg('M9.5 7.2v9.6l7.6-4.8z'); }
    var dv = dayI.value; if (P._dv !== dv && dv) {
      P._dv = dv; var d = new Date(dv + 'T00:00:00'), y = new Date(Date.now() - 86400000);
      var ys = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
      P.querySelector('.nrb-cap').textContent = isToday ? '오늘' : dv === ys ? '어제' : '날짜';
      P.querySelector('.nrb-date').textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WD[d.getDay()] + ')';
    }
    var ev = (($('nzRpNext') || {}).textContent || '').trim(), m = ev.match(/사건\s*(\d+)/), eb = P.querySelector('.nrb-ev');
    var et = m ? '사건 ' + m[1] + '건 · 다음' : ''; if (eb._t !== et) { eb._t = et; eb.innerHTML = et ? et + ' ' + ico('next') : ''; eb.hidden = !et; }
    var s = $('nzRpSpd'), i = s ? SPD.indexOf(+s.value) : 1, rg = P.querySelector('.nrb-range');
    if (i >= 0 && document.activeElement !== rg && +rg.value !== i) rg.value = i;
    var sv = P.querySelector('.nrb-sv'), st = (s ? s.value : '10') + '×'; if (sv.textContent !== st) sv.textContent = st;
    rg.style.setProperty('--p', (rg.value / (SPD.length - 1) * 100) + '%');
  }
  function loop() { if (!$('nzRp').hidden && !document.hidden) paint(); requestAnimationFrame(loop); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
