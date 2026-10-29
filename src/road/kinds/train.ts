// Level crossing: bells, flashers, gates drop, and a mile of freight train rolls across the highway.
// Wait ~30 s, or floor it and try to beat the locomotive. Getting hit is extremely bad.
import { RV } from '../../config';
import { obbMtv } from '../../stops/geom';
import { ROAD_HALF, roadPoint } from '../../world/World';
import { rightVec, rnd, type EncHost, type KindDef } from '../common';

export const TRAIN = { speed: 22, loco: 20, car: 15, gap: 1.2, halfW: 1.6, warn: 9 /* s from the bells to the locomotive */, gateDown: 4 };

/** Train cars as [center u, half length] (u = meters along the track from the road center, + = road's right). */
export function trainCars(e: Record<string, any>): [number, number][] {
  const out: [number, number][] = [];
  let back = e.u; // the locomotive's nose
  for (let i = 0; i <= e.n; i++) {
    const len = i === 0 ? TRAIN.loco : TRAIN.car;
    out.push([back - (e.dir * len) / 2, len / 2]);
    back -= e.dir * (len + TRAIN.gap);
  }
  return out;
}
export const trainLen = (n: number) => TRAIN.loco + n * (TRAIN.car + TRAIN.gap);

export const train: KindDef = {
  weight: 0.8,
  spawn(_h, e) {
    e.dir = Math.random() < 0.5 ? 1 : -1; // +1 = rolls toward the road's right
    e.n = 22 + Math.floor(Math.random() * 14);
    e.u = -e.dir * 900; // far away until the bells start
    e.gate = 0; // 0 up … 1 down
    e.warned = 0; e.hit = 0; e.beat = 0; e.snap = 0; e.prevZ = null;
    e.cx = roadPoint(e.z, 0)[0];
  },
  step(h, e, dt) {
    const s = h.s, rv = s.rv;
    e.t += dt;
    const dist = rv.z - e.z;
    const sp = Math.abs(rv.speed);
    // the engineer blows the horn on the way in: you hear it long before you see it
    if (e.ph <= 1 && dist < 2200 && e.dir * e.u < 0) {
      e.hornT = (e.hornT ?? 0) - dt;
      if (e.hornT <= 0) {
        e.hornT = 6;
        const [rx, rz] = rightVec(e.z), [cx, cz] = roadPoint(e.z, 0);
        const u = e.ph === 0 ? -e.dir * 600 : e.u; // still out in the desert before the bells
        h.sfx('trainhorn', [cx + rx * u, 4, cz + rz * u]);
        if (!e.heard) { e.heard = 1; h.toast('🚂 A train horn echoes somewhere ahead…'); }
      }
    }
    if (e.ph === 0) {
      if (!e.warned && dist < Math.max(900, sp * 16)) { e.warned = 1; h.toast('🚂 RAILROAD CROSSING ahead.'); }
      // bells start so the locomotive gets there about when (or just before) you do
      if (dist < Math.max(420, sp * TRAIN.warn)) {
        e.ph = 1; e.t = 0;
        e.u = -e.dir * (TRAIN.speed * TRAIN.warn + rnd(-20, 40));
        h.toast('🚂 DING DING DING — a freight train is coming! Stop at the gates… or race it.');
      }
      return rv.z > e.z - 300;
    }
    if (e.ph === 1) {
      e.u += e.dir * TRAIN.speed * dt;
      e.gate = Math.min(1, Math.max(0, (e.t - TRAIN.gateDown) / 2));
      if (e.dir * e.u - trainLen(e.n) > ROAD_HALF + 8) { e.ph = 2; e.t = 0; }
      collideTrain(h, e, dt);
      // crossing the line while the gates are down
      const pz = e.prevZ ?? rv.z; e.prevZ = rv.z;
      if (pz > e.z && rv.z <= e.z && pz - rv.z < 60) {
        const nose = e.dir * e.u; // < 0: the locomotive hasn't reached the road center yet
        if (nose < -ROAD_HALF && nose > -140 && !e.hit) { e.beat = 1; h.sfx('trainhorn'); h.toast('🚂 BEAT THE TRAIN! The engineer leans on the horn. Your heart leaves your body.'); }
        if (e.gate > 0.5 && !e.snap) {
          e.snap = 1; h.joltAll(0.15); h.sfx('crunch');
          const cops = s.cop.phase === 1 || s.cop.phase === 2;
          if (cops) s.heat += 1;
          h.toast(`🚧 You snapped the crossing gate clean off${cops ? ' — right in front of Roscoe (+1 heat)' : ''}.`);
        }
      }
      return true;
    }
    // gates rise, done once we're past
    e.gate = Math.max(0, e.gate - dt / 2);
    e.u += e.dir * TRAIN.speed * dt;
    return rv.z > e.z - 300 || e.t < 4;
  },
  obstacles(e, out) {
    if (e.ph !== 1 || e.t < TRAIN.gateDown) return;
    out.push({ z: e.z + 9, off: ROAD_HALF / 2, hw: ROAD_HALF / 2, hl: 1 }, { z: e.z - 9, off: -ROAD_HALF / 2, hw: ROAD_HALF / 2, hl: 1 });
  },
};

/** Train vs RV: an OBB test against every car near the road. */
function collideTrain(h: EncHost, e: Record<string, any>, dt: number) {
  const s = h.s, rv = s.rv;
  if ((e.hitCd = Math.max(0, (e.hitCd ?? 0) - dt)) > 0) return;
  const [rx, rz] = rightVec(e.z);
  const [cx, cz] = roadPoint(e.z, 0);
  const yawT = Math.atan2(-rx, -rz); // train cars point along the track
  const midZ = (RV.noseZ + RV.zRear) / 2, hl = (RV.zRear - RV.noseZ) / 2;
  const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
  const bx = rv.x + midZ * sn, bz = rv.z + midZ * c;
  for (const [u, half] of trainCars(e)) {
    if (Math.abs(u) > ROAD_HALF + half + 12) continue;
    const tx = cx + rx * u, tz = cz + rz * u;
    const hit = obbMtv(bx, bz, rv.yaw, RV.halfW, hl, tx, tz, yawT, TRAIN.halfW, half);
    if (!hit) continue;
    // the RV is shoved out of the way along the train's travel and loses most of its speed
    rv.x -= hit.nx * hit.depth; rv.z -= hit.nz * hit.depth;
    rv.x += rx * e.dir * 2.5; rv.z += rz * e.dir * 2.5;
    rv.yaw += e.dir * 0.45 * (Math.random() * 0.5 + 0.75);
    rv.speed *= 0.3;
    e.hitCd = 3;
    if (!e.hit) {
      e.hit = 1;
      rv.integrity = Math.max(0, rv.integrity - 35);
      h.joltAll(1.4); h.hurtStanding(1.4);
      h.sfx('bang'); h.sfx('crunch'); h.sfx('trainhorn');
      h.toast('🚂💥 THE TRAIN HIT THE RV. The RV is now a different shape. (−35)');
    } else { rv.integrity = Math.max(0, rv.integrity - 5); h.joltAll(0.5); h.sfx('crunch'); }
    return;
  }
}
