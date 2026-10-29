/* AeroNexus 소음 감시 — 폰에서 지도 위 판 접기·펼치기 (2026-10-29 · 운영자 「바람·실시간 소음면·소음도 범례를 모바일에서 접기 펼치기」)
 * 대상 판(늦게 생기는 것도 — noise-wx.js·noise-live.js 가 나중에 만든다): .nzwx(바람) · .nl-leg(실시간 소음면) · .nz-dock(소음도·고리 범례)
 * 폰(600px 이하)에서만 접힌 채 시작 · 판을 누르면 펼침/접기 · 입력칸(흐름 체크 등)은 눌러도 안 접힘 · 펼침 상태는 이 브라우저에 기억.
 * 모양은 noise-mobile.css(.nf · .nf-open · .nf-t). */
(function () {
  'use strict';
  var SEL = { '.nzwx': '바람', '.nl-leg': '소음면', '.nz-dock': '범례' }, KEY = 'nw.fold.';
  var mq = window.matchMedia ? window.matchMedia('(max-width: 600px)') : { matches: false };
  function get(k) { try { return localStorage.getItem(KEY + k) === '1'; } catch (_) { return false; } }
  function put(k, v) { try { localStorage.setItem(KEY + k, v ? '1' : '0'); } catch (_) {} }
  function arm(el, sel) {
    if (el.__nf) return; el.__nf = 1;
    var k = sel.slice(1); el.__nfk = k;
    el.classList.add('nf');
    if (sel === '.nz-dock') {                                         // 범례는 제목 줄이 없다 — 접혔을 때 보일 머리를 붙인다
      var h = document.createElement('b'); h.className = 'nf-h'; h.textContent = '범례'; el.insertBefore(h, el.firstChild);
    }
    var t = document.createElement('i'); t.className = 'nf-t'; t.setAttribute('aria-hidden', 'true'); el.appendChild(t);
    el.__nfl = SEL[sel] + ' 판 접기·펼치기'; ARMED.push(el);
    if (get(k)) el.classList.add('nf-open');
    el.addEventListener('click', function (e) {
      if (!mq.matches) return;
      if (e.target.closest('input, select, label, a, button')) return;
      var on = el.classList.toggle('nf-open'); put(k, on);
      el.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) document.querySelectorAll('.nf.nf-open').forEach(function (o) {   // 한 번에 하나만 — 폰 폭에서 둘이 펼쳐지면 서로 가렸다(10-29 시험: 범례가 바람 판의 「흐름」 칸을 덮음)
        if (o === el) return; o.classList.remove('nf-open'); o.setAttribute('aria-expanded', 'false'); put(o.__nfk, false);
      });
    });
    aria(el);
  }
  // 10-29 리뷰: 접기는 폰 폭에서만 — 데스크톱 판에 role=button·aria-expanded 가 붙어 화면 낭독기가 「단추」로 읽었다
  var ARMED = [];
  function aria(el) {
    if (mq.matches) { el.setAttribute('role', 'button'); el.setAttribute('aria-label', el.__nfl); el.setAttribute('aria-expanded', el.classList.contains('nf-open') ? 'true' : 'false'); }
    else { el.removeAttribute('role'); el.removeAttribute('aria-label'); el.removeAttribute('aria-expanded'); }
  }
  if (mq.addEventListener) mq.addEventListener('change', function () { ARMED.forEach(aria); });
  function scan(root) {
    Object.keys(SEL).forEach(function (s) {
      if (root.matches && root.matches(s)) arm(root, s);
      if (root.querySelectorAll) root.querySelectorAll(s).forEach(function (el) { arm(el, s); });
    });
  }
  new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(document); }); else scan(document);
})();
