/* 화면 구성 나누기 — 일반(실시간 지도만) / 기관용(지도 전체 기능 + 상황판·통계·보고서) (2026-10-31 · 운영자 「실시간 지도는 누구나, 상황판·통계는 권한자 — 지금은 구성으로만 나누고 인증은 나중에」)
 * ⚠ 접근 제한이 아니다: 누구나 머리의 「기관용 화면」으로 넘어갈 수 있고 서버도 자료를 막지 않는다. 인증을 붙일 때 이 파일의 판정(role)과 서버 차단을 함께 바꾼다.
 *   일반 = 공개 주소로 처음 온 사람(기본) · 기관용 = 맥에서 직접 연 화면(기본) · 상황판·통계·보고서를 연 사람 · ?role=org|pub
 *   고른 것은 이 탭에서만 기억한다(sessionStorage) — 새로 들어오면 다시 일반(첫 화면 = 실시간 지도).
 *   <html class="nw-pub|nw-org"> 만 정한다 — 무엇을 숨기나는 noise-role.css. 머리에서 그리기 전에 싣는다. */
(function () {
  'use strict';
  var KEY = 'nw.role', h = location.hostname, s = location.search;
  var local = (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) && !/[?&]public=1\b/.test(s);   // noise-public.js 와 같은 기준
  var q = (s.match(/[?&]role=(org|pub)\b/) || [])[1];
  var orgPage = /\/noise-(watch|dash|period|report)\.html$/.test(location.pathname);   // 기관용 화면을 열었다 = 기관용
  var role = null;
  try { role = sessionStorage.getItem(KEY); } catch (e) { /* 저장 안 되는 브라우저 — 기본값 */ }
  if (q) role = q;
  if (orgPage) role = 'org';
  if (role !== 'org' && role !== 'pub') role = local ? 'org' : 'pub';
  function save(r) { try { sessionStorage.setItem(KEY, r); } catch (e) { /* 무시 */ } }
  save(role);
  var el = document.documentElement;
  el.classList.add(role === 'org' ? 'nw-org' : 'nw-pub');
  window.NoiseRole = {
    org: role === 'org',
    set: function (r) { save(r === 'org' ? 'org' : 'pub'); }
  };
})();
