// Host-only road encounter director: every minute or so of driving, something happens on the road
// ahead (a hitchhiker, a broken-down car, cattle, a suitcase, road work, a train, an ostrich).
// One at a time, never near stops / forks / the chapel, and never the same kind twice in a row.
import { RUSTY_SET } from '../stops/rusty';
import { STOPS } from '../stops/defs';
import { stopFrame, stopOnRoute } from '../stops/kit';
import type { Obstacle } from '../traffic/TrafficSim';
import type { Enc, EncKind, ItemState } from '../types';
import { branchAt, chapelZ, FORKS, forkZ } from '../world/Route';
import { kindAt, roadY } from '../world/RoadShape';
import { rnd, type EncHost, type KindDef } from './common';
import { cattle } from './kinds/cattle';
import { hitch, riderLeaves, stepRider } from './kinds/hitch';
import { motorist } from './kinds/motorist';
import { ostrich, stepBird } from './kinds/ostrich';
import { roadwork, stepCone, yankCone } from './kinds/roadwork';
import { openSuitcase, stepSnakes, suitcase } from './kinds/suitcase';
import { train } from './kinds/train';
import { newWeedTimers, pullWeed, stepWeeds } from './kinds/weeds';

export const KIND_DEFS: Record<EncKind, KindDef> = { hitch, motorist, cattle, ostrich, suitcase, roadwork, train };
export const ENC_KINDS = Object.keys(KIND_DEFS) as EncKind[];

const CALM = new Set(['flat', 'straight', 'sweepers']);
const NO_CANYON = new Set<EncKind>(['train', 'roadwork']);
export const newEncState = () => ({ list: [], rider: null, weeds: 0, rolling: [], cone: 0, bird: 0 });

export class EncounterSim {
  /** seconds of driving until the next encounter */
  next = rnd(45, 75);
  private id = 1;
  private recent: EncKind[] = [];
  private weeds = newWeedTimers();
  private cone = { t: 0, scrape: 0 };
  private bird = { peck: 6 };
  /** for tests: how many encounters the director started */
  started = 0;

  constructor(private h: EncHost) {
    h.traffic.obstacles = () => this.obstacles();
  }

  step(dt: number) {
    const s = this.h.s, rv = s.rv, enc = s.enc;
    const solo = Object.keys(s.crew).length <= 1 ? 1.2 : 1;
    // ---------- director ----------
    if (Math.abs(rv.speed) > 8 && s.phase === 'drive') this.next -= dt / solo;
    if (this.next <= 0) {
      const ahead = Math.max(450, Math.min(1600, Math.abs(rv.speed) * 14));
      const z = rv.z - ahead;
      if (enc.list.length || !this.quiet(rv.z) || !this.quiet(z) || (s.bandits.phase === 1 || s.bandits.phase === 2) || s.mafia.on) this.next = 10;
      else {
        const k = this.pick(z);
        if (k) { this.spawn(k, z); this.started++; this.next = rnd(55, 100); } else this.next = 10;
      }
    }
    // ---------- active encounters ----------
    for (const e of [...enc.list]) {
      const def = KIND_DEFS[e.k];
      if (!def.step(this.h, e, dt)) { def.remove?.(this.h, e); enc.list = enc.list.filter((x) => x !== e); }
    }
    // ---------- things that outlive their encounter ----------
    stepRider(this.h, dt);
    stepBird(this.h, dt, this.bird);
    stepCone(this.h, dt, this.cone);
    stepSnakes(this.h, dt);
    stepWeeds(this.h, dt, this.weeds);
  }

  /** Far enough from stops, forks and the chapel for something to happen? */
  private quiet(z: number) {
    const s = this.h.s;
    const sets = [RUSTY_SET, ...STOPS.filter((d) => stopOnRoute(d, s.route)).map(stopFrame)];
    if (sets.some((set) => Math.abs(set.z - z) < 1200)) return false;
    if (FORKS.some((f) => Math.abs(forkZ(f) - z) < 2200)) return false;
    if (z - chapelZ() < 2500) return false;
    // only on calm road: no hairpins, cliff shelves, passes or hills (encounter props stand on flat y = 0 road)
    for (let d = -500; d <= 700; d += 100) if (!CALM.has(kindAt(z - d)) || Math.abs(roadY(z - d)) > 0.3) return false;
    return z < -1500; // not in the first stretch off the rental lot
  }

  private pick(z: number): EncKind | null {
    const canyon = !!branchAt(z)?.canyon || !!branchAt(this.h.s.rv.z)?.canyon;
    const opts = ENC_KINDS.filter((k) => !this.recent.includes(k) && !(canyon && NO_CANYON.has(k)) && (KIND_DEFS[k].ok?.(this.h) ?? true));
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((a, k) => a + KIND_DEFS[k].weight, 0);
    for (const k of opts) if ((r -= KIND_DEFS[k].weight) <= 0) return k;
    return opts[opts.length - 1];
  }

  /** Start an encounter at road distance z (dev / tests can force any kind). */
  spawn(k: EncKind, z = this.h.s.rv.z - Math.max(450, Math.min(1600, Math.abs(this.h.s.rv.speed) * 14))): Enc {
    const e: Enc = { id: this.id++, k, z, off: 0, ph: 0, t: 0 };
    KIND_DEFS[k].spawn(this.h, e);
    this.h.s.enc.list.push(e);
    this.recent = [k, ...this.recent].slice(0, 2);
    return e;
  }

  private obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const e of this.h.s.enc.list) KIND_DEFS[e.k].obstacles?.(e, out);
    return out;
  }

  /** `enc:<id>:<key>`, `enc:rider`, `enc:weed`, `enc:cone`. */
  act(from: number, id: string) {
    const [, a, key = ''] = id.split(':');
    if (a === 'rider') return riderLeaves(this.h, from);
    if (a === 'weed') return pullWeed(this.h, from);
    if (a === 'cone') return yankCone(this.h, from);
    const e = this.h.s.enc.list.find((x) => x.id === Number(a));
    if (e) KIND_DEFS[e.k].act?.(this.h, e, from, key);
  }

  honk() { for (const e of this.h.s.enc.list) KIND_DEFS[e.k].honk?.(this.h, e); }

  open(from: number, it: ItemState, roll?: number) { openSuitcase(this.h, from, it, roll); }
}
