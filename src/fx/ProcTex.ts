// Procedural surface textures: wood, vinyl, carpet, fiberglass, brushed/chrome metal, painted metal, rust,
// stucco, brick, concrete, tile, felt… Each generator returns tileable colour + normal (+ roughness) maps built
// from a height field (Sobel). Everything is plain typed arrays -> DataTexture, so it also works headless
// (no canvas needed), is generated once on first use and shared.
//
// Meter-scaled UVs: give a material `userData.tile = <meters per texture tile>` and build its boxes with
// `boxGeo()` so the texture keeps a constant world scale on every face instead of stretching 0..1 per face.
import * as THREE from 'three';

export interface TexSet { map: THREE.DataTexture; normalMap: THREE.DataTexture; roughnessMap?: THREE.DataTexture }

const N = 256;
type F = Float32Array;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (h: string): [number, number, number] => { const v = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };

/** Tileable value noise with px x py lattice cells, 0..1. */
function noise(px: number, py: number, seed: number): F {
  const r = rng(seed), g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(N * N);
  const x0 = new Int32Array(N), x1 = new Int32Array(N), sx = new Float32Array(N);
  for (let x = 0; x < N; x++) { const fx = (x / N) * px, i = Math.floor(fx), t = fx - i; x0[x] = i % px; x1[x] = (i + 1) % px; sx[x] = t * t * (3 - 2 * t); }
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * py, j = Math.floor(fy), t = fy - j, sy = t * t * (3 - 2 * t), r0 = (j % py) * px, r1 = ((j + 1) % py) * px;
    for (let x = 0; x < N; x++) {
      const a = mix(g[r0 + x0[x]], g[r0 + x1[x]], sx[x]), b = mix(g[r1 + x0[x]], g[r1 + x1[x]], sx[x]);
      out[y * N + x] = mix(a, b, sy);
    }
  }
  return out;
}
/** Fractal noise, normalised back to 0..1. */
function fbm(px: number, py: number, oct: number, seed: number): F {
  const out = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = noise(px << o, py << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function mk(data: Uint8Array, srgb: boolean) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** rgb: 0..255 floats (3 per pixel). height: any range. strength: normal bump. rough: 0..1 (optional). */
function finish(rgb: F, height: F, strength: number, rough?: F): TexSet {
  const col = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, y0 = y * N;
    for (let x = 0; x < N; x++) {
      const i = y0 + x, xm = (x - 1 + N) % N, xp = (x + 1) % N;
      const dx = (height[y0 + xp] - height[y0 + xm]) * strength, dy = (height[yp + x] - height[ym + x]) * strength;
      const l = 1 / Math.hypot(dx, dy, 1);
      nrm[i * 4] = (-dx * l * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (-dy * l * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (l * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
      col[i * 4] = clamp(rgb[i * 3], 0, 255); col[i * 4 + 1] = clamp(rgb[i * 3 + 1], 0, 255); col[i * 4 + 2] = clamp(rgb[i * 3 + 2], 0, 255); col[i * 4 + 3] = 255;
    }
  }
  const set: TexSet = { map: mk(col, true), normalMap: mk(nrm, false) };
  if (rough) {
    const r = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { const v = clamp(rough[i]) * 255; r[i * 4] = v; r[i * 4 + 1] = v; r[i * 4 + 2] = v; r[i * 4 + 3] = 255; }
    set.roughnessMap = mk(r, false);
  }
  return set;
}

const cache = new Map<string, TexSet>();
function cached(key: string, make: () => TexSet) { let s = cache.get(key); if (!s) { s = make(); cache.set(key, s); } return s; }

/** Same textures with a different repeat (shares the pixel data). */
export function repeated(s: TexSet, rx: number, ry: number): TexSet {
  const c = (t: THREE.DataTexture) => { const k = t.clone(); k.repeat.set(rx, ry); k.needsUpdate = true; return k; };
  return { map: c(s.map), normalMap: c(s.normalMap), roughnessMap: s.roughnessMap && c(s.roughnessMap) };
}

/** Assign a set to a material (call before the material is first rendered / warmed). */
export function applyTex<T extends THREE.MeshStandardMaterial>(m: T, s: TexSet, o: { tile?: number; normal?: number; tint?: boolean; roughness?: number; metalness?: number } = {}): T {
  m.map = s.map; m.normalMap = s.normalMap; if (s.roughnessMap) m.roughnessMap = s.roughnessMap;
  m.normalScale.set(o.normal ?? 1, o.normal ?? 1);
  if (!o.tint) m.color.set('#ffffff');
  if (o.roughness !== undefined) m.roughness = o.roughness;
  if (o.metalness !== undefined) m.metalness = o.metalness;
  if (o.tile) m.userData.tile = o.tile;
  m.needsUpdate = true;
  return m;
}

/** A fresh material for one big flat surface: the texture repeats every `tile` meters over w x h. */
export function surfaceMat(s: TexSet, color: string, w: number, h: number, tile: number, o: { roughness?: number; normal?: number; metalness?: number } = {}) {
  const r = repeated(s, Math.max(1, w / tile), Math.max(1, h / tile));
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0, map: r.map, normalMap: r.normalMap, roughnessMap: r.roughnessMap });
  m.normalScale.set(o.normal ?? 1, o.normal ?? 1);
  return m;
}

/** BoxGeometry whose UVs are scaled to meters when the material carries `userData.tile`. */
export function boxGeo(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[]) {
  const g = new THREE.BoxGeometry(w, h, d);
  const tile = !Array.isArray(mat) ? (mat.userData?.tile as number | undefined) : undefined;
  if (!tile) return g;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x −x +y −y +z −z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile); }
  return g;
}

// ------------------------------------------------------------------ generators

/** Wood paneling: 4 planks per tile with grooves, butt joints, grain streaks and a few knots. */
export function wood(kind: 'dark' | 'light' | 'pale' = 'dark'): TexSet {
  return cached('wood' + kind, () => {
    const [lo, hi] = kind === 'dark' ? [hex('#4e2c12'), hex('#a8703a')] : kind === 'light' ? [hex('#a87c4c'), hex('#dcb582')] : [hex('#b89a74'), hex('#e6d2b2')];
    const streak = fbm(2, 40, 3, 11), fine = noise(6, 200, 17), low = fbm(3, 5, 2, 23), r = rng(kind.length * 977 + 5);
    const tone = [r(), r(), r(), r()], seam = [r() * 200 + 20, r() * 200 + 20, r() * 200 + 20, r() * 200 + 20];
    const knots = Array.from({ length: 3 }, () => ({ x: 30 + r() * 196, y: 20 + r() * 216, rx: 8 + r() * 8, ry: 3 + r() * 3 }));
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, p = y >> 6, ly = y & 63;
      const groove = Math.max(ly < 2 || ly > 61 ? 1 : 0, Math.abs(x - seam[p]) < 1.5 ? 0.8 : 0);
      let g = streak[i] * 0.55 + fine[i] * 0.2 + low[i] * 0.25;
      for (const k of knots) { const d = Math.hypot((x - k.x) / k.rx, (y - k.y) / k.ry); if (d < 2.4) g = mix(g, 0.5 + 0.5 * Math.sin(d * 7), 0.55 * (1 - d / 2.4)); }
      const t = clamp(g * 1.15 + (tone[p] - 0.5) * 0.35 - 0.08);
      const f = groove ? 0.4 : 1;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = mix(lo[c], hi[c], t) * f;
      h[i] = g * 0.5 - groove * 1.2; rough[i] = 0.62 + g * 0.18 + groove * 0.3;
    }
    return finish(rgb, h, 2.2, rough);
  });
}

/** Beadboard cabin lining: vertical boards with a rounded bead, water stains. */
export function beadboard(base = '#e8dcc4'): TexSet {
  return cached('bead' + base, () => {
    const b = hex(base), stain = fbm(3, 3, 3, 31), grain = noise(64, 4, 37), fine = noise(128, 128, 41);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, lx = (x & 31) / 32, edge = Math.min(lx, 1 - lx);
      const groove = edge < 0.06 ? 1 : 0, bead = Math.exp(-Math.pow((edge - 0.16) / 0.05, 2));
      const st = clamp((stain[i] - 0.55) * 3) * 0.22;
      const v = 0.94 + grain[i] * 0.08 - st - groove * 0.35 + bead * 0.04 + (fine[i] - 0.5) * 0.04;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v * (c === 2 ? 1 - st * 0.6 : 1);
      h[i] = bead * 0.6 - groove * 1.4 + grain[i] * 0.1; rough[i] = 0.85 - groove * 0.1;
    }
    return finish(rgb, h, 2.4, rough);
  });
}

/** Quilted vinyl (diamond tufts, buttons, shiny high points, worn patches). */
export function vinyl(base = '#8d4a2f', K = 4, wear = 1): TexSet {
  return cached(`vinyl${base}${K}${wear}`, () => {
    const b = hex(base), worn = fbm(4, 4, 3, 53), fine = noise(128, 128, 59), crack = fbm(5, 5, 2, 61);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, a = ((x + y) / N) * K, bb = ((x - y + N) / N) * K;
      const fa = a - Math.floor(a), fb = bb - Math.floor(bb);
      const pillow = Math.pow(Math.sin(Math.PI * fa) * Math.sin(Math.PI * fb), 0.7);
      const btn = Math.min(Math.hypot(Math.min(fa, 1 - fa), Math.min(fb, 1 - fb)) * 7, 1); // 0 at the lattice points
      const w = clamp((worn[i] - 0.58) * 4) * wear;
      const cr = Math.abs(crack[i] - 0.5) < 0.012 && worn[i] > 0.5 ? wear : 0;
      let v = 0.62 + pillow * 0.5 + (fine[i] - 0.5) * 0.06;
      v *= 1 - (1 - btn) * 0.55; v = mix(v, v * 1.18 + 0.05, w); v *= 1 - cr * 0.5;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = mix(b[c] * v, 215, cr * 0.25 + w * 0.06);
      h[i] = pillow * 0.9 - (1 - btn) * 0.6 - cr * 0.3; rough[i] = clamp(0.5 - pillow * 0.1 + w * 0.25 + (fine[i] - 0.5) * 0.1);
    }
    return finish(rgb, h, 2.0, rough);
  });
}

/** Worn shag carpet with stains. */
export function carpet(base = '#7a5a3c'): TexSet {
  return cached('carpet' + base, () => {
    const b = hex(base), hf = noise(128, 128, 71), hf2 = noise(64, 64, 73), stain = fbm(3, 3, 3, 79), trod = fbm(2, 2, 2, 83);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N).fill(1);
    for (let i = 0; i < N * N; i++) {
      const f = hf[i] * 0.6 + hf2[i] * 0.4, st = clamp((stain[i] - 0.6) * 3.5) * 0.35, tr = clamp((trod[i] - 0.5) * 2) * 0.12;
      const v = 0.72 + f * 0.55 - st + tr;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
      h[i] = f - st * 0.4 - tr;
    }
    return finish(rgb, h, 1.6, rough);
  });
}

/** Woven upholstery / fabric: stripes of 1 or 2 colours with a coarse weave. */
export function fabric(base = '#c9a66b', stripe?: string, stripes = 8): TexSet {
  return cached(`fab${base}${stripe}${stripes}`, () => {
    const b = hex(base), s = hex(stripe ?? base), nz = noise(96, 96, 89), wear = fbm(3, 3, 3, 91);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N).fill(0.95);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, band = Math.floor((y / N) * stripes) % 2, weave = ((x >> 1) + (y >> 1)) & 1;
      const w = clamp((wear[i] - 0.55) * 3) * 0.2;
      const v = 0.9 + weave * 0.1 + (nz[i] - 0.5) * 0.12 - w;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = (band ? s[c] : b[c]) * v;
      h[i] = weave * 0.5 + nz[i] * 0.4;
    }
    return finish(rgb, h, 1.2, rough);
  });
}

/** Casino/billiard felt: soft fuzz, slight sheen where it has been rubbed. */
export function felt(base = '#1b5e20'): TexSet {
  return cached('felt' + base, () => {
    const b = hex(base), hf = noise(128, 128, 97), lo = fbm(4, 4, 3, 101);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N).fill(1);
    for (let i = 0; i < N * N; i++) {
      const v = 0.78 + hf[i] * 0.3 + (lo[i] - 0.5) * 0.3;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
      h[i] = hf[i];
    }
    return finish(rgb, h, 0.9, rough);
  });
}

/** Cream fiberglass / glossy painted body panel: orange-peel bumps, vertical rain streaks, faded patches. */
export function fiberglass(base = '#f4efe6'): TexSet {
  return cached('fg' + base, () => {
    const b = hex(base), peel = noise(96, 96, 107), peel2 = noise(48, 48, 109), streak = fbm(26, 2, 3, 113), fade = fbm(3, 3, 3, 127);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const s = clamp((streak[i] - 0.5) * 2.4), f = (fade[i] - 0.5);
      const v = 1 - s * 0.07 + f * 0.08 + (peel[i] - 0.5) * 0.03;
      rgb[i * 3] = b[0] * v; rgb[i * 3 + 1] = b[1] * v * (1 - s * 0.01); rgb[i * 3 + 2] = b[2] * v * (1 - s * 0.045);
      h[i] = peel[i] * 0.6 + peel2[i] * 0.4; rough[i] = clamp(0.62 + f * 0.35 + s * 0.12);
    }
    return finish(rgb, h, 0.9, rough);
  });
}

/** Brushed steel / aluminium: horizontal streaks, roughness varies with them. */
export function brushed(base = '#9aa0a6', rough0 = 0.5): TexSet {
  return cached(`brush${base}${rough0}`, () => {
    const b = hex(base), s1 = noise(2, 160, 131), s2 = noise(4, 256, 137), blot = fbm(3, 3, 2, 139), spec = noise(128, 128, 149);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const s = s1[i] * 0.5 + s2[i] * 0.5, v = 0.86 + s * 0.22 + (blot[i] - 0.5) * 0.18 - (spec[i] > 0.93 ? 0.18 : 0);
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
      h[i] = s * 0.5; rough[i] = clamp(rough0 * (0.7 + s * 0.6) + (blot[i] - 0.5) * 0.3);
    }
    return finish(rgb, h, 0.7, rough);
  });
}

/** Chrome plating: near-white, mostly mirror, pitted and hazed in patches. */
export function chrome(): TexSet {
  return cached('chrome', () => {
    const haze = fbm(4, 4, 3, 151), pit = noise(160, 160, 157), sc = noise(2, 220, 163);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const hz = clamp((haze[i] - 0.5) * 2.2), v = 0.93 - hz * 0.1 - (pit[i] > 0.9 ? 0.12 : 0) - (sc[i] > 0.82 ? 0.05 : 0);
      rgb[i * 3] = 232 * v; rgb[i * 3 + 1] = 236 * v; rgb[i * 3 + 2] = 240 * v;
      h[i] = sc[i] * 0.2; rough[i] = clamp(0.45 + hz * 0.5 + (pit[i] > 0.9 ? 0.2 : 0) + (sc[i] > 0.82 ? 0.15 : 0));
    }
    return finish(rgb, h, 0.4, rough);
  });
}

/** Black rubber / textured plastic. Neutral grey so it can be tinted via material.color. */
export function rubber(): TexSet {
  return cached('rubber', () => {
    const hf = noise(128, 128, 167), mid = fbm(8, 8, 3, 173);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const v = 200 + hf[i] * 40 + (mid[i] - 0.5) * 30;
      rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v;
      h[i] = hf[i] * 0.7 + mid[i] * 0.3; rough[i] = clamp(0.8 + (mid[i] - 0.5) * 0.4);
    }
    return finish(rgb, h, 1.4, rough);
  });
}

/** Painted sheet metal: chipped paint showing bare steel and rust, scratches, dirt. */
export function paintedMetal(base = '#c62828', wear = 1): TexSet {
  return cached(`paint${base}${wear}`, () => {
    const b = hex(base), chip = fbm(10, 10, 3, 179), rustN = fbm(6, 6, 3, 181), scr = noise(3, 200, 191), dirt = fbm(3, 3, 3, 193), spk = noise(128, 128, 197);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const bare = clamp((chip[i] - (0.7 - 0.1 * wear)) * 12) * wear, rs = clamp((rustN[i] - 0.45) * 4), d = clamp((dirt[i] - 0.5) * 2) * 0.15;
      const v = 0.96 - d + (spk[i] - 0.5) * 0.05 - (scr[i] > 0.86 ? 0.08 : 0);
      for (let c = 0; c < 3; c++) {
        const paint = b[c] * v, metal = [120, 120, 124][c] * (0.8 + spk[i] * 0.3), rust = [150, 72, 30][c] * (0.7 + spk[i] * 0.4);
        rgb[i * 3 + c] = mix(paint, mix(metal, rust, rs), bare);
      }
      h[i] = -bare * 0.5 + spk[i] * 0.15 + rs * bare * 0.2; rough[i] = clamp(0.4 + bare * 0.5 + d * 1.5);
    }
    return finish(rgb, h, 1.4, rough);
  });
}

/** Corrugated metal sheet (vertical ridges) with rust blooms. */
export function corrugated(base = '#8a8e92', rustAmt = 0.8): TexSet {
  return cached(`corr${base}${rustAmt}`, () => {
    const b = hex(base), rustN = fbm(4, 4, 4, 199), spk = noise(128, 128, 211), drip = noise(40, 3, 223);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, ridge = Math.sin((x / N) * Math.PI * 2 * 12), slope = Math.cos((x / N) * Math.PI * 2 * 12);
      const rs = clamp((rustN[i] + drip[i] * 0.25 - (0.62 - 0.2 * rustAmt)) * 4);
      const v = 0.92 + slope * 0.12 + (spk[i] - 0.5) * 0.12;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = mix(b[c] * v, [128, 62, 28][c] * (0.75 + spk[i] * 0.5) * (0.92 + slope * 0.08), rs);
      h[i] = ridge + rs * 0.12 * spk[i]; rough[i] = clamp(0.45 + rs * 0.5);
    }
    return finish(rgb, h, 0.35, rough);
  });
}

/** Rust: pitted orange-brown. */
export function rust(): TexSet {
  return cached('rust', () => {
    const big = fbm(4, 4, 4, 227), pit = noise(96, 96, 229), fl = noise(160, 160, 233);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const t = clamp(big[i] * 1.4 - 0.2 + (pit[i] - 0.5) * 0.4);
      rgb[i * 3] = mix(70, 190, t) * (0.9 + fl[i] * 0.2); rgb[i * 3 + 1] = mix(34, 92, t) * (0.9 + fl[i] * 0.2); rgb[i * 3 + 2] = mix(18, 40, t);
      h[i] = pit[i] * 0.8 + big[i] * 0.5; rough[i] = 0.9;
    }
    return finish(rgb, h, 2.0, rough);
  });
}

/** Plaster / stucco: speckle, trowel sweeps, hairline cracks. Neutral by default (tint with material.color). */
export function stucco(base = '#ffffff'): TexSet {
  return cached('stucco' + base, () => {
    const b = hex(base), sp = noise(128, 128, 239), trowel = fbm(8, 8, 3, 241), crack = fbm(6, 6, 2, 251), stain = fbm(3, 5, 3, 257);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const cr = Math.abs(crack[i] - 0.5) < 0.003 ? 1 : 0, st = clamp((stain[i] - 0.58) * 3) * 0.1;
      const v = 0.88 + sp[i] * 0.1 + (trowel[i] - 0.5) * 0.12 - cr * 0.22 - st;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
      h[i] = sp[i] * 0.45 + trowel[i] * 0.25 - cr * 0.5; rough[i] = 0.9 + sp[i] * 0.1;
    }
    return finish(rgb, h, 1.8, rough);
  });
}

/** Running-bond brick (8 courses per tile). */
export function brick(base = '#b5653e'): TexSet {
  return cached('brick' + base, () => {
    const b = hex(base), sp = noise(128, 128, 263), wash = fbm(3, 3, 3, 269), r = rng(271);
    const tone = Array.from({ length: 8 * 4 }, () => 0.82 + r() * 0.36);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, row = y >> 5, off = row & 1 ? 32 : 0, bx = (x + off) % N, col = bx >> 6;
      const lx = bx & 63, ly = y & 31, mortar = ly < 3 || lx < 3;
      const edge = Math.min(ly - 3, lx - 3, 31 - ly, 63 - lx);
      if (mortar) { const v = 0.75 + sp[i] * 0.25; rgb[i * 3] = 190 * v; rgb[i * 3 + 1] = 184 * v; rgb[i * 3 + 2] = 172 * v; h[i] = -1; rough[i] = 1; }
      else {
        const v = tone[row * 4 + col] * (0.82 + sp[i] * 0.3) * (0.92 + (wash[i] - 0.5) * 0.2) * (edge < 2 ? 0.9 : 1);
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
        h[i] = clamp(edge / 4) * 0.35 + sp[i] * 0.15; rough[i] = 0.85;
      }
    }
    return finish(rgb, h, 2.2, rough);
  });
}

/** Poured concrete / asphalt: mottled, cracked, oil-stained. Neutral light grey (tint via material.color). */
export function concrete(base = '#ffffff', cracks = 1): TexSet {
  return cached(`conc${base}${cracks}`, () => {
    const b = hex(base), big = fbm(3, 3, 4, 277), sp = noise(128, 128, 281), crack = fbm(5, 5, 3, 283), oil = fbm(4, 4, 3, 293), pebble = noise(64, 64, 307);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const cr = Math.abs(crack[i] - 0.5) < 0.007 * cracks ? 1 : 0, o = clamp((oil[i] - 0.62) * 4) * 0.35;
      const v = 0.8 + big[i] * 0.2 + (sp[i] - 0.5) * 0.12 + (pebble[i] > 0.85 ? 0.05 : 0) - cr * 0.35 - o;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
      h[i] = sp[i] * 0.5 + pebble[i] * 0.4 - cr * 1.2; rough[i] = clamp(0.88 - o * 0.5 + sp[i] * 0.1);
    }
    return finish(rgb, h, 1.4, rough);
  });
}

/** Glossy tiles with grout (n x n per tile), two alternating colours. */
export function tile(a = '#f5f5f5', bCol = '#161616', n = 8, scuff = 1): TexSet {
  return cached(`tile${a}${bCol}${n}${scuff}`, () => {
    const A = hex(a), B = hex(bCol), sp = noise(96, 96, 311), scf = fbm(5, 5, 3, 313), r = rng(317);
    const sz = N / n, tone = Array.from({ length: n * n }, () => 0.94 + r() * 0.1);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, tx = Math.floor(x / sz), ty = Math.floor(y / sz), lx = x - tx * sz, ly = y - ty * sz;
      const grout = lx < 1.6 || ly < 1.6, edge = Math.min(lx, ly, sz - lx, sz - ly);
      const col = (tx + ty) & 1 ? B : A, sc = clamp((scf[i] - 0.55) * 3) * scuff;
      if (grout) { const v = 0.55 + sp[i] * 0.2; for (let c = 0; c < 3; c++) rgb[i * 3 + c] = 150 * v; h[i] = -1; rough[i] = 1; }
      else { const v = tone[ty * n + tx] * (1 - sc * 0.12) + (sp[i] - 0.5) * 0.04; for (let c = 0; c < 3; c++) rgb[i * 3 + c] = col[c] * v + sc * 6; h[i] = clamp(edge / 4) * 0.3; rough[i] = clamp(0.24 + sc * 0.5 + (sp[i] - 0.5) * 0.1); }
    }
    return finish(rgb, h, 1.6, rough);
  });
}

/** Speckled laminate countertop. */
export function laminate(base = '#e0d2b4'): TexSet {
  return cached('lam' + base, () => {
    const b = hex(base), sp = noise(128, 128, 331), sp2 = noise(64, 64, 337), blot = fbm(4, 4, 3, 347);
    const rgb = new Float32Array(N * N * 3), h = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const fleck = sp[i] > 0.82 ? 0.86 : sp2[i] > 0.88 ? 1.1 : 1, burn = clamp((blot[i] - 0.68) * 4) * 0.2;
      const v = (0.96 + (blot[i] - 0.5) * 0.08) * fleck - burn;
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = b[c] * v;
      h[i] = sp[i] * 0.15; rough[i] = clamp(0.35 + burn * 2 + (blot[i] - 0.5) * 0.3);
    }
    return finish(rgb, h, 0.5, rough);
  });
}
