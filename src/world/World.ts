// Desert world: sky, sun, ground, and a streamed two-lane highway along −Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from '../config';
import { FORKS, branchAt, chosen, forkZ, routeOffset, routeVersion, type Fork } from './Route';

// ---------- road centerline ----------
/** The base highway before any fork offsets. */
export function baseX(z: number) { return 60 * Math.sin(z / 600) + 20 * Math.sin(z / 260 + 1.3); }
/** Road centerline: base highway + the branches the crew chose at each fork. */
export function roadX(z: number) { return baseX(z) + routeOffset(z); }
export function roadDX(z: number) { return roadX(z + 0.5) - roadX(z - 0.5); }
/** Centerline of the branch NOT taken at `fork` (drawn near the fork, then it fades away). */
export function altX(z: number, fork: Fork) {
  return baseX(z) + routeOffset(z, (id) => (id === fork.id ? 1 - chosen(id) : chosen(id)));
}
const ALT_LEN = 3600; // how far the untaken branch is drawn past the fork

/** Is (x, z) on drivable road — the main road or a fork's other branch? */
export function onRoad(x: number, z: number, margin = ROAD_HALF + 2.3) {
  if (Math.abs(x - roadX(z)) < margin) return true;
  for (const f of FORKS) {
    const fz = forkZ(f);
    if (z < fz && z > fz - ALT_LEN && Math.abs(x - altX(z, f)) < margin) return true;
  }
  return false;
}
/** Yaw that faces along the road toward −Z. */
export function roadYaw(z: number) { return Math.atan2(roadDX(z), 1); }
// Six-lane highway: three lanes each way. Driving toward −Z, right = +X.
export const LANE_W = 3.6;
/** Lane centers for traffic heading −Z (fast, middle, slow). Oncoming lanes are the negatives. */
export const LANES = [LANE_W / 2, LANE_W * 1.5, LANE_W * 2.5];
export const LANE_OFFSET = LANES[2]; // the RV starts in the right (slow) lane
export const ROAD_HALF = LANE_W * 3 + 0.25;

export const CHUNK = 250;
const AHEAD = 7;
const BEHIND = 1;

// ---------- deterministic RNG ----------
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** World point at lateral offset `off` from the road centerline at z. */
function lateral(z: number, off: number): [number, number] {
  const dx = roadDX(z); const len = Math.hypot(1, dx);
  return [roadX(z) + off / len, z - (dx * off) / len];
}

// ---------- clear zones: no desert props inside stop lots ----------
interface ClearZone { x: number; z: number; yaw: number; x0: number; x1: number; z0: number; z1: number }
const clearZones: ClearZone[] = [];
let sceneryVersion = 0;
/** Keep scenery out of a rectangle given in a stop's local frame. Chunks rebuild to apply it. */
export function addClearZone(zone: ClearZone) { clearZones.push(zone); sceneryVersion++; }
function cleared(wx: number, wz: number) {
  for (const c of clearZones) {
    const dx = wx - c.x, dz = wz - c.z; const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (lx > c.x0 && lx < c.x1 && lz > c.z0 && lz < c.z1) return true;
  }
  return false;
}

// ---------- hazards (deterministic per chunk so host & clients agree) ----------
export interface Hazard { id: number; type: 'pothole' | 'debris'; x: number; z: number; r: number }
const hazardCache = new Map<number, Hazard[]>();
/** Forget hazards for chunks beyond z (route changed there). */
export function clearHazardsBeyond(z: number) { for (const i of [...hazardCache.keys()]) if (-i * CHUNK - CHUNK < z) hazardCache.delete(i); }
export function chunkHazards(i: number): Hazard[] {
  let h = hazardCache.get(i);
  if (h) return h;
  h = [];
  if (i >= 1) {
    const r = rng(i * 7 + 31);
    const z0 = -i * CHUNK;
    const rough = branchAt(z0 - CHUNK / 2)?.rough ?? 1;
    const n = Math.round((r() < 0.55 ? 0 : r() < 0.88 ? 1 : 2) * rough + (rough > 2 && r() < 0.6 ? 1 : 0));
    for (let k = 0; k < n; k++) {
      const z = z0 - r() * CHUNK;
      const off = (r() < 0.6 ? 1 : -1) * (0.6 + r() * 10.2);
      const [x, zz] = lateral(z, off);
      h.push({ id: i * 100 + k, type: 'pothole', x, z: zz, r: 0.45 + r() * 0.35 });
    }
    if (r() < 0.02) { // rare: tire debris
      const z = z0 - r() * CHUNK;
      const [x, zz] = lateral(z, 0.8 + r() * 9.8);
      h.push({ id: i * 100 + 50, type: 'debris', x, z: zz, r: 0.7 });
    }
  }
  hazardCache.set(i, h);
  return h;
}
/** Radar speed traps: one every few chunks on the right shoulder. Limit in MPH. */
export const SPEED_LIMIT = 120;
export interface Radar { id: number; x: number; z: number; yaw: number }
export function chunkRadar(i: number): Radar | null {
  if (i < 2 || i % 8 !== 3) return null;
  const z = -i * CHUNK - CHUNK * 0.3;
  const [sx, sz] = lateral(z, ROAD_HALF + 2.3);
  if (cleared(sx, sz)) return null;
  const [x, zz] = lateral(z, 0); // the gantry spans the whole road
  return { id: i, x, z: zz, yaw: roadYaw(z) };
}
export function radarsNear(z: number): Radar[] {
  const ci = Math.floor(-z / CHUNK);
  return [chunkRadar(ci - 1), chunkRadar(ci), chunkRadar(ci + 1)].filter((r): r is Radar => !!r);
}
/** The next speed camera ahead of z (the RV drives toward −Z), if one is within `chunks` chunks. */
export function nextRadar(z: number, chunks = 8): Radar | null {
  const ci = Math.floor(-z / CHUNK);
  for (let i = ci; i <= ci + chunks; i++) { const r = chunkRadar(i); if (r && r.z < z - 3) return r; }
  return null;
}

/** Roadside rock piles (every other chunk, alternating shoulders). Rocks you can pick up and throw. */
export const PILE_ROCKS = 6;
export interface RockPile { id: number; x: number; z: number }
export function chunkRocks(i: number): RockPile | null {
  if (i < 1 || i % 2 !== 1) return null;
  const z = -i * CHUNK - CHUNK * (0.45 + ((i * 37) % 10) / 100);
  const [x, zz] = lateral(z, (i % 4 === 1 ? 1 : -1) * (ROAD_HALF + 4.2));
  return cleared(x, zz) ? null : { id: i, x, z: zz };
}

/** Road-relative coordinates: world point at distance `z` along the road and lateral offset `off` (+ = right). */
export function roadPoint(z: number, off: number): [number, number] { return lateral(z, off); }

export function hazardsNear(z: number): Hazard[] {
  const ci = Math.floor(-z / CHUNK);
  return [...chunkHazards(ci - 1), ...chunkHazards(ci), ...chunkHazards(ci + 1)];
}

function noiseTexture(size: number, base: string, specks: string[], count: number) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    g.fillStyle = specks[i % specks.length];
    g.globalAlpha = 0.25 + Math.random() * 0.4;
    const r = 1 + Math.random() * 3;
    g.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Ribbon following the road between z0 and z1, from lateral offset a to b. */
function ribbon(z0: number, z1: number, a: number, b: number, y: number, step = 5, xf: (z: number) => number = roadX): THREE.BufferGeometry {
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  const pos: number[] = []; const uv: number[] = []; const idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    const cx = xf(z); const dx = xf(z + 0.5) - xf(z - 0.5);
    const len = Math.hypot(1, dx); const nx = 1 / len; const nz = -dx / len;
    for (const off of [a, b]) {
      pos.push(cx + nx * off, y, z + nz * off);
      uv.push(off / 4, z / 4);
    }
    if (k < n) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // force normals up (winding may flip depending on direction)
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return geo;
}

function signTexture(lines: string[], bg: string, fg: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = `bold ${i === 0 ? 62 : 38}px "Arial Black", Arial, sans-serif`;
    g.fillText(l, 256, 256 / (lines.length + 1) * (i + 1));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const BILLBOARDS: { lines: string[]; bg: string; fg: string }[] = [
  { lines: ["RUSTY'S OASIS", 'GAS · SLOTS · LIVE CRABS', 'NEXT EXIT'], bg: '#f0ad4e', fg: '#3b1f0e' },
  { lines: ['LAS VEGAS', 'WEDDINGS FROM $49', 'DESERT CHAPEL'], bg: '#fdf6e3', fg: '#c0392b' },
  { lines: ['LUCKY SCORPION', 'DINER', 'PIE THAT STINGS'], bg: '#2c3e50', fg: '#f1c40f' },
  { lines: ['LOST?', 'SO ARE WE', 'JESUS SAVES · GAS DOESN’T'], bg: '#ffffff', fg: '#222222' },
  { lines: ['ROSCOE IS', 'WATCHING', 'OBEY THE SPEED LIMIT'], bg: '#1b4f72', fg: '#ffffff' },
  { lines: ['NEED CASH?', 'NO QUESTIONS ASKED', '1-800-LOAN-SHARK'], bg: '#111111', fg: '#e74c3c' },
];

interface Chunk { i: number; group: THREE.Group; disposables: THREE.BufferGeometry[] }

export class World {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private ground: THREE.Mesh;
  private groundTex: THREE.Texture;
  private chunks = new Map<number, Chunk>();
  private mats: Record<string, THREE.Material>;
  private geos: Record<string, THREE.BufferGeometry>;
  private signTex: THREE.Texture[];
  private radarTex: THREE.Texture;
  private warnTex: THREE.Texture[];
  private sunDir = new THREE.Vector3(0.3, 0.6, -0.4).normalize();
  /** 0 = night, 1 = full day */
  daylight = 1;
  private stars: THREE.Points;
  private moon: THREE.DirectionalLight;
  private dust: THREE.Points;
  private dustMat: THREE.PointsMaterial;
  private storm = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#3d7fd6') },
        horizon: { value: new THREE.Color('#f2d9b0') },
        sunDir: { value: this.sunDir },
        sunColor: { value: new THREE.Color('#fff2cc') },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 col = mix(horizon, top, pow(max(h,0.0), 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0); col += sunColor * (pow(s, 900.0) * 2.0 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    scene.fog = new THREE.Fog(0xf2d9b0, 250, 1500);

    // night sky: stars on the upper hemisphere + dim blue moonlight
    const starPos: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
      starPos.push(Math.sin(v) * Math.cos(u) * 1700, Math.cos(v) * 1700, Math.sin(v) * Math.sin(u) * 1700);
    }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1;
    scene.add(this.stars);
    this.moon = new THREE.DirectionalLight('#8fa8ff', 0);
    this.moon.position.set(-200, 300, 100);
    scene.add(this.moon);

    // sandstorm dust around the camera
    const dustPos = new Float32Array(1500 * 3);
    for (let i = 0; i < dustPos.length; i++) dustPos[i] = (Math.random() - 0.5) * 60;
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({ color: '#c9a06a', size: 0.14, transparent: true, opacity: 0, depthWrite: false });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0xc89a6a, 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    // ground (follows the focus, texture stays world-anchored)
    this.groundTex = noiseTexture(256, '#d6aa72', ['#b98a55', '#e8c38e', '#a8784a', '#c99a63'], 2600);
    this.groundTex.repeat.set(3000 / 24, 3000 / 24);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1 }),
    );
    this.ground.position.y = -0.02;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    // shared materials & prop geometry
    const asphaltTex = noiseTexture(128, '#3b3b40', ['#2c2c30', '#4a4a50', '#56565c'], 900);
    this.mats = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }),
      shoulder: new THREE.MeshStandardMaterial({ color: '#a8875e', roughness: 1 }),
      white: new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.8 }),
      yellow: new THREE.MeshStandardMaterial({ color: '#f2b90c', roughness: 0.8 }),
      cactus: new THREE.MeshStandardMaterial({ color: '#5b8c3a', roughness: 0.9, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: '#a0603a', roughness: 1, flatShading: true }),
      shrub: new THREE.MeshStandardMaterial({ color: '#8a8f4a', roughness: 1, flatShading: true }),
      mesa: new THREE.MeshStandardMaterial({ color: '#b5653e', roughness: 1, flatShading: true }),
      wood: new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 1 }),
      post: new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.6, metalness: 0.4 }),
      pothole: new THREE.MeshStandardMaterial({ color: '#1c1c1f', roughness: 1 }),
      tire: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
    };
    this.geos = {
      saguaro: buildSaguaro(),
      barrel: new THREE.CylinderGeometry(0.35, 0.4, 0.7, 8).translate(0, 0.35, 0),
      rock: new THREE.DodecahedronGeometry(1, 0).scale(1, 0.6, 1).translate(0, 0.3, 0),
      shrub: new THREE.IcosahedronGeometry(0.6, 0).scale(1, 0.6, 1).translate(0, 0.3, 0),
      mesa: new THREE.CylinderGeometry(0.75, 1, 1, 7).translate(0, 0.5, 0),
      pole: buildPole(),
      pothole: new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2),
      debris: new THREE.TorusGeometry(0.22, 0.06, 5, 8, Math.PI * 0.8),
      cliff: new THREE.BoxGeometry(1, 1, 1, 2, 3, 2).translate(0, 0.5, 0),
    };
    this.signTex = BILLBOARDS.map((b) => signTexture(b.lines, b.bg, b.fg));
    this.radarTex = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 160;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 160); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(5, 5, 118, 150);
      g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 20px Arial';
      g.fillText('SPEED', 64, 32); g.fillText('LIMIT', 64, 56);
      g.font = 'bold 52px Arial'; g.fillText(String(SPEED_LIMIT), 64, 114);
      g.fillStyle = '#c62828'; g.font = 'bold 13px Arial'; g.fillText('CAMERA ENFORCED', 64, 146);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.warnTex = [500, 250].map((m) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#ffd600'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(5, 5, 118, 118);
      g.fillStyle = '#111'; g.fillRect(34, 26, 60, 36); g.fillRect(50, 18, 26, 10);
      g.fillStyle = '#ffd600'; g.beginPath(); g.arc(64, 44, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(64, 44, 6, 0, Math.PI * 2); g.fill();
      g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillText('SPEED CAMERA', 64, 86); g.fillText(`AHEAD  ${m} m`, 64, 108);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    });
  }

  /** Stream chunks around focus, move sky/ground/sun, apply time of day. */
  private builtRoute = '';

  update(focus: THREE.Vector3, camPos: THREE.Vector3, hour: number, storm = 0, wind = 0, dt = 0.016) {
    this.storm = storm;
    const ver = `${routeVersion()}:${sceneryVersion}`;
    if (ver !== this.builtRoute) {
      // the road beyond a fork moved, or a stop cleared its lot: rebuild what's streamed in
      this.builtRoute = ver;
      for (const [, c] of this.chunks) { this.group.remove(c.group); c.disposables.forEach((d) => d.dispose()); }
      this.chunks.clear();
    }
    const ci = Math.floor(-focus.z / CHUNK);
    for (let i = ci - BEHIND; i <= ci + AHEAD; i++) if (i >= -2 && !this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i));
    for (const [i, c] of this.chunks) {
      if (i < ci - BEHIND - 1 || i > ci + AHEAD + 1) {
        this.group.remove(c.group);
        c.disposables.forEach((d) => d.dispose());
        this.chunks.delete(i);
      }
    }

    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    // dust: drift with the wind, wrap inside a 60 m box around the camera
    this.dustMat.opacity = storm * 0.85;
    this.dust.visible = storm > 0.02;
    if (this.dust.visible) {
      const a = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const vx = wind * 14 + 3, vz = 5, vy = -0.6;
      const wrap = (v: number) => ((((v + 30) % 60) + 60) % 60) - 30;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = wrap(arr[i] + vx * dt + (Math.random() - 0.5) * 0.05);
        arr[i + 1] = wrap(arr[i + 1] + vy * dt);
        arr[i + 2] = wrap(arr[i + 2] + vz * dt);
      }
      a.needsUpdate = true;
      this.dust.position.copy(camPos);
    }
    const gx = Math.round(focus.x / 24) * 24; const gz = Math.round(focus.z / 24) * 24;
    this.ground.position.set(gx, -0.02, gz);
    this.groundTex.offset.set(gx / 24, -gz / 24);

    this.applyTime(hour);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(focus);
  }

  private applyTime(hour: number) {
    const h = ((hour % 24) + 24) % 24;
    const el = Math.sin(((h - 5) / 14) * Math.PI) * 1.15; // sunrise 5:00, sunset 19:00
    const az = ((h - 12) / 12) * Math.PI * 0.9;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el) * 0.6).normalize();
    const day = THREE.MathUtils.smoothstep(Math.sin(el), -0.08, 0.3);
    const dusk = Math.max(0, 1 - Math.abs(Math.sin(el)) / 0.25) * (el > -0.3 ? 1 : 0);
    this.daylight = day;

    const top = new THREE.Color('#0b1030').lerp(new THREE.Color('#3d7fd6'), day);
    const hor = new THREE.Color('#1c2245').lerp(new THREE.Color('#f2d9b0'), day).lerp(new THREE.Color('#f08a4b'), dusk * 0.7);
    // sandstorm: brown sky, thick fog, dimmer sun
    const st = this.storm;
    const dustCol = new THREE.Color('#b08458').multiplyScalar(0.35 + 0.65 * day);
    top.lerp(dustCol, st * 0.85); hor.lerp(dustCol, st);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.horizon.value.copy(hor);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(hor);
    fog.near = THREE.MathUtils.lerp(250, 4, st);
    fog.far = THREE.MathUtils.lerp(1500, 75, st);
    (this.stars.material as THREE.PointsMaterial).opacity = (1 - day) * (1 - st) * 0.9;
    this.moon.intensity = (1 - day) * 0.35;
    this.sun.intensity = 2.6 * day * (1 - st * 0.6);
    this.sun.color.set('#fff0d0').lerp(new THREE.Color('#ff9a50'), dusk);
    this.hemi.intensity = 0.07 + 0.83 * day;
    this.hemi.color.set('#cfe3ff').lerp(new THREE.Color('#4a5a8a'), 1 - day);
  }

  /** Green overhead highway signs announcing a fork, one per branch. */
  private buildGantry(group: THREE.Group, f: Fork, gz: number, disposables: THREE.BufferGeometry[]) {
    const g = new THREE.Group();
    const steel = this.mats.post;
    const postGeo = new THREE.BoxGeometry(0.3, 7.4, 0.3).translate(0, 3.7, 0);
    const beamGeo = new THREE.BoxGeometry(2 * ROAD_HALF + 5, 0.45, 0.45);
    disposables.push(postGeo, beamGeo);
    for (const side of [-1, 1]) { const p = new THREE.Mesh(postGeo, steel); p.position.x = side * (ROAD_HALF + 2.3); p.castShadow = true; g.add(p); }
    const beam = new THREE.Mesh(beamGeo, steel); beam.position.y = 7.1; g.add(beam);
    for (const b of f.branches) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const x = c.getContext('2d')!;
      x.fillStyle = '#0b6b3a'; x.fillRect(0, 0, 512, 256);
      x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 236);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 60px Arial'; x.fillText(b.sign[0], 256, 62);
      x.font = 'bold 40px Arial'; x.fillText(b.sign[1], 256, 125);
      x.font = '28px Arial'; x.fillText(b.sign[2], 256, 178);
      x.font = 'bold 56px Arial'; x.fillText(b.side < 0 ? '⬉' : '⬈', b.side < 0 ? 52 : 460, 216);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      disposables.push(plate.geometry);
      plate.position.set(b.side * 4.6, 7.1, 0.3);
      g.add(plate);
    }
    // face oncoming RVs (they approach from +Z)
    const [x, z] = lateral(gz, 0);
    g.position.set(x, 0, z); g.rotation.y = roadYaw(gz);
    group.add(g);
    // gore-point chevrons where the branches split
    const fz = forkZ(f);
    const chev = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: '#ffd600', emissive: '#ffb300', emissiveIntensity: 0.4 }));
    disposables.push(chev.geometry);
    const [cx, cz] = [(roadX(fz - 650) + altX(fz - 650, f)) / 2, fz - 650];
    chev.position.set(cx, 0.9, cz); chev.rotation.y = roadYaw(fz);
    group.add(chev);
  }

  private buildChunk(i: number): Chunk {
    const group = new THREE.Group();
    const z0 = -i * CHUNK; const z1 = -(i + 1) * CHUNK;
    const disposables: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, receive = true) => {
      disposables.push(geo);
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = receive; group.add(m); return m;
    };

    // road surface (main road, plus the other branch near forks)
    const surface = (za: number, zb: number, xf: (z: number) => number, y = 0) => {
      add(ribbon(za, zb, -ROAD_HALF, ROAD_HALF, y, 5, xf), this.mats.asphalt);
      add(ribbon(za, zb, -ROAD_HALF - 1.6, -ROAD_HALF, y - 0.005, 5, xf), this.mats.shoulder);
      add(ribbon(za, zb, ROAD_HALF, ROAD_HALF + 1.6, y - 0.005, 5, xf), this.mats.shoulder);
      // edge lines, double-yellow center, dashed white lane dividers
      add(ribbon(za, zb, -ROAD_HALF + 0.1, -ROAD_HALF + 0.25, y + 0.012, 5, xf), this.mats.white);
      add(ribbon(za, zb, ROAD_HALF - 0.25, ROAD_HALF - 0.1, y + 0.012, 5, xf), this.mats.white);
      add(ribbon(za, zb, -0.22, -0.08, y + 0.012, 5, xf), this.mats.yellow);
      add(ribbon(za, zb, 0.08, 0.22, y + 0.012, 5, xf), this.mats.yellow);
      const dashes: THREE.BufferGeometry[] = [];
      for (let z = za - (((za % 12) + 12) % 12); z > zb; z -= 12) {
        for (const off of [-2 * LANE_W, -LANE_W, LANE_W, 2 * LANE_W]) dashes.push(ribbon(z, Math.max(zb, z - 5), off - 0.07, off + 0.07, y + 0.012, 3, xf));
      }
      if (dashes.length) { add(mergeGeometries(dashes), this.mats.white); dashes.forEach((d) => d.dispose()); }
    };
    surface(z0, z1, roadX);
    for (const f of FORKS) {
      const fz = forkZ(f);
      const za = Math.min(z0, fz), zb = Math.max(z1, fz - ALT_LEN);
      if (za > zb) surface(za, zb, (z) => altX(z, f), 0.002);
      // overhead gantry before the split
      const gz = fz + 320;
      if (gz <= z0 && gz > z1) this.buildGantry(group, f, gz, disposables);
    }
    // canyon cliffs along the shortcut
    const branch = branchAt((z0 + z1) / 2);
    if (branch?.canyon) {
      const rc = rng(i * 13 + 7);
      const cliffs: THREE.Matrix4[] = [];
      for (let z = z0; z > z1; z -= 22) {
        for (const side of [-1, 1]) {
          const [x, zz] = lateral(z, side * (ROAD_HALF + 14 + rc() * 7));
          if (onRoad(x, zz, 14)) continue; // keep clear of the other branch near the fork
          cliffs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rc() * 0.6, 0)), new THREE.Vector3(10 + rc() * 8, 16 + rc() * 22, 24)));
        }
      }
      const im = new THREE.InstancedMesh(this.geos.cliff, this.mats.mesa, cliffs.length);
      cliffs.forEach((m, j) => im.setMatrixAt(j, m));
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      group.add(im);
    }

    // props (instanced per type)
    const r = rng(i + 1000);
    const place: Record<string, THREE.Matrix4[]> = { saguaro: [], barrel: [], rock: [], shrub: [], mesa: [], pole: [] };
    const m4 = (x: number, y: number, z: number, s: number, rotY: number, sy = s) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(s, sy, s));

    for (let k = 0; k < 70; k++) {
      const z = z0 - r() * CHUNK;
      const side = r() < 0.5 ? -1 : 1;
      const off = side * (ROAD_HALF + 5 + Math.pow(r(), 1.6) * 140);
      const [x, zz] = lateral(z, off);
      if (cleared(x, zz) || onRoad(x, zz, 8)) continue;
      const t = r();
      if (t < 0.25) place.saguaro.push(m4(x, 0, zz, 0.8 + r() * 0.7, r() * 6.28));
      else if (t < 0.4) place.barrel.push(m4(x, 0, zz, 0.7 + r() * 0.6, r() * 6.28));
      else if (t < 0.65) place.rock.push(m4(x, 0, zz, 0.4 + r() * 1.8, r() * 6.28));
      else place.shrub.push(m4(x, 0, zz, 0.6 + r() * 0.9, r() * 6.28));
    }
    for (let k = 0; k < 3; k++) {
      const z = z0 - r() * CHUNK;
      const off = (r() < 0.5 ? -1 : 1) * (180 + r() * 450);
      const [x, zz] = lateral(z, off);
      const s = 25 + r() * 45;
      place.mesa.push(m4(x, 0, zz, s, r() * 6.28, 12 + r() * 30));
    }
    for (let z = z0 - (i * 7) % 60; z > z1; z -= 60) {
      const [x, zz] = lateral(z, ROAD_HALF + 5);
      if (cleared(x, zz)) continue;
      place.pole.push(m4(x, 0, zz, 1, -roadYaw(z)));
    }
    for (const [key, list] of Object.entries(place)) {
      if (!list.length) continue;
      const mat = key === 'saguaro' || key === 'barrel' ? this.mats.cactus : key === 'pole' ? this.mats.wood : this.mats[key];
      const im = new THREE.InstancedMesh(this.geos[key], mat, list.length);
      list.forEach((m, j) => im.setMatrixAt(j, m));
      im.castShadow = key !== 'mesa';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }

    // hazards
    for (const hz of chunkHazards(i)) {
      if (hz.type === 'pothole') {
        const m = new THREE.Mesh(this.geos.pothole, this.mats.pothole);
        m.position.set(hz.x, 0.004, hz.z); m.scale.set(hz.r, 1, hz.r * (0.7 + (hz.id % 5) * 0.08)); m.rotation.y = hz.id;
        m.receiveShadow = true; group.add(m);
      } else {
        const g = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const piece = new THREE.Mesh(this.geos.debris, this.mats.tire);
          piece.position.set((k - 1.5) * 0.35, 0.05, ((k * 37) % 5) * 0.12 - 0.25); piece.rotation.set(Math.PI / 2, 0, k * 1.3);
          piece.castShadow = true; g.add(piece);
        }
        g.position.set(hz.x, 0, hz.z); group.add(g);
      }
    }

    // speed camera gantry across the whole road (+ two advance warning signs on the shoulder)
    const radar = chunkRadar(i);
    if (radar) {
      const g = new THREE.Group();
      const span = ROAD_HALF + 1.6;
      const steel = this.mats.post;
      for (const sx of [-span, span]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.2, 0.4).translate(sx, 3.6, 0), steel); post.castShadow = true; g.add(post); disposables.push(post.geometry);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.8, 0.6, 0.5).translate(0, 7.0, 0), steel); beam.castShadow = true; g.add(beam); disposables.push(beam.geometry);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), new THREE.MeshStandardMaterial({ map: this.radarTex, roughness: 0.6, emissive: new THREE.Color('#333'), emissiveMap: this.radarTex }));
      plate.position.set(0, 5.1, 0.27); g.add(plate); disposables.push(plate.geometry);
      for (const cx of [-LANES[1], LANES[1]]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.1).translate(cx, 6.2, 0.45), this.mats.pothole); box.castShadow = true; g.add(box); disposables.push(box.geometry);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff1744', emissiveIntensity: 1.8 }));
        lens.position.set(cx, 6.2, 1.01); g.add(lens); disposables.push(lens.geometry);
      }
      g.position.set(radar.x, 0, radar.z);
      g.rotation.y = radar.yaw; // the +Z faces look back down the road at the oncoming RV
      group.add(g);
    }
    for (const [ahead, ti] of [[1, 0], [2, 1]] as const) {
      if (!chunkRadar(i + ahead)) continue;
      const z = -i * CHUNK - CHUNK * 0.35;
      const [wx, wz] = lateral(z, ROAD_HALF + 2.6);
      if (cleared(wx, wz)) continue;
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12).translate(0, 1.6, 0), this.mats.post);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: this.warnTex[ti], roughness: 0.6, emissive: new THREE.Color('#333'), emissiveMap: this.warnTex[ti] }));
      plate.position.set(0, 3.0, 0.08);
      g.add(post, plate); g.position.set(wx, 0, wz); g.rotation.y = roadYaw(z);
      disposables.push(post.geometry, plate.geometry);
      group.add(g);
    }

    // occasional billboard on the right side
    if (i >= 0 && i % 3 === 1 && !cleared(...lateral(z0 - CHUNK * 0.5, ROAD_HALF + 12))) {
      const z = z0 - CHUNK * 0.5;
      const [x, zz] = lateral(z, ROAD_HALF + 12);
      const bb = new THREE.Group();
      const tex = this.signTex[Math.floor(i / 3) % this.signTex.length];
      const board = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), [
        this.mats.wood, this.mats.wood, this.mats.wood, this.mats.wood,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), this.mats.wood,
      ]);
      board.position.y = 5; board.castShadow = true;
      disposables.push(board.geometry);
      const legGeo = new THREE.BoxGeometry(0.25, 3.5, 0.25).translate(0, 1.75, 0);
      disposables.push(legGeo);
      for (const lx of [-2.8, 2.8]) { const leg = new THREE.Mesh(legGeo, this.mats.wood); leg.position.x = lx; leg.castShadow = true; bb.add(leg); }
      bb.add(board);
      bb.position.set(x, 0, zz);
      // face oncoming traffic (+Z), angled toward the road
      bb.rotation.y = -roadYaw(z) - 0.35;
      group.add(bb);
    }

    // mile marker every compressed mile
    const mPerMile = 1 / CFG.MILES_PER_METER;
    for (let mile = Math.ceil(-z0 / mPerMile); mile * mPerMile < -z1; mile++) {
      const z = -mile * mPerMile;
      const [x, zz] = lateral(z, ROAD_HALF + 2);
      if (cleared(x, zz)) continue;
      const post = new THREE.Mesh(this.geos.markerPost ?? (this.geos.markerPost = new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(0, 0.6, 0)), this.mats.post);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), new THREE.MeshStandardMaterial({ map: markerTex(mile), roughness: 0.7 }));
      disposables.push(plate.geometry);
      plate.position.set(0, 1.3, 0.05);
      const g = new THREE.Group(); g.add(post, plate);
      g.position.set(x, 0, zz); g.rotation.y = -roadYaw(z);
      group.add(g);
    }

    this.group.add(group);
    return { i, group, disposables };
  }
}

const markerCache = new Map<number, THREE.Texture>();
function markerTex(mile: number) {
  let t = markerCache.get(mile);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1e6b3a'; g.fillRect(0, 0, 64, 96);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(3, 3, 58, 90);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 18px Arial'; g.fillText('MILE', 32, 30);
  g.font = 'bold 30px Arial'; g.fillText(String(mile), 32, 68);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  markerCache.set(mile, t);
  return t;
}

function buildSaguaro() {
  const parts = [
    new THREE.CylinderGeometry(0.28, 0.32, 4.2, 8).translate(0, 2.1, 0),
    new THREE.SphereGeometry(0.28, 8, 6).translate(0, 4.2, 0),
    new THREE.CylinderGeometry(0.18, 0.18, 0.8, 7).rotateZ(Math.PI / 2).translate(0.5, 1.8, 0),
    new THREE.CylinderGeometry(0.18, 0.2, 1.4, 7).translate(0.88, 2.5, 0),
    new THREE.SphereGeometry(0.18, 7, 5).translate(0.88, 3.2, 0),
    new THREE.CylinderGeometry(0.16, 0.16, 0.6, 7).rotateZ(Math.PI / 2).translate(-0.4, 2.6, 0),
    new THREE.CylinderGeometry(0.16, 0.18, 1.0, 7).translate(-0.68, 3.0, 0),
    new THREE.SphereGeometry(0.16, 7, 5).translate(-0.68, 3.5, 0),
  ].map((g) => g.toNonIndexed());
  return mergeGeometries(parts);
}

function buildPole() {
  const parts = [
    new THREE.CylinderGeometry(0.12, 0.15, 8, 6).translate(0, 4, 0),
    new THREE.BoxGeometry(2.2, 0.14, 0.14).translate(0, 7.4, 0),
  ].map((g) => g.toNonIndexed());
  return mergeGeometries(parts);
}
