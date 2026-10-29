/* AeroNexus Biz 소음 감시(모의) 화면 (2026-10-27) — 서버 noise.py 와 짝.
 * 측정기(가정 위치)마다 지금 소음 수준을 색·맥동 고리·숫자로, 기여하는 항공기는 측정기로 잇는 선(+dB)으로. 값은 1초마다 /noise/live.
 * ⚠ 실제 측정기가 없다 — 서버가 항적에서 추정한 모의값(응답 mode='sim'). 실측이 붙어도 이 화면은 그대로(응답 모양이 같다). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var POLL_MS = 1000, HIST_S = 600;
  var S = { apt: null, apts: [], names: {}, arp: {}, map: null, sens: {}, ac: {}, links: [], rwy: null, cards: {}, shown: {}, hist: {}, last: null, follow: false, lines: false,
            rings: true, ring: {}, pos: {}, mode: 'live', seq: 0, rp: { t: 0, playing: false, timer: null, spd: 10, day: null, events: [] } };
  var RING_C = { 80: 'rgb(239,68,68)', 70: 'rgb(249,115,22)', 60: 'rgb(234,179,8)' }, RING_A = { 80: 0.26, 70: 0.18, 60: 0.11 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var el = $('nzToast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 4000); }
  function hhmm(t) { var d = new Date(t * 1000); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  /* dB → 색: 50 초록 · 60 연두 · 70 노랑 · 80 주황 · 90 빨강 (사이는 보간) */
  var STOPS = [[50, [34, 197, 94]], [60, [132, 204, 22]], [70, [234, 179, 8]], [80, [249, 115, 22]], [90, [239, 68, 68]]];
  function color(db) {
    if (db <= STOPS[0][0]) return 'rgb(' + STOPS[0][1].join(',') + ')';
    for (var i = 1; i < STOPS.length; i++) {
      if (db <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], f = (db - a[0]) / (b[0] - a[0]);
        return 'rgb(' + a[1].map(function (v, k) { return Math.round(v + (b[1][k] - v) * f); }).join(',') + ')';
      }
    }
    return 'rgb(' + STOPS[STOPS.length - 1][1].join(',') + ')';
  }
  var PH = { arr: '착륙 접근', dep: '이륙 상승', roll: '활주', taxi: '지상 이동', enr: '통과' };
  var CLS = { wide: '광동체', quad: '대형 4발', narrow: '협동체', prop: '터보프롭', small: '소형기', helicopter: '헬기', mil: '군용', '?': '기종 미상' };
  function fmtAlt(a) { return a === 'ground' ? '지상' : a == null ? '' : Math.round(a).toLocaleString() + 'ft'; }

  /* ── 시작 ── */
  function boot() {
    fetch('/airports.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      S.apts = (d.airports || []).filter(function (a) { return (d.served || []).indexOf(a.icao) >= 0; });
      S.apts.forEach(function (a) { S.names[a.icao] = a.name; S.arp[a.icao] = a.arp; });
      var want = (new URLSearchParams(location.search).get('apt') || '').toUpperCase();
      S.apt = S.names[want] ? want : (S.names.RKSS ? 'RKSS' : S.apts[0].icao);
      var sel = $('nzApt');
      sel.innerHTML = S.apts.map(function (a) { return '<option value="' + a.icao + '">' + esc(a.name) + ' ' + a.icao + '</option>'; }).join('');
      sel.value = S.apt;
      sel.onchange = function () { location.href = '/noise.html?apt=' + sel.value; };
      $('nzDash').href = '/noise-dash.html?apt=' + S.apt; $('nzWatch').href = '/noise-watch.html?apt=' + S.apt;
      initMap(); loadApt();
      setInterval(function () { if (S.mode === 'live') $('nzClock').textContent = hhmm(Date.now() / 1000) + ' KST'; }, 1000);
      $('nzLines').onchange = function () { S.lines = this.checked; if (!S.lines) clearLinks(); };
      $('nzRings').onchange = function () { S.rings = this.checked; if (!S.rings) clearRings(); };
      $('nzFollow').onchange = function () { S.follow = this.checked; };
      rpInit();
    }).catch(function () { toast('공항 목록을 불러오지 못했습니다'); });
  }
  function initMap() {
    S.map = L.map('nzMap', { zoomControl: true, attributionControl: false, maxZoom: 19 });
    S.map.createPane('nzAc').style.zIndex = 690;
    if (window.AcCard && AcCard.setMap) AcCard.setMap(S.map);       // 10-29 기체 카드가 지나온 길을 이 지도에 긋는다                     // 10-29 항공기는 맨 앞 — 기여선 이름표(tooltipPane 650)·측정기·고리 이름표(markerPane 600) 위, 팝업(700) 아래
    // 바탕 지도 고르기(10-29 운영자 「위성 아닌 버전도」) — 브이월드 위성 / 일반(Base) / 야간(midnight). gray 는 중계가 막혀 있어 뺌. 고른 것은 이 브라우저에 기억
    var tl = function (p, o) { return L.tileLayer('/vworld/' + p, Object.assign({ minZoom: 6, maxZoom: 19, maxNativeZoom: 19 }, o || {})); };
    var bases = { '위성': tl('Satellite/{z}/{y}/{x}.jpeg'), '일반 지도': tl('Base/{z}/{y}/{x}.png'), '야간 지도': tl('midnight/{z}/{y}/{x}.png') };
    var names = tl('Hybrid/{z}/{y}/{x}.png', { opacity: 0.8 });
    var want = null; try { want = localStorage.getItem('biz.noise.base'); } catch (_) {}
    if (!bases[want]) want = '일반 지도';                             // 10-29 운영자 「일반지도가 기본」 — 고른 적이 있으면 그것
    bases[want].addTo(S.map);
    if (want === '위성') names.addTo(S.map);                          // 지명(Hybrid)은 위성에서만 켬 — 일반·야간 지도는 지명이 들어 있다
    L.control.layers(bases, { '지명': names }, { position: 'topleft', collapsed: true }).addTo(S.map);
    S.map.on('baselayerchange', function (e) { try { localStorage.setItem('biz.noise.base', e.name); } catch (_) {} if (e.name === '위성') { if (!S.map.hasLayer(names)) names.addTo(S.map); } else if (S.map.hasLayer(names)) S.map.removeLayer(names); });
    S.map.setView(S.arp[S.apt] || [36.2, 127.8], 12);
  }
  /* 공항 도면 = 계류장 2D 와 같은 자료(apt-2d-layer.js) — 어느 공항이든 같은 그림 */
  function loadApt() {
    Promise.all([
      fetch('/noise/sensors?apt=' + S.apt, { cache: 'no-store' }).then(function (r) { return r.json(); }),
      window.Apt2D ? Apt2D.add(S.map, S.apt) : Promise.resolve(null),
      fetch('/noise/hist?apt=' + S.apt, { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return {}; })
    ]).then(function (r) {
      var sens = (r[0] && r[0].sensors) || [], meta = r[1] && r[1].meta;
      S.hist = (r[2] && r[2].sensors) || {};
      if (!sens.length) {                                              // 10-28 운영자 「인천도 측정기 없이 항공기·기종만으로 예측」 — 멈추지 않고 소음면·고리·구역 소음으로
        $('nzCards').innerHTML = '<div class="nz-nosen"><b>이 공항에는 소음측정기가 없습니다</b><span>항공기 위치·기종으로 <b>지도 전체를 예측</b>합니다 — <i class="nic" data-ic="surface"></i> 실시간 소음면 · <i class="nic" data-ic="rings"></i> 소음 고리 · <i class="nic" data-ic="box"></i> 구역 소음 · <i class="nic" data-ic="heat"></i> 누적 히트맵. 모의값.</span></div>';
        if ($('nzLive')) $('nzLive').checked = true;                    // 예측이 바로 보이게(NoiseLive.init 이 켜진 상태를 읽는다)
      }
      var pts = sens.map(function (s) { return [s.lat, s.lon]; });
      if (S.arp[S.apt]) pts.push(S.arp[S.apt]);
      if (meta) Object.keys(meta.thr || {}).forEach(function (k) { pts.push([meta.thr[k].lat, meta.thr[k].lon]); });
      // 화면 범위 = 측정기·활주로 둘레(소음 피해 지역) — 운영자 10-27 「지도의 최대 화면을 정하고 더 축소되지 않게」: 이 범위 밖으로 못 나가고, 이 범위보다 작게 못 줄인다
      var b = L.latLngBounds(pts).pad(sens.length ? 0.3 : 1.6);          // 측정기 없으면 활주로 둘레 ±10km 안팎 · 10-28: 국가 측정소로 바꾸며 측정기가 남북으로 넓어져 0.6 이면 한 단계 멀어졌다(줌 11) → 0.3
      S.map.fitBounds(b, { padding: [20, 20] });
      S.map.setMaxBounds(b.pad(0.15)); S.map.setMinZoom(S.map.getZoom()); S.map.options.maxBoundsViscosity = 1.0;
      // 10-29 지도 측정소 라벨 겹침 방지: 위도 순으로 좌·우 지시 방향을 번갈아 배치(활주로 서쪽은 왼쪽, 동쪽은 오른쪽)
      var arp = S.arp[S.apt] || [37.558, 126.791];
      sens.slice().sort(function (x, y) { return y.lat - x.lat; }).forEach(function (s, i) {
        if (Math.abs(s.lat - arp[0]) < 0.015 && Math.abs(s.lon - arp[1]) > 0.008) s._left = s.lon < arp[1];
        else s._left = (i % 2 === 1);
      });
      sens.forEach(mkSensor);
      if (window.NoiseSoon) NoiseSoon.mount($('nzSoon'), { apt: S.apt });   // 곧 보일 항공기(noise-soon.js)
      if (window.NoiseLive) NoiseLive.init(S.map, S.apt);              // 실시간 소음면(noise-live.js)
      if (window.NoiseNational) NoiseNational.init(S.map, S.apt, sens);   // 국가 항공기소음 측정망(noise-national.js)
      if (window.NoiseBox) NoiseBox.init(S.map, S.apt);                 // 구역 소음(noise-box.js)
      if (window.NoiseHeat) NoiseHeat.init(S.map, S.apt, sens, meta, { mxEl: $('nzHourMx') });   // 누적 히트맵·시간대 표(noise-heat.js)
      if (window.NoiseRwy) NoiseRwy.init(S.map, S.apt, meta);             // 지금 활주로 착륙·이륙 방향(noise-rwyflow.js)
      poll();
    });
  }

  /* ── 측정기 표지·카드 ── */
  function mkSensor(s) {
    var shortName = s.name.replace(/\s*지점$/, '');
    var html = '<div class="ring"></div><div class="ring r2"></div><div class="dot" data-sid="' + esc(s.id) + '"><em class="n">–</em></div><div class="lbl" title="이 숫자는 실측이 아니라 지금 항적으로 계산한 추정값(배경 포함)입니다. 아래 보라 라벨이 국가 측정소의 어제 실측 Lden입니다."><span>' + esc(shortName) + '</span><b>–</b><span class="est">추정</span></div>';
    var m = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'nz-sen' + (s._left ? ' left' : ''), html: html, iconSize: null }), zIndexOffset: 500 }).addTo(S.map);
    m.bindTooltip('<b>' + esc(s.name) + '</b> — 측정기(가정)<br>' + esc(s.note || '') + '<br>배경소음 ' + s.bg + 'dB(A) 추정 · 표고 ' + (s.elev || 0) + 'm', { className: 'nz-tip', direction: 'top', offset: [0, -12] });
    S.sens[s.id] = { s: s, m: m, db: s.bg, target: s.bg };
    var c = document.createElement('div'); c.className = 'nz-card'; c.dataset.id = s.id;
    c.innerHTML = '<div class="fh">선택 지점 집중 모니터링</div>' +                 // 10-29 목업: 누른 카드 = 집중 모니터링 판(.sel)
      '<div class="h"><b>' + esc(s.name) + '</b><small>측정기 · 가정 위치</small><span class="st">–</span></div>' +
      '<div class="big"><b>–</b><span>dB(A) · 모의</span></div>' +
      '<div class="bar"><u style="--p:' + pct(s.bg) + '%" title="배경소음 ' + s.bg + '"></u><i></i></div>' +
      '<div class="sub"><span>배경 ' + s.bg + '</span><span class="pk">10분 최대 –</span></div>' +
      '<div class="why">항공기 영향 없음</div><div class="src">항공기 영향 없음</div><canvas width="320" height="56"></canvas>' +   // .why = 한 줄 요약용 원인(목업 타일)
      '<div class="today"></div><div class="note">' + esc(s.note || '') + '</div>';
    c.onclick = function () { S.map.flyTo([s.lat, s.lon], Math.max(S.map.getZoom(), 14)); };
    $('nzCards').appendChild(c);
    S.cards[s.id] = c;
    S.shown[s.id] = s.bg;
  }
  function pct(db) { return Math.max(0, Math.min(100, (db - 45) / 50 * 100)); }

  /* ── 1초 폴링(실시간) — 리플레이 프레임도 같은 applyFrame 으로 ── */
  function poll() {
    if (S.mode !== 'live') return;
    var my = ++S.seq;
    fetch('/noise/live?apt=' + S.apt, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (my !== S.seq || S.mode !== 'live') return;
      applyFrame(d);
    }).catch(function () { /* 다음 차례 */ }).then(function () { if (my === S.seq && S.mode === 'live') setTimeout(poll, POLL_MS); });
  }
  function applyFrame(d) {
    if (!d || !d.ok) return;
    S.last = d;
    d.sensors.forEach(function (s) {
      var x = S.sens[s.id]; if (!x) return;
      x.target = s.db; x.live = s;
      var h = (S.hist[s.id] = S.hist[s.id] || []);
      if (!h.length || Math.round(d.now) > h[h.length - 1][0]) h.push([Math.round(d.now), s.db]);
      while (h.length > HIST_S) h.shift();
    });
    drawAc(d.ac || []);
    if (window.NoiseLive) NoiseLive.frame(d);                          // 실시간 소음면 — 리플레이 프레임도 같은 길
    if (window.NoiseNational) NoiseNational.frame(d);                  // 국가 측정소 자리의 모형 지금 값
    if (window.NoiseBox) NoiseBox.frame(d);                            // 구역 소음 — 리플레이 시각 따라가기
    if (window.NoiseWx) NoiseWx.frame(d);                              // 바람·구름(METAR) + 소음 영향 안내(noise-wx.js)
    drawLinks(d.sensors);
    events(d.sensors);
    $('nzStat').textContent = '항공기 ' + (d.ac || []).length + ' · 측정기 ' + d.sensors.length + (d.mode === 'replay' ? ' · 리플레이' : d.mode === 'sim' ? ' · 모의' : ' · 실측');
    if (S.follow) {
      var top = d.sensors.slice().sort(function (a, b) { return b.db - a.db; })[0];
      if (top && top.db > top.bg + 5) S.map.panTo([top.lat, top.lon], { animate: true, duration: 0.8 });
    }
  }

  /* ── 리플레이(운영자 10-27 「일별 리플레이」) — 저장된 하루를 /noise/replay?t= 프레임으로 · 배속 · 사건 건너뛰기 ── */
  function rpInit() {
    var today = new Date(), d0 = new Date(today.getTime() - 6 * 86400000);
    $('nzRpDay').value = ymd(today); $('nzRpDay').max = ymd(today); $('nzRpDay').min = ymd(d0);
    $('nzRpBtn').onclick = function () { if (S.mode === 'live') rpOn(); else rpOff(); };
    $('nzRpLive').onclick = rpOff;
    $('nzRpPlay').onclick = function () { if (S.rp.playing) rpPause(); else rpPlay(); };
    $('nzRpSpd').onchange = function () { S.rp.spd = +this.value; };
    $('nzRpPos').oninput = function () { rpSeek(+this.value, true); };
    $('nzRpDay').onchange = function () { rpLoadDay(); };
    $('nzRpNext').onclick = function () {
      var t = S.rp.t, e = S.rp.events.filter(function (x) { return x.t > t + 2; })[0];
      if (e) rpSeek(e.t - rpDay0() - 20, true); else toast('이 날 남은 사건이 없습니다');
    };
    var q = new URLSearchParams(location.search);
    if (q.get('rp')) { $('nzRpDay').value = q.get('rp').slice(0, 10); rpOn(q.get('rp').length > 10 ? q.get('rp').slice(11) : null); }
  }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function rpDay0() { return new Date($('nzRpDay').value + 'T00:00:00').getTime() / 1000; }
  function rpOn(at) {
    S.mode = 'replay'; S.seq++; document.body.classList.add('rp'); $('nzRp').hidden = false; $('nzRpBtn').classList.add('on'); $('nzRpBtn').innerHTML = '<i class="nic" data-ic="replay"></i> 리플레이 중';
    clearAll();
    rpLoadDay(at);
  }
  function rpOff() {
    rpPause(); S.mode = 'live'; document.body.classList.remove('rp'); $('nzRp').hidden = true; $('nzRpBtn').classList.remove('on'); $('nzRpBtn').innerHTML = '<i class="nic" data-ic="replay"></i> 리플레이';
    history.replaceState(null, '', '/noise.html?apt=' + S.apt);
    clearAll(); poll();
  }
  function clearAll() {
    S.hist = {}; clearLinks(); clearRings();
    Object.keys(S.ac).forEach(function (h) { S.ac[h].remove(); }); S.ac = {}; S.pos = {};
    Object.keys(S.sens).forEach(function (id) { S.sens[id].live = null; S.sens[id].target = S.sens[id].s.bg; });
    evKey = ''; $('nzEvents').innerHTML = '';
  }
  function rpLoadDay(at) {
    rpPause();
    var d0 = rpDay0(), d1 = Math.min(d0 + 86400, Date.now() / 1000);
    fetch('/noise/events?apt=' + S.apt + '&from=' + d0 + '&to=' + d1 + '&limit=5000', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      S.rp.events = (d.events || []).sort(function (a, b) { return a.t - b.t; });
      $('nzRpNext').innerHTML = '사건 ' + S.rp.events.length + '건 · 다음 사건 <i class="nic" data-ic="next"></i>';
      var start = at ? (at.split(':').reduce(function (a, v) { return a * 60 + (+v); }, 0)) : (S.rp.events.length ? Math.max(0, S.rp.events[0].t - d0 - 30) : 0);
      rpSeek(start, true);
    });
  }
  function rpSeek(sec, prefill) {
    var d0 = rpDay0(); S.rp.t = d0 + sec; S.rp.wall = Date.now();
    $('nzRpPos').value = Math.round(sec); $('nzRpT').textContent = hhmm(S.rp.t);
    $('nzClock').innerHTML = NIcon('replay') + ' ' + $('nzRpDay').value + ' ' + hhmm(S.rp.t);
    history.replaceState(null, '', '/noise.html?apt=' + S.apt + '&rp=' + $('nzRpDay').value + 'T' + hhmm(S.rp.t));
    if (prefill) {                                                    // 되감기·건너뛰기 — 10분 추이를 저장값으로 미리 채운다
      S.hist = {};
      Object.keys(S.sens).forEach(function (id) {
        fetch('/noise/range?apt=' + S.apt + '&sid=' + id + '&from=' + (S.rp.t - HIST_S) + '&to=' + S.rp.t, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d.ok) return;
          S.hist[id] = (d.points || []).map(function (p) { return [p.t, p.db]; }).concat(S.hist[id] || []).sort(function (a, b) { return a[0] - b[0]; });
        }).catch(function () {});
      });
    }
    rpFrame();
  }
  function rpFrame() {
    var my = ++S.seq, t = S.rp.t;
    return fetch('/noise/replay?apt=' + S.apt + '&t=' + t, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (my !== S.seq || S.mode !== 'replay') return;
      applyFrame(d);
      if (d && !(d.ac || []).length && S.rp.playing && !rpFrame.warned && t - rpDay0() > 60) { rpFrame.warned = true; toast('이 시각에는 저장된 항공기 위치가 없습니다(서버가 꺼져 있었거나 보관 기간 밖)'); }
    }).catch(function () {});
  }
  /* 리플레이 시계 — 타이머 사이에도 이어지는 시각(배속 반영). 항공기 추측항법이 이것을 쓴다(10-29 「리플레이에서 항공기가 점프」: 실시간 1배로 미끄러지다 다음 프레임에 10배 앞으로 튀었다) */
  function rpNow() { return S.rp.t + (S.rp.playing && S.rp.wall ? (Date.now() - S.rp.wall) / 1000 * S.rp.spd : 0); }
  function rpPlay() {
    if (S.rp.playing) return;
    S.rp.playing = true; $('nzRpPlay').innerHTML = '<i class="nic" data-ic="pause"></i>'; rpFrame.warned = false;
    var last = Date.now(); S.rp.wall = last;
    S.rp.timer = setInterval(function () {
      var now = Date.now(), adv = (now - last) / 1000 * S.rp.spd; last = now;
      var sec = S.rp.t - rpDay0() + adv;
      if (sec >= 86399 || S.rp.t + adv > Date.now() / 1000) { rpPause(); return; }
      S.rp.t += adv; S.rp.wall = now;
      $('nzRpPos').value = Math.round(sec); $('nzRpT').textContent = hhmm(S.rp.t); $('nzClock').innerHTML = NIcon('replay') + ' ' + $('nzRpDay').value + ' ' + hhmm(S.rp.t);
      if (!rpFrame.busy) { rpFrame.busy = true; rpFrame().then(function () { rpFrame.busy = false; }); }
    }, S.rp.spd >= 60 ? 400 : 250);
  }
  function rpPause() { S.rp.playing = false; $('nzRpPlay').innerHTML = '<i class="nic" data-ic="play"></i>'; clearInterval(S.rp.timer); S.rp.timer = null; }

  /* 숫자·색은 1초 사이를 보간해 부드럽게(측정값은 서버 1초 표본) */
  /* 10-29 성능 리뷰 — 프레임마다 DOM 을 다시 쓰지 않는다(초당 4,000건 변경 → 바뀐 값만) · 보이지 않는 탭에선 쉰다 */
  function setT(el, v) { if (el && el._t !== v) { el._t = v; el.textContent = v; } }
  function setP(el, k, v) { if (!el) return; var c = el._p || (el._p = {}); if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); } }
  function anim() {
    if (document.hidden) { requestAnimationFrame(anim); return; }
    Object.keys(S.sens).forEach(function (id) {
      var x = S.sens[id], s = x.s;
      x.db += (x.target - x.db) * 0.12;
      if (Math.abs(x.target - x.db) < 0.05) x.db = x.target;
      // 10-29 목업 4번 「체감 등급」 — ~59 평온 · 60~69 주의 · 70+ 경보(절대값 · NoiseBrief.level) · 표지·카드 색도 등급색
      var db = x.db, over = db - s.bg, lv = window.NoiseBrief ? NoiseBrief.level(db) : { k: db >= 70 ? 'bad' : db >= 60 ? 'warn' : 'ok', word: db >= 70 ? '경보' : db >= 60 ? '주의' : '평온', c: db >= 70 ? '#f43f5e' : db >= 60 ? '#f59e0b' : '#10b981' }, c = lv.c;
      var el = x.m.getElement(); if (!el) return;
      setP(el, '--c', c);
      el.classList.toggle('on', db >= 60);                            // 맥동은 주의(60) 이상만 — 평온한 곳은 조용히
      el.classList.toggle('lv-warn', lv.k === 'warn'); el.classList.toggle('lv-bad', lv.k === 'bad');
      // 10-29 운영자 「관측소 애니메이션이 너무 크고 빨라 시선이 그쪽으로만」 — 최대 10배·0.7초 → 최대 3배·2.4초(조용하면 1.6배·3.6초)
      setP(el, '--sc', (1.6 + Math.min(over, 30) / 30 * 1.4).toFixed(1));                  // 고리 크기: 배경 위로 클수록 조금 더 멀리
      setP(el, '--dur', (3.6 - Math.min(over, 30) / 30 * 1.2).toFixed(1) + 's');            // 맥동: 시끄러울수록 조금 빠르게
      var quiet = over < 3;                                             // 항공기 영향이 배경 수준 → 숫자 대신 「–」(배경만 계속 떠 있는 착시 방지 · 10-29)
      el.classList.toggle('quiet', quiet);
      var q1 = x._q || (x._q = { b: el.querySelector('.lbl b'), n: el.querySelector('.dot .n') });
      if (!q1.b || !q1.b.isConnected) { q1.b = el.querySelector('.lbl b'); q1.n = el.querySelector('.dot .n'); }
      setT(q1.b, quiet ? '–' : db.toFixed(0)); setT(q1.n, db.toFixed(0));
      var cd = S.cards[id]; if (!cd) return;
      setP(cd, '--c', c);
      cd.classList.toggle('hot', db >= 60);
      if (cd.dataset.lv !== lv.k) { cd.dataset.lv = lv.k; cd.dataset.label = lv.label; var stEl = cd.querySelector('.st'); if (stEl) stEl.textContent = lv.word; }
      var qc = x._qc || (x._qc = { big: cd.querySelector('.big b'), bar: cd.querySelector('.bar i') });
      setT(qc.big, db.toFixed(1)); setP(qc.bar, '--p', pct(db).toFixed(1) + '%');
      if (x.live && x._seen !== x.live) {                               // 아래(원인·10분 최대·추이)는 새 자료(1초)가 왔을 때만
        x._seen = x.live;
        var pk = x.live.peak10 != null ? x.live.peak10 : Math.max.apply(null, (S.hist[id] || [[0, db]]).map(function (p) { return p[1]; }));
        cd.querySelector('.pk').textContent = '10분 최대 ' + (isFinite(pk) ? pk : db).toFixed(1);
        var top = (x.live.src || []).filter(function (p) { return p.db >= s.bg - 3; });
        var w0 = top[0], why = cd.querySelector('.why');
        if (why) why.textContent = w0 ? (w0.flight || w0.hex) + ' · ' + (PH[w0.phase] || '') + ' ' + (w0.dist / 1000).toFixed(1) + 'km' : '항공기 영향 없음';
        cd.dataset.cause = w0 ? (w0.flight || w0.hex) + ' (' + [w0.type, PH[w0.phase]].filter(Boolean).join(' · ') + ' ' + (w0.dist / 1000).toFixed(1) + 'km) → ' + Math.round(w0.db) + 'dB 기여' : '';
        cd.querySelector('.src').innerHTML = top.length
          ? top.slice(0, 3).map(function (p) { return '<b>' + esc(p.flight || p.hex) + '</b> ' + esc(p.type || CLS[p.cls] || '') + ' <span class="ph">' + (PH[p.phase] || '') + '</span> ' + (p.dist / 1000).toFixed(1) + 'km → <span class="c" style="color:' + color(p.db) + '">' + p.db.toFixed(0) + 'dB</span>'; }).join('<br>')
          : '항공기 영향 없음 — 배경소음 수준(추정 ' + s.bg + 'dB)';
        spark(cd.querySelector('canvas'), S.hist[id] || [], s.bg, x.live);
      }
    });
    Object.keys(S.pos).forEach(function (h) {                       // 소음 고리 중심을 항공기 아이콘(1초 미끄러짐)과 같이 보간
      var p = S.pos[h]; if (!p.tgt) return;
      // 목표 = 서버 위치 + 그 뒤 흐른 시간만큼 진행(최대 6초 · 지상속도·방위) → 현재는 목표로 부드럽게(프레임마다 15%)
      // 리플레이는 흐른 시간 = 리플레이 시계(배속 반영 · 멈추면 0) — 상한도 배속만큼 늘린다(다음 프레임까지 이어지게)
      var rp = S.mode === 'replay' && p.ft != null;
      var dt = rp ? Math.max(0, Math.min(rpNow() - p.ft, 6 + 0.6 * S.rp.spd)) : Math.min((Date.now() - (p.t || 0)) / 1000, 6), est = p.tgt;
      if (p.gs > 1 && p.trk != null && dt > 0) {
        var dk = p.gs * 0.514444 * dt / 1000, b = p.trk * Math.PI / 180;
        est = [p.tgt[0] + dk * Math.cos(b) / 110.574, p.tgt[1] + dk * Math.sin(b) / (111.32 * Math.cos(p.tgt[0] * Math.PI / 180))];
      }
      var k = rp ? 0.3 : 0.15;                                       // 리플레이는 목표가 빨리 움직여 더 바짝 따라간다
      p.cur[0] += (est[0] - p.cur[0]) * k; p.cur[1] += (est[1] - p.cur[1]) * k;
      if (S.ac[h]) S.ac[h].setLatLng(p.cur);
      S.links.forEach(function (k) { if (k.hex === h) k.l.setLatLngs([p.cur, [k.s.lat, k.s.lon]]); });
      var R = S.ring[h]; if (!R) return;
      Object.keys(R).forEach(function (lv) { R[lv].c.setLatLng(p.cur); R[lv].l.setLatLng([p.cur[0], p.cur[1] + R[lv].r / (111320 * Math.cos(p.cur[0] * Math.PI / 180))]); });
    });
    requestAnimationFrame(anim);
  }

  /* ── 소음 고리: 항공기 둘레 지면에서 80/70/60dB 가 되는 반경(서버 rings) — 빨강→연하게, 가장자리에 반경 숫자 ── */
  function drawRings(a) {
    var want = {}, R = S.ring[a.hex] = S.ring[a.hex] || {}, pos = S.pos[a.hex].cur;
    (S.rings ? a.rings || [] : []).forEach(function (r) {
      var lv = r[0], m = r[1]; want[lv] = 1;
      if (!R[lv]) {
        R[lv] = { r: m, c: L.circle(pos, { radius: m, color: RING_C[lv], weight: 1, opacity: 0.55, fillColor: RING_C[lv], fillOpacity: RING_A[lv], className: 'nz-ring', interactive: false }).addTo(S.map),
                  l: L.marker(pos, { icon: L.divIcon({ className: 'nz-ring-lbl', html: '<span style="--c:' + RING_C[lv] + '">' + lv + 'dB ' + (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm') + '</span>', iconSize: null }), interactive: false, zIndexOffset: 300 }).addTo(S.map) };
      } else if (R[lv].r !== m) {
        R[lv].r = m; R[lv].c.setRadius(m); R[lv].l.getElement() && (R[lv].l.getElement().querySelector('span').textContent = lv + 'dB ' + (m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm'));
      }
    });
    Object.keys(R).forEach(function (lv) { if (!want[lv]) { R[lv].c.remove(); R[lv].l.remove(); delete R[lv]; } });
  }
  function clearRings() { Object.keys(S.ring).forEach(function (h) { Object.keys(S.ring[h]).forEach(function (lv) { S.ring[h][lv].c.remove(); S.ring[h][lv].l.remove(); }); }); S.ring = {}; }
  requestAnimationFrame(anim);

  function spark(cv, h, bg, live) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!h.length) return;
    var now = Math.round(Date.now() / 1000), t0 = now - HIST_S;
    var y = function (db) { return H - 4 - Math.max(0, Math.min(1, (db - 45) / 50)) * (H - 8); };
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, y(bg)); ctx.lineTo(W, y(bg)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(245,158,11,.75)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, y(60)); ctx.lineTo(W, y(60)); ctx.stroke(); ctx.setLineDash([]);   // 10-29 목업: 60dB 주의 기준 점선
    [60, 70, 80].forEach(function (v) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.font = '9px monospace'; ctx.fillText(v, 2, y(v) - 1); });
    ctx.beginPath();
    h.forEach(function (p, i) { var px = (p[0] - t0) / HIST_S * W; if (i) ctx.lineTo(px, y(p[1])); else ctx.moveTo(px, y(p[1])); });
    ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5; ctx.stroke();
    ((live && live.events) || []).forEach(function (e) {                                   // 사건(Lmax) 세로선
      var px = (e.t - t0) / HIST_S * W; if (px < 0) return;
      ctx.strokeStyle = color(e.lmax); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(px, 4); ctx.lineTo(px, H - 4); ctx.stroke(); ctx.globalAlpha = 1;
    });
  }

  /* ── 항공기 ── */
  /* 10-28 운영자 「항공기 크기와 콜사인을 같이 · 크기도 이미지와 비슷하게」 — 여객기 실루엣(주황·진한 테두리) · 기종 계열별 크기 · 콜사인 상자 */
  var PLANE = '<svg viewBox="0 0 64 64"><path d="M32 4c2.5 0 4 2.5 4 6v14l22 12v5l-22-6v12l7 5v4l-11-3-11 3v-4l7-5v-12l-22 6v-5l22-12v-14c0-3.5 1.5-6 4-6z"/></svg>';
  var AC_PX = { wide: 50, quad: 52, mil: 42, narrow: 42, prop: 34, helicopter: 32, small: 28, '?': 38 };   // 아이콘 한 변(px) — 계열은 서버가 준다
  function acPx(a) { return Math.round((AC_PX[a.cls] || AC_PX['?']) * (a.alt === 'ground' ? 0.85 : 1)); }
  function acLabel(a) {
    return '<div class="lbl"><b translate="no">' + esc(a.flight || a.reg || a.hex) + '</b><small>' + esc(a.type || CLS[a.cls] || '') + ' · ' + fmtAlt(a.alt) + (a.alt !== 'ground' && a.vr ? (a.vr > 0 ? ' ↗' : ' ↘') : '') + (a.gs != null ? ' · ' + Math.round(a.gs) + 'kt' : '') + '</small></div>';
  }
  function drawAc(list) {
    var seen = {};
    list.forEach(function (a) {
      seen[a.hex] = 1;
      var loud = a.db != null && a.db >= 55, gnd = a.alt === 'ground';
      var cls = 'nz-ac' + (gnd ? ' gnd' : '') + (loud ? ' loud' : '');
      var m = S.ac[a.hex];
      if (!m) {
        m = S.ac[a.hex] = L.marker([a.lat, a.lon], { icon: L.divIcon({ className: cls, html: PLANE + acLabel(a), iconSize: null }), pane: 'nzAc', zIndexOffset: 800 }).addTo(S.map);
        m.on('click', function () { var x = (S.last && S.last.ac || []).filter(function (y) { return y.hex === a.hex; })[0]; if (window.AcCard && x) AcCard.show(x); });   // 기체 카드(10-28)
      } else {
        /* 위치는 anim() 이 매 프레임 보간한다(여기서 바로 옮기면 1초마다 튄다) */
        var el = m.getElement();
        if (el) { el.className = el.className.replace(/\bnz-ac\b[^"]*?(?= leaflet|$)/, '').trim() + ' ' + cls; el.querySelector('.lbl').outerHTML = acLabel(a); }
      }
      var el2 = m.getElement(); if (el2) { el2.style.setProperty('--r', Math.round(a.track || 0) + 'deg'); el2.style.setProperty('--s', acPx(a) + 'px'); }
      if (window.AcCard) AcCard.update(a);                            // 열린 기체 카드의 실시간 칸·진행률
      var p = S.pos[a.hex];
      if (!p) p = S.pos[a.hex] = { cur: [a.lat, a.lon], tgt: [a.lat, a.lon] }; else p.tgt = [a.lat, a.lon];
      p.gs = a.gs || 0; p.trk = a.track; p.t = Date.now();            // 추측항법(anim) — 프레임 사이에도 진행 방향으로 미끄러진다(10-28 「애니메이션 자연스럽게」)
      p.ft = S.mode === 'replay' && S.last ? S.last.now : null;        // 리플레이 프레임 시각(서버가 이 시각까지 보낸 위치)
      drawRings(a);
    });
    Object.keys(S.ac).forEach(function (h) {
      if (seen[h]) return;
      S.ac[h].remove(); delete S.ac[h]; delete S.pos[h];
      if (S.ring[h]) { Object.keys(S.ring[h]).forEach(function (lv) { S.ring[h][lv].c.remove(); S.ring[h][lv].l.remove(); }); delete S.ring[h]; }
    });
  }

  /* ── 기여선: 측정기 ← 항공기(배경보다 큰 기여만) ── */
  function clearLinks() { S.links.forEach(function (k) { k.l.remove(); }); S.links = []; }
  function drawLinks(sens) {
    clearLinks();
    if (!S.lines) return;
    sens.forEach(function (s) {
      (s.src || []).forEach(function (p) {
        if (p.db < s.bg) return;
        var a = (S.last.ac || []).filter(function (x) { return x.hex === p.hex; })[0]; if (!a) return;
        var c = color(p.db), w = 1 + Math.min(Math.max(p.db - s.bg, 0), 30) / 30 * 3;
        var l = L.polyline([[a.lat, a.lon], [s.lat, s.lon]], { color: c, weight: w, opacity: 0.75, dashArray: '6 6', className: 'nz-link' }).addTo(S.map);
        l.bindTooltip('<span style="--c:' + c + '">' + p.db.toFixed(0) + 'dB · ' + (p.dist / 1000).toFixed(1) + 'km</span>', { permanent: true, direction: 'center', className: 'nz-link-lbl', opacity: 1 });
        S.links.push({ l: l, hex: p.hex, s: s });                   // anim() 이 항공기 쪽 끝을 보간 위치로 따라 옮긴다
      });
    });
  }

  /* ── 사건 목록(측정기 전체 합쳐 최근순) ── */
  var evKey = '';
  function events(sens) {
    var all = [];
    sens.forEach(function (s) { (s.events || []).forEach(function (e) { all.push({ s: s, e: e }); }); });
    all.sort(function (a, b) { return b.e.t - a.e.t; });
    var k = all.map(function (x) { return x.s.id + x.e.t + x.e.hex; }).join('|');
    if (k === evKey) return; evKey = k;
    var el = $('nzEvents');
    if (!all.length) { el.innerHTML = '<div class="empty">아직 없음 — 항공기가 측정기 위를 지나면 최대값이 여기에 남습니다(10분 이력).</div>'; return; }
    el.innerHTML = all.slice(0, 20).map(function (x) {
      var e = x.e;
      return '<div class="it" style="--c:' + color(e.lmax) + '"><time>' + hhmm(e.t).slice(0, 5) + '</time><span>' + esc(x.s.name) + ' · <b class="evf">' + esc(e.flight || e.hex) + '</b> ' + esc(e.type || CLS[e.cls] || '') + ' <span class="evp">' + (PH[e.phase] || '') + '</span> ' + (e.dist / 1000).toFixed(1) + 'km</span><b>' + e.lmax.toFixed(0) + 'dB</b></div>';
    }).join('');
  }

  boot();
})();
