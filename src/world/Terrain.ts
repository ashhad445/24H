// Terrain: rolling dunes beyond the road corridor, a ground shader with multi-scale sand detail, the damp
// ditch strip beside the shoulders, and a far ring of mountain / mesa silhouettes with aerial perspective.
//
// RULES: ground is flat at the road deck height (roadY + GROUND_Y) within ~40 m of any road centerline (narrower in
// the mountains) and at every stop clear-zone (stops sit in flat keep-zones at y = 0). Cliff shelves / ridge passes
// add a wall or a drop just past the shoulder. Dunes and hills only start beyond that and grow with distance.
import * as THREE from 'three';
import { fbm } from './Noise';

export const GROUND_Y = -0.02;
export const FLAT_NEAR = 40;   // metres of dead-flat ground around roads
export const FLAT_ZONE = 22;   // extra flat metres around a stop's clear-zone rectangle

/** What the terrain needs to know about the road network (supplied by World to avoid an import cycle). */
export interface TerrainCtx {
  /** distance (m) from (x, z) to the nearest road centerline, main road or the untaken fork branch */
  roadDist(x: number, z: number, main?: number): number;
  /** distance (m) from (x, z) to the nearest stop clear-zone rectangle (0 inside) */
  zoneDist(x: number, z: number): number;
  /** road parameter + signed lateral offset of the closest main-road point */
  roadFrame(x: number, z: number): { s: number; off: number };
  roadY(z: number): number;
  wallAt(z: number): number;
  dropAt(z: number, side: number): number;
  roadHalf(z: number): number;
  mtnAt(z: number): number;
}
let ctx: TerrainCtx | null = null;
export function setTerrainCtx(c: TerrainCtx) { ctx = c; }

const sstep = THREE.MathUtils.smoothstep;

/** 0 on the flat corridor / stop lots, 1 well away from them. */
export function terrainMask(x: number, z: number, mtn = 0, dist?: number): number {
  if (!ctx) return 0;
  const near = FLAT_NEAR - 18 * mtn;
  const m = sstep(dist ?? ctx.roadDist(x, z), near, near + 55 - 25 * mtn);
  if (m <= 0) return 0;
  return Math.min(m, sstep(ctx.zoneDist(x, z), FLAT_ZONE, FLAT_ZONE + 50));
}

/** Ground height (m) at world (x, z). */
export function terrainH(x: number, z: number): number {
  if (!ctx) return GROUND_Y;
  const fr = ctx.roadFrame(x, z);
  const af = Math.abs(fr.off);
  // the road deck height carries the whole landscape up and down with it (far away: by world z, which is smooth)
  // far from the road the closest-point projection gets ambiguous around bends: fade to plain world z
  const sEff = af < 150 ? fr.s : af > 450 ? z : fr.s + (z - fr.s) * ((af - 150) / 300);
  const base = ctx.roadY(sEff);
  const mtn = ctx.mtnAt(sEff) * (af < 900 ? 1 : 0.6);
  // cliff shelf / ridge: a rock wall rising on one side, thin air on the other
  let shelf = 0;
  if (af < 400) {
    const hw = ctx.roadHalf(fr.s), u = af - hw, side = Math.sign(fr.off) || 1;
    const w = ctx.wallAt(fr.s);
    if (w * side > 0 && u > 3) shelf += Math.abs(w) * (sstep(u, 3, 12) * 34 + Math.max(0, u - 12) * 1.2 + fbm(x * 0.05, z * 0.05, 2, 3) * 6 * sstep(u, 5, 14));
    const dp = ctx.dropAt(fr.s, side);
    if (dp > 0 && u > 3.2) shelf -= dp * (sstep(u, 3.2, 42) * 64 + sstep(u, 42, 260) * 110);
  }
  const d = ctx.roadDist(x, z, af);
  const m = terrainMask(x, z, mtn, d);
  if (m <= 0) return GROUND_Y + base + shelf;
  const swell = (fbm(x * 0.0072 + 3.1, z * 0.0072 - 1.7, 3, 4) - 0.5) * 11;
  const ridge = Math.sin((x * 0.8 + z * 0.6) * 0.046 + fbm(x * 0.012, z * 0.012, 2, 9) * 6) * 1.8 * sstep(fbm(x * 0.004 + 9, z * 0.004, 2, 2), 0.38, 0.62);
  const near = sstep(d, FLAT_NEAR - 18 * mtn, 130 - 60 * mtn);
  // in the mountains the hills crowd the road and get much taller
  let hill = Math.pow(Math.max(0, fbm(x * 0.0016 - 9, z * 0.0016 + 4, 4, 6) - 0.4 + 0.14 * mtn), 1.25) * 190 * (1 + 1.7 * mtn) * sstep(d, 120 - 75 * mtn, 600 - 360 * mtn);
  // on the drop side of a shelf / either side of a ridge pass the land keeps falling away: no hills crowding back up
  if (af < 900) { const dp = ctx.dropAt(sEff, Math.sign(fr.off) || 1); if (dp > 0) hill *= 1 - dp * (1 - sstep(af, 500, 900)); }
  return GROUND_Y + base + shelf + (swell * near + ridge * near * 0.8 + hill) * m;
}

/** Per-vertex albedo tint (multiplied onto the ground texture): patchy scrub soil, bleached crests, dark washes. */
export function groundTint(x: number, z: number, h: number, out: THREE.Color) {
  const a = fbm(x / 95, z / 95, 3, 21), b = fbm(x / 23 + 5, z / 23, 2, 33), c = fbm(x / 420, z / 420, 2, 55);
  let k = 1 + (a - 0.5) * 0.42 + (b - 0.5) * 0.12;
  const red = (c - 0.5) * 0.3;
  if (h < -0.4) k *= 0.88;
  if (h > 2.5) k *= 1.05;
  const dark = sstep(fbm(x / 160 + 40, z / 160, 3, 77), 0.62, 0.74); // dark scrub-soil patches
  k *= 1 - dark * 0.2;
  out.setRGB(k * (1 + red), k * (1 + red * 0.2), k * (1 - red * 0.9) * (1 - dark * 0.05));
}

/** Lateral offsets (m) of the ground lattice from the road centerline; mirrored to both sides. */
const OFFS = [0, 5, 9, 12, 14.5, 17, 20, 24, 28, 34, 40, 47, 54, 62, 70, 80, 90, 102, 115, 130, 145, 162, 180, 220, 265, 320, 385, 460, 550, 660, 790, 950, 1150, 1400, 1700];
const ROWS = 22;
const ROCK = new THREE.Color();
const FULL_EDGE = 3.6 * 3 + 0.25; // ROAD_HALF at full width (kept local to avoid an import cycle)

/** Ground strip for one road chunk; both end rows use the same lattice so neighbouring chunks are watertight. */
export function buildTerrainGeometry(z0: number, z1: number, lateral: (z: number, off: number) => [number, number], bandOk: (x: number, z: number) => number, halfAt: (z: number) => number): THREE.BufferGeometry {
  const cols = OFFS.length * 2 - 1;
  const n = (ROWS + 1) * cols;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const aOff = new Float32Array(n), aBand = new Float32Array(n);
  const idx: number[] = [];
  const c = new THREE.Color();
  // heights on the lattice plus one extra row before / after, so normals can be taken from neighbours
  // (one terrainH per vertex) and still match across chunk seams
  const rowZ = (r: number) => z0 + ((z1 - z0) * r) / ROWS;
  const offAt = (j: number) => (j < OFFS.length ? -OFFS[OFFS.length - 1 - j] : OFFS[j - OFFS.length + 1]);
  const P = new Float64Array((ROWS + 3) * cols * 3);
  for (let r = -1; r <= ROWS + 1; r++) {
    for (let j = 0; j < cols; j++) {
      const [x, zz] = lateral(rowZ(r), offAt(j));
      const k = ((r + 1) * cols + j) * 3;
      P[k] = x; P[k + 1] = terrainH(x, zz); P[k + 2] = zz;
    }
  }
  const at = (r: number, j: number, a: number) => P[((r + 1) * cols + Math.max(0, Math.min(cols - 1, j))) * 3 + a];
  for (let r = 0; r <= ROWS; r++) {
    const z = rowZ(r);
    for (let j = 0; j < cols; j++) {
      const off = offAt(j);
      const x = at(r, j, 0), h = at(r, j, 1), zz = at(r, j, 2);
      const i = r * cols + j;
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = zz;
      let ny = 1;
      {
        // cross(across-the-road tangent, along-the-road tangent), flipped to point up
        const ax = at(r, j + 1, 0) - at(r, j - 1, 0), ay = at(r, j + 1, 1) - at(r, j - 1, 1), az = at(r, j + 1, 2) - at(r, j - 1, 2);
        const bx = at(r + 1, j, 0) - at(r - 1, j, 0), by = at(r + 1, j, 1) - at(r - 1, j, 1), bz = at(r + 1, j, 2) - at(r - 1, j, 2);
        let nx = ay * bz - az * by, nyy = az * bx - ax * bz, nz = ax * by - ay * bx;
        if (nyy < 0) { nx = -nx; nyy = -nyy; nz = -nz; }
        const il = 1 / (Math.hypot(nx, nyy, nz) || 1);
        nor[i * 3] = nx * il; nor[i * 3 + 1] = nyy * il; nor[i * 3 + 2] = nz * il;
        ny = nyy * il;
      }
      uv[i * 2] = x; uv[i * 2 + 1] = zz;
      groundTint(x, zz, h, c);
      // steep cuts and cliff faces: bare banded red rock instead of sand
      const rock = sstep(1 - ny, 0.22, 0.5);
      if (rock > 0) { const band = 0.82 + 0.18 * Math.sin(h * 0.9 + fbm(x * 0.03, zz * 0.03, 2, 5) * 4); c.lerp(ROCK.setRGB(0.62 * band, 0.36 * band, 0.26 * band), rock * 0.85); }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      // the shader's ditch / apron bands are keyed to the full-width edge: shift so they hug narrow sections too
      const hw = halfAt(z);
      aOff[i] = Math.sign(off) * Math.max(0, Math.abs(off) - hw + FULL_EDGE); aBand[i] = bandOk(x, zz) * (1 - rock);
      if (r < ROWS && j < cols - 1) {
        const a = i, b = i + cols, cc = i + 1, d = i + cols + 1;
        idx.push(a, cc, b, cc, d, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aOff', new THREE.BufferAttribute(aOff, 1));
  g.setAttribute('aBand', new THREE.BufferAttribute(aBand, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ ground material
export interface GroundUniforms { uSunGlow: THREE.IUniform<THREE.Color>; uSunXZ: THREE.IUniform<THREE.Vector2>; uMeanL: THREE.IUniform<number> }

/** Standard material + world-space multi-scale sand detail, ditch / shoulder-apron bands and a warm sun-side haze glow. */
export function createGroundMaterial(map: THREE.Texture, normalMap: THREE.Texture, meanLum: number, shoulderEdge: number): { mat: THREE.MeshStandardMaterial; uni: GroundUniforms } {
  map.repeat.set(1 / 24, 1 / 24); normalMap.repeat.set(1 / 24, 1 / 24);
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1, metalness: 0, vertexColors: true });
  const uni: GroundUniforms = { uSunGlow: { value: new THREE.Color(0, 0, 0) }, uSunXZ: { value: new THREE.Vector2(1, 0) }, uMeanL: { value: meanLum } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunGlow = uni.uSunGlow; sh.uniforms.uSunXZ = uni.uSunXZ; sh.uniforms.uMeanL = uni.uMeanL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOff; attribute float aBand; varying float vOff; varying float vBand; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOff = aOff; vBand = aBand; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOff; varying float vBand; varying vec3 vWPos; uniform vec3 uSunGlow; uniform vec2 uSunXZ; uniform float uMeanL;')
      .replace('#include <map_fragment>', `
        vec3 s1 = texture2D(map, vMapUv).rgb;
        vec3 s2 = texture2D(map, vWPos.xz * 0.1893 + vec2(0.37, 0.11)).rgb;
        vec3 s3 = texture2D(map, vWPos.xz * 0.00663 + vec2(0.61, 0.27)).rgb;
        float l2 = dot(s2, vec3(0.2126, 0.7152, 0.0722)) / uMeanL, l3 = dot(s3, vec3(0.2126, 0.7152, 0.0722)) / uMeanL;
        vec3 albedo = s1 * mix(1.0, l2, 0.5) * mix(1.0, l3, 0.4);
        float ao = abs(vOff);
        // swept gravel apron beside the shoulder, then a damp darker ditch strip (visual only: the ground stays flat)
        float apron = (1.0 - smoothstep(${(shoulderEdge + 1.2).toFixed(2)}, ${(shoulderEdge + 3.4).toFixed(2)}, ao)) * smoothstep(${(shoulderEdge - 0.3).toFixed(2)}, ${(shoulderEdge + 0.3).toFixed(2)}, ao);
        float ditch = smoothstep(${(shoulderEdge + 2.0).toFixed(2)}, ${(shoulderEdge + 3.6).toFixed(2)}, ao) * (1.0 - smoothstep(${(shoulderEdge + 6.0).toFixed(2)}, ${(shoulderEdge + 11.0).toFixed(2)}, ao));
        albedo = mix(albedo, vec3(dot(albedo, vec3(0.33))) * vec3(0.95, 0.9, 0.84) * 0.92, apron * 0.55 * vBand);
        albedo *= 1.0 - ditch * 0.3 * vBand;
        diffuseColor.rgb *= albedo;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef USE_FOG
          vec3 vdir = normalize(vWPos - cameraPosition);
          float sgl = pow(max(dot(normalize(vdir.xz + vec2(1e-5)), uSunXZ), 0.0), 5.0);
          gl_FragColor.rgb += uSunGlow * sgl * fogFactor;
        #endif`);
  };
  return { mat, uni };
}

// ------------------------------------------------------------------ mountains
const MT_VERT = `
attribute float aT;
uniform float uScale; uniform float uShimmer; uniform float uTime; uniform float uSeed;
varying float vH; varying float vT; varying vec3 vWP;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 base = (modelMatrix * vec4(position.x, 0.0, position.z, 1.0)).xyz;
  vec2 p = base.xz;
  float n1 = vn(p * 0.00085);
  float n2 = vn(p * 0.0034 + 5.0);
  float rg = 1.0 - abs(2.0 * vn(p * 0.0019 + 11.0) - 1.0);
  float h = pow(max(n1, 0.0), 1.7) * 360.0 + rg * rg * 120.0 + n2 * 50.0 + vn(p * 0.012) * 14.0;
  // mesa terraces in half of the range
  float terr = smoothstep(0.45, 0.6, vn(p * 0.0011 + 23.0));
  float q = h / 46.0; float st = floor(q), fr = fract(q);
  h = mix(h, (st + smoothstep(0.0, 0.22, fr)) * 46.0, terr * 0.85);
  h *= uScale;
  h += uShimmer * sin(base.x * 0.05 + uTime * 2.3) * sin(base.z * 0.037 + uTime * 1.7) * 2.2;
  float y = mix(-160.0, h, aT);
  vH = y; vT = aT; vWP = base;
  gl_Position = projectionMatrix * viewMatrix * vec4(base.x, y + base.y, base.z, 1.0);
}`;

const MT_FRAG = `
uniform vec3 uHaze; uniform vec3 uFar; uniform vec3 uDust; uniform float uHazeAmt; uniform float uDay; uniform float uStorm;
uniform vec3 uCol1; uniform vec3 uCol2; uniform vec2 uSunXZ; uniform vec3 uSunCol; uniform vec3 uSunGlow;
varying float vH; varying float vT; varying vec3 vWP;
void main(){
  vec3 dir = vWP - cameraPosition; vec2 dxz = normalize(dir.xz + vec2(1e-5));
  float strata = 0.5 + 0.5 * sin(vH * 0.32 + sin(vWP.x * 0.004 + vWP.z * 0.003) * 4.0);
  vec3 rock = mix(uCol1, uCol2, smoothstep(0.0, 260.0, vH) * 0.7 + strata * 0.3);
  float facing = 0.5 + 0.5 * dot(-dxz, uSunXZ);
  float lit = 0.35 + 0.65 * facing;
  rock *= lit * uSunCol * uDay + vec3(0.02, 0.025, 0.045) * (1.0 - uDay) * 3.0;
  float hz = clamp(uHazeAmt + (1.0 - smoothstep(0.0, 140.0, vH)) * 0.45, 0.0, 1.0);
  vec3 hazeCol = mix(uHaze, uFar, 0.55);
  vec3 col = mix(rock, hazeCol, hz);
  float sgl = pow(max(dot(dxz, uSunXZ), 0.0), 5.0);
  col += uSunGlow * sgl * hz;
  float up = clamp(dir.y / max(length(dir), 1.0), 0.0, 1.0);
  col = mix(col, uDust * (0.94 + 0.12 * (1.0 - up)), uStorm);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Camera-centred rings of far mountains (height field sampled in world space, so they parallax correctly). */
export class Mountains {
  readonly group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  constructor() {
    const layers: { r: number; scale: number; haze: number; seed: number; c1: string; c2: string }[] = [
      { r: 1560, scale: 0.62, haze: 0.36, seed: 1.0, c1: '#7b4a34', c2: '#c48a5e' },
      { r: 1960, scale: 1.0, haze: 0.54, seed: 7.3, c1: '#80503a', c2: '#c99466' },
      { r: 2360, scale: 1.3, haze: 0.7, seed: 3.7, c1: '#855640', c2: '#cc9c70' },
    ];
    const SEG = 360;
    for (const L of layers) {
      const pos = new Float32Array((SEG + 1) * 2 * 3), t = new Float32Array((SEG + 1) * 2), idx: number[] = [];
      for (let s = 0; s <= SEG; s++) {
        const a = (s / SEG) * Math.PI * 2, x = Math.cos(a) * L.r, z = Math.sin(a) * L.r;
        for (let k = 0; k < 2; k++) { const v = s * 2 + k; pos[v * 3] = x; pos[v * 3 + 1] = 0; pos[v * 3 + 2] = z; t[v] = k; }
        if (s < SEG) { const v = s * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        side: THREE.DoubleSide, fog: false,
        uniforms: {
          uScale: { value: L.scale }, uShimmer: { value: 0 }, uTime: { value: 0 }, uSeed: { value: L.seed },
          uHaze: { value: new THREE.Color() }, uDust: { value: new THREE.Color() }, uFar: { value: new THREE.Color() }, uHazeAmt: { value: L.haze }, uDay: { value: 1 }, uStorm: { value: 0 },
          uCol1: { value: new THREE.Color(L.c1) }, uCol2: { value: new THREE.Color(L.c2) }, uSunXZ: { value: new THREE.Vector2(1, 0) },
          uSunCol: { value: new THREE.Color('#fff0d0') }, uSunGlow: { value: new THREE.Color() },
        },
        vertexShader: MT_VERT, fragmentShader: MT_FRAG,
      });
      m.userData.baseHaze = L.haze;
      this.mats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }
  /** Follow the camera in x / z and push the lighting state into every layer. */
  update(camPos: THREE.Vector3, s: { haze: THREE.Color; dust: THREE.Color; far: THREE.Color; day: number; storm: number; sunXZ: THREE.Vector2; sunCol: THREE.Color; glow: THREE.Color; shimmer: number; time: number; night: number }) {
    this.group.position.x = camPos.x; this.group.position.z = camPos.z; // y: World follows the road height
    for (const m of this.mats) {
      const u = m.uniforms;
      u.uHaze.value.copy(s.haze); u.uDust.value.copy(s.dust); u.uFar.value.copy(s.far); u.uDay.value = s.day; u.uStorm.value = s.storm;
      u.uHazeAmt.value = m.userData.baseHaze * (1 - 0.35 * s.night);
      u.uSunXZ.value.copy(s.sunXZ); u.uSunCol.value.copy(s.sunCol); u.uSunGlow.value.copy(s.glow);
      u.uShimmer.value = s.shimmer; u.uTime.value = s.time;
    }
  }
}
