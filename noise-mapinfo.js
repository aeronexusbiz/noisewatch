/* AeroNexus NoiseWatch — 지도 위 정보 판 하나로 (2026-10-29 · 운영자 「산만함 — 통합하여 하나의 레이어로 만들거나 탭으로」)
 * 따로 떠 있던 세 판 — 바람(.nzwx · noise-wx.js) · 실시간 소음면 범례(.nl-leg · noise-live.js) · 소음 체감 등급(.nz-dock) — 을 왼쪽 아래 판 하나의 탭으로 옮긴다.
 *   요소를 새로 만들지 않고 **옮기기만** 한다(각 모듈은 제 요소를 그대로 고친다). 원래 판이 숨으면(바람 자료 없음 · 소음면 끔) 그 탭도 숨는다.
 *   탭을 누르면 바꾸고 · ▾ 는 판 전체 접기(이 브라우저에 기억 · 폰은 처음에 접힘). 소음면을 새로 켜면 그 탭으로 옮겨 보인다.
 *   (옛 폰 접기 noise-fold.js 가 하던 일을 이것이 대신한다) */
(function () {
  'use strict';
  var TABS = [{ k: 'wx', sel: '.nzwx', name: '바람' }, { k: 'live', sel: '.nl-leg', name: '실시간 소음면' }, { k: 'lvl', sel: '.nz-dock', name: '소음 등급' }];
  var KEY = 'nw.mapinfo', P = null, cur = null, st = {};
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function put() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} }
  function phone() { return window.matchMedia && matchMedia('(max-width: 600px)').matches; }
  function el(t) { return P && P.querySelector('.nmi-pane[data-k="' + t.k + '"] > ' + t.sel); }
  function shown(t) { var e = el(t); return !!e && !e.hidden; }
  function pick(k, save) {
    var t = TABS.filter(function (x) { return x.k === k && shown(x); })[0] || TABS.filter(shown)[0];
    cur = t ? t.k : null;
    P.querySelectorAll('.nmi-tab').forEach(function (b) { var on = b.dataset.k === cur; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    P.querySelectorAll('.nmi-pane').forEach(function (p) { p.hidden = p.dataset.k !== cur; });
    if (save && cur) { st.tab = cur; put(); }
  }
  function sync() {
    var any = false;
    TABS.forEach(function (t) { var b = P.querySelector('.nmi-tab[data-k="' + t.k + '"]'), s = shown(t); b.hidden = !s; any = any || s; });
    P.hidden = !any;
    if (!cur || !shown(TABS.filter(function (x) { return x.k === cur; })[0])) pick(st.tab);
  }
  function fold(c) { P.classList.toggle('closed', c); P.querySelector('.nmi-x').setAttribute('aria-expanded', c ? 'false' : 'true'); P.querySelector('.nmi-x').title = c ? '펼치기' : '접기'; }
  function build() {
    var dock = document.querySelector('.nz-dock'), wx = document.querySelector('.nzwx'), leg = document.querySelector('.nl-leg');
    if (!dock || !wx || !leg) return false;
    st = get();
    P = document.createElement('section'); P.className = 'nmi'; P.setAttribute('aria-label', '지도 정보');
    P.innerHTML = '<div class="nmi-h" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" class="nmi-tab" data-k="' + t.k + '">' + t.name + '</button>'; }).join('') +
      '<button type="button" class="nmi-x" aria-label="지도 정보 접기·펼치기"><i class="nic" data-ic="chev"></i></button></div>' +
      TABS.map(function (t) { return '<div class="nmi-pane" role="tabpanel" data-k="' + t.k + '"></div>'; }).join('');
    dock.parentNode.insertBefore(P, dock);
    [wx, leg, dock].forEach(function (e, i) {
      e.classList.remove('nf', 'nf-open'); e.__nf = 1; e.querySelectorAll(':scope > .nf-h, :scope > .nf-t').forEach(function (x) { x.remove(); });
      e.classList.add('nmi-in'); P.querySelector('.nmi-pane[data-k="' + TABS[i].k + '"]').appendChild(e);
    });
    P.querySelectorAll('.nmi-tab').forEach(function (b) {
      b.onclick = function () { if (P.classList.contains('closed')) { fold(false); st.closed = false; } pick(b.dataset.k, true); put(); };
    });
    P.querySelector('.nmi-x').onclick = function () { var c = !P.classList.contains('closed'); fold(c); st.closed = c; put(); };
    fold(st.closed == null ? phone() : !!st.closed);
    var was = !leg.hidden;
    new MutationObserver(function () {
      var now = !leg.hidden;
      if (now && !was) { pick('live'); if (P.classList.contains('closed')) fold(false); }   // 소음면을 방금 켰다 → 그 범례를 보인다
      was = now; sync();
    }).observe(leg, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(sync).observe(wx, { attributes: true, attributeFilter: ['hidden'] });
    sync(); pick(st.tab);
    return true;
  }
  function boot() { if (!build()) { var n = 0, iv = setInterval(function () { if (build() || ++n > 60) clearInterval(iv); }, 200); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
