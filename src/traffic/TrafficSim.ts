// Host-only highway chaos: four-lane NPC traffic, radar traps, Sheriff Roscoe and the Loan Shark.
import { CFG, RV } from '../config';
import { obbObb } from '../stops/geom';
import type { NPCState, SharedState } from '../types';
import { LANES, ROAD_HALF, SPEED_LIMIT, radarsNear, roadDX, roadPoint, roadX, roadYaw } from '../world/World';

export const NPC_DIMS: Record<NPCState['k'], [number, number]> = { // half width, half length
  sedan: [0.9, 2.2], pickup: [1.0, 2.5], camper: [1.15, 3.0], cop: [0.95, 2.4], shark: [0.95, 2.3], semi: [1.25, 4.6],
};

export interface TrafficHost {
  s: SharedState;
  toast(text: string): void;
  sfx(name: string, at?: [number, number, number]): void;
  joltAll(mag: number): void;
  charge(from: number, amount: number, what: string): boolean;
  held(id: number): { k: string } | undefined;
}

/** Road-following data for a traffic car (host only). dir +1 = same way as the RV (−Z). */
interface Lane { dir: 1 | -1; lane: number; off: number; latV: number; cruise: number; changeCd: number; s: number /* road parameter (z on the centerline) */ }

const MPH = CFG.MPH;
const COUNT = { same: 10, oncoming: 8 };
const laneOff = (dir: 1 | -1, lane: number) => dir * LANES[lane];

export class TrafficSim {
  private nextId = 1;
  private lanes = new Map<number, Lane>();
  private radarsHit = new Set<number>();
  private copDelay = 25;
  private stoppedT = 0;
  private ramCd = 0;
  private sharkDelay = 12;
  private bullhornCd = 0;
  private copHp = 3;
  private wreckT = 0;

  constructor(private h: TrafficHost) {}

  private get s() { return this.h.s; }

  /** RV in road coordinates: z and lateral offset from the centerline (+ = right). */
  private rvRoad() {
    const rv = this.s.rv;
    return { z: rv.z, off: (rv.x - roadX(rv.z)) * Math.hypot(1, roadDX(rv.z)) };
  }

  /** Signed distance from car `n` (with direction dir) forward to z. */
  private ahead(n: NPCState, dir: 1 | -1, z: number) { return dir === 1 ? n.z - z : z - n.z; }

  /** Is the stretch of a lane from `back` m behind to `front` m ahead of z free of cars and the RV? */
  private laneClear(dir: 1 | -1, off: number, z: number, back: number, front: number, hw: number, ignore?: NPCState) {
    const along = (oz: number) => (dir === 1 ? z - oz : oz - z); // + = ahead of z
    for (const o of this.s.npcs) {
      if (o === ignore) continue;
      const lo = this.lanes.get(o.id);
      const ooff = lo ? lo.off : (o.x - roadX(o.z)) * Math.hypot(1, roadDX(o.z));
      if (Math.abs(ooff - off) > hw + NPC_DIMS[o.k][0] + 0.3) continue;
      const a = along(o.z);
      if (a > -back && a < front) return false;
    }
    const R = this.rvRoad();
    if (Math.abs(R.off - off) < hw + RV.halfW + 0.3) { const a = along(R.z); if (a > -back - 4 && a < front + 4) return false; }
    return true;
  }

  private spawnTraffic(dir: 1 | -1) {
    const R = this.rvRoad();
    for (let attempt = 0; attempt < 6; attempt++) {
      const roll = Math.random();
      const lane = roll < 0.5 ? 2 : roll < 0.82 ? 1 : 0; // most traffic keeps right
      // same direction: mostly ahead at a range of speeds, some faster ones from behind
      const behind = dir === 1 && Math.random() < 0.3;
      const z = dir === 1 ? (behind ? R.z + 350 + Math.random() * 450 : R.z - 550 - Math.random() * 900) : R.z - 700 - Math.random() * 900;
      const base = lane === 0 ? 55 : lane === 1 ? 47 : 39; // m/s: ~123 / 105 / 87 mph
      const cruise = dir === -1 ? 40 + Math.random() * 20 : behind ? 62 + Math.random() * 10 : base + Math.random() * 8;
      const off = laneOff(dir, lane);
      // keep spawns spaced out so cars don't start in a clump
      if (!this.laneClear(dir, off, z, 130, 130, 1.2)) continue;
      const kinds: NPCState['k'][] = ['sedan', 'sedan', 'sedan', 'pickup', 'pickup', 'camper', 'semi'];
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      const [x, zz] = roadPoint(z, off);
      const npc: NPCState = { id: this.nextId++, k, x, z: zz, yaw: roadYaw(z) + (dir === 1 ? 0 : Math.PI), speed: cruise, c: Math.floor(Math.random() * 6), w: 0 };
      this.s.npcs.push(npc);
      this.lanes.set(npc.id, { dir, lane, off, latV: 0, cruise, changeCd: 2 + Math.random() * 3, s: z });
      return;
    }
  }

  private removeNpc(id: number) {
    this.s.npcs = this.s.npcs.filter((n) => n.id !== id);
    this.lanes.delete(id);
  }

  step(dt: number) {
    const s = this.s, rv = s.rv;
    const R = this.rvRoad();

    // ---------- keep traffic around the RV ----------
    let same = 0, onc = 0;
    for (const n of s.npcs) { const L = this.lanes.get(n.id); if (L) { if (L.dir === 1) same++; else onc++; } }
    if (same < COUNT.same) this.spawnTraffic(1);
    if (onc < COUNT.oncoming) this.spawnTraffic(-1);

    for (const n of [...s.npcs]) {
      const L = this.lanes.get(n.id);
      if (!L) continue;
      if (Math.abs(n.z - R.z) > 2000) { this.removeNpc(n.id); continue; }
      const [hw] = NPC_DIMS[n.k];
      L.changeCd = Math.max(0, L.changeCd - dt);

      // wrecked: limp onto the shoulder, then disappear
      if (n.w > 0) {
        n.w -= dt;
        n.speed = Math.max(0, n.speed - 7 * dt);
        const shoulder = L.dir * (ROAD_HALF + 1.4);
        L.latV = Math.sign(shoulder - L.off) * Math.min(1.5, Math.abs(shoulder - L.off) * 2);
        L.off += L.latV * dt;
        if (n.w <= 0) { this.removeNpc(n.id); continue; }
        this.place(n, L, dt);
        continue;
      }

      // Every vehicle ahead whose body overlaps my lane (traffic or the RV). Speed limit is the
      // tightest "can I stop behind it" bound over ALL of them, not just the nearest — so a car
      // swerving out of the lane never reveals a stopped RV we can't stop for.
      let gap = Infinity, leaderSpeed = 0, safe = Infinity;
      // while changing lanes, watch both the lane I'm in and the one I'm moving into
      const wantOff = laneOff(L.dir, L.lane);
      const overlaps = (ooff: number, w: number) => Math.min(Math.abs(ooff - L.off), Math.abs(ooff - wantOff)) < w;
      const consider = (g: number, sp: number) => {
        if (g <= -1 || g > 420) return;
        if (g < gap) { gap = g; leaderSpeed = sp; }
        safe = Math.min(safe, g < 8 ? 0 : Math.max(0, sp) + Math.sqrt(2 * 4.5 * (g - 8)));
      };
      for (const o of s.npcs) {
        if (o === n) continue;
        const lo = this.lanes.get(o.id);
        const ooff = lo ? lo.off : (o.x - roadX(o.z)) * Math.hypot(1, roadDX(o.z));
        if (!overlaps(ooff, hw + NPC_DIMS[o.k][0] + 0.3)) continue;
        consider(this.ahead(n, L.dir, o.z) - NPC_DIMS[n.k][1] - NPC_DIMS[o.k][1], (lo ? lo.dir : 1) === L.dir ? o.speed : -o.speed);
      }
      if (overlaps(R.off, hw + RV.halfW + 0.3)) {
        consider(this.ahead(n, L.dir, R.z) - NPC_DIMS[n.k][1] - 3.9, L.dir === 1 ? rv.speed : -rv.speed);
      }

      // lane changes (only within my side of the road)
      if (L.changeCd <= 0 && Math.abs(L.off - laneOff(L.dir, L.lane)) < 0.2) {
        const free = (l: number) => l >= 0 && l < LANES.length && this.laneClear(L.dir, laneOff(L.dir, l), n.z, 45, 150, hw, n);
        const pref = L.cruise > 53 ? 0 : L.cruise > 45 ? 1 : 2; // fast cars like the inside lane
        if (gap < 130 && leaderSpeed < L.cruise - 2) {
          // blocked by someone slow: overtake on the inside if it's clear, else try the other side
          if (free(L.lane - 1)) { L.lane--; L.changeCd = 5; } else if (free(L.lane + 1)) { L.lane++; L.changeCd = 5; }
        } else if (L.lane < pref && free(L.lane + 1)) {
          // drift back toward my preferred lane once the overtake is done
          L.lane++; L.changeCd = 6;
        }
      }

      // speed: cruise, never faster than we can stop within the gap
      const target = Math.min(L.cruise, safe);
      n.speed += Math.sign(target - n.speed) * Math.min(Math.abs(target - n.speed), (target > n.speed ? 3.2 : 9) * dt);

      // smooth lateral motion toward the lane center (eased so cars steer, not slide)
      const latTarget = Math.max(-2.2, Math.min(2.2, (laneOff(L.dir, L.lane) - L.off) * 1.6));
      L.latV += (latTarget - L.latV) * Math.min(1, dt * 3);
      L.off += L.latV * dt;
      this.place(n, L, dt);
    }

    // ---------- radar traps ----------
    for (const r of radarsNear(rv.z)) {
      if (this.radarsHit.has(r.id)) continue;
      if (rv.z < r.z + 1 && rv.z > r.z - 30) {
        this.radarsHit.add(r.id);
        const mph = Math.abs(rv.speed) * MPH;
        if (mph > SPEED_LIMIT + 7) {
          s.heat += 1; this.h.sfx('camera');
          this.h.toast(`📸 RADAR: ${Math.round(mph)} in a ${SPEED_LIMIT}! (+1 heat)`);
        }
      }
    }

    this.stepCop(dt);
    this.stepShark(dt);
    this.collide();
  }

  /**
   * Advance a traffic car along the road and set its pose (yaw follows the lane change).
   * Progress is tracked on the road parameter L.s — never re-derived from the world z,
   * which is offset sideways on curves (that feedback made cars drift and bunch up).
   */
  private place(n: NPCState, L: Lane, dt: number) {
    L.s += (n.speed * dt * (L.dir === 1 ? -1 : 1)) / Math.hypot(1, roadDX(L.s));
    const [x, z] = roadPoint(L.s, L.off);
    n.x = x; n.z = z;
    const steer = -L.dir * Math.atan2(L.latV, Math.max(2, n.speed));
    n.yaw = roadYaw(L.s) + (L.dir === 1 ? 0 : Math.PI) + steer;
  }

  // ---------- chasers ----------
  private chaser(k: 'cop' | 'shark') { return this.s.npcs.find((n) => n.k === k); }

  /**
   * Drive a chaser toward a world point. Far away it follows the road (fast lane) so it
   * doesn't cut across the desert; close in it steers straight for the target.
   */
  private drive(n: NPCState, tx: number, tz: number, vmax: number, dt: number, stopAt = 0) {
    const d = Math.hypot(tx - n.x, tz - n.z);
    let sx = tx, sz = tz;
    if (d > 60) {
      // aim at a point 30 m further along the road, in the fast lane
      const dir = tz < n.z ? 1 : -1;
      [sx, sz] = roadPoint(n.z - dir * 30, dir * LANES[0]);
    }
    const want = Math.atan2(-(sx - n.x), -(sz - n.z));
    let dy = want - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    n.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, dy));
    const target = d < stopAt ? 0 : Math.min(vmax, Math.max(0, (d - stopAt) * 0.9 + Math.abs(this.s.rv.speed)));
    n.speed += Math.sign(target - n.speed) * Math.min(Math.abs(target - n.speed), 14 * dt);
    n.x += -Math.sin(n.yaw) * n.speed * dt;
    n.z += -Math.cos(n.yaw) * n.speed * dt;
    return d;
  }

  /** A point `back` meters behind the RV (and `side` meters to its right). */
  private behindRV(back: number, side = 0): [number, number] {
    const rv = this.s.rv; const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
    return [rv.x + side * c + back * sn, rv.z - side * sn + back * c];
  }

  private spawnChaser(k: 'cop' | 'shark') {
    const R = this.rvRoad();
    const [x, z] = roadPoint(R.z + 480, LANES[0]);
    const npc: NPCState = { id: this.nextId++, k, x, z, yaw: roadYaw(R.z + 480), speed: 60, c: 0, w: 0 };
    if (k === 'cop') this.copHp = 3;
    this.s.npcs.push(npc);
    return npc;
  }

  private stepCop(dt: number) {
    const s = this.s, cop = s.cop, rv = s.rv;
    let car = this.chaser('cop');
    this.ramCd = Math.max(0, this.ramCd - dt);
    if (cop.phase === 0) {
      // a cruiser wrecked by a rock lingers a while, then gets towed
      if (car) { if ((this.wreckT += dt) > 14) { this.removeNpc(car.id); this.wreckT = 0; } return; }
      if (s.heat > 0) {
        this.copDelay -= dt;
        if (this.copDelay <= 0) {
          car = this.spawnChaser('cop'); cop.phase = 1; cop.t = 0; cop.fled = false;
          this.h.toast('🚔 Sirens behind you — Sheriff Roscoe wants a word. Pull over (stop) to take the ticket.');
        }
      } else this.copDelay = 25;
      return;
    }
    if (!car) { cop.phase = 0; return; }
    cop.t += dt;
    const dist = Math.hypot(car.x - rv.x, car.z - rv.z);

    if (cop.phase === 1 || cop.phase === 2) {
      const [tx, tz] = this.behindRV(12);
      this.drive(car, tx, tz, 100, dt, 1);
      if (dist < 25) cop.phase = 2;
      this.stoppedT = Math.abs(rv.speed) < 0.6 && dist < 30 ? this.stoppedT + dt : 0;
      if (this.stoppedT > 2) {
        cop.phase = 3; cop.t = 0;
        this.h.toast('🤠 ROSCOE: "License, registration, and… is that a debit card?" Hand him the card at the driver window.');
      }
      // only rams if you drove off on him mid-ticket
      if (cop.fled && cop.phase === 2 && this.ramCd <= 0 && dist < 9) {
        this.ramCd = 12; this.ram(car, 0.5);
        this.h.toast('🚔 Roscoe bumps the RV! "PULL. OVER."');
      }
      if (cop.t > 40 && cop.phase === 2 && Math.random() < dt / 45) { s.heat += 1; this.h.toast('🚔 Roscoe radios for backup… (+1 heat)'); }
    } else if (cop.phase === 3) {
      const [tx, tz] = this.behindRV(10);
      this.drive(car, tx, tz, 8, dt, 0.5);
      if (Math.abs(rv.speed) > 3) {
        cop.phase = 2; cop.fled = true; s.heat += 2;
        this.h.toast('🚨 You drove off on Roscoe! (+2 heat) He is NOT happy.');
      }
    } else if (cop.phase === 4) {
      const [tx, tz] = this.behindRV(-400, -LANES[0]);
      this.drive(car, tx, tz, 60, dt);
      if (cop.t > 20 || dist > 350) { this.s.npcs = this.s.npcs.filter((n) => n !== car); cop.phase = 0; this.copDelay = 30; }
    }
  }

  /** Is there a cruiser that a thrown rock could hit? */
  hittableCop() {
    const car = this.chaser('cop');
    return car && car.w <= 0 && (this.s.cop.phase === 1 || this.s.cop.phase === 2) ? car : null;
  }

  /** A rock smashes into Roscoe's cruiser. Returns true when that finishes it. */
  hitCop(): boolean {
    const car = this.chaser('cop'), s = this.s;
    if (!car) return false;
    this.copHp--; car.speed *= 0.85;
    this.h.sfx('crunch', [car.x, 1, car.z]);
    if (this.copHp > 0) {
      this.h.toast(`🪨 DIRECT HIT on Roscoe's cruiser! (${this.copHp} more)`);
      return false;
    }
    car.w = 14; car.speed = 0;
    s.cop.phase = 0; s.cop.fled = false; s.heat = 0; this.copDelay = 45; this.wreckT = 0;
    this.h.sfx('bang', [car.x, 1, car.z]);
    this.h.toast('💥 The windshield caves in! Roscoe\'s cruiser spins into the ditch. Chase over — heat cleared.');
    return true;
  }

  /** Paying Roscoe at the window. */
  payTicket(from: number) {
    const s = this.s;
    if (s.cop.phase !== 3) return;
    if (this.h.held(from)?.k !== 'card') { this.h.toast('🤠 ROSCOE: "The card, son. The debit card."'); return; }
    const fine = 50 + 25 * Math.max(0, s.heat - 1) + (s.cop.fled ? 50 : 0);
    if (!this.h.charge(from, fine, 'Ticket from Sheriff Roscoe')) return;
    this.h.toast(`🧾 Paid a $${fine} ticket. ROSCOE: "Drive safe now. Congratulations on the wedding."`);
    s.heat = 0; s.cop.phase = 4; s.cop.t = 0; s.cop.fled = false;
  }

  private stepShark(dt: number) {
    const s = this.s, rv = s.rv;
    let car = this.chaser('shark');
    this.bullhornCd = Math.max(0, this.bullhornCd - dt);
    if (!s.shark.on) {
      if (s.money < 0) {
        this.sharkDelay -= dt;
        if (this.sharkDelay <= 0) {
          s.shark.on = true; s.shark.t = 8; car = this.spawnChaser('shark');
          this.h.toast('🦈 A matte-black muscle car is gaining on you. "YOU OWE US MONEY!"');
        }
      } else this.sharkDelay = 12;
      return;
    }
    if (!car) { s.shark.on = false; return; }
    if (s.money >= 0) {
      const [tx, tz] = this.behindRV(500, -6);
      this.drive(car, tx, tz, 95, dt);
      if (Math.hypot(car.x - rv.x, car.z - rv.z) > 300) {
        this.s.npcs = this.s.npcs.filter((n) => n !== car); s.shark.on = false; this.sharkDelay = 12;
        this.h.toast('🦈 The Loan Shark backs off. For now.');
      }
      return;
    }
    s.shark.t -= dt;
    const dist = Math.hypot(car.x - rv.x, car.z - rv.z);
    const attacking = s.shark.t <= 0;
    const [tx, tz] = this.behindRV(attacking ? 4 : 16, attacking ? (Math.random() < 0.5 ? -0.8 : 0.8) : 0);
    this.drive(car, tx, tz, 98, dt, attacking ? 0 : 1);
    if (attacking && dist < 7.2) {
      this.ram(car, 0.8);
      s.shark.t = 9 + Math.random() * 5;
      const lines = ['"WHERE\'S MY MONEY?!"', '"NICE RV. SHAME IF SOMETHING HAPPENED TO IT."', '"INTEREST IS COMPOUNDING, PAL!"', '"PAY UP!"'];
      this.h.toast(`🦈 BAM! ${lines[Math.floor(Math.random() * lines.length)]}`);
    } else if (this.bullhornCd <= 0 && dist < 40) {
      this.bullhornCd = 15; this.h.sfx('bullhorn');
    }
  }

  /** A chaser smacks the RV from behind: speed kick, small yaw kick, jolt, a little damage. */
  private ram(car: NPCState, mag: number) {
    const rv = this.s.rv;
    rv.speed += 2.5 * mag;
    rv.yaw += (Math.random() < 0.5 ? -1 : 1) * 0.07 * mag;
    rv.integrity = Math.max(0, rv.integrity - 2 * mag);
    car.speed *= 0.4;
    this.h.sfx('crunch');
    this.h.joltAll(mag);
  }

  // ---------- RV vs traffic collisions ----------
  private collide() {
    const rv = this.s.rv;
    const midZ = (RV.noseZ + RV.zRear) / 2, hl = (RV.zRear - RV.noseZ) / 2;
    const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
    const cx = rv.x + midZ * sn, cz = rv.z + midZ * c;
    for (const n of this.s.npcs) {
      if (n.k === 'cop' || n.k === 'shark' || n.w > 0) continue;
      if (Math.abs(n.x - rv.x) > 12 || Math.abs(n.z - rv.z) > 12) continue;
      const [hw, nhl] = NPC_DIMS[n.k];
      if (!obbObb(cx, cz, rv.yaw, RV.halfW, hl, n.x, n.z, n.yaw, hw, nhl)) continue;
      const nvx = -Math.sin(n.yaw) * n.speed, nvz = -Math.cos(n.yaw) * n.speed;
      const rvx = -sn * rv.speed, rvz = -c * rv.speed;
      const rel = Math.hypot(nvx - rvx, nvz - rvz);
      const mag = Math.min(1.3, rel / 18);
      rv.speed *= rel > 20 ? 0.35 : 0.75;
      // the RV is a big steel box: crashes hurt, but one crash never totals it
      rv.integrity = Math.max(0, rv.integrity - Math.min(14, rel * 0.35));
      n.w = 8; n.speed *= 0.3;
      this.h.sfx('crunch'); this.h.sfx('bang');
      this.h.joltAll(mag);
      const headOn = Math.cos(n.yaw - rv.yaw) < -0.5;
      this.h.toast(headOn && rel > 15 ? `💥 HEAD-ON at ${Math.round(rel * MPH)} mph closing speed!` : rel > 15 ? '💥 SMASH!' : '💥 Fender bender!');
    }
  }
}
