/* AeroNexus Biz 소음 — 바람·구름 판 + 지도 위 바람 흐름 (2026-10-28). 프레임의 wx(biz 서버 wx_for: AeroNexus METAR 중계)를 지도 왼쪽 아래에 보여 주고,
 * 바람이 소음 전달에 주는 영향을 사람 말로 적는다(계산은 서버 몫 — 화면에 계수를 두지 않는다 · 10-29).
 * 지도 위에는 바람이 **가는** 방향으로 흐르는 입자(속도·밀도 = 풍속)를 캔버스로 그린다(운영자 「바람을 지도 위에 표시」). 관측이 공항 METAR 하나라 화면 전체가 같은 바람이다(균일장 · 추정).
 *   NoiseWx.frame(d) — noise.js 가 프레임마다 한 줄. ⚠ 추정값. */
(function () {
  'use strict';
  var W = { el: null, last: null, map: null, cv: null, g: null, parts: [], on: true, raf: 0, t: 0 };
  var DIR = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var COVER = { CLR: '맑음', SKC: '맑음', FEW: '구름 조금', SCT: '구름 많음', BKN: '흐림', OVC: '온흐림', OVX: '시정 장애', CAVOK: '쾌청(CAVOK)' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dirName(d) { return d == null ? '가변' : DIR[Math.round(d / 22.5) % 16]; }
  function mk() {
    if (W.el) return;
    var host = document.getElementById('nzMap'); if (!host) return;
    W.el = document.createElement('div'); W.el.className = 'nzwx'; W.el.hidden = true;
    W.el.innerHTML = '<div class="h"><span class="arr" title="바람이 가는 방향"><i class="nic" data-ic="arrow"></i></span><b class="w">–</b><span class="src"></span><label class="tg" title="지도 위 바람 흐름 켜고 끄기"><input type="checkbox" checked> 흐름</label></div><div class="c"></div><div class="e"></div>';
    host.appendChild(W.el);
    W.el.querySelector('.tg input').onchange = function () { W.on = this.checked; if (!W.on && W.g) W.g.clearRect(0, 0, W.cv.width, W.cv.height); };
    W.cv = document.createElement('canvas'); W.cv.className = 'nzwx-cv'; host.appendChild(W.cv); W.g = W.cv.getContext('2d');
    var fit = function () { W.cv.width = host.clientWidth; W.cv.height = host.clientHeight; W.parts = []; };
    fit(); window.addEventListener('resize', fit);
    W.raf = requestAnimationFrame(tick);
  }
  /* 입자: 화면 좌표(바람이 균일하니 지리 고정이 필요 없다). 밀도 = 풍속 · 속도 = 12 + 풍속×3 px/s · 꼬리 = 속도 비례 */
  function tick(ts) {
    W.raf = requestAnimationFrame(tick);
    var x = W.last, g = W.g; if (!g) return;
    var dt = Math.min((ts - (W.t || ts)) / 1000, 0.1); W.t = ts;
    if (!W.on || !x || x.wd == null || x.ws == null || x.ws < 1) { if (W.parts.length) { g.clearRect(0, 0, W.cv.width, W.cv.height); W.parts = []; } return; }
    var Wd = W.cv.width, H = W.cv.height, to = (x.wd + 180) * Math.PI / 180, ws = Math.min(x.ws, 40);
    var vx = Math.sin(to), vy = -Math.cos(to), spd = 12 + ws * 3, want = Math.round(Math.min(400, 60 + ws * 8) * (Wd * H) / (1400 * 800));
    while (W.parts.length < want) W.parts.push({ x: Math.random() * Wd, y: Math.random() * H, life: Math.random() * 4, max: 2 + Math.random() * 3 });
    if (W.parts.length > want) W.parts.length = want;
    g.clearRect(0, 0, Wd, H);
    g.lineCap = 'round'; g.lineWidth = 1.2;
    var tail = Math.min(26, 6 + ws * 0.6);
    W.parts.forEach(function (p) {
      p.life += dt;
      if (p.life > p.max || p.x < -30 || p.x > Wd + 30 || p.y < -30 || p.y > H + 30) { p.x = Math.random() * Wd; p.y = Math.random() * H; p.life = 0; p.max = 2 + Math.random() * 3; }
      p.x += vx * spd * dt; p.y += vy * spd * dt;
      var a = Math.sin(Math.PI * Math.min(1, p.life / p.max)) * 0.75;
      g.strokeStyle = 'rgba(190,230,255,' + a.toFixed(3) + ')';
      g.beginPath(); g.moveTo(p.x - vx * tail, p.y - vy * tail); g.lineTo(p.x, p.y); g.stroke();
    });
  }
  function frame(d) {
    mk(); if (!W.el) return;
    var x = d && d.wx;
    W.last = x || null;
    if (!x) { W.el.hidden = true; return; }
    W.el.hidden = false;
    var to = x.wd == null ? null : (x.wd + 180) % 360, ws = x.ws == null ? null : Math.round(x.ws);
    var arr = W.el.querySelector('.arr'); arr.style.transform = 'rotate(' + ((to == null ? 0 : to) - 90) + 'deg)'; arr.style.opacity = to == null ? 0.3 : 1;
    W.el.querySelector('.w').textContent = ws == null ? '바람 –' : ws < 1 ? '바람 고요' : '바람 ' + dirName(x.wd) + (x.wd != null ? '(' + x.wd + '°) ' : ' ') + ws + 'kt' + (x.gust ? ' 돌풍 ' + Math.round(x.gust) : '');
    W.el.querySelector('.src').textContent = (x.src || '') + (x.obs ? ' · ' + new Date(x.obs * 1000).toTimeString().slice(0, 5) : '');
    var cl = [];
    if (x.cover) cl.push(COVER[x.cover] || x.cover);
    if (x.ceil_ft != null) cl.push('운고 ' + x.ceil_ft.toLocaleString() + 'ft');
    if (x.temp != null) cl.push('기온 ' + Math.round(x.temp) + '°');
    if (x.visib != null) cl.push('시정 ' + esc(x.visib) + 'SM');
    W.el.querySelector('.c').textContent = cl.join(' · ');
    var ef = [], f = ws == null ? 0 : Math.min(ws * 0.5144, 10) / 10;
    if (f > 0.05 && to != null) ef.push('바람이 부는 쪽(' + dirName(to) + ')으로는 소리가 더 크게, 반대쪽으로는 작게 전달될 수 있음');
    else ef.push('바람 약함 — 보정 없음');
    if (x.ceil_ft != null && x.ceil_ft <= 1500 && x.night) ef.push('낮은 구름이 깔린 밤에는 소리가 멀리 퍼질 수 있음');
    W.el.querySelector('.e').textContent = '소음 영향: ' + ef.join(' · ');
  }
  window.NoiseWx = { frame: frame };
})();
