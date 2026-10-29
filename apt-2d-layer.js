/* AeroNexus Biz — 공항 2D 도면을 Leaflet 층으로 (2026-10-27). 계류장 2D(ramp-2d.js · 캔버스)가 읽는 **같은 자료**(approach-3d/data/<icao>-aero·-ground·-apron·-osm.json)를
 * 같은 규칙으로 위경도 폴리곤에 올린다 — 운영자 「공항은 기존에 만든 2D 로 대체」. 좌표 변환은 RampCore.toLL(ramp-core.js) 하나.
 *   Apt2D.add(map, icao) → Promise<{group, meta}>  · 어느 공항이든 같은 그림(자료가 없는 층은 그냥 비움 · CLAUDE.md 1항) */
(function () {
  'use strict';
  var C = window.RampCore;
  function j(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function conv(src) {                                               // 파일마다 기준점(ref)·단위(dm) — 위경도로
    var k = src && src.unit === 'dm' ? 0.1 : 1, ref = src && src.ref;
    return function (flat, from) { var o = []; for (var i = from || 0; i + 1 < flat.length; i += 2) o.push(C.toLL(flat[i] * k, flat[i + 1] * k, ref)); return o; };
  }
  function inRing(p, ring) {                                         // 짝홀 규칙(위경도)
    var c = false, x = p[1], y = p[0];
    for (var i = 0, k = ring.length - 1; i < ring.length; k = i++) {
      var a = ring[k], b = ring[i];
      if ((a[0] > y) !== (b[0] > y) && x < (b[1] - a[1]) * (y - a[0]) / ((b[0] - a[0]) || 1e-12) + a[1]) c = !c;
    }
    return c;
  }
  var ST = {                                                         // 도면 색 — 위성 위에 올라가므로 반투명
    ad: { color: '#64748b', weight: 1, opacity: .6, fillColor: '#0f172a', fillOpacity: .3, interactive: false },
    grass: { stroke: false, fillColor: '#166534', fillOpacity: .3, interactive: false },
    apron: { stroke: false, fillColor: '#334155', fillOpacity: .85, interactive: false },
    pave: { stroke: false, fillColor: '#3b4252', fillOpacity: .9, interactive: false },
    bld: { color: '#1e293b', weight: 1, opacity: .9, fillColor: '#94a3b8', fillOpacity: .85, interactive: false },
    osm: { color: '#1e293b', weight: 1, opacity: .8, fillColor: '#a8a29e', fillOpacity: .75, interactive: false },
    twy: { color: '#64748b', weight: 3, opacity: .9, interactive: false },
    lead: { color: '#eab308', weight: 1, opacity: .7, interactive: false },
    rwy: { color: '#cbd5e1', weight: 8, opacity: .95, interactive: false, lineCap: 'butt' },
    rwyc: { color: '#111827', weight: 1, opacity: .9, dashArray: '10 10', interactive: false }
  };
  /* 10-29 운영자 「eAIP 는 공항 주변 활주로 등 기본 정보만 · 상세 유도로 등은 제외」 — 공개 주소에선 비행장 윤곽·활주로·활주로 번호만.
   * 공개 저장소에도 그 두 표(<icao>.json·-aero.json)의 기본 칸만 올라간다(publish-web.sh). 맥 로컬 화면은 전부 그린다. */
  var PUB = (window.NW_PUBLIC != null ? window.NW_PUBLIC : !/^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname) || /[?&]public=1\b/.test(location.search));
  function add(map, icao) {
    var D = '/features/approach-3d/data/' + icao.toLowerCase(), none = Promise.resolve(null);
    return Promise.all([j(D + '.json'), j(D + '-aero.json'), PUB ? none : j(D + '-ground.json'), PUB ? none : j(D + '-apron.json'), PUB ? none : j(D + '-osm.json')]).then(function (r) {
      var meta = r[0], aero = r[1], gr = r[2], ap = r[3], osm = r[4], g = L.layerGroup().addTo(map), ad = [];
      if (PUB && aero) aero = { ref: aero.ref, unit: aero.unit, ad: aero.ad, rwy: aero.rwy };
      if (aero) {
        var ca = conv(aero);
        (aero.ad || []).forEach(function (f) { var ring = ca(f); ad.push(ring); L.polygon(ring, ST.ad).addTo(g); });
        (aero.grass || []).forEach(function (f) { L.polygon(ca(f), ST.grass).addTo(g); });
        (aero.apron || []).forEach(function (f) { L.polygon(ca(f), ST.apron).addTo(g); });
      }
      if (gr) {
        var cg = conv(gr);
        (gr.pave || []).forEach(function (poly) { L.polygon(poly.map(function (ring) { return cg(ring); }), ST.pave).addTo(g); });
      }
      if (aero) {
        var ca2 = conv(aero);
        (aero.twy || []).forEach(function (f) { L.polyline(ca2(f, 1), ST.twy).addTo(g); });                // [폭, x0,y0,…]
        (aero.tl || []).forEach(function (f) { L.polyline(ca2(f, 1), ST.lead).addTo(g); });
        (aero.bld || []).forEach(function (f) { L.polygon(ca2(f), ST.bld).addTo(g); });
      }
      if (ap) {
        var cp = conv(ap);
        (ap.lead || []).forEach(function (l) { L.polyline(cp(l.p), ST.lead).addTo(g); });
        (ap.bld || []).forEach(function (poly) { L.polygon(poly.map(function (ring) { return cp(ring); }), ST.bld).addTo(g); });
      }
      if (gr) {
        var cg2 = conv(gr);
        (gr.bld || []).forEach(function (poly) { L.polygon(poly.map(function (ring) { return cg2(ring); }), ST.bld).addTo(g); });
        if (gr.twr && icao !== 'RKPK') { var tw = cg2(gr.twr)[0]; if (tw) L.circleMarker(tw, { radius: 5, color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: .9, interactive: false }).addTo(g); }
      }
      if (osm && ad.length) {                                        // OSM 건물 [높이dm, 종류, x0,y0,…] 중 비행장 윤곽 안만 — 바깥 동네 건물은 그리지 않는다
        var co = conv(osm);
        (osm.b || []).forEach(function (b) {
          var q = co(b, 2); if (q.length < 3) return;
          var cy = 0, cx = 0; q.forEach(function (p) { cy += p[0]; cx += p[1]; }); cy /= q.length; cx /= q.length;
          if (ad.some(function (ring) { return inRing([cy, cx], ring); })) L.polygon(q, ST.osm).addTo(g);
        });
      }
      if (aero && aero.rwy) {
        var cr = conv(aero);
        aero.rwy.forEach(function (f) { var p = cr(f, 1); L.polyline(p, ST.rwy).addTo(g); L.polyline(p, ST.rwyc).addTo(g); });
      } else if (meta) {                                             // 활주로 자료가 없는 비행장 — 활주로 끝 좌표로 선만
        (meta.pairs || []).forEach(function (p) { var a = meta.thr[p[0]], b = meta.thr[p[1]]; if (a && b) L.polyline([[a.lat, a.lon], [b.lat, b.lon]], ST.rwy).addTo(g); });
      }
      if (meta) {
        Object.keys(meta.thr || {}).forEach(function (k) {
          var t = meta.thr[k];
          L.marker([t.lat, t.lon], { icon: L.divIcon({ className: 'apt2d-rwyn', html: '<div style="color:#fff;font:700 11px/1 monospace;text-shadow:0 0 3px #000,0 0 3px #000;transform:translate(-50%,-50%)">' + k + '</div>', iconSize: null }), interactive: false }).addTo(g);
        });
      }
      return { group: g, meta: meta, has: { aero: !!aero, ground: !!gr, apron: !!ap, osm: !!osm } };
    });
  }
  window.Apt2D = { add: add };
})();
