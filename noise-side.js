/* AeroNexus Biz 소음 지도 — 오른쪽 패널(측정소 타일 · 아래 3탭) (2026-10-28 · 시안 noise-mockup.html 의 지도 패널 모양)
 *   측정소 카드(noise.js 가 그린 #nzCards .nz-card)를 2열 타일로 — 누른 카드는 «크게 보기»(.sel · 두 칸 · 10분 곡선·기여 항공기·설명).
 *   아래 탭 3개(곧 보일 항공기 · 최근 소음 사건 · 시간대별 표)는 .ms-tabs / .ms-pane 만 바꾼다. noise.js 는 고치지 않는다(카드 클릭의 지도 이동은 그대로). */
(function () {
  'use strict';
  function init() {
    var optBtn = document.getElementById('nzOptBtn'), optWrap = document.getElementById('nzOptWrap');
    if (optBtn && optWrap) {
      optBtn.onclick = function (e) {
        e.stopPropagation();
        var open = optWrap.classList.toggle('open');
        optBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      document.addEventListener('click', function (e) {
        if (!optWrap.contains(e.target)) { optWrap.classList.remove('open'); optBtn.setAttribute('aria-expanded', 'false'); }
      });
    }
    mockupMap();
    var cards = document.getElementById('nzCards'); if (!cards) return;
    function sel(c) { cards.querySelectorAll('.nz-card.sel').forEach(function (x) { if (x !== c) x.classList.remove('sel'); }); if (c) c.classList.add('sel'); }
    cards.addEventListener('click', function (e) { var c = e.target.closest('.nz-card'); if (c) sel(c); });
    new MutationObserver(function () { if (!cards.querySelector('.nz-card.sel')) sel(cards.querySelector('.nz-card')); }).observe(cards, { childList: true });
    document.querySelectorAll('.ms-tabs button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.ms-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
        document.querySelectorAll('.ms-pane').forEach(function (p) { p.classList.toggle('on', p.dataset.mp === b.dataset.mt); });
      };
    });
  }
  /* 10-29 운영자 목업(지도) — ① 지도 모드 3단 [실시간 소음|누적 히트맵|일별 리플레이] ② 실시간 소음면 켜기는 「지도 표시 옵션」 안으로
   * ③ 오른쪽 패널: 누른 카드 = 「선택 지점 집중 모니터링」(맨 위) · 그 아래 「전체 n개 지점 실시간 요약」 머리 · 나머지는 한 줄 요약
   * ④ 집중 판의 「오늘 Lden · 최대 · 사건」 = /noise/daily(1분마다) ⑤ 아래 탭 이름. 기존 단추(히트맵·리플레이)의 동작은 그대로 누른다. */
  function mockupMap() {
    var $ = function (id) { return document.getElementById(id); };
    var heat = $('nzHeatBtn'), rp = $('nzRpBtn'), pill = heat && heat.parentNode, menu = $('nzOptMenu'), live = $('nzLive');
    if (pill && !$('nzModeLive')) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'nzModeLive'; b.className = 'nz-btn nz-mode'; b.innerHTML = '실시간 소음';
      pill.insertBefore(b, pill.firstChild); pill.classList.add('nz-seg');
      heat.classList.add('nz-mode'); if (rp) rp.classList.add('nz-mode');
      b.onclick = function () {
        if (document.body.classList.contains('rp') && $('nzRpLive')) $('nzRpLive').click();
        if (heat.classList.contains('on')) heat.click();
      };
      var sync = function () {
        var r = document.body.classList.contains('rp'), h = heat.classList.contains('on');
        b.classList.toggle('on', !r && !h);
      };
      setInterval(sync, 400); sync();
      // 10-29 리뷰: 히트맵을 켠 채 리플레이를 누르면 세 칸 중 두 칸이 함께 켜졌다 → 셋 중 하나만(먼저 다른 모드를 끈다)
      if (rp) rp.addEventListener('click', function () { if (!document.body.classList.contains('rp') && heat.classList.contains('on')) heat.click(); }, true);
      heat.addEventListener('click', function () { if (!heat.classList.contains('on') && document.body.classList.contains('rp') && $('nzRpLive')) $('nzRpLive').click(); }, true);
    }
    if (menu && live && live.closest('label') && live.closest('label').parentNode !== menu) menu.insertBefore(live.closest('label'), menu.firstChild);
    var names = { soon: '곧 지나갈 항공기 <small>5분 예보</small>', ev: '최근 60dB+ 소음 기록', hm: '시간대별 표' };
    document.querySelectorAll('.ms-tabs button').forEach(function (t) { if (names[t.dataset.mt]) t.innerHTML = names[t.dataset.mt]; });
    var cards = $('nzCards'); if (!cards) return;
    var head = document.createElement('div'); head.className = 'ms-sum';
    var apt = function () { var s = $('nzApt'); return (s && s.value) || new URLSearchParams(location.search).get('apt') || 'RKSS'; };
    head.innerHTML = '<b>전체 <span class="n">–</span>개 지점 실시간 요약</b> <small>누르면 위에 크게</small><a class="ms-big" href="/noise-watch.html">크게 보기 →</a>';
    cards.insertBefore(head, cards.firstChild);
    head.querySelector('.ms-big').onclick = function () { this.href = '/noise-watch.html?apt=' + apt(); };
    var day = {};
    function today() {
      if (document.documentElement.classList.contains('nw-pub')) return;   // 10-31 일반 화면은 오늘 Lden 을 보이지 않는다(noise-role.css) — 부르지도 않는다
      fetch('/noise/daily?apt=' + apt() + '&days=1', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !d.ok) return;
        Object.keys(d.sensors || {}).forEach(function (k) { var a = d.sensors[k]; day[k] = a && a[a.length - 1]; });
        paint();
      }).catch(function () {});
    }
    function f1(v) { return v == null ? '–' : (+v).toFixed(1); }
    function paint() {
      var all = cards.querySelectorAll('.nz-card'); head.querySelector('.n').textContent = all.length;
      head.hidden = !all.length;                                      // 측정기 없는 공항(인천 등) — 안내만
      all.forEach(function (c) {
        var r = day[c.dataset.id], t = c.querySelector('.today'); if (!t) return;
        t.innerHTML = r ? '오늘 Lden <b>' + f1(r.lden) + '</b> · 최대 <b>' + (r.lmax == null ? '–' : Math.round(r.lmax)) + '</b> · 사건 <b>' + (r.nev || 0) + '건</b>' : '';
      });
    }
    new MutationObserver(function () { if (head.parentNode !== cards || cards.firstChild !== head) cards.insertBefore(head, cards.firstChild); paint(); }).observe(cards, { childList: true });
    setTimeout(today, 1500); setInterval(today, 60000);
    /* 목업 「선택 지점 집중 모니터링」 = 따로 선 판(#nzFocus) — 누른 카드의 값을 0.5초마다 옮겨 그린다(카드는 8개 모두 한 줄 타일로 남는다) */
    var fo = document.createElement('section'); fo.id = 'nzFocus'; fo.className = 'nzf'; fo.setAttribute('aria-label', '선택 지점 집중 모니터링');
    fo.innerHTML = '<div class="nzf-h"><span class="nzf-k">선택 지점 집중 모니터링</span><span class="nzf-role"></span><span class="nzf-st"></span></div>' +
      '<div class="nzf-m"><div><h2 class="nzf-name">–</h2><p class="nzf-why"></p></div><div class="nzf-r"><div><b class="nzf-db">–</b><small>dB(A)</small></div><div class="nzf-today"></div></div></div>' +
      '<div class="nzf-sp"><div class="nzf-sph"><span>최근 10분 소음 추이 (dB)</span><span>점선: 60dB 주의 기준</span></div><canvas width="380" height="64"></canvas></div>';
    cards.parentNode.insertBefore(fo, cards);
    function focus() {
      var c = cards.querySelector('.nz-card.sel'); fo.hidden = !c; if (!c) return;
      var q = function (s) { return c.querySelector(s); };
      fo.dataset.lv = c.dataset.lv || 'ok';
      fo.querySelector('.nzf-name').textContent = (q('.h b') || {}).textContent || '–';
      fo.querySelector('.nzf-role').textContent = (q('.h small') || {}).textContent || '';
      fo.querySelector('.nzf-st').textContent = c.dataset.label || '–';
      fo.querySelector('.nzf-db').textContent = (q('.big b') || {}).textContent || '–';
      fo.querySelector('.nzf-why').textContent = c.dataset.cause ? '주원인: ' + c.dataset.cause : '항공기 영향 없음 — 배경 수준';
      fo.querySelector('.nzf-today').innerHTML = (q('.today') || {}).innerHTML || '';
      var src = q('canvas'), dst = fo.querySelector('canvas');
      if (src && src.width) { var x = dst.getContext('2d'); x.clearRect(0, 0, dst.width, dst.height); x.drawImage(src, 0, 0, dst.width, dst.height); }
      var id = c.dataset.id;                                           // 지도에서도 선택 지점을 하늘색 고리로
      document.querySelectorAll('.nz-sen').forEach(function (m) { var d = m.querySelector('.dot'); m.classList.toggle('sel', !!d && d.dataset.sid === id); });
    }
    setInterval(focus, 500); focus();
    var dock = document.querySelector('.nz-dock');                     // 목업 범례 「소음 체감 등급」(절대 기준 · NoiseBrief.level 과 같은 칸)
    if (dock) {                                                         // 범례 줄만 바꾼다(폰 접기 머리·화살표는 noise-fold 가 붙였다)
      dock.querySelectorAll('.nz-leg').forEach(function (x) { x.remove(); });
      var lv = document.createElement('div'); lv.className = 'nz-leg nz-lv';
      lv.innerHTML = '<b>소음 체감 등급 <small>dB(A)</small></b><i class="ok">~59 조용·일상</i><i class="warn">60~69 주의 <small>(야외 대화 인지)</small></i><i class="bad">70+ 경보 <small>(실내·통화 방해)</small></i>';
      var h = dock.querySelector('.nf-h'); dock.insertBefore(lv, h ? h.nextSibling : dock.firstChild);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
