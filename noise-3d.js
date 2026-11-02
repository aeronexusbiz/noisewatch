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

const SCENES = { RKSS: { url: '/scene3d/rkss.glb?v=1', ref: [37.5583, 126.7906] } };
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
let anim = null, follow = null;
function go(v, now) {
  const [p, t] = VIEWS[v]; follow = null; markList();
  document.querySelectorAll('.n3-views button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (now) { C.position.set(...p); ctl.target.set(...t); ctl.update(); return; }
  anim = { t0: performance.now(), p0: C.position.clone(), q0: ctl.target.clone(), p1: new THREE.Vector3(...p), q1: new THREE.Vector3(...t) };
}
function turn(deg) { anim = { t0: performance.now(), arc: deg, off0: C.position.clone().sub(ctl.target) }; }
document.querySelectorAll('.n3-views button').forEach(b => b.onclick = () => go(b.dataset.v));
$('n3L').onclick = () => turn(30); $('n3R').onclick = () => turn(-30);
$('n3Spin').onclick = e => { ctl.autoRotate = !ctl.autoRotate; ctl.autoRotateSpeed = 0.6; e.currentTarget.setAttribute('aria-pressed', String(ctl.autoRotate)); };
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === 'ArrowLeft') turn(15); if (e.key === 'ArrowRight') turn(-15); if (e.key === 'Escape') { follow = null; markList(); } });

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
loader.load(SC.url, g => {
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(m => { if (m.map) { m.map.anisotropy = R.capabilities.getMaxAnisotropy(); m.map.colorSpace = THREE.SRGBColorSpace; } });
    if (/^(airfield|landside)/.test(o.name)) { o.position.y += o.name.startsWith('airfield') ? 1.6 : 0.9;   // 지형과 0.3m 차이는 멀리서 깊이가 모자라 위성 가림 얼룩이 비쳤다(11-02)
      ms.forEach(m => { m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = o.name.startsWith('airfield') ? -3 : -2; }); o.renderOrder = o.name.startsWith('airfield') ? 2 : 1; }
    if (o.name === 'terrain') ground.push(o);
  });
  S.add(g.scene); $('n3Load').remove(); sensorsPlace();
}, x => { if (x.total) $('n3Pct').textContent = Math.round(x.loaded / x.total * 100) + '%'; },
() => {
  $('n3Load').textContent = '3D 지도 자료를 받지 못했습니다. 항공기와 측정 지점은 평면 위에 그립니다.';
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x6b7b5e }));
  pl.rotation.x = -Math.PI / 2; pl.position.y = 10; S.add(pl); ground.push(pl); sensorsPlace();
});

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
const SIZE = { small: 0.45, narrow: 1, wide: 1.6, heavy: 1.8, heli: 0.4 };
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
function plane(phase) {
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
    o.model = plane(a.phase); o.root.add(o.model); o.model.userData.hex = a.hex; o.model.traverse(m => { m.userData.hex = a.hex; });
    o.drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineM); S.add(o.drop);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(180 * 3), 3)); tg.setDrawRange(0, 0);
    o.trailLine = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: a.phase === 'dep' ? 0xfb923c : 0x7dd3fc, transparent: true, opacity: 0.8 })); o.trailLine.frustumCulled = false; S.add(o.trailLine);
    S.add(o.root); ACS.set(a.hex, o);
  }
  if (o.phase !== a.phase) { o.phase = a.phase; const tm = tailM[a.phase] || tailM.other; o.model.children.forEach(m => { if (m.geometry === G.fin) m.material = tm; }); }
  return o;
}
function dropAc(o) { S.remove(o.root); S.remove(o.drop); S.remove(o.trailLine); if (o.lb) { o.lb.material.map.dispose(); o.lb.material.dispose(); } o.trailLine.geometry.dispose(); o.drop.geometry.dispose(); ACS.delete(o.hex); }

// ── 소음 퍼짐(이착륙 중 · 서버가 준 rings = [[dB, 그 dB 가 닿는 거리 m], …]) ──
const sphG = new THREE.SphereGeometry(1, 40, 20), ringG = new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2);
const WAVES = []; const WAVE_T = 2.8, WAVE_EVERY = 1.15;
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
    const e = 1 - Math.pow(1 - k, 2.2), rad = Math.max(1, w.r * e), fade = (1 - k);
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
    const now = performance.now() / 1000; lastData = now;
    senData = d.sensors || []; sensorsPlace();
    const seen = new Set();
    (d.ac || []).forEach(a => {
      if (a.lat == null || a.lon == null) return;
      seen.add(a.hex); const o = acObj(a); o.d = a; o.t = now;
      const [x, z] = enu(a.lat, a.lon), gy = groundAt(x, z);
      const y = (a.alt == null || a.alt === 'ground') ? gy + 3 : Math.max(gy + 3, a.alt * 0.3048);
      o.obs = new THREE.Vector3(x, y, z); if (!o.pos) o.pos = o.obs.clone();
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
  const o = ACS.get(hex); if (!o || !o.pos) return; follow = hex; markList(); anim = null;
  const off = C.position.clone().sub(ctl.target); if (off.length() > 2500) off.setLength(1800);
  ctl.target.copy(o.pos); C.position.copy(o.pos).add(off);
}
const ptr = new THREE.Vector2(); let downAt = null;
cv.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = cv.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, C); const hit = ray.intersectObjects([...ACS.values()].map(o => o.model), true)[0];
  if (hit && hit.object.userData.hex) startFollow(hit.object.userData.hex);
});
['n3Sen', 'n3Trail'].forEach(id => $(id).onchange = () => { SEN.forEach(o => o.root.visible = $('n3Sen').checked); ACS.forEach(o => o.trailLine.visible = $('n3Trail').checked); });

window.N3 = { waves: () => WAVES.length, acs: () => ACS.size, busy: () => [...ACS.values()].filter(o => o.d && (o.d.phase === 'arr' || o.d.phase === 'dep')).map(o => [o.d.flight, (o.d.rings || []).length]) };   // 점검용(헤드리스)

// ── 그리기 ──
const UP = new THREE.Vector3(0, 1, 0);
let prev = performance.now() / 1000;
go('over', true); resize();
R.setAnimationLoop(() => {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - prev); prev = now;
  ACS.forEach(o => {
    if (!o.d || !o.obs) return;
    const a = o.d, age = Math.min(8, now - o.t), trk = (a.track || 0) * Math.PI / 180, v = (a.gs || 0) * 0.5144;
    const pred = o.obs.clone().add(new THREE.Vector3(Math.sin(trk) * v * age, (a.vr || 0) * 0.3048 / 60 * age, -Math.cos(trk) * v * age));
    o.pos.lerp(pred, 1 - Math.exp(-dt * 4));
    o.root.position.copy(o.pos);
    const pitch = v > 20 ? Math.atan2((a.vr || 0) * 0.3048 / 60, v) : 0;
    o.model.rotation.set(pitch, -trk, 0, 'YXZ');
    const gy = groundAt(o.pos.x, o.pos.z), pa = o.drop.geometry.attributes.position;
    pa.setXYZ(0, o.pos.x, o.pos.y, o.pos.z); pa.setXYZ(1, o.pos.x, gy, o.pos.z); pa.needsUpdate = true; o.drop.visible = o.pos.y - gy > 15;
    if (now - o.lastTrail > 1) {                                                       // 지나온 길 — 1초마다 한 점 · 3분
      o.lastTrail = now; o.trail.push(o.pos.clone()); if (o.trail.length > 180) o.trail.shift();
      const ta = o.trailLine.geometry.attributes.position; o.trail.forEach((p, i) => ta.setXYZ(i, p.x, p.y, p.z)); ta.needsUpdate = true; o.trailLine.geometry.setDrawRange(0, o.trail.length);
    }
    o.trailLine.visible = $('n3Trail').checked;
    const busy = (a.phase === 'arr' || a.phase === 'dep') && o.pos.y - gy < 1800;      // 이착륙 중(지면 위 1.8km 아래)만 퍼짐
    if (busy && $('n3Wave').checked && now - o.wavesAt > WAVE_EVERY) { o.wavesAt = now; spawnWave(o); }
  });
  stepWaves(now);
  SEN.forEach(o => { const s = o.loud ? 1 + 0.25 * Math.sin(now * 5) : 1; o.head.scale.setScalar(s); });
  if (follow && ACS.get(follow)) { const p = ACS.get(follow).pos, d = p.clone().sub(ctl.target); ctl.target.add(d); C.position.add(d); }
  if (anim) {
    const k = Math.min(1, (performance.now() - anim.t0) / 1100), e = k * k * (3 - 2 * k);
    if (anim.arc != null) C.position.copy(ctl.target).add(anim.off0.clone().applyAxisAngle(UP, THREE.MathUtils.degToRad(anim.arc * e)));
    else { C.position.lerpVectors(anim.p0, anim.p1, e); ctl.target.lerpVectors(anim.q0, anim.q1, e); }
    if (k >= 1) anim = null;
  }
  ctl.update(); R.render(S, C);
});
