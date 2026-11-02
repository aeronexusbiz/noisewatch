/* NoiseWatch 3D 조종석 (noise-cockpit.js · 2026-11-02) — 운영자 「조종석도 실제처럼」.
 * 기장석에서 본 모습을 캔버스 두 장으로: ① 고정(창틀·앞유리 둘·옆창·기둥·천장·글레어실드·FCU·패널 — 크기가 바뀔 때만) ② 계기(PFD·ND·정보 화면·FCU 숫자 — 호출마다).
 * 글래스 콕핏 일반형 배치·색 규약만 따르고 그림·글자는 새로 그린 범용이다(특정 제조사 화면을 베끼지 않는다).
 * 값은 항적에서 온다 — 속도는 지상속도(GS), 자세는 승강률·선회율로 근사한 값이다(실제 기체 자료 아님).
 *   const ck = NoiseCockpit.create(host); ck.show(true|false); ck.draw(state)
 *   state: { gs, alt, vs, hdg, pitch, bank, phase, db, dbColor, dist, sensors: [{x, y, name, db}] (기체 기준 m · x 동 · y 북) }
 *   NoiseCockpit.LOOK_DOWN — 카메라가 내려다볼 각(°) · 글레어실드 윗선이 기수 너머 시야와 맞게 */
(function (root) {
  'use strict';
  const C = { sky: '#1f78d1', gnd: '#8b5a2b', white: '#f2f2f2', green: '#3fe07a', cyan: '#3fd6ff', amber: '#ffb12a', mag: '#ff4fe3', yel: '#ffe14d', tape: '#4c5157', black: '#05070a' };
  const TOP = 0.56;                                  // 글레어실드 윗선(화면 높이 비율)
  const LOOK_DOWN = 8;
  function create(host) {
    const wrap = document.createElement('div'); wrap.className = 'nck'; wrap.hidden = true; wrap.setAttribute('aria-hidden', 'true');
    const cs = document.createElement('canvas'), cd = document.createElement('canvas'); wrap.append(cs, cd); host.appendChild(wrap);
    let W = 0, H = 0, dpr = 1, L = null;
    function lay() {
      const top = H * TOP, gsH = Math.max(46, Math.min(H * 0.11, 70)), pTop = top + gsH + H * 0.02;
      const tab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nm-tab')) || 0;   // 폰 아래 탭바에 가리지 않게
      const s = Math.min(H * 0.27, (H - tab - pTop) - 8, W * 0.94 / 4.5);   // 화면 한 변
      const gap = Math.max(6, (W * 0.96 - 4 * s) / 6), x0 = (W - (4 * s + 3 * gap)) / 2;
      return { top, gsH, pTop, s, pfd: [x0, pTop], nd: [x0 + s + gap, pTop], ew: [x0 + 2 * (s + gap), pTop], nd2: [x0 + 3 * (s + gap), pTop] };
    }
    function resize() {
      const r = host.getBoundingClientRect(); dpr = Math.min(2, root.devicePixelRatio || 1); W = r.width; H = r.height;
      [cs, cd].forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; });
      L = lay(); drawStatic();
    }
    // ── 고정 그림 ──
    function drawStatic() {
      const g = cs.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const fr = '#22272e', fr2 = '#2c323a', top = L.top;
      // 창틀: 전체를 칠하고 창 세 개를 지운다(왼쪽 옆창 · 왼쪽 앞유리 · 오른쪽 앞유리)
      g.fillStyle = fr; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-out';
      const win = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0] * W, p[1] * H) : g.moveTo(p[0] * W, p[1] * H)); g.closePath(); g.fill(); };
      win([[0.0, 0.10], [0.13, 0.07], [0.15, TOP - 0.02], [0.0, TOP - 0.01]]);                            // 옆창
      win([[0.17, 0.06], [0.485, 0.035], [0.49, TOP - 0.035], [0.18, TOP - 0.02]]);                       // 왼쪽 앞유리
      win([[0.515, 0.035], [0.83, 0.06], [0.82, TOP - 0.02], [0.51, TOP - 0.035]]);                       // 오른쪽 앞유리
      win([[0.85, 0.07], [1.0, 0.10], [1.0, TOP - 0.01], [0.855, TOP - 0.02]]);                          // 오른쪽 옆창(일부)
      g.globalCompositeOperation = 'source-over';
      // 창 테두리(고무·금속) · 가운데 기둥 그림자
      g.strokeStyle = '#3a414a'; g.lineWidth = 5;
      [[[0.17, 0.06], [0.485, 0.035], [0.49, TOP - 0.035], [0.18, TOP - 0.02]], [[0.515, 0.035], [0.83, 0.06], [0.82, TOP - 0.02], [0.51, TOP - 0.035]], [[0.0, 0.10], [0.13, 0.07], [0.15, TOP - 0.02]]].forEach(P => {
        g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0] * W, p[1] * H) : g.moveTo(p[0] * W, p[1] * H)); if (P.length > 3) g.closePath(); g.stroke(); });
      const pg = g.createLinearGradient(0.485 * W, 0, 0.515 * W, 0); pg.addColorStop(0, '#2b3038'); pg.addColorStop(0.5, '#3b424b'); pg.addColorStop(1, '#2b3038');
      g.fillStyle = pg; g.beginPath(); g.moveTo(0.485 * W, 0.035 * H); g.lineTo(0.515 * W, 0.035 * H); g.lineTo(0.51 * W, (TOP - 0.03) * H); g.lineTo(0.49 * W, (TOP - 0.03) * H); g.fill();
      // 와이퍼(쉬는 자리)
      g.strokeStyle = '#111418'; g.lineWidth = 4; g.beginPath(); g.moveTo(0.40 * W, (TOP - 0.035) * H); g.lineTo(0.27 * W, (TOP - 0.11) * H); g.stroke();
      g.beginPath(); g.moveTo(0.60 * W, (TOP - 0.035) * H); g.lineTo(0.73 * W, (TOP - 0.11) * H); g.stroke();
      // 글레어실드 — 둥근 턱 + 앞면
      const gs = L.gsH, gy = top;
      const gg = g.createLinearGradient(0, gy - 10, 0, gy + gs); gg.addColorStop(0, '#3a4048'); gg.addColorStop(0.18, '#1d2126'); gg.addColorStop(1, '#16191d');
      g.fillStyle = gg; g.beginPath(); g.moveTo(0, gy + 6); g.quadraticCurveTo(W / 2, gy - 18, W, gy + 6); g.lineTo(W, gy + gs); g.lineTo(0, gy + gs); g.fill();
      // FCU 판(숫자창 넷) · EFIS 단추
      const fx = W * 0.5 - Math.min(W * 0.34, 420), fw = Math.min(W * 0.68, 840), fy = gy + gs * 0.32, fh = gs * 0.56;
      g.fillStyle = '#2a2f36'; rr(g, fx, fy, fw, fh, 5); g.fill();
      L.fcu = [];
      ['SPD', 'HDG', 'ALT', 'V/S'].forEach((t, i) => {
        const cx = fx + fw * (0.08 + i * 0.25), bw = fw * 0.16;
        g.fillStyle = '#c9ced4'; g.font = `600 ${Math.max(8, fh * 0.2)}px system-ui`; g.textAlign = 'center'; g.fillText(t, cx + bw / 2, fy + fh * 0.24);
        g.fillStyle = '#05070a'; rr(g, cx, fy + fh * 0.32, bw, fh * 0.5, 3); g.fill(); L.fcu.push([cx, fy + fh * 0.32, bw, fh * 0.5]);
        for (let k = 0; k < 2; k++) { g.fillStyle = '#4a515a'; g.beginPath(); g.arc(cx + bw + fw * 0.02 + k * fw * 0.025, fy + fh * 0.58, Math.max(2, fh * 0.1), 0, 7); g.fill(); }
      });
      // 계기 패널 바탕
      const pt = L.pTop - H * 0.012; g.fillStyle = '#1b1e23'; g.fillRect(0, gy + gs, W, H - gy - gs);
      g.fillStyle = '#23272d'; g.fillRect(0, pt, W, H - pt);
      [L.pfd, L.nd, L.ew, L.nd2].forEach(p => { g.fillStyle = '#0d0f12'; rr(g, p[0] - 5, p[1] - 5, L.s + 10, L.s + 10, 6); g.fill(); });
      // 패널 단추 줄(장식)
      g.fillStyle = '#353b43'; for (let i = 0; i < 18; i++) { const x = W * 0.03 + i * (W * 0.94 / 18); rr(g, x, H - 14, W * 0.94 / 18 - 6, 8, 2); g.fill(); }
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
    // ── 계기 ──
    function pfd(g, x, y, s, S) {
      g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip(); g.fillStyle = C.black; g.fillRect(x, y, s, s);
      const cx = x + s * 0.5, cy = y + s * 0.46, R = s * 0.3, ppd = R / 14;   // 자세계 · 1° 당 px
      g.save(); g.beginPath(); g.rect(cx - R, cy - R, 2 * R, 2 * R); g.clip();
      g.translate(cx, cy); g.rotate(-(S.bank || 0) * Math.PI / 180); g.translate(0, (S.pitch || 0) * ppd);
      g.fillStyle = C.sky; g.fillRect(-3 * R, -4 * R, 6 * R, 4 * R); g.fillStyle = C.gnd; g.fillRect(-3 * R, 0, 6 * R, 4 * R);
      g.strokeStyle = C.white; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-3 * R, 0); g.lineTo(3 * R, 0); g.stroke();
      g.fillStyle = C.white; g.font = `${Math.max(8, s * 0.035)}px ui-monospace,monospace`; g.textAlign = 'center';
      for (let d = -20; d <= 20; d += 2.5) { if (!d) continue; const w = d % 10 === 0 ? R * 0.42 : d % 5 === 0 ? R * 0.26 : R * 0.12, yy = -d * ppd;
        g.beginPath(); g.moveTo(-w / 2, yy); g.lineTo(w / 2, yy); g.stroke(); if (d % 10 === 0) { g.fillText(Math.abs(d), -w / 2 - 10, yy + 4); g.fillText(Math.abs(d), w / 2 + 10, yy + 4); } }
      g.restore();
      // 경사 눈금 · 지시
      g.strokeStyle = C.white; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R * 0.98, Math.PI * 1.25, Math.PI * 1.75); g.stroke();
      [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].forEach(a => { const t = (a - 90) * Math.PI / 180, l = a % 30 === 0 ? 10 : 6; g.beginPath(); g.moveTo(cx + Math.cos(t) * R * 0.98, cy + Math.sin(t) * R * 0.98); g.lineTo(cx + Math.cos(t) * (R * 0.98 + l), cy + Math.sin(t) * (R * 0.98 + l)); g.stroke(); });
      g.save(); g.translate(cx, cy); g.rotate(-(S.bank || 0) * Math.PI / 180); g.fillStyle = C.yel; g.beginPath(); g.moveTo(0, -R * 0.96); g.lineTo(-6, -R * 0.96 + 10); g.lineTo(6, -R * 0.96 + 10); g.fill(); g.restore();
      // 기체 기호
      g.strokeStyle = C.yel; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - R * 0.6, cy); g.lineTo(cx - R * 0.22, cy); g.lineTo(cx - R * 0.22, cy + 7); g.moveTo(cx + R * 0.6, cy); g.lineTo(cx + R * 0.22, cy); g.lineTo(cx + R * 0.22, cy + 7); g.stroke();
      g.fillStyle = C.yel; g.fillRect(cx - 3, cy - 3, 6, 6);
      // 속도 띠(왼쪽) · 고도 띠(오른쪽) · 승강률
      const tw = s * 0.15, th = R * 2.1, ty = cy - th / 2;
      tape(g, x + s * 0.03, ty, tw, th, S.gs || 0, 10, 40 / 10 * th / 10 / 4 * 2.5, v => v >= 0 ? String(v) : '', 'GS', C.white, false);
      tape(g, x + s * 0.97 - tw, ty, tw, th, S.alt || 0, 100, th / 10 / 100 * 1, v => v >= 0 ? String(v) : '', 'FT', C.white, true);
      g.fillStyle = C.green; g.font = `600 ${Math.max(9, s * 0.045)}px ui-monospace,monospace`; g.textAlign = 'right';
      g.fillText((S.vs > 0 ? '↑' : S.vs < 0 ? '↓' : '') + Math.abs(Math.round((S.vs || 0) / 100) * 100), x + s * 0.97, ty + th + s * 0.06);
      // 방위 띠(아래)
      const hy = y + s * 0.86, hw = s * 0.6, hx = cx - hw / 2, h = S.hdg || 0;
      g.fillStyle = C.tape; g.fillRect(hx, hy, hw, s * 0.08); g.strokeStyle = C.white; g.fillStyle = C.white; g.textAlign = 'center'; g.font = `${Math.max(8, s * 0.04)}px ui-monospace,monospace`;
      for (let d = Math.floor((h - 30) / 5) * 5; d <= h + 30; d += 5) { const px = cx + (d - h) * hw / 60; if (px < hx || px > hx + hw) continue; g.beginPath(); g.moveTo(px, hy); g.lineTo(px, hy + (d % 10 ? 4 : 8)); g.stroke(); if (d % (s < 130 ? 20 : 10) === 0) g.fillText(String(((d % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), px, hy + s * 0.07); }
      g.fillStyle = C.yel; g.fillRect(cx - 1, hy - 3, 2, s * 0.09);
      // 위 줄(단계)
      g.fillStyle = C.green; g.font = `600 ${Math.max(9, s * 0.045)}px system-ui`; g.textAlign = 'center';
      g.fillText(S.phase === 'arr' ? 'APPR' : S.phase === 'dep' ? 'CLB' : S.phase === 'gnd' || S.phase === 'taxi' ? 'TAXI' : 'NAV', x + s * 0.5, y + s * 0.06);
      g.restore();
    }
    function tape(g, x, y, w, h, v, step, pxPer, fmt, unit, col, right) {
      g.fillStyle = C.tape; g.fillRect(x, y, w, h); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      const cy = y + h / 2, ppu = h / (step * 8); g.strokeStyle = C.white; g.fillStyle = C.white; g.font = `${Math.max(8, w * 0.26)}px ui-monospace,monospace`; g.textAlign = right ? 'left' : 'right';
      for (let k = Math.floor((v - step * 5) / step) * step; k <= v + step * 5; k += step) { const yy = cy - (k - v) * ppu; g.beginPath(); g.moveTo(right ? x : x + w, yy); g.lineTo(right ? x + 6 : x + w - 6, yy); g.stroke(); if (k % (step * 2) === 0) g.fillText(fmt(k), right ? x + 9 : x + w - 9, yy + 4); }
      g.restore();
      g.fillStyle = C.black; g.strokeStyle = C.yel; g.lineWidth = 1.5; g.fillRect(x - 2, cy - w * 0.22, w + 4, w * 0.44); g.strokeRect(x - 2, cy - w * 0.22, w + 4, w * 0.44);
      g.fillStyle = C.green; g.textAlign = 'center'; g.font = `700 ${Math.max(9, w * 0.3)}px ui-monospace,monospace`; g.fillText(Math.round(v), x + w / 2, cy + w * 0.11);
      g.fillStyle = C.cyan; g.font = `${Math.max(7, w * 0.2)}px system-ui`; g.fillText(unit, x + w / 2, y - 4);
    }
    function nd(g, x, y, s, S, range) {
      g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip(); g.fillStyle = C.black; g.fillRect(x, y, s, s);
      const cx = x + s / 2, cy = y + s * 0.82, R = s * 0.7, h = (S.hdg || 0) * Math.PI / 180;
      g.strokeStyle = C.white; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
      g.setLineDash([4, 6]); g.beginPath(); g.arc(cx, cy, R / 2, Math.PI * 1.18, Math.PI * 1.82); g.stroke(); g.setLineDash([]);
      g.fillStyle = C.white; g.textAlign = 'center'; g.font = `${Math.max(8, s * 0.04)}px ui-monospace,monospace`;
      for (let d = 0; d < 360; d += 10) { const a = (d * Math.PI / 180) - h; if (Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI) > 0.6) continue;
        const t = a - Math.PI / 2, l = d % 30 ? 6 : 11; g.beginPath(); g.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); g.lineTo(cx + Math.cos(t) * (R - l), cy + Math.sin(t) * (R - l)); g.stroke();
        if (d % 30 === 0) g.fillText(String(d / 10), cx + Math.cos(t) * (R - 20), cy + Math.sin(t) * (R - 20) + 4); }
      // 측정 지점(하늘색) — 기체 기준, 진행 방향 위
      (S.sensors || []).forEach(p => {
        const ex = p.x, ny = p.y, rx = ex * Math.cos(h) - ny * Math.sin(h), ry = ex * Math.sin(h) + ny * Math.cos(h), k = R / range;
        const px = cx + rx * k, py = cy - ry * k; if (py < y + 6 || px < x + 6 || px > x + s - 6 || py > y + s - 6) return;
        g.strokeStyle = p.db >= 60 ? C.amber : C.cyan; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py - 5); g.lineTo(px + 5, py); g.lineTo(px, py + 5); g.lineTo(px - 5, py); g.closePath(); g.stroke();
        if (s >= 130) { g.fillStyle = g.strokeStyle; g.font = `${Math.max(7, s * 0.03)}px system-ui`; g.textAlign = 'left'; g.fillText(p.name + ' ' + (p.db != null ? p.db.toFixed(0) : ''), px + 7, py + 3); }
      });
      g.strokeStyle = C.yel; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx, cy + 10); g.moveTo(cx - 10, cy - 2); g.lineTo(cx + 10, cy - 2); g.moveTo(cx - 5, cy + 8); g.lineTo(cx + 5, cy + 8); g.stroke();
      g.fillStyle = C.green; g.font = `600 ${Math.max(9, s * 0.045)}px ui-monospace,monospace`; g.textAlign = 'left';
      g.fillText('GS ' + Math.round(S.gs || 0), x + 8, y + s * 0.07); g.textAlign = 'right'; g.fillStyle = C.cyan; g.fillText((range / 1000) + 'km', x + s - 8, y + s * 0.07);
      g.fillStyle = C.white; g.textAlign = 'center'; g.fillText(String(Math.round(S.hdg || 0)).padStart(3, '0') + '°', cx, y + s * 0.07);
      g.restore();
    }
    function info(g, x, y, s, S) {                                              // 정보 화면 — 소음 예측(이 서비스의 화면)
      g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip(); g.fillStyle = C.black; g.fillRect(x, y, s, s);
      g.textAlign = 'center'; g.fillStyle = C.cyan; g.font = `600 ${Math.max(9, s * 0.05)}px system-ui`; g.fillText('소음 예측', x + s / 2, y + s * 0.1);
      g.fillStyle = S.dbColor || C.green; g.font = `800 ${Math.max(16, s * 0.2)}px ui-monospace,monospace`; g.fillText(S.db != null ? S.db.toFixed(0) : '–', x + s / 2, y + s * 0.38);
      if (s < 130) { g.fillStyle = C.white; g.font = `${Math.max(8, s * 0.09)}px system-ui`; g.fillText('dB 추정', x + s / 2, y + s * 0.58); g.restore(); return; }   // 폰 — 큰 숫자만
      g.fillStyle = C.white; g.font = `${Math.max(9, s * 0.05)}px system-ui`; g.fillText('dB(A) · 항적 기반 추정', x + s / 2, y + s * 0.47);
      g.textAlign = 'left'; g.font = `${Math.max(9, s * 0.048)}px ui-monospace,monospace`;
      const rows = [['단계', S.phase === 'arr' ? '착륙 접근' : S.phase === 'dep' ? '이륙·상승' : S.phase === 'taxi' || S.phase === 'gnd' ? '지상' : '통과'], ['공항까지', S.dist != null ? (S.dist / 1000).toFixed(1) + ' km' : '–'], ['가까운 지점', S.near || '–']];
      rows.forEach((r, i) => { g.fillStyle = '#94a3b8'; g.fillText(r[0], x + s * 0.08, y + s * (0.62 + i * 0.11)); g.fillStyle = C.green; g.textAlign = 'right'; g.fillText(r[1], x + s * 0.94, y + s * (0.62 + i * 0.11)); g.textAlign = 'left'; });
      g.restore();
    }
    function fcu(g, S) {
      const v = [Math.round(S.gs || 0), String(Math.round(S.hdg || 0)).padStart(3, '0'), Math.round((S.alt || 0) / 100) * 100, (S.vs > 0 ? '+' : '') + Math.round((S.vs || 0) / 100) * 100];
      g.font = `700 ${Math.max(9, L.fcu[0][3] * 0.62)}px ui-monospace,monospace`; g.fillStyle = C.amber; g.textAlign = 'center';
      L.fcu.forEach((r, i) => g.fillText(String(v[i]), r[0] + r[2] / 2, r[1] + r[3] * 0.76));
    }
    function draw(S) {
      if (wrap.hidden || !L) return;
      const g = cd.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      pfd(g, L.pfd[0], L.pfd[1], L.s, S); nd(g, L.nd[0], L.nd[1], L.s, S, 10000); info(g, L.ew[0], L.ew[1], L.s, S); nd(g, L.nd2[0], L.nd2[1], L.s, S, 20000); fcu(g, S);
    }
    new ResizeObserver(() => { if (!wrap.hidden) resize(); }).observe(host);
    return { show(on) { wrap.hidden = !on; if (on) resize(); }, draw, el: wrap };
  }
  root.NoiseCockpit = { create, LOOK_DOWN, TOP };
})(window);
