/* 폰(600px 이하) 화면 다듬기 (2026-10-31 · 운영자 「폰 화면 최적화가 목표」) — 데스크톱은 건드리지 않는다. 모양은 noise-mobile.css 「10-31 폰」 절.
 *   ① 머리: 테마·기관용/일반 화면·도움말을 ☰ 메뉴 하나로(원래 단추는 그대로 두고 폰에서만 숨긴다 — 메뉴는 그 단추를 대신 누른다)
 *   ② 지도(일반·기관용): 위에 따로 떠 있던 «선택 지점» 판(#nzFocus)을 지점 목록 안, 고른 지점 바로 아래로 옮겨 그 자리에서 펼친다 · 고른 지점을 다시 누르면 접는다
 *   ③ 지도 높이 = 화면 끝(아래 탭바 위)까지
 *   noise-shell.js 다음 줄에서 싣는다(머리가 먼저 만들어져 있어야 한다). */
(function () {
  'use strict';
  var mq = window.matchMedia('(max-width: 600px)');
  function $(s, r) { return (r || document).querySelector(s); }

  function menu() {
    var right = $('.ns-gnb .ns-right'); if (!right || $('.ns-menu', right)) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ns-menu'; b.setAttribute('aria-label', '메뉴'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<i></i><i></i><i></i>';
    var p = document.createElement('div'); p.className = 'ns-menu-p'; p.hidden = true; p.setAttribute('role', 'menu');
    function item(txt, fn, href) {
      var a = document.createElement(href ? 'a' : 'button'); a.className = 'ns-mi'; a.setAttribute('role', 'menuitem');
      if (href) a.href = href; else a.type = 'button';
      a.textContent = txt; a.onclick = function (e) { close(); if (fn) fn(e); };
      p.appendChild(a); return a;
    }
    function fill() {
      p.innerHTML = '';
      var role = $('.ns-role');
      if (role) item(role.textContent.trim(), function () { role.click(); });   // 단추 자체가 링크 — 누르면 고른 쪽을 기억하고 넘어간다
      var th = $('.ns-theme');
      if (th) item(document.documentElement.dataset.theme === 'light' ? '다크 모드' : '라이트 모드', function () { th.click(); });
      item('도움말', null, '/noise-help.html');
      item('이용 안내·개인정보', null, '/noise-terms.html');
    }
    function close() { p.hidden = true; b.setAttribute('aria-expanded', 'false'); }
    b.onclick = function (e) { e.stopPropagation(); if (p.hidden) { fill(); p.hidden = false; b.setAttribute('aria-expanded', 'true'); } else close(); };
    document.addEventListener('click', function (e) { if (!p.hidden && !p.contains(e.target)) close(); });
    right.appendChild(b); right.appendChild(p);
  }

  function inlineFocus() {
    var cards = $('#nzCards'); if (!cards) return;
    var off = false;
    cards.addEventListener('click', function (e) {                    // 먼저 본다(capture) — noise-side 가 .sel 을 옮기기 전에 «이미 고른 지점이었나»
      var c = e.target.closest('.nz-card'); if (!c || !mq.matches) return;
      off = c.classList.contains('sel') ? !off : false;
    }, true);
    function place() {
      var fo = $('#nzFocus'); if (!fo) return;
      var c = $('.nz-card.sel', cards);
      if (!mq.matches) {                                               // 폰 → 가로(넓은 화면)로 돌리면 원래 자리(목록 위)로
        if (fo.parentNode === cards) cards.parentNode.insertBefore(fo, cards);
        fo.classList.remove('nzf-in', 'nzf-off'); return;
      }
      fo.classList.add('nzf-in'); fo.classList.toggle('nzf-off', off || !c);
      if (c && fo.previousSibling !== c) cards.insertBefore(fo, c.nextSibling);
    }
    setInterval(place, 300); place();
  }

  /* ③ 지도 높이(10-31 운영자 「지점 목록은 스크롤해야 보이게」) — 지도 윗변(머리·브리핑 바·안내 띠 아래)을 재어 --nm-top 으로 넘긴다 · 높이 식은 noise-mobile.css
   *   띠가 닫히거나 브리핑 바가 늦게 생기면 윗변이 바뀐다 — 1초마다 재고 바뀔 때만 고친 뒤 resize 를 알린다(Leaflet 이 지도 크기를 다시 잰다) */
  function mapFit() {
    var st = $('.nz-stage'); if (!st) return;
    var last = -1;
    function fit() {
      if (!mq.matches) return;
      var top = Math.round(st.getBoundingClientRect().top + window.scrollY);
      if (top === last) return;
      last = top; document.documentElement.style.setProperty('--nm-top', top + 'px');
      window.dispatchEvent(new Event('resize'));
    }
    window.addEventListener('resize', fit); setInterval(fit, 1000); fit();
  }
  function init() { menu(); inlineFocus(); mapFit(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
