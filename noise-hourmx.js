/* AeroNexus Biz 소음 — 측정기 × 시간대(0~23시) 히트표 (2026-10-28 · 서버 noise_heat.hour_matrix 와 짝)
 * 운영자 「시간대별로 어디가 시끄러운지 눈으로」 — 줄 = 측정기, 칸 = 시, 색 = 항공기 Leq(또는 합성 Leq·사건 수). 실시간 지도·대시보드가 같이 쓴다.
 *   NoiseHourMx.mount(el, { apt, sensors, day: () => 'YYYY-MM-DD', dayInput, onPick(sid, h, ctx) }) → { reload() }
 * ⚠ 모의값(항적에서 추정) — 화면에 밝힌다. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /* 시간 Leq 색(히트맵과 같은 눈금) — 45 아래는 비움 */
  var STOPS = [[45, [56, 189, 248]], [50, [34, 197, 94]], [55, [132, 204, 22]], [60, [234, 179, 8]], [65, [249, 115, 22]], [70, [239, 68, 68]], [75, [190, 24, 93]]];
  function rgb(v) {
    if (v <= STOPS[0][0]) return STOPS[0][1];
    for (var i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) { var a = STOPS[i - 1], b = STOPS[i], f = (v - a[0]) / (b[0] - a[0]); return a[1].map(function (x, k) { return Math.round(x + (b[1][k] - x) * f); }); }
    }
    return STOPS[STOPS.length - 1][1];
  }
  var METRIC = {
    // 10-29 운영자 목업 — 지점 × 시간대 표는 세 칸 색 · 리뷰: 문턱은 체감 등급과 같게(70+ 빨강 · 60+ 노랑 · 그 밖 옅은 초록 — 옛 65·58)
    leqa: { name: '항공기 Leq', unit: 'dB', fmt: function (o) { return o.leqa == null ? null : o.leqa; }, col: function (v) { return v < 40 ? null : v >= 70 ? 'rgba(244,63,94,.32)' : v >= 60 ? 'rgba(245,158,11,.27)' : 'rgba(16,185,129,.12)'; } },
    leq: { name: '합성 Leq(배경 포함)', unit: 'dB', fmt: function (o) { return o.leq; }, col: function (v) { return 'rgba(' + rgb(v).join(',') + ',.9)'; } },
    nev: { name: '소음 사건 수', unit: '건', fmt: function (o) { return o.nev || 0; }, col: function (v, mx) { return v ? 'rgba(239,68,68,' + (0.2 + 0.75 * v / (mx || 1)).toFixed(2) + ')' : null; } }
  };

  function mount(el, o) {
    var st = { metric: 'leqa', days: 1, data: null };
    el.classList.add('nhm');
    el.innerHTML = '<div class="nhm-h"><b>시간대별 소음</b><select class="nhm-m" aria-label="지표">' +
      Object.keys(METRIC).map(function (k) { return '<option value="' + k + '">' + METRIC[k].name + '</option>'; }).join('') + '</select>' +
      '<select class="nhm-d" aria-label="기간"><option value="1">그 날</option><option value="7">7일 누적</option><option value="30">30일 누적</option></select><small class="nhm-t"></small></div>' +
      '<div class="nhm-g" role="table" aria-label="측정기 × 시간대 소음"></div><div class="nhm-f"></div>';
    var g = el.querySelector('.nhm-g');
    el.querySelector('.nhm-m').onchange = function () { st.metric = this.value; draw(); };
    el.querySelector('.nhm-d').onchange = function () { st.days = +this.value; load(); };
    if (o.dayInput) o.dayInput.addEventListener('change', load);
    function day() { return (o.day && o.day()) || ymd(new Date()); }
    function load() {
      var d = day();
      fetch('/noise/hourmatrix?apt=' + o.apt + '&day=' + d + '&days=' + st.days, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
        st.data = r; draw();
      }).catch(function () { g.innerHTML = '<div class="nhm-e">불러오지 못했습니다</div>'; });
    }
    function draw() {
      var r = st.data; if (!r || !r.ok) return;
      var M = METRIC[st.metric], mx = 0, best = null;
      el.querySelector('.nhm-t').textContent = (st.days > 1 ? r.day + ' 까지 ' + st.days + '일' : r.day) + ' · 모의';
      o.sensors.forEach(function (s) { ((r.sensors || {})[s.id] || []).forEach(function (c) { var v = M.fmt(c); if (v != null && v > mx) mx = v; }); });
      var html = '<div class="nhm-r nhm-hd"><span></span>' + Array.apply(null, Array(24)).map(function (_, h) { return '<i>' + (h % 3 === 0 ? h : '') + '</i>'; }).join('') + '</div>';
      o.sensors.forEach(function (s) {
        var rows = (r.sensors || {})[s.id] || [];
        html += '<div class="nhm-r"><span title="' + esc(s.name) + '">' + esc(s.name) + '</span>';
        for (var h = 0; h < 24; h++) {
          var c = rows[h], v = c && c.min ? M.fmt(c) : null, col = v == null ? null : M.col(v, mx);
          if (v != null && st.metric !== 'leq' && (!best || v > best.v)) best = { v: v, s: s, h: h };
          var tip = pad(h) + '시 ' + s.name + (c && c.min ? ' — 항공기 Leq ' + (c.leqa == null ? '없음' : c.leqa.toFixed(1)) + ' · 합성 ' + (c.leq == null ? '–' : c.leq.toFixed(1)) + ' · Lmax ' + (c.lmax == null ? '–' : c.lmax.toFixed(0)) + ' · 사건 ' + c.nev + '건 · 자료 ' + c.min + '분' : ' — 자료 없음(서버가 꺼져 있었음)');
          html += '<b class="' + (c && c.min ? '' : 'na') + '" data-s="' + esc(s.id) + '" data-h="' + h + '" title="' + esc(tip) + '"' + (col ? ' style="background:' + col + '"' : '') + '>' +
            (v != null && st.metric === 'nev' ? (v || '') : v != null && v >= 45 ? Math.round(v) : '') + '</b>';
        }
        html += '</div>';
      });
      g.innerHTML = html;
      el.querySelector('.nhm-f').innerHTML = best && best.v ? '가장 시끄러운 칸: <b>' + esc(best.s.name) + ' ' + pad(best.h) + '시</b> (' + (st.metric === 'nev' ? best.v + '건' : best.v.toFixed(1) + 'dB') + ')' + (o.onPick ? ' · 칸을 누르면 지도 히트맵을 그 시간으로' : '') : '항공기 소음이 쌓인 시간이 아직 없습니다';
    }
    g.addEventListener('click', function (e) {
      var b = e.target.closest('b[data-h]'); if (!b || !o.onPick) return;
      var s = o.sensors.filter(function (x) { return x.id === b.dataset.s; })[0];
      o.onPick(s, +b.dataset.h, { day: day(), days: st.days });
    });
    load();
    return { reload: load };
  }
  window.NoiseHourMx = { mount: mount, rgb: rgb };
})();
