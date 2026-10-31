// Road shape sanity over many seeds: heading / radius / grade limits, keep-zones flat & straight, determinism.
import { CFG } from '../src/config';
import { STEP, keepZones, layoutFor, planRoad, shapeX, roadY, lanesAt, kindAt, advisoryAt, roadSigns } from '../src/world/RoadShape';

const M = 1 / CFG.MILES_PER_METER;
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; if (fails < 30) console.log('FAIL', msg); } };
const seeds = process.argv[2] ? [Number(process.argv[2])] : Array.from({ length: 20 }, (_, i) => i * 7919 + 1);
for (const seed of seeds) {
  const L = layoutFor(seed);
  const zones = keepZones(L, 1500, 3600);
  planRoad(seed, zones);
  const end = (CFG.ROUTE_MILES + L.deltaI15 + L.deltaCasino) * M + 1500;
  let maxH = 0, maxG = 0, minR = 1e9, maxY = 0, len = 0, tech = 0, lenS = 0;
  const kinds: Record<string, number> = {};
  let prevH = 0;
  for (let d = 0; d < end; d += STEP) {
    const z = -d;
    const dx = (shapeX(z - STEP) - shapeX(z)) / STEP;
    const h = Math.atan(dx);
    const g = (roadY(z - STEP) - roadY(z)) / STEP;
    maxH = Math.max(maxH, Math.abs(h)); maxG = Math.max(maxG, Math.abs(g)); maxY = Math.max(maxY, roadY(z));
    const k = Math.abs(h - prevH) / (STEP / Math.cos(h)); prevH = h;
    if (k > 1e-6 && d > STEP) minR = Math.min(minR, 1 / k);
    len += Math.hypot(STEP, dx * STEP, g * STEP); lenS += STEP;
    const kd = kindAt(z); kinds[kd] = (kinds[kd] ?? 0) + STEP;
    if (['twisties', 'climb', 'shelf', 'pass', 'descent'].includes(kd)) tech += STEP;
  }
  for (const zn of zones) {
    for (let d = Math.max(0, zn.a + 1); d < Math.min(zn.b - 1, end); d += 25) {
      const z = -d;
      if (Math.abs(shapeX(z)) > 0.05 || Math.abs(roadY(z)) > 0.05 || lanesAt(z) < 2.999) { check(false, `seed ${seed}: keep-zone at d=${d} x=${shapeX(z).toFixed(2)} y=${roadY(z).toFixed(2)} lanes=${lanesAt(z)}`); break; }
    }
  }
  check(maxH < 1.0, `seed ${seed}: heading ${(maxH * 57.3).toFixed(1)}°`);
  check(maxG < 0.095, `seed ${seed}: grade ${(maxG * 100).toFixed(1)}%`);
  check(minR > 60, `seed ${seed}: radius ${minR.toFixed(0)} m`);
  // determinism
  const a = [shapeX(-30000), roadY(-30000), shapeX(-77777)];
  planRoad(seed, zones);
  check(a[0] === shapeX(-30000) && a[1] === roadY(-30000) && a[2] === shapeX(-77777), `seed ${seed}: not deterministic`);
  console.log(`seed ${seed}: maxHead ${(maxH * 57.3).toFixed(0)}° maxGrade ${(maxG * 100).toFixed(1)}% minR ${minR.toFixed(0)}m top ${maxY.toFixed(0)}m stretch ×${(len / lenS).toFixed(3)} tech ${(100 * tech / lenS).toFixed(0)}% signs ${roadSigns().length} minAdv ${(Math.min(...Array.from({ length: 2000 }, (_, i) => advisoryAt(-i * end / 2000))) * CFG.MPH).toFixed(0)}mph`, Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, Math.round(v / 1000)])));
}
console.log(fails ? `${fails} FAILURES` : 'road shape OK');
process.exit(fails ? 1 : 0);
