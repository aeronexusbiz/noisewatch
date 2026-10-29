/* AeroNexus Biz — 기체 카드 (2026-10-28). 항공기를 누르면 기본 정보를 AeroNexus 기관 API(/partner/acft · biz 서버가 키를 붙여 중계)로 받아 보여 준다.
 * 운영자 「biz 에서 항공기를 선택하면 항공기 기본정보도 aeronexus 에서 받아서」.
 *   AcCard.show(ac)    ac = 화면 행 {hex, flight, reg, type, lat, lon, alt, gs, track, vr, phase}
 *   AcCard.update(ac)  같은 기체의 새 위치·속도(실시간 칸·진행률만 다시 그림)
 *   AcCard.hide()
 * 등록국은 AeroNexus 와 같은 모듈(features/acft-country · Mode-S 대역)로 화면에서 판정. 노선은 **통계 추정**이라 그렇게 적는다. 못 받은 항목은 칸을 만들지 않는다. */
(function () {
  'use strict';
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '순항·통과' };
  var el = null, cur = null, info = null, fl = null, seq = 0, MAP = null, trail = null, trailT = 0;
  var POSK = 'nw.acc.pos';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function km(a, b) { return Math.hypot((a[0] - b[0]) * 110.574, (a[1] - b[1]) * 111.32 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180)); }
  function fmtAlt(a) { return a === 'ground' ? '지상' : a == null ? '–' : Math.round(a).toLocaleString() + ' ft'; }
  function country(hex) { try { return window.AcftCountry && hex ? AcftCountry.plain(hex) : ''; } catch (_) { return ''; } }
  function mk() {
    if (el) return el;
    el = document.createElement('aside'); el.id = 'acCard'; el.className = 'acc'; el.hidden = true;
    el.innerHTML = '<div class="acc-h"><div class="acc-t"><b id="accFlight"></b> <span id="accAl"></span></div><span id="accCty" class="acc-cty"></span><button type="button" class="acc-x" title="닫기 (Esc)" aria-label="닫기">×</button></div>' +
      '<div class="acc-b"><div id="accRoute" class="acc-sec"></div><div id="accLive" class="acc-sec"></div><div id="accSpec" class="acc-sec"></div><div id="accCabin" class="acc-sec"></div><div id="accTrail" class="acc-dim"></div><div class="acc-note">참고용 · 항적 = AeroNexus 자체 수신기 · 출도착 = 공항 운항정보(예정·변경 시각) · 머리를 끌어 옮길 수 있습니다</div></div>';
    document.body.appendChild(el);
    el.querySelector('.acc-x').onclick = hide;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) hide(); });
    drag(el.querySelector('.acc-h'));
    return el;
  }
  /* 10-29 운영자 「항공기 정보 팝업을 이동할 수 있게」 — 머리를 잡고 끈다(데스크톱 · 폰은 아래 고정 판) · 자리는 이 브라우저에 기억 */
  function wide() { return !window.matchMedia || !matchMedia('(max-width: 860px)').matches; }
  function place(x, y) {
    var w = el.offsetWidth, h = el.offsetHeight;
    x = Math.max(4, Math.min(x, innerWidth - w - 4)); y = Math.max(4, Math.min(y, innerHeight - Math.min(h, 120)));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto';
  }
  function drag(h) {
    h.style.cursor = 'move'; h.title = '끌어서 옮기기';
    h.addEventListener('pointerdown', function (e) {
      if (!wide() || e.target.closest('button, a')) return;
      var r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      h.setPointerCapture(e.pointerId); el.classList.add('acc-drag');
      var mv = function (ev) { place(ev.clientX - dx, ev.clientY - dy); };
      var up = function () {
        h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); el.classList.remove('acc-drag');
        try { localStorage.setItem(POSK, JSON.stringify([parseInt(el.style.left, 10), parseInt(el.style.top, 10)])); } catch (_) {}
      };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }
  function restore() {
    if (!wide()) { el.style.left = el.style.top = el.style.right = ''; return; }
    var p = null; try { p = JSON.parse(localStorage.getItem(POSK) || 'null'); } catch (_) {}
    if (p && p.length === 2) place(p[0], p[1]);
  }
  /* 10-29 운영자 「항공기를 누르면 지나온 길」 — 서버가 저장한 항적(공항 20km 안 · 최근 30분)을 지도에 선으로. 실시간 위치를 이어 붙인다 */
  function trailDraw() {
    if (!MAP || !window.L || !cur) return;
    if (!trail) trail = L.polyline([], { color: '#38bdf8', weight: 3, opacity: 0.85, dashArray: null, interactive: false, className: 'acc-trail' }).addTo(MAP);
    return trail;
  }
  function trailLoad() {
    if (!MAP || !cur || String(cur.hex || '').charAt(0) === '~' || document.body.classList.contains('rp')) return;   // 리플레이 중엔 「지금부터 30분 전」이 맞지 않는다
    var my = seq, a = (new URLSearchParams(location.search).get('apt') || '').toUpperCase() || ((document.getElementById('nzApt') || {}).value || 'RKSS');
    fetch('/noise/trail?apt=' + encodeURIComponent(a) + '&hex=' + encodeURIComponent(cur.hex) + '&min=30', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (my !== seq || !d || !d.ok) return;
      var pl = trailDraw(); if (!pl) return;
      pl.setLatLngs(d.p.map(function (q) { return [q[1], q[2]]; })); trailT = Date.now();
      var n = document.getElementById('accTrail'); if (n) n.textContent = d.p.length ? '지도의 하늘색 선 = 지나온 길(공항 주변 · 최근 ' + Math.max(1, Math.round((d.p[d.p.length - 1][0] - d.p[0][0]) / 60)) + '분)' : '';
    }).catch(function () {});
  }
  function trailClear() { if (trail) { trail.remove(); trail = null; } var n = document.getElementById('accTrail'); if (n) n.textContent = ''; }
  function masked() { return String((cur && cur.hex) || '').charAt(0) === '~'; }
  function show(ac) {
    mk(); var same = cur && cur.hex === ac.hex; cur = ac; info = null; el.hidden = false; restore();
    if (!same) { trailClear(); }
    document.getElementById('accFlight').textContent = ac.flight || ac.reg || ac.hex || '—';
    document.getElementById('accAl').textContent = '';
    document.getElementById('accCty').innerHTML = country(ac.hex);
    document.getElementById('accRoute').innerHTML = '<div class="acc-dim">노선 정보 불러오는 중…</div>';
    document.getElementById('accCabin').innerHTML = '';
    live(); spec();
    if (masked()) {                                                   // 10-29 공개 화면 — 소형기·헬기·콜사인 없는 기체는 서버가 식별자를 가린다(기관 API 에 물을 것이 없다)
      ++seq; document.getElementById('accRoute').innerHTML = '<div class="acc-dim">비공개 항공기 — 개인 소유일 수 있어 편명·등록번호·출도착을 표시하지 않습니다</div>'; return;
    }
    trailLoad(); fl = null;
    var my = ++seq, q = ['hex=' + encodeURIComponent(ac.hex || ''), 'flight=' + encodeURIComponent(ac.flight || ''), 'reg=' + encodeURIComponent(ac.reg || ''), 'type=' + encodeURIComponent(ac.type || '')].join('&');
    if (ac.flight) fetch('/noise/flight?apt=' + encodeURIComponent(aptOf()) + '&cs=' + encodeURIComponent(ac.flight), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {   // 10-29 출도착 — 이 공항 운항정보
      if (my !== seq) return; fl = d && d.f; if (fl || !info) board();
    }).catch(function () {});
    fetch('/partner/acft?' + q, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (my !== seq) return;
      info = d && d.ok ? d : null;
      if (!info) { board(); return; }
      var al = info.airline;
      document.getElementById('accAl').textContent = al ? '(' + (al.call || al.ko || al.name || al.icao) + ')' : '';
      board(); spec(); cabin();
    }).catch(function () { if (my === seq) board(); });
  }
  function update(ac) {
    if (!el || el.hidden || !cur || ac.hex !== cur.hex) return; cur = ac; live(); if (info && info.route) route();
    if (trail && ac.lat != null && !document.body.classList.contains('rp')) { var ll = trail.getLatLngs(), last = ll[ll.length - 1]; if (!last || last.lat !== ac.lat || last.lng !== ac.lon) trail.addLatLng([ac.lat, ac.lon]); }
    if (Date.now() - trailT > 60000) trailLoad();                     // 1분마다 서버 항적으로 다시 맞춘다(끊긴 구간 메우기)
  }
  function hide() { if (el) el.hidden = true; cur = null; seq++; trailClear(); }
  function progress() {
    var r = info && info.route; if (!r || !r.depLL || !r.desLL || cur.lat == null) return null;
    var a = km(r.depLL, [cur.lat, cur.lon]), b = km([cur.lat, cur.lon], r.desLL);
    return { p: a + b > 0 ? a / (a + b) : 0, left: b };
  }
  function aptOf() { var s = document.getElementById('nzApt'); return ((s && s.value) || new URLSearchParams(location.search).get('apt') || 'RKSS').toUpperCase(); }
  function hm(x) { return x && x.length === 4 ? x.slice(0, 2) + ':' + x.slice(2) : ''; }
  /* 10-29 출도착 — 운항정보(공항 출발·도착판)에 있으면 「김포 출발 → 제주 · 예정 19:35 → 변경 20:07 · 탑승구 11」. 기관 API 노선(진행률)이 있으면 그 아래에 */
  function board() {
    var box = document.getElementById('accRoute'), f = fl;
    var top = f ? '<div class="acc-fl"><div><b>' + esc(f.from.name || f.from.code) + '</b><small translate="no">' + esc(f.from.code || '') + '</small></div><span class="acc-arr">→</span><div class="r"><b>' + esc(f.to.name || f.to.code) + '</b><small translate="no">' + esc(f.to.code || '') + '</small></div></div>' +
      '<div class="acc-flm"><span class="acc-tag ' + f.dir + '">' + (f.dir === 'dep' ? '출발' : '도착') + '</span> <b translate="no">' + esc(f.id) + '</b> · 예정 ' + hm(f.sched) + (f.est && f.est !== f.sched ? ' → <b>' + (f.dir === 'dep' ? '출발 ' : '도착 ') + hm(f.est) + '</b>' : '') + (f.remark ? ' · ' + esc(f.remark) : '') + (f.gate ? ' · 탑승구 ' + esc(f.gate) : '') + (f.term ? ' · ' + esc(f.term) : '') + '</div>' : '';
    if (info && info.route) { box.innerHTML = top; box.insertAdjacentHTML('beforeend', '<div class="acc-rtw"></div>'); route(); return; }
    box.innerHTML = top || '<div class="acc-dim">출도착 정보 없음 — 이 공항을 오가지 않는 통과기이거나 운항정보에 없는 편입니다</div>';
  }
  function route() {
    var r = info && info.route, box0 = document.getElementById('accRoute'), box = box0.querySelector('.acc-rtw') || box0;
    if (!r) { board(); return; }
    var pg = progress(), gs = cur.gs || 0, eta = pg && gs > 60 ? pg.left / (gs * 1.852) : null;
    box.innerHTML = '<div class="acc-rt"><div><b>' + esc(r.dep) + '</b><small>' + esc(r.depIata || '') + '</small></div><div class="acc-bar"><i style="width:' + (pg ? Math.round(pg.p * 100) : 0) + '%"></i><span style="left:' + (pg ? Math.round(pg.p * 100) : 0) + '%"><i class="nic" data-ic="plane"></i></span></div><div class="r"><b>' + esc(r.des) + '</b><small>' + esc(r.desIata || '') + '</small></div></div>' +
      '<div class="acc-dim">' + (pg ? Math.round(pg.p * 100) + '% · 남은 ' + Math.round(pg.left).toLocaleString() + ' km' + (eta ? ' · 약 ' + (eta >= 1 ? Math.floor(eta) + '시간 ' : '') + Math.round(eta % 1 * 60) + '분(지금 속도 기준)' : '') + ' · ' : '') + esc(r.basis || '통계 추정') + '</div>';
  }
  function live() {
    document.getElementById('accLive').innerHTML = '<div class="acc-kv"><span>고도<b>' + fmtAlt(cur.alt) + '</b></span><span>속도<b>' + (cur.gs != null ? Math.round(cur.gs) + ' kt' : '–') + '</b></span><span>방위<b>' + (cur.track != null ? Math.round(cur.track) + '°' : '–') + '</b></span><span>승강<b>' + (cur.vr != null ? (cur.vr > 0 ? '+' : '') + Math.round(cur.vr) + ' fpm' : '–') + '</b></span><span>단계<b>' + (PH[cur.phase] || '–') + '</b></span></div>';
  }
  function spec() {
    var al = info && info.airline, cb = info && info.cabin;
    document.getElementById('accSpec').innerHTML = '<h4>기체 제원</h4><div class="acc-kv3">' +
      '<span>호출부호<b>' + esc(al ? (al.call || al.ko || '') : '') + '</b></span><span>회사명<b>' + esc(al ? (al.ko || al.name || '') : '') + '</b></span><span>기종<b>' + esc(cur.type || '') + (cb && cb.model ? '<small>' + esc(cb.model) + '</small>' : '') + '</b></span>' +
      '<span>등록번호<b>' + esc(cur.reg || '') + '</b></span><span>Mode-S<b>' + esc((cur.hex || '').toUpperCase()) + '</b></span><span>등록국<b>' + country(cur.hex) + '</b></span></div>';
  }
  function link(u, t) { return u && /^https?:\/\//i.test(String(u)) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + ' ↗</a>' : ''; }   // http(s) 만(javascript: 등 차단)
  function cabin() {
    var c = info && info.cabin, box = document.getElementById('accCabin');
    if (!c) { box.innerHTML = ''; return; }
    // 열 이름: tb_acft_seatmap(reg 기준: seats·seatmap_url·vr_url·model·src_date) · tb_airline_cabin(항공사+기종: seats_total·seatmap_url·cabin_classes·wifi·ife·variant). 서버가 camelCase 로 줄 수도 있어 둘 다 본다
    var g = function (o, a, b) { return o ? (o[a] != null ? o[a] : o[b]) : null; };
    var rows = [], sm = c.seatmap, cb = (c.cabins && c.cabins[0]) || null, n = (c.cabins || []).length;
    var seats = g(sm, 'seats', 'seats') || g(cb, 'seatsTotal', 'seats_total'), smUrl = g(sm, 'seatmapUrl', 'seatmap_url') || g(cb, 'seatmapUrl', 'seatmap_url'), vr = g(sm, 'vrUrl', 'vr_url');
    var cls = g(cb, 'cabinClasses', 'cabin_classes'), src = g(sm, 'srcDate', 'src_date');
    if (seats || smUrl) rows.push('<span>좌석배치도<b>' + (seats ? esc(seats) + '석' : '') + (cls ? ' · ' + esc(cls) : '') + (sm ? ' · 이 기체' : n > 1 ? ' · 동일 기종 ' + n + '구성' : ' · 동일 기종') + ' ' + link(smUrl, '보기') + (vr ? ' · ' + link(vr, 'VR') : '') + '</b></span>');
    if (cb && cb.wifi) rows.push('<span>기내 WiFi<b>' + esc(cb.wifi) + '</b></span>');
    if (cb && cb.ife) rows.push('<span>기내 엔터테인먼트<b>' + esc(cb.ife) + '</b></span>');
    if (src) rows.push('<span>기준일<b>' + esc(src) + '</b></span>');
    box.innerHTML = rows.length ? '<h4>좌석 · 기내</h4><div class="acc-kv3">' + rows.join('') + '</div><div class="acc-dim">참고용 · 실제 좌석은 항공사 예약 화면에서 확인</div>' : '';
  }
  window.AcCard = { show: show, update: update, hide: hide, setMap: function (m) { MAP = m; } };
})();
