// Host-only highway chaos: NPC traffic, radar traps, Sheriff Roscoe and the Loan Shark.
import { CFG, RV } from '../config';
import { obbObb } from '../stops/geom';
import type { NPCState, SharedState } from '../types';
import { LANE_OFFSET, SPEED_LIMIT, radarsNear, roadDX, roadPoint, roadX, roadYaw } from '../world/World';

export const NPC_DIMS: Record<NPCState['k'], [number, number]> = { // half width, half length
  sedan: [0.9, 2.2], pickup: [1.0, 2.5], camper: [1.15, 3.0], cop: [0.95, 2.4], shark: [0.95, 2.3],
};

export interface TrafficHost {
  s: SharedState;
  toast(text: string): void;
  sfx(name: string): void;
  joltAll(mag: number): void;
  charge(from: number, amount: number, what: string): boolean;
  held(id: number): { k: string } | undefined;
}

/** Road-following data for traffic cars (host only). */
interface Lane { dir: 1 | -1; off: number; targetOff: number; cruise: number; passing: boolean }

const MPH = CFG.MPH;
const TRAFFIC_COUNT = { same: 4, oncoming: 3 };

export class TrafficSim {
  private nextId = 1;
  private lanes = new Map<number, Lane>();
  private radarsHit = new Set<number>();
  private copDelay = 25;
  private stoppedT = 0;
  private ramCd = 0;
  private sharkDelay = 12;
  private bullhornCd = 0;

  constructor(private h: TrafficHost) {}

  private get s() { return this.h.s; }

  /** RV position in road coordinates: distance along (z) and lateral offset. */
  private rvRoad() {
    const rv = this.s.rv;
    const len = Math.hypot(1, roadDX(rv.z));
    return { z: rv.z, off: (rv.x - roadX(rv.z)) * len };
  }

  private spawnTraffic(dir: 1 | -1, z: number, speed: number) {
    const kinds: NPCState['k'][] = ['sedan', 'sedan', 'pickup', 'camper'];
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const off = dir === 1 ? LANE_OFFSET : -LANE_OFFSET;
    const [x, zz] = roadPoint(z, off);
    const npc: NPCState = { id: this.nextId++, k, x, z: zz, yaw: roadYaw(z) + (dir === 1 ? 0 : Math.PI), speed, c: Math.floor(Math.random() * 6), w: 0 };
    this.s.npcs.push(npc);
    this.lanes.set(npc.id, { dir, off, targetOff: off, cruise: speed, passing: false });
  }

  private removeNpc(id: number) {
    this.s.npcs = this.s.npcs.filter((n) => n.id !== id);
    this.lanes.delete(id);
  }

  step(dt: number) {
    const s = this.s, rv = s.rv;
    const R = this.rvRoad();

    // ---------- keep traffic around the RV ----------
    const traffic = s.npcs.filter((n) => this.lanes.has(n.id));
    const same = traffic.filter((n) => this.lanes.get(n.id)!.dir === 1).length;
    const onc = traffic.length - same;
    if (same < TRAFFIC_COUNT.same) {
      // mostly slower cars ahead (to overtake), sometimes a speeder from behind
      if (Math.random() < 0.7) this.spawnTraffic(1, R.z - 350 - Math.random() * 350, 18 + Math.random() * 8);
      else this.spawnTraffic(1, R.z + 250 + Math.random() * 150, 30 + Math.random() * 5);
    }
    if (onc < TRAFFIC_COUNT.oncoming) this.spawnTraffic(-1, R.z - 400 - Math.random() * 400, 22 + Math.random() * 9);

    for (const n of traffic) {
      const L = this.lanes.get(n.id);
      if (!L) continue;
      if (Math.abs(n.z - R.z) > 900) { this.removeNpc(n.id); continue; }
      if (n.w > 0) { n.w -= dt; n.speed = Math.max(0, n.speed - 12 * dt); if (n.w <= 0) this.removeNpc(n.id); continue; }

      // leader in my lane (traffic or the RV), measured along the road
      let gap = Infinity, leaderSpeed = 0;
      const ahead = (z: number) => (L.dir === 1 ? n.z - z : z - n.z);
      for (const o of traffic) {
        if (o === n) continue;
        const lo = this.lanes.get(o.id);
        if (!lo || Math.abs(lo.off - L.off) > 1.6) continue;
        const g = ahead(o.z);
        if (g > 0 && g < gap) { gap = g; leaderSpeed = lo.dir === L.dir ? o.speed : -o.speed; }
      }
      if (Math.abs(R.off - L.off) < 2.2) {
        const g = ahead(R.z);
        if (g > 0 && g < gap) { gap = g; leaderSpeed = L.dir === 1 ? rv.speed : -rv.speed; }
      }

      // overtake slow leaders when the oncoming lane is clear
      if (L.dir === 1 && !L.passing && gap < 70 && leaderSpeed < L.cruise - 3) {
        const clear = !traffic.some((o) => this.lanes.get(o.id)?.dir === -1 && o.z < n.z && n.z - o.z < 220)
          && !(R.off < 0 && R.z < n.z && n.z - R.z < 220);
        if (clear) { L.passing = true; L.targetOff = -LANE_OFFSET; }
      }
      if (L.passing && gap > 40) {
        // back into the right lane once past
        const behindAll = traffic.every((o) => o === n || (this.lanes.get(o.id)?.off ?? -1) < 0 || ahead(o.z) > 12 || ahead(o.z) < -12);
        if (behindAll && !(Math.abs(R.off - LANE_OFFSET) < 2 && Math.abs(ahead(R.z)) < 14)) { L.passing = false; L.targetOff = LANE_OFFSET; }
      }
      // oncoming cars swerve to the shoulder if the RV is in their lane
      if (L.dir === -1) {
        const g = ahead(R.z);
        L.targetOff = g > 0 && g < 80 && R.off < 0 ? -LANE_OFFSET - 2.4 : -LANE_OFFSET;
        if (g > 0 && g < 60 && R.off < 0 && Math.random() < dt * 2) this.h.sfx('honk');
      }

      // speed: cruise, follow, brake
      let target = L.passing ? L.cruise + 4 : L.cruise;
      // never faster than we can stop within the gap (keep 9 m), relative to the leader
      if (gap < 150) target = Math.min(target, Math.max(0, leaderSpeed) + Math.sqrt(2 * 5 * Math.max(0, gap - 9)));
      if (gap < 9) target = 0;
      const acc = target > n.speed ? 2.5 : 7;
      n.speed += Math.sign(target - n.speed) * Math.min(Math.abs(target - n.speed), acc * dt);
      L.off += Math.sign(L.targetOff - L.off) * Math.min(Math.abs(L.targetOff - L.off), 3.2 * dt);

      // advance along the road
      const dz = n.speed * dt * (L.dir === 1 ? -1 : 1) / Math.hypot(1, roadDX(n.z));
      const nz = n.z + dz;
      const [x, z] = roadPoint(nz, L.off);
      n.x = x; n.z = z; n.yaw = roadYaw(nz) + (L.dir === 1 ? 0 : Math.PI);
    }

    // ---------- radar traps ----------
    for (const r of radarsNear(rv.z)) {
      if (this.radarsHit.has(r.id)) continue;
      if (rv.z < r.z + 1 && rv.z > r.z - 30) {
        this.radarsHit.add(r.id);
        const mph = Math.abs(rv.speed) * MPH;
        if (mph > SPEED_LIMIT + 5) {
          s.heat += 1; this.h.sfx('camera');
          this.h.toast(`📸 RADAR: ${Math.round(mph)} in a ${SPEED_LIMIT}! (+1 heat)`);
        }
      }
    }

    this.stepCop(dt);
    this.stepShark(dt);
    this.collide();
  }

  // ---------- chasers ----------
  private chaser(k: 'cop' | 'shark') { return this.s.npcs.find((n) => n.k === k); }

  /** Steer a chaser toward a world point at up to vmax. */
  private drive(n: NPCState, tx: number, tz: number, vmax: number, dt: number, stopAt = 0) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz); // yaw facing the target (forward = −Z)
    let dy = want - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    n.yaw += Math.max(-1.8 * dt, Math.min(1.8 * dt, dy));
    const target = d < stopAt ? 0 : Math.min(vmax, Math.max(0, (d - stopAt) * 0.9 + Math.abs(this.s.rv.speed)));
    n.speed += Math.sign(target - n.speed) * Math.min(Math.abs(target - n.speed), 9 * dt);
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
    const [x, z] = this.behindRV(260, LANE_OFFSET * 0);
    const npc: NPCState = { id: this.nextId++, k, x, z, yaw: this.s.rv.yaw, speed: 30, c: 0, w: 0 };
    this.s.npcs.push(npc);
    return npc;
  }

  private stepCop(dt: number) {
    const s = this.s, cop = s.cop, rv = s.rv;
    let car = this.chaser('cop');
    this.ramCd = Math.max(0, this.ramCd - dt);
    if (cop.phase === 0) {
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
      const [tx, tz] = this.behindRV(11);
      this.drive(car, tx, tz, 46, dt, 1);
      if (dist < 25) cop.phase = 2;
      // pulled over?
      this.stoppedT = Math.abs(rv.speed) < 0.6 && dist < 30 ? this.stoppedT + dt : 0;
      if (this.stoppedT > 2) {
        cop.phase = 3; cop.t = 0;
        this.h.toast('🤠 ROSCOE: "License, registration, and… is that a debit card?" Hand him the card at the driver window.');
      }
      // fleeing / heavy heat → rams
      if ((cop.fled || s.heat >= 3) && cop.phase === 2 && this.ramCd <= 0 && dist < 9) {
        this.ramCd = 9; this.ram(car, 0.7);
        this.h.toast('🚔 Roscoe rams the RV! "PULL. OVER."');
      }
      if (cop.t > 25 && cop.phase === 2 && Math.random() < dt / 30) { s.heat += 1; this.h.toast('🚔 Roscoe radios for backup… (+1 heat)'); }
    } else if (cop.phase === 3) {
      // parked behind, Roscoe at the window
      const [tx, tz] = this.behindRV(10);
      this.drive(car, tx, tz, 8, dt, 0.5);
      if (Math.abs(rv.speed) > 3) {
        cop.phase = 2; cop.fled = true; s.heat += 2;
        this.h.toast('🚨 You drove off on Roscoe! (+2 heat) He is NOT happy.');
      }
    } else if (cop.phase === 4) {
      // drive off ahead and vanish
      const [tx, tz] = this.behindRV(-400, -LANE_OFFSET);
      this.drive(car, tx, tz, 40, dt);
      if (cop.t > 20 || dist > 350) { this.s.npcs = this.s.npcs.filter((n) => n !== car); cop.phase = 0; this.copDelay = 30; }
    }
  }

  /** Paying Roscoe at the window. */
  payTicket(from: number) {
    const s = this.s;
    if (s.cop.phase !== 3) return;
    if (this.h.held(from)?.k !== 'card') { this.h.toast('🤠 ROSCOE: "The card, son. The debit card."'); return; }
    const fine = 50 + 25 * Math.max(0, s.heat - 1) + (s.cop.fled ? 50 : 0);
    if (!this.h.charge(from, fine, `Ticket from Sheriff Roscoe`)) return;
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
      // paid back: peel off
      const [tx, tz] = this.behindRV(500, -6);
      this.drive(car, tx, tz, 45, dt);
      if (Math.hypot(car.x - rv.x, car.z - rv.z) > 300) {
        this.s.npcs = this.s.npcs.filter((n) => n !== car); s.shark.on = false; this.sharkDelay = 12;
        this.h.toast('🦈 The Loan Shark backs off. For now.');
      }
      return;
    }
    // rams every 8–12 s: close in, hit, fall back
    s.shark.t -= dt;
    const dist = Math.hypot(car.x - rv.x, car.z - rv.z);
    const attacking = s.shark.t <= 0;
    const [tx, tz] = this.behindRV(attacking ? 4 : 16, attacking ? (Math.random() < 0.5 ? -0.8 : 0.8) : 0);
    this.drive(car, tx, tz, 50, dt, attacking ? 0 : 1);
    if (attacking && dist < 7.2) {
      this.ram(car, 1.0);
      s.shark.t = 8 + Math.random() * 4;
      const lines = ['"WHERE\'S MY MONEY?!"', '"NICE RV. SHAME IF SOMETHING HAPPENED TO IT."', '"INTEREST IS COMPOUNDING, PAL!"', '"PAY UP!"'];
      this.h.toast(`🦈 BAM! ${lines[Math.floor(Math.random() * lines.length)]}`);
    } else if (this.bullhornCd <= 0 && dist < 40) {
      this.bullhornCd = 15; this.h.sfx('bullhorn');
    }
  }

  /** A chaser smacks the RV from behind: speed kick, yaw kick, jolt, damage. */
  private ram(car: NPCState, mag: number) {
    const rv = this.s.rv;
    rv.speed += 3 * mag;
    rv.yaw += (Math.random() < 0.5 ? -1 : 1) * 0.12 * mag;
    rv.integrity = Math.max(0, rv.integrity - 4 * mag);
    car.speed *= 0.4;
    this.h.sfx('bang');
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
      // closing speed along the RV's heading
      const nvx = -Math.sin(n.yaw) * n.speed, nvz = -Math.cos(n.yaw) * n.speed;
      const rvx = -sn * rv.speed, rvz = -c * rv.speed;
      const rel = Math.hypot(nvx - rvx, nvz - rvz);
      const mag = Math.min(1.5, rel / 15);
      rv.speed *= rel > 20 ? 0.2 : 0.6;
      rv.integrity = Math.max(0, rv.integrity - rel * 0.8);
      n.w = 6; n.speed *= 0.3;
      this.h.sfx('bang');
      this.h.joltAll(mag);
      const headOn = Math.cos(n.yaw - rv.yaw) < -0.5;
      this.h.toast(headOn && rel > 15 ? `💥 HEAD-ON at ${Math.round(rel * MPH)} mph closing speed!` : rel > 15 ? '💥 SMASH!' : '💥 Fender bender!');
    }
  }
}
