/*! AeroNexus 3D © 2026 AeroNexus. All rights reserved. [AX3D-e6e4dae10b]
 *  이 파일은 AeroNexus의 저작물입니다. 허락 없이 복제·수정·재배포·역설계하거나 다른 서비스 구현·AI 학습에 쓸 수 없습니다.
 *  Proprietary. Unauthorized copying, modification, redistribution, reverse engineering or use for AI training is prohibited. */
'AX3D-e6e4dae10b';
/* 계류장 차량 감시 — 순수 계산 (features/ramp-watch/ramp-core.js · 2026-10-24 신설, aeronexus-3d 시제품)
 *
 * 운영자 지시(10-24): 「ADS-B 가 없는 지상조업 차량을 운전자 앱 위치로 3D·미니맵에 보이고, 알려 주는 방법」 — 앱은 «있다고 가정».
 * 이 파일은 DOM·three 없이 돈다(node 시험). 화면은 ramp-watch.js(부모 창) · ramp-3d.js(3D iframe 안).
 *
 *   RampCore.toENU / toLL           approach-3d.js 와 같은 식(그 화면 좌표와 1:1)
 *   RampCore.runways(meta)          rkss.json(thr·pairs) → 활주로 [{a,b,A,B,wid,len,u,hdg}] (위경도 + 길이)
 *   RampCore.sim(opts)              가상 차량(앱 위치를 흉내) — step(tSec) → [{id,type,la,lo,spd,hdg,acc,fixT}]
 *   RampCore.alerts(veh, ac, rwys, nowSec, {acStale})  경고 목록 [{id, vid, level:'red'|'orange'|'info', rule, text}]
 *   RampCore.simNow()               가상 차량 시각(초) — 벽시계 기준이라 2D·3D 를 같이 띄우면 같은 자리(10-25)
 *   RampCore.everySec(fn)           1초마다 — 숨긴 탭에서도 늦어지지 않게 Worker 타이머(없으면 setInterval)
 *
 * ⚠ 경고 기준값은 모두 **가정**이다(아래 RULE) — 공항 운영규정·관제 절차의 실제 값은 확인 필요. 화면에 「가정」으로 표시한다.
 * ⚠ 안전 장비가 아니다 — 폰 GPS 는 인증 장비가 아니고, 화면은 «참고용 · 관제 지시가 우선»을 붙인다.
 */
(function (root) {
  'use strict';
  var D2R = Math.PI / 180, KT = 0.514444, NM = 1852;

  var RULE = {
    stripHalf: 90,        // 활주로 보호구역 반폭(m) — 정밀접근 활주로 정지 위치 거리 90m 를 빌린 가정
    stripEnd: 60,         // 활주로 끝 너머(m)
    apchNm: 6,            // 접근 기체로 보는 거리(NM)
    apchFt: 3000,         // 접근 기체 높이 상한(ft, 기압고도)
    apchLatM: 1000,       // 연장 중심선 옆 허용(m)
    apchTrk: 30,          // 진행 방향 허용 각(°)
    rollKt: 30,           // 활주로 위 기체를 «활주 중»으로 부르는 속도(kt) — 이보다 느려도 활주로 위면 위협(정렬·감속 끝, 10-25)
    onRwyFt: 300,         // 공중 표시여도 이 높이(활주로 표고 위 ft) 아래로 활주로 위에 있으면 «활주로 위»(플레어·접지 직후 · 아직 ground 신호 전)
    acStaleSec: 30,       // 항공기 자료가 이보다 오래되면 활주로 판정을 하지 않는다(낡은 자료로 빨강·무경고를 내지 않게)
    aheadDeg: 30,         // 움직이는 항공기 «앞» 각(°)
    aheadSec: 15,         // 몇 초 안에 닿는 거리를 앞으로 보나
    aheadMinM: 60,        // 그래도 최소 이 거리(m)
    taxiKt: 3,            // 움직이는 항공기로 보는 지상 속도(kt)
    lostSec: 60,          // 신호 끊김(초)
    goneSec: 180,         // 이보다 오래면 화면에서 지운다
    speedKmh: 30          // 계류장 제한 속도 가정(km/h)
  };

  function toENU(lat, lon, ref) {
    var m = (lat + ref.lat) * 0.5 * D2R;
    return [(lon - ref.lon) * 111320 * Math.cos(m), (lat - ref.lat) * 110574];
  }
  function toLL(x, y, ref) {
    var lat = ref.lat + y / 110574, m = (lat + ref.lat) * 0.5 * D2R;
    return [lat, ref.lon + x / (111320 * Math.cos(m))];
  }
  function angDiff(a, b) { var d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); }

  /** rkss.json 같은 공항 정보 → 활주로 목록. 좌표는 ref(보통 ARP) 기준 ENU 미터도 함께. */
  function runways(meta) {
    if (!meta || !meta.thr || !Array.isArray(meta.pairs)) return [];
    var ref = { lat: meta.arp[0], lon: meta.arp[1] };
    return meta.pairs.map(function (p) {
      var ta = meta.thr[p[0]], tb = meta.thr[p[1]];
      if (!ta || !tb) return null;
      var A = toENU(ta.lat, ta.lon, ref), B = toENU(tb.lat, tb.lon, ref), dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
      return { a: p[0], b: p[1], ref: ref, A: A, B: B, len: len, u: [dx / len, dy / len], wid: ta.wid || 45,
               hdg: (Math.atan2(dx, dy) / D2R + 360) % 360, la: [ta.lat, ta.lon], lb: [tb.lat, tb.lon], elevFt: (+meta.elev || 0) * 3.28084 };   // meta.elev = m
    }).filter(Boolean);
  }
  /** 점(위경도)을 활주로 축에 투영 — s: 시단 a 에서 축 방향 거리, t: 옆 거리(부호 있음) */
  function project(rw, la, lo) {
    var P = toENU(la, lo, rw.ref), dx = P[0] - rw.A[0], dy = P[1] - rw.A[1];
    return { s: dx * rw.u[0] + dy * rw.u[1], t: dx * rw.u[1] - dy * rw.u[0] };
  }
  function inStrip(rw, la, lo, half) {
    var q = project(rw, la, lo);
    return q.s >= -RULE.stripEnd && q.s <= rw.len + RULE.stripEnd && Math.abs(q.t) <= (half == null ? RULE.stripHalf : half);
  }
  /** 이 활주로를 쓰거나 차지한 기체인가 — {kind:'apch'|'roll'|'on', end, distM} | null
   *  10-25: 활주로 위면 속도와 무관하게 위협(정렬해 선 기체·활주 초기·감속 끝) · 공중 표시여도 낮게 활주로 위에 있으면 같다(플레어·접지 직후) */
  function threatOf(rw, a) {
    if (!a || !isFinite(a.la) || !isFinite(a.lo)) return null;
    var q = project(rw, a.la, a.lo), low = a.ground || (isFinite(a.alt) && a.alt <= (rw.elevFt || 0) + RULE.onRwyFt);
    if (low && q.s >= -RULE.stripEnd && q.s <= rw.len + RULE.stripEnd && Math.abs(q.t) <= rw.wid)
      return { kind: (a.gs || 0) >= RULE.rollKt ? 'roll' : 'on', end: angDiff(a.trk || 0, rw.hdg) < 90 ? rw.a : rw.b, distM: 0 };
    if (a.ground) return null;
    if (!(isFinite(a.alt) && a.alt <= RULE.apchFt) || Math.abs(q.t) > RULE.apchLatM) return null;
    var lim = RULE.apchNm * NM;
    if (q.s < 0 && q.s > -lim && angDiff(a.trk || 0, rw.hdg) <= RULE.apchTrk) return { kind: 'apch', end: rw.a, distM: -q.s };            // a 쪽으로 내려온다
    if (q.s > rw.len && q.s < rw.len + lim && angDiff(a.trk || 0, (rw.hdg + 180) % 360) <= RULE.apchTrk) return { kind: 'apch', end: rw.b, distM: q.s - rw.len };
    return null;
  }
  function fmtNm(m) { return (m / NM).toFixed(1) + 'NM'; }

  /** 경고 판정. veh: [{id,type,la,lo,spd(km/h),hdg,fixT}] · ac: [{hex,cs,la,lo,alt(ft),gs(kt),trk,ground}]
   *  o.acStale: 항공기 자료가 끊겼다 — 활주로 보호구역 안 차량은 «판정 불가» 주황, 진로 앞 판정은 하지 않는다(낡은 자리로 판정하지 않는다) */
  function alerts(veh, ac, rwys, now, o) {
    var out = [], stale = !!(o && o.acStale);
    if (stale) ac = [];
    (veh || []).forEach(function (v) {
      if (!v || !isFinite(v.la) || !isFinite(v.lo)) return;
      var age = now - (v.fixT || now), name = v.id;
      if (age > RULE.goneSec) return;
      if (age > RULE.lostSec) {
        out.push({ id: v.id + ':lost', vid: v.id, level: 'orange', rule: 'lost', text: name + ' 신호 끊김 ' + Math.round(age) + '초 — 마지막 위치' });
        return;                                                    // 끊긴 차량은 다른 판정을 하지 않는다(위치가 낡았다)
      }
      // 들어가 있는 보호구역을 **모두** 본다 — 교차 활주로(제주 07/25×13/31)의 교차점은 두 활주로 다 해당한다(10-25 · 전에는 첫 활주로만 봐 다른 활주로 접근을 놓쳤다)
      var hit = false;
      (rwys || []).forEach(function (rw) {
        if (!inStrip(rw, v.la, v.lo)) return;
        var th = null, k = rw.a + '/' + rw.b;
        (ac || []).forEach(function (a) { var t = threatOf(rw, a); if (t && (!th || t.distM < th.distM)) { th = t; th.cs = a.cs || a.hex; th.gs = a.gs || 0; } });
        hit = true;
        if (th) out.push({ id: v.id + ':rwy:' + k, vid: v.id, level: 'red', rule: 'rwy', ac: th.cs, rwy: [rw.a, rw.b],
                           text: name + ' 활주로 ' + k + ' 보호구역 안 · ' + th.cs + (th.kind === 'roll' ? ' 활주 중' : th.kind === 'on' ? ' 활주로 위(' + Math.round(th.gs) + 'kt)' : ' ' + th.end + ' 접근 ' + fmtNm(th.distM)) });
        else if (stale) out.push({ id: v.id + ':rwyx:' + k, vid: v.id, level: 'orange', rule: 'rwyx', rwy: [rw.a, rw.b], text: name + ' 활주로 ' + k + ' 보호구역 안 · 항공기 자료 끊김(접근 판정 불가)' });
        else out.push({ id: v.id + ':rwyq:' + k, vid: v.id, level: 'orange', rule: 'rwyq', rwy: [rw.a, rw.b], text: name + ' 활주로 ' + k + ' 보호구역 안(접근 기체 없음)' });
      });
      var near = null;
      (ac || []).forEach(function (a) {
        if (!a.ground || !((a.gs || 0) >= RULE.taxiKt) || !isFinite(a.la)) return;
        var ref = { lat: a.la, lon: a.lo }, P = toENU(v.la, v.lo, ref), d = Math.hypot(P[0], P[1]);
        var brg = (Math.atan2(P[0], P[1]) / D2R + 360) % 360, lim = Math.max(RULE.aheadMinM, a.gs * KT * RULE.aheadSec);
        if (d <= lim && angDiff(brg, a.trk || 0) <= RULE.aheadDeg && (!near || d < near.d)) near = { d: d, cs: a.cs || a.hex };
      });
      if (near) out.push({ id: v.id + ':ahead', vid: v.id, level: 'red', rule: 'ahead', ac: near.cs, text: name + ' 지상 이동 중인 ' + near.cs + ' 진로 앞 ' + Math.round(near.d) + 'm' });
      if (!hit && (v.spd || 0) > RULE.speedKmh) out.push({ id: v.id + ':spd', vid: v.id, level: 'info', rule: 'spd', text: name + ' 속도 ' + Math.round(v.spd) + 'km/h (가정 제한 ' + RULE.speedKmh + ')' });
    });
    var rank = { red: 0, orange: 1, info: 2 };
    return out.sort(function (x, y) { return rank[x.level] - rank[y.level] || (x.id < y.id ? -1 : 1); });
  }

  /* ── 가상 차량(앱 위치 흉내) ─────────────────────────────────────────
   *  lines: 지상 항적선(위경도 폴리라인 목록, 실측 rkss-taxi.json 을 바꾼 것) · rwys: runways() · seed: 같은 값이면 같은 움직임(시험)
   *  차량은 선을 따라 왕복한다. 일부러 넣는 장면: ① 활주로 보호구역을 가로지르는 차량 1대 ② 4분에 한 번 80초 동안
   *  신호가 끊기는 차량 1대 ③ 서 있는 차량 몇 대. GPS 오차 흉내로 위치에 ±2m 흔들림. */
  var TYPES = ['tug', 'fuel', 'bag', 'bag', 'bus', 'etc'];
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function pathOf(ll, ref) {
    var P = ll.map(function (p) { return toENU(p[0], p[1], ref); }), S = [0];
    for (var i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P: P, S: S, len: S[S.length - 1] };
  }
  function along(path, d) {
    var S = path.S, P = path.P, i = 1;
    d = Math.max(0, Math.min(path.len, d));
    while (i < S.length - 1 && S[i] < d) i++;
    var k = (d - S[i - 1]) / ((S[i] - S[i - 1]) || 1), x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k;
    return { x: x, y: y, hdg: (Math.atan2(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) / D2R + 360) % 360 };
  }
  function sim(o) {
    o = o || {};
    var R = rng(o.seed || 7), ref = o.ref, n = o.n || 12, cars = [], lines = (o.lines || []).filter(function (l) { return l.length >= 2; });
    // 실측 지상 항적선에는 착륙 활주 구간이 섞여 있다 — 활주로 보호구역 안 점이 15% 넘는 선은 차량 길로 쓰지 않는다(횡단 장면은 아래 ①이 따로 맡는다)
    var inRwy = function (l) { var n = 0; l.forEach(function (p) { if ((o.rwys || []).some(function (r) { return inStrip(r, p[0], p[1]); })) n++; }); return n / l.length; };
    lines = lines.filter(function (l) { return inRwy(l) <= 0.15; });
    var paths = lines.map(function (l) { return pathOf(l, ref); }).filter(function (p) { return p.len >= 250 && p.len <= 4000; });
    paths.sort(function (a, b) { return b.len - a.len; });
    var i;
    for (i = 0; i < n && paths.length; i++) {
      var p = paths[Math.floor(R() * Math.min(paths.length, 40))], type = TYPES[i % TYPES.length];
      cars.push({ id: { tug: 'T', fuel: 'F', bag: 'B', bus: 'P', etc: 'E' }[type] + '-' + (11 + i), type: type, path: p,
                  // 속도 km/h — 한 대(i=5)는 일부러 제한 속도 가정을 넘는다
                  spd: type === 'bus' ? 25 : type === 'fuel' ? 20 : 10 + R() * 16 + (i === 5 ? 12 : 0), off: R() * p.len, park: i % 5 === 4, lossy: i === 2 });
    }
    var rw = (o.rwys || [])[o.crossRwy || 0];
    if (rw) {                                                         // ① 활주로를 가로지르는 차량 — 축 가운데쯤에서 옆으로 250m ↔ 반대편 250m
      var mid = rw.len * 0.42, A = [rw.A[0] + rw.u[0] * mid + rw.u[1] * 260, rw.A[1] + rw.u[1] * mid - rw.u[0] * 260],
          B = [rw.A[0] + rw.u[0] * mid - rw.u[1] * 260, rw.A[1] + rw.u[1] * mid + rw.u[0] * 260];
      var la = toLL(A[0], A[1], rw.ref), lb = toLL(B[0], B[1], rw.ref);
      cars.push({ id: 'T-90', type: 'tug', path: pathOf([la, lb], ref), spd: 18, off: 0, cross: true });
    }
    function step(t) {
      return cars.map(function (c) {
        var d;
        if (c.park) d = c.off;
        else {
          var m = c.spd / 3.6, L = c.path.len, cyc = 2 * L, raw = ((c.off + m * t) % cyc + cyc) % cyc;
          d = raw <= L ? raw : cyc - raw;                               // 왕복
        }
        var q = along(c.path, d), back = !c.park && (((c.off + c.spd / 3.6 * t) % (2 * c.path.len)) > c.path.len);
        var jx = (R() - 0.5) * 4, jy = (R() - 0.5) * 4, ll = toLL(q.x + jx, q.y + jy, ref);
        var fixT = t;
        if (c.lossy) { var ph = t % 240; if (ph > 150 && ph < 230) { fixT = t - (ph - 150); var q0 = along(c.path, d - c.spd / 3.6 * (ph - 150)); ll = toLL(q0.x, q0.y, ref); } }
        return { id: c.id, type: c.type, la: ll[0], lo: ll[1], spd: c.park ? 0 : c.spd, hdg: back ? (q.hdg + 180) % 360 : q.hdg, acc: 3 + R() * 4, fixT: fixT, sim: true };
      });
    }
    return { step: step, cars: cars };
  }

  /** 출도착 현황판(/fcst/board dir=dep) → 지금 주기장에 서 있을 출발편 {주기장 번호: {flt, al, t}}.
   *  근거: 김포 출발 탑승구 번호 = 같은 번호 주기장(운영 DB 지상 정지 점 실측 10-04~10-11 · flight-3d/stand-occ.js 머리말).
   *  고르는 법: 「출발」 이 아니고, 예정(또는 변경) 시각이 지금 −30분 ~ +90분 · 엔진에 그 번호 주기장이 있을 때. 공동운항은 같은 탑승구에 여러 편명 — 탑승구당 첫 편 하나.
   *  ⚠ 도착편은 못 세운다 — 김포 도착 「게이트」(1~5)는 주기장이 아니라 수하물 수취대다(서버 flight3d_stands 는 다음 출발로 찾지만 로그인이 필요). */
  function occFromBoard(rows, ids, nowSec) {
    var have = {}, map = {}, n = 0;
    (ids || []).forEach(function (i) { have[String(i)] = 1; });
    (rows || []).forEach(function (r) {
      if (!r || r.cargo || String(r.remark || '').indexOf('출발') >= 0 || !r.gate) return;
      var g = String(r.gate).toUpperCase(); if (!have[g] || map[g]) return;
      var d = String(r.ed || r.d || ''), hm = String(r.ehm || r.hm || '');
      if (!/^\d{8}$/.test(d) || !/^\d{4}$/.test(hm)) return;
      var t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +hm.slice(0, 2) - 9, +hm.slice(2, 4)) / 1000;   // KST
      if (t < nowSec - 1800 || t > nowSec + 5400) return;
      var id = String(r.id || '').toUpperCase();
      map[g] = { flt: id, al: id.slice(0, 2), t: t, remark: r.remark || '' }; n++;
    });
    return { map: map, n: n };
  }

  /** 이동 흔적 — hist[id] 에 [위도, 경도, 측위 시각] 을 쌓고 keep 초 넘은 것은 버린다. 신호 끊김(같은 측위 시각)은 다시 쌓지 않는다. */
  function trailPush(hist, v, now, keep) {
    if (!v || !isFinite(v.la) || !isFinite(v.lo)) return;
    var h = hist[v.id] || (hist[v.id] = []), last = h[h.length - 1];
    if (!last || v.fixT > last[2]) h.push([v.la, v.lo, v.fixT]);
    while (h.length && h[0][2] < now - (keep || 180)) h.shift();
  }
  /** 흔적 길이(m) */
  function trailLen(h, ref) {
    var d = 0, i, a, b;
    for (i = 1; i < (h || []).length; i++) { a = toENU(h[i - 1][0], h[i - 1][1], ref); b = toENU(h[i][0], h[i][1], ref); d += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return d;
  }

  /** 가상 차량 시각(초) — 2026-01-01 UTC 부터. 화면을 연 시각이 아니라 벽시계라 2D·3D·여러 모니터가 같은 자리를 본다 */
  function simNow() { return (Date.now() - Date.UTC(2026, 0, 1)) / 1000; }
  /** 1초마다 fn — 숨긴 탭은 브라우저가 setInterval 을 1분에 한 번까지 늦춘다(크롬 장시간 숨김). 전용 Worker 의 타이머는 그 제한 밖이라 경고·소리가 늦지 않는다 */
  function everySec(fn) {
    try {
      var w = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},1000)'], { type: 'text/javascript' })));
      w.onmessage = function () { fn(); }; return w;
    } catch (e) { return setInterval(fn, 1000); }
  }

  /** 목록·카드 누르기 — 화면이 1초마다 목록을 다시 그려도 클릭이 사라지지 않게(10-25 실측: 10번 중 6번 놓침).
   *  click 은 누른 요소와 뗀 요소가 다르면(그 사이 다시 그려지면) 목록 전체에 떨어져 항목을 못 찾는다 → 뗀 자리에서 항목을 다시 찾는다.
   *  8px 넘게 움직였으면(끌기·스크롤) 누른 것으로 보지 않는다. 키보드(Enter)는 click(detail 0)으로 받는다. DOM 이 없는 node 시험에서는 부르지 않는다 */
  function tap(el, sel, fn) {
    var d = null;
    el.addEventListener('pointerdown', function (e) { d = [e.clientX, e.clientY]; });
    el.addEventListener('pointercancel', function () { d = null; });
    el.addEventListener('pointerup', function (e) {
      var ok = d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) <= 8; d = null; if (!ok) return;
      var t = document.elementFromPoint(e.clientX, e.clientY), it = t && t.closest && t.closest(sel);
      if (it && el.contains(it)) fn(it, e);
    });
    el.addEventListener('click', function (e) { if (e.detail !== 0) return; var it = e.target.closest && e.target.closest(sel); if (it) fn(it, e); });
  }

  /** 관제탑 음영 안에서 움직이는 차량 — inShadow(v) → true|false|null(모름). 주황 · 끊긴 차량·서 있는 차량은 뺀다(위치가 낡았거나 움직임이 없다) */
  function shadowAlerts(veh, inShadow) {
    var out = [];
    (veh || []).forEach(function (v) { if (!v || v.lost || !(v.spd > 0)) return; if (inShadow(v) === true) out.push({ id: v.id + ':shadow', vid: v.id, level: 'orange', rule: 'shadow', text: v.id + ' 관제탑 음영 안 이동(추정)' }); });
    return out;
  }

  /* ── 실제 차량 위치 원천 (10-25 · 운영자 「화면·기능은 분리, 항적·위치정보는 모두 AeroNexus 에서 수신」) ──
   *  GET /ramp/vehicles?apt=ICAO → { ok, t, items: [{ id, type(tug|fuel|bag|bus|etc), lat, lon, spd(km/h), hdg(°), acc(m), t(epoch 초) }] }
   *  분리 서비스(aeronexus-biz/server.py)가 AeroNexus 에서 받아 그대로 넘긴다. 받은 것이 있으면 가상 차량 대신 쓰고,
   *  없거나(404 — AeroNexus 쪽 수신 API 가 아직 없다) 10초 넘게 끊기면 가상(sim)으로 돌아간다. 실패하면 60초 뒤 다시 묻는다. */
  var FEED = { icao: null, items: null, at: 0, timer: 0 };
  function feedStart(icao) {
    if (typeof fetch === 'undefined' || FEED.icao === icao) return;
    FEED.icao = icao; clearTimeout(FEED.timer);
    (function poll() {
      fetch('/ramp/vehicles?apt=' + encodeURIComponent(icao), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { FEED.items = d && d.ok && Array.isArray(d.items) ? d.items : null; FEED.at = Date.now(); FEED.timer = setTimeout(poll, 1000); })
        .catch(function () { FEED.items = null; FEED.timer = setTimeout(poll, 60000); });
    })();
  }
  /** 받은 실제 차량 → 가상 차량과 같은 모양(fixT = simNow 기준 초). 없으면 null(호출부가 sim 으로) */
  function feedCars() {
    if (!FEED.items || !FEED.items.length || Date.now() - FEED.at > 10000) return null;
    var base = Date.UTC(2026, 0, 1) / 1000;
    return FEED.items.filter(function (v) { return v && v.id && isFinite(v.lat) && isFinite(v.lon); }).map(function (v) {
      return { id: String(v.id), type: TYPES_OK[v.type] ? v.type : 'etc', la: +v.lat, lo: +v.lon, spd: +v.spd || 0, hdg: +v.hdg || 0, acc: +v.acc || 5,
               fixT: (isFinite(v.t) ? +v.t : Date.now() / 1000) - base, sim: false };
    });
  }
  var TYPES_OK = { tug: 1, fuel: 1, bag: 1, bus: 1, etc: 1 };

  /** 공항 이름 — 2D·3D 가 같은 표를 쓴다(10-25 aeronexus-biz 공항 표와 같은 이름 · 화면마다 따로 적지 않는다) */
  var NAME = { RKSI: '인천', RKSS: '김포', RKPC: '제주', RKPK: '김해', RKPU: '울산', RKJY: '여수', RKNY: '양양', RKJB: '무안', RKTL: '울진', RKTU: '청주', RKTN: '대구',
               RKJJ: '광주', RKTH: '포항경주', RKPS: '사천', RKNW: '원주', RKTA: '태안', RKPD: '정석', RKJW: '영암' };

  /** 기상 — 공항 AMOS 관측소(AeroNexus /amos-rt 중계 · biz 가 원천에 직접 가지 않는다). 엔진 approach-3d.js·live-rwy.js 의 AMOS_STN 과 같은 값(바꿀 때 셋 다).
   *  자체 관측이 없는 비행장은 40km 안 가장 가까운 공항 관측을 빌리고(AMOS_NEAR) 화면에 출처·거리를 밝힌다. 태안(RKTA)은 40km 안에 없다 → 「관측 없음」 */
  var AMOS = { RKSI: 113, RKSS: 110, RKPC: 182, RKPK: 153, RKTU: 128, RKTN: 142, RKJJ: 158, RKPU: 151, RKJY: 167, RKNY: 92, RKJB: 163, RKTH: 139, RKPS: 161, RKNW: 118,
               RKTL: 799, RKPD: 182, RKJW: 163 };
  var AMOS_NEAR = { RKPD: ['제주공항', 24], RKJW: ['무안공항', 35] };
  var DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  /** /amos-rt 응답 → { wd(°, 부는 쪽), kt, gust, visM, temp, src } 또는 null. 첫 활주로 끝 값(AMOS 는 m/s → kt) */
  function wxOf(icao, d) {
    if (!d || !d.ok) return null;
    var r = (d.runways || [])[0] || {}, wd = r.wd && r.wd[0], ws = r.ws && r.ws[0], gs = r.ws && r.ws[2], z = (r.zones || [])[0], near = AMOS_NEAR[icao];
    return { wd: isFinite(wd) ? +wd : null, kt: isFinite(ws) ? Math.round(ws * 1.94384) : null, gust: isFinite(gs) ? Math.round(gs * 1.94384) : null,
             visM: z && z.mor && isFinite(z.mor.v) ? +z.mor.v : null, temp: isFinite(d.temp) ? +d.temp : null,
             src: near ? near[0] + ' 관측 ' + near[1] + 'km' : (d.name || '공항') + ' AMOS', dir: isFinite(wd) ? DIR8[Math.round(((+wd % 360) + 360) % 360 / 45) % 8] : '' };
  }
  /** 한 줄 — 「북서 6kt 돌풍 9 · 시정 3.6km · 19°C · 제주공항 관측 24km」 */
  function wxLine(w) {
    if (!w) return '기상 관측 없음(40km 안)';
    var s = w.kt == null ? '바람 자료 없음' : w.kt < 1 ? '바람 고요' : w.dir + ' ' + w.kt + 'kt' + (w.gust != null && w.gust > w.kt + 2 ? ' 돌풍 ' + w.gust : '');
    if (w.visM != null) s += ' · 시정 ' + (w.visM >= 10000 ? '10km+' : w.visM >= 1000 ? (w.visM / 1000).toFixed(1) + 'km' : w.visM + 'm');
    if (w.temp != null) s += ' · ' + Math.round(w.temp) + '°C';
    return s + ' · ' + w.src;
  }

  var api = { NAME: NAME, AMOS: AMOS, AMOS_NEAR: AMOS_NEAR, wxOf: wxOf, wxLine: wxLine, RULE: RULE, feedStart: feedStart, feedCars: feedCars, shadowAlerts: shadowAlerts, simNow: simNow, everySec: everySec, tap: tap, occFromBoard: occFromBoard, trailPush: trailPush, trailLen: trailLen, toENU: toENU, toLL: toLL, runways: runways, project: project, inStrip: inStrip, threatOf: threatOf, alerts: alerts, sim: sim, _along: along, _pathOf: pathOf, _angDiff: angDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RampCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
