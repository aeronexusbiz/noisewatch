/* NoiseWatch 3D 보기 (noise-3d.js · 2026-11-02) — 운영자 「소음와치 3D 모드와 항공기도 3D로」 · 「이착륙할 때 소음을 애니메이션화하여 퍼지게」.
 * 장면: /scene3d/<apt>.glb (airport-blender 로 만든 지형·위성·건물·공항 바닥·청사 — 공개 제외 · 맥미니가 낸다).
 * 자료: /noise/live 1초마다(지도 화면과 같은 응답) — 항공기 위치·고도·속도·방향·단계·소음 도달 거리(rings), 측정 지점 값.
 *   이 화면은 서버가 준 값을 그리기만 한다(계산하지 않는다). 항공기는 다음 응답까지 속도·방향으로 이어 그린다(보간).
 * 좌표: glb 와 같이 기준점 REF · x 동 · y 위 · z 남(=−북) · 미터. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// full = 위성 영상을 구운 장면(맥 로컬만 · 공개 제외) · pub = 영상 없는 장면(공개) + 화면이 VWorld 타일을 지형에 입힌다(2D 지도와 같은 중계)
//   sat = 지형 UV 범위(airport-blender rkss-sat-z16.json · 경도 직선 · 위도 메르카토르)
const SCENES = { RKSS: { full: '/scene3d/rkss.glb?v=3', pub: '/scene3d/rkss-pub.glb?v=3', ref: [37.5583, 126.7906], sat: { S: 37.488, W: 126.728, N: 37.604, E: 126.888 } } };
const APT = 'RKSS', SC = SCENES[APT];
const KX = Math.cos(SC.ref[0] * Math.PI / 180) * 111320, KY = 110574;
const enu = (lat, lon) => [(lon - SC.ref[1]) * KX, -(lat - SC.ref[0]) * KY];   // [x, z]
const $ = id => document.getElementById(id);
const lvl = db => (window.NoiseBrief && window.NoiseBrief.level) ? window.NoiseBrief.level(db) : { c: db >= 70 ? '#f43f5e' : db >= 60 ? '#f59e0b' : '#10b981', word: '' };
const WAVE_COL = db => db >= 70 ? 0xef4444 : db >= 65 ? 0xfb923c : 0xfacc15;
const PHASE = { arr: '착륙 접근', dep: '이륙·상승', gnd: '지상', ovr: '통과' };

// ── 렌더러·장면 ──
const cv = $('n3c');
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, logarithmicDepthBuffer: true });
R.setPixelRatio(Math.min(devicePixelRatio, 1.75)); R.toneMapping = THREE.ACESFilmicToneMapping;
const S = new THREE.Scene();
const C = new THREE.PerspectiveCamera(40, 1, 5, 90000);
const ctl = new OrbitControls(C, cv);
Object.assign(ctl, { enableDamping: true, maxPolarAngle: Math.PI * 0.48, minDistance: 40, maxDistance: 30000, screenSpacePanning: false, zoomToCursor: true });
ctl.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
ctl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
function theme() {
  const lt = document.documentElement.dataset.theme === 'light';
  S.background = new THREE.Color(lt ? 0xb9cde0 : 0x9fb6cf); S.fog = new THREE.Fog(lt ? 0xc6d4e2 : 0xaabbcd, 12000, 42000);
}
theme(); new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
S.add(new THREE.HemisphereLight(0xdfe9f5, 0x5a5f4a, 1.4));
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(-35));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.3); sun.position.copy(sunDir).multiplyScalar(8000); S.add(sun);
{ const sky = new Sky(); const u = sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.sunPosition.value.copy(sunDir);
  const pm = new THREE.PMREMGenerator(R), ss = new THREE.Scene(); ss.add(sky); S.environment = pm.fromScene(ss).texture; S.environmentIntensity = 0.5; }
function resize() { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; R.setSize(w, h, false); C.aspect = w / h; C.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ── 시점 ──
const VIEWS = { over: [[5200, 3000, 6200], [-600, 0, -600]], rwy: [[2600, 650, 2300], [-200, 10, -300]], town: [[4300, 280, 3600], [3150, 15, 2350]], top: [[0, 15000, 200], [0, 0, 0]] };
let anim = null, follow = null, fview = 'chase', chDist = 1, chYaw = 0, chPitch = 0.22;   // 뒤따라가기: 거리 배수 · 뒤에서 도는 각 · 내려보는 각   // fview: orbit(주변 돌아보기) · chase(뒤따라가기) · cockpit(조종석)
function go(v, now) {
  const [p, t] = VIEWS[v]; stopFollow();
  document.querySelectorAll('.n3-views button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (now) { C.position.set(...p); ctl.target.set(...t); ctl.update(); return; }
  anim = { t0: performance.now(), p0: C.position.clone(), q0: ctl.target.clone(), p1: new THREE.Vector3(...p), q1: new THREE.Vector3(...t) };
}
function turn(deg) { anim = { t0: performance.now(), arc: deg, off0: C.position.clone().sub(ctl.target) }; }
document.querySelectorAll('.n3-views button').forEach(b => b.onclick = () => go(b.dataset.v));
$('n3L').onclick = () => turn(30); $('n3R').onclick = () => turn(-30);
$('n3Spin').onclick = e => { ctl.autoRotate = !ctl.autoRotate; ctl.autoRotateSpeed = 0.6; e.currentTarget.setAttribute('aria-pressed', String(ctl.autoRotate)); };
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === 'ArrowLeft') turn(15); if (e.key === 'ArrowRight') turn(-15); if (e.key === 'Escape') stopFollow(); });

// ── 장면 불러오기 ──
const ground = [];                                   // 높이 재기(광선)용 — 지형·공항 바닥
const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0);
function groundAt(x, z) {
  if (!ground.length) return 10;
  ray.set(new THREE.Vector3(x, 3000, z), DOWN); const h = ray.intersectObjects(ground, false);
  return h.length ? h[0].point.y : 10;
}
const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
const LOCAL = /^(127\.|localhost$|192\.168\.|10\.)/.test(location.hostname) && !new URLSearchParams(location.search).has('pub');   // ?pub=1 — 로컬에서 공개 장면 시험
// 지형에 위성 타일 입히기(공개 장면) — 같은 출처 /vworld/ 중계라 캔버스가 오염되지 않는다 · 폰은 한 단계 낮게 · 동시 8장
function liveSat(mesh) {
  const B = SC.sat, Z = matchMedia('(pointer: coarse)').matches ? 14 : 15;
  const tx = lon => (lon + 180) / 360 * 2 ** Z, ty = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z; };
  const x0 = Math.floor(tx(B.W)), x1 = Math.floor(tx(B.E)), y0 = Math.floor(ty(B.N)), y1 = Math.floor(ty(B.S));
  const ox = (tx(B.W) - x0) * 256, oy = (ty(B.N) - y0) * 256;
  const cvs = document.createElement('canvas'); cvs.width = Math.round((tx(B.E) - tx(B.W)) * 256); cvs.height = Math.round((ty(B.S) - ty(B.N)) * 256);
  const g = cvs.getContext('2d'); g.fillStyle = '#6b7b5e'; g.fillRect(0, 0, cvs.width, cvs.height);
  const tex = new THREE.CanvasTexture(cvs); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = R.capabilities.getMaxAnisotropy();
  const m = mesh.material; m.map = tex; m.color.set(0xffffff); m.roughness = 1; m.metalness = 0; m.needsUpdate = true;
  const q = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) q.push([x, y]);
  const c = [(x0 + x1) / 2, (y0 + y1) / 2]; q.sort((a, b) => Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1]));   // 공항 가운데부터
  let dirty = false, live = 0;
  const tick = setInterval(() => { if (dirty) { tex.needsUpdate = true; dirty = false; } if (!q.length && !live) clearInterval(tick); }, 400);
  const next = () => {
    const t = q.shift(); if (!t) return; live++;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { g.drawImage(im, (t[0] - x0) * 256 - ox, (t[1] - y0) * 256 - oy); dirty = true; live--; next(); };
    im.onerror = () => { live--; next(); };
    im.src = '/vworld/Satellite/' + Z + '/' + t[1] + '/' + t[0] + '.jpeg';
  };
  for (let i = 0; i < 8; i++) next();
}
function loadScene(url, pub) {
loader.load(url, g => {
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(m => { if (m.map) { m.map.anisotropy = R.capabilities.getMaxAnisotropy(); m.map.colorSpace = THREE.SRGBColorSpace; } });
    if (/^(airfield|landside)/.test(o.name)) { o.position.y += o.name.startsWith('airfield') ? 1.6 : 0.9;   // 지형과 0.3m 차이는 멀리서 깊이가 모자라 위성 가림 얼룩이 비쳤다(11-02)
      ms.forEach(m => { m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = o.name.startsWith('airfield') ? -3 : -2; }); o.renderOrder = o.name.startsWith('airfield') ? 2 : 1; }
    if (o.name === 'terrain') { ground.push(o); if (pub) liveSat(o); }
  });
  S.add(g.scene); $('n3Load') && $('n3Load').remove(); sensorsPlace();
}, x => { if (x.total && $('n3Pct')) $('n3Pct').textContent = Math.round(x.loaded / x.total * 100) + '%'; },
() => {
  if (!pub) { loadScene(SC.pub, true); return; }                               // 로컬에 영상 장면이 없으면 공개 장면으로
  $('n3Load').textContent = '배경 지도 없이 평면 위에 그리는 중입니다'; $('n3Load').classList.add('n3-chip');
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x6b7b5e }));
  pl.rotation.x = -Math.PI / 2; pl.position.y = 10; S.add(pl); ground.push(pl); sensorsPlace();
});
}
loadScene(LOCAL ? SC.full : SC.pub, !LOCAL);

// ── 조절판 접기(폰은 접고 시작 · 고른 것은 이 브라우저에만 기억) ──
{
  const P = $('n3Panel'), F = $('n3Fold'); let st = null;
  try { st = localStorage.getItem('nw.n3.fold'); } catch (e) { /* 저장소 막힘 */ }
  const set = f => { P.classList.toggle('folded', f); F.setAttribute('aria-expanded', String(!f)); F.textContent = f ? '조절판 펼치기' : '조절판 접기'; };
  set(st ? st === '1' : matchMedia('(max-width: 600px)').matches);
  F.onclick = () => { const f = !P.classList.contains('folded'); set(f); try { localStorage.setItem('nw.n3.fold', f ? '1' : '0'); } catch (e) { /* 무시 */ } };
}

// ── 글자판(화면 크기 고정 스프라이트) ──
function label(lines, col) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 26;
  g.font = `700 ${fs}px system-ui, "Apple SD Gothic Neo", sans-serif`;
  const w = Math.ceil(Math.max(...lines.map(t => g.measureText(t).width))) + 34, h = lines.length * (fs + 8) + 14;
  c.width = w; c.height = h; g.font = `700 ${fs}px system-ui, "Apple SD Gothic Neo", sans-serif`;
  g.fillStyle = 'rgba(11,15,23,.82)'; g.beginPath(); g.roundRect(0, 0, w, h, 10); g.fill();
  g.fillStyle = col; g.fillRect(0, 0, 8, h);
  g.fillStyle = '#f1f5f9'; lines.forEach((t, i) => g.fillText(t, 20, 10 + fs + i * (fs + 8) - 4));
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, sizeAttenuation: false, depthTest: false, transparent: true }));
  const k = 0.00042; sp.scale.set(w * k, h * k, 1); sp.center.set(0, 0); sp.renderOrder = 10; return sp;
}
function setLabel(o, lines, col) {
  const key = lines.join('|') + col; if (o.lbKey === key) return; o.lbKey = key;
  if (o.lb) { o.lb.material.map.dispose(); o.lb.material.dispose(); o.root.remove(o.lb); }
  o.lb = label(lines, col); o.root.add(o.lb);
}

// ── 항공기 ──
const SIZE = { small: 0.6, narrow: 1, wide: 1, heavy: 1.12, heli: 0.4 };   // 실사형 모형은 실제 치수(협동체 37.6m · 광동체 62.8m) — 그 비율
// 실사형 기체(airport-blender/scenes/aircraft.py → /scene3d/aircraft.glb · 자체 제작 범용 도장) — 못 받으면 아래 간이 모형
//   노드 ac_narrow·ac_wide ─ *_body · *_gear · 재질 ac_tail(단계 색) · 원점 = 주 착륙장치 접지점 · eye = 조종석 눈 [앞 m, 위 m]
const ACT = { narrow: null, wide: null }, EYE = { narrow: [16.6, 4.4], wide: [29.4, 6.3] };
loader.load('/scene3d/aircraft.glb?v=1', g => {
  ['narrow', 'wide'].forEach(k => { const n = g.scene.getObjectByName('ac_' + k); if (n) { n.position.set(0, 0, 0); ACT[k] = n; } });
  ACS.forEach(o => swapModel(o));                                               // 먼저 나온 항공기도 실사형으로
});
function famOf(cls) { return cls === 'wide' || cls === 'heavy' ? 'wide' : 'narrow'; }
const bodyM = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.3 });
const tailM = { arr: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 }), dep: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }), other: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 }) };
const G = {
  fus: new THREE.CylinderGeometry(2, 2, 34, 16).rotateX(Math.PI / 2),
  nose: new THREE.SphereGeometry(2, 16, 10).scale(1, 1, 2).translate(0, 0, -17),
  cone: new THREE.ConeGeometry(2, 7, 16).rotateX(-Math.PI / 2).translate(0, 0.4, 20),
  wing: (() => { const s = new THREE.Shape([new THREE.Vector2(0, 2), new THREE.Vector2(17, 7.5), new THREE.Vector2(17, 9.5), new THREE.Vector2(0, 8)]); const a = new THREE.ShapeGeometry(s); const b = a.clone().scale(-1, 1, 1); return [a, b].map(q => q.rotateX(Math.PI / 2).translate(0, -0.8, -3)); })(),
  fin: (() => { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(6, 0), new THREE.Vector2(8, 7), new THREE.Vector2(5, 7)]); return new THREE.ShapeGeometry(s).rotateY(Math.PI / 2).translate(0, 1.5, 15); })(),
  stab: (() => { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(6.5, 2.5), new THREE.Vector2(6.5, 4), new THREE.Vector2(0, 3.5)]); const a = new THREE.ShapeGeometry(s); const b = a.clone().scale(-1, 1, 1); return [a, b].map(q => q.rotateX(Math.PI / 2).translate(0, 0.8, 15)); })(),
  eng: new THREE.CylinderGeometry(1.1, 1.1, 4, 12).rotateX(Math.PI / 2)
};
const tailReal = {};
function plane(phase, cls) {
  const T = ACT[famOf(cls)];
  if (T) {
    const g = T.clone(true), ph = phase in tailM ? phase : 'other';
    g.traverse(m => {
      if (!m.isMesh) return; m.castShadow = false; m.userData.pick = true;
      if (m.material && m.material.name === 'ac_tail') { if (!tailReal[ph]) { tailReal[ph] = m.material.clone(); tailReal[ph].color.copy(tailM[ph].color); } m.material = tailReal[ph]; }
      if (/_gear$/.test(m.name)) g.userData.gear = m;
    });
    g.userData.real = famOf(cls); return g;
  }
  const g = new THREE.Group(), tm = tailM[phase] || tailM.other;
  [G.fus, G.nose, G.cone].forEach(q => g.add(new THREE.Mesh(q, bodyM)));
  G.wing.forEach(q => { const m = new THREE.Mesh(q, bodyM); m.material.side = THREE.DoubleSide; g.add(m); });
  G.stab.forEach(q => g.add(new THREE.Mesh(q, bodyM)));
  const fin = new THREE.Mesh(G.fin, tm); fin.material.side = THREE.DoubleSide; g.add(fin);
  [-6.5, 6.5].forEach(x => { const e = new THREE.Mesh(G.eng, bodyM); e.position.set(x, -1.8, -4); g.add(e); });
  g.traverse(m => { if (m.isMesh) m.userData.pick = true; });
  return g;
}
const ACS = new Map(), lineM = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
function acObj(a) {
  let o = ACS.get(a.hex);
  if (!o) {
    o = { hex: a.hex, root: new THREE.Group(), trail: [], lastTrail: 0, pos: null, wavesAt: 0 };
    o.cls = a.cls; o.model = plane(a.phase, a.cls); o.root.add(o.model); o.model.traverse(m => { m.userData.hex = a.hex; });
    o.drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineM); S.add(o.drop);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(180 * 3), 3)); tg.setDrawRange(0, 0);
    o.trailLine = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: a.phase === 'dep' ? 0xfb923c : 0x7dd3fc, transparent: true, opacity: 0.8 })); o.trailLine.frustumCulled = false; S.add(o.trailLine);
    S.add(o.root); ACS.set(a.hex, o);
  }
  if (o.phase !== a.phase) { const first = o.phase == null; o.phase = a.phase; if (!first) swapModel(o); }
  return o;
}
function swapModel(o) {                                                         // 모형 바꿔 끼우기(실사형 도착 · 단계가 바뀌어 꼬리 색)
  const sc = o.model.scale.x, rot = o.model.rotation.clone(), vis = o.model.visible;
  o.root.remove(o.model); o.model = plane(o.phase, o.cls); o.model.scale.setScalar(sc); o.model.rotation.copy(rot); o.model.visible = vis;
  o.model.traverse(m => { m.userData.hex = o.hex; }); o.root.add(o.model);
}
function dropAc(o) { if (follow === o.hex) stopFollow(); S.remove(o.root); S.remove(o.drop); S.remove(o.trailLine); if (o.lb) { o.lb.material.map.dispose(); o.lb.material.dispose(); } o.trailLine.geometry.dispose(); o.drop.geometry.dispose(); ACS.delete(o.hex); }

// ── 소음 퍼짐(이착륙 중 · 서버가 준 rings = [[dB, 그 dB 가 닿는 거리 m], …]) ──
const sphG = new THREE.SphereGeometry(1, 40, 20), ringG = new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2);
const WAVES = []; const WAVE_T = 6.0, WAVE_EVERY = 2.2;   // 11-02 운영자 「조금 더 슬로우로」 — 한 번 퍼지는 데 6초 · 2.2초마다
function spawnWave(o) {
  const rings = (o.d.rings || []).filter(r => r && r[1] > 30).sort((a, b) => b[0] - a[0]).slice(0, 3);
  if (!rings.length) return;
  const g = groundAt(o.pos.x, o.pos.z);
  rings.forEach(([db, r], i) => {
    const col = WAVE_COL(db);
    const sph = new THREE.Mesh(sphG, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    sph.position.copy(o.pos); ring.position.set(o.pos.x, g + 4 + i, o.pos.z); sph.renderOrder = 4; ring.renderOrder = 5;
    S.add(sph); S.add(ring); WAVES.push({ t0: performance.now() / 1000 + i * 0.12, r, h: o.pos.y - g, sph, ring });
  });
}
function stepWaves(now) {
  for (let i = WAVES.length - 1; i >= 0; i--) {
    const w = WAVES[i], k = (now - w.t0) / WAVE_T;
    if (k < 0) continue;
    if (k >= 1 || !$('n3Wave').checked) { S.remove(w.sph); S.remove(w.ring); w.sph.material.dispose(); w.ring.material.dispose(); WAVES.splice(i, 1); continue; }
    const e = 1 - Math.pow(1 - k, 1.6), rad = Math.max(1, w.r * e), fade = (1 - k);
    w.sph.scale.setScalar(rad); w.sph.material.opacity = 0.10 * fade;
    const gr = rad > w.h ? Math.sqrt(rad * rad - w.h * w.h) : 0;          // 땅에 닿은 원(경사 거리 → 지면 반경)
    w.ring.visible = gr > 5; w.ring.scale.setScalar(Math.max(1, gr)); w.ring.material.opacity = 0.85 * fade;
  }
}

// ── 측정 지점 ──
const SEN = new Map(); let senData = [];
const poleG = new THREE.CylinderGeometry(2.2, 2.2, 90, 10).translate(0, 45, 0), headG = new THREE.SphereGeometry(16, 20, 14);
function sensorsPlace() {
  senData.forEach(s => {
    let o = SEN.get(s.id);
    const [x, z] = enu(s.lat, s.lon), y = groundAt(x, z);
    if (!o) {
      o = { root: new THREE.Group(), head: new THREE.Mesh(headG, new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.6 })) };
      o.root.add(new THREE.Mesh(poleG, new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 }))); o.head.position.y = 100; o.root.add(o.head);
      S.add(o.root); SEN.set(s.id, o);
    }
    o.root.position.set(x, y, z);
    const L = lvl(s.db), col = new THREE.Color(L.c);
    o.head.material.color.copy(col); o.head.material.emissive.copy(col); o.loud = s.db >= 60;
    setLabel(o, [s.name, (s.db != null ? s.db.toFixed(1) + ' dB' : '–') + (L.word ? ' · ' + L.word : '')], L.c); o.lb.position.y = 125;
    o.root.visible = $('n3Sen').checked;
  });
}

// ── 자료 ──
let lastData = 0;
function pull() {
  fetch('/noise/live?apt=' + APT, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.ok) return;
    if (d.now && pull.last && d.now <= pull.last) return;            // 공개 경로(CDN)에서 예전 응답이 늦게 섞여 온다 — 서버 시각이 거꾸로면 버린다
    if (d.now) pull.last = d.now;
    const now = performance.now() / 1000; lastData = now;
    senData = d.sensors || []; sensorsPlace();
    const seen = new Set();
    (d.ac || []).forEach(a => {
      if (a.lat == null || a.lon == null) return;
      seen.add(a.hex); const o = acObj(a); o.d = a; o.t = now;
      const [x, z] = enu(a.lat, a.lon), gy = groundAt(x, z);
      const y = (a.alt == null || a.alt === 'ground') ? gy + 1.8 : Math.max(gy + 1.8, a.alt * 0.3048);   // 공항 바닥층(+1.6m) 위
      o.obs = new THREE.Vector3(x, y, z); if (!o.pos) o.pos = o.obs.clone();
      // 11-02 운영자 「앞뒤로 버벅인다」 — 서버 위치는 수신이 몇 초씩 늦거나 같은 값이 되풀이된다. 바뀐 점만 쌓아 두고 조금 늦게(약 3초) 그 사이를 잇는다(앞뒤 튐 없음)
      o.smp = o.smp || []; const last = o.smp[o.smp.length - 1];
      const back = last && a.alt !== 'ground' && a.gs > 60 && ((o.obs.x - last.p.x) * Math.sin((a.track || 0) * Math.PI / 180) - (o.obs.z - last.p.z) * Math.cos((a.track || 0) * Math.PI / 180)) < -5;   // 진행 반대로 물러난 점은 버린다
      if (!back && (!last || last.p.distanceToSquared(o.obs) > 0.25)) { o.smp.push({ t: now, p: o.obs.clone() }); if (o.smp.length > 12) o.smp.shift(); }
      const big = $('n3Big').checked ? 3 : 1; o.model.scale.setScalar((SIZE[a.cls] || 1) * big);
      setLabel(o, [(a.flight || a.hex).trim() + (a.type ? ' · ' + a.type : ''), (PHASE[a.phase] || '') + (a.alt != null && a.alt !== 'ground' ? ' · ' + Math.round(a.alt * 0.3048).toLocaleString() + ' m' : ' · 지상') + (a.db != null ? ' · ' + a.db.toFixed(0) + ' dB' : '')], lvl(a.db || 0).c);
      o.lb.position.set(0, 40 * big * (SIZE[a.cls] || 1) / 3 + 30, 0);
    });
    ACS.forEach(o => { if (!seen.has(o.hex) && now - o.t > 15) dropAc(o); });
    list();
  }).catch(() => {});
}
setInterval(pull, 1000); pull();
setInterval(() => { const t = new Date(); $('n3Clock') && ($('n3Clock').textContent = t.toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' }) + ' KST'); }, 1000);

// ── 목록·따라가기 ──
function list() {
  const arr = [...ACS.values()].filter(o => o.d).sort((a, b) => (a.d.dist || 9e9) - (b.d.dist || 9e9));
  const el = $('n3List');
  if (!arr.length) { el.innerHTML = '<h3>지금 보이는 항공기</h3><p class="n3-empty">공항 주변에 항공기가 없습니다. 들어오면 자동으로 나타납니다.</p>'; return; }
  el.innerHTML = '<h3>지금 보이는 항공기 ' + arr.length + '대 · 누르면 따라갑니다</h3>' + arr.map(o => {
    const a = o.d, L = lvl(a.db || 0);
    return `<button type="button" class="n3-ac${follow === o.hex ? ' on' : ''}" data-hex="${a.hex}"><span><b translate="no">${esc((a.flight || a.hex).trim())}</b> ${esc(a.type || '')}</span><span class="db" style="color:${L.c}">${a.db != null ? a.db.toFixed(0) + ' dB' : ''}</span><small>${PHASE[a.phase] || ''} · ${a.alt != null && a.alt !== 'ground' ? Math.round(a.alt * 0.3048).toLocaleString() + ' m' : '지상'} · ${a.dist != null ? (a.dist / 1000).toFixed(1) + ' km' : ''}</small></button>`;
  }).join('');
  el.querySelectorAll('.n3-ac').forEach(b => b.onclick = () => startFollow(b.dataset.hex));
}
function markList() { document.querySelectorAll('.n3-ac').forEach(b => b.classList.toggle('on', b.dataset.hex === follow)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function startFollow(hex) {
  const o = ACS.get(hex); if (!o || !o.pos) return;
  if (follow && follow !== hex) { const p = ACS.get(follow); if (p) { p.model.visible = true; if (p.lb) p.lb.visible = true; } }
  follow = hex; markList(); anim = null; o.hdg = null; setFview(fview);
  if (matchMedia('(max-width: 600px)').matches && !$('n3Panel').classList.contains('folded')) $('n3Fold').click();   // 폰: 고르면 조절판을 접어 화면을 비운다
}
function setFview(v) {
  fview = v; const o = follow && ACS.get(follow);
  document.querySelectorAll('#n3FBar [data-f]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === v)));
  $('n3FFar').hidden = $('n3FNear').hidden = v !== 'chase';
  ctl.enabled = v === 'orbit'; C.fov = v === 'cockpit' ? 62 : 40; C.updateProjectionMatrix(); $('n3Ck').hidden = !(o && v === 'cockpit');
  if (o && v === 'cockpit' && !$('n3Panel').classList.contains('folded')) $('n3Fold').click();   // 창틀이 조절판을 가리지 않게 접는다
  if (o) { o.model.visible = v !== 'cockpit'; if (o.lb) o.lb.visible = v !== 'cockpit'; }
  if (v === 'orbit' && o) { const off = C.position.clone().sub(o.pos); if (off.length() > 2500 || off.length() < 80) off.setLength(900); ctl.target.copy(o.pos); C.position.copy(o.pos).add(off); }
  const bar = $('n3FBar'); bar.hidden = !o;
  if (o) $('n3FName').textContent = ((o.d && o.d.flight) || o.hex).trim() + (o.d && o.d.type ? ' · ' + o.d.type : '');
}
function stopFollow() {
  const o = follow && ACS.get(follow); if (o) { o.model.visible = true; if (o.lb) o.lb.visible = true; }
  if (follow && fview !== 'orbit') { ctl.target.copy(o ? o.pos : ctl.target); }
  follow = null; markList(); ctl.enabled = true; C.fov = 40; C.updateProjectionMatrix(); $('n3FBar').hidden = true; $('n3Ck').hidden = true;
}
document.querySelectorAll('#n3FBar [data-f]').forEach(b => b.onclick = () => setFview(b.dataset.f));
// 뒤따라가기 조절 — 끌기: 둘레 돌기·위아래 · 휠/집기·단추: 거리(0.3~12배) · 두 번 누르기: 처음 자리
{ let drag = null, pinch = null;
  const chaseOn = () => follow && fview === 'chase';
  const zoom = f => { chDist = Math.max(0.3, Math.min(12, chDist * f)); };
  cv.addEventListener('pointerdown', e => { if (chaseOn() && e.isPrimary) drag = { x: e.clientX, y: e.clientY, yaw: chYaw, pit: chPitch }; });
  addEventListener('pointermove', e => { if (!drag || !chaseOn() || pinch) return; chYaw = drag.yaw - (e.clientX - drag.x) * 0.008; chPitch = Math.max(-0.05, Math.min(1.35, drag.pit + (e.clientY - drag.y) * 0.006)); });
  addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('wheel', e => { if (!chaseOn()) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener('touchmove', e => { if (!chaseOn() || e.touches.length !== 2) { pinch = null; return; } const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) zoom(pinch / d); pinch = d; }, { passive: true });
  cv.addEventListener('touchend', () => { pinch = null; });
  cv.addEventListener('dblclick', () => { if (chaseOn()) { chDist = 1; chYaw = 0; chPitch = 0.22; } });
  $('n3FFar').onclick = () => zoom(1.6); $('n3FNear').onclick = () => zoom(1 / 1.6);
}
$('n3FStop').onclick = () => stopFollow();
const ptr = new THREE.Vector2(); let downAt = null;
cv.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = cv.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, C); const hit = ray.intersectObjects([...ACS.values()].filter(o => o.root.visible && o.model.visible).map(o => o.model), true)[0];   // 숨긴 기체는 고르지 않는다
  if (hit && hit.object.userData.hex) startFollow(hit.object.userData.hex);
});
['n3Sen', 'n3Trail'].forEach(id => $(id).onchange = () => { SEN.forEach(o => o.root.visible = $('n3Sen').checked); ACS.forEach(o => o.trailLine.visible = $('n3Trail').checked); });

window.N3 = { pos: h => { const o = ACS.get(h); return o && o.pos ? [o.pos.x, o.pos.y, o.pos.z] : null; }, follow: () => follow, waves: () => WAVES.length, acs: () => ACS.size, busy: () => [...ACS.values()].filter(o => o.d && (o.d.phase === 'arr' || o.d.phase === 'dep')).map(o => [o.d.flight, (o.d.rings || []).length]) };   // 점검용(헤드리스)

// 지연 보간 — 늦춤 = 표본 간격 중앙값 × 1.3 (1.5~6초) · 마지막 표본 뒤는 두 점 속도로 최대 6초만 이어 감
function sampleAt(o, now) {
  const sm = o.smp || [];
  if (sm.length < 2) return { p: sm.length ? sm[0].p : o.obs, dir: null };
  const gaps = sm.slice(1).map((q, i) => q.t - sm[i].t).sort((x, y) => x - y), p90 = gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.9))];
  const rt = now - Math.max(2, Math.min(8, p90 * 1.25));                   // 간격이 들쭉날쭉한 공개 경로도 거의 늘 두 점 사이에서 그리게
  let i = sm.length - 2;
  while (i > 0 && sm[i].t > rt) i--;
  const A = sm[i], B = sm[i + 1], span = Math.max(0.2, B.t - A.t);
  const k = Math.min((rt - A.t) / span, 1 + 1.5 / span);                   // 1 넘으면 같은 속도로 이어 감(상한 1.5초 — 길면 다음 점보다 앞서 되돌아간다)
  const p = A.p.clone().lerp(B.p, Math.max(0, k));
  const dx = B.p.x - A.p.x, dz = B.p.z - A.p.z;
  return { p, dir: dx * dx + dz * dz > 4 ? Math.atan2(dx, -dz) : null };
}

// ── 그리기 ──
const UP = new THREE.Vector3(0, 1, 0);
let prev = performance.now() / 1000, ckAt = 0;
// ── 조종석 계기(창틀·글레어실드·PFD·방위) — 서버가 준 속도·고도·방위·승강률로 그린다(자세는 승강률로 근사, 기울기 없음) ──
function cockpitPanel(o) {
  const a = o.d || {}, alt = a.alt != null && a.alt !== 'ground' ? Math.round(a.alt) : 0, spd = Math.round(a.gs || 0), hdg = Math.round(((a.track || 0) + 360) % 360), vs = Math.round(a.vr || 0);
  const pitchDeg = (o.pitch || 0) * 180 / Math.PI;
  $('ckSpd').textContent = spd; $('ckAlt').textContent = alt.toLocaleString(); $('ckVs').textContent = (vs > 0 ? '+' : '') + vs.toLocaleString();
  $('ckHdg').textContent = String(hdg).padStart(3, '0') + '°';
  $('ckHor').setAttribute('transform', 'translate(0 ' + Math.max(-38, Math.min(38, pitchDeg * 3)).toFixed(1) + ')');
  $('ckRose').setAttribute('transform', 'rotate(' + (-hdg) + ' 0 0)');
  $('ckDb').textContent = a.db != null ? a.db.toFixed(0) + ' dB' : '–';
  $('ckPh').textContent = PHASE[a.phase] || '';
}
go('over', true); resize();
R.setAnimationLoop(() => {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - prev); prev = now;
  ACS.forEach(o => {
    if (!o.d || !o.obs) return;
    const a = o.d, v = (a.gs || 0) * 0.5144;
    let trk = (a.track || 0) * Math.PI / 180;
    const tgt = sampleAt(o, now);
    if (tgt.dir) trk = tgt.dir;
    if (o.lastTgt && a.alt !== 'ground' && v > 30) {                        // 공중 기체는 진행 방향으로 되돌아가지 않는다
      const back = (tgt.p.x - o.lastTgt.x) * Math.sin(trk) - (tgt.p.z - o.lastTgt.z) * Math.cos(trk);
      if (back < 0 && back > -400) tgt.p.copy(o.lastTgt);
    }
    o.lastTgt = tgt.p.clone();
    o.pos.lerp(tgt.p, 1 - Math.exp(-dt * 5));
    o.root.position.copy(o.pos);
    const pitch = v > 20 ? Math.atan2((a.vr || 0) * 0.3048 / 60, v) : 0;
    o.model.rotation.set(pitch, -trk, 0, 'YXZ');
    if (o.hdg == null) o.hdg = trk; else { let dh = ((trk - o.hdg + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; o.hdg += dh * (1 - Math.exp(-dt * 2)); }   // 시점이 흔들리지 않게 방향을 천천히 따른다
    o.pitch = pitch;
    const gy = groundAt(o.pos.x, o.pos.z), pa = o.drop.geometry.attributes.position;
    pa.setXYZ(0, o.pos.x, o.pos.y, o.pos.z); pa.setXYZ(1, o.pos.x, gy, o.pos.z); pa.needsUpdate = true;
    const agl = o.pos.y - gy, mine = !follow || follow === o.hex;                 // 11-02 운영자 「고른 기체만 보이기」 — 따라가는 동안 다른 항공기는 숨긴다
    o.root.visible = mine; o.drop.visible = mine && agl > 15;
    const gr = o.model.userData.gear; if (gr) gr.visible = agl < 60 || (a.phase === 'arr' && agl < 900) || (a.phase === 'dep' && agl < 250);   // 착륙장치 — 지상·접근 900m 아래·이륙 직후
    if (now - o.lastTrail > 1) {                                                       // 지나온 길 — 1초마다 한 점 · 3분
      o.lastTrail = now; o.trail.push(o.pos.clone()); if (o.trail.length > 180) o.trail.shift();
      const ta = o.trailLine.geometry.attributes.position; o.trail.forEach((p, i) => ta.setXYZ(i, p.x, p.y, p.z)); ta.needsUpdate = true; o.trailLine.geometry.setDrawRange(0, o.trail.length);
    }
    o.trailLine.visible = $('n3Trail').checked && mine;
    const busy = (a.phase === 'arr' || a.phase === 'dep') && o.pos.y - gy < 1800;      // 이착륙 중(지면 위 1.8km 아래)만 퍼짐
    if (busy && mine && $('n3Wave').checked && now - o.wavesAt > WAVE_EVERY) { o.wavesAt = now; spawnWave(o); }
  });
  stepWaves(now);
  SEN.forEach(o => { const s = o.loud ? 1 + 0.25 * Math.sin(now * 5) : 1; o.head.scale.setScalar(s); });
  const fo = follow && ACS.get(follow);
  if (fo && fview === 'orbit') { const d = fo.pos.clone().sub(ctl.target); ctl.target.add(d); C.position.add(d); }
  else if (fo && fo.hdg != null) {
    const sc = fo.model.scale.x, fwd = new THREE.Vector3(Math.sin(fo.hdg), Math.sin(fo.pitch || 0), -Math.cos(fo.hdg)).normalize();
    if (fview === 'chase') {                                                        // 뒤따라가기 — 꼬리 뒤에서 · 끌면 둘레를 돌고 휠·집기로 멀리/가까이
      const len = (fo.model.userData.real === 'wide' ? 63 : 38) * sc, dist = (len * 2.6 + 40) * chDist;
      const hb = fo.hdg + Math.PI + chYaw, cp = Math.cos(chPitch);
      const want = fo.pos.clone().add(new THREE.Vector3(Math.sin(hb) * cp * dist, Math.sin(chPitch) * dist + len * 0.15, -Math.cos(hb) * cp * dist));
      const gy = groundAt(want.x, want.z); if (want.y < gy + 15) want.y = gy + 15;
      C.position.lerp(want, 1 - Math.exp(-dt * 4)); C.lookAt(fo.pos.clone().addScaledVector(fwd, len * 0.6));
    } else {                                                                        // 조종석 — 기수 위에서 앞을 본다(내 기체는 숨김)
      const ey = EYE[fo.model.userData.real || 'narrow'];
      C.position.copy(fo.pos).addScaledVector(fwd, ey[0] * sc).add(new THREE.Vector3(0, ey[1] * sc, 0));
      C.lookAt(C.position.clone().addScaledVector(fwd, 1000).add(new THREE.Vector3(0, -60, 0)));
      if (now - ckAt > 0.12) { ckAt = now; cockpitPanel(fo); }
    }
  }
  if (anim) {
    const k = Math.min(1, (performance.now() - anim.t0) / 1100), e = k * k * (3 - 2 * k);
    if (anim.arc != null) C.position.copy(ctl.target).add(anim.off0.clone().applyAxisAngle(UP, THREE.MathUtils.degToRad(anim.arc * e)));
    else { C.position.lerpVectors(anim.p0, anim.p1, e); ctl.target.lerpVectors(anim.q0, anim.q1, e); }
    if (k >= 1) anim = null;
  }
  if (!fo || fview === 'orbit') ctl.update(); R.render(S, C);
});
