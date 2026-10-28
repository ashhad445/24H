// Desert world: sky, sun, ground, and a streamed two-lane highway along −Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from '../config';

// ---------- road centerline ----------
export function roadX(z: number) { return 60 * Math.sin(z / 600) + 20 * Math.sin(z / 260 + 1.3); }
export function roadDX(z: number) { return (60 / 600) * Math.cos(z / 600) + (20 / 260) * Math.cos(z / 260 + 1.3); }
/** Yaw that faces along the road toward −Z. */
export function roadYaw(z: number) { return Math.atan2(roadDX(z), 1); }
export const LANE_OFFSET = 1.8; // right lane center (driving toward −Z, right = +X)
export const ROAD_HALF = 4.2;

const CHUNK = 250;
const AHEAD = 6;
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

// ---------- hazards (deterministic per chunk so host & clients agree) ----------
export interface Hazard { id: number; type: 'pothole' | 'debris'; x: number; z: number; r: number }
const hazardCache = new Map<number, Hazard[]>();
export function chunkHazards(i: number): Hazard[] {
  let h = hazardCache.get(i);
  if (h) return h;
  h = [];
  if (i >= 1) {
    const r = rng(i * 7 + 31);
    const z0 = -i * CHUNK;
    const n = r() < 0.4 ? 0 : r() < 0.75 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const z = z0 - r() * CHUNK;
      const off = (r() < 0.6 ? 1 : -1) * (0.6 + r() * 2.6);
      const [x, zz] = lateral(z, off);
      h.push({ id: i * 100 + k, type: 'pothole', x, z: zz, r: 0.45 + r() * 0.35 });
    }
    if (r() < 0.06) {
      const z = z0 - r() * CHUNK;
      const [x, zz] = lateral(z, 0.8 + r() * 2.2);
      h.push({ id: i * 100 + 50, type: 'debris', x, z: zz, r: 0.7 });
    }
  }
  hazardCache.set(i, h);
  return h;
}
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
function ribbon(z0: number, z1: number, a: number, b: number, y: number, step = 5): THREE.BufferGeometry {
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  const pos: number[] = []; const uv: number[] = []; const idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    const cx = roadX(z); const dx = roadDX(z);
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
  private sunDir = new THREE.Vector3(0.3, 0.6, -0.4).normalize();
  /** 0 = night, 1 = full day */
  daylight = 1;

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
    };
    this.signTex = BILLBOARDS.map((b) => signTexture(b.lines, b.bg, b.fg));
  }

  /** Stream chunks around focus, move sky/ground/sun, apply time of day. */
  update(focus: THREE.Vector3, camPos: THREE.Vector3, hour: number) {
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
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.horizon.value.copy(hor);
    (this.scene.fog as THREE.Fog).color.copy(hor);
    this.sun.intensity = 2.6 * day;
    this.sun.color.set('#fff0d0').lerp(new THREE.Color('#ff9a50'), dusk);
    this.hemi.intensity = 0.15 + 0.75 * day;
    this.hemi.color.set('#cfe3ff').lerp(new THREE.Color('#4a5a8a'), 1 - day);
  }

  private buildChunk(i: number): Chunk {
    const group = new THREE.Group();
    const z0 = -i * CHUNK; const z1 = -(i + 1) * CHUNK;
    const disposables: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, receive = true) => {
      disposables.push(geo);
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = receive; group.add(m); return m;
    };

    // road surface
    add(ribbon(z0, z1, -ROAD_HALF, ROAD_HALF, 0.0), this.mats.asphalt);
    add(ribbon(z0, z1, -ROAD_HALF - 1.6, -ROAD_HALF, -0.005), this.mats.shoulder);
    add(ribbon(z0, z1, ROAD_HALF, ROAD_HALF + 1.6, -0.005), this.mats.shoulder);
    add(ribbon(z0, z1, -3.85, -3.7, 0.012), this.mats.white);
    add(ribbon(z0, z1, 3.7, 3.85, 0.012), this.mats.white);
    // dashed center line (merged)
    const dashes: THREE.BufferGeometry[] = [];
    for (let z = z0; z > z1; z -= 12) dashes.push(ribbon(z, z - 6, -0.08, 0.08, 0.012, 3));
    const dashGeo = mergeGeometries(dashes); dashes.forEach((d) => d.dispose());
    add(dashGeo, this.mats.yellow);

    // props (instanced per type)
    const r = rng(i + 1000);
    const place: Record<string, THREE.Matrix4[]> = { saguaro: [], barrel: [], rock: [], shrub: [], mesa: [], pole: [] };
    const m4 = (x: number, y: number, z: number, s: number, rotY: number, sy = s) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(s, sy, s));

    for (let k = 0; k < 70; k++) {
      const z = z0 - r() * CHUNK;
      const side = r() < 0.5 ? -1 : 1;
      const off = side * (9 + Math.pow(r(), 1.6) * 140);
      const [x, zz] = lateral(z, off);
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
      const [x, zz] = lateral(z, 9.5);
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

    // occasional billboard on the right side
    if (i >= 0 && i % 3 === 1) {
      const z = z0 - CHUNK * 0.5;
      const [x, zz] = lateral(z, 16);
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
      const [x, zz] = lateral(z, 6.2);
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
