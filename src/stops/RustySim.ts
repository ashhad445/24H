// Host-only simulation for Rusty's Oasis: pumps, store + Cletus, slots, crab derby, car wash, siphoning.
import type { ItemSim } from '../items/ItemPhysics';
import { itemName } from '../items/Items';
import type { ItemState, RustyState, SharedState } from '../types';
import { fromSetLocal, toSetLocal } from './geom';
import {
  COUNTER, CRABS, CRATE, HOLSTER, HOSE_LEN, PRICES, PRODUCTS, PUMPS, RUSTY_FRAME, RUSTY_SET, SCRATCH_COUNT, SCRATCH_PRICE,
  SPLATS, TABLES, inStore, onCounter,
} from './rusty';

/** What the stop needs from the host. */
export interface StopHost {
  s: SharedState;
  items: ItemSim;
  toast(text: string): void;
  sfx(name: string): void;
  name(id: number): string;
  held(id: number): ItemState | undefined;
  /** World position of an item (follows its holder when carried). */
  itemWorld(it: ItemState): [number, number, number] | null;
  charge(from: number, amount: number, what: string): boolean;
  credit(from: number, amount: number, what: string): void;
}

export function newRustyState(): RustyState {
  return {
    pumps: PUMPS.map(() => ({ auth: 0, gal: 0, cost: 0 })),
    slot: { res: [0, 0, 0], left: 0, spins: 0 },
    derby: { phase: 0, t: 0, pos: [0, 0, 0], bets: [], winner: -1 },
    wash: { dirt: SPLATS.map(() => 2), away: 0 },
    cletus: { watch: true, t: 8 },
  };
}

const SYMBOLS = 6; // 0 = 7, 1 cherry, 2 bar, 3 bell, 4 lemon, 5 star

export class RustySim {
  private spawned = false;
  private wasInside = new Map<number, boolean>();
  private siphonT = new Map<number, number>();
  private crabSpeed = [0, 0, 0];
  private slotPlayer = -1;

  constructor(private h: StopHost) {
    h.items.statics.push(RUSTY_SET);
    PUMPS.forEach((_, i) => {
      const [lx, y, lz] = HOLSTER(i);
      const [wx, wz] = fromSetLocal(RUSTY_SET, lx, lz);
      h.items.worldSlots.set(`pump${i}`, [wx, y, wz]);
    });
  }

  private get r() { return this.h.s.rusty; }
  private world(lx: number, y: number, lz: number): [number, number, number] {
    const [wx, wz] = fromSetLocal(RUSTY_SET, lx, lz); return [wx, y, wz];
  }

  /** Stock the shelves once the RV gets close. */
  private spawnAll() {
    this.spawned = true;
    const it = this.h.items;
    PUMPS.forEach((_, i) => it.spawn('nozzle', false, 0, 0, 0, `pump${i}`, i));
    // products in rows on the two display tables
    let slot = 0;
    for (const [k, price, count] of PRODUCTS) {
      for (let n = 0; n < count; n++, slot++) {
        const t = TABLES[slot % 2];
        const row = Math.floor(slot / 2);
        const lz = t.z0 + 0.3 + ((row * 0.42) % (t.z1 - t.z0 - 0.6));
        const lx = t.x0 + 0.25 + (Math.floor((row * 0.42) / (t.z1 - t.z0 - 0.6)) % 3) * 0.35;
        const [wx, y, wz] = this.world(lx, t.top + 0.3, lz);
        it.spawn(k, false, wx, y, wz, '', undefined, price);
      }
    }
    for (let n = 0; n < SCRATCH_COUNT; n++) {
      const [wx, y, wz] = this.world(COUNTER.x0 + 0.3, COUNTER.top + 0.05, COUNTER.z1 - 0.3 - n * 0.12);
      it.spawn('scratch', false, wx, y, wz, '', 0, SCRATCH_PRICE);
    }
    const [sx, sy, sz] = this.world((CRATE.x0 + CRATE.x1) / 2, CRATE.top + 0.1, (CRATE.z0 + CRATE.z1) / 2);
    it.spawn('sponge', false, sx, sy, sz, '', 0);
  }

  private needCard(from: number) {
    if (this.h.held(from)?.k === 'card') return true;
    this.h.toast('💳 You need the debit card in your hand');
    this.h.sfx('error');
    return false;
  }

  /** Returns true if the act id was handled here. */
  act(from: number, id: string): boolean {
    if (!id.startsWith('rusty:')) return false;
    const key = id.slice(6);
    const held = this.h.held(from);
    const r = this.r;

    if (key.startsWith('pump')) {
      const i = Number(key.slice(4));
      const pump = r.pumps[i];
      if (held?.k === 'nozzle' && held.d === i) { held.h = -1; held.s = `pump${i}`; this.h.sfx('clank'); return true; }
      if (held?.k === 'jerrycan') {
        if (pump.auth <= 0) { this.h.toast('Swipe the card at the pump first'); return true; }
        const gal = Math.max(0, 5 - held.d);
        if (gal > 0 && this.h.charge(from, gal * PRICES.gas, `Gas (jerrycan) ${gal.toFixed(1)} gal`)) {
          held.d = 5; pump.gal += gal; pump.cost += gal * PRICES.gas; this.h.sfx('pour');
        }
        return true;
      }
      if (!this.needCard(from)) return true;
      pump.auth = 180; pump.gal = 0; pump.cost = 0;
      this.h.sfx('cash');
      this.h.toast(`⛽ Pump ${i + 1} authorized — grab the nozzle, fuel port is on the RV's back-left`);
      return true;
    }

    switch (key) {
      case 'register': {
        if (!this.needCard(from)) return true;
        let total = 0; const bought: string[] = [];
        for (const it of this.h.s.items) {
          if (it.p <= 0 || it.h !== -1 || it.rv) continue;
          const [lx, lz] = toSetLocal(RUSTY_SET, it.x, it.z);
          if (!onCounter(lx, it.y, lz)) continue;
          total += it.p; bought.push(itemName(it.k, it.d));
        }
        if (!bought.length) { this.h.toast('CLETUS: "Put yer stuff on the counter, chief."'); return true; }
        if (this.h.charge(from, total, `Rusty's: ${bought.join(', ')}`)) {
          for (const it of this.h.s.items) {
            if (it.p <= 0 || it.h !== -1 || it.rv) continue;
            const [lx, lz] = toSetLocal(RUSTY_SET, it.x, it.z);
            if (onCounter(lx, it.y, lz)) it.p = 0;
          }
          this.h.toast(`🧾 Paid $${total.toFixed(2)} for ${bought.length} item${bought.length > 1 ? 's' : ''}`);
        }
        return true;
      }
      case 'slot': {
        if (r.slot.left > 0) return true;
        if (!this.needCard(from) || !this.h.charge(from, PRICES.slot, 'Lucky 777 slot spin')) return true;
        r.slot.res = [0, 1, 2].map(() => Math.floor(Math.random() * SYMBOLS));
        r.slot.left = 2.4; r.slot.spins++;
        this.slotPlayer = from;
        this.h.sfx('click');
        return true;
      }
      case 'bucket':
        if (held?.k === 'sponge') { held.d = 5; this.h.sfx('pour'); this.h.toast('🧽 Sponge is sudsy (5 scrubs)'); }
        return true;
      case 'suv': {
        if (held?.k !== 'jerrycan') return true;
        if (held.d >= 5) { this.h.toast('Jerrycan is full'); return true; }
        const t = (this.siphonT.get(from) ?? 0) + 0.2;
        this.siphonT.set(from, t);
        if (t >= 3) {
          this.siphonT.set(from, 0);
          held.d = Math.min(5, held.d + 2);
          if (Math.random() < 0.25) {
            this.h.s.heat += 1; this.h.sfx('yell');
            this.h.toast('🚨 "HEY! THAT\'S MY TRUCK!" — someone saw you. (+1 heat)');
          } else { this.h.sfx('pour'); this.h.toast('⛽ Siphoned 2 gal. Tastes like crime.'); }
        }
        return true;
      }
    }

    if (key.startsWith('crab')) {
      const lane = Number(key.slice(4));
      const d = r.derby;
      if (d.phase === 2) { this.h.toast('Race is on — wait for the next one'); return true; }
      if (d.bets.some(([p]) => p === from)) { this.h.toast('One bet per race'); return true; }
      if (!this.needCard(from) || !this.h.charge(from, PRICES.crab, `Crab Derby bet on ${CRABS[lane]}`)) return true;
      d.bets.push([from, lane]);
      if (d.phase === 0) { d.phase = 1; d.t = 6; d.pos = [0, 0, 0]; d.winner = -1; }
      this.h.toast(`🦀 ${this.h.name(from)} bet $${PRICES.crab} on ${CRABS[lane]}! Race starts in ${Math.ceil(d.t)}s`);
      return true;
    }

    if (key.startsWith('dirt')) {
      const i = Number(key.slice(4));
      if (held?.k !== 'sponge' || r.wash.away > 0 || r.wash.dirt[i] <= 0) return true;
      if (held.d <= 0) { this.h.toast('Sponge is dry — dip it in the bucket'); return true; }
      held.d -= 1; r.wash.dirt[i] -= 1;
      this.h.sfx('scrub');
      if (r.wash.dirt.every((v) => v <= 0)) {
        this.h.credit(from, PRICES.wash, 'Car wash job');
        this.h.toast(`🚗 TOURIST: "Sparkling! Here's $${PRICES.wash}." (+$${PRICES.wash})`);
        r.wash.away = 50;
      }
      return true;
    }
    return true;
  }

  step(dt: number) {
    const s = this.h.s, r = this.r;
    if (!this.spawned && Math.hypot(s.rv.x - RUSTY_FRAME.x, s.rv.z - RUSTY_FRAME.z) < 500) this.spawnAll();

    for (const p of r.pumps) p.auth = Math.max(0, p.auth - dt);

    // Cletus alternates between watching the floor and reading his paper
    r.cletus.t -= dt;
    if (r.cletus.t <= 0) {
      r.cletus.watch = !r.cletus.watch;
      r.cletus.t = r.cletus.watch ? 7 + Math.random() * 6 : 3 + Math.random() * 4;
    }

    for (const it of s.items) {
      // hose tether: nozzles snap back to the pump
      if (it.k === 'nozzle' && !it.s) {
        const w = this.h.itemWorld(it);
        const [px, pz] = PUMPS[it.d];
        const [pwx, pwz] = fromSetLocal(RUSTY_SET, px, pz);
        if (!w || Math.hypot(w[0] - pwx, w[2] - pwz) > HOSE_LEN) {
          it.h = -1; it.s = `pump${it.d}`;
          this.h.sfx('clank'); this.h.toast('*SNAP* — the hose yanked the nozzle back to the pump');
        }
      }
      // shoplifting: unpaid merchandise leaving the building
      if (it.p > 0) {
        const w = this.h.itemWorld(it);
        if (!w) continue;
        const [lx, lz] = toSetLocal(RUSTY_SET, w[0], w[2]);
        const inside = inStore(lx, lz);
        const was = this.wasInside.get(it.id) ?? inside;
        this.wasInside.set(it.id, inside);
        if (was && !inside) {
          const what = itemName(it.k, it.d);
          it.p = 0;
          if (r.cletus.watch) {
            s.heat += 1; this.h.sfx('yell');
            this.h.toast(`🚨 CLETUS: "HEY! GET BACK HERE WITH THAT ${what.toUpperCase()}!" (+1 heat)`);
          } else this.h.toast(`🤫 Five-finger discount: ${what}`);
        }
      }
    }

    // slots
    if (r.slot.left > 0) {
      r.slot.left -= dt;
      if (r.slot.left <= 0) {
        r.slot.left = 0;
        const [a, b, c] = r.slot.res;
        const who = this.slotPlayer;
        if (a === b && b === c) {
          const win = a === 0 ? 250 : 100;
          this.h.credit(who, win, 'Slots JACKPOT'); this.h.sfx('jackpot');
          this.h.toast(`🎰 ${a === 0 ? '7 7 7 — ' : ''}JACKPOT! +$${win}`);
        } else if (a === b || b === c || a === c) {
          this.h.credit(who, PRICES.slot, 'Slots pair'); this.h.toast('🎰 A pair — got your $5 back');
        } else this.h.toast('🎰 Nothing. The machine thanks you for your donation.');
      }
    }

    // crab derby
    const d = r.derby;
    if (d.phase === 1) {
      d.t -= dt;
      if (d.t <= 0) { d.phase = 2; d.t = 0; this.crabSpeed = [0, 0, 0]; this.h.toast('🦀 AND THEY\'RE OFF!'); this.h.sfx('bell'); }
    } else if (d.phase === 2) {
      if (d.winner < 0) {
        for (let i = 0; i < 3; i++) {
          // jittery crab sprints: random bursts and pauses
          if (Math.random() < dt * 2) this.crabSpeed[i] = Math.random() < 0.2 ? 0 : 0.05 + Math.random() * 0.22;
          d.pos[i] = Math.min(1, d.pos[i] + this.crabSpeed[i] * dt);
          if (d.pos[i] >= 1 && d.winner < 0) d.winner = i;
        }
        if (d.winner >= 0) {
          const winners = d.bets.filter(([, lane]) => lane === d.winner);
          this.h.toast(`🏁 ${CRABS[d.winner]} WINS!${winners.length ? '' : ' Nobody bet on them.'}`);
          for (const [p] of winners) { this.h.credit(p, PRICES.crabWin, `Crab Derby win (${CRABS[d.winner]})`); this.h.toast(`💰 ${this.h.name(p)} won $${PRICES.crabWin}!`); }
          d.t = 4;
        }
      } else {
        d.t -= dt;
        if (d.t <= 0) { d.phase = 0; d.bets = []; d.pos = [0, 0, 0]; d.winner = -1; }
      }
    }

    // car wash: a new dirty car arrives
    if (r.wash.away > 0) {
      r.wash.away -= dt;
      if (r.wash.away <= 0) { r.wash.away = 0; r.wash.dirt = SPLATS.map(() => 2); }
    }
  }

  /** Fuel the RV from a held nozzle (called every 0.2 s while the button is held). */
  pumpInto(from: number, nozzle: ItemState) {
    const s = this.h.s, pump = this.r.pumps[nozzle.d];
    if (pump.auth <= 0) { this.h.toast('Pump isn\'t authorized — swipe the card at the pump'); return; }
    const room = 25 - s.rv.fuel;
    if (room <= 0.01) { this.h.toast('⛽ Tank is full'); return; }
    const gal = Math.min(0.5, room);
    if (!this.h.charge(from, gal * PRICES.gas, 'Gas')) return;
    s.rv.fuel += gal; pump.gal += gal; pump.cost += gal * PRICES.gas; pump.auth = Math.max(pump.auth, 30);
  }
}
