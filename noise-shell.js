/* AeroNexus Biz 소음 감시 — 공통 머리(GNB) (2026-10-28 · 운영자 「메인화면을 noise-mockup.html 처럼 세련되게」 → 「기존 기능 유지·모양 통일」)
 * 네 화면(관제판·지도·대시보드·통계 보고서)에 같은 머리: 브랜드 · 공항 · 모의 표시 · 4탭 메뉴 · 상태 · 시계 · 전체화면.
 *   요소를 새로 만들지 않고 **각 화면의 기존 요소를 옮긴다**(id 그대로 → 화면 JS 는 고치지 않는다):
 *     data-gnb="apt|sim|help|stat|clock|full"  → 머리의 그 자리로 · data-gnb-hide → 숨김(탭이 대신하는 옛 링크·뒤로 단추·제목)
 *     나머지 머리 요소는 머리 아래 «보조 줄»(.ns-sub)에 남는다. 시계가 없는 화면은 머리가 시계를 만든다.
 *   <body data-gnb-page="watch|map|dash|report"> 로 지금 탭을 표시. 탭 주소에는 지금 공항(?apt=)을 붙인다. */
(function () {
  'use strict';
  var TABS = [
    // 10-29 운영자 목업 「사용자 목적 중심 3탭」 — 지도를 맨 앞으로 · 이름은 하는 일로(보고서는 관리용 · 공개 화면에선 noise-public 이 숨김)
    { k: 'map', ico: 'map', name: '실시간 지도·감시', short: '지도·감시', sub: '위성·항적', href: '/noise.html' },
    { k: 'watch', ico: 'dash', name: '지점별 상황판', short: '상황판', sub: '현황판', href: '/noise-watch.html' },
    { k: 'dash', ico: 'chart', name: '시간대 통계·조회', short: '통계·조회', sub: 'Lden·분석', href: '/noise-dash.html' },
    { k: 'report', ico: 'report', name: '보고서', sub: '통계·민원', href: '/noise-period.html' }
  ];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function apt() {
    var sel = document.querySelector('[data-gnb="apt"]');
    return (sel && sel.value) || (new URLSearchParams(location.search).get('apt') || '').toUpperCase() || 'RKSS';
  }
  function build() {
    var page = document.body.getAttribute('data-gnb-page') || '';
    var old = document.querySelector('[data-gnb-src]');                // 화면의 옛 머리(보조 줄이 된다)
    var g = document.createElement('header');
    g.className = 'ns-gnb no-print';
    g.innerHTML = '<a class="ns-back" href="/" title="첫 화면">‹</a><div class="ns-brand"><i class="ns-dot"></i>AeroNexus <b>NoiseWatch</b></div>' +
      '<span class="ns-slot" data-slot="apt"></span><span class="ns-slot" data-slot="sim"></span>' +
      '<nav class="ns-nav" role="tablist" aria-label="주요 메뉴">' + TABS.map(function (t) {
        return '<a role="tab" class="ns-tab' + (t.k === page ? ' on' : '') + '" data-k="' + t.k + '" href="' + t.href + '"' + (t.k === page ? ' aria-selected="true"' : '') + '><i class="nic" data-ic="' + t.ico + '"></i> <span class="ns-tl">' + t.name + '</span><span class="ns-ts">' + (t.short || t.name) + '</span></a>';   // 10-29: 폰 아래 탭바는 짧은 이름
      }).join('') + '</nav>' +
      '<div class="ns-right"><span class="ns-slot" data-slot="help"></span><span class="ns-slot" data-slot="stat"></span><span class="ns-slot" data-slot="clock"></span><span class="ns-slot" data-slot="full"></span></div>';
    document.body.insertBefore(g, document.body.firstChild);
    ['apt', 'sim', 'help', 'stat', 'clock', 'full'].forEach(function (k) {   // (아래) 10-29 목업: 예측 표식은 「항적 기반 예측」 한 가지로
      var el = document.querySelector('[data-gnb="' + k + '"]'), slot = g.querySelector('[data-slot="' + k + '"]');
      if (el) slot.appendChild(el);
    });
    var sm = g.querySelector('[data-slot="sim"] > *');
    if (sm) { sm.title = '항적 자료로 계산한 소음 예측치입니다(실측·법적 판단 기준 아님)'; sm.textContent = '항적 기반 예측'; }
    if (!g.querySelector('[data-slot="clock"]').firstChild) {                 // 시계 없는 화면 — 머리가 만든다
      var c = document.createElement('span'); c.className = 'ns-clock'; g.querySelector('[data-slot="clock"]').appendChild(c);
      var tick = function () { var d = new Date(); c.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' KST'; };
      tick(); setInterval(tick, 1000);
    }
    if (!g.querySelector('[data-slot="full"]').firstChild) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ns-full'; b.title = '전체 화면(관제실 벽면 현황판)'; b.innerHTML = '<i class="nic" data-ic="full"></i> 전체화면';
      b.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); };
      g.querySelector('[data-slot="full"]').appendChild(b);
    }
    document.querySelectorAll('[data-gnb-hide]').forEach(function (el) { el.hidden = true; el.style.display = 'none'; });
    if (old) { old.classList.add('ns-sub'); if (!old.querySelector(':scope > *:not([hidden]):not([style*="display: none"])')) { old.hidden = true; old.style.display = 'none'; } }   // 화면 CSS 의 display:flex 가 hidden 보다 세다(10-28 빈 띠)
    // 10-29 운영자 「리플레이는 모바일은 하단 메뉴에」 — 폰 아래 탭바에만 보이는 「리플레이」(지도에선 바로 켜고 · 다른 화면에선 오늘 리플레이로 지도)
    var nav = g.querySelector('.ns-nav'), rpt = document.createElement('a');
    rpt.className = 'ns-tab ns-tab-m'; rpt.dataset.k = 'replay'; rpt.setAttribute('role', 'tab'); rpt.href = '/noise.html';
    rpt.innerHTML = '<i class="nic" data-ic="replay"></i> <span class="ns-tl">일별 리플레이</span><span class="ns-ts">리플레이</span>';
    nav.appendChild(rpt);
    rpt.addEventListener('click', function (e) {
      var b = document.getElementById('nzRpBtn');
      if (b) { e.preventDefault(); b.click(); return; }
      var d = new Date(), day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      rpt.href = '/noise.html?apt=' + apt() + '&rp=' + day;
    });
    if (page === 'map') {
      var mt = nav.querySelector('.ns-tab[data-k="map"]');
      setInterval(function () { var on = document.body.classList.contains('rp'); rpt.classList.toggle('on', on); if (mt) mt.classList.toggle('on', !on); }, 400);
    }
    // 10-31 화면 구성 나누기(noise-role.js) — 일반: 「기관용 화면」(상황판으로) · 기관용: 「일반 화면」(실시간 지도로). 인증은 나중에 이 단추에 붙인다
    var R = window.NoiseRole, rb = document.createElement('a');
    rb.className = 'ns-role'; rb.dataset.k = 'role';
    if (R && !R.org) { rb.href = '/noise-watch.html'; rb.title = '관제·공항·지자체 담당자용 — 지점별 상황판·시간대 통계·누적 히트맵·리플레이'; rb.innerHTML = '<i class="nic" data-ic="monitor"></i> 기관용 화면'; rb.onclick = function () { R.set('org'); }; }
    else { rb.href = '/noise.html'; rb.title = '누구나 보는 실시간 지도 화면으로'; rb.innerHTML = '<i class="nic" data-ic="map"></i> 일반 화면'; rb.onclick = function () { if (R) R.set('pub'); }; }
    g.querySelector('.ns-right').insertBefore(rb, g.querySelector('.ns-right').firstChild);
    var fix = function () { var a = apt(); g.querySelectorAll('.ns-tab, .ns-role').forEach(function (t) { var u = new URL(t.getAttribute('href'), location.origin); u.searchParams.set('apt', a); t.href = u.pathname + u.search; }); };
    fix();
    var sel = g.querySelector('[data-slot="apt"] select'); if (sel) sel.addEventListener('change', fix);
    setTimeout(fix, 1500);                                                    // 화면 JS 가 공항 목록을 채운 뒤 한 번 더
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
