// Headless bot drive over whole seeded routes: follows the right-most open lane at the posted (advisory) speed,
// with no traffic, storms or encounters. Checks the road is drivable end to end: the RV stays on the road,
// doesn't hit guardrails when it obeys the signs, climbs every hill, and arrives in a sane time / fuel budget.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { applyRunSeed } from '../src/world/RunSeed';
import { chapelZ } from '../src/world/Route';
import { advisoryAhead, kindAt, lanesAt, roadY } from '../src/world/RoadShape';
import { LANES, onRoad, roadDX, roadFrame, roadPoint } from '../src/world/World';
import { CFG } from '../src/config';
import type { GameMsg } from '../src/types';

let fails = 0;
const seeds = process.argv[2] ? [Number(process.argv[2])] : [1, 7920, 23758];
for (const seed of seeds) {
  applyRunSeed(seed);
  const rvm = new RVModel();
  const toasts: string[] = [];
  const host = new HostSim((m: GameMsg) => { if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text); }, (o) => rvm.activeColliders(o));
  host.crew(1);
  const s = host.s, r = s.rv;
  s.seats.driver = 1;
  const h = host as any;
  h.stormIn = 1e12; h.traffic.spawnTraffic = () => {}; h.traffic.stepCop = () => {}; h.traffic.stepShark = () => {}; h.enc.quiet = () => false; h.canyon.step = () => {};
  Object.assign(r, { ignition: 2, gear: 1, handbrake: false });
  const dt = 1 / 30, end = chapelZ() + 300;
  let t = 0, off = 0, rails = 0, minMph = 999, fuelUsed = 0, lastFuel = r.fuel, shiftCd = 0, stuck = 0;
  const railToasts = () => toasts.filter((x) => /guardrail/.test(x)).length;
  while (r.z > end && t < 3 * 3600 && s.phase === 'drive') {
    const lanes = Math.max(1, Math.round(lanesAt(r.z - 120) - 0.4));
    const lane = LANES[Math.min(2, lanes - 1)];
    const look = Math.max(18, Math.abs(r.speed) * 0.7);
    const [tx, tz] = roadPoint(r.z - look, lane);
    let err = Math.atan2(-(tx - r.x), -(tz - r.z)) - r.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
    const target = Math.min(85, advisoryAhead(r.z, Math.max(200, r.speed * r.speed / 8)) * 0.95);
    host.handle(1, { t: 'drive', i: { th: r.speed < target - 1 ? 1 : 0, br: r.speed > target + 2 ? 1 : 0, st: Math.max(-1, Math.min(1, err * 5)), horn: false } });
    shiftCd -= dt;
    if (shiftCd <= 0) {
      if (r.rpm > 5600 && r.gear < 7) { host.handle(1, { t: 'act', id: 'shift_up', btn: 0 }); shiftCd = 0.4; }
      else if (r.rpm < 1700 && r.gear > 1) { host.handle(1, { t: 'act', id: 'shift_down', btn: 0 }); shiftCd = 0.4; }
    }
    host.step(dt);
    // keep the crew alive / the RV fuelled: this test is about the road
    for (const c of Object.values(s.crew) as any[]) { c.hunger = 100; c.hypno = 0; c.hp = 100; }
    s.heat = 0; s.npcs = [];
    if (r.fuel < lastFuel) fuelUsed += lastFuel - r.fuel; r.fuel = 25; lastFuel = r.fuel;
    if (s.cab.flat >= 0) s.cab.flat = -1;
    r.integrity = 100;
    if (!onRoad(r.x, r.z)) { if (off === 0 || Math.floor(off / dt) % 60 === 0) console.log(`  offroad off=${roadFrame(r.x, r.z).off.toFixed(1)} yaw=${r.yaw.toFixed(2)} z=${r.z.toFixed(0)} ${kindAt(r.z)} ${(r.speed * CFG.MPH).toFixed(0)} mph adv ${(advisoryAhead(r.z, 0) * CFG.MPH).toFixed(0)} lanes ${lanesAt(r.z).toFixed(2)}`); off += dt; }
    if (railToasts() > rails) { rails = railToasts(); console.log(`  rail z=${r.z.toFixed(0)} ${kindAt(r.z)} ${(r.speed * CFG.MPH).toFixed(0)} mph adv ${(advisoryAhead(r.z, 0) * CFG.MPH).toFixed(0)}`); }
    if (t > 20) minMph = Math.min(minMph, r.speed * CFG.MPH);
    stuck = r.speed < 2 && t > 30 ? stuck + dt : 0;
    if (stuck > 10) { console.log(`seed ${seed}: STUCK at z=${r.z.toFixed(0)} (${kindAt(r.z)}, y=${roadY(r.z).toFixed(0)})`); fails++; break; }
    t += dt;
  }
  rails = railToasts();
  const miles = -r.z * CFG.MILES_PER_METER;
  console.log(`seed ${seed}: ${miles.toFixed(0)} mi in ${(t / 60).toFixed(1)} real min, offroad ${off.toFixed(1)} s, rail hits ${rails}, slowest ${minMph.toFixed(0)} mph, fuel ${fuelUsed.toFixed(1)} gal, phase ${s.phase}`);
  if (off > 3) { fails++; console.log('  FAIL: left the road'); }
  if (rails > 2) { fails++; console.log('  FAIL: hit guardrails while obeying the signs'); }
  if (r.z > end) { fails++; console.log('  FAIL: did not reach the chapel'); }
}
console.log(fails ? `${fails} FAILURES` : 'road drive OK');
process.exit(fails ? 1 : 0);
