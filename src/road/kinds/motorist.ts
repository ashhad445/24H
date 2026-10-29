// Broken-down car on the shoulder: hood up, hazards on, the driver waving you over.
// Bring what they need (or duct tape, which fixes everything badly) for cash or a free item.
// Or point the pistol at them. Nobody's watching. Probably.
import { itemName } from '../../items/Items';
import { ROAD_HALF } from '../../world/World';
import { at, pick, type KindDef } from '../common';

export const NEEDS = [
  { k: 'fuse', pay: 35, why: 'blew a fuse — no lights, no radio, no AC' },
  { k: 'coolant', pay: 45, why: 'overheated — radiator is bone dry' },
  { k: 'jerrycan', pay: 60, why: 'ran out of gas (needs 2 gallons)' },
] as const;
const GIFTS = ['rocket', 'coffee', 'burrito', 'energy', 'jerky'];

export const motorist: KindDef = {
  weight: 1,
  spawn(_h, e) {
    e.off = ROAD_HALF + 2.6;
    e.need = Math.floor(Math.random() * NEEDS.length);
    e.car = Math.random() < 0.6 ? 'sedan' : 'pickup';
    e.c = Math.floor(Math.random() * 6);
    e.s = e.z; // road position of the car (it drives off later)
    e.v = 0;
    e.warned = 0;
  },
  step(h, e, dt) {
    const rv = h.s.rv;
    e.t += dt;
    const [x, z] = at(e.s, e.off);
    const d = Math.hypot(rv.x - x, rv.z - z);
    if (!e.warned && d < 420) { e.warned = 1; h.toast('🚗 A car is broken down on the shoulder ahead. Somebody\'s waving you over.'); }
    if (e.ph >= 2) {
      // fixed (or robbed): pull away down the shoulder and merge off into the distance
      e.v = Math.min(e.ph === 3 ? 40 : 30, e.v + 6 * dt);
      e.s -= e.v * dt;
      return e.t < 18;
    }
    return rv.z > e.z - 300 && e.t < 300;
  },
  act(h, e, from, key) {
    if (key !== 'help' || e.ph >= 2) return;
    const held = h.held(from);
    const need = NEEDS[e.need];
    const [x, z] = at(e.s, e.off);
    if (held?.k === 'pistol') {
      if (held.d <= 0) { h.toast('*click* The gun is empty. The driver looks at you. You look at the driver.'); return; }
      e.ph = 3; e.t = 0; e.robbed = 1;
      h.credit(from, 40, 'Robbed a stranded motorist');
      h.sfx('yell', [x, 1.5, z]);
      if (Math.random() < 0.5) { h.s.heat += 1; h.toast(`🔫 ${h.name(from)} robbed the stranded driver: +$40. They floor it and read your plate out loud. (+1 heat)`); }
      else h.toast(`🔫 ${h.name(from)} robbed the stranded driver: +$40. They limp off, too scared to call it in.`);
      return;
    }
    const tape = held?.k === 'tape' && held.d > 0;
    const right = held?.k === need.k && (need.k !== 'jerrycan' || held.d >= 2) && (need.k !== 'coolant' || held.d > 0);
    if (!right && !tape) {
      if (held?.k === 'jerrycan') h.toast(`🚗 "I need at least 2 gallons, friend." (that can has ${held.d.toFixed(1)})`);
      else h.toast(`🚗 "I ${need.why}. Got a ${itemName(need.k, need.k === 'jerrycan' ? 5 : 1).replace(/ \(.*\)/, '').toLowerCase()}? Or duct tape, I'm not picky."`);
      return;
    }
    // use up what you brought
    if (tape) { held!.d -= 1; if (held!.d <= 0) h.items.remove(held!.id); }
    else if (need.k === 'fuse') h.items.remove(held!.id);
    else if (need.k === 'coolant') { held!.d -= 1; if (held!.d <= 0) h.items.remove(held!.id); }
    else held!.d -= 2;
    e.ph = 2; e.t = 0;
    h.sfx(tape ? 'tape' : 'clank', [x, 1, z]);
    const pay = tape ? 20 : need.pay;
    if (Math.random() < 0.3) {
      const k = pick(GIFTS);
      const it = h.items.spawn(k, false, x, 1.2, z);
      if (h.s.items.filter((i) => i.h === from).length < 3) it.h = from;
      h.toast(`🚗 "You're a lifesaver!" They hand ${h.name(from)} a ${itemName(k, it.d)} from the back seat${tape ? ' (the tape job will last 4 miles, tops)' : ''}.`);
    } else {
      h.credit(from, pay, 'Helped a stranded motorist');
      h.toast(`🚗 "Bless you!" +$${pay}${tape ? ' for a duct-tape job they\'ll regret in 4 miles' : ''}. The engine coughs back to life.`);
    }
  },
};
