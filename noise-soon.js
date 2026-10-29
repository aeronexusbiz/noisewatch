/* AeroNexus Biz 소음 — 곧 보일 항공기(5분 안) · 도착/출발 나눔 (2026-10-28 · 서버 noise_soon.soon 과 짝)
 * 운영자 「지도 밖에서 5분 이내 보일 항공기 목록을 시간순으로 · 출발과 도착을 나누어서 · 출발은 운항정보, 도착은 항적 기준」.
 *   NoiseSoon.mount(el, { apt }) — 실시간 지도 옆 칸·관제판이 같이 쓴다. /noise/soon 5초마다 · 도착 남은 시간은 1초마다 줄인다.
 *   예상 소음 = 지금 쓰는 활주로 연장선 위 측정기 · 표준 경로(활공 3°·이륙 8%) · 기종 표(없으면 계열) — 추정(모의).
 * ⚠ 리플레이 중에는 지금 기준 목록이다(과거 운항정보를 다시 만들지 않는다). */
(function () {
  'use strict';
  var POLL_MS = 5000;
  var ST = { ready: ['탑승·대기', ''], parked: ['주기 중', ''], taxi: ['지상 이동', 'go'], roll: ['활주', 'hot'] };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(s) { return s ? s.slice(0, 2) + ':' + s.slice(2) : '–'; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function col(db) { return window.NoiseBrief ? NoiseBrief.level(db).c : db >= 70 ? '#f43f5e' : db >= 60 ? '#f59e0b' : '#10b981'; }   // 10-29 리뷰: 체감 등급(60·70) 하나로
  function pred(p, cls) {
    if (!p || !p.length) return '<span class="ns-mut">연장선 위 측정기 없음</span>';
    return p.slice(0, 2).map(function (o) { return esc(o.name) + ' <b style="color:' + col(o.db) + '">~' + Math.round(o.db) + 'dB</b>'; }).join(' · ') + (cls === 'class' ? ' <small title="기종을 몰라(또는 표에 없어) 계열 값으로 추정">계열</small>' : '');
  }

  function mount(el, o) {
    var S = { d: null, t: 0 };
    el.classList.add('ns');
    el.innerHTML = '<div class="ns-h"><b>곧 지나갈 항공기</b><small>5분 안 · 시간순</small><span class="ns-rwy"></span></div>' +
      '<div class="ns-sec"><h4><i class="nic" data-ic="arrive"></i> 도착 <small>항적 기준 · 지도 밖 → 진입까지</small><i class="ns-n a">0</i></h4><div class="ns-arr"></div></div>' +
      '<div class="ns-sec"><h4><i class="nic" data-ic="depart"></i> 출발 <small>운항정보 기준 · 예정(변경) 시각</small><i class="ns-n d">0</i></h4><div class="ns-dep"></div></div>' +
      '<div class="ns-f">예상 소음 = 지금 쓰는 활주로와 기종으로 짐작한 예측값(실측 아님)</div>';
    function load() {
      fetch('/noise/soon?apt=' + o.apt, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) { el.querySelector('.ns-arr').innerHTML = '<div class="ns-mut">' + esc(d.why || '자료 없음') + '</div>'; return; }
        S.d = d; S.t = Date.now() / 1000; draw();
      }).catch(function () {}).then(function () { setTimeout(load, POLL_MS); });
    }
    function draw() {
      var d = S.d; if (!d) return;
      el.querySelector('.ns-rwy').textContent = (d.rwy.arr ? '착륙 ' + d.rwy.arr : '') + (d.rwy.dep ? ' · 이륙 ' + d.rwy.dep : '');
      el.querySelector('.ns-n.a').textContent = d.arr.length; el.querySelector('.ns-n.d').textContent = d.dep.length;
      // 10-29 운영자 목업 — 카드: [도착·남은 시간 | 출발·시각] 뱃지 · 편명 · 기종 / 경로 한 줄 · 오른쪽 = 영향 지점 + 예상 dB
      var pr = function (p) {
        if (!p || !p.length) return '<span class="ns-mut">연장선 위 지점 없음</span>';
        return '<small>' + esc(p[0].name) + '</small><b style="color:' + col(p[0].db) + '">예상 ~' + Math.round(p[0].db) + ' dB</b>';
      };
      el.querySelector('.ns-arr').innerHTML = d.arr.length ? d.arr.map(function (a) {
        return '<div class="ns-it nsc a" data-at="' + a.at + '"><div class="nsl"><div class="l1"><span class="nsb">도착 · <time class="cd">' + mmss(a.at - Date.now() / 1000) + '</time></span><b translate="no">' + esc(a.flight || a.reg || a.hex) + '</b>' + (a.fid ? ' <small translate="no">' + esc(a.fid) + '</small>' : '') + ' <span class="ty">' + esc(a.type || '') + '</span></div>' +
          '<div class="l2">' + esc(a.dir) + ' ' + a.distKm.toFixed(0) + 'km · ' + (a.alt == null ? '' : Math.round(a.alt).toLocaleString() + 'ft') + (a.vr < -200 ? ' ↘' : '') + ' · ' + Math.round(a.gs) + 'kt · 공항까지 ~' + Math.max(1, Math.round(a.etaApt / 60)) + '분' + (a.fromName ? ' · ' + esc(a.fromName) + '발' : '') + '</div></div>' +
          '<div class="nsr">' + pr(a.pred) + '</div></div>';
      }).join('') : '<div class="ns-mut">5분 안에 지도로 들어올 도착 항적 없음</div>';
      el.querySelector('.ns-dep').innerHTML = d.dep.length ? d.dep.map(function (a) {
        var st = ST[a.state] || ['', ''], late = a.etd && a.etd !== a.std;
        return '<div class="ns-it nsc d"><div class="nsl"><div class="l1"><span class="nsb">출발 · ' + (late ? '<s>' + hm(a.std) + '</s> ' + hm(a.etd) : hm(a.std)) + '</span><b translate="no">' + esc(a.fid) + '</b>' + (a.codeshare.length ? ' <small title="공동운항(같은 시각·행선지·탑승구 — 추정): ' + esc(a.codeshare.join(', ')) + '">+' + a.codeshare.length + '</small>' : '') + ' <span class="ty">' + esc(a.type || '') + '</span></div>' +
          '<div class="l2">→ ' + esc(a.toName || a.to || '') + ' · <i class="ns-st ' + st[1] + '">' + esc(a.state === 'ready' && a.remark ? a.remark : st[0]) + '</i>' + (a.gate ? ' · 탑승구 ' + esc(a.gate) : '') + (a.state === 'taxi' && a.gs ? ' · ' + Math.round(a.gs) + 'kt' : '') + '</div></div>' +
          '<div class="nsr">' + pr(a.pred) + '</div></div>';
      }).join('') : '<div class="ns-mut">' + (d.boardOk ? '5분 안 출발 예정 편 없음' : '운항정보를 받지 못했습니다') + '</div>';
    }
    setInterval(function () { el.querySelectorAll('.ns-arr .ns-it').forEach(function (it) { var s = +it.dataset.at - Date.now() / 1000; it.querySelector('.cd').textContent = s > 0 ? mmss(s) : '진입'; it.classList.toggle('in', s <= 0); }); }, 1000);
    load();
    return { reload: load };
  }
  window.NoiseSoon = { mount: mount };
})();
