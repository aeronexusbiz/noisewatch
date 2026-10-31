/* 공개 화면 정리 (2026-10-29) — 운영자 「웹에 법적 문제가 될 만한 것은 숨기고 우리가 만든 것으로 표시 · 모두 예측이라고 표기」.
 * ① 모든 화면(로컬 포함): 「모의값」「모의」「추정」 배지 → 「예측」으로 통일.
 * ② 공개 주소(맥에서 직접 연 localhost·사설망이 아닐 때)에서만: 국가소음정보시스템 자료(국가 측정망 핀·「실측 Lden」 이름표·대시보드 「검증」 절·1차 실험 보고서 링크)와
 *    민원 접수를 숨긴다. 측정소 = 우리 「예측 지점」. 서버도 같은 기준으로 그 자료를 내주지 않는다(server.py _public).
 * noise-icons.js 가 이 파일을 싣는다(모든 화면 공통). 화면 모듈은 고치지 않는다. */
(function () {
  'use strict';
  var h = location.hostname;
  var PUBLIC = !(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h));   // *.ts.net(Funnel)·vercel.app 는 공개
  if (/[?&]public=1\b/.test(location.search)) PUBLIC = true;                // 로컬에서 공개 화면 모양 확인용
  window.NW_PUBLIC = PUBLIC;
  if (PUBLIC && /\/noise-(period|report|validation)\.html$/.test(location.pathname)) { location.replace('/noise-watch.html' + location.search.replace(/[?&]public=1/, '')); return; }   // 관리용 보고서는 공개 화면에서 대시보드로
  document.documentElement.classList.toggle('nw-public', PUBLIC);
  if (PUBLIC) {
    var css = document.createElement('style');
    css.textContent = [
      '.nn-pin,.nn-tag,.nn-leg{display:none!important}',                                  // 국가 측정망 핀·실측 Lden 이름표
      'label.nz-chip:has(#nzNat){display:none!important}',                                // 「국가 측정망」 단추
      '#ndValSec,a[href^="/noise-validation"]{display:none!important}',                    // 검증(공시값 대조)·1차 실험 보고서
      '.nd-sec:has(#ndCp),#ndCp,#ndCpList{display:none!important}',                       // 민원 접수부
      '.nz-card .note{display:none!important}',                                            // 측정소 설명(국가 측정소·주소)
      // 10-29 운영자 「웹에는 대시보드·지도·통계만 — 현황은 누구나, 자세한 보고서·민원은 관리용」
      '.ns-tab[data-k="report"],a[href^="/noise-period"],a[href^="/noise-report"],#ndQReport,.nd-sec.nd-q{display:none!important}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(css);
  }
  // 「모의·추정」 → 「예측」 — 글자 단위가 아니라 정해진 말만(「좌표 추정」 같은 설명문은 그대로)
  var REP = [[/모의\(추정\)값/g, '예측값'], [/모의값 · 실측 아님/g, '예측값 · 실측 아님'], [/모의값/g, '예측값'], [/\(모의\)/g, '(예측)'], [/· 모의/g, '· 예측'], [/소음 감시\(모의\)/g, '소음 감시(예측)'],
             [/측정기 · 가정 위치/g, '예측 지점'], [/측정기\(가정\)/g, '예측 지점']];
  function fixText(n) {
    var t = n.nodeValue, o = t;
    for (var i = 0; i < REP.length; i++) t = t.replace(REP[i][0], REP[i][1]);
    if (t !== o) n.nodeValue = t;
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return fixText(root);
    if (root.nodeType !== 1) return;
    if (root.classList && root.classList.contains('est') && root.textContent === '추정') root.textContent = '예측';
    var tt = root.getAttribute && root.getAttribute('title');
    if (tt) { var nt = tt; for (var i = 0; i < REP.length; i++) nt = nt.replace(REP[i][0], REP[i][1]); nt = nt.replace('계산한 추정값', '계산한 예측값'); if (nt !== tt) root.setAttribute('title', nt); }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) fixText(n);
      else {
        if (n.classList.contains('est') && n.textContent === '추정') n.textContent = '예측';
        var a = n.getAttribute('title');
        if (a) { var b = a; for (var k = 0; k < REP.length; k++) b = b.replace(REP[k][0], REP[k][1]); b = b.replace('계산한 추정값', '계산한 예측값'); if (b !== a) n.setAttribute('title', b); }
      }
    }
  }
  function fixTitle() { if (document.title.indexOf('(모의)') >= 0) document.title = document.title.replace('(모의)', '(예측)'); }   // 화면이 제목을 나중에 바꾸기도 한다(통계 보고서)
  fixTitle(); setInterval(fixTitle, 1500);
  var busy = false;
  var mo = new MutationObserver(function (ms) {
    if (busy) return; busy = true;
    try { ms.forEach(function (m) { if (m.type === 'characterData') fixText(m.target); else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]); }); } finally { busy = false; }
  });
  // 10-29 운영자 「법적 이슈 보완 — 추천대로」: 공개 화면 첫 진입 면책 띠(닫으면 이 탭에서는 다시 안 뜸) · 화면 아래 출처 줄을 공개용 한 줄로(파일명·「가정」 설명 대신 이용 안내 링크)
  var FOOT = '<a href="/noise-terms.html">이용 안내·개인정보</a> · 소음 값은 항적으로 계산한 <b>예측값</b>(실측 아님 · 법적 판단 근거 아님) · 영상 © 브이월드(국토교통부) · 항적 AeroNexus · 활주로 eAIP · 비행장 윤곽 © OpenStreetMap';
  // 10-31 운영자 「접속자에게 임시서버 운영 중 · 불안정할 수 있음 공지」 — 첫 진입 안내 띠 맨 앞(.nw-tmp) · 쉬는 중 띠(noise-offline.js) · 이용 안내 2절
  function notice() {
    [].forEach.call(document.querySelectorAll('.nz-foot,.nw-foot,.nd-foot'), function (f) { f.innerHTML = FOOT; });
    var seen = false; try { seen = sessionStorage.getItem('nw.notice') === '1'; } catch (e) { /* 저장 안 되는 브라우저 — 매번 보인다 */ }
    if (seen || /\/noise-terms\.html$/.test(location.pathname)) return;
    // 10-31 운영자 「안내 띠가 너무 큼」(디자인 리뷰 2) — 화면을 덮는 떠 있는 상자 → 머리(·브리핑 바) 바로 아래 한 줄 띠(내용을 밀어낼 뿐 가리지 않는다) · 폰은 짧은 문구
    var css = document.createElement('style');
    css.textContent = '#nwNotice{flex:none;display:flex;align-items:center;gap:10px;padding:7px 16px;background:#1c1607;color:#e2e8f0;border-bottom:1px solid #3f3410;font:13px/1.45 var(--ns-sans,system-ui,sans-serif)}' +
      '#nwNotice .nw-t{flex:1;min-width:0}#nwNotice .nw-tmp{color:#fcd34d;font-weight:700;margin-right:6px}#nwNotice .nw-s{display:none}#nwNotice a{color:#93c5fd;white-space:nowrap}' +
      '#nwNotice button{flex:none;min-height:28px;border:1px solid #475569;border-radius:6px;padding:3px 10px;background:transparent;color:#e2e8f0;font:600 12px var(--ns-sans,system-ui,sans-serif);cursor:pointer}' +
      '#nwNotice button:focus-visible{outline:2px solid #fcd34d;outline-offset:2px}' +
      '@media (max-width:600px){#nwNotice{padding:6px 12px;font-size:12px}#nwNotice .nw-l{display:none}#nwNotice .nw-s{display:inline}}' +
      '@media print{#nwNotice{display:none}}';
    document.head.appendChild(css);
    var d = document.createElement('div'); d.id = 'nwNotice'; d.setAttribute('role', 'note');
    d.innerHTML = '<div class="nw-t"><span class="nw-tmp">임시 서버 운영 중</span>' +
      '<span class="nw-l">접속이 느리거나 잠시 끊길 수 있습니다. 소음 값은 항적으로 계산한 <b>예측값</b>으로, 측정값이 아니며 소음 기준·보상 같은 <b>법적 판단의 근거로 쓸 수 없습니다.</b></span>' +
      '<span class="nw-s">접속이 끊길 수 있습니다. 소음 값은 <b>예측값</b>(실측·법적 근거 아님).</span> <a href="/noise-terms.html">이용 안내</a></div><button type="button">확인</button>';
    var fit = function () { window.dispatchEvent(new Event('resize')); };   // 띠가 생기고 사라질 때 지도 크기를 다시 잰다(Leaflet)
    d.querySelector('button').onclick = function () { d.remove(); fit(); try { sessionStorage.setItem('nw.notice', '1'); } catch (e) { /* 무시 */ } };
    var n = 0;
    (function place() {                                                // 공통 머리가 생긴 뒤 그 아래(브리핑 바가 먼저 있으면 그 아래) — 머리가 없는 화면은 맨 위
      var g = document.querySelector('.ns-gnb');
      if (!g && ++n < 30) { setTimeout(place, 100); return; }
      if (!g) document.body.insertBefore(d, document.body.firstChild);
      else { var r = g.nextSibling; if (r && r.classList && r.classList.contains('nb-bar')) r = r.nextSibling; g.parentNode.insertBefore(d, r); }
      fit();
    })();
  }
  function start() { if (PUBLIC) notice(); walk(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
