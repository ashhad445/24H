// Hitchhiker on the shoulder. Stop near them with the door open and they climb in and ride at the
// dinette. What they're wearing tells you who they are, if you're paying attention.
import { RV } from '../../config';
import { itemName } from '../../items/Items';
import { ROAD_HALF } from '../../world/World';
import { at, pick, rvWorld, stopped, type EncHost, type KindDef } from '../common';

export const RIDERS = [
  { kind: 'drifter', names: ['Dusty Pete', 'Wanderin\' Walt', 'Sunburnt Sal'], look: 'poncho' },
  { kind: 'shady', names: ['"Slim"', 'a guy who says his name is "Not Important"', 'Twitchy Ray'], look: 'hoodie' },
  { kind: 'preacher', names: ['Brother Amos', 'Reverend Dale', 'Sister Faye'], look: 'suit' },
  { kind: 'convict', names: ['"Tank"', 'Inmate #40417', 'Lil\' Knuckles'], look: 'jumpsuit' },
] as const;

const LINES: Record<string, string[]> = {
  drifter: ['"Nice rig. Smells like burgers and regret."', '"I been walkin\' since Barstow. Or Tuesday."', '"I\'ll pay you back at the next stop, swear on my boots."'],
  shady: ['"So uh… what\'s in all these cupboards?"', '"Don\'t mind me. Just stretchin\'. Near your stuff."', '"Nice card you got there on the dash. Real nice."'],
  preacher: ['"Keep your eyes on the road, child, and your soul on the Lord."', '"The desert tests us all. Mostly your driving."', '"Let us pray this vehicle survives the next pothole."'],
  convict: ['"Can we go faster? No reason."', '"If anybody asks, I\'ve been here the whole time."', '"Is that a cop? Is THAT a cop?"'],
};

const DOOR_OFF = (RV.doorZ0 + RV.doorZ1) / 2;

export const hitch: KindDef = {
  weight: 1,
  ok: (h) => !h.s.enc.rider,
  spawn(_h, e) {
    e.off = ROAD_HALF + 1.6;
    e.type = Math.floor(Math.random() * RIDERS.length);
    e.name = pick(RIDERS[e.type].names);
    [e.x, e.wz] = at(e.z, e.off);
    e.warned = 0;
  },
  step(h, e, dt) {
    const s = h.s, rv = s.rv;
    e.t += dt;
    const d = Math.hypot(rv.x - e.x, rv.z - e.wz);
    if (!e.warned && d < 420) { e.warned = 1; h.toast(`👍 Someone's hitchhiking on the shoulder ahead. Stop with the door open to pick them up.`); }
    if (e.ph === 0) {
      // waiting: stop close by with the door open
      e.near = stopped(s) && d < 25 && rv.doorOpen ? (e.near ?? 0) + dt : 0;
      if (e.near > 1.5) { e.ph = 1; h.toast(`🎒 ${e.name} grabs their bag and jogs over.`); }
    } else if (e.ph === 1) {
      // walk to the door
      const [tx, tz] = rvWorld(s, RV.halfW + 0.7, DOOR_OFF);
      const dx = tx - e.x, dz = tz - e.wz, dd = Math.hypot(dx, dz);
      e.yaw = Math.atan2(-dx, -dz);
      if (Math.abs(rv.speed) > 2) { e.ph = 0; h.toast(`🎒 You drove off on ${e.name}. They flip you off.`); return true; }
      if (dd < 0.8 || !rv.doorOpen) {
        if (!rv.doorOpen) { e.ph = 0; return true; }
        s.enc.rider = { type: e.type, t: 0, name: e.name };
        h.sfx('door');
        h.toast(`🎒 ${e.name} climbs in and sits at the dinette. ${pick(LINES[RIDERS[e.type].kind])}`);
        return false;
      }
      const step = Math.min(dd, 3 * dt);
      e.x += (dx / dd) * step; e.wz += (dz / dd) * step;
    }
    return rv.z > e.z - 300 && e.t < 400;
  },
  honk(h, e) { if (e.ph === 0) e.wave = (e.wave ?? 0) + 1; void h; },
};

/** The passenger: does their thing while aboard, gets out at the next stop. */
export function stepRider(h: EncHost, dt: number) {
  const s = h.s, r = s.enc.rider;
  if (!r) return;
  const kind = RIDERS[r.type].kind;
  const prev = r.t;
  r.t += dt;
  const every = (sec: number) => Math.floor(prev / sec) !== Math.floor(r.t / sec);
  if (every(55) && r.t > 5) h.toast(`🎒 ${r.name}: ${pick(LINES[kind])}`);
  if (kind === 'preacher' && s.seats.driver >= 0) { const c = h.crew(s.seats.driver); c.hypno = Math.max(0, c.hypno - 0.012 * dt); }
  if (kind === 'convict' && prev < 60 && r.t >= 60) {
    s.heat += 2; h.traffic.summonCop(5);
    h.sfx('bullhorn');
    h.toast(`🚨 SCANNER: "All units, escaped inmate spotted in a beat-up RV." ${r.name} slides down in the seat. (+2 heat)`);
  }
  if ((h.nearStop(260) && stopped(s) && r.t > 20) || r.t > 360) riderLeaves(h, -1);
}

/** Out they go. `from` = who asked (−1 = they left on their own). */
export function riderLeaves(h: EncHost, from: number) {
  const s = h.s, r = s.enc.rider;
  if (!r) return;
  if (from >= 0 && !stopped(s)) { h.toast('Stop the RV first. You\'re not THAT kind of crew.'); return; }
  const kind = RIDERS[r.type].kind;
  s.enc.rider = null;
  h.sfx('door');
  if (kind === 'drifter') {
    h.credit(from >= 0 ? from : s.seats.driver, 20, `Gas money from ${r.name}`);
    h.toast(`🎒 ${r.name} hops out and actually pays: +$20. "Y'all are alright."`);
  } else if (kind === 'shady') {
    const loot = s.items.filter((i) => i.rv && i.h === -1 && !i.s && i.k !== 'weed' && i.k !== 'card');
    const it = loot.length ? pick(loot) : null;
    if (it) { h.items.remove(it.id); h.toast(`🎒 ${r.name} slips out… and so does your ${itemName(it.k, it.d).toLowerCase()}. HEY!`); }
    else if (h.charge(from >= 0 ? from : s.seats.driver, 15, `${r.name} "borrowed" cash`)) h.toast(`🎒 ${r.name} hops out. Somehow $15 is missing from the card.`);
  } else if (kind === 'preacher') {
    s.rv.integrity = Math.min(100, s.rv.integrity + 5);
    h.toast(`🎒 ${r.name} blesses the RV on the way out. It feels… sturdier? (+5)`);
  } else h.toast(`🎒 ${r.name} bails out and sprints into the desert. "THANKS, SUCKERS!"`);
}
