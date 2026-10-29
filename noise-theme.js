/* AeroNexus NoiseWatch — 다크 / 라이트 모드 (2026-10-29 · 운영자 「다크모드, 라이트모드」)
 * <html data-theme="dark|light"> — 기본 다크(목업) · 머리 오른쪽 ☀/🌙 단추로 바꾸고 이 브라우저에 기억(localStorage nw.theme).
 * 그리기 전에 머리(head)에서 바로 정한다(번쩍임 없게). 라이트 모양은 noise-theme-light.css(html[data-theme="light"] 아래만). */
(function () {
  'use strict';
  var K = 'nw.theme', t = 'dark';
  try { t = localStorage.getItem(K) === 'light' ? 'light' : 'dark'; } catch (_) {}
  var root = document.documentElement; root.dataset.theme = t;
  if (!document.querySelector('link[href^="/noise-theme-light.css"]')) { var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/noise-theme-light.css?v=7'; document.head.appendChild(css); }   // HTML 머리에 없을 때만
  function ic(n) { return window.NIcon ? NIcon(n) : ''; }
  function paint(b) {
    var light = root.dataset.theme === 'light';
    b.innerHTML = ic(light ? 'moon' : 'sun');
    b.title = light ? '다크 모드로' : '라이트 모드로'; b.setAttribute('aria-label', b.title);
  }
  function mount() {
    var r = document.querySelector('.ns-gnb .ns-right'); if (!r) return false;
    if (r.querySelector('.ns-theme')) return true;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ns-theme';
    b.onclick = function () {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(K, root.dataset.theme); } catch (_) {}
      paint(b); window.dispatchEvent(new Event('resize'));          // 캔버스 그래프는 다시 그린다
    };
    paint(b); r.insertBefore(b, r.firstChild);
    return true;
  }
  function boot() { if (!mount()) { var n = 0, iv = setInterval(function () { if (mount() || ++n > 40) clearInterval(iv); }, 100); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.NoiseTheme = { get: function () { return root.dataset.theme; } };
})();
