/* AeroNexus NoiseWatch — 「시간대 통계·조회」 화면을 운영자 목업(VIEW C) 모양으로 (2026-10-29)
 *   맨 위 ① 간편 소음 원인 조회 「방금 지나간 시끄러운 비행기가 무엇인가요?」(지점 · 시각 · 전후 15분 → 구간 최대 · 주원인 · 통과 목록)
 *         ② 지점별 × 시간대별 평균 소음 표(기존 #ndHourMx 단을 위로 옮김)
 *   그 아래 기존 통계(오늘 요약 · 시간별 · 14일 Lden · 사건 분석 · 검증 · 민원)는 「자세한 통계·기록」 접기 안으로 — 기능은 그대로.
 *   자료 = /noise/sensors · /noise/events(지도 「최근 소음 사건」과 같은 공개 자료). noise-dash.js 는 고치지 않는다. */
(function () {
  'use strict';
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '통과', roll_land: '착륙 활주' };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(t) { var d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function apt() { var s = $('ndApt'); return ((s && s.value) || new URLSearchParams(location.search).get('apt') || 'RKSS').toUpperCase(); }
  function lvCls(db) { return db >= 70 ? 'bad' : db >= 60 ? 'warn' : 'ok'; }
  function init() {
    var main = document.querySelector('.nd-main'); if (!main || $('ndLook')) return;
    var mx = $('ndHourMx'), mxSec = mx && mx.closest('section');
    var look = document.createElement('section'); look.id = 'ndLook'; look.className = 'nd-sec ndl';
    var now = new Date();
    look.innerHTML = '<div class="ndl-h"><div><span class="ndl-k">간편 소음 원인 조회</span><h2>“방금 지나간 시끄러운 비행기가 무엇인가요?”</h2></div>' +
      '<div class="ndl-f"><select id="ndlSpot" aria-label="지점"></select><input type="time" id="ndlTime" value="' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '" aria-label="시각"><span>전후 15분</span><button type="button" id="ndlGo">소음 원인 조회</button></div></div>' +
      '<div class="ndl-r" id="ndlRes"><div class="ndl-sum"><div class="ndl-mut">지점과 시각을 고르고 「소음 원인 조회」를 누르세요.</div></div><div class="ndl-tb"></div></div>';
    main.insertBefore(look, main.firstChild);
    if (mxSec) {                                                        // ② 지점 × 시간대 표를 바로 아래로
      main.insertBefore(mxSec, look.nextSibling); mxSec.classList.add('ndm');
      var h = mxSec.querySelector('h2'); if (h) h.innerHTML = '<span class="ndm-t">지점별 × 시간대별 평균 소음 히트맵</span> <small>색이 진할수록 그 시간대 항공기 소음이 컸습니다 · 칸을 누르면 지도 누적 히트맵</small>';
    }
    var more = document.createElement('details'); more.className = 'nd-more';
    more.innerHTML = '<summary>자세한 통계·기록 <small>오늘 지점별 요약 · 시간별 소음 · 최근 14일 Lden · 사건 분석 · 민원</small></summary>';
    var rest = [].slice.call(main.children).filter(function (e) { return e !== look && e !== mxSec; });
    main.appendChild(more); rest.forEach(function (e) { more.appendChild(e); });
    more.addEventListener('toggle', function () { if (more.open) setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30); });   // 닫혀 있는 동안 그린 그래프를 펼칠 때 다시 그린다
    fetch('/noise/sensors?apt=' + apt(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      $('ndlSpot').innerHTML = (d.sensors || []).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
      // 지점이 없으면 지점 × 시간대 표도 비어 있다 — 함께 숨긴다
      if (!(d.sensors || []).length) { if (mxSec) mxSec.hidden = true; $('ndlGo').disabled = $('ndlSpot').disabled = true; look.querySelector('.ndl-sum').innerHTML = '<div class="ndl-mut">이 공항은 측정 지점이 없어 조회할 수 없습니다 — 지도에서 예측 소음면을 보세요.</div>'; }   // 10-29 리뷰: 빈 목록인데 눌러 「통과 없음」으로 오해
    }).catch(function () {});
    $('ndlGo').onclick = run;
  }
  function run() {
    var sid = $('ndlSpot').value, tv = ($('ndlTime').value || '00:00').split(':'), dv = ($('ndDay') && $('ndDay').value) || '';
    var base = dv ? new Date(dv + 'T00:00:00') : new Date(); base.setHours(+tv[0], +tv[1], 0, 0);
    var t = Math.floor(base.getTime() / 1000), t0 = t - 900, t1 = Math.min(t + 900, Math.floor(Date.now() / 1000));
    var box = $('ndlRes');
    if (!sid) return;
    if (t1 <= t0) { box.querySelector('.ndl-sum').innerHTML = '<div class="ndl-mut">아직 오지 않은 시각입니다 — 지금보다 이른 시각을 고르세요.</div>'; box.querySelector('.ndl-tb').innerHTML = ''; return; }   // 10-29 리뷰: 「19:00 ~ 18:25」 거꾸로 된 구간 box.querySelector('.ndl-sum').innerHTML = '<div class="ndl-mut">조회 중…</div>';
    fetch('/noise/events?apt=' + apt() + '&from=' + t0 + '&to=' + t1 + '&sid=' + encodeURIComponent(sid) + '&limit=50', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var ev = (d.events || []).slice().sort(function (a, b) { return b.t - a.t; });
      if (!ev.length) { box.querySelector('.ndl-sum').innerHTML = '<div class="ndl-mut">' + hm(t0) + ' ~ ' + hm(t1) + ' 에 60dB 넘은 항공기 통과가 없습니다.</div>'; box.querySelector('.ndl-tb').innerHTML = ''; return; }
      var mx = ev.reduce(function (a, b) { return b.lmax > a.lmax ? b : a; });
      box.querySelector('.ndl-sum').innerHTML = '<div class="ndl-mut">조회 구간 최대 소음 (' + hm(t0) + ' ~ ' + hm(t1) + ')</div>' +
        '<div class="ndl-max ' + lvCls(mx.lmax) + '">' + mx.lmax.toFixed(1) + ' dB(A) <small>(' + hm(mx.t) + ' 통과)</small></div>' +
        '<div class="ndl-why">주원인 항공기: <b translate="no">' + esc(mx.flight || mx.reg || mx.hex) + '</b> (' + esc([mx.type, PH[mx.phase] || mx.phase, '거리 ' + (mx.dist / 1000).toFixed(1) + 'km'].filter(Boolean).join(' · ')) + ')</div>';
      box.querySelector('.ndl-tb').innerHTML = '<table><thead><tr><th>통과 시각</th><th>편명 (기종)</th><th>비행 단계</th><th>최단 거리</th><th class="r">최대 소음(Lmax)</th></tr></thead><tbody>' +
        ev.slice(0, 8).map(function (e) {
          return '<tr><td class="tm">' + hm(e.t) + '</td><td><b translate="no">' + esc(e.flight || e.reg || e.hex) + '</b> <small>(' + esc(e.type || '–') + ')</small></td><td class="ph ' + (e.phase === 'dep' ? 'dep' : '') + '">' + esc(PH[e.phase] || e.phase || '–') + '</td><td>' + (e.dist / 1000).toFixed(1) + ' km</td><td class="r db ' + lvCls(e.lmax) + '">' + e.lmax.toFixed(1) + ' dB</td></tr>';
        }).join('') + '</tbody></table>';
    }).catch(function () { box.querySelector('.ndl-sum').innerHTML = '<div class="ndl-mut">조회하지 못했습니다 — 잠시 뒤 다시 눌러 주세요.</div>'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
