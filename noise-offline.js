/* AeroNexus 소음 감시 — 「수집 서버 쉬는 중」 안내 (2026-10-29 · 운영자 「맥미니를 끄면 잠시 멈추고 켜면 다시」)
 * 화면(Vercel)은 늘 열리지만 자료(/noise/*·/rwy/flow)는 맥미니 수집 서버가 준다 — 맥이 꺼지면 Vercel 이 5xx·연결 오류를 낸다.
 * 요청을 새로 만들지 않고, 화면이 이미 하는 fetch 의 결과만 본다: 연속 2번 실패 → 띠를 띄우고, 한 번이라도 성공 → 걷는다.
 * ⚠ 4xx(없는 공항·막힌 경로)는 서버가 «살아서» 답한 것이라 실패로 세지 않는다. */
(function () {
  'use strict';
  var WATCH = /^\/(noise\/|rwy\/)/, NEED = 2, fail = 0, el = null, since = 0;
  function path(u) { try { return new URL(typeof u === 'string' ? u : u.url, location.href).pathname; } catch (_) { return ''; } }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function show() {
    if (!since) since = Date.now();
    if (!el) {
      el = document.createElement('div'); el.className = 'nw-off'; el.setAttribute('role', 'status');
      el.innerHTML = '<i class="nic" data-ic="clock"></i><div><b>수집 서버가 잠시 쉬고 있습니다</b><span></span></div>';
      document.body.appendChild(el);
    }
    el.querySelector('span').textContent = hhmm(since) + '부터 새 자료를 받지 못했습니다 · 지금 보이는 값은 마지막으로 받은 것 · 서버가 켜지면 저절로 이어집니다';
    el.hidden = false;
  }
  function ok() { fail = 0; since = 0; if (el) el.hidden = true; }
  var f0 = window.fetch;
  if (!f0) return;
  /* 10-29 성능 리뷰 「탭이 숨겨져도 폴링이 계속」 — 숨은 동안 자료 요청은 보내지 않고 기다린다(폴링이 저절로 멈춤).
   * 다시 보이면 같은 주소의 대기 요청은 하나로 묶어 한 번만 보낸다(돌아왔을 때 몰림 없음). 쓰기(POST)는 기다리지 않는다. */
  var held = {}, wake = [];
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { var w = wake; wake = []; w.forEach(function (f) { f(); }); } });
  function send(self, args) {
    var p = f0.apply(self, args);
    return p.then(function (r) {
      if (r.status >= 500) { if (++fail >= NEED) show(); } else ok();
      return r;
    }, function (e) { if (++fail >= NEED) show(); throw e; });
  }
  window.fetch = function (u, o) {
    var self = this, args = arguments, pa = path(u);
    if (!WATCH.test(pa)) return f0.apply(self, args);
    if (!document.hidden || (o && o.method && o.method !== 'GET')) return send(self, args);
    var k = typeof u === 'string' ? u : u.url;
    if (!held[k]) held[k] = new Promise(function (res) { wake.push(res); }).then(function () { delete held[k]; return send(self, args); });
    return held[k].then(function (r) { return r.clone(); });
  };
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/noise-offline.css?v=1'; document.head.appendChild(css);
  window.NoiseOffline = { show: show, ok: ok };                       // 시험용
})();
