import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const canvas = document.getElementById('scene');
const mobile = matchMedia('(max-width: 760px)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const { smoothstep, clamp } = THREE.MathUtils;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
} catch {
  canvas.remove();
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x2c1f3f, 0.0042);
const camera = new THREE.PerspectiveCamera(mobile ? 52 : 42, innerWidth / innerHeight, 0.1, 2400);

const GROUND = -60, BLOCK = 26, R0 = 55, R1 = mobile ? 480 : 600;
const COAST = x => 20 + 0.0009 * x * x + 8 * Math.sin(x * 0.013);
const COAST_GLSL = 'float coastZ = 20. + .0009 * cX * cX + 8. * sin(cX * .013);';
const WIND = { value: 0 };
const paramsQ = new URLSearchParams(location.search);

/* ---------- time of day (IST, Chennai sun) ---------- */

const PAL = [
  { e: -0.35, top: 0x040920, mid: 0x0d1534, hor: 0x252f52, glow: 0x5060a0, fog: 0x151c3a, fd: .0033, hs: 0x41539a, hg: 0x08070e, hi: .6, lc: 0x9db2ff, li: .6, win: 1.75, street: 1, stars: 1, cloud: .22, cc: 0x121628, exp: 1.22, bld: 0x0a0e1c, gnd: 0x07080e, cliff: 0x1f1c26 },
  { e: -0.12, top: 0x050a20, mid: 0x1a1942, hor: 0x56406e, glow: 0x9a6a9a, fog: 0x272040, fd: .0035, hs: 0x5a5a9a, hg: 0x0d0a14, hi: .55, lc: 0xa58cff, li: .7, win: 1.6, street: .95, stars: .6, cloud: .32, cc: 0x352c50, exp: 1.08, bld: 0x0c1022, gnd: 0x090a12, cliff: 0x26222e },
  { e: -0.02, top: 0x0f1a46, mid: 0x4a2d62, hor: 0xff6d3d, glow: 0xff7a3a, fog: 0x4e3052, fd: .0033, hs: 0x7a6fb5, hg: 0x140d1c, hi: .75, lc: 0xff8a4a, li: 2.4, win: 1.3, street: .8, stars: .12, cloud: .5, cc: 0x6a3a5a, exp: 1.05, bld: 0x12162c, gnd: 0x0d0c14, cliff: 0x2e2732 },
  { e: 0.08, top: 0x2c4c8e, mid: 0xb07a7e, hor: 0xffb070, glow: 0xffa860, fog: 0x9a7480, fd: .0027, hs: 0xd0a8b0, hg: 0x2a2028, hi: .9, lc: 0xffb878, li: 3, win: .3, street: .12, stars: 0, cloud: .55, cc: 0xe0a090, exp: 1, bld: 0x4a4a5a, gnd: 0x3a3438, cliff: 0x5a4a48 },
  { e: 0.28, top: 0x2a68c8, mid: 0x7cb0e8, hor: 0xd6e6f4, glow: 0xfff2d8, fog: 0xa8c0d8, fd: .0021, hs: 0xc4dcff, hg: 0x4a4a50, hi: 1.15, lc: 0xfff0dc, li: 3.2, win: .05, street: 0, stars: 0, cloud: .5, cc: 0xf4f7fb, exp: .95, bld: 0x7a8494, gnd: 0x6a6c70, cliff: 0x7a6e66 },
  { e: 0.9, top: 0x1a58c0, mid: 0x68a4e8, hor: 0xcfe2f6, glow: 0xffffff, fog: 0xa2bcd8, fd: .0019, hs: 0xcce2ff, hg: 0x505058, hi: 1.2, lc: 0xffffff, li: 3.4, win: .03, street: 0, stars: 0, cloud: .42, cc: 0xffffff, exp: .92, bld: 0x808a9a, gnd: 0x707276, cliff: 0x80746a },
];
const CK = ['top', 'mid', 'hor', 'glow', 'fog', 'hs', 'hg', 'lc', 'cc', 'bld', 'gnd', 'cliff'];
PAL.forEach(p => CK.forEach(k => p[k] = new THREE.Color(p[k])));
const env = {};
CK.forEach(k => env[k] = new THREE.Color());
function palIndex(e) {
  let i = 0;
  while (i < PAL.length - 2 && e > PAL[i + 1].e) i++;
  return [PAL[i], PAL[i + 1], clamp((e - PAL[i].e) / (PAL[i + 1].e - PAL[i].e), 0, 1)];
}
function sampleEnv(e) {
  const [a, b, f] = palIndex(e);
  for (const k in a) if (k !== 'e') a[k].isColor ? env[k].lerpColors(a[k], b[k], f) : (env[k] = a[k] + (b[k] - a[k]) * f);
}
const palNum = (k, e) => { const [a, b, f] = palIndex(e); return a[k] + (b[k] - a[k]) * f; };

const D2R = Math.PI / 180, LAT = 13.0827 * D2R, LON = 80.2707, IST = 5.5 * 3600e3, DAY = 864e5;
function solar(ms) {
  const n = ms / DAY + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R, eps = (23.439 - 4e-7 * n) * D2R;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const H = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * D2R + LON * D2R - ra;
  const el = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(H));
  return { el, az };
}
// scene axes: +x = north, +z = east, figure faces west (-z)
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
function setSun(ms) {
  const { el, az } = solar(ms);
  sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  moonDir.set(-sunDir.x * 0.6 - 0.3, Math.max(-sunDir.y, 0.3), -sunDir.z).normalize();
}

const istDayStart = ms => Math.floor((ms + IST) / DAY) * DAY - IST;
function hourWhen(elDeg, afternoon) {
  const d0 = istDayStart(Date.now());
  let best = afternoon ? 17.5 : 7, diff = 1e9;
  for (let m = afternoon ? 720 : 240; m < (afternoon ? 1200 : 720); m += 2) {
    const dd = Math.abs(solar(d0 + m * 6e4).el / D2R - elDeg);
    if (dd < diff) { diff = dd; best = m / 60; }
  }
  return best;
}
const MODES = [
  { name: 'Auto', h: null },
  { name: 'Morning', h: hourWhen(14, false) },
  { name: 'Day', h: 12.5 },
  { name: 'Evening', h: hourWhen(1.5, true) },
  { name: 'Night', h: 21.75 },
];
const urlT = new URLSearchParams(location.search).get('t');
let mode = 0, fixedHour = null;
if (urlT && /^\d{1,2}(:\d{2})?$/.test(urlT)) {
  const [hh, mm = 0] = urlT.split(':').map(Number);
  fixedHour = hh + mm / 60;
}
const targetMs = () => {
  const h = mode ? MODES[mode].h : fixedHour;
  return h == null ? Date.now() : istDayStart(Date.now()) + h * 36e5;
};
let simMs = targetMs();

/* ---------- sky ---------- */

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      sunDir: { value: sunDir }, moonDir: { value: moonDir }, time: { value: 0 },
      top: { value: env.top }, mid: { value: env.mid }, hor: { value: env.hor }, glow: { value: env.glow },
      below: { value: env.fog }, cc: { value: env.cc }, stars: { value: 0 }, clouds: { value: 0 }, night: { value: 0 },
      overcast: { value: 0 }, flash: { value: 0 }, drift: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      uniform vec3 sunDir, moonDir, top, mid, hor, glow, below, cc;
      uniform float time, stars, clouds, night, overcast, flash, drift;
      varying vec3 vDir;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h2(i), h2(i+vec2(1.,0.)), f.x), mix(h2(i+vec2(0.,1.)), h2(i+vec2(1.)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 5; i++){ v += a*n2(p); p = p*2.03 + 17.1; a *= .5; } return v; }
      float h3(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float starLayer(vec3 d, float sc, float thr, float tw){
        vec3 q = d*sc, sp = floor(q); float r = h3(sp);
        float core = smoothstep(.5, .05, length(fract(q) - .5));
        return step(thr, r) * core * (.55 + .45*sin(time*tw + r*60.));
      }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        float s = max(dot(d, sunDir), 0.);
        vec3 col = mix(mid, top, smoothstep(0., .55, h));
        col = mix(col, hor, exp(-max(h, 0.)*9.));
        float sunUp = smoothstep(-.25, .05, sunDir.y);
        col += glow*(pow(s,6.)*.28 + pow(s,48.)*.6)*sunUp*(1. - overcast*.7);
        vec3 N = normalize(vec3(.6, .35, .72));
        float mwMask = exp(-pow(dot(d, N)/.2, 2.));
        float st = starLayer(d, 620., .975, 2.6)*.7 + starLayer(d, 300., .992, 1.6)*1.3 + starLayer(d, 150., .9985, .9)*2.4;
        st *= 1. + mwMask*1.8;
        float vis = smoothstep(.02, .28, h)*stars;
        col += st*vis;
        col += vec3(.5, .55, .8)*mwMask*fbm(d.xz*7. + d.y*4.)*.16*vis;
        if (h > 0.) {
          vec2 uv = d.xz/(h + .12);
          float cov = clamp(clouds, 0., 1.);
          float c1 = smoothstep(.62 - cov*.34, .93 - cov*.24, fbm(uv*1.3 + vec2(drift*.012, drift*.004)));
          float c2 = smoothstep(.56, .86, fbm(uv*3.6 + vec2(drift*.028, drift*.01)))*.5*(1. - cov*.5);
          float fade = smoothstep(0., .2, h);
          vec3 lit = cc + glow*pow(s, 3.)*.5*sunUp*(1. - overcast*.6);
          vec3 shade = cc*mix(.62, .4, overcast);
          col = mix(col, mix(lit, shade, smoothstep(.3, 1., c1)*(.35 + overcast*.5)), c1*fade*.94);
          col = mix(col, lit*1.04, c2*fade*.55);
        }
        col = mix(col, vec3(dot(col, vec3(.33)))*.82, overcast*.45);
        col += glow*smoothstep(.99955, .9998, s)*4.*step(-.02, sunDir.y)*(1. - overcast*.9);
        float m = max(dot(d, moonDir), 0.);
        col += (vec3(.95,.96,1.)*smoothstep(.99935, .99965, m)*1.6 + vec3(.35,.45,.8)*pow(m,120.)*.5)*night*(1. - overcast*.8);
        col += vec3(.7, .76, 1.)*flash*(.5 + .5*h);
        col = mix(col, below, 1. - smoothstep(-.06, .01, h));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
);
sky.renderOrder = -1;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0x7a6fb5, 0x140d1c, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff9b5e, 3);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x5b7cff, 0.9);
rim.position.set(6, 8, 10);
scene.add(rim);
const cityGlow = new THREE.PointLight(0xffb27a, 0, 7, 1.5);
cityGlow.position.set(0.3, -0.6, -2.2);
scene.add(cityGlow);

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTexture();
const glowMat = (o = {}) => new THREE.PointsMaterial({ map: DOT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });

/* ---------- city ---------- */

function windowTextures() {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 256; return [c, c.getContext('2d')]; };
  const [ce, ge] = mk(), [cb, gb] = mk();
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  gb.fillStyle = '#d9d6d0';
  gb.fillRect(0, 0, 256, 256);
  const pal = ['#ffd08a', '#ffb866', '#ffe2b0', '#ff9f4a', '#bcd4ff'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    gb.fillStyle = `hsl(${205 + Math.random() * 20},${18 + Math.random() * 20}%,${22 + Math.random() * 22}%)`;
    gb.fillRect(x * 16 + 4, y * 16 + 3, 8, 9);
    const r = Math.random();
    if (r > 0.34) continue;
    ge.globalAlpha = 0.45 + Math.random() * 0.55;
    ge.fillStyle = r < 0.03 ? pal[4] : pal[(Math.random() * 4) | 0];
    ge.fillRect(x * 16 + 4, y * 16 + 3, 8, 9);
  }
  return [ce, cb].map(c => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

const TILE = 48;
function building(x, z, w, d, h) {
  const b = new THREE.BoxGeometry(w, h, d);
  const uv = b.attributes.uv;
  const ou = Math.random(), ov = Math.random();
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) { uv.setXY(i, 0.01, 0.01); continue; }
    uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / TILE + ou, uv.getY(i) * h / TILE + ov);
  }
  b.translate(x, GROUND + h / 2, z);
  return b;
}

const groups = [[], [], []], beacons = [], roofs = [], palmSpots = [];
const lotHeight = (r, downtown) => Math.min(8 + Math.pow(Math.random(), 2.6) * (downtown ? 150 : 70), 22 + (r - R0) * 0.22);
for (let gx = -R1; gx < R1; gx += BLOCK) for (let gz = -R1; gz < R1; gz += BLOCK) {
  const cx = gx + BLOCK / 2, cz = gz + BLOCK / 2, r = Math.hypot(cx, cz);
  if (r < R0 || r > R1 || cz > COAST(cx) - 46) continue;
  if (Math.random() < 0.1 + (r / R1) * 0.3) {
    if (Math.random() < 0.5) for (let k = 0; k < 4; k++) palmSpots.push([cx + (Math.random() - 0.5) * 18, GROUND, cz + (Math.random() - 0.5) * 18]);
    continue;
  }
  const downtown = cz < -200 && cz > -430 && Math.abs(cx) < -cz * 0.45;
  const seaward = cz > 0 ? clamp(1 - cz / COAST(cx) * 0.75, 0.25, 1) : 1;
  const lots = Math.random() < 0.5 ? [[0, 0, 12 + Math.random() * 7]] : [[-5, -5], [5, -5], [-5, 5], [5, 5]].filter(() => Math.random() < 0.8).map(([a, b]) => [a, b, 6 + Math.random() * 3]);
  for (const [ox, oz, s] of lots) {
    const h = Math.max(6, lotHeight(r, downtown) * seaward), w = s * (0.8 + Math.random() * 0.2), d = s * (0.8 + Math.random() * 0.2);
    groups[(Math.random() * 3) | 0].push(building(cx + ox, cz + oz, w, d, h));
    if (h > 70) beacons.push(cx + ox, GROUND + h + 1, cz + oz);
    else if (Math.random() < 0.55) roofs.push([cx + ox, GROUND + h, cz + oz, w, d]);
  }
}
const TINT = [new THREE.Color(1, 1, 1), new THREE.Color(0.82, 0.9, 1.08), new THREE.Color(1.1, 1.02, 0.92)];
const cityMats = groups.map(gs => {
  const [emi, base] = windowTextures();
  const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.15, map: base, emissive: 0xffffff, emissiveMap: emi });
  scene.add(new THREE.Mesh(mergeGeometries(gs), m));
  return m;
});

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b8b8b8';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a3a3e';
  const rw = 15;
  g.fillRect(0, 0, rw, 128); g.fillRect(128 - rw, 0, rw, 128);
  g.fillRect(0, 0, 128, rw); g.fillRect(0, 128 - rw, 128, rw);
  g.fillStyle = '#d8d0a0';
  for (let i = 20; i < 110; i += 16) { g.fillRect(0, i, 1.5, 7); g.fillRect(i, 0, 7, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(3000 / BLOCK, 3000 / BLOCK);
  const off = Math.ceil(1500 / BLOCK) - 1500 / BLOCK;
  t.offset.set(off, off);
  t.anisotropy = 8;
  return t;
}
const groundMat = new THREE.MeshStandardMaterial({ roughness: 1, map: roadTexture() });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND;
scene.add(ground);

const streetMat = glowMat({ size: 2.6, vertexColors: true });
{
  const n = mobile ? 3500 : 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 40 + Math.pow(Math.random(), 0.8) * R1;
    let x = Math.sin(a) * r, z = Math.cos(a) * r;
    const side = Math.random() < 0.5 ? -3.6 : 3.6;
    if (Math.random() < 0.5) x = Math.round(x / BLOCK) * BLOCK + side; else z = Math.round(z / BLOCK) * BLOCK + side;
    if (z > COAST(x) - 40) z = COAST(x) - 42 + (Math.random() < 0.5 ? 0 : 9);
    pos.set([x, GROUND + 0.8, z], i * 3);
    c.setHSL(0.07 + Math.random() * 0.06, 1, 0.55 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, streetMat));
}

const beaconMat = glowMat({ size: 3, color: 0xff3b3b });
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  scene.add(new THREE.Points(g, beaconMat));
}

/* ---------- traffic ---------- */

const traffic = (() => {
  const N = mobile ? 260 : 620, RR = R1;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.5, 4.4).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }), N);
  const COLORS = [0xd8dde3, 0x1e2430, 0xb3121b, 0x2a5bd7, 0xf2c230, 0x8a8f96, 0xffffff, 0x0f5132, 0xff7a1a];
  const ks = [];
  for (let k = -Math.floor(RR / BLOCK); k <= Math.floor(RR / BLOCK); k++) if (Math.abs(k) >= 2) ks.push(k);
  const cars = [], c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const bus = Math.random() < 0.06;
    cars.push({ ax: Math.random() < 0.5, lane: ks[(Math.random() * ks.length) | 0] * BLOCK + dir * 1.7, p: (Math.random() * 2 - 1) * RR, v: dir * (bus ? 7 : 9 + Math.random() * 13), bus });
    mesh.setColorAt(i, c.set(bus ? 0x1f7a4d : COLORS[(Math.random() * COLORS.length) | 0]));
  }
  scene.add(mesh);
  const mk = color => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const m = glowMat({ size: 2.4, color });
    scene.add(new THREE.Points(g, m));
    return { g, m };
  };
  const head = mk(0xfff1cf), tail = mk(0xff2a2a);
  const o = new THREE.Object3D();
  return {
    update(dt, lights) {
      const hp = head.g.attributes.position.array, tp = tail.g.attributes.position.array;
      cars.forEach((cr, i) => {
        cr.p += cr.v * dt;
        if (cr.p > RR) cr.p -= 2 * RR; else if (cr.p < -RR) cr.p += 2 * RR;
        const x = cr.ax ? cr.p : cr.lane, z = cr.ax ? cr.lane : cr.p, s = Math.sign(cr.v);
        const hidden = Math.hypot(x, z) < 50 || Math.hypot(x, z) > RR || z > COAST(x) - 44;
        o.position.set(x, hidden ? GROUND - 30 : GROUND, z);
        o.rotation.y = cr.ax ? s * Math.PI / 2 : (s > 0 ? 0 : Math.PI);
        o.scale.set(1, cr.bus ? 2 : 1, cr.bus ? 2.6 : 1);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        const L = cr.bus ? 5.8 : 2.3, fx = cr.ax ? s * L : 0, fz = cr.ax ? 0 : s * L, y = hidden ? GROUND - 30 : GROUND + 0.9;
        hp.set([x + fx, y, z + fz], i * 3);
        tp.set([x - fx, y, z - fz], i * 3);
      });
      mesh.instanceMatrix.needsUpdate = true;
      head.g.attributes.position.needsUpdate = tail.g.attributes.position.needsUpdate = true;
      head.m.opacity = 0.1 + 0.9 * lights;
      tail.m.opacity = 0.15 + 0.85 * lights;
    },
  };
})();

/* ---------- terrain: headland cliff over the sea ---------- */

const noise3 = (x, y, z) => Math.sin(x * 1.7 + y * 0.9) * Math.cos(z * 1.3 - y * 0.6) * 0.6 + Math.sin(x * 3.1 + z * 2.3) * 0.25 + Math.sin(y * 4.7 + x * 0.7) * 0.15;
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, z, o = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1); f *= 2.03; a *= 0.5; }
  return s;
}
const SEA_FLOOR = -74;
function terrainH(x, z) {
  const dz = z - 4.5;
  let r = Math.hypot(x, dz < 0 ? dz : dz * 0.3);
  r += fbm(x * 0.035, z * 0.035) * 9 * smoothstep(r, 6, 14);
  const s = clamp((r - 5.5) / 44, 0, 1);
  let h = (GROUND - 2) * (1 - Math.pow(1 - s, 3));
  const rough = smoothstep(r, 6, 12) * (1 - s * 0.5);
  h += (fbm(x * 0.09, z * 0.09, 6) * 4.5 + (1 - Math.abs(fbm(x * 0.03 + 5, z * 0.03, 4))) * 6 - 3) * rough;
  const near = smoothstep(Math.hypot(x, (z - 1) * 0.8), 2.2, 6);
  h += fbm(x * 0.4, z * 0.4, 3) * 0.3 * near * (1 - rough);
  const c = COAST(x) - 9 + fbm(x * 0.06, 3.3, 3) * 3, k = smoothstep(z, c, c + 10);
  h += fbm(x * 0.22, z * 0.3, 4) * 3 * k * (1 - k) * 4;
  return h + (SEA_FLOOR - h) * k;
}
const slopeAt = (x, z) => { const e = 0.6; return Math.hypot(terrainH(x + e, z) - terrainH(x - e, z), terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e); };

function detailTexture() {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const per = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const H = (a, b) => hash2(((a % p) + p) % p, ((b % p) + p) % p);
    const A = H(xi, yi), B = H(xi + 1, yi), C = H(xi, yi + 1), D = H(xi + 1, yi + 1);
    return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, a = 0.5;
    for (let o = 0, p = 8; o < 5; o++, p *= 2) { s += a * per(x / N * p, y / N * p, p); a *= 0.5; }
    const cr = Math.abs(per(x / N * 16, y / N * 16, 16) * 2 - 1);
    const v = clamp((s - 0.47) * 1.6 + 0.5 - (cr < 0.06 ? 0.25 : 0), 0, 1) * 255;
    img.data.set([v, v, v, 255], (y * N + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const DETAIL = { value: detailTexture() };
function patchRock(mat, strata = 1) {
  mat.onBeforeCompile = s => {
    s.uniforms.uDetail = DETAIL;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 tw = modelMatrix * vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          tw = modelMatrix * instanceMatrix * vec4(transformed, 1.);
        #endif
        vTW = tw.xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; varying vec3 vTW; varying vec3 vTN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(vTN), vec3(4.)); bw /= dot(bw, vec3(1.));
        float d1 = texture2D(uDetail, vTW.zy * .21).r * bw.x + texture2D(uDetail, vTW.xz * .21).r * bw.y + texture2D(uDetail, vTW.xy * .21).r * bw.z;
        float d2 = texture2D(uDetail, vTW.zy * .027).r * bw.x + texture2D(uDetail, vTW.xz * .027).r * bw.y + texture2D(uDetail, vTW.xy * .027).r * bw.z;
        float steep = smoothstep(.3, .75, 1. - abs(vTN.y));
        float layers = .5 + .5 * sin(vTW.y * 1.7 + d2 * 7. + sin(vTW.x * .05) * 2.);
        diffuseColor.rgb *= (.62 + .76 * d1) * (.82 + .36 * d2) * mix(1., .78 + .38 * layers, steep * ${strata.toFixed(2)});`);
  };
  return mat;
}
const terrainMat = patchRock(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
{
  const step = mobile ? 1 : 0.5, X0 = -110, X1 = 110, Z0 = -75, Z1 = 52;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, Math.round((X1 - X0) / step), Math.round((Z1 - Z0) / step));
  g.rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), tmp = new THREE.Color(), t2 = new THREE.Color();
  const grassA = new THREE.Color(0x56622e), grassB = new THREE.Color(0x6f6a3a), rockA = new THREE.Color(0x7b6c5e), rockB = new THREE.Color(0x5a4f48), wet = new THREE.Color(0x2e2a28), scree = new THREE.Color(0x8a7a66);
  for (let i = 0; i < p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i), ny = Math.max(nrm.getY(i), 0.05);
    const sl = Math.sqrt(1 - ny * ny) / ny, n = fbm(x * 0.15, z * 0.15, 3), n2 = fbm(x * 0.6, z * 0.6, 2);
    tmp.copy(grassA).lerp(grassB, clamp(0.5 + n, 0, 1));
    t2.copy(rockA).lerp(rockB, clamp(0.5 + n2 * 1.2, 0, 1));
    tmp.lerp(t2, smoothstep(sl + n * 0.25, 0.55, 1.0));
    if (y < GROUND + 6 && sl < 0.9) tmp.lerp(scree, smoothstep(GROUND + 6 - y, 0, 5) * 0.6);
    if (y < GROUND + 4 && z > COAST(x) - 12) tmp.lerp(wet, smoothstep(GROUND + 4 - y, 0, 6));
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(g, terrainMat));
}

const paint = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = 0.85 + Math.random() * 0.3; a.set([c.r * v, c.g * v, c.b * v], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
function patchSway(mat, height, amp) {
  mat.onBeforeCompile = s => {
    s.uniforms.uWind = WIND;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.);
      #endif
      float sw = pow(clamp(position.y / ${height.toFixed(2)}, 0., 1.), 2.);
      transformed.x += (sin(uWind * 1.3 + ip.x * .08 + ip.z * .05) + .4 * sin(uWind * 3.7 + ip.z)) * ${amp.toFixed(3)} * sw;
      transformed.z += cos(uWind * 1.1 + ip.z * .07) * ${(amp * 0.6).toFixed(3)} * sw;`);
  };
  return mat;
}

function rockGeometry() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 5)), p = g.attributes.position, v = new THREE.Vector3();
  const sx = Math.random() * 10;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + noise3(v.x * 2 + sx, v.y * 2, v.z * 2) * 0.2 + noise3(v.x * 7, v.z * 6 + sx, v.y * 7) * 0.05);
    const facet = Math.abs(fbm(v.x * 1.4 + sx, v.z * 1.4 + v.y, 2));
    v.multiplyScalar(1 - facet * 0.12);
    v.y *= v.y < 0 ? 0.35 : 0.75;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const rockMat = patchRock(new THREE.MeshStandardMaterial({ color: 0x8a7d70, roughness: 0.95 }), 0.4);
{
  const spots = [[-2.8, -0.15, 0.5], [2.5, 1.4, 0.7], [-0.6, 3.7, 0.8], [1.5, 3.5, 0.6], [2.9, -0.1, 0.35], [-1.6, 3.9, 0.45], [0.6, 4.0, 0.5], [-0.9, 1.4, 0.14], [1.1, 0.9, 0.15], [-1.3, -0.15, 0.12], [1.9, 2.4, 0.25], [-3.2, 6.5, 0.9], [3.4, 7.8, 1.1], [-1.2, 9.4, 0.6], [2.2, 10.8, 0.5]];
  const list = spots.map(([x, z, s]) => [x, z, s, terrainH(x, z) - s * 0.15]);
  for (let tries = 0; list.length < (mobile ? 90 : 170) && tries < 4000; tries++) {
    const x = (Math.random() - 0.5) * 180, z = -70 + Math.random() * 110, y = terrainH(x, z);
    if (y > -2 || y < GROUND + 0.5 || z > COAST(x) - 6) continue;
    const s = 0.6 + Math.pow(Math.random(), 2) * 3.4;
    list.push([x, z, s, y - s * 0.25]);
  }
  const rocks = new THREE.InstancedMesh(rockGeometry(), rockMat, list.length);
  const o = new THREE.Object3D();
  list.forEach(([x, z, s, y], i) => {
    o.position.set(x, y, z);
    o.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
    o.scale.set(s * (0.8 + Math.random() * 0.5), s, s * (0.8 + Math.random() * 0.5));
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
  });
  scene.add(rocks);
}
{
  const blades = [];
  for (let b = 0; b < 7; b++) {
    const a = b / 7 * Math.PI * 2 + Math.random() * 0.6, lean = 0.12 + Math.random() * 0.3, h = 0.07 + Math.random() * 0.09, w = 0.004 + Math.random() * 0.003;
    const ox = Math.cos(a) * 0.02, oz = Math.sin(a) * 0.02, tx = ox + Math.cos(a) * lean * h, tz = oz + Math.sin(a) * lean * h, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const mx = ox + (tx - ox) * 0.45, mz = oz + (tz - oz) * 0.45;
    const bg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ox - px, 0, oz - pz), new THREE.Vector3(ox + px, 0, oz + pz), new THREE.Vector3(mx + px * 0.7, h * 0.55, mz + pz * 0.7),
      new THREE.Vector3(ox - px, 0, oz - pz), new THREE.Vector3(mx + px * 0.7, h * 0.55, mz + pz * 0.7), new THREE.Vector3(mx - px * 0.7, h * 0.55, mz - pz * 0.7),
      new THREE.Vector3(mx - px * 0.7, h * 0.55, mz - pz * 0.7), new THREE.Vector3(mx + px * 0.7, h * 0.55, mz + pz * 0.7), new THREE.Vector3(tx, h, tz),
    ]);
    const c = new Float32Array(27);
    for (let k = 0; k < 9; k++) { const y = bg.attributes.position.getY(k) / h, v = 0.45 + 0.75 * y; c.set([v, v, v * 0.9], k * 3); }
    bg.setAttribute('color', new THREE.BufferAttribute(c, 3));
    bg.computeVertexNormals();
    blades.push(bg);
  }
  const n = mobile ? 2600 : 6500, blade = mergeGeometries(blades);
  const grass = new THREE.InstancedMesh(blade, patchSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.16, 0.03), n);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0;
  for (let tries = 0; i < n && tries < n * 6; tries++) {
    const x = (Math.random() - 0.5) * 11, z = -1.2 + Math.random() * 13.5, y = terrainH(x, z);
    if ((Math.abs(x) < 0.55 && z < 0.7) || y < -1.5 || slopeAt(x, z) > 0.45) continue;
    o.position.set(x, y - 0.01, z);
    o.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3);
    const sc = 0.7 + Math.random() * 0.9;
    o.scale.set(sc, sc * (0.7 + Math.random() * 0.8), sc);
    o.updateMatrix();
    grass.setMatrixAt(i, o.matrix);
    grass.setColorAt(i++, c.setHSL(0.12 + Math.random() * 0.1, 0.28 + Math.random() * 0.15, 0.24 + Math.random() * 0.16));
  }
  grass.count = i;
  scene.add(grass);
}
{
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2)), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + noise3(v.x * 3, v.y * 3, v.z * 3) * 0.25); v.y = Math.max(v.y * 0.7, -0.2); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const N = mobile ? 160 : 380, mesh = new THREE.InstancedMesh(paint(g, 0xffffff), patchSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 1, 0.04), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0;
  for (let tries = 0; i < N && tries < N * 20; tries++) {
    const x = (Math.random() - 0.5) * 170, z = -72 + Math.random() * 100, y = terrainH(x, z), sl = slopeAt(x, z);
    if (sl > 1.1 || y < GROUND + 0.5 || z > COAST(x) - 10 || Math.hypot(x, z - 3) < 6.5) continue;
    const sc = 0.4 + Math.random() * (y > -10 ? 0.6 : 1.6);
    o.position.set(x, y - sc * 0.1, z);
    o.rotation.set(0, Math.random() * 6, 0);
    o.scale.set(sc * (1 + Math.random() * 0.4), sc * (0.6 + Math.random() * 0.5), sc);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i++, c.setHSL(0.2 + Math.random() * 0.08, 0.3 + Math.random() * 0.15, 0.13 + Math.random() * 0.09));
  }
  mesh.count = i;
  scene.add(mesh);
}

function palmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.4, 9, 7, 8, true).translate(0, 4.5, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.pow(tp.getY(i) / 9, 2) * 1.1);
  trunk.deleteAttribute('uv');
  parts.push(paint(trunk, 0x6e5a40).toNonIndexed());
  for (let k = 0; k < 10; k++) {
    const phi = (k / 10) * Math.PI * 2 + Math.random() * 0.3, L = 3.6 + Math.random() * 1.2, droop = 0.7 + Math.random() * 0.4;
    const pos = [], seg = 7, dir = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi)), side = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, w = 0.55 * Math.sin(Math.PI * Math.min(t * 1.4, 1)) + 0.05;
      const c = new THREE.Vector3(1.1, 9, 0).addScaledVector(dir, L * t);
      c.y += L * (0.45 * t - droop * t * t);
      pos.push(c.clone().addScaledVector(side, w).add(new THREE.Vector3(0, -0.12 * w, 0)), c.clone().addScaledVector(side, -w).add(new THREE.Vector3(0, -0.12 * w, 0)), c);
    }
    const tri = [];
    for (let i = 0; i < seg; i++) {
      const a = pos[i * 3], b = pos[i * 3 + 1], m = pos[i * 3 + 2], a2 = pos[i * 3 + 3], b2 = pos[i * 3 + 4], m2 = pos[i * 3 + 5];
      tri.push(a, m, a2, m, m2, a2, m, b, m2, b, b2, m2);
    }
    const f = new THREE.BufferGeometry().setFromPoints(tri);
    f.computeVertexNormals();
    parts.push(paint(f, k % 2 ? 0x3b6a2a : 0x52813a));
  }
  return mergeGeometries(parts);
}
const palms = (() => {
  const spots = [...palmSpots];
  for (let x = -R1; x < R1; x += 9 + Math.random() * 8) { const z = COAST(x) - 30 + Math.random() * 10; if (terrainH(x, z) <= GROUND - 1) spots.push([x, GROUND, z]); }
  for (let tries = 0, k = 0; k < 30 && tries < 2000; tries++) {
    const x = (Math.random() - 0.5) * 160, z = -70 + Math.random() * 60, y = terrainH(x, z);
    if (y > -35 || y < GROUND + 0.3 || slopeAt(x, z) > 0.6) continue;
    spots.push([x, y, z]); k++;
  }
  const list = mobile ? spots.filter((_, i) => i % 2 === 0) : spots;
  const mat = patchSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 13, 0.35);
  const mesh = new THREE.InstancedMesh(palmGeometry(), mat, list.length);
  const o = new THREE.Object3D();
  list.forEach(([x, y, z], i) => {
    o.position.set(x, y, z);
    o.rotation.set(0, Math.random() * Math.PI * 2, 0);
    o.scale.setScalar(0.75 + Math.random() * 0.6);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  scene.add(mesh);
  return mesh;
})();

const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
{
  const tanks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 10).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.6 }), roofs.length * 2);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 2.6, 3).translate(0, 1.3, 0), roofMat, roofs.length);
  const o = new THREE.Object3D();
  let ti = 0;
  roofs.forEach(([x, y, z, w, d], i) => {
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      o.position.set(x + (Math.random() - 0.5) * (w - 2.5), y, z + (Math.random() - 0.5) * (d - 2.5));
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      tanks.setMatrixAt(ti++, o.matrix);
    }
    o.position.set(x + (Math.random() - 0.5) * (w - 4), y, z + (Math.random() - 0.5) * (d - 4));
    o.scale.set(0.8 + Math.random() * 0.5, Math.random() < 0.6 ? 1 : 0.001, 0.8 + Math.random() * 0.5);
    o.updateMatrix();
    heads.setMatrixAt(i, o.matrix);
  });
  tanks.count = ti;
  scene.add(tanks, heads);
}

const sandMat = new THREE.MeshStandardMaterial({ color: 0xd8c39c, roughness: 1 });
sandMat.onBeforeCompile = s => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('void main() {', `void main() {
    float cX = vWp.x; ${COAST_GLSL}
    if (vWp.z < coastZ - 40. || vWp.z > coastZ + 4.) discard;`);
};
{
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(2400, 560), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, GROUND + 0.12, 150);
  scene.add(sand);
}

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(5200, 2600, 1, 1),
  new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, sunDir: { value: sunDir }, moonDir: { value: moonDir }, camPos: { value: new THREE.Vector3() },
      hor: { value: env.hor }, top: { value: env.top }, sunCol: { value: env.lc }, fogCol: { value: env.fog },
      fogD: { value: 0.003 }, night: { value: 0 }, dayish: { value: 1 },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float time, fogD, night, dayish; uniform vec3 sunDir, moonDir, camPos, hor, top, sunCol, fogCol;
      varying vec3 vW;
      void main(){
        float cX = vW.x; ${COAST_GLSL}
        float dz = vW.z - coastZ;
        if (dz < 0.) discard;
        vec2 p = vW.xz; vec2 g = vec2(0.);
        vec2 D[5]; D[0] = vec2(.8,.6); D[1] = vec2(-.5,.86); D[2] = vec2(.2,-.98); D[3] = vec2(.95,-.3); D[4] = vec2(-.7,-.7);
        float F[5]; F[0] = .06; F[1] = .11; F[2] = .19; F[3] = .37; F[4] = .71;
        for (int i = 0; i < 5; i++) { float ph = dot(D[i], p) * F[i] + time * (1.1 + float(i) * .45); g += D[i] * cos(ph) * (.32 / (1. + float(i))); }
        vec3 n = normalize(vec3(-g.x, 1., -g.y));
        vec3 V = normalize(camPos - vW);
        float fres = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
        vec3 R = reflect(-V, n);
        vec3 skyc = mix(hor, top, clamp(R.y * 2.5, 0., 1.));
        vec3 deep = mix(vec3(.004, .02, .04), vec3(.02, .14, .2), dayish);
        vec3 col = mix(deep, skyc, fres);
        float s = max(dot(R, sunDir), 0.), up = smoothstep(-.05, .08, sunDir.y);
        col += sunCol * (pow(s, 500.) * 8. + pow(s, 50.) * .35) * up;
        col += vec3(.8, .85, 1.) * pow(max(dot(R, moonDir), 0.), 300.) * 3. * night;
        float foam = smoothstep(16., 0., dz) * smoothstep(.2, 1., sin(dz * .55 - time * 1.6 + sin(vW.x * .05) * 2.));
        col = mix(col, vec3(.85, .9, .92) * (.35 + .65 * dayish), foam * .7);
        float d = length(camPos - vW);
        col = mix(col, fogCol, 1. - exp(-fogD * fogD * d * d * .7));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
);
water.rotation.x = -Math.PI / 2;
water.position.set(0, GROUND + 0.35, 1300);
scene.add(water);

function gradientTexture(stops, w = 4, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, h, 0, 0);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}
const lighthouse = (() => {
  const g = new THREE.Group(), x = -70;
  g.position.set(x, GROUND, COAST(x) - 22);
  const sc = document.createElement('canvas');
  sc.width = 4; sc.height = 64;
  const sg = sc.getContext('2d');
  for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#f2efe8' : '#b8322a'; sg.fillRect(0, i * 8, 4, 8); }
  const stripe = new THREE.CanvasTexture(sc);
  stripe.colorSpace = THREE.SRGBColorSpace;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.8, 44, 18), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 }));
  tower.position.y = 22;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0x2a2a2e }));
  gallery.position.y = 44.2;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff0c0, emissiveIntensity: 0.2 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12), lampMat);
  lamp.position.y = 45.6;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x8a2a24 }));
  roof.position.y = 47.7;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, alphaMap: gradientTexture([[0, '#000'], [0.75, '#555'], [1, '#fff']]), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.ConeGeometry(9, 220, 20, 1, true).rotateZ(Math.PI / 2).translate(110, 0, 0);
  const rotor = new THREE.Group();
  rotor.position.y = 45.6;
  rotor.add(new THREE.Mesh(beamGeo, beamMat), new THREE.Mesh(beamGeo, beamMat).rotateY(Math.PI));
  const glowPt = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 45.6, 0)]), glowMat({ size: 14, color: 0xfff0c0, fog: false }));
  g.add(tower, gallery, lamp, roof, rotor, glowPt);
  scene.add(g);
  return { rotor, beamMat, lampMat, glow: glowPt.material };
})();

const boats = (() => {
  const N = mobile ? 10 : 22;
  const hull = mergeGeometries([new THREE.BoxGeometry(2.2, 0.9, 7).translate(0, 0.45, 0), new THREE.BoxGeometry(1.6, 1.3, 2.2).translate(0, 1.5, -1), new THREE.BoxGeometry(0.12, 4, 0.12).translate(0, 2.5, 1)]);
  const mesh = new THREE.InstancedMesh(hull, new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
  const COLS = [0xb84a3a, 0x2f5fa8, 0xe9e4d8, 0xd9a521, 0x2a8a6a];
  const list = [], c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 1200;
    list.push({ x, z: COAST(x) + 30 + Math.random() * 380, v: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2.5), ph: Math.random() * 6 });
    mesh.setColorAt(i, c.set(COLS[i % COLS.length]));
  }
  scene.add(mesh);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const lm = glowMat({ size: 2.6, color: 0xffe6b0, fog: false });
  scene.add(new THREE.Points(lg, lm));
  const o = new THREE.Object3D();
  return {
    update(dt, t, lights) {
      const lp = lg.attributes.position.array;
      list.forEach((b, i) => {
        b.x += b.v * dt;
        if (b.x > 650) b.x = -650; else if (b.x < -650) b.x = 650;
        if (b.z < COAST(b.x) + 25) b.z = COAST(b.x) + 25;
        const y = GROUND + 0.1 + Math.sin(t * 1.2 + b.ph) * 0.18;
        o.position.set(b.x, y, b.z);
        o.rotation.set(Math.sin(t * 0.9 + b.ph) * 0.05, b.v > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(t * 1.3 + b.ph) * 0.06);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        lp.set([b.x, y + 4.6, b.z], i * 3);
      });
      mesh.instanceMatrix.needsUpdate = true;
      lg.attributes.position.needsUpdate = true;
      lm.opacity = 0.15 + 0.85 * lights;
    },
  };
})();

const figure = new THREE.Group();
{
  const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const shirt = M(0xe7e1d6), pants = M(0x1b2232), skin = M(0x8d5b3d, 0.6), hair = M(0x120d0b, 1), shoe = M(0x262626);
  const Y = new THREE.Vector3(0, 1, 0);
  const limb = (a, b, r, m) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, dir.length(), 6, 12), m);
    mesh.position.copy(A).add(B).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(Y, dir.normalize());
    figure.add(mesh);
    return mesh;
  };
  const ball = (p, r, m, s = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), m);
    mesh.position.set(...p);
    mesh.scale.set(...s);
    figure.add(mesh);
    return mesh;
  };
  ball([0, 0.13, 0.02], 0.17, pants, [1.15, 0.6, 1]);
  limb([0, 0.18, 0.02], [0, 0.5, -0.07], 0.155, shirt).scale.set(1.25, 1, 0.9);
  ball([0, 0.56, -0.07], 0.13, shirt, [1.6, 0.7, 1]);
  limb([0, 0.62, -0.09], [0, 0.7, -0.11], 0.045, skin);
  ball([0, 0.79, -0.13], 0.1, skin, [0.92, 1.08, 1]);
  ball([0, 0.83, -0.11], 0.104, hair, [0.95, 0.9, 1]);
  ball([0, 0.73, -0.18], 0.07, hair, [1, 0.8, 0.7]);
  for (const s of [1, -1]) {
    limb([0.1 * s, 0.11, 0], [0.13 * s, 0.12, -0.46], 0.078, pants);
    limb([0.13 * s, 0.12, -0.46], [(0.14 + 0.02 * s) * s, -0.32, -0.52 - 0.04 * s], 0.062, pants);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), shoe);
    f.position.set((0.15 + 0.02 * s) * s, -0.39, -0.6 - 0.04 * s);
    figure.add(f);
    limb([0.2 * s, 0.56, -0.07], [0.17 * s, 0.25, -0.36], 0.055, shirt);
    limb([0.17 * s, 0.25, -0.36], [0.04 * s, 0.33, -0.56], 0.045, skin);
  }
  ball([0, 0.34, -0.58], 0.055, skin, [1.4, 1, 1]);
}
scene.add(figure);

// seated GLB: feet bottom at y=-0.42, back of hips at z=+0.18, facing -z
const FIG = { height: 1.32, footY: -0.42, backZ: 0.18, yaw: Math.PI };
const AV = { yaw: { value: 0 }, pitch: { value: 0 }, breath: { value: 0 }, pivot: { value: new THREE.Vector3() }, band: { value: new THREE.Vector4() }, chest: { value: new THREE.Vector3() } };
const head = { world: new THREE.Vector3(0, 0.78, -0.2), ready: false };
const pmrem = new THREE.PMREMGenerator(renderer);
const studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const heroKey = new THREE.PointLight(0xfff1e2, 0, 6, 2);
scene.add(heroKey);
let avatar = null, avatarMats = [];

function patchAvatar(mat, base = false) {
  mat.onBeforeCompile = s => {
    if (base) s.fragmentShader = s.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float avLum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
        float avHair = 1. - smoothstep(.035, .085, avLum);
        diffuseColor.rgb *= mix(1., .55, avHair);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = max(roughnessFactor, mix(.5, .78, avHair));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = 0.;`);
    Object.assign(s.uniforms, { uYaw: AV.yaw, uPitch: AV.pitch, uBreath: AV.breath, uPivot: AV.pivot, uBand: AV.band, uChest: AV.chest });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uYaw, uPitch, uBreath; uniform vec3 uPivot, uChest; uniform vec4 uBand;')
      .replace('#include <beginnormal_vertex>', `
        float avW = smoothstep(uBand.x - uBand.y, uBand.x + uBand.y, position.y);
        float cyw = cos(uYaw * avW), syw = sin(uYaw * avW), cpw = cos(uPitch * avW), spw = sin(uPitch * avW);
        mat3 avR = mat3(cyw, 0., -syw, 0., 1., 0., syw, 0., cyw) * mat3(1., 0., 0., 0., cpw, spw, 0., -spw, cpw);
        vec3 objectNormal = avR * vec3(normal);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = avR * (position - uPivot) + uPivot;
        float avC = smoothstep(uBand.z, mix(uBand.z, uBand.w, .4), position.y) * (1. - smoothstep(mix(uBand.z, uBand.w, .8), uBand.w, position.y));
        transformed.xz += (position.xz - uChest.xz) * uBreath * avC;
        transformed.y += uBreath * uChest.y * smoothstep(uBand.z, uBand.w, position.y) * (1. - avW);`);
  };
  mat.customProgramCacheKey = () => (base ? 'avatar-base' : 'avatar-decal');
  return mat;
}

function beardTexture() {
  const W = 512, H = 384, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
  const density = (u, v) => {
    const x = (u - 0.5) * 0.85, y = -0.61 + 0.62 * v, ax = Math.abs(x);
    const moustache = gauss(y, -0.108, 0.016) * (ax < 0.18 ? 1 : gauss(ax, 0.18, 0.02)) * (0.75 + 0.25 * gauss(x, 0, 0.05));
    const lips = gauss(y, -0.205, 0.045) * gauss(ax, 0, 0.13);
    const chin = gauss(y, -0.40, 0.085) * gauss(ax, 0, 0.12);
    const soul = gauss(y, -0.29, 0.025) * gauss(ax, 0, 0.035);
    const jawY = -0.40 + 0.9 * ax * ax;
    const jaw = gauss(y, jawY, 0.05) * smoothstep(ax, 0.05, 0.2) * (1 - smoothstep(ax, 0.36, 0.42));
    const sideFade = 1 - smoothstep(ax, 0.38, 0.43), bottom = smoothstep(y, -0.6, -0.5);
    return clamp((moustache * 1.25 + chin * 1.15 + soul * 0.9 + jaw * 0.55) * (1 - lips * 0.95) * sideFade * bottom, 0, 1);
  };
  for (let i = 0; i < 52000; i++) {
    const u = Math.random(), v = Math.random(), d = density(u, v);
    if (Math.random() > d) continue;
    const px = u * W, py = (1 - v) * H, x = u - 0.5;
    const ang = Math.PI / 2 + (x * 2.2) + (Math.random() - 0.5) * 0.7, len = 2.5 + Math.random() * 4.5 * d;
    g.strokeStyle = `rgba(${10 + Math.random() * 12},${7 + Math.random() * 7},${6 + Math.random() * 5},${0.35 + 0.6 * d})`;
    g.lineWidth = 0.8 + Math.random() * 0.9;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function setupAvatar(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, H = bb.max.y - bb.min.y, neckY = bb.min.y + H * 0.79;
  let nx = 0, nz = 0, nn = 0, hx = 0, hz = 0, hn = 0, cx = 0, cz = 0, cn = 0, hMinX = 1e9, hMaxX = -1e9;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(y - neckY) < H * 0.012) { nx += x; nz += z; nn++; }
    if (y > neckY + H * 0.04) { hx += x; hz += z; hn++; hMinX = Math.min(hMinX, x); hMaxX = Math.max(hMaxX, x); }
    if (y > bb.min.y + H * 0.55 && y < bb.min.y + H * 0.74) { cx += x; cz += z; cn++; }
  }
  AV.pivot.value.set(nx / nn, neckY, nz / nn);
  AV.band.value.set(neckY, H * 0.022, bb.min.y + H * 0.48, bb.min.y + H * 0.77);
  AV.chest.value.set(cx / cn, H * 0.004, cz / cn);
  mesh.updateWorldMatrix(true, false);
  const s = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld).x;
  const headW = (hMaxX - hMinX) * s;
  const hc = new THREE.Vector3(hx / hn, neckY + H * 0.1, hz / hn).applyMatrix4(mesh.matrixWorld);
  head.world.copy(hc);

  const ray = new THREE.Raycaster(), topY = new THREE.Vector3(0, bb.max.y, 0).applyMatrix4(mesh.matrixWorld).y;
  const neckW = new THREE.Vector3(0, neckY, 0).applyMatrix4(mesh.matrixWorld).y;
  let nose = null;
  for (let y = neckW + 0.01; y < topY - (topY - neckW) * 0.3; y += 0.002) {
    ray.set(new THREE.Vector3(hc.x, y, hc.z - 2), new THREE.Vector3(0, 0, 1));
    const hit = ray.intersectObject(mesh, false)[0];
    if (hit && (!nose || hit.point.z < nose.z)) nose = hit.point.clone();
  }
  if (!nose) return;
  const noseL = mesh.worldToLocal(nose.clone()), headWL = hMaxX - hMinX, neck2 = noseL.y - 0.62 * headWL;
  let px = 0, pz = 0, pn = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - neck2) < H * 0.012) { px += pos.getX(i); pz += pos.getZ(i); pn++; }
  if (pn) AV.pivot.value.set(px / pn, neck2, pz / pn);
  AV.band.value.x = neck2;
  AV.band.value.y = headWL * 0.07;
  AV.band.value.w = Math.min(AV.band.value.w, neck2 - headWL * 0.1);
  const W = headW * 0.92;
  const decalGeo = new DecalGeometry(mesh, new THREE.Vector3(hc.x, nose.y - 0.3 * W, nose.z + 0.38 * W), new THREE.Euler(0, 0, 0), new THREE.Vector3(W * 0.85, W * 0.62, W * 0.95));
  decalGeo.applyMatrix4(mesh.matrixWorld.clone().invert());
  const beardMat = patchAvatar(new THREE.MeshStandardMaterial({ map: beardTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9, envMap: studioEnv, envMapIntensity: 0.3 }));
  mesh.add(new THREE.Mesh(decalGeo, beardMat));
  avatarMats.push(beardMat);
  head.ready = true;
  document.documentElement.classList.add('scene-ready');
  if (paramsQ.has('debug')) console.log('avatar', { headW, nose, hc });
}

const loadGLBAvatar = () => new GLTFLoader().load('assets/figure.glb', gltf => {
  const m = gltf.scene;
  let mesh = null;
  m.traverse(o => {
    if (!o.isMesh) return;
    mesh = mesh || o;
    o.material.side = THREE.FrontSide;
    o.material.envMap = studioEnv;
    if (o.material.map) o.material.map.anisotropy = 8;
    patchAvatar(o.material, true);
    avatarMats.push(o.material);
  });
  m.rotation.y = FIG.yaw;
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
  m.scale.setScalar(FIG.height / size.y);
  box.setFromObject(m);
  m.position.set(-(box.min.x + box.max.x) / 2, FIG.footY - box.min.y, FIG.backZ - box.max.z);
  avatar = new THREE.Group();
  avatar.add(m);
  scene.add(avatar);
  avatar.updateMatrixWorld(true);
  figure.visible = false;
  if (mesh) setupAvatar(mesh);
}, undefined, () => {});

const rig = { mixer: null, A: {}, bones: {}, root: null, char: null, posture: 'sit', current: null, busy: false, want: 'sit', offset: new THREE.Vector3(), standOffset: new THREE.Vector3(), base: new THREE.Vector3(), center: new THREE.Vector3() };
const POSE_BY_SECTION = ['sit', 'sit', 'sit', 'idle', 'look', 'idle', 'look', 'wave', 'idle'];
function hairOnly(mat) {
  mat.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float avLum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
        float avHair = 1. - smoothstep(.035, .085, avLum);
        diffuseColor.rgb *= mix(1., .6, avHair);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = max(roughnessFactor, mix(.5, .78, avHair));`);
  };
  mat.customProgramCacheKey = () => 'rig-hair';
  return mat;
}
async function loadRig() {
  const tl = new THREE.TextureLoader();
  const tex = (n, srgb) => { const t = tl.load(`assets/avatar/${n}.webp`); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const gltf = await new GLTFLoader().loadAsync('assets/avatar/avatar.glb'), char = gltf.scene;
  const mat = hairOnly(new THREE.MeshStandardMaterial({ map: tex('diffuse', true), normalMap: tex('normal'), roughnessMap: tex('roughness'), roughness: 1, metalness: 0, envMap: studioEnv }));
  char.traverse(o => {
    if (o.isMesh) { o.material = mat; o.frustumCulled = false; }
    if (o.isBone) rig.bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  avatarMats.push(mat);
  char.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(char);
  char.scale.multiplyScalar(1.75 / (box.max.y - box.min.y));
  rig.root = new THREE.Group();
  rig.root.rotation.y = Math.PI;
  rig.root.add(char);
  scene.add(rig.root);
  rig.char = char;
  rig.mixer = new THREE.AnimationMixer(char);
  const A = rig.A;
  for (const n of ['sit', 'rise', 'idle', 'look', 'wave']) A[n] = rig.mixer.clipAction(gltf.animations.find(c => c.name === n));
  A.rise.setLoop(THREE.LoopOnce); A.rise.clampWhenFinished = true;
  const hipsTrack = c => c.tracks.find(t => /Hips\.position$/.test(t.name));
  const rt = hipsTrack(A.rise.getClip()), it = hipsTrack(A.idle.getClip()), sc = char.scale.x;
  if (rt && it) { const n = rt.values.length; rig.standOffset.set(-(rt.values[n - 3] - it.values[0]) * sc, 0, -(rt.values[n - 1] - it.values[2]) * sc); }
  A.sit.play();
  rig.current = A.sit;
  rig.mixer.update(0.01);
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const lt = (rig.bones.LeftToeBase || rig.bones.LeftFoot).getWorldPosition(v), rtw = (rig.bones.RightToeBase || rig.bones.RightFoot).getWorldPosition(w);
  const hips = rig.bones.Hips.getWorldPosition(new THREE.Vector3());
  rig.base.set(-hips.x, -Math.min(lt.y, rtw.y) + 0.025, -0.22 - (lt.z + rtw.z) / 2);
  rig.root.position.copy(rig.base);
  rig.root.updateMatrixWorld(true);
  rig.bones.Hips.getWorldPosition(hips);
  const seatTop = hips.y - 0.1, seat = new THREE.Mesh(rockGeometry(), rockMat);
  seat.scale.set(0.5, seatTop / 0.75, 0.46);
  seat.position.set(hips.x, terrainH(hips.x, hips.z + 0.16) - 0.02, hips.z + 0.16);
  scene.add(seat);
  laptop.rest.position.set(hips.x - 0.28, seatTop - 0.02, hips.z + 0.22);
  laptop.rest.quaternion.setFromEuler(new THREE.Euler(0, Math.PI + 0.35, 0));
  scene.add(laptop.g);
  rig.mixer.addEventListener('finished', e => {
    if (e.action !== A.rise) return;
    rig.busy = false;
    rig.posture = A.rise.timeScale > 0 ? 'stand' : 'sit';
    fadeTo(rig.posture === 'stand' ? A[rig.want === 'sit' ? 'idle' : rig.want] : A.sit, 0.5);
  });
  figure.visible = false;
  head.ready = true;
  document.documentElement.classList.add('scene-ready');
}
const ikV = Array.from({ length: 6 }, () => new THREE.Vector3()), ikQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function rotateWorld(bone, axis, ang) {
  if (!ang || !isFinite(ang)) return;
  bone.getWorldQuaternion(ikQ[0]);
  bone.parent.getWorldQuaternion(ikQ[1]).invert();
  ikQ[2].setFromAxisAngle(axis, ang).multiply(ikQ[0]);
  bone.quaternion.copy(ikQ[1].multiply(ikQ[2]));
  bone.updateMatrixWorld(true);
}
function armIK(up, fore, hand, target, w) {
  const [a, b, c, x, y] = ikV, q0 = up.quaternion.clone(), q1 = fore.quaternion.clone();
  up.getWorldPosition(a); fore.getWorldPosition(b); hand.getWorldPosition(c);
  const lab = a.distanceTo(b), lcb = b.distanceTo(c), lat = clamp(a.distanceTo(target), Math.abs(lab - lcb) + 0.01, lab + lcb - 0.01);
  x.subVectors(a, b).normalize(); y.subVectors(c, b).normalize();
  const cur = Math.acos(clamp(x.dot(y), -1, 1)), want = Math.acos(clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  rotateWorld(fore, x.clone().cross(y).normalize(), want - cur);
  hand.getWorldPosition(c);
  x.subVectors(c, a).normalize(); y.subVectors(target, a).normalize();
  rotateWorld(up, x.clone().cross(y).normalize(), Math.acos(clamp(x.dot(y), -1, 1)));
  up.quaternion.copy(q0.slerp(up.quaternion, w));
  fore.quaternion.copy(q1.slerp(fore.quaternion, w));
  up.updateMatrixWorld(true);
}
const laptop = (() => {
  const W = 0.304, D = 0.214, T = 0.012, L = 0.006;
  const g = new THREE.Group(), alu = new THREE.MeshStandardMaterial({ color: 0x9fa3aa, metalness: 0.9, roughness: 0.3 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(W, T, D, 3, 0.0045).translate(0, T / 2, 0), alu);
  const deckC = document.createElement('canvas');
  deckC.width = 512; deckC.height = 360;
  const dg = deckC.getContext('2d');
  dg.fillStyle = '#9da1a8'; dg.fillRect(0, 0, 512, 360);
  dg.fillStyle = '#8f939a'; dg.fillRect(156, 22, 200, 128);
  dg.fillStyle = '#16171a'; dg.fillRect(26, 172, 460, 172);
  const kw = 460 / 14;
  for (let r = 0; r < 6; r++) for (let k = 0; k < 14; k++) {
    if (r === 0 && k > 0 && k < 13 && k % 2) continue;
    dg.fillStyle = '#25272c';
    const w = r === 0 && k > 3 && k < 10 ? kw * 1 : kw;
    dg.fillRect(28 + k * kw + 2, 174 + (5 - r) * 28 + 2, w - 4, r === 5 ? 18 : 24);
  }
  dg.fillStyle = '#25272c'; dg.fillRect(28 + 4 * kw + 2, 174 + 5 * 28 - 120 + 122, kw * 6 - 4, 24);
  const deckT = new THREE.CanvasTexture(deckC);
  deckT.colorSpace = THREE.SRGBColorSpace; deckT.anisotropy = 8;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.004, D - 0.004), new THREE.MeshStandardMaterial({ map: deckT, metalness: 0.55, roughness: 0.45 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = T + 0.0004;
  const hinge = new THREE.Group();
  hinge.position.set(0, T, D / 2 - 0.004);
  hinge.rotation.x = 1.9;
  const lid = new THREE.Mesh(new RoundedBoxGeometry(W, L, D, 3, 0.003).translate(0, L / 2, -D / 2), alu);
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.006, D - 0.006), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0.2 }));
  bezel.rotation.set(Math.PI / 2, 0, Math.PI);
  bezel.position.set(0, -0.0004, -D / 2);
  const sc = document.createElement('canvas');
  sc.width = 1024; sc.height = 660;
  const sg = sc.getContext('2d');
  sg.fillStyle = '#1b1d27'; sg.fillRect(0, 0, 1024, 660);
  sg.fillStyle = '#14161e'; sg.fillRect(0, 0, 190, 660);
  sg.fillStyle = '#232634'; sg.fillRect(0, 0, 1024, 34);
  [['#ff5f57', 18], ['#febc2e', 40], ['#28c840', 62]].forEach(([c, x]) => { sg.fillStyle = c; sg.beginPath(); sg.arc(x, 17, 6, 0, 7); sg.fill(); });
  for (let i = 0; i < 14; i++) { sg.fillStyle = i === 3 ? '#3b82f6' : '#3a3f52'; sg.fillRect(22 + (i % 3) * 10, 58 + i * 26, 110 - (i * 37) % 60, 9); }
  const C = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#a6accd'];
  for (let i = 0; i < 22; i++) {
    let x = 230 + ((i * 7) % 5 < 2 ? 0 : ((i * 3) % 4) * 26);
    sg.fillStyle = '#3a3f52'; sg.fillRect(204, 58 + i * 24, 14, 8);
    for (let k = 0; k < 1 + ((i * 5) % 4); k++) {
      const w = 30 + ((i * 13 + k * 29) % 110);
      sg.fillStyle = C[(i + k * 3) % C.length];
      sg.fillRect(x, 56 + i * 24, w, 10);
      x += w + 10;
    }
  }
  sg.fillStyle = '#0f1117'; sg.fillRect(190, 560, 834, 100);
  sg.fillStyle = '#28c840'; sg.fillRect(206, 578, 90, 9);
  sg.fillStyle = '#a6accd'; sg.fillRect(306, 578, 240, 9); sg.fillRect(206, 600, 160, 9);
  const st = new THREE.CanvasTexture(sc);
  st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: st, toneMapped: false, color: 0xbfc4cc });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.03), screenMat);
  screen.rotation.set(Math.PI / 2, 0, Math.PI);
  screen.position.set(0, -0.0008, -D / 2 - 0.004);
  const glow = new THREE.PointLight(0xa9c2ff, 0, 1.4, 2);
  glow.position.set(0, -0.06, -D / 2);
  hinge.add(lid, bezel, screen, glow);
  g.add(base, deck, hinge);
  g.traverse(o => { o.frustumCulled = false; });
  const lap = new THREE.Object3D(), rest = new THREE.Object3D();
  return { g, lap, rest, glow, screenMat, W, D, T, k: 0 };
})();
const lapV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], lapM = new THREE.Matrix4();
function placeLaptop(w) {
  const B = rig.bones;
  if (!B.LeftUpLeg || !B.LeftLeg) return;
  const [hl, hr, kl, kr, fwd, side] = lapV;
  B.LeftUpLeg.getWorldPosition(hl); B.RightUpLeg.getWorldPosition(hr);
  B.LeftLeg.getWorldPosition(kl); B.RightLeg.getWorldPosition(kr);
  const hipM = hl.clone().add(hr).multiplyScalar(0.5), kneeM = kl.clone().add(kr).multiplyScalar(0.5);
  fwd.subVectors(kneeM, hipM).normalize();
  side.subVectors(hl, hr).normalize();
  const up = new THREE.Vector3().crossVectors(fwd, side).normalize();
  if (up.y < 0) up.negate();
  side.crossVectors(up, fwd).normalize();
  lapM.makeBasis(side, up, fwd);
  laptop.lap.quaternion.setFromRotationMatrix(lapM);
  laptop.lap.position.lerpVectors(hipM, kneeM, 0.6).addScaledVector(up, 0.072);
  const k = smoothstep(w, 0.15, 0.9);
  laptop.k = k;
  laptop.g.position.lerpVectors(laptop.rest.position, laptop.lap.position, k);
  laptop.g.quaternion.slerpQuaternions(laptop.rest.quaternion, laptop.lap.quaternion, k);
  laptop.g.updateMatrixWorld(true);
}
const typeT = { t: 0 };
function restHands(w) {
  const B = rig.bones, t = ikV[5];
  typeT.t += 1 / 60;
  for (const [S, o] of [['Left', 1], ['Right', -1]]) {
    if (!B[S + 'Arm'] || !B[S + 'UpLeg']) continue;
    const tap = reduced ? 0 : Math.max(0, Math.sin(typeT.t * (o > 0 ? 11 : 13.5) + o)) * Math.max(0, Math.sin(typeT.t * 0.7 + o * 2));
    t.set(o * 0.075, laptop.T + 0.04 + tap * 0.008, -laptop.D / 2 + 0.035);
    laptop.g.localToWorld(t);
    armIK(B[S + 'Arm'], B[S + 'ForeArm'], B[S + 'Hand'], t, w);
    B[S + 'Hand'].rotateX(-0.25 * w);
  }
}
function fadeTo(next, d = 0.45) {
  if (rig.current === next) return;
  next.reset().setEffectiveWeight(1).play();
  rig.current.crossFadeTo(next, d, false);
  rig.current = next;
}
function updateRig(dt, section) {
  const A = rig.A;
  rig.want = POSE_BY_SECTION[clamp(section, 0, POSE_BY_SECTION.length - 1)];
  const wantStand = rig.want !== 'sit';
  if (!rig.busy) {
    if (wantStand && rig.posture === 'sit') {
      A.rise.timeScale = 1;
      A.rise.reset();
      fadeTo(A.rise, 0.35);
      rig.busy = true;
    } else if (!wantStand && rig.posture === 'stand') {
      A.rise.reset();
      A.rise.timeScale = -1;
      A.rise.time = A.rise.getClip().duration;
      A.rise.setEffectiveWeight(1).play();
      rig.current.crossFadeTo(A.rise, 0.4, false);
      rig.current = A.rise;
      rig.busy = true;
      rig.posture = 'sitting';
    } else if (rig.posture === 'stand') fadeTo(A[rig.want]);
  }
  rig.mixer.update(dt);
  const target = rig.posture === 'stand' ? rig.standOffset : new THREE.Vector3();
  rig.offset.lerp(target, 1 - Math.exp(-dt * 7));
  rig.root.position.copy(rig.base).add(rig.offset);
  const faceCam = rig.want === 'wave' && rig.posture === 'stand';
  const wantRot = faceCam ? Math.atan2(camera.position.x - rig.root.position.x, camera.position.z - rig.root.position.z) : Math.PI;
  rig.root.rotation.y += wrapPi(wantRot - rig.root.rotation.y) * (1 - Math.exp(-dt * 2.5));
  const B = rig.bones, s = rig.current === A.look ? 0.3 : 1;
  const sitW = A.sit.isRunning() ? A.sit.getEffectiveWeight() : 0;
  rig.root.updateMatrixWorld(true);
  placeLaptop(sitW);
  if (sitW > 0.01) restHands(sitW * laptop.k);
  if (B.Neck && B.Head) {
    B.Neck.rotateY(AV.yaw.value * 0.4 * s);
    B.Head.rotateY(AV.yaw.value * 0.6 * s);
    B.Head.rotateX(AV.pitch.value * 0.5 * s);
  }
  rig.root.updateMatrixWorld(true);
  B.Head?.getWorldPosition(head.world);
  head.world.y += 0.06;
  (B.Spine2 || B.Spine1 || B.Hips).getWorldPosition(rig.center);
  CENTER.lerp(rig.center.setY(rig.center.y - 0.12), 1 - Math.exp(-dt * 3));
}
loadRig().catch(() => loadGLBAvatar());
setTimeout(() => document.documentElement.classList.add('scene-ready'), 25000);

/* ---------- sky life: planes, birds, shooting stars ---------- */

function trailTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.85, 'rgba(255,255,255,.9)');
  gr.addColorStop(1, 'rgba(255,255,255,.2)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
const TRAIL = trailTexture();

function makePlane() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.4, metalness: 0.2, fog: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 30, 4, 10), m);
  body.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(36, 0.5, 6), m);
  wing.position.z = 1;
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 3.5), m);
  tailW.position.z = -14;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 4.5), m);
  fin.position.set(0, 3.5, -14.5);
  g.add(body, wing, tailW, fin);
  const nav = new THREE.BufferGeometry();
  nav.setAttribute('position', new THREE.Float32BufferAttribute([-18, 0, 1, 18, 0, 1], 3));
  nav.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.15, 0.15, 0.2, 1, 0.3], 3));
  const navMat = glowMat({ size: 5, sizeAttenuation: false, vertexColors: true, fog: false });
  const strobe = new THREE.BufferGeometry();
  strobe.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -17.5, 0, -2, 0], 3));
  const strobeMat = glowMat({ size: 7, sizeAttenuation: false, color: 0xffffff, fog: false });
  g.add(new THREE.Points(nav, navMat), new THREE.Points(strobe, strobeMat));
  const trailMat = new THREE.MeshBasicMaterial({ map: TRAIL, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const trailGeo = new THREE.PlaneGeometry(1.6, 320).rotateX(-Math.PI / 2).translate(0, 0, -170);
  for (const x of [-7, 7]) for (const rz of [0, Math.PI / 2]) {
    const tr = new THREE.Mesh(trailGeo, trailMat);
    tr.position.x = x;
    tr.rotation.z = rz;
    g.add(tr);
  }
  scene.add(g);
  return { g, navMat, strobeMat, trailMat, dir: new THREE.Vector3(), speed: 0, wait: Math.random() * 6, alive: false };
}
const planes = Array.from({ length: mobile ? 2 : 3 }, makePlane);
function spawnPlane(p) {
  const a = Math.random() * Math.PI * 2, alt = 50 + Math.random() * 70;
  const start = new THREE.Vector3(Math.cos(a) * 950, alt, Math.sin(a) * 950);
  const aim = new THREE.Vector3((Math.random() - 0.5) * 600, alt + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 600);
  p.dir.subVectors(aim, start).normalize();
  p.speed = 55 + Math.random() * 30;
  p.g.position.copy(start);
  p.g.lookAt(start.clone().add(p.dir));
  p.alive = true;
}

const birdMat = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.85, side: THREE.DoubleSide, transparent: true, envMap: null });
const wingGeo = new THREE.BufferGeometry();
wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.2, 0, 0, -0.22, 1.1, 0, -0.08, 0, 0, -0.22, 1.1, 0, -0.08, 0.6, 0, -0.3], 3));
const bodyGeo = new THREE.SphereGeometry(0.11, 6, 4).scale(1, 0.9, 3);
function makeFlock(n) {
  const g = new THREE.Group(), birds = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(), L = new THREE.Mesh(wingGeo, birdMat), R = new THREE.Mesh(wingGeo, birdMat);
    R.scale.x = -1;
    b.add(L, R, new THREE.Mesh(bodyGeo, birdMat));
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    b.position.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 7 - row * 0.3 * side);
    b.scale.setScalar(0.55 + Math.random() * 0.25);
    b.userData = { L, R, ph: Math.random() * 6, f: 8 + Math.random() * 3 };
    g.add(b);
    birds.push(b);
  }
  scene.add(g);
  return { g, birds, dir: new THREE.Vector3(), speed: 0, wait: Math.random() * 4, alive: false };
}
const flocks = Array.from({ length: mobile ? 1 : 2 }, (_, i) => makeFlock(7 + i * 4));
function spawnFlock(f) {
  const a = Math.random() * Math.PI * 2, y = -4 + Math.random() * 22;
  const start = new THREE.Vector3(Math.cos(a) * 150, y, Math.sin(a) * 150);
  const aim = new THREE.Vector3((Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 60 - 25);
  f.dir.subVectors(aim, start).normalize();
  f.speed = 8 + Math.random() * 4;
  f.g.position.copy(start);
  f.g.lookAt(start.clone().add(f.dir));
  f.alive = true;
}

const shooter = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0, 0, 0], 3));
  const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const line = new THREE.Line(g, m);
  line.frustumCulled = false;
  scene.add(line);
  return { line, m, d: new THREE.Vector3(), v: new THREE.Vector3(), life: -1, next: 3 };
})();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

const dust = (() => {
  const n = mobile ? 160 : 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 40], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, glowMat({ size: 0.12, color: 0xffc89a, opacity: 0.6 }));
  scene.add(pts);
  return pts;
})();

/* ---------- weather (live Chennai via Open-Meteo) ---------- */

const WX_TEXT = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Drizzle', 57: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Rain', 67: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
const WX_PRESET = { clear: { cloud: 0.08, rain: 0, storm: 0, fog: 0, wind: 6, code: 0 }, cloudy: { cloud: 0.85, rain: 0, storm: 0, fog: 0.1, wind: 14, code: 3 }, rain: { cloud: 0.95, rain: 0.6, storm: 0, fog: 0.25, wind: 18, code: 63 }, storm: { cloud: 1, rain: 1, storm: 1, fog: 0.35, wind: 32, code: 95 }, fog: { cloud: 0.5, rain: 0, storm: 0, fog: 1, wind: 4, code: 45 } };
const wxT = { cloud: 0.3, rain: 0, storm: 0, fog: 0, wind: 8 }, wx = { ...wxT, temp: null, code: null, live: false };
async function fetchWeather() {
  const forced = WX_PRESET[paramsQ.get('weather')];
  if (forced) { Object.assign(wxT, forced); Object.assign(wx, forced, { temp: 30, live: false }); return; }
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.0827&longitude=80.2707&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,visibility&timezone=Asia%2FKolkata');
    const c = (await r.json()).current;
    const code = c.weather_code, rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    wxT.cloud = clamp(c.cloud_cover / 100, 0, 1);
    wxT.rain = rainy ? clamp(0.25 + c.precipitation / 6, 0.25, 1) : 0;
    wxT.storm = code >= 95 ? 1 : 0;
    wxT.fog = code === 45 || code === 48 ? 1 : clamp((12000 - (c.visibility ?? 20000)) / 12000, 0, 0.7);
    wxT.wind = c.wind_speed_10m;
    if (wx.code == null) Object.assign(wx, wxT);
    Object.assign(wx, { temp: Math.round(c.temperature_2m), code, live: true });
  } catch {}
}
fetchWeather();
setInterval(fetchWeather, 15 * 60e3);
const wxLabel = () => wx.code == null ? 'Loading weather…' : `${wx.temp}°C · ${WX_TEXT[wx.code] ?? 'Cloudy'}${wx.live ? '' : ' (preview)'}`;

const rain = (() => {
  const N = mobile ? 900 : 2200, pos = new Float32Array(N * 6), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) seed.set([(Math.random() - 0.5) * 40, Math.random() * 24, (Math.random() - 0.5) * 40], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineBasicMaterial({ color: 0xbfd2e6, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  scene.add(lines);
  let fall = 0;
  return {
    update(dt, amt, wind) {
      m.opacity = amt * 0.55;
      lines.visible = amt > 0.01;
      if (!lines.visible) return;
      fall += dt * 22;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, sl = 0.04 * wind / 10;
      for (let i = 0; i < N; i++) {
        const y = 12 - ((seed[i * 3 + 1] + fall) % 24), x = cx + seed[i * 3] + y * sl, z = cz + seed[i * 3 + 2];
        pos.set([x, cy + y, z, x - 0.8 * sl * 10 * 0.05, cy + y + 0.55, z], i * 6);
      }
      g.attributes.position.needsUpdate = true;
    },
  };
})();
const lightning = { v: 0, next: 4 };

const butterflies = (() => {
  const N = mobile ? 6 : 12, list = [];
  const pal = [['#ff8a1f', '#1a1208'], ['#3aa0ff', '#0a1a3a'], ['#ffd43b', '#3a2a08'], ['#ffffff', '#8a8a8a'], ['#ff5ca8', '#3a0a1f']];
  const tex = pal.map(([a, b]) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = a;
    g.strokeStyle = b;
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(22, 22, 20, 15, -0.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(18, 46, 13, 11, 0.4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = b;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(8 + Math.random() * 26, 12 + Math.random() * 40, 2, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const wing = new THREE.PlaneGeometry(0.07, 0.07).rotateX(-Math.PI / 2).translate(0.035, 0, 0);
  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshStandardMaterial({ map: tex[i % tex.length], transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const g = new THREE.Group(), L = new THREE.Mesh(wing, mat), R = new THREE.Mesh(wing, mat);
    R.scale.x = -1;
    g.add(L, R);
    g.scale.setScalar(0.9 + Math.random() * 0.6);
    scene.add(g);
    list.push({ g, L, R, mat, r: 0.7 + Math.random() * 2.2, a: 0.25 + Math.random() * 0.4, b: 0.6 + Math.random() * 0.8, ph: Math.random() * 6, y: 0.1 + Math.random() * 1.1, prev: new THREE.Vector3() });
  }
  return {
    update(t, vis) {
      list.forEach(b => {
        b.g.visible = vis > 0.05;
        if (!b.g.visible) return;
        b.mat.opacity = vis;
        b.prev.copy(b.g.position);
        const tt = t * b.a + b.ph;
        b.g.position.set(Math.cos(tt) * b.r + Math.sin(tt * 2.3) * 0.25, b.y + Math.sin(t * b.b + b.ph) * 0.35 + Math.sin(t * 7 + b.ph) * 0.03, 1.2 + Math.sin(tt * 0.8) * b.r * 0.9);
        b.g.lookAt(b.g.position.clone().multiplyScalar(2).sub(b.prev));
        const f = Math.sin(t * 22 + b.ph) * 0.9 + 0.3;
        b.L.rotation.z = f;
        b.R.rotation.z = -f;
      });
    },
  };
})();

/* ---------- camera orbit ---------- */

// th: orbit angle around the figure (0 = behind, ±π = in front); sx: screen pan (+ pushes figure left)
const DESK = [
  { th: -1.05, r: 3.5, h: 0.35, sx: -0.95, sy: -0.12 },
  { th: -2.2, r: 2.4, h: 0.25, sx: -0.7, sy: -0.22 },
  { th: -0.35, r: 3.9, h: 0.95, sx: -1.05, sy: -0.32 },
  { th: 0.1, r: 7.5, h: 2.1, sx: 2.3, sy: -0.9 },
  { th: 0.95, r: 4.2, h: 0.3, sx: 1.2, sy: 0 },
  { th: 1.75, r: 5, h: 0.8, sx: -1.3, sy: 0 },
  { th: 2.6, r: 16, h: 7, sx: 0, sy: 2.4 },
  { th: 5.45, r: 3.6, h: 0.5, sx: -1.0, sy: -0.1 },
  { th: 6.3, r: 26, h: 9, sx: 0, sy: 4 },
];
const KEYS = mobile ? DESK.map(k => { const r = k.r * 1.3 + 0.8; return { ...k, r, h: k.h + 0.9, sx: 0, sy: k.sy * 0.5 + r * 0.3 }; }) : DESK;

const anchors = [...document.querySelectorAll('[data-cam]')];
function camProgress() {
  const mid = scrollY + innerHeight * 0.5;
  const c = anchors.map(el => el.offsetTop + Math.min(el.offsetHeight, innerHeight) * 0.5);
  if (mid <= c[0]) return 0;
  for (let i = 0; i < c.length - 1; i++) if (mid < c[i + 1]) return i + (mid - c[i]) / (c[i + 1] - c[i]);
  return c.length - 1;
}

const ease = t => t * t * (3 - 2 * t);
let camP = 0;
const target = { ...KEYS[0] }, cur = { ...KEYS[0] };
function sample(p) {
  const i = Math.min(Math.floor(p), KEYS.length - 2), f = ease(clamp(p - i, 0, 1));
  const a = KEYS[i], b = KEYS[i + 1];
  for (const k in a) target[k] = a[k] + (b[k] - a[k]) * f;
}

const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; }, { passive: true });

const CENTER = new THREE.Vector3(0, 0.42, -0.25);
const look = new THREE.Vector3(), right = new THREE.Vector3();
function place() {
  const th = cur.th + mouse.x * 0.12;
  right.set(Math.cos(th), 0, -Math.sin(th));
  look.copy(CENTER).addScaledVector(right, cur.sx);
  look.y += -cur.sy + mouse.y * 0.1;
  camera.position.set(look.x + Math.sin(th) * cur.r, look.y + cur.h - mouse.y * 0.25, look.z + Math.cos(th) * cur.r);
  camera.lookAt(look);
  const dbg = paramsQ.get('cam');
  if (dbg && head.ready) {
    const a = { face: [0, 0], left: [-0.8, 0], right: [0.8, 0], q: [-0.45, 0.1] }[dbg] || [0, 0];
    camera.position.set(head.world.x + Math.sin(a[0]) * 0.55, head.world.y + a[1], head.world.z - Math.cos(a[0]) * 0.55);
    camera.lookAt(head.world);
  }
}

/* ---------- avatar life ---------- */

const gaze = { idleYaw: 0, idlePitch: 0.06, next: 0 };
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const toCam = new THREE.Vector3(), camRight = new THREE.Vector3();
function animateAvatar(dt, t, dayish, night) {
  if (t > gaze.next) {
    gaze.idleYaw = (Math.random() - 0.5) * 0.7;
    gaze.idlePitch = -0.04 + Math.random() * 0.16;
    gaze.next = t + 2.5 + Math.random() * 4.5;
  }
  const delta = wrapPi(Math.atan2(camera.position.x - head.world.x, camera.position.z - head.world.z) - Math.PI);
  const front = smoothstep(-Math.abs(delta), -1.5, -0.7);
  const wantYaw = clamp(THREE.MathUtils.lerp(gaze.idleYaw, clamp(delta, -0.45, 0.45), front * 0.8) - mouse.x * 0.3, -0.5, 0.5);
  const wantPitch = THREE.MathUtils.lerp(gaze.idlePitch + 0.42 * laptop.k, 0.02, front * (1 - laptop.k * 0.6)) + mouse.y * 0.15;
  const k = reduced ? 1 : 1 - Math.exp(-dt * 1.6);
  AV.yaw.value += (wantYaw - AV.yaw.value) * k;
  AV.pitch.value += (wantPitch - AV.pitch.value) * k;
  if (paramsQ.has('yaw')) AV.yaw.value = +paramsQ.get('yaw');
  AV.breath.value = reduced ? 0 : (Math.sin(t * Math.PI * 2 / 4.6) * 0.5 + 0.5) * 0.016;
  if (avatar && !reduced) avatar.rotation.x = Math.sin(t * 0.35) * 0.006;
  if (rig.mixer) updateRig(reduced ? 0 : dt, Math.floor(camP + 0.4));
  toCam.subVectors(camera.position, head.world).setY(0).normalize();
  camRight.set(-toCam.z, 0, toCam.x);
  heroKey.position.copy(head.world).addScaledVector(toCam, 1.5).addScaledVector(camRight, 0.55);
  heroKey.position.y += 0.7;
  heroKey.intensity = 2.2 + 1.6 * (1 - dayish) + 0.6 * night;
  laptop.glow.intensity = laptop.k * (0.15 + 1.1 * night + 0.5 * (1 - dayish));
  laptop.screenMat.color.setScalar(0.62 + 0.18 * (1 - dayish));
  avatarMats.forEach(m => { m.envMapIntensity = (m.transparent ? 0.3 : 0.55 + 0.35 * dayish); });
}

/* ---------- HUD ---------- */

const hud = document.querySelector('.tod'), panel = document.querySelector('.tod-panel'), range = document.querySelector('.tod-range');
const hudTime = hud?.querySelector('.tod-time'), hudMode = hud?.querySelector('.tod-mode'), hudIc = hud?.querySelector('.tod-ic'), hudWx = hud?.querySelector('.tod-wx');
const bigTime = panel?.querySelector('.tod-big'), bigPhase = panel?.querySelector('.tod-phase'), wxText = panel?.querySelector('.wx-text');
let scrubbing = false;
const setPanel = open => { if (!panel) return; panel.hidden = !open; hud.setAttribute('aria-expanded', open); };
hud?.addEventListener('click', e => { e.stopPropagation(); setPanel(panel.hidden); });
document.addEventListener('click', e => { if (panel && !panel.hidden && !panel.contains(e.target)) setPanel(false); });
range?.addEventListener('input', () => { mode = 0; fixedHour = +range.value / 60; scrubbing = true; updateHud(true); });
range?.addEventListener('change', () => { scrubbing = false; });
panel?.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset.h;
  mode = 0;
  fixedHour = v === 'live' ? null : v === 'sunrise' ? hourWhen(0, false) : v === 'sunset' ? hourWhen(0, true) : v === 'noon' ? 12.3 : 22;
  updateHud(true);
}));
let lastHud = '';
function phaseName(e, morning) {
  if (e < -0.12) return ['Night', '☾'];
  if (e < 0.02) return [morning ? 'Dawn' : 'Dusk', '◐'];
  if (e < 0.2) return [morning ? 'Morning' : 'Golden hour', '◑'];
  return ['Day', '☀'];
}
function updateHud(force) {
  const d = new Date(simMs + IST);
  const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const [phase, ic] = phaseName(sunDir.y, d.getUTCHours() < 12);
  const live = fixedHour == null && !mode;
  const key = hhmm + phase + live + wx.code + wx.temp;
  if (!hud || (!force && key === lastHud)) return;
  lastHud = key;
  hudTime.textContent = `${hhmm} IST`;
  hudMode.textContent = live ? `Live · ${phase}` : phase;
  hudIc.textContent = ic;
  if (hudWx) hudWx.textContent = wx.temp == null ? '' : `${wx.temp}°`;
  if (bigTime) bigTime.textContent = hhmm;
  if (bigPhase) bigPhase.textContent = live ? `Live in Chennai · ${phase}` : `Preview · ${phase}`;
  if (wxText) wxText.textContent = wxLabel();
  if (range && !scrubbing) range.value = d.getUTCHours() * 60 + d.getUTCMinutes();
  panel?.querySelectorAll('[data-h]').forEach(b => b.classList.toggle('on', b.dataset.h === 'live' && live));
  document.body.dataset.tod = phase.toLowerCase().replace(' ', '-');
}

/* ---------- loop ---------- */

const clock = new THREE.Clock();
const FOG_GREY = new THREE.Color(0x8a9098);
let windT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

  simMs += (targetMs() - simMs) * (reduced ? 1 : 1 - Math.exp(-dt * (scrubbing ? 9 : 1.6)));
  setSun(simMs);
  const e = sunDir.y;
  sampleEnv(e);
  const night = 1 - smoothstep(e, -0.14, -0.02), dayish = smoothstep(e, -0.05, 0.2);
  const lights = 1 - smoothstep(e, -0.03, 0.1);

  const wk = 1 - Math.exp(-dt * 0.5);
  for (const k in wxT) wx[k] += (wxT[k] - wx[k]) * wk;
  const overcast = smoothstep(wx.cloud, 0.55, 1) * 0.8 + wx.rain * 0.3;
  if (wx.storm > 0.5 && (lightning.next -= dt) <= 0) { lightning.v = 1; lightning.next = 3 + Math.random() * 9; }
  lightning.v *= Math.exp(-dt * (lightning.v > 0.5 ? 9 : 4));
  const flash = lightning.v * (Math.random() < 0.7 ? 1 : 0.3);
  scene.fog.color.copy(env.fog).lerp(FOG_GREY, overcast * 0.35 * dayish);
  scene.fog.density = env.fd * (1 + wx.rain * 0.7 + wx.fog * 1.4);
  renderer.toneMappingExposure = env.exp;
  hemi.color.copy(env.hs);
  hemi.groundColor.copy(env.hg);
  hemi.intensity = env.hi + flash * 3;
  sun.color.copy(env.lc);
  sun.intensity = env.li * (1 - overcast * 0.65);
  sun.position.lerpVectors(sunDir, moonDir, night).normalize().multiplyScalar(60);
  rim.intensity = 0.25 + 0.65 * (1 - dayish);
  cityGlow.intensity = 6 * lights;
  const u = sky.material.uniforms;
  u.time.value = t;
  u.stars.value = env.stars;
  u.clouds.value = clamp(env.cloud * 0.4 + 0.12 + wx.cloud * 0.85, 0, 1);
  u.overcast.value = overcast;
  u.flash.value = flash;
  windT += dt * (0.6 + wx.wind / 14);
  u.drift.value = windT * 4;
  u.night.value = night;
  cityMats.forEach((m, i) => {
    m.color.copy(env.bld).multiply(TINT[i]);
    m.emissiveIntensity = palNum('win', e - i * 0.035);
  });
  groundMat.color.copy(env.gnd);
  streetMat.opacity = env.street;
  beaconMat.opacity = (0.3 + 0.7 * night) * (Math.sin(t * 3) > 0.2 ? 1 : 0.25);
  dust.material.opacity = 0.6 * (1 - dayish * 0.8);

  traffic.update(dt, lights);
  boats.update(dt, t, lights);
  WIND.value = windT;
  rain.update(dt, wx.rain, wx.wind);
  butterflies.update(t, smoothstep(e, 0.02, 0.15) * (1 - wx.rain));
  roofMat.color.copy(env.bld).multiplyScalar(1.1);
  terrainMat.color.setScalar(0.45 + 0.55 * dayish + 0.15 * night);
  lighthouse.rotor.rotation.y = t * 0.55;
  lighthouse.beamMat.opacity = 0.22 * lights;
  lighthouse.lampMat.emissiveIntensity = 0.2 + 3 * lights;
  lighthouse.glow.opacity = 0.2 + 0.8 * lights;

  for (const p of planes) {
    if (!p.alive) { if ((p.wait -= dt) <= 0) spawnPlane(p); else { p.g.visible = false; continue; } }
    p.g.visible = true;
    p.g.position.addScaledVector(p.dir, p.speed * dt);
    p.navMat.opacity = 0.3 + 0.7 * lights;
    p.strobeMat.opacity = (t * 1.3 + p.speed) % 1 < 0.08 ? 1 : 0;
    p.trailMat.opacity = 0.55 * dayish;
    if (p.g.position.length() > 1000 && p.g.position.dot(p.dir) > 0) { p.alive = false; p.wait = 3 + Math.random() * 12; }
  }

  birdMat.opacity = smoothstep(e, -0.06, 0.04);
  for (const f of flocks) {
    if (!f.alive) { if ((f.wait -= dt) <= 0) spawnFlock(f); else { f.g.visible = false; continue; } }
    f.g.visible = birdMat.opacity > 0.01;
    f.g.position.addScaledVector(f.dir, f.speed * dt);
    f.g.position.y += Math.sin(t * 0.7 + f.speed) * 0.01;
    for (const b of f.birds) {
      const { L, R, ph, f: fr } = b.userData;
      const glide = Math.sin(t * 0.5 + ph) > 0.6 ? 0.15 : 1;
      const flap = Math.sin(t * fr + ph) * 0.75 * glide + 0.1;
      L.rotation.z = flap;
      R.rotation.z = -flap;
    }
    if (f.g.position.length() > 170 && f.g.position.dot(f.dir) > 0) { f.alive = false; f.wait = 4 + Math.random() * 10; }
  }

  if (night > 0.6) {
    if (shooter.life < 0 && (shooter.next -= dt) <= 0) {
      const az = Math.random() * Math.PI * 2, el = (25 + Math.random() * 35) * D2R;
      shooter.d.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      shooter.v.set(-Math.sin(az), -0.5 - Math.random() * 0.4, Math.cos(az)).multiplyScalar(Math.random() < 0.5 ? 0.35 : -0.35);
      shooter.v.y = -Math.abs(shooter.v.y) - 0.12;
      shooter.life = 0;
    }
  }
  if (shooter.life >= 0) {
    shooter.life += dt;
    const k = shooter.life;
    tmpA.copy(shooter.d).addScaledVector(shooter.v, k).normalize().multiplyScalar(650).add(camera.position);
    tmpB.copy(shooter.d).addScaledVector(shooter.v, Math.max(k - 0.18, 0)).normalize().multiplyScalar(650).add(camera.position);
    shooter.line.geometry.attributes.position.array.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z]);
    shooter.line.geometry.attributes.position.needsUpdate = true;
    shooter.m.opacity = Math.sin(Math.min(k / 0.9, 1) * Math.PI) * night;
    if (k > 0.9) { shooter.life = -1; shooter.next = 5 + Math.random() * 10; shooter.m.opacity = 0; }
  }

  camP = camProgress();
  sample(camP);
  const kc = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
  for (const key in cur) cur[key] += (target[key] - cur[key]) * kc;
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;
  place();
  sky.position.copy(camera.position);
  if (!reduced) {
    dust.rotation.y = t * 0.01;
    dust.position.y = Math.sin(t * 0.3) * 0.4;
  }
  animateAvatar(dt, t, dayish, night);
  const wu = water.material.uniforms;
  wu.time.value = t;
  wu.camPos.value.copy(camera.position);
  wu.fogD.value = env.fd;
  wu.night.value = night;
  wu.dayish.value = dayish;

  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (new URLSearchParams(location.search).has('debug')) window.__tod = { planes, flocks, shooter, env, camera, AV, head, rig, wx };
setSun(simMs);
place();
frame();
