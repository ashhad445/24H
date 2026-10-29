// Host-only Devil's Canyon rockfall: boulders tumble off the cliff tops ahead of the RV and land on the road.
import { RV } from '../config';
import type { Boulder, SharedState } from '../types';
import { branchAt } from './Route';
import { ROAD_HALF, roadPoint } from './World';

export interface CanyonHost {
  s: SharedState;
  toast(text: string): void;
  sfx(name: string, at?: [number, number, number]): void;
  joltAll(mag: number): void;
  hurtStanding(mag: number): void;
}

const G = 9.8;
const MASS = 8; // a boulder is heavier than the RV (5)

export class CanyonSim {
  private next = 12 + Math.random() * 10;
  private id = 1;

  constructor(private h: CanyonHost) {}

  step(dt: number) {
    const s = this.h.s, rv = s.rv;
    const canyon = !!branchAt(rv.z)?.canyon;
    if (canyon && Math.abs(rv.speed) > 3) {
      this.next -= dt;
      if (this.next <= 0) { this.next = 20 + Math.random() * 15; this.drop(); }
    }
    for (const b of s.boulders) this.move(b, dt);
    s.boulders = s.boulders.filter((b) => b.z < rv.z + 150 && b.broken < 8);
  }

  /** A boulder breaks off a cliff top 120–220 m ahead and falls toward a random spot on the road. */
  drop(ahead = 120 + Math.random() * 100, off = (Math.random() * 2 - 1) * (ROAD_HALF - 1.5)) {
    const s = this.h.s, rv = s.rv;
    const z = rv.z - ahead;
    const side = Math.random() < 0.5 ? -1 : 1;
    const [sx, sz] = roadPoint(z, side * (ROAD_HALF + 14));
    const [tx, tz] = roadPoint(z, off);
    const y = 26 + Math.random() * 10, r = 1.0 + Math.random() * 0.8;
    const tf = Math.sqrt((2 * (y - r)) / G);
    const b: Boulder = { id: this.id++, x: sx, y, z: sz, vx: (tx - sx) / tf, vy: 0, vz: (tz - sz) / tf, r, broken: 0 };
    s.boulders.push(b);
    this.h.sfx('rumble', [sx, y, sz]);
    this.h.toast(['🪨 ROCKFALL! Watch the road!', '🪨 The canyon is throwing rocks at you. Personally.', '🪨 BOULDER INCOMING!'][Math.floor(Math.random() * 3)]);
    return b;
  }

  private move(b: Boulder, dt: number) {
    if (b.broken > 0) { b.broken += dt; return; }
    b.vy -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y <= b.r) {
      b.y = b.r;
      // it digs in on impact: most of the sideways speed is gone, then a short bounce and a roll
      if (b.vy < -3) { b.vy = -b.vy * 0.3; b.vx *= 0.12; b.vz *= 0.12; this.h.sfx('thump', [b.x, 0, b.z]); } else b.vy = 0;
      const sp = Math.hypot(b.vx, b.vz), dec = Math.min(sp, 6 * dt);
      if (sp > 0) { b.vx -= (b.vx / sp) * dec; b.vz -= (b.vz / sp) * dec; }
    }
    this.hitRV(b);
  }

  /** Boulder vs the RV box (RV-local frame). Falling onto the roof or getting rammed. */
  private hitRV(b: Boulder) {
    const s = this.h.s, rv = s.rv;
    const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
    const dx = b.x - rv.x, dz = b.z - rv.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // RV-local
    const px = Math.max(-RV.halfW, Math.min(RV.halfW, lx)), pz = Math.max(RV.noseZ, Math.min(RV.zRear, lz));
    const d = Math.hypot(lx - px, lz - pz);
    if (d > b.r || b.y - b.r > 3.6) return;
    const roof = b.y > 2.6 && b.vy < -2;
    b.broken = 0.001;
    this.h.sfx('crunch', [b.x, b.y, b.z]); this.h.sfx('bang');
    if (roof) {
      rv.integrity = Math.max(0, rv.integrity - 15);
      this.h.joltAll(1.3); this.h.hurtStanding(1.0);
      this.h.toast('🪨 A BOULDER LANDED ON THE ROOF. The roof is now a skylight. (−15)');
      return;
    }
    // rammed: the RV's speed into the rock is what hurts; a heavy rock stops you hard
    const sp = Math.abs(rv.speed);
    const dv = sp * (MASS / (MASS + 5)) * 1.3;
    rv.speed *= 0.25;
    const mag = Math.min(1.5, dv / 10);
    rv.integrity = Math.max(0, rv.integrity - (sp > 4 ? 10 : 2));
    this.h.joltAll(mag); this.h.hurtStanding(mag);
    if (sp > 4) this.h.toast(['🪨 You hit a boulder. It won. (−10)', '🪨 CRUNCH. The boulder is gravel now. So is your bumper.'][Math.floor(Math.random() * 2)]);
  }
}
