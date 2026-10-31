/* 가까운 지점 (2026-10-31 · 운영자 「폰 화면 최적화」 2단계) — 지도 위 단추를 누르면 폰 위치로 가장 가까운 예측 지점을 골라 보여 준다.
 * ⛔ 위치는 이 화면 안에서만 쓴다: 서버로 보내지 않고 저장하지 않는다(noise-terms.html 4절). 지점 목록은 이미 공개된 /noise/sensors.
 *   지도는 noise.js 가 NoiseNear.setMap(S.map) 으로 넘긴다(기체 카드 AcCard.setMap 과 같은 방식). 15km 넘게 떨어져 있으면 고르지 않고 알린다. */
(function () {
  'use strict';
  var map = null, me = null, btn = null, FAR_KM = 15;
  function apt() { var s = document.getElementById('nzApt'); return (s && s.value) || new URLSearchParams(location.search).get('apt') || 'RKSS'; }
  function toast(t) { var el = document.getElementById('nzToast'); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 5000); }
  function km(a, b, c, d) { var R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function dist(k) { return k < 1 ? Math.round(k * 1000) + 'm' : k.toFixed(1) + 'km'; }
  function done() { btn.classList.remove('busy'); btn.disabled = false; }
  function found(la, lo) {
    if (me) me.setLatLng([la, lo]);
    else me = L.circleMarker([la, lo], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(map);
    fetch('/noise/sensors?apt=' + apt(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      done();
      var best = null;
      (d.sensors || []).forEach(function (s) { var k = km(la, lo, s.lat, s.lon); if (!best || k < best.k) best = { s: s, k: k }; });
      if (!best) { toast('이 공항에는 예측 지점이 없습니다.'); map.flyTo([la, lo], 13); return; }
      if (best.k > FAR_KM) { toast('가장 가까운 예측 지점(' + best.s.name + ')이 ' + Math.round(best.k) + 'km 떨어져 있습니다. 공항 주변에서 다시 눌러 보세요.'); map.flyTo([la, lo], 12); return; }
      var c = document.querySelector('#nzCards .nz-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(best.s.id) : best.s.id) + '"]');
      if (c && !c.classList.contains('sel')) c.click();                 // 목록에서 고르기(카드 누름 = 지도 이동도 함께)
      setTimeout(function () { map.flyToBounds(L.latLngBounds([[la, lo], [best.s.lat, best.s.lon]]).pad(0.6), { maxZoom: 15, duration: 0.8 }); }, 60);   // 내 위치와 그 지점이 함께 보이게
      toast('가장 가까운 지점: ' + best.s.name + ' (' + dist(best.k) + ')');
    }).catch(function () { done(); toast('지점 목록을 불러오지 못했습니다. 잠시 뒤 다시 눌러 보세요.'); });
  }
  function go() {
    if (!navigator.geolocation) { toast('이 브라우저는 위치 찾기를 지원하지 않습니다.'); return; }
    btn.classList.add('busy'); btn.disabled = true;
    navigator.geolocation.getCurrentPosition(function (p) { found(p.coords.latitude, p.coords.longitude); }, function (e) {
      done(); toast(e.code === 1 ? '위치 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 위치를 허용하세요.' : '위치를 찾지 못했습니다. 잠시 뒤 다시 눌러 보세요.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  function mount() {
    var st = document.querySelector('.nz-stage'); if (!st || btn) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'nz-near';
    btn.title = '내 위치에서 가장 가까운 예측 지점을 보여 줍니다. 위치는 이 화면 안에서만 쓰고 보내지 않습니다.';
    btn.innerHTML = '<i class="nic" data-ic="target"></i> 가까운 지점';
    btn.onclick = go;
    st.appendChild(btn);
  }
  window.NoiseNear = { setMap: function (m) { map = m; mount(); } };
})();
