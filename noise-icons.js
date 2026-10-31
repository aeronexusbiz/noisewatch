/* AeroNexus Biz 소음 감시 — 자체 SVG 아이콘 묶음 (2026-10-28 · 운영자 「아이콘은 모두 직접 svg 로 세련되게」)
 * 이모지 대신 쓴다. 24칸 격자 · 선 1.8 · 둥근 끝 · 색은 currentColor(글자색을 따른다 — 강조색은 noise-icons.css).
 *   HTML·JS 문자열 어디서나 <i class="nic" data-ic="이름"></i> 로 쓰면 붙는 순간 채운다(MutationObserver — 싣는 순서 무관).
 *   NIcon('이름') → '<i class="nic" data-ic="이름"><svg…></svg></i>' 문자열(바로 그릴 때).
 *   NIcon.fill(root) → root 안의 빈 [data-ic] 를 채운다. 모르는 이름은 빈 칸으로 둔다. */
(function () {
  'use strict';
  var PL = 'M12 2.5c.9 0 1.5.8 1.5 2v5.2l7 4.1v1.8l-7-2.1v4.2l2.3 1.7v1.4l-3.8-1.1-3.8 1.1v-1.4l2.3-1.7v-4.2l-7 2.1v-1.8l7-4.1V4.5c0-1.2.6-2 1.5-2z';
  function plane(rot, s, ty) { return '<path class="f" transform="translate(12 ' + (ty || 12) + ') rotate(' + rot + ') scale(' + (s || 1) + ') translate(-12 -12)" d="' + PL + '"/>'; }
  var I = {
    monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/><path d="M6.5 11h2.4l1.4-2.8 2.1 5 1.5-2.2h3.6"/>',
    dash: '<rect x="3" y="3" width="7.5" height="9" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.6"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.6"/><rect x="3" y="15" width="7.5" height="6" rx="1.6"/>',
    map: '<path d="M9 4 3.5 6.3v13.4L9 17.4l6 2.6 5.5-2.3V4.3L15 6.6z"/><path d="M9 4v13.4M15 6.6V20"/>',
    chart: '<path d="M3.5 3.5v17h17"/><path d="m7.5 15 3.6-4.2 3 2.6 5-6.4"/><circle class="f" cx="19.1" cy="7" r="1.3"/>',
    report: '<path d="M14 3H7.2A2.2 2.2 0 0 0 5 5.2v13.6A2.2 2.2 0 0 0 7.2 21h9.6a2.2 2.2 0 0 0 2.2-2.2V8z"/><path d="M14 3v5h5"/><path d="M8.5 17v-2.5M11.5 17v-5M14.5 17v-3.5"/>',
    doc: '<path d="M14 3H7.2A2.2 2.2 0 0 0 5 5.2v13.6A2.2 2.2 0 0 0 7.2 21h9.6a2.2 2.2 0 0 0 2.2-2.2V8z"/><path d="M14 3v5h5M8.5 12.5h7M8.5 16.5h4.5"/>',
    link: '<circle cx="5.5" cy="18" r="2.2"/><circle cx="18.5" cy="5.5" r="2.2"/><circle cx="18.5" cy="17.5" r="1.6"/><path class="d" d="M7.2 16.4 16.8 7.1M7.8 18h9"/>',
    rings: '<circle class="f" cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="9" opacity=".5"/>',
    surface: '<path d="M3 19h18" opacity=".45"/><path style="stroke:#22c55e" d="M4 19c1.8-6.2 5.3-10 8-10s6.2 3.8 8 10"/><path style="stroke:#eab308" d="M7.4 19c1.3-3.9 2.9-6 4.6-6s3.3 2.1 4.6 6"/><path style="stroke:#ef4444" d="M10.4 19c.5-1.6 1-2.4 1.6-2.4s1.1.8 1.6 2.4"/>',
    pin: '<path d="M12 21.2s-6.6-5.7-6.6-11.1a6.6 6.6 0 0 1 13.2 0c0 5.4-6.6 11.1-6.6 11.1z"/><path d="M9.6 10.2h.9l.8-1.7 1.3 3.3.8-1.6h1"/>',
    target: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="3.2"/><circle class="f" cx="12" cy="12" r=".9"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    box: '<rect class="d" x="4" y="6" width="16" height="12" rx="1.4"/><rect class="f" x="2.6" y="4.6" width="2.8" height="2.8" rx=".6"/><rect class="f" x="18.6" y="16.6" width="2.8" height="2.8" rx=".6"/>',
    heat: '<path d="M12 2.8c.6 3.4 4.8 5.6 4.8 10.4a4.8 4.8 0 0 1-9.6 0c0-2.3 1-3.8 2.1-4.9.2 1.6 1 2.7 2.1 3.1-.1-3.2-.4-5.9.6-8.6z"/><path d="M12 20.6a2 2 0 0 1-2-2c0-1.3.9-2.1 2-3.4 1.1 1.3 2 2.1 2 3.4a2 2 0 0 1-2 2z"/>',
    replay: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 3.8V8.5h4.7"/><path d="M12 7.8V12l2.9 1.9"/>',
    sensor: '<rect x="9" y="2.8" width="6" height="10.4" rx="3"/><path d="M5.8 10.8a6.2 6.2 0 0 0 12.4 0M12 17v4M8.8 21h6.4"/>',
    arrive: plane(152, .62, 10) + '<path d="M3 20.5h18M6 20.5h2M11 20.5h2M16 20.5h2" />',
    depart: plane(28, .62, 10) + '<path d="M3 20.5h18"/>',
    plane: plane(90, .9),
    bolt: '<path d="M13.2 2.5 4.5 13.8h6.8l-1 7.7 8.7-11.3h-6.8z"/>',
    clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5l3.4 2.1"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8.5 9v11M14.5 9v11M3 14.5h18" opacity=".8"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    download: '<path d="M12 4v11M7.2 10.4 12 15.2l4.8-4.8M5 20h14"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/><circle class="f" cx="17.2" cy="12.2" r=".9"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    chev: '<path d="M6 9.5l6 6 6-6"/>',
    play: '<path class="f" d="M8 5.4v13.2c0 .7.8 1.1 1.4.7l10-6.6a.8.8 0 0 0 0-1.4l-10-6.6C8.8 4.3 8 4.7 8 5.4z"/>',
    pause: '<rect class="f" x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect class="f" x="13.7" y="5" width="3.8" height="14" rx="1.2"/>',
    next: '<path class="f" d="M5 6.2v11.6c0 .7.8 1.1 1.4.7l8.4-5.8a.8.8 0 0 0 0-1.4L6.4 5.5C5.8 5.1 5 5.5 5 6.2z"/><path d="M18 5.5v13"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.8 15.8 4.7 4.7"/>',
    check: '<path d="m5 12.6 4.4 4.4L19 7.4"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    moon: '<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/>',
    help: '<circle cx="12" cy="12" r="8.8"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><circle class="f" cx="12" cy="16.9" r="1.05"/>',
    arrow: '<path class="f" d="M3.5 5.2 21 12 3.5 18.8l3.6-6.8z"/>'
  };
  function svg(n) { return I[n] ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + I[n] + '</svg>' : ''; }
  function NIcon(n) { return '<i class="nic" data-ic="' + n + '">' + svg(n) + '</i>'; }
  function fill(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('[data-ic]') && !root.firstChild) root.innerHTML = svg(root.getAttribute('data-ic'));
    var l = root.querySelectorAll('[data-ic]:empty'); for (var i = 0; i < l.length; i++) l[i].innerHTML = svg(l[i].getAttribute('data-ic'));
  }
  NIcon.fill = fill; NIcon.svg = svg; NIcon.names = Object.keys(I);
  window.NIcon = NIcon;
  var mo = new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) for (var j = 0, a = ms[i].addedNodes; j < a.length; j++) if (a[j].nodeType === 1) fill(a[j]);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { fill(document.body); }); else fill(document.body);
})();

/* 공개 화면 정리(noise-public.js · 10-29) — 이 파일이 모든 화면에 실리므로 여기서 함께 싣는다 */
(function () { if (window.NW_PUBLIC !== undefined || document.querySelector('script[src^="/noise-public.js"]')) return; var s = document.createElement('script'); s.src = '/noise-public.js?v=7'; (document.head || document.documentElement).appendChild(s); })();
