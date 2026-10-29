// Tumbleweeds: in a sandstorm they come bouncing across the highway. The ones that hit the cab stick
// to the windshield and the wipers have to fight them off, one at a time.
import { RV } from '../../config';
import { ROAD_HALF } from '../../world/World';
import { at, rnd, rvHit, toRoad, type EncHost } from '../common';

export const WEEDS_MAX = 5;
const WIPE_EACH = 1.6;

export interface WeedTimers { spawn: number; wipe: number; id: number; first: boolean }
export const newWeedTimers = (): WeedTimers => ({ spawn: 3, wipe: 0, id: 1, first: true });

export function stepWeeds(h: EncHost, dt: number, st: WeedTimers) {
  const s = h.s, rv = s.rv, enc = s.enc, w = s.weather;
  // spawn: storms only, from the upwind shoulder, ahead of the RV
  if (w.storm > 0.4 && Math.abs(rv.speed) > 3) {
    st.spawn -= dt;
    if (st.spawn <= 0) {
      st.spawn = rnd(1.6, 4.5) / w.storm;
      const ahead = rnd(40, 70) + Math.abs(rv.speed) * rnd(1.5, 3);
      const side = w.wind >= 0 ? -1 : 1; // wind blows toward + (right) → they come from the left
      const [rz, roff] = toRoad(rv.x, rv.z);
      const [x, z] = at(rz - ahead, side * (ROAD_HALF + rnd(4, 14)));
      // roll across toward the RV's line so a decent share actually hits
      const [tx, tz] = at(rz - ahead + rnd(-6, 6), roff + rnd(-4, 4));
      const d = Math.hypot(tx - x, tz - z) || 1, v = rnd(5, 9);
      enc.rolling.push({ id: st.id++, x, z, vx: ((tx - x) / d) * v, vz: ((tz - z) / d) * v, r: rnd(0.35, 0.6) });
    }
  }
  for (const t of enc.rolling) { t.x += t.vx * dt; t.z += t.vz * dt; }
  enc.rolling = enc.rolling.filter((t) => {
    if (t.z > rv.z + 60 || Math.abs(toRoad(t.x, t.z)[1]) > ROAD_HALF + 40) return false;
    const hit = rvHit(s, t.x, t.z, t.r);
    if (!hit) return true;
    // the front of the cab catches it; side hits just bounce off
    if (hit[1] < RV.zFront + 0.4 && Math.abs(rv.speed) > 4 && enc.weeds < WEEDS_MAX) {
      enc.weeds++; rv.grime = Math.min(1, rv.grime + 0.08);
      h.sfx('scrub');
      if (st.first) { st.first = false; h.toast('🌾 A tumbleweed is stuck on the windshield! Wipers on (they take a while).'); }
    }
    return false;
  });
  // wipers fight them off, one at a time
  if (enc.weeds > 0 && rv.wipers && !s.cab.fuseOut) {
    st.wipe += dt;
    if (st.wipe >= WIPE_EACH) { st.wipe = 0; enc.weeds--; h.sfx('scrub'); }
  } else st.wipe = 0;
}

/** Someone outside pulls one off by hand. */
export function pullWeed(h: EncHost, from: number) {
  const enc = h.s.enc;
  if (enc.weeds <= 0) return;
  if (Math.abs(h.s.rv.speed) > 0.6) { h.toast('Stop the RV first'); return; }
  enc.weeds--; h.sfx('scrub');
  h.toast(`🌾 ${h.name(from)} rips a tumbleweed off the windshield.${enc.weeds ? ` (${enc.weeds} left)` : ''}`);
}
