// Seeded road shape: bends, climbs, cliff shelves and narrow passes, sampled every 5 m along the route.
//
// The road is still a function of z (it always heads toward −Z, at most ~55° off-axis), because the odometer,
// chunks, forks, stops, the chapel and traffic all use z as progress. Everything here is in "d" = −z (metres
// travelled). Rules the rest of the game relies on:
//  - keep-zones (start, every stop, every fork and both branches, every possible chapel spot) are straight,
//    flat (y = 0), centred (x = 0) and three lanes each way, so stop lots / forks need nothing special;
//  - every climb is paired with a descent, every bend sequence returns to heading 0, so the next keep-zone
//    lines up again;
//  - same seed → same tables on every machine (host and clients build them locally from `s.seed`).
import { CFG, WHEELBASE } from '../config';

const M = 1 / CFG.MILES_PER_METER; // metres per compressed mile
export const STEP = 5;
const MAX_D = 640 * M;
const N = Math.ceil(MAX_D / STEP) + 2;
const LANE_W = 3.6;
export const FULL_HALF = LANE_W * 3 + 0.25;

export type SegKind = 'flat' | 'straight' | 'sweepers' | 'rolling' | 'twisties' | 'climb' | 'shelf' | 'pass' | 'descent';
const KINDS: SegKind[] = ['flat', 'straight', 'sweepers', 'rolling', 'twisties', 'climb', 'shelf', 'pass', 'descent'];

export interface RoadSign { d: number; side: 1 | -1; lines: string[]; kind: 'curve' | 'grade' | 'narrow' | 'rock' | 'trucks' | 'chevron'; dir?: 1 | -1 }

// ---------- sample tables ----------
const X = new Float64Array(N); // centreline x (before fork offsets)
const XS = new Float64Array(N); // heavily smoothed x (terrain lattice frame far from the road)
const Y = new Float32Array(N); // road height
const HD = new Float64Array(N); // d(heading)/dd while planning
const GR = new Float32Array(N); // grade dy/dd while planning
const LANES = new Float32Array(N); // lanes each way (3, 2 or 1; fractional inside tapers)
const KIND = new Uint8Array(N);
const ADV = new Float32Array(N); // advisory speed (m/s)
const WALL = new Float32Array(N); // + = rock wall on the right, − = on the left (0–1 amount)
const DROPL = new Float32Array(N), DROPR = new Float32Array(N); // drop-off amount each side
const RAIL = new Uint8Array(N); // bit 1 = left guardrail, bit 2 = right
const MTN = new Float32Array(N); // 0–1 "in the mountains" (taller hills next to the road)
let signs: RoadSign[] = [];
let seedNow = -1;
let version = 0;
export const shapeVersion = () => version;
export const shapeSeed = () => seedNow;

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const sample = (a: ArrayLike<number>, z: number) => {
  const f = -z / STEP;
  if (f <= 0) return a[0];
  if (f >= N - 1) return a[N - 1];
  const i = Math.floor(f), t = f - i;
  return a[i] + (a[i + 1] - a[i]) * t;
};
const at = (z: number) => Math.max(0, Math.min(N - 1, Math.round(-z / STEP)));

export const shapeX = (z: number) => sample(X, z);
export const shapeXS = (z: number) => sample(XS, z);
export const roadY = (z: number) => sample(Y, z);
/** dy per metre of travel (+ = uphill toward −Z). */
export const roadGrade = (z: number) => (roadY(z - 2) - roadY(z + 2)) / 4;
export const lanesAt = (z: number) => sample(LANES, z);
export const roadHalf = (z: number) => lanesAt(z) * LANE_W + 0.25;
export const kindAt = (z: number): SegKind => KINDS[KIND[at(z)]];
export const advisoryAt = (z: number) => ADV[at(z)];
export const wallAt = (z: number) => sample(WALL, z);
export const dropAt = (z: number, side: number) => sample(side < 0 ? DROPL : DROPR, z);
export const railAt = (z: number) => RAIL[at(z)];
export const mtnAt = (z: number) => sample(MTN, z);
export const roadSigns = () => signs;
/** Lowest advisory speed in the next `ahead` m of road (m/s). */
export function advisoryAhead(z: number, ahead: number) {
  let v = Infinity;
  for (let d = 0; d <= ahead; d += 20) v = Math.min(v, ADV[at(z - d)]);
  return v;
}
/** Fewest lanes in the next `ahead` m. */
export function lanesAhead(z: number, ahead: number) {
  let l = 3;
  for (let d = 0; d <= ahead; d += 20) l = Math.min(l, LANES[at(z - d)]);
  return l;
}

/** Fastest speed the RV can hold through radius r (same caps as Drivetrain's steering), with a margin. */
function vForRadius(r: number) {
  for (let v = 95; v > 8; v -= 0.5) {
    const maxSteer = Math.min(0.6 / (1 + Math.pow(v / 6, 1.3)), (17 * WHEELBASE) / (v * v));
    if (WHEELBASE / Math.tan(maxSteer) <= r * 0.8 && v * v / r <= 9.5) return v;
  }
  return 8;
}

// ---------- planning ----------
interface Zone { a: number; b: number }

/**
 * Build the tables for a seed. `keep` = d-ranges that must stay straight / flat / 3 lanes.
 * Returns nothing; read the result through the accessors above.
 */
export function planRoad(seed: number, keep: Zone[]) {
  seedNow = seed; version++;
  HD.fill(0); GR.fill(0); LANES.fill(3); KIND.fill(0); WALL.fill(0); DROPL.fill(0); DROPR.fill(0); RAIL.fill(0); MTN.fill(0);
  signs = [];
  const r = rng(seed * 977 + 13);
  const rr = (a: number, b: number) => a + r() * (b - a);
  const idx = (d: number) => Math.max(0, Math.min(N - 1, Math.round(d / STEP)));

  // merge + sort keep zones, then fill the gaps
  const zs = keep.map((k) => ({ a: Math.max(0, k.a), b: Math.min(MAX_D, k.b) })).filter((k) => k.b > k.a).sort((p, q) => p.a - q.a);
  const merged: Zone[] = [];
  for (const k of zs) { const l = merged[merged.length - 1]; if (l && k.a <= l.b) l.b = Math.max(l.b, k.b); else merged.push({ ...k }); }
  const gaps: Zone[] = [];
  let cur = 0;
  for (const k of merged) { if (k.a > cur) gaps.push({ a: cur, b: k.a }); cur = Math.max(cur, k.b); }
  if (cur < MAX_D) gaps.push({ a: cur, b: MAX_D });

  if (seed === 0) { finish(gaps); return; } // seed 0 = the plain straight highway (lobby preview / tests)

  // helpers that write into the planning arrays
  let heading = 0; // planned heading at the cursor (rad, + = bears right)
  let xAcc = 0; // rough lateral drift so far in this gap (steers the sign choice)
  const setKind = (d0: number, d1: number, k: SegKind) => { for (let i = idx(d0); i < idx(d1); i++) KIND[i] = KINDS.indexOf(k); };
  const ramp = (arr: Float32Array, d0: number, d1: number, v: number, fade = 250) => {
    for (let i = idx(d0 - fade); i < idx(d1 + fade); i++) {
      const d = i * STEP;
      const w = d < d0 ? (d - (d0 - fade)) / fade : d > d1 ? (d1 + fade - d) / fade : 1;
      const s = w * w * (3 - 2 * w);
      if (Math.abs(v * s) > Math.abs(arr[i])) arr[i] = v * s;
    }
  };
  /** Lanes each way drop to `n` over [t0, t1], with 350 m tapers outside it. */
  const taper = (t0: number, t1: number, n: number) => {
    for (let i = idx(t0 - 350); i < idx(t1 + 350); i++) {
      const dd = i * STEP; const w = dd < t0 ? (dd - (t0 - 350)) / 350 : dd > t1 ? (t1 + 350 - dd) / 350 : 1;
      LANES[i] = Math.min(LANES[i], 3 - (3 - n) * (w * w * (3 - 2 * w)));
    }
  };
  /** One bend from the current heading to `target` with minimum radius ~R. Returns its length. */
  const bend = (d0: number, target: number, R: number, rail: boolean) => {
    const dh = target - heading;
    if (Math.abs(dh) < 1e-4) return 0;
    const L = Math.max(60, 2 * Math.abs(dh) * R);
    for (let i = idx(d0); i < idx(d0 + L); i++) {
      const t = (i * STEP - d0) / L;
      HD[i] += (dh / L) * (1 - Math.cos(2 * Math.PI * t));
    }
    const sideOut: 1 | -1 = dh > 0 ? -1 : 1; // bearing right → the outside of the bend is on the left
    if (rail) for (let i = idx(d0 - 40); i < idx(d0 + L + 40); i++) RAIL[i] |= sideOut < 0 ? 1 : 2;
    if (R < 700) {
      const mph = Math.max(25, Math.floor((vForRadius(R) * CFG.MPH) / 5) * 5);
      if (mph < 150) signs.push({ d: d0 - 380, side: 1, kind: 'curve', lines: [dh > 0 ? '↱' : '↰', `${mph} MPH`], dir: dh > 0 ? 1 : -1 });
      if (R < 300) for (let k = 0.25; k < 1; k += 0.25) signs.push({ d: d0 + L * k, side: sideOut, kind: 'chevron', lines: [], dir: dh > 0 ? 1 : -1 });
    }
    heading = target;
    xAcc += Math.tan(target) * L * 0.5;
    return L;
  };
  /** Bends through [d0, …) alternating sides, ending at heading 0. Returns the end d. */
  const bends = (d0: number, dEnd: number, n: number, maxDeg: [number, number], R: [number, number], gap: [number, number], rail: (R: number) => boolean) => {
    let d = d0, lastR = R[0];
    for (let k = 0; k < n; k++) {
      const left = dEnd - d;
      const deg = rr(maxDeg[0], maxDeg[1]);
      const sign = Math.abs(xAcc) > 150 ? -Math.sign(xAcc) : heading !== 0 ? -Math.sign(heading) : r() < 0.5 ? -1 : 1;
      const target = k === n - 1 ? 0 : sign * (deg * Math.PI) / 180;
      const Rk = rr(R[0], R[1]);
      const need = Math.max(60, 2 * Math.abs(target - heading) * Rk) + Math.max(60, 2 * Math.abs(target) * Rk) + gap[1] + 80;
      if (need > left) break;
      lastR = Rk;
      d += bend(d, target, Rk, rail(Rk));
      d += rr(gap[0], gap[1]);
      xAcc += Math.tan(heading) * (gap[0] + gap[1]) * 0.5;
    }
    if (heading !== 0) d += bend(d, 0, lastR, rail(lastR));
    return d;
  };
  /** A smooth grade bump: climbs `h` metres over [d0, d0+L] (h < 0 = descent). */
  const grade = (d0: number, L: number, h: number) => {
    // profile: smoothstep up, hold, smoothstep down (integral = L * 0.8)
    for (let i = idx(d0); i < idx(d0 + L); i++) {
      const t = (i * STEP - d0) / L;
      const e = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
      GR[i] += (h / (L * 0.9)) * (e * e * (3 - 2 * e));
    }
  };

  const LEN: Record<string, [number, number]> = {
    straight: [1500, 4500], sweepers: [2600, 5000], rolling: [2000, 4000], twisties: [2600, 5200], mountain: [7000, 11000],
  };
  let lastTech = true;
  for (const g of gaps) {
    if (g.b === MAX_D && g.a > 600 * M) continue; // past every possible chapel
    let d = g.a + 200;
    heading = 0; xAcc = 0;
    while (g.b - d > 1200) {
      const left = g.b - d - 300;
      const tech: boolean = !lastTech && r() < 0.85;
      let kind: string = tech ? (r() < 0.55 ? 'mountain' : 'twisties') : (['straight', 'sweepers', 'rolling'] as const)[Math.floor(r() * 3)];
      if (LEN[kind][0] > left) kind = LEN.twisties[0] <= left && tech ? 'twisties' : 'straight';
      if (LEN[kind][0] > left) { setKind(d, g.b, 'straight'); break; }
      const L = Math.min(left, rr(LEN[kind][0], LEN[kind][1]));
      const d1 = d + L;
      if (kind === 'straight') { setKind(d, d1, 'straight'); d = d1; }
      else if (kind === 'sweepers') { setKind(d, d1, 'sweepers'); d = bends(d, d1, 4, [10, 24], [650, 1300], [150, 500], () => false); }
      else if (kind === 'rolling') {
        setKind(d, d1, 'rolling');
        const n = 1 + Math.floor(r() * 2), Lh = L / n;
        for (let k = 0; k < n; k++) { const h = rr(10, 26); grade(d + k * Lh, Lh * 0.5, h); grade(d + k * Lh + Lh * 0.5, Lh * 0.5, -h); }
        d = bends(d, d1, 2, [6, 14], [900, 1600], [300, 800], () => false);
        d = Math.max(d, d1);
      } else if (kind === 'twisties') {
        setKind(d, d1, 'twisties');
        ramp(MTN, d, d1, 0.55);
        const h = r() < 0.5 ? rr(8, 25) : 0;
        if (h) { grade(d, L * 0.5, h); grade(d + L * 0.5, L * 0.5, -h); }
        d = bends(d, d1, 9, [30, 54], [85, 210], [30, 150], (R) => R < 260);
        d = Math.max(d, d1);
      } else {
        // over the mountains: climb → shelf or narrow pass at the top → descent
        const H = rr(140, 300);
        const Lc0 = Math.min(L * 0.36, Math.max(2400, H / rr(0.05, 0.075)));
        const H2 = Math.min(H, Lc0 * 0.9 * 0.075);
        const Lc = Lc0, Hc = H2;
        const Lt = L - 2 * Lc;
        const c0 = d, t0 = d + Lc, t1 = t0 + Lt, e1 = t1 + Lc;
        setKind(c0, t0, 'climb'); setKind(t1, e1, 'descent');
        grade(c0, Lc, Hc); grade(t1, Lc, -Hc);
        ramp(MTN, c0, e1, 1, 600);
        const top: SegKind = r() < 0.5 ? 'shelf' : 'pass';
        setKind(t0, t1, top);
        if (top === 'shelf') {
          const side = r() < 0.5 ? 1 : -1;
          ramp(WALL, t0, t1, side);
          ramp(side > 0 ? DROPL : DROPR, t0, t1, 1);
          taper(t0, t1, 2);
          for (let i = idx(t0); i < idx(t1); i++) RAIL[i] |= side > 0 ? 1 : 2;
          signs.push({ d: t0 - 600, side: 1, kind: 'rock', lines: ['FALLING', 'ROCKS'] });
          signs.push({ d: t0 - 450, side: 1, kind: 'narrow', lines: ['ROAD', 'NARROWS'] });
        } else {
          ramp(DROPL, t0, t1, 0.8); ramp(DROPR, t0, t1, 0.8);
          taper(t0, t1, 1);
          for (let i = idx(t0); i < idx(t1); i++) RAIL[i] |= 3;
          signs.push({ d: t0 - 600, side: 1, kind: 'narrow', lines: ['ONE LANE', 'EACH WAY'] });
          signs.push({ d: t0 - 420, side: -1, kind: 'narrow', lines: ['NO', 'PASSING'] });
        }
        signs.push({ d: c0 - 400, side: 1, kind: 'grade', lines: [`${Math.round((Hc / (Lc * 0.9)) * 100)}%`, 'GRADE'] });
        signs.push({ d: t1 - 300, side: 1, kind: 'trucks', lines: ['TRUCKS', 'USE LOW GEAR'] });
        d = bends(c0, t0, 4, [12, 26], [300, 600], [200, 500], () => false);
        d = Math.max(d, t0);
        d = bends(d, t1, top === 'pass' ? 6 : 5, [20, 40], top === 'pass' ? [110, 200] : [140, 280], [40, 140], (R) => R < 320);
        d = Math.max(d, t1);
        d = bends(d, e1, 4, [12, 28], [260, 560], [200, 500], (R) => R < 320);
        d = Math.max(d, e1);
      }
      lastTech = kind === 'twisties' || kind === 'mountain';
      d += 250;
    }
  }
  finish(gaps);
}

/** Integrate the planned heading / grade into x / y, pin every keep-zone to x = y = 0, derive the rest. */
function finish(gaps: Zone[]) {
  // bends are sampled, so each gap's heading change can miss 0 by a hair: spread the residue over the gap
  for (const g of gaps) {
    const ia = Math.round(g.a / STEP), ib = Math.min(N - 1, Math.round(g.b / STEP));
    let res = 0, cnt = 0;
    for (let i = ia; i < ib; i++) { res += HD[i]; if (HD[i] !== 0) cnt++; }
    if (cnt) for (let i = ia; i < ib; i++) if (HD[i] !== 0) HD[i] -= res / cnt;
    let gr = 0, gc = 0;
    for (let i = ia; i < ib; i++) { gr += GR[i]; if (GR[i] !== 0) gc++; }
    if (gc) for (let i = ia; i < ib; i++) if (GR[i] !== 0) GR[i] -= gr / gc;
  }
  let h = 0;
  X[0] = 0; Y[0] = 0;
  for (let i = 1; i < N; i++) {
    h += HD[i - 1] * STEP;
    X[i] = X[i - 1] + Math.tan(Math.max(-1.0, Math.min(1.0, h))) * STEP;
    Y[i] = Y[i - 1] + GR[i - 1] * STEP;
  }
  // remove the drift inside each gap so x and y are back to 0 at the next keep-zone (spread over the whole gap)
  for (const g of gaps) {
    const ia = Math.round(g.a / STEP), ib = Math.min(N - 1, Math.round(g.b / STEP));
    const x0 = X[ia], x1 = X[ib], y0 = Y[ia], y1 = Y[ib];
    for (let i = ia; i <= ib; i++) {
      const t = (i - ia) / Math.max(1, ib - ia); const s = t * t * (3 - 2 * t);
      X[i] -= x0 + (x1 - x0) * s; Y[i] -= y0 + (y1 - y0) * s;
    }
    for (let i = ib + 1; i < N; i++) { X[i] -= x1; Y[i] -= y1; }
  }
  // the integration above leaves zones flat already (no heading / grade there); snap tiny residue
  for (let i = 0; i < N; i++) { if (Math.abs(Y[i]) < 1e-4) Y[i] = 0; if (Math.abs(X[i]) < 1e-4) X[i] = 0; }
  // smoothed frame: two box blurs of ±900 m
  const blur = (src: Float64Array, dst: Float64Array, w: number) => {
    let acc = 0; const k = Math.round(w / STEP);
    for (let i = -k; i <= k; i++) acc += src[Math.max(0, Math.min(N - 1, i))];
    for (let i = 0; i < N; i++) {
      dst[i] = acc / (2 * k + 1);
      acc += src[Math.min(N - 1, i + k + 1)] - src[Math.max(0, i - k)];
    }
  };
  const tmp = new Float64Array(N);
  blur(X, tmp, 900); blur(tmp, XS, 900);
  // advisory speed from the local radius (look 60 m around for the tightest point)
  const rad = new Float32Array(N).fill(1e9);
  for (let i = 1; i < N - 1; i++) {
    const a = Math.atan((X[i] - X[i - 1]) / STEP), b = Math.atan((X[i + 1] - X[i]) / STEP); // headings
    const k = (Math.abs(b - a) / STEP) * Math.cos((a + b) / 2); // dh/ds
    rad[i] = k > 1e-6 ? 1 / k : 1e9;
  }
  for (let i = 0; i < N; i++) {
    let rm = 1e9;
    for (let j = Math.max(0, i - 12); j <= Math.min(N - 1, i + 12); j++) rm = Math.min(rm, rad[j]);
    ADV[i] = rm > 2500 ? 99 : vForRadius(rm);
  }
}

// ---------- seeded run layout (stop miles, fork miles / sides / deltas) ----------
export interface RunLayout {
  rusty: number; forkA: number; forkB: number; lastChance: number;
  sideA: 1 | -1; sideB: 1 | -1; deltaI15: number; deltaCanyon: number; deltaCasino: number;
}
export function layoutFor(seed: number): RunLayout {
  if (seed === 0) return { rusty: 100, forkA: 200, forkB: 340, lastChance: 460, sideA: 1, sideB: 1, deltaI15: 40, deltaCanyon: -30, deltaCasino: 10 };
  const r = rng(seed * 31 + 5);
  const ri = (a: number, b: number) => Math.round(a + r() * (b - a));
  return {
    rusty: ri(85, 115), forkA: ri(180, 220), forkB: ri(320, 355), lastChance: ri(436, 452),
    sideA: r() < 0.5 ? 1 : -1, sideB: r() < 0.5 ? 1 : -1,
    deltaI15: ri(30, 50), deltaCanyon: -ri(20, 30), deltaCasino: ri(5, 15),
  };
}
/** Miles where stops / forks need flat straight road, given a layout. */
export function keepZones(L: RunLayout, forkLen: number, altLen: number): Zone[] {
  const z: Zone[] = [{ a: -1, b: 2200 }];
  const stop = (mile: number) => z.push({ a: mile * M - 1500, b: mile * M + 1500 });
  stop(L.rusty); stop(L.forkA + 40); stop(L.forkB + 40); stop(L.lastChance);
  for (const f of [L.forkA, L.forkB]) z.push({ a: f * M - 900, b: f * M + Math.max(forkLen, altLen) + 400 });
  const base = CFG.ROUTE_MILES;
  for (const a of [L.deltaI15, L.deltaCanyon]) for (const b of [0, L.deltaCasino]) stop(base + a + b);
  // past the farthest chapel: plain road
  z.push({ a: (base + L.deltaI15 + L.deltaCasino) * M + 1500, b: MAX_D + 10 });
  return z;
}

// start out as the plain straight highway until a run seed arrives
planRoad(0, []);
