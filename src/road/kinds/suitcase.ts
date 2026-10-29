// A lost suitcase lying in the lane. Run it over and it explodes into Hawaiian shirts; stop, grab it
// and open it (LMB) for cash, a random item… or a live rattlesnake loose in the cabin.
import { RV } from '../../config';
import { itemName } from '../../items/Items';
import { LANES } from '../../world/World';
import type { ItemState } from '../../types';
import { inRV, rvLocal } from '../../stops/chase';
import { at, pick, rnd, rvHit, standingInRV, type EncHost, type KindDef } from '../common';

const LOOT = ['rocket', 'tape', 'fuse', 'coffee', 'energy', 'candy', 'jerky', 'coolant'];

export const suitcase: KindDef = {
  weight: 0.8,
  spawn(h, e) {
    e.off = LANES[Math.floor(Math.random() * LANES.length)] * (Math.random() < 0.85 ? 1 : -1);
    const [x, z] = at(e.z, e.off);
    const it = h.items.spawn('suitcase', false, x, 0.2, z);
    e.item = it.id; e.warned = 0; e.burst = 0;
  },
  step(h, e, dt) {
    const s = h.s, rv = s.rv;
    e.t += dt;
    if (e.burst) return (e.bt = (e.bt ?? 0) + dt) < 6;
    const it = s.items.find((i) => i.id === e.item);
    if (!it || it.h !== -1 || it.rv) return false; // picked up: it's an item now
    const d = Math.hypot(rv.x - it.x, rv.z - it.z);
    if (!e.warned && d < 380) { e.warned = 1; h.toast('🧳 There\'s a suitcase lying in the road ahead…'); }
    if (Math.abs(rv.speed) > 4 && rvHit(s, it.x, it.z, 0.45)) {
      h.items.remove(it.id);
      e.burst = 1; e.bx = it.x; e.bz = it.z; e.bt = 0;
      h.joltAll(0.15); h.sfx('crunch', [it.x, 0.5, it.z]);
      h.toast('🧳 FWUMP — clothes everywhere. That was somebody\'s whole vacation.');
      return true;
    }
    return rv.z > e.z - 300;
  },
  remove(h, e) {
    const it = h.s.items.find((i) => i.id === e.item);
    if (it && it.h === -1 && !it.rv) h.items.remove(it.id);
  },
};

/** LMB with the suitcase in hand: what's inside? `roll` is for tests. */
export function openSuitcase(h: EncHost, from: number, it: ItemState, roll = Math.random()) {
  h.items.remove(it.id);
  h.sfx('click');
  const p = h.handOf(from);
  const inside = p ? inRV(h.s, p) : it.rv;
  const [lx, lz] = p ? (inside ? rvLocal(h.s, p[0], p[2]) : [p[0], p[2]]) : [it.x, it.z];
  if (roll < 0.35) {
    const cash = Math.round(rnd(15, 80));
    h.credit(from, cash, 'Cash in a lost suitcase');
    h.toast(`🧳 ${h.name(from)} pops it open: a roll of cash! +$${cash}`);
  } else if (roll < 0.7) {
    const k = pick(LOOT);
    const out = h.items.spawn(k, inside, lx, 1.2, lz);
    out.h = from;
    h.toast(`🧳 ${h.name(from)} pops it open: a ${itemName(k, out.d)}. Finders keepers.`);
  } else if (roll < 0.9) {
    const sn = h.items.spawn('snake', inside, lx, inside ? RV.floorY + 0.3 : 0.4, lz);
    h.items.setVel(sn.id, [rnd(-1, 1), 1.5, rnd(-1, 1)]);
    h.sfx('hiss', p ?? undefined);
    h.toast(`🐍 IT'S A RATTLESNAKE! It drops to the floor and starts looking for ankles. Grab it (E) and throw it out the door!`);
  } else {
    h.toast(`🧳 ${h.name(from)} pops it open: forty Hawaiian shirts and a single flip-flop. Fashion.`);
  }
}

const bites = new Map<number, number>();
const outside = new Map<number, number>();

/** A loose snake slithers toward the nearest standing player in the cabin and bites ankles. */
export function stepSnakes(h: EncHost, dt: number) {
  const s = h.s;
  for (const it of [...s.items]) {
    if (it.k !== 'snake') continue;
    if (it.h !== -1 || it.s) { outside.delete(it.id); continue; }
    if (!it.rv) {
      // out on the sand: it leaves
      const t = (outside.get(it.id) ?? 0) + dt; outside.set(it.id, t);
      if (t > 5) { h.items.remove(it.id); outside.delete(it.id); bites.delete(it.id); h.toast('🐍 The snake slithers off into the desert. Good riddance.'); }
      continue;
    }
    outside.delete(it.id);
    if (it.y > RV.floorY + 0.2) continue; // still falling / on a counter
    const people = standingInRV(h);
    if (!people.length) continue;
    let best = people[0], bd = Infinity;
    for (const p of people) { const d = Math.hypot(p.lx - it.x, p.lz - it.z); if (d < bd) { bd = d; best = p; } }
    if (bd > 0.6) {
      const st = Math.min(bd - 0.5, 0.7 * dt);
      it.x += ((best.lx - it.x) / bd) * st; it.z += ((best.lz - it.z) / bd) * st;
      it.ry = Math.atan2(best.lx - it.x, best.lz - it.z);
    }
    const cd = (bites.get(it.id) ?? 0) - dt;
    bites.set(it.id, cd);
    if (bd < 0.75 && cd <= 0) {
      bites.set(it.id, 2);
      h.hurt(best.id, 8); h.sfx('hiss');
      h.toast(`🐍 The snake bites ${h.name(best.id)}'s ankle! (−8 hp)`);
    }
  }
}
