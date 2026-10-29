// Host-only highway chaos: four-lane NPC traffic, radar traps, Sheriff Roscoe and the Loan Shark.
import { CFG, CHASE, RV } from '../config';
import { bonk, inRV, stepChase, type ChaseHost } from '../stops/chase';
import { obbMtv } from '../stops/geom';
import type { NPCState } from '../types';
import { KINDS } from '../items/Items';
import { LANES, ROAD_HALF, SPEED_LIMIT, radarsNear, noLimitAt, roadDX, roadPoint, roadX, roadYaw } from '../world/World';

export const NPC_DIMS: Record<NPCState['k'], [number, number]> = { // half width, half length
  sedan: [0.9, 2.2], pickup: [1.0, 2.5], camper: [1.15, 3.0], cop: [0.95, 2.4], shark: [0.95, 2.3], semi: [1.25, 4.6], bandit: [1.0, 2.5],
};

export interface TrafficHost extends ChaseHost {
  joltAll(mag: number): void;
  hurtStanding(mag: number): void;
  log(from: number, what: string): void;
  name(id: number): string;
  charge(from: number, amount: number, what: string): boolean;
  held(id: number): { id: number; k: string } | undefined;
}

/** Something on the road traffic must brake for / steer around (cows, cones, a closed crossing). Road coordinates. */
export interface Obstacle { z: number; off: number; hw: number; hl: number }

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
  private sharkHp = 4;
  private noLimit = false;
  private wreckT = 0;
  private giggleT = 0;
  /** seconds the active chaser has been left far behind (outrunning) */
  private escape = new Map<number, { age: number; lose: number; warned: boolean }>();
  private rollV = new Map<number, number>(); // wreck id → barrel-roll rate (rad/s)
  private crashAt = new Map<number, number>();
  private prevZ: number | null = null;
  private prevSp = 0;

  /** Static road obstacles from the encounter director (cows, cones, flaggers, crossing gates). */
  obstacles: () => Obstacle[] = () => [];
  private obs: Obstacle[] = [];

  constructor(private h: TrafficHost) {}

  /** Bring Roscoe in sooner (an escaped convict in the RV, …). Needs heat > 0 to actually spawn him. */
  summonCop(delay: number) { this.copDelay = Math.min(this.copDelay, delay); }

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
    for (const o of this.obs) {
      if (Math.abs(o.off - off) > hw + o.hw + 0.3) continue;
      const a = along(o.z);
      if (a > -back - o.hl && a < front + o.hl) return false;
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
    this.lanes.delete(id); this.rollV.delete(id); this.crashAt.delete(id); this.escape.delete(id);
  }

  private time = 0;

  step(dt: number) {
    const s = this.s, rv = s.rv;
    this.time += dt;
    const R = this.rvRoad();
    this.obs = this.obstacles();

    // ---------- keep traffic around the RV ----------
    let same = 0, onc = 0;
    for (const n of s.npcs) { const L = this.lanes.get(n.id); if (L) { if (L.dir === 1) same++; else onc++; } }
    if (same < COUNT.same) this.spawnTraffic(1);
    if (onc < COUNT.oncoming) this.spawnTraffic(-1);

    for (const n of [...s.npcs]) {
      const L = this.lanes.get(n.id);
      // crashed: a free body until it stops (bandit trucks are stepped by stepBandits)
      if (n.vx !== undefined && n.k !== 'bandit') {
        if (!this.stepWreck(n, L, dt)) this.removeNpc(n.id);
        continue;
      }
      if (!L) continue;
      if (Math.abs(n.z - R.z) > 2000) { this.removeNpc(n.id); continue; }
      const [hw] = NPC_DIMS[n.k];
      L.changeCd = Math.max(0, L.changeCd - dt);

      // wrecked (shot): limp onto the shoulder, then disappear
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
      for (const o of this.obs) {
        if (overlaps(o.off, hw + o.hw + 0.3)) consider(this.ahead(n, L.dir, o.z) - NPC_DIMS[n.k][1] - o.hl, 0);
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
    const free = noLimitAt(rv.z);
    if (free !== this.noLimit) { this.noLimit = free; this.h.toast(free ? '☠️ SPEED UNTIL YOU DIE — no cameras for 3 km. FLOOR IT!' : '📷 Cameras are watching again.'); }
    // fire on crossing the gantry line between two frames, so no frame rate or substep can skip it
    const prevZ = this.prevZ ?? rv.z, prevSp = this.prevSp;
    this.prevZ = rv.z; this.prevSp = Math.abs(rv.speed);
    for (const r of radarsNear(rv.z)) {
      if (this.radarsHit.has(r.id)) continue;
      if (prevZ > r.z && rv.z <= r.z && prevZ - rv.z < 60) {
        this.radarsHit.add(r.id);
        const mph = Math.max(prevSp, Math.abs(rv.speed)) * MPH;
        if (mph > SPEED_LIMIT + 7) {
          s.heat += 1; this.h.sfx('camera');
          this.h.toast(`📸 RADAR: ${Math.round(mph)} in a ${SPEED_LIMIT}! (+1 heat)`);
        }
      }
    }

    this.stepCop(dt);
    this.stepShark(dt);
    this.stepBandits(dt);
    this.stepRancher(dt);
    this.collide();
    this.collideCouch();
  }

  // ---------- the rancher: you hit one of his cows ----------
  private rancher: { id: number; t: number; rams: number; cd: number; leave: boolean; dead: number } | null = null;

  spawnRancher() {
    if (this.rancher) return;
    const R = this.rvRoad();
    const [x, z] = roadPoint(R.z + 260, LANES[1]);
    const n: NPCState = { id: this.nextId++, k: 'pickup', x, z, yaw: roadYaw(R.z + 260), speed: Math.abs(this.s.rv.speed) + 15, c: 3, w: 0 };
    this.s.npcs.push(n);
    this.rancher = { id: n.id, t: 0, rams: 0, cd: 5, leave: false, dead: 0 };
    this.h.sfx('honk');
    this.h.toast('🤠 A furious rancher in a green pickup is coming for you. "THAT WAS BESSIE!"');
  }

  private stepRancher(dt: number) {
    const r = this.rancher; if (!r) return;
    const car = this.s.npcs.find((n) => n.id === r.id);
    if (!car) { this.rancher = null; return; }
    if (car.w > 0) {
      // shot or wrecked: it rolls to a stop and gets towed
      car.speed = Math.max(0, car.speed - 8 * dt);
      car.x += -Math.sin(car.yaw) * car.speed * dt; car.z += -Math.cos(car.yaw) * car.speed * dt;
      if ((r.dead += dt) > 12) { this.removeNpc(car.id); this.rancher = null; }
      return;
    }
    r.t += dt; r.cd -= dt;
    const rv = this.s.rv, dist = Math.hypot(car.x - rv.x, car.z - rv.z);
    if (!r.leave && (r.t > 60 || r.rams >= 3)) {
      r.leave = true; r.t = 0;
      this.h.toast('🤠 The rancher spits, shakes his fist and turns back for his herd.');
    }
    if (r.leave) {
      const [tx, tz] = this.behindRV(500, -LANES[0]);
      this.drive(car, tx, tz, 50, dt);
      if (dist > 350 || r.t > 30) { this.removeNpc(car.id); this.rancher = null; }
      return;
    }
    const attacking = r.cd <= 0;
    const [tx, tz] = this.behindRV(attacking ? 4 : 14, attacking ? (r.rams % 2 ? -0.8 : 0.8) : 0);
    this.drive(car, tx, tz, 95, dt, attacking ? 0 : 1);
    if (attacking && dist < 7.2) {
      this.ram(car, 0.6); r.rams++; r.cd = 7 + Math.random() * 4;
      const lines = ['"YOU OWE ME A COW!"', '"BESSIE HAD A FAMILY!"', '"GET OFF MY ROAD, CITY FOLK!"'];
      this.h.toast(`🤠 WHAM! ${lines[Math.floor(Math.random() * lines.length)]}`);
    }
  }

  // ---------- Devil's Canyon bandits ----------
  private banditRolled = false;
  private banditAt: number | null = null; // road z where the ambush starts
  private banditIds: number[] = [];
  private banditHp = new Map<number, number>();
  private blockS = 0;

  /** Once per canyon run, 50%: decide whether (and where) the bandits strike. */
  rollBandits(force?: boolean) {
    this.banditRolled = true;
    if (!(force ?? Math.random() < 0.5)) return;
    const M = 1 / CFG.MILES_PER_METER;
    this.banditAt = force ? this.s.rv.z - 50 : -(260 + Math.random() * 60) * M; // between the junkyard and the next fork
  }

  private stepBandits(dt: number) {
    const s = this.s, b = s.bandits, rv = s.rv;
    if (!this.banditRolled && s.route[0] === 1) this.rollBandits();
    const trucks = this.banditIds.map((id) => s.npcs.find((n) => n.id === id)).filter((n): n is NPCState => !!n);
    // wrecked trucks tumble like any other wreck
    for (const n of trucks) if (n.vx !== undefined && !this.stepWreck(n, undefined, dt)) this.removeNpc(n.id);
    const alive = trucks.filter((n) => n.w <= 0);
    b.t += dt;

    if (b.phase === 0) {
      if (this.banditAt === null || rv.z > this.banditAt + 300) return;
      this.banditAt = null;
      // two rusty pickups come screaming up from behind
      const R = this.rvRoad();
      this.banditIds = [-1, 1].map((side, i) => {
        const [x, z] = roadPoint(R.z + 140 + i * 25, side < 0 ? LANES[0] : -LANES[0]);
        const n: NPCState = { id: this.nextId++, k: 'bandit', x, z, yaw: roadYaw(R.z), speed: Math.abs(rv.speed) + 20, c: 0, w: 0 };
        s.npcs.push(n); this.banditHp.set(n.id, 2);
        return n.id;
      });
      b.phase = 1; b.t = 0; b.near = 0; b.fed = false; b.couch = null;
      this.h.sfx('yell');
      this.h.toast('🤠 YEEHAW! Two rusty pickups full of bandits roar past — CANYON BANDITS! They\'re setting up a roadblock!');
      return;
    }
    if (b.phase === 1) {
      // overtake and get far enough ahead that the RV can still stop (or choose not to)
      const sp = Math.abs(rv.speed), D = Math.max(90, Math.min(550, (sp * sp) / 14 + 70));
      let ready = true;
      alive.forEach((n, i) => {
        const [tx, tz] = this.behindRV(-(D + 10), i ? 3 : -3);
        this.drive(n, tx, tz, sp + 30, dt, 2);
        if (rv.z - n.z < D * 0.8) ready = false;
      });
      if (!alive.length) return this.endBandits('💥 The bandit trucks are scrap. The canyon is safe(ish).');
      if (ready || b.t > 40) { b.phase = 2; b.t = 0; this.blockS = this.rvRoad().z - D; }
      return;
    }
    if (b.phase === 2) {
      // park sideways across the RV's lanes, drag the couch out between them
      const yaw = roadYaw(this.blockS) + Math.PI / 2;
      alive.forEach((n, i) => {
        const [tx, tz] = roadPoint(this.blockS - i * 0.5, i ? 8.2 : 3.2);
        const d = Math.hypot(tx - n.x, tz - n.z);
        if (d > 1.5) this.drive(n, tx, tz, 40, dt, 0.5);
        else { n.speed = Math.max(0, n.speed - 20 * dt); let dy = yaw - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * Math.min(1, dt * 3); }
      });
      if (!b.couch && b.t > 3) { const [cx, cz] = roadPoint(this.blockS + 1, -1.8); b.couch = [cx, cz, yaw]; }
      if (!alive.length) return this.endBandits('💥 You plowed through the roadblock! The bandits are eating dust (and airbag).');
      const [bx, bz] = roadPoint(this.blockS, 5.7);
      const dist = Math.hypot(rv.x - bx, rv.z - bz);
      if (rv.z < bz - 150) return this.endBandits('🤠 You squeezed past! The bandits shake their fists and argue about whose idea the couch was.');
      b.near = Math.abs(rv.speed) < 2 && dist < 30 ? b.near + dt : 0;
      if (b.near > 2) return this.rob();
      if (b.t > 40) return this.endBandits('🤠 The bandits get bored and leave. One of them forgot the couch.');
      return;
    }
    // phase 3: leaving
    for (const n of alive) {
      const [tx, tz] = this.behindRV(-600, n.id % 2 ? 6 : -6);
      this.drive(n, tx, tz, 70, dt);
    }
    if (b.t > 12) { this.banditIds.forEach((id) => this.removeNpc(id)); this.banditIds = []; b.phase = 0; b.couch = null; }
  }

  private endBandits(line: string) {
    const b = this.s.bandits;
    this.h.toast(line);
    b.phase = 3; b.t = 0;
  }

  /** Stopped at the roadblock: they take the money (half if you fed them) and the snacks. */
  private rob() {
    const s = this.s, b = s.bandits;
    const who = s.seats.driver >= 0 ? s.seats.driver : Number(Object.keys(s.crew)[0] ?? 0);
    const take = Math.max(0, b.fed ? s.money / 2 : s.money);
    if (take > 0) this.h.charge(who, Math.round(take * 100) / 100, 'Robbed by canyon bandits');
    for (const c of Object.values(s.crew)) c.hunger = Math.max(0, c.hunger - 15);
    this.h.sfx('yell');
    this.h.toast(take > 0
      ? `🤠 STICK 'EM UP! The bandits swipe the card for $${take.toFixed(0)}${b.fed ? ' (only half — they liked the burger)' : ''} and raid the snacks. "PLEASURE DOIN' BUSINESS!"`
      : '🤠 The bandits check the card… $0. They look at you with pity, take the snacks, and leave.');
    b.phase = 3; b.t = 0;
  }

  /** Toss food out the window at the roadblock: they'll only take half. */
  feedBandits(from: number) {
    const s = this.s, b = s.bandits, it = this.h.held(from);
    if (b.phase !== 2) return;
    const food = it && !!KINDS[it.k]?.food;
    if (!it || !food) { this.h.toast('🤠 "WHATCHA GOT FOR US, PARTNER?" (they look hungry)'); return; }
    if (b.fed) { this.h.toast('🤠 "We already ate, thanks. Now the CARD."'); return; }
    this.h.items.remove(it.id); b.fed = true; this.h.sfx('eat');
    this.h.log(from, `Fed a bandit a ${it.k}`);
    this.h.toast(it.k === 'burntburger' || it.k === 'rawburger'
      ? '🤠 The bandit eats it, turns green, and still agrees to only take half. Respect.'
      : '🤠 "AW SHUCKS, a burger!" The bandits huddle. They\'ll only take HALF.');
  }

  /** The couch: smash through it and it explodes into foam. */
  private collideCouch() {
    const s = this.s, c = s.bandits.couch, rv = s.rv;
    if (!c || Math.hypot(rv.x - c[0], rv.z - c[1]) > 3.4) return;
    s.bandits.couch = null;
    this.h.sfx('crunch'); this.h.joltAll(0.3);
    this.h.toast('🛋️ The couch explodes into a cloud of foam and old coins. Somebody\'s grandma is crying.');
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
    if (k === 'shark') this.sharkHp = 4;
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
        this.copDelay -= dt * (s.wanted >= 0 ? 2.5 : 1); // a fresh crime brings him running

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
      this.drive(car, tx, tz, CHASE.copV, dt, 1);
      if (this.outrun(car, dt, dist)) {
        this.s.npcs = this.s.npcs.filter((n) => n !== car);
        cop.phase = 0; cop.fled = false; s.heat = Math.max(0, s.heat - 1); this.copDelay = 75;
        this.h.toast(`🏁 You lost Roscoe! (−1 heat)${s.heat > 0 ? ' He\'ll be back…' : ''}`);
        return;
      }
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
        return;
      }
      // the thief isn't in the RV, or nobody's paying: he gets out with the taser
      const wp = s.wanted >= 0 ? this.h.handOf(s.wanted) : null;
      const runner = wp && !inRV(s, wp) ? s.wanted : -1;
      if (runner >= 0 || cop.t > 20) {
        const who = runner >= 0 ? runner : s.seats.driver >= 0 ? s.seats.driver : Number(Object.keys(s.crew)[0] ?? -1);
        if (who >= 0 && this.h.handOf(who)) {
          cop.phase = 5; cop.t = 0; cop.foot = { who, x: car.x, z: car.z, t: 0 };
          this.h.toast(`⚡ ROSCOE GETS OUT, TASER DRAWN: "${this.h.name(who).toUpperCase()}! ON THE GROUND!"`);
        }
      }
    } else if (cop.phase === 5) {
      car.speed = 0;
      const ft = cop.foot;
      if (!ft) { cop.phase = 3; return; }
      if (Math.abs(rv.speed) > 3) {
        cop.phase = 2; cop.fled = true; cop.foot = null; s.heat += 2;
        this.h.toast('🚨 You left Roscoe standing in the road! (+2 heat) He sprints back to the cruiser.');
        return;
      }
      const res = stepChase(this.h, ft, dt, 5.8, 4, [car.x, car.z]);
      if (res === 'hit') {
        bonk(this.h, ft.who, 5);
        const fine = 75 + 25 * Math.max(0, s.heat - 1) + (cop.fled ? 50 : 0) + this.duiFine();
        this.h.charge(ft.who, fine, 'Tased + fined by Sheriff Roscoe');
        this.h.toast(`⚡ ZZZT! Roscoe tased ${this.h.name(ft.who)}. $${fine} fine taken off the card, stolen goods seized.`);
        s.heat = 0; s.wanted = -1; cop.phase = 4; cop.t = 0; cop.fled = false; cop.foot = null;
      } else if (res === 'lost') {
        this.h.toast('🤠 Roscoe, out of breath, waddles back to the window. "I can wait all day."');
        cop.phase = 3; cop.t = 0; cop.foot = null; s.wanted = -1;
      }
    } else if (cop.phase === 4) {
      if (this.giggleT > 0) {
        // stoned Roscoe tails you at a respectful distance, giggling on the bullhorn
        this.giggleT -= dt;
        const [tx, tz] = this.behindRV(22);
        this.drive(car, tx, tz, CHASE.copV, dt, 1);
        if (Math.floor(this.giggleT / 5) !== Math.floor((this.giggleT + dt) / 5)) { this.h.sfx('giggle', [car.x, 1.5, car.z]); this.h.toast(['🚔 *bullhorn* "hehehe… your RV is… so BIG, man"', '🚔 *bullhorn* "do you guys have… any more burgers"', '🚔 *bullhorn* "I LOVE you guys"', '🚔 *bullhorn* "what if the road… is driving US"'][Math.floor(Math.random() * 4)]); }
        cop.t = 0;
        return;
      }
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

  /** A pistol round hits a car. Cops take three, mafia cars four, civilians wreck at once (and somebody saw). */
  shootCar(n: NPCState) {
    const s = this.s;
    this.h.sfx('crunch', [n.x, 1, n.z]);
    if (n.k === 'cop') { this.hitCop(); return; }
    if (n.k === 'shark') {
      if (--this.sharkHp > 0) return;
      n.w = 10; this.h.sfx('bang', [n.x, 1, n.z]);
      this.h.toast(s.mafia.on ? '💥 The mafia Cadillac blows its tires and rolls into the dunes!' : '💥 The Loan Shark\'s car is toast. He\'ll be back.');
      return;
    }
    if (n.k === 'bandit') {
      const hp = (this.banditHp.get(n.id) ?? 2) - 1; this.banditHp.set(n.id, hp);
      if (hp > 0) { this.h.toast('🔫 Hit a bandit truck! The guys in the back duck.'); return; }
      n.w = 10; n.speed = 0; this.h.sfx('bang', [n.x, 1, n.z]);
      this.h.toast('💥 A bandit truck coughs smoke and dies. Its crew runs off into the canyon.');
      return;
    }
    n.w = 10; n.speed *= 0.3; s.heat += 1;
    this.h.sfx('bang', [n.x, 1, n.z]);
    this.h.toast('🔫 You shot up a civilian car! Witnesses everywhere. (+1 heat)');
  }

  /** Driver had a few free casino drinks: Roscoe adds a DUI on top. */
  private duiFine() {
    const d = this.s.seats.driver;
    return d >= 0 && (this.s.crew[d]?.drunk ?? 0) > 0 ? 50 : 0;
  }

  /** Handing Roscoe something at the window: the card pays, food might work, the rest makes it worse. */
  payTicket(from: number) {
    const s = this.s;
    if (s.cop.phase !== 3) return;
    const held = this.h.held(from);
    if (!held) { this.h.toast('🤠 ROSCOE: "The card, son. The debit card." (or… something tasty)'); return; }
    if (held.k !== 'card') { this.bribe(from, held); return; }
    const dui = this.duiFine();
    const fine = 50 + 25 * Math.max(0, s.heat - 1) + (s.cop.fled ? 50 : 0) + dui;
    if (dui) this.h.toast('🤠 ROSCOE: "Is that… tequila I smell? That\'s a DUI, partner. +$50."');
    if (!this.h.charge(from, fine, 'Ticket from Sheriff Roscoe')) return;
    this.h.toast(`🧾 Paid a $${fine} ticket. ROSCOE: "Drive safe now. Congratulations on the wedding."`);
    s.heat = 0; s.wanted = -1; s.cop.phase = 4; s.cop.t = 0; s.cop.fled = false;
  }

  /** The bribe table. Cheeseburgers are legal tender in this county. */
  private bribe(from: number, it: { id: number; k: string }) {
    const s = this.s, cop = s.cop, who = this.h.name(from);
    const roscoe = this.chaser('cop');
    const at: [number, number, number] | undefined = roscoe ? [roscoe.x, 1.5, roscoe.z] : undefined;
    const take = () => { this.h.items.remove(it.id); this.h.sfx('eat', at); };
    const letGo = (line: string, heatLeft = 0) => {
      this.h.toast(line); this.h.log(from, `Bribed Roscoe with a ${it.k}`);
      s.heat = heatLeft; if (heatLeft === 0) s.wanted = -1;
      if (heatLeft === 0) { cop.phase = 4; cop.t = 0; cop.fled = false; }
    };
    const fail = (line: string) => { s.heat += 1; this.h.toast(`${line} (+1 heat)`); this.h.sfx('yell', at); };
    switch (it.k) {
      case 'cheeseburger':
        take();
        letGo(`🍔 Roscoe eats the cheeseburger in two bites. "Mmf. Didn't see a thing, ${who}. Drive safe." (heat cleared)`);
        break;
      case 'burger':
        take();
        if (s.heat <= 2 && Math.random() < 0.7) letGo('🍔 Roscoe chews thoughtfully. "No cheese? …Fine. Git." (heat cleared)');
        else this.h.toast('🍔 Roscoe eats it. "That was a nice burger. Now the CARD."');
        break;
      case 'coffee':
        take();
        if (s.heat <= 1 && Math.random() < 0.5) letGo('☕ "Black, just how I like my coffee and my justice." He waves you on. (heat cleared)');
        else this.h.toast('☕ He slurps it. "Thanks. Still need the card."');
        break;
      case 'burntburger': case 'rawburger': case 'patty':
        take();
        fail(it.k === 'burntburger' ? '🔥 Roscoe bites the burnt burger. CRUNCH. "Assaulting an officer with a hockey puck."' : '🤢 Roscoe gags. "Are you trying to POISON a lawman?"');
        break;
      case 'weed':
        // he gives it back. With a wink. And follows you for a while, giggling
        letGo('🌿 Roscoe sniffs it, hands it back with a wink. "I\'ll allow it." (−1 heat) …He seems to be following you now.', Math.max(0, s.heat - 1));
        cop.phase = 4; cop.t = 0; this.giggleT = 30;
        break;
      default:
        fail(`🤠 "Is this a ${it.k === 'rock' ? 'ROCK' : 'bribe'}, son?"`);
    }
  }

  private stepShark(dt: number) {
    const s = this.s, rv = s.rv;
    let car = this.chaser('shark');
    this.bullhornCd = Math.max(0, this.bullhornCd - dt);
    if (car && car.w > 0) {
      // a shot-up mafia car coasts to a stop and gets cleared
      car.w -= dt; car.speed = Math.max(0, car.speed - 12 * dt);
      car.x += -Math.sin(car.yaw) * car.speed * dt; car.z += -Math.cos(car.yaw) * car.speed * dt;
      if (car.w <= 0) { this.removeNpc(car.id); s.shark.on = false; this.sharkDelay = s.mafia.on ? 18 : 12; }
      return;
    }
    if (!s.shark.on) {
      if (s.money < 0 || s.mafia.on) {
        this.sharkDelay -= dt;
        if (this.sharkDelay <= 0) {
          s.shark.on = true; s.shark.t = 8; car = this.spawnChaser('shark');
          this.h.toast(s.mafia.on ? '🕴️ A black Cadillac closes in — the Bonetti crew. "DON CARLO SENDS HIS REGARDS!"' : '🦈 A matte-black muscle car is gaining on you. "YOU OWE US MONEY!"');
        }
      } else this.sharkDelay = 12;
      return;
    }
    if (!car) { s.shark.on = false; return; }
    if (s.money >= 0 && !s.mafia.on) {
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
    // the loan shark can be outrun (the mafia after 24:00 can't)
    if (!s.mafia.on && this.outrun(car, dt, dist)) {
      this.removeNpc(car.id); s.shark.on = false; this.sharkDelay = 60;
      this.h.toast('🏁 You smoked the Loan Shark! He\'ll find you again if the card stays negative.');
      return;
    }
    const attacking = s.shark.t <= 0;
    const [tx, tz] = this.behindRV(attacking ? 4 : 16, attacking ? (Math.random() < 0.5 ? -0.8 : 0.8) : 0);
    this.drive(car, tx, tz, CHASE.sharkV, dt, attacking ? 0 : 1);
    if (attacking && dist < 7.2) {
      this.ram(car, 0.8);
      s.shark.t = 9 + Math.random() * 5;
      const lines = ['"WHERE\'S MY MONEY?!"', '"NICE RV. SHAME IF SOMETHING HAPPENED TO IT."', '"INTEREST IS COMPOUNDING, PAL!"', '"PAY UP!"'];
      this.h.toast(`🦈 BAM! ${lines[Math.floor(Math.random() * lines.length)]}`);
    } else if (this.bullhornCd <= 0 && dist < 40) {
      this.bullhornCd = 15; this.h.sfx('bullhorn');
    }
  }

  /** Outrunning: true once the chaser has been left > loseDist behind for loseT s. */
  private outrun(car: NPCState, dt: number, dist: number) {
    let e = this.escape.get(car.id);
    if (!e) { e = { age: 0, lose: 0, warned: false }; this.escape.set(car.id, e); }
    e.age += dt;
    if (e.age < CHASE.grace || dist < CHASE.loseDist) { e.lose = 0; e.warned = false; return false; }
    e.lose += dt;
    if (!e.warned && e.lose > CHASE.loseT / 2) { e.warned = true; this.h.toast('🏁 You\'re losing them… keep it floored!'); }
    if (e.lose < CHASE.loseT) return false;
    this.escape.delete(car.id);
    return true;
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
  /**
   * Rigid-body-ish crash: push the boxes apart, trade momentum along the contact normal
   * (by mass, a little bounce), glancing hits twist the RV. The car becomes a free-spinning wreck.
   */
  private collide() {
    const s = this.s, rv = s.rv;
    const midZ = (RV.noseZ + RV.zRear) / 2, hl = (RV.zRear - RV.noseZ) / 2;
    for (const n of s.npcs) {
      if (Math.abs(n.x - rv.x) > 14 || Math.abs(n.z - rv.z) > 14) continue;
      const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
      const cx = rv.x + midZ * sn, cz = rv.z + midZ * c;
      const [hw, nhl] = NPC_DIMS[n.k];
      const hit = obbMtv(cx, cz, rv.yaw, RV.halfW, hl, n.x, n.z, n.yaw, hw, nhl);
      if (!hit) continue;
      const { nx, nz, depth } = hit; // normal points from the RV to the car
      const m1 = MASS.rv, m2 = MASS[n.k];
      // 1) separate (the lighter body moves more)
      const k1 = m2 / (m1 + m2), k2 = m1 / (m1 + m2);
      rv.x -= nx * depth * k1; rv.z -= nz * depth * k1;
      n.x += nx * depth * k2; n.z += nz * depth * k2;
      // 2) velocities
      const fx = -sn, fz = -c; // RV forward
      const v1x = fx * rv.speed, v1z = fz * rv.speed;
      const free = n.vx !== undefined;
      const v2x = free ? n.vx! : -Math.sin(n.yaw) * n.speed, v2z = free ? n.vz! : -Math.cos(n.yaw) * n.speed;
      const relN = (v2x - v1x) * nx + (v2z - v1z) * nz; // < 0 = closing
      if (relN >= -0.5) { this.syncLane(n); continue; } // resting contact, just separated
      const j = (-(1 + 0.3) * relN) / (1 / m1 + 1 / m2);
      const dv1 = j / m1, dv2 = j / m2;
      const n1x = v1x - nx * dv1, n1z = v1z - nz * dv1;
      // the RV keeps the part of its velocity along its heading (tires); the sideways part becomes a twist
      rv.speed = n1x * fx + n1z * fz;
      const along = (n.x - cx) * fx + (n.z - cz) * fz; // where along the RV it got hit (+ = front)
      const right = nx * c + nz * -sn;
      rv.yaw += Math.max(-0.3, Math.min(0.3, along * dv1 * right * 0.012));
      // 3) the car: free body from here on (chasers keep driving, just slower)
      const w2x = v2x + nx * dv2, w2z = v2z + nz * dv2;
      if (n.k === 'cop' || n.k === 'shark' || n.id === this.rancher?.id) n.speed = w2x * -Math.sin(n.yaw) + w2z * -Math.cos(n.yaw);
      else {
        n.vx = w2x; n.vz = w2z; n.speed = Math.hypot(w2x, w2z);
        n.spin = (n.spin ?? 0) + (Math.random() < 0.5 ? -1 : 1) * Math.min(6, dv2 * 0.25) + -along * dv2 * 0.02;
        n.w = Math.max(n.w, 8);
        if (dv2 > 22 && m2 < 3) this.rollV.set(n.id, (Math.random() < 0.5 ? -1 : 1) * (4 + dv2 * 0.12)); // light car, big hit: barrel roll
      }
      this.syncLane(n);
      // 4) consequences scale with how hard the RV itself got hit
      const now = this.time;
      if ((this.crashAt.get(n.id) ?? -9) > now - 0.4) continue;
      this.crashAt.set(n.id, now);
      if (dv1 < 0.6) continue;
      const mag = Math.min(1.5, dv1 / 9);
      rv.integrity = Math.max(0, rv.integrity - Math.min(18, dv1 * 1.3)); // the RV is a big steel box: one crash never totals it
      this.h.sfx('crunch'); if (dv1 > 4) this.h.sfx('bang');
      this.h.joltAll(mag);
      this.h.hurtStanding(mag);
      const closing = -relN;
      const headOn = Math.cos(n.yaw - rv.yaw) < -0.5;
      const lines = n.k === 'semi'
        ? ['💥 You hit a SEMI. The semi is fine. You are not.', '💥 18 wheels vs 4. Physics wins.']
        : this.rollV.has(n.id) ? ['💥 That sedan is doing a BARREL ROLL!', '💥 The car flips like a pancake!', '💥 SENT IT. The car is upside down now.']
        : headOn && closing > 15 ? [`💥 HEAD-ON at ${Math.round(closing * MPH)} mph closing speed!`]
        : closing > 15 ? ['💥 SMASH!', '💥 Punted it into the next county!'] : ['💥 Fender bender!', '💥 Bonk.'];
      this.h.toast(lines[Math.floor(Math.random() * lines.length)]);
    }
  }

  /** Free-body wrecks skid, spin, barrel-roll and come to rest; then get cleared. */
  private stepWreck(n: NPCState, L: Lane | undefined, dt: number): boolean {
    const sp = Math.hypot(n.vx!, n.vz!);
    const dec = Math.min(sp, 7 * dt); // tires sliding on asphalt
    if (sp > 0) { n.vx! -= (n.vx! / sp) * dec; n.vz! -= (n.vz! / sp) * dec; }
    n.x += n.vx! * dt; n.z += n.vz! * dt;
    n.yaw += (n.spin ?? 0) * dt;
    n.spin = (n.spin ?? 0) * Math.exp(-1.6 * dt);
    n.speed = Math.hypot(n.vx!, n.vz!);
    const rv = this.rollV.get(n.id);
    if (rv) {
      n.roll = (n.roll ?? 0) + rv * dt;
      const slow = rv * Math.exp(-0.9 * dt);
      // settle on its roof or its wheels once it stops tumbling
      if (Math.abs(slow) < 1.2) { this.rollV.delete(n.id); n.roll = Math.round((n.roll ?? 0) / Math.PI) * Math.PI; } else this.rollV.set(n.id, slow);
    }
    if (L) this.syncLane(n, L);
    if (n.speed < 0.3) n.w -= dt; // the clock only runs once it has stopped
    return n.w > 0;
  }

  /** Keep a pushed car's lane data honest so traffic sees where it really is. */
  private syncLane(n: NPCState, L = this.lanes.get(n.id)) {
    if (!L) return;
    L.s = n.z; L.off = (n.x - roadX(n.z)) * Math.hypot(1, roadDX(n.z)); L.latV = 0;
  }
}

/** Collision masses (tonnes-ish). The RV is a heavy box; a semi is a wall. */
const MASS: Record<NPCState['k'] | 'rv', number> = { rv: 5, sedan: 1.4, pickup: 2, bandit: 2, camper: 4, semi: 14, cop: 2, shark: 2 };
