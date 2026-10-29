// Road work: cones close two of our three lanes for 450 m, a flagger flips STOP / SLOW at the start.
// Blow past STOP or speed through the zone and the crew radios in your plate. Hit a cone and it
// may jam under the bumper (scraaape) until someone yanks it out.
import { CFG } from '../../config';
import { LANES, LANE_W, ROAD_HALF } from '../../world/World';
import { at, rnd, rvHit, rvOff, type EncHost, type KindDef } from '../common';

export const ZONE_LEN = 450;
export const ZONE_MPH = 45;
const STOP_T = 25, SLOW_T = 15;
const OPEN_EDGE = LANE_W; // cones sit on the line between lane 0 and lane 1

/** One cone: offset along the road d (from the zone start, ≤ 0 = inside), lateral o, st 0 standing / 1 sent flying, fling velocity + hit time. */
export interface Cone { d: number; o: number; st: number; fx?: number; fz?: number; ht?: number }

export const roadwork: KindDef = {
  weight: 0.8,
  ok: (h) => !h.s.enc.cone,
  spawn(_h, e) {
    const cones: Cone[] = [];
    // taper: from the road edge in to the lane line over the 70 m before the zone
    for (let i = 0; i <= 7; i++) cones.push({ d: 70 - i * 10, o: ROAD_HALF - 0.6 - ((ROAD_HALF - 0.6 - OPEN_EDGE) * i) / 7, st: 0 });
    for (let d = -12; d > -ZONE_LEN; d -= 14) cones.push({ d, o: OPEN_EDGE, st: 0 });
    for (let i = 1; i <= 4; i++) cones.push({ d: -ZONE_LEN - i * 12, o: OPEN_EDGE + ((ROAD_HALF - 0.6 - OPEN_EDGE) * i) / 4, st: 0 });
    e.cones = cones;
    e.sg = 1; e.sgT = SLOW_T; // flagger sign: 0 STOP, 1 SLOW
    e.workers = [-110, -230, -350].map((d) => ({ d, o: rnd(6.5, 9.5), dove: 0 }));
    e.warned = 0; e.flagged = 0; e.sped = 0; e.speedT = 0; e.prevZ = null;
  },
  step(h, e, dt) {
    const s = h.s, rv = s.rv;
    e.t += dt;
    const dist = rv.z - e.z;
    if (!e.warned && dist < Math.max(600, Math.abs(rv.speed) * 12)) {
      e.warned = 1;
      if (Math.random() < 0.65) { e.sg = 0; e.sgT = STOP_T; } // most of the time you get the STOP side
      h.toast(`🚧 ROAD WORK AHEAD — one lane, ${ZONE_MPH} MPH. Watch the flagger.`);
    }
    if (e.warned && (e.sgT -= dt) <= 0) { e.sg = 1 - e.sg; e.sgT = e.sg === 0 ? STOP_T : SLOW_T; }

    // crossing the flagger's line
    const pz = e.prevZ ?? rv.z; e.prevZ = rv.z;
    if (pz > e.z && rv.z <= e.z && pz - rv.z < 60 && e.sg === 0 && !e.flagged) {
      e.flagged = 1; plate(h, e, '🚧 FLAGGER: "HEY! STOP MEANS STOP!" He writes down your plate. (+1 heat)');
    }
    // speeding inside the zone
    const inZone = rv.z < e.z && rv.z > e.z - ZONE_LEN;
    e.speedT = inZone && Math.abs(rv.speed) * CFG.MPH > ZONE_MPH + 3 ? e.speedT + dt : 0;
    if (e.speedT > 1.2 && !e.sped) { e.sped = 1; plate(h, e, `🚧 ${Math.round(Math.abs(rv.speed) * CFG.MPH)} in a ${ZONE_MPH} work zone — the crew radios it in. (+1 heat)`); }

    // cones
    for (const c of e.cones as Cone[]) {
      if (c.st) continue;
      const [x, z] = at(e.z + c.d, c.o);
      if (!rvHit(s, x, z, 0.3)) continue;
      const sp = Math.abs(rv.speed);
      c.st = 1; c.ht = e.t;
      c.fx = -Math.sin(rv.yaw) * sp * 0.8 + rnd(-3, 3); c.fz = -Math.cos(rv.yaw) * sp * 0.8;
      h.sfx('thump', [x, 0.5, z]);
      if (sp > 6 && !s.enc.cone && Math.random() < 0.3) {
        s.enc.cone = 1;
        h.toast('🚧 A cone is jammed under the front bumper. SCRRRAAAPE. Someone pull it out (RV stopped).');
      }
    }
    // workers dive out of the way of an RV in their lane
    for (const w of e.workers) {
      if (w.dove) continue;
      const [x, z] = at(e.z + w.d, w.o);
      if (Math.hypot(x - rv.x, z - rv.z) < 9 && Math.abs(rvOff(s) - w.o) < 3.5) {
        w.dove = 1; h.sfx('yell', [x, 1.5, z]);
        plate(h, e, '🚧 A road worker DIVES into the ditch to avoid you. That\'s going in the report. (+1 heat)');
      }
    }
    return rv.z > e.z - ZONE_LEN - 300 && e.t < 400;
  },
  honk(h, e) {
    const d = Math.hypot(h.s.rv.x - at(e.z, OPEN_EDGE + 1.5)[0], h.s.rv.z - e.z);
    if (d < 60) h.toast(['🚧 The flagger honks back with his mouth. "BEEP BEEP YOURSELF, BUDDY."', '🚧 Honking at the flagger makes the sign stay STOP longer. Probably.'][Math.floor(Math.random() * 2)]);
  },
  obstacles(e, out) {
    // closed lanes 1–2: a wall of "obstacles" so traffic merges early and never spawns in there
    for (let d = 70; d > -ZONE_LEN - 40; d -= 40) out.push({ z: e.z + d, off: (OPEN_EDGE + ROAD_HALF) / 2, hw: (ROAD_HALF - OPEN_EDGE) / 2, hl: 21 });
    if (e.sg === 0) out.push({ z: e.z + 4, off: LANES[0], hw: LANE_W / 2, hl: 1 }); // the STOP sign holds the open lane
  },
};

/** One plate report per reason; most of them only once per zone. */
function plate(h: EncHost, _e: unknown, text: string) {
  h.s.heat += 1; h.sfx('yell');
  h.toast(text);
}

/** A cone under the bumper: drag + scraping until a mechanic yanks it out (or it shakes loose). */
export function stepCone(h: EncHost, dt: number, st: { t: number; scrape: number }) {
  const s = h.s, rv = s.rv;
  if (!s.enc.cone) { st.t = 0; return; }
  st.t += dt;
  if (Math.abs(rv.speed) > 3) {
    rv.speed -= Math.sign(rv.speed) * Math.min(Math.abs(rv.speed), 1.4 * dt);
    if ((st.scrape -= dt) <= 0) { st.scrape = 1.1; h.sfx('scrape'); }
  }
  if (st.t > 120 && Math.abs(rv.speed) > 20) { s.enc.cone = 0; h.toast('🚧 The cone finally shakes loose and tumbles away behind you.'); }
}

export function yankCone(h: EncHost, from: number) {
  const s = h.s;
  if (!s.enc.cone) return;
  if (Math.abs(s.rv.speed) > 0.6) { h.toast('Stop the RV first (you want to keep your arm)'); return; }
  s.enc.cone = 0; h.sfx('scrub');
  h.toast(`🚧 ${h.name(from)} yanks the mangled cone out from under the bumper.`);
}
