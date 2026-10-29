// A herd of cattle ambles across the highway. Honk and they bolt; hit one and its owner comes for you.
import { ROAD_HALF } from '../../world/World';
import { at, rnd, rvHit, type KindDef } from '../common';

/** One cow: lateral offset o, offset along the road d, walk speed v, state st (0 walking, 1 bolting, 2 hit), hit fling. */
export interface Cow { o: number; d: number; v: number; st: number; wait: number; dir: number; fx?: number; fz?: number; ht?: number }

export const cattle: KindDef = {
  weight: 0.9,
  spawn(_h, e) {
    const side = Math.random() < 0.5 ? -1 : 1; // which shoulder they come from
    const n = 8 + Math.floor(Math.random() * 7);
    e.cows = Array.from({ length: n }, (_, i): Cow => ({
      o: side * (ROAD_HALF + 3 + Math.random() * 6), d: rnd(-14, 14), v: rnd(1.1, 1.7), st: 0,
      wait: i * rnd(0.8, 1.6), dir: -side,
    }));
    e.go = 0; e.warned = 0; e.hit = 0;
  },
  step(h, e, dt) {
    const s = h.s, rv = s.rv;
    e.t += dt;
    const dist = rv.z - e.z; // + = still ahead of us
    const sp = Math.abs(rv.speed);
    if (!e.warned && dist < Math.max(520, sp * 12)) { e.warned = 1; h.toast('🐄 CATTLE CROSSING ahead! Slow down — or lean on the horn.'); }
    // they start across so they're on the road when you get there
    if (!e.go && dist < Math.max(500, sp * 16)) e.go = 1;
    for (const c of e.cows as Cow[]) {
      if (c.st === 2) continue;
      if (!e.go) continue;
      if (c.wait > 0) { c.wait -= dt; continue; }
      if (c.st === 1) { if (Math.abs(c.o) < 40) c.o += c.dir * 5 * dt; } // bolting for the nearest shoulder
      else if (Math.abs(c.o) < ROAD_HALF + 9 || Math.sign(c.o) !== c.dir) c.o += c.dir * c.v * dt;
      // hit test
      const [x, z] = at(e.z + c.d, c.o);
      const hit = rvHit(s, x, z, 0.9);
      if (!hit) continue;
      if (sp < 4) { // a nudge: she moos and keeps walking
        c.o += (hit[0] < 0 ? -1 : 1) * 0.6;
        if (Math.random() < dt * 3) h.sfx('moo', [x, 1.2, z]);
        continue;
      }
      c.st = 2; c.ht = e.t;
      const fwdX = -Math.sin(rv.yaw), fwdZ = -Math.cos(rv.yaw);
      c.fx = fwdX * sp * 0.55 + (Math.random() - 0.5) * 6; c.fz = fwdZ * sp * 0.55;
      rv.speed *= sp > 8 ? 0.72 : 0.9;
      // the first few cows hurt; after that the bumper is already gone
      e.hits = (e.hits ?? 0) + 1;
      rv.integrity = Math.max(0, rv.integrity - (e.hits <= 3 ? 6 : 2));
      h.joltAll(e.hits <= 3 ? 0.9 : 0.4); if (e.hits <= 3) h.hurtStanding(0.9);
      h.sfx('crunch'); h.sfx('moo', [x, 1.2, z]);
      if (e.hits <= 3) h.toast(['🐄 MOOOO— *THUD*. You hit a cow. (−6)', '🐄 That cow is in orbit now. So is your bumper. (−6)', '🐄 Ground beef, highway style. (−6)'][Math.floor(Math.random() * 3)]);
      if (!e.hit) { e.hit = 1; h.traffic.spawnRancher(); }
    }
    const onRoad = (e.cows as Cow[]).some((c) => c.st !== 2 && Math.abs(c.o) < ROAD_HALF + 1);
    return (rv.z > e.z - 300 || onRoad) && e.t < 150 && rv.z > e.z - 900;
  },
  honk(h, e) {
    const rv = h.s.rv;
    let scared = 0;
    for (const c of e.cows as Cow[]) {
      if (c.st !== 0) continue;
      const [x, z] = at(e.z + c.d, c.o);
      if (Math.hypot(x - rv.x, z - rv.z) > 120) continue;
      c.st = 1; c.wait = 0; c.dir = Math.sign(c.o) || 1; // nearest shoulder
      scared++;
    }
    if (scared) { h.sfx('moo'); h.toast('🐄 HOOOONK — the herd stampedes off the road!'); }
  },
  obstacles(e, out) {
    for (const c of e.cows as Cow[]) if (c.st !== 2 && Math.abs(c.o) < ROAD_HALF + 0.5) out.push({ z: e.z + c.d, off: c.o, hw: 0.7, hl: 1.3 });
  },
};
