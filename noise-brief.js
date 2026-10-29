/* AeroNexus NoiseWatch — 한 줄 실시간 브리핑 바 (2026-10-29 · 운영자 목업 「상단 6개 요약 박스 → 1줄 브리핑 바」)
 * 모든 탭의 공통 머리 바로 아래: [체감 상태] · 지금 가장 시끄러운 지점(dB) · 원인 항공기 · 사용 활주로 · 바람 · 곧 통과 예정.
 * 요청을 새로 만들지 않는다 — 화면이 이미 받는 /noise/live·/noise/replay·/noise/soon 응답을 같이 읽는다(fetch 를 감싸 복사본만 본다).
 *   그 응답이 없는 화면(통계 등)에서만 스스로 받는다(live 10초 · soon 30초).
 * 체감 등급(목업 4번): ~59 평온(초록) · 60~69 주의(노랑) · 70+ 경보(빨강) — NoiseBrief.level(db) 로 다른 화면도 같은 기준을 쓴다. */
(function () {
  'use strict';
  var B = { live: null, soon: null, el: null, seenLive: 0, seenSoon: 0 };
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '통과' };
  var DIR = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function level(db) {
    if (db >= 70) return { k: 'bad', word: '경보', label: '경보 · 시끄러움', c: '#f43f5e' };
    if (db >= 60) return { k: 'warn', word: '주의', label: '주의 · 대화 인지', c: '#f59e0b' };
    return { k: 'ok', word: '평온', label: '평온 · 일상 수준', c: '#10b981' };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function apt() {
    var s = document.querySelector('[data-gnb="apt"]') || document.querySelector('select[id$="Apt"]');
    return ((s && s.value) || new URLSearchParams(location.search).get('apt') || 'RKSS').toUpperCase();
  }
  function path(u) { try { return new URL(typeof u === 'string' ? u : u.url, location.href).pathname; } catch (_) { return ''; } }

  /* 화면이 받는 응답을 같이 읽는다 */
  var f0 = window.fetch;
  if (f0) window.fetch = function (u) {
    var p = f0.apply(this, arguments), pa = path(u);
    if (pa === '/noise/live' || pa === '/noise/replay' || pa === '/noise/soon') {
      p.then(function (r) {
        if (!r.ok) return;
        r.clone().json().then(function (d) {
          if (!d || !d.ok) return;
          if (pa === '/noise/live' && rp()) return;                      // 10-29 리뷰: 리플레이로 바꾼 뒤 늦게 온 실시간 응답이 바를 실시간 값으로 덮었다
          if (pa === '/noise/soon') { B.soon = d; B.seenSoon = Date.now(); } else { B.live = d; B.seenLive = Date.now(); }
          draw();
        }).catch(function () {});
      }, function () {});
    }
    return p;
  };
  function rp() { return document.body.classList.contains('rp'); }      // 지도 리플레이 중(바는 그 시각 값 — 실시간으로 덮지 않는다)
  function selfPoll() {                                                // 그 응답을 받는 화면이 아니면 스스로(가볍게)
    var a = apt(), now = Date.now();
    if (document.hidden) return;
    if (now - B.seenLive > 12000 && !rp()) f0('/noise/live?apt=' + a, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.ok) { B.live = d; draw(); } }).catch(function () {});
    if (now - B.seenSoon > 35000) f0('/noise/soon?apt=' + a, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.ok) { B.soon = d; draw(); } }).catch(function () {});
  }

  function mount() {
    if (B.el) return true;
    var g = document.querySelector('.ns-gnb'); if (!g) return false;
    B.el = document.createElement('div'); B.el.className = 'nb-bar no-print'; B.el.setAttribute('role', 'status'); B.el.setAttribute('aria-live', 'polite');
    B.el.innerHTML = '<div class="nb-l"><span class="nb-st"><i></i><span>불러오는 중…</span></span><span class="nb-top"></span><span class="nb-src"></span></div>' +
      '<div class="nb-r"><span class="nb-chip nb-rwy"><em>활주로</em><b>–</b></span><span class="nb-chip nb-wind"><em>바람</em><b>–</b></span><span class="nb-chip nb-soon"><em>곧 통과 예정</em><b>–</b></span></div>';
    g.parentNode.insertBefore(B.el, g.nextSibling);
    document.body.classList.add('has-brief');
    B.el.querySelector('.nb-top').addEventListener('click', function () {
      var id = this.dataset.id; if (!id) return;
      var card = document.querySelector('#nzCards .nz-card[data-id="' + id + '"], .nw-p[data-id="' + id + '"]');
      if (card) card.click(); else location.href = '/noise.html?apt=' + apt();
    });
    draw();
    return true;
  }
  function draw() {
    if (!B.el) return;
    var d = B.live;
    var ss = d && d.sensors ? d.sensors.filter(function (s) { return s.db != null; }).sort(function (a, b) { return b.db - a.db; }) : [];
    if (d && !ss.length) {                                             // 10-29 리뷰: 측정 지점이 없는 공항(인천)은 「불러오는 중…」에 멈춰 있었다
      var st0 = B.el.querySelector('.nb-st'); st0.className = 'nb-st na';   // 10-29 리뷰: 초록(평온) 점이라 상태처럼 읽혔다 → 회색 st0.querySelector('span').textContent = (d.sensors || []).length ? '지점 값 없음' : '측정 지점 없음 · 지도 예측만';
      B.el.querySelector('.nb-top').innerHTML = ''; B.el.querySelector('.nb-src').hidden = true;
    }
    if (ss.length) {
      var top = ss[0], nWarn = ss.filter(function (s) { return s.db >= 60 && s.db < 70; }).length, nBad = ss.filter(function (s) { return s.db >= 70; }).length, lv = level(top.db);
      var rest = ss.length - nWarn - nBad;
      var st = nBad ? '경보 ' + nBad + '곳' + (nWarn ? ' · 주의 ' + nWarn + '곳' : '') + (rest ? ' · 나머지 ' + rest + '곳 평온' : '')
        : nWarn ? '주의 ' + nWarn + '곳 · 나머지 ' + rest + '곳 평온' : '모든 지점 평온(' + ss.length + '곳)';
      var stEl = B.el.querySelector('.nb-st'); stEl.className = 'nb-st ' + (nBad ? 'bad' : nWarn ? 'warn' : 'ok'); stEl.querySelector('span').textContent = st;
      var tEl = B.el.querySelector('.nb-top'); tEl.dataset.id = top.id;
      tEl.innerHTML = '<em>' + (d.mode === 'replay' ? '그 시각 최고' : '현재 최고') + '</em><b style="color:' + lv.c + '">' + esc(top.name) + ' (' + top.db.toFixed(1) + ' dB)</b>';
      var src = (top.src || []).slice().sort(function (a, b) { return b.db - a.db; })[0];
      var sEl = B.el.querySelector('.nb-src');
      sEl.hidden = !(src && src.db >= top.db - 10);
      if (!sEl.hidden) sEl.innerHTML = '원인 <b translate="no">' + esc(src.flight || src.type || '항공기') + '</b> (' + esc([src.type, PH[src.phase]].filter(Boolean).join(' ')) + ' · ' + (src.dist / 1000).toFixed(1) + 'km)';
    }
    if (d) {
      var w = d.wx, wEl = B.el.querySelector('.nb-wind b');
      wEl.textContent = !w || w.ws == null ? '–' : w.ws < 3 || w.wd == null ? '약함(' + Math.round(w.ws || 0) + 'kt)' : DIR[Math.round(w.wd / 45) % 8] + '풍 ' + Math.round(w.ws) + 'kt';
    }
    var s = B.soon;
    if (s) {
      B.el.querySelector('.nb-rwy b').textContent = s.rwy && (s.rwy.arr || s.rwy.dep) ? [s.rwy.arr && '착륙 ' + s.rwy.arr, s.rwy.dep && '이륙 ' + s.rwy.dep].filter(Boolean).join(' · ') : '판정 전';
      B.el.querySelector('.nb-soon b').textContent = '도착 ' + (s.arr || []).length + ' · 출발 ' + (s.dep || []).length + '대';
    }
  }
  function boot() { if (!mount()) { var n = 0, t = setInterval(function () { if (mount() || ++n > 40) clearInterval(t); }, 100); } setTimeout(selfPoll, 1500); setInterval(selfPoll, 10000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/noise-brief.css?v=4'; document.head.appendChild(css);
  window.NoiseBrief = { level: level };
})();
