// Small deterministic noise toolbox shared by the terrain, texture generators and sky.

/** Integer hash -> [0,1). */
export function hash2(ix: number, iy: number, seed = 0): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0,1], non-tiling. */
export function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal value noise, roughly [0,1] centred on 0.5. */
export function fbm(x: number, y: number, oct = 4, seed = 0): number {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x, y, seed + o * 17);
    norm += amp; amp *= 0.5; x = x * 2.03 + 11.7; y = y * 2.03 - 5.3;
  }
  return s / norm;
}

/** Seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Tileable value-noise lattice: at(u, v) wraps every `cells` cells (u, v in cell units). */
export class TileNoise {
  private g: Float32Array;
  constructor(private cells: number, seed: number) {
    const r = prng(seed); this.g = new Float32Array(cells * cells);
    for (let i = 0; i < this.g.length; i++) this.g[i] = r();
  }
  at(u: number, v: number): number {
    const n = this.cells;
    const iu = Math.floor(u), iv = Math.floor(v);
    const fu = fade(u - iu), fv = fade(v - iv);
    const x0 = ((iu % n) + n) % n, y0 = ((iv % n) + n) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const a = this.g[y0 * n + x0], b = this.g[y0 * n + x1], c = this.g[y1 * n + x0], d = this.g[y1 * n + x1];
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  }
}

/** Tileable fractal noise over the unit square (u, v in [0,1)), base `cells` cells, `oct` octaves. */
export function tileFbm(tn: TileNoise[], cells: number, u: number, v: number): number {
  let s = 0, amp = 0.5, norm = 0, c = cells;
  for (let o = 0; o < tn.length; o++) { s += amp * tn[o].at(u * c, v * c); norm += amp; amp *= 0.5; c *= 2; }
  return s / norm;
}
