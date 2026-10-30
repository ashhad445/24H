// Procedural texture generators for the outdoor world (sand, gravel, asphalt, paint wear, cloud noise).
// Everything is written straight into typed arrays (DataTexture), so there is no canvas dependency and no asset to 404.
import * as THREE from 'three';
import { TileNoise, prng } from './Noise';

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrapi = (i: number, n: number) => ((i % n) + n) % n;

/** Tileable fractal noise generator: octave o uses `cells * 2^o` cells. */
function makeFbm(cells: number, oct: number, seed: number) {
  const tn: TileNoise[] = [];
  for (let o = 0; o < oct; o++) tn.push(new TileNoise(cells << o, seed + o * 101));
  return (u: number, v: number) => {
    let s = 0, amp = 0.5, norm = 0, c = cells;
    for (let o = 0; o < oct; o++) { s += amp * tn[o].at(u * c, v * c); norm += amp; amp *= 0.5; c *= 2; }
    return s / norm;
  };
}
/** Same, but with independent cell counts across/along (only the along axis `v` is guaranteed to tile). */
function makeFbmRect(cu: number, cv: number, oct: number, seed: number) {
  const m = Math.max(cu, cv);
  const tn: TileNoise[] = [];
  for (let o = 0; o < oct; o++) tn.push(new TileNoise(m << o, seed + o * 101));
  return (u: number, v: number) => {
    let s = 0, amp = 0.5, norm = 0, a = cu, b = cv;
    for (let o = 0; o < oct; o++) { s += amp * tn[o].at(u * a, v * b); norm += amp; amp *= 0.5; a *= 2; b *= 2; }
    return s / norm;
  };
}

function dataTex(w: number, h: number, data: Uint8ClampedArray, srgb: boolean, repeat = true) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Tangent-space normal map from a wrapping height field. */
function normalFromHeight(hf: Float32Array, w: number, h: number, strength: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = wrapi(y - 1, h) * w, y1 = wrapi(y + 1, h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = wrapi(x - 1, w), x1 = wrapi(x + 1, w);
      const dx = (hf[yc + x1] - hf[yc + x0]) * strength, dy = (hf[y1 + x] - hf[y0 + x]) * strength;
      const il = 1 / Math.hypot(dx, dy, 1);
      const i = (yc + x) * 4;
      out[i] = (-dx * il * 0.5 + 0.5) * 255; out[i + 1] = (-dy * il * 0.5 + 0.5) * 255; out[i + 2] = (il * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  }
  return out;
}

/** Stamp a round bump (wrapping) into a height field and optionally tint an RGB buffer. */
function bump(hf: Float32Array, w: number, h: number, cx: number, cy: number, rx: number, ry: number, amp: number,
  rgb?: Float32Array, col?: [number, number, number], colA = 0) {
  const ex = Math.ceil(rx + 1), ey = Math.ceil(ry + 1);
  for (let dy = -ey; dy <= ey; dy++) for (let dx = -ex; dx <= ex; dx++) {
    const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (d >= 1) continue;
    const k = Math.sqrt(1 - d); // dome profile
    const i = wrapi(Math.round(cy) + dy, h) * w + wrapi(Math.round(cx) + dx, w);
    hf[i] = Math.max(hf[i], amp * k);
    if (rgb && col) { const a = colA * smooth(0, 0.35, k); const j = i * 3; rgb[j] += (col[0] - rgb[j]) * a; rgb[j + 1] += (col[1] - rgb[j + 1]) * a; rgb[j + 2] += (col[2] - rgb[j + 2]) * a; }
  }
}

// ---------------------------------------------------------------- sand
/** Desert sand: wind ripples, pebbles and darker scrub-soil patches. Tile = 24 m. */
export function makeSand() {
  const N = 512, rnd = prng(7);
  const f1 = makeFbm(3, 4, 11), f2 = makeFbm(5, 4, 29), f3 = makeFbm(16, 3, 43), fw = makeFbm(4, 3, 61);
  const hf = new Float32Array(N * N), rgb = new Float32Array(N * N * 3);
  const A = 58, B = 21; // ripple wave vector (integer cycles per tile so it tiles)
  const c1 = [214, 170, 114], c2 = [196, 150, 98], c3 = [228, 192, 138], c4 = [168, 124, 78];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const n1 = f1(u, v), n2 = f2(u, v), n3 = f3(u, v);
    const warp = (fw(u, v) - 0.5) * 14;
    const ph = TAU * (A * u + B * v) + warp;
    let rip = Math.sin(ph) + 0.3 * Math.sin(2 * ph + 1.1);
    const mask = smooth(0.45, 0.7, n2);
    rip *= mask;
    hf[i] = rip * 0.3 + (n3 - 0.5) * 0.3;
    const t = smooth(0.35, 0.65, n1), p = smooth(0.58, 0.7, n2 * 0.6 + n1 * 0.4);
    let r = c1[0] + (c2[0] - c1[0]) * t, g = c1[1] + (c2[1] - c1[1]) * t, b = c1[2] + (c2[2] - c1[2]) * t;
    const hi = smooth(0.55, 0.75, n3) * 0.5; // sun-bleached spots
    r += (c3[0] - r) * hi; g += (c3[1] - g) * hi; b += (c3[2] - b) * hi;
    r += (c4[0] - r) * p * 0.8; g += (c4[1] - g) * p * 0.8; b += (c4[2] - b) * p * 0.8;
    const shade = 1 + 0.045 * rip;
    const sp = 0.94 + rnd() * 0.12;
    rgb[i * 3] = r * shade * sp; rgb[i * 3 + 1] = g * shade * sp; rgb[i * 3 + 2] = b * shade * sp;
  }
  const pal: [number, number, number][] = [[138, 106, 72], [176, 138, 92], [110, 90, 69], [201, 173, 132], [150, 96, 66]];
  for (let k = 0; k < 520; k++) {
    const r = 1 + rnd() * rnd() * 3.4;
    bump(hf, N, N, rnd() * N, rnd() * N, r * (0.8 + rnd() * 0.5), r, 0.35 + r * 0.25, rgb, pal[Math.floor(rnd() * pal.length)], 0.75);
  }
  const color = new Uint8ClampedArray(N * N * 4);
  let lum = 0;
  const lin = (v: number) => Math.pow(clamp01(v / 255), 2.2);
  for (let i = 0; i < N * N; i++) {
    color[i * 4] = rgb[i * 3]; color[i * 4 + 1] = rgb[i * 3 + 1]; color[i * 4 + 2] = rgb[i * 3 + 2]; color[i * 4 + 3] = 255;
    lum += 0.2126 * lin(color[i * 4]) + 0.7152 * lin(color[i * 4 + 1]) + 0.0722 * lin(color[i * 4 + 2]);
  }
  return { map: dataTex(N, N, color, true), normal: dataTex(N, N, normalFromHeight(hf, N, N, 1.7), false), meanLum: lum / (N * N) };
}

// ---------------------------------------------------------------- gravel (shoulders)
/** Crushed-gravel shoulder. Tile = 3 m. */
export function makeGravel() {
  const N = 256, rnd = prng(19);
  const f1 = makeFbm(4, 3, 5), f2 = makeFbm(24, 2, 9);
  const hf = new Float32Array(N * N), rgb = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const n = f1(u, v), m = f2(u, v);
    const base = 126 + (n - 0.5) * 50 + (m - 0.5) * 38;
    hf[i] = (m - 0.5) * 0.3;
    rgb[i * 3] = base * 1.07; rgb[i * 3 + 1] = base * 0.95; rgb[i * 3 + 2] = base * 0.8;
  }
  const pal: [number, number, number][] = [[150, 124, 96], [118, 106, 94], [176, 150, 118], [92, 80, 70], [196, 176, 148], [136, 100, 74]];
  for (let k = 0; k < 2600; k++) {
    const r = 1.2 + rnd() * rnd() * 3.8;
    bump(hf, N, N, rnd() * N, rnd() * N, r * (0.8 + rnd() * 0.45), r, 0.6 + r * 0.3, rgb, pal[Math.floor(rnd() * pal.length)], 0.85);
  }
  const color = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < N * N; i++) { const s = 0.92 + rnd() * 0.16; color[i * 4] = rgb[i * 3] * s; color[i * 4 + 1] = rgb[i * 3 + 1] * s; color[i * 4 + 2] = rgb[i * 3 + 2] * s; color[i * 4 + 3] = 255; }
  return { map: dataTex(N, N, color, true), normal: dataTex(N, N, normalFromHeight(hf, N, N, 3.2), false) };
}

// ---------------------------------------------------------------- asphalt
export const ASPHALT_W = 21.1;   // meters across (the road, edge to edge)
export const ASPHALT_L = 84.4;   // meters along one texture repeat
/**
 * Road surface. `macro` (256 x 1024, 8 cm/px) holds the whole road width: worn wheel tracks, oil, skid marks,
 * cracks, tar seams, patches and swept sand at the edges. `rough` is the matching roughness map (G channel).
 * `micro` is a small tiling aggregate normal map (1.6 m).
 */
export function makeAsphalt(laneW: number) {
  const W = 256, H = 1024, rnd = prng(101);
  const pxm = W / ASPHALT_W; // pixels per meter (same along)
  const uOf = (off: number) => (0.5 + off / ASPHALT_W) * W; // road offset (m) -> px
  const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H), RG = new Float32Array(W * H).fill(0.9);
  const wear = makeFbmRect(2, 8, 4, 77), blot = makeFbmRect(5, 20, 3, 91), edge = makeFbmRect(8, 48, 3, 5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x;
    const wv = wear(u, v), bv = blot(u, v);
    let base = 58 + (wv - 0.5) * 22 + (bv - 0.5) * 10;
    const sp = 0.86 + rnd() * 0.26; // aggregate speckle
    if (rnd() < 0.025) base += 28 * rnd(); // light stone chips
    R[i] = base * sp * 0.99; G[i] = base * sp; B[i] = base * sp * 1.06;
  }
  const mix = (x: number, y: number, c: [number, number, number], a: number, rough = -1) => {
    const xi = Math.round(x);
    if (a <= 0 || xi < 0 || xi >= W) return;
    const i = wrapi(Math.round(y), H) * W + xi;
    R[i] += (c[0] - R[i]) * a; G[i] += (c[1] - G[i]) * a; B[i] += (c[2] - B[i]) * a;
    if (rough >= 0) RG[i] += (rough - RG[i]) * a;
  };
  // wheel tracks: darker rubbered strips in every lane, plus a dark oil line down the lane middle
  const lanes = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((k) => k * laneW);
  const trackC: [number, number, number] = [42, 42, 46], oilC: [number, number, number] = [30, 30, 33];
  for (const c of lanes) {
    for (const wo of [-0.86, 0.86]) {
      const cx = uOf(c + wo), sg = 0.3 * pxm;
      for (let y = 0; y < H; y++) {
        const mod = 0.55 + 0.45 * wear(0.37 + wo, y / H);
        for (let dx = -Math.ceil(sg * 2.5); dx <= Math.ceil(sg * 2.5); dx++) {
          const a = Math.exp(-(dx * dx) / (2 * sg * sg)) * 0.55 * mod;
          mix(cx + dx, y, trackC, a, 0.72);
        }
      }
    }
    const cx = uOf(c), sg = 0.1 * pxm;
    for (let y = 0; y < H; y++) { const m = smooth(0.45, 0.65, wear(0.8 + c * 0.01, y / H)); for (let dx = -3; dx <= 3; dx++) mix(cx + dx, y, oilC, Math.exp(-(dx * dx) / (2 * sg * sg)) * 0.35 * m, 0.7); }
  }
  // oil stains
  for (let k = 0; k < 9; k++) {
    const cx = uOf(lanes[Math.floor(rnd() * 6)] + (rnd() - 0.5) * 1.4), cy = rnd() * H, rx = (0.25 + rnd() * 0.5) * pxm, ry = (0.4 + rnd() * 0.9) * pxm;
    for (let b = 0; b < 3; b++) {
      const bx = cx + (rnd() - 0.5) * rx, by = cy + (rnd() - 0.5) * ry, sx = rx * (0.5 + rnd() * 0.5), sy = ry * (0.5 + rnd() * 0.5);
      for (let dy = -Math.ceil(sy); dy <= sy; dy++) for (let dx = -Math.ceil(sx); dx <= sx; dx++) {
        const d = (dx * dx) / (sx * sx) + (dy * dy) / (sy * sy); if (d >= 1) continue;
        mix(bx + dx, by + dy, oilC, (1 - d) * 0.55 * (0.7 + 0.3 * rnd()), 0.45);
      }
    }
  }
  // skid marks: twin black arcs that fade in and out
  for (let k = 0; k < 5; k++) {
    const x0 = uOf(lanes[Math.floor(rnd() * 6)] + (rnd() - 0.5) * 0.6), y0 = rnd() * H, len = (9 + rnd() * 9) * pxm, curve = (rnd() - 0.5) * 0.35 * pxm, tw = 0.8 * pxm / 2;
    for (let s = 0; s < len; s += 0.5) {
      const t = s / len, x = x0 + curve * t * t * 8, y = y0 + s, f = smooth(0, 0.15, t) * (1 - smooth(0.7, 1, t)) * (0.5 + 0.5 * rnd());
      for (const sd of [-tw, tw]) { mix(x + sd, y, [20, 20, 22], 0.6 * f, 0.6); mix(x + sd + 1, y, [20, 20, 22], 0.35 * f, 0.6); }
    }
  }
  // cracks: jittery random walks, some branching, some sealed with glossy tar
  const crack = (x: number, y: number, ang: number, len: number, tar: boolean, depth: number) => {
    for (let s = 0; s < len; s++) {
      ang += (rnd() - 0.5) * 0.55;
      x += Math.cos(ang) * 0.8; y += Math.sin(ang) * 0.8;
      mix(x, y, tar ? [18, 18, 20] : [24, 24, 27], tar ? 0.9 : 0.8, tar ? 0.5 : 0.95);
      if (tar) mix(x + 1, y, [26, 26, 29], 0.45, 0.5);
      if (depth < 2 && rnd() < 0.025) crack(x, y, ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.7), len * 0.4, tar, depth + 1);
    }
  };
  for (let k = 0; k < 26; k++) crack(rnd() * W, rnd() * H, rnd() < 0.55 ? Math.PI / 2 + (rnd() - 0.5) * 0.9 : rnd() * TAU, 30 + rnd() * 110, rnd() < 0.4, 0);
  // longitudinal tar seams next to the lane lines (broken), and transverse seams every ~14 m
  const seamGate = makeFbmRect(1, 24, 2, 33);
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const cx = uOf(k * laneW + (k > 0 ? 0.42 : -0.42));
    for (let y = 0; y < H; y++) if (seamGate(0.3 + k * 0.17, y / H) > 0.4) { mix(cx + Math.sin(y * 0.05 + k) * 0.5, y, [22, 22, 24], 0.8, 0.5); mix(cx + 1 + Math.sin(y * 0.05 + k) * 0.5, y, [32, 32, 35], 0.35, 0.55); }
  }
  for (let k = 0; k < 6; k++) {
    const y0 = ((k + 0.2 + rnd() * 0.6) / 6) * H, gate = makeFbmRect(8, 1, 2, 200 + k);
    for (let x = 0; x < W; x++) if (gate(x / W, 0.1) > 0.33) {
      const yy = y0 + Math.sin(x * 0.08 + k * 2) * 1.3 + (x * (rnd() < 0.002 ? 1 : 0));
      mix(x, yy, [20, 20, 23], 0.88, 0.5); mix(x, yy + 1, [30, 30, 33], 0.5, 0.55);
    }
  }
  // repair patches
  for (let k = 0; k < 7; k++) {
    const pw = (1.4 + rnd() * 2.6) * pxm, ph = (1.8 + rnd() * 3.4) * pxm, px = uOf(lanes[Math.floor(rnd() * 6)] + (rnd() - 0.5) * 1.8) - pw / 2, py = rnd() * H;
    const dark = rnd() < 0.6, pc: [number, number, number] = dark ? [40, 40, 44] : [86, 85, 88];
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const edge = x < 1.2 || y < 1.2 || x > pw - 2.2 || y > ph - 2.2;
      const n = 0.9 + rnd() * 0.2;
      mix(px + x, py + y, edge ? [22, 22, 25] : [pc[0] * n, pc[1] * n, pc[2] * n], edge ? 0.85 : 0.9, edge ? 0.5 : 0.98);
    }
  }
  // sand swept onto the pavement at both edges
  const sandC: [number, number, number] = [176, 146, 104];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const off = (x / W - 0.5) * ASPHALT_W, d = ASPHALT_W / 2 - Math.abs(off);
    const e = edge(x / W, y / H);
    const a = (1 - smooth(0.0, 1.5 + e * 2.2, d)) * smooth(0.28, 0.6, e) * 0.85;
    mix(x, y, sandC, a, 1);
  }
  const color = new Uint8ClampedArray(W * H * 4), rough = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    color[i * 4] = R[i]; color[i * 4 + 1] = G[i]; color[i * 4 + 2] = B[i]; color[i * 4 + 3] = 255;
    rough[i * 4] = 255; rough[i * 4 + 1] = RG[i] * 255; rough[i * 4 + 2] = 255; rough[i * 4 + 3] = 255;
  }
  // micro aggregate normal map (1.6 m tile)
  const M = 256, mh = new Float32Array(M * M), mf = makeFbm(32, 2, 3);
  for (let i = 0; i < M * M; i++) mh[i] = (mf((i % M) / M, Math.floor(i / M) / M) - 0.5) * 0.4;
  for (let k = 0; k < 3600; k++) { const r = 0.9 + rnd() * 1.7; bump(mh, M, M, rnd() * M, rnd() * M, r, r * (0.8 + rnd() * 0.4), 0.4 + r * 0.25); }
  const micro = dataTex(M, M, normalFromHeight(mh, M, M, 2.4), false);
  const macro = dataTex(W, H, color, true), roughMap = dataTex(W, H, rough, false);
  for (const t of [macro, roughMap]) { t.repeat.set(1 / ASPHALT_W, 1 / ASPHALT_L); t.offset.set(0.5, 0); }
  micro.repeat.set(1 / 1.6, 1 / 1.6);
  return { macro, rough: roughMap, micro };
}

// ---------------------------------------------------------------- road paint wear
/** Alpha-tested wear for lane lines. Sampled by a ribbon uv (u ~ lateral offset, v = z / 4 m); one repeat = 64 m. */
export function makePaintWear() {
  const W = 64, H = 1024, rnd = prng(303);
  const chip = makeFbmRect(2, 24, 4, 17), streak = makeFbmRect(1, 6, 2, 23);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    const c = chip(u, v), s = streak(u, v);
    const worn = smooth(0.58, 0.74, c + (s - 0.5) * 0.25 + (rnd() - 0.5) * 0.12); // chipped away
    const a = 1 - worn * 0.95;
    const dirt = 0.82 + 0.18 * (1 - smooth(0.3, 0.7, s)) + (rnd() - 0.5) * 0.06;
    data[i] = 255 * dirt; data[i + 1] = 255 * dirt * 0.985; data[i + 2] = 255 * dirt * 0.93; data[i + 3] = a * 255;
  }
  const t = dataTex(W, H, data, true);
  t.repeat.set(1, 1 / 16);
  return t;
}

// ---------------------------------------------------------------- cloud noise
/** 256 x 256 tileable noise: R = broad cloud shapes, G = fine detail (both contrast-stretched). */
export function makeCloudNoise() {
  const N = 256, f1 = makeFbm(4, 5, 401), f2 = makeFbm(10, 4, 433);
  const data = new Uint8ClampedArray(N * N * 4);
  const stretch = (x: number) => clamp01((x - 0.5) * 2.1 + 0.5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    data[i] = stretch(f1(x / N, y / N)) * 255; data[i + 1] = stretch(f2(x / N, y / N)) * 255; data[i + 2] = 0; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
