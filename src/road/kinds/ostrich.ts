// An escaped ostrich sprints along the shoulder next to the RV. Throw it food and it's yours:
// it follows you, hops in when the door's open, pecks whoever's standing around, and an ostrich
// farmer pays a reward for it at the next stop.
import { RV } from '../../config';
import { KINDS } from '../../items/Items';
import { ROAD_HALF, roadYaw } from '../../world/World';
import { at, pick, rvHit, rvWorld, standingInRV, stopped, toRoad, type EncHost, type KindDef } from '../common';

const RUN = 19; // m/s, ~42 mph flat out
const TAME_RUN = 25;

export const ostrich: KindDef = {
  weight: 0.7,
  ok: (h) => !h.s.enc.bird,
  spawn(_h, e) {
    e.off = ROAD_HALF + 3.2;
    [e.x, e.wz] = at(e.z, e.off);
    e.yaw = roadYaw(e.z); e.v = 0; e.run = 0; e.warned = 0;
  },
  step(h, e, dt) {
    const s = h.s, rv = s.rv;
    e.t += dt;
    const d = Math.hypot(rv.x - e.x, rv.z - e.wz);
    if (!e.warned && d < 200) { e.warned = 1; h.toast('🦤 Is that… an OSTRICH? It\'s racing you! (throw it some food)'); h.sfx('squawk', [e.x, 1.6, e.wz]); }
    // wild: start running when the RV comes up, keep pace on the shoulder, give up after a while
    if (e.ph === 0) {
      if (!e.run && d < 120) { e.run = 1; e.t = 0; }
      if (e.run) {
        const [rz, roff] = toRoad(rv.x, rv.z);
        // on the shoulder just right of (and a little ahead of) the RV, so the door side gets a good look
        const [tx, tz] = at(rz - 8, Math.max(roff + 4.5, ROAD_HALF + 2.5));
        moveTo(e, tx, tz, RUN, dt);
        // food landing near it tames it
        for (const it of s.items) {
          if (it.rv || it.h !== -1 || !KINDS[it.k]?.food) continue;
          if (Math.hypot(it.x - e.x, it.z - e.wz) > 3 || it.y > 2.5) continue;
          h.items.remove(it.id);
          e.ph = 1; e.t = 0;
          h.sfx('eat', [e.x, 1.4, e.wz]); h.sfx('squawk', [e.x, 1.6, e.wz]);
          h.toast(`🦤 The ostrich snatches the ${KINDS[it.k].name.toLowerCase()} out of the air. It LOVES you now. Stop with the door open and it'll hop in.`);
          break;
        }
        if (e.ph === 0 && e.t > 40) { e.ph = 4; e.t = 0; h.toast('🦤 The ostrich gets bored and veers off into the desert.'); }
      }
      hitRV(h, e);
      return rv.z > e.wz - 400 && e.t < 200;
    }
    if (e.ph === 1) {
      // tamed: follow the RV's door, hop in when it's open and we're stopped
      const [tx, tz] = rvWorld(s, RV.halfW + 2, (RV.doorZ0 + RV.doorZ1) / 2);
      moveTo(e, tx, tz, TAME_RUN, dt);
      if (d > 400) { h.toast('🦤 You left the ostrich in the dust. It stands there, heartbroken.'); return false; }
      if (stopped(s) && rv.doorOpen && Math.hypot(tx - e.x, tz - e.wz) < 3) {
        s.enc.bird = 1;
        h.sfx('squawk'); h.toast('🦤 The ostrich squeezes through the door and stands in the aisle like it owns the place. Somebody will pay for this bird at the next stop.');
        return false;
      }
      return true;
    }
    // veering off
    const [ox, oz] = at(e.wz, ROAD_HALF + 60);
    moveTo(e, ox, oz - 30, 14, dt);
    return e.t < 10;
  },
};

function moveTo(e: Record<string, any>, tx: number, tz: number, vmax: number, dt: number) {
  const dx = tx - e.x, dz = tz - e.wz, d = Math.hypot(dx, dz);
  const want = Math.min(vmax, d * 1.5);
  e.v += Math.sign(want - e.v) * Math.min(Math.abs(want - e.v), 12 * dt);
  if (d > 0.05) { const st = Math.min(d, e.v * dt); e.x += (dx / d) * st; e.wz += (dz / d) * st; }
  if (e.v > 0.5) { const yw = Math.atan2(-dx, -dz); let dy = yw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 6); }
}

function hitRV(h: EncHost, e: Record<string, any>) {
  const s = h.s;
  if (e.bonk || Math.abs(s.rv.speed) < 5 || !rvHit(s, e.x, e.wz, 0.6)) return;
  e.bonk = 1; e.ph = 4; e.t = 0;
  h.joltAll(0.4); h.sfx('squawk'); h.sfx('thump');
  h.toast('🦤 *BONK* — feathers everywhere. The ostrich staggers off, deeply offended.');
}

/** The ostrich in the back: pecks people, and gets claimed at the next stop. */
export function stepBird(h: EncHost, dt: number, st: { peck: number }) {
  const s = h.s;
  if (!s.enc.bird) return;
  st.peck -= dt;
  if (st.peck <= 0) {
    st.peck = 8 + Math.random() * 4;
    const near = standingInRV(h).filter((p) => p.lz > 0.6);
    if (near.length) {
      const p = pick(near);
      h.hurt(p.id, 3); h.sfx('squawk');
      if (Math.random() < 0.5) h.toast(`🦤 The ostrich pecks ${h.name(p.id)}. (−3 hp)`);
    }
  }
  if (h.nearStop(260) && stopped(s)) {
    s.enc.bird = 0;
    h.credit(s.seats.driver >= 0 ? s.seats.driver : Number(Object.keys(s.crew)[0] ?? 0), 70, 'Ostrich reward');
    h.sfx('squawk');
    h.toast('🦤 A rancher in a feathered hat comes running: "GERTRUDE! You found her!" He pays a $70 reward and walks her home on a leash.');
  }
}
