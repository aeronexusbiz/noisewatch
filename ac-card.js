/* AeroNexus Biz — 기체 카드 (2026-10-28). 항공기를 누르면 기본 정보를 AeroNexus 기관 API(/partner/acft · biz 서버가 키를 붙여 중계)로 받아 보여 준다.
 * 운영자 「biz 에서 항공기를 선택하면 항공기 기본정보도 aeronexus 에서 받아서」.
 *   AcCard.show(ac)    ac = 화면 행 {hex, flight, reg, type, lat, lon, alt, gs, track, vr, phase}
 *   AcCard.update(ac)  같은 기체의 새 위치·속도(실시간 칸·진행률만 다시 그림)
 *   AcCard.hide()
 * 등록국은 AeroNexus 와 같은 모듈(features/acft-country · Mode-S 대역)로 화면에서 판정. 노선은 **통계 추정**이라 그렇게 적는다. 못 받은 항목은 칸을 만들지 않는다. */
(function () {
  'use strict';
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '순항·통과' };
  var el = null, cur = null, info = null, seq = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function km(a, b) { return Math.hypot((a[0] - b[0]) * 110.574, (a[1] - b[1]) * 111.32 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180)); }
  function fmtAlt(a) { return a === 'ground' ? '지상' : a == null ? '–' : Math.round(a).toLocaleString() + ' ft'; }
  function country(hex) { try { return window.AcftCountry && hex ? AcftCountry.plain(hex) : ''; } catch (_) { return ''; } }
  function mk() {
    if (el) return el;
    el = document.createElement('aside'); el.id = 'acCard'; el.className = 'acc'; el.hidden = true;
    el.innerHTML = '<div class="acc-h"><div class="acc-t"><b id="accFlight"></b> <span id="accAl"></span></div><span id="accCty" class="acc-cty"></span><button type="button" class="acc-x" title="닫기 (Esc)" aria-label="닫기">×</button></div>' +
      '<div class="acc-b"><div id="accRoute" class="acc-sec"></div><div id="accLive" class="acc-sec"></div><div id="accSpec" class="acc-sec"></div><div id="accCabin" class="acc-sec"></div><div class="acc-note">참고용 · 항적 = AeroNexus 자체 수신기 · 노선은 최근 운항 통계로 추정</div></div>';
    document.body.appendChild(el);
    el.querySelector('.acc-x').onclick = hide;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) hide(); });
    return el;
  }
  function show(ac) {
    mk(); cur = ac; info = null; el.hidden = false;
    document.getElementById('accFlight').textContent = ac.flight || ac.reg || ac.hex || '—';
    document.getElementById('accAl').textContent = '';
    document.getElementById('accCty').innerHTML = country(ac.hex);
    document.getElementById('accRoute').innerHTML = '<div class="acc-dim">노선 정보 불러오는 중…</div>';
    document.getElementById('accCabin').innerHTML = '';
    live(); spec();
    var my = ++seq, q = ['hex=' + encodeURIComponent(ac.hex || ''), 'flight=' + encodeURIComponent(ac.flight || ''), 'reg=' + encodeURIComponent(ac.reg || ''), 'type=' + encodeURIComponent(ac.type || '')].join('&');
    fetch('/partner/acft?' + q, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (my !== seq) return;
      info = d && d.ok ? d : null;
      if (!info) { document.getElementById('accRoute').innerHTML = '<div class="acc-dim">기체 정보를 받지 못했습니다(기관 API 연결 확인)</div>'; return; }
      var al = info.airline;
      document.getElementById('accAl').textContent = al ? '(' + (al.call || al.ko || al.name || al.icao) + ')' : '';
      route(); spec(); cabin();
    }).catch(function () { if (my === seq) document.getElementById('accRoute').innerHTML = '<div class="acc-dim">기체 정보를 받지 못했습니다</div>'; });
  }
  function update(ac) { if (!el || el.hidden || !cur || ac.hex !== cur.hex) return; cur = ac; live(); if (info && info.route) route(); }
  function hide() { if (el) el.hidden = true; cur = null; seq++; }
  function progress() {
    var r = info && info.route; if (!r || !r.depLL || !r.desLL || cur.lat == null) return null;
    var a = km(r.depLL, [cur.lat, cur.lon]), b = km([cur.lat, cur.lon], r.desLL);
    return { p: a + b > 0 ? a / (a + b) : 0, left: b };
  }
  function route() {
    var r = info && info.route, box = document.getElementById('accRoute');
    if (!r) { box.innerHTML = '<div class="acc-dim">노선 통계 없음 — 이 편명의 최근 운항 기록이 없습니다</div>'; return; }
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
  window.AcCard = { show: show, update: update, hide: hide };
})();
