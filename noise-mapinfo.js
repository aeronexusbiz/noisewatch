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
  var obs = new MutationObserver(function () { sync(); });           // 옮겨 온 판의 hidden 이 바뀌면 탭도
  function adopt(t) {                                                // 10-29 리뷰 M1·M6: 판이 늦게 생겨도(첫 프레임·grid 응답 뒤) 생기는 대로 탭에 넣는다
    if (el(t)) return true;
    var e = document.querySelector(t.sel + ':not(.nmi-in)'); if (!e) return false;
    e.classList.remove('nf', 'nf-open'); e.__nf = 1; e.querySelectorAll(':scope > .nf-h, :scope > .nf-t').forEach(function (x) { x.remove(); });
    e.classList.add('nmi-in'); P.querySelector('.nmi-pane[data-k="' + t.k + '"]').appendChild(e);
    if (t.k === 'live') {
      var was = !e.hidden;
      new MutationObserver(function () { var now = !e.hidden; if (now && !was) { pick('live'); if (P.classList.contains('closed')) fold(false); } was = now; sync(); }).observe(e, { attributes: true, attributeFilter: ['hidden'] });
    } else obs.observe(e, { attributes: true, attributeFilter: ['hidden'] });
    sync(); if (st.tab === t.k) pick(t.k); return true;                // 마지막에 보던 탭이 늦게 생겼으면 그리로
  }
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
    var dock = document.querySelector('.nz-dock');
    if (!dock) return false;
    st = get();
    P = document.createElement('section'); P.className = 'nmi'; P.setAttribute('aria-label', '지도 정보');
    P.innerHTML = '<div class="nmi-h" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" class="nmi-tab" data-k="' + t.k + '">' + t.name + '</button>'; }).join('') +
      '<button type="button" class="nmi-x" aria-label="지도 정보 접기·펼치기"><i class="nic" data-ic="chev"></i></button></div>' +
      TABS.map(function (t) { return '<div class="nmi-pane" role="tabpanel" data-k="' + t.k + '"></div>'; }).join('');
    dock.parentNode.insertBefore(P, dock);
    adopt(TABS[2]);
    P.querySelectorAll('.nmi-tab').forEach(function (b) {
      b.onclick = function () { if (P.classList.contains('closed')) { fold(false); st.closed = false; } pick(b.dataset.k, true); put(); };
    });
    P.querySelector('.nmi-x').onclick = function () { var c = !P.classList.contains('closed'); fold(c); st.closed = c; put(); };
    fold(st.closed == null ? phone() : !!st.closed);
    sync(); pick(st.tab);
    var tries = 0, iv = setInterval(function () {                     // 바람·소음면 판은 자료가 온 뒤 생긴다 — 둘 다 넣을 때까지(최대 10분 · 숨은 탭에선 요청이 미뤄진다)
      var a = adopt(TABS[0]), b = adopt(TABS[1]);
      if ((a && b) || ++tries > 1200) { clearInterval(iv); pick(st.tab); }
    }, 500);
    return true;
  }
  function boot() { if (!build()) { var n = 0, iv = setInterval(function () { if (build() || ++n > 60) clearInterval(iv); }, 200); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
