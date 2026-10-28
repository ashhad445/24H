// Host-only lightweight prop physics. Items inside the RV simulate in RV-local space and feel
// the RV's acceleration as a pseudo-force, so braking flings the burgers forward.
import { RV } from '../config';
import type { Box2 } from '../rv/RV';
import { collideCircle, fromSetLocal, toSetLocal, type StaticSet } from '../stops/geom';
import type { ItemState, SharedState } from '../types';
import { KINDS } from './Items';

export const SLOTS: Record<string, [number, number, number]> = {
  skillet: [1.0, 1.648, 0.53],
  rack: [-0.4, 1.2, RV.zRear + 0.24],
  wall: [1.24, 1.15, -0.7],
  tray: [0.65, 1.475, -2.82],
};

const insideBounds = (x: number, z: number) => Math.abs(x) < RV.innerHalfW + 0.04 && z > RV.zFront && z < RV.zRear - 0.04;

export class ItemSim {
  private vel = new Map<number, [number, number, number]>();
  private nextId = 1;
  /** Friction coefficient of the surface each item rested on last step (0 = airborne). */
  private grip = new Map<number, number>();
  /** World-space slots (e.g. pump holsters at a stop). */
  readonly worldSlots = new Map<string, [number, number, number]>();
  /** Static collision sets for world-frame items (stop buildings, shelves). */
  statics: StaticSet[] = [];

  constructor(private s: SharedState, private colliders: (doorOpen: boolean) => Box2[]) {}

  get(id: number) { return this.s.items.find((i) => i.id === id); }

  spawn(k: string, rv: boolean, x: number, y: number, z: number, slot = '', d?: number, price = 0): ItemState {
    const it: ItemState = { id: this.nextId++, k, rv, x, y, z, ry: Math.random() * 6.28, h: -1, s: slot, d: d ?? KINDS[k]?.uses ?? 0, p: price };
    if (slot) this.placeInSlot(it);
    this.s.items.push(it);
    this.vel.set(it.id, [0, 0, 0]);
    return it;
  }

  remove(id: number) {
    this.s.items = this.s.items.filter((i) => i.id !== id);
    this.vel.delete(id);
    this.grip.delete(id);
  }

  setVel(id: number, v: [number, number, number]) { this.vel.set(id, v); }
  velOf(id: number) { return this.vel.get(id); }

  private placeInSlot(it: ItemState) {
    const rvSlot = SLOTS[it.s];
    if (rvSlot) { [it.x, it.y, it.z] = rvSlot; it.rv = true; return; }
    const w = this.worldSlots.get(it.s);
    if (w) { [it.x, it.y, it.z] = w; it.rv = false; }
  }

  /** Kick every loose item inside the RV upward (pothole) — mag 0..1.5. */
  jolt(mag: number) {
    for (const it of this.s.items) {
      if (!it.rv || it.h !== -1 || it.s) continue;
      const v = this.vel.get(it.id)!;
      v[1] += mag * (1.6 + Math.random() * 1.6);
      v[0] += (Math.random() - 0.5) * mag * 1.5;
      v[2] += (Math.random() - 0.5) * mag * 1.5;
    }
  }

  private toLocal(wx: number, wz: number) {
    const r = this.s.rv; const dx = wx - r.x, dz = wz - r.z; const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return [dx * c - dz * s, dx * s + dz * c] as const;
  }
  private toWorld(lx: number, lz: number) {
    const r = this.s.rv; const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return [r.x + lx * c + lz * s, r.z - lx * s + lz * c] as const;
  }

  step(dt: number, accel: { x: number; z: number }) {
    const rv = this.s.rv;
    const cols = this.colliders(rv.doorOpen);
    for (const it of this.s.items) {
      if (it.h !== -1) continue;
      if (it.s) { this.placeInSlot(it); continue; }
      const v = this.vel.get(it.id) ?? [0, 0, 0];
      this.vel.set(it.id, v);
      const r = KINDS[it.k]?.r ?? 0.05;

      if (it.rv) { v[0] -= accel.x * dt; v[2] -= accel.z * dt; }
      // Coulomb friction BEFORE moving: an item at rest stays put until pushed harder than its grip,
      // a sliding one sheds speed fast. (The RV carpet is slicker than counters and dirt.)
      const mu0 = this.grip.get(it.id) ?? 0;
      if (mu0 > 0) {
        const sp2 = Math.hypot(v[0], v[2]), loss = mu0 * 16 * dt;
        if (sp2 <= loss) { v[0] = 0; v[2] = 0; } else { v[0] *= (sp2 - loss) / sp2; v[2] *= (sp2 - loss) / sp2; }
      }
      v[1] -= (it.k === 'rock' ? 6 : 16) * dt;
      // cap speed so a prop can never skip across a wall in one step (thrown rocks are the fast exception)
      const sp = Math.hypot(v[0], v[1], v[2]), cap = it.k === 'rock' ? 40 : 10;
      if (it.rv && sp > cap) { v[0] *= cap / sp; v[1] *= cap / sp; v[2] *= cap / sp; }
      // the rear window hatch: when it's open, rocks can fly out through it
      const winOpen = rv.rearWin && it.k === 'rock';
      const inWin = (x: number, y: number) => Math.abs(x) < 0.62 && y > 1.68 && y < 2.22;
      const wasInside = it.rv && insideBounds(it.x, it.z);
      it.x += v[0] * dt; it.y += v[1] * dt; it.z += v[2] * dt;

      // collide in RV-local space
      let [lx, lz] = it.rv ? [it.x, it.z] : this.toLocal(it.x, it.z);
      let floor = insideBounds(lx, lz) ? RV.floorY : 0;
      if (it.y < RV.roofY + 0.3) {
        for (const b of cols) {
          if (winOpen && v[2] > 0.5 && inWin(lx, it.y) && b.z0 > RV.zRear - 0.2) continue; // the rear wall has a hole
          const top = b.top ?? 99;
          const over = lx > b.x0 && lx < b.x1 && lz > b.z0 && lz < b.z1;
          if (over && it.y - r >= top - 0.12) { floor = Math.max(floor, top); continue; }
          if (it.y - r >= top - 0.12) continue;
          const cx = Math.min(b.x1, Math.max(b.x0, lx)), cz = Math.min(b.z1, Math.max(b.z0, lz));
          let dx = lx - cx, dz = lz - cz; const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-8) {
            const px = Math.min(lx - b.x0, b.x1 - lx), pz = Math.min(lz - b.z0, b.z1 - lz);
            if (px < pz) { lx = lx - b.x0 < b.x1 - lx ? b.x0 - r : b.x1 + r; v[0] *= -0.3; }
            else { lz = lz - b.z0 < b.z1 - lz ? b.z0 - r : b.z1 + r; v[2] *= -0.3; }
          } else {
            const d = Math.sqrt(d2); dx /= d; dz /= d;
            lx = cx + dx * r; lz = cz + dz * r;
            // reflect the velocity component into the wall (local frame for rv items)
            if (it.rv) { const vn = v[0] * dx + v[2] * dz; if (vn < 0) { v[0] -= 1.3 * vn * dx; v[2] -= 1.3 * vn * dz; } }
          }
        }
      }
      if (insideBounds(lx, lz) && it.y + r > RV.ceilY) { it.y = RV.ceilY - r; v[1] = Math.min(0, v[1]); }

      // stop buildings, shelves and counters (world-frame items only)
      if (!it.rv) {
        const [wx, wz] = this.toWorld(lx, lz);
        for (const set of this.statics) {
          if (Math.abs(wx - set.x) > 200 || Math.abs(wz - set.z) > 200) continue;
          const [sx, sz] = toSetLocal(set, wx, wz);
          const res = collideCircle(sx, sz, r, it.y - r, set.boxes);
          if (res.x !== sx || res.z !== sz) { v[0] *= -0.3; v[2] *= -0.3; }
          const [nx, nz] = fromSetLocal(set, res.x, res.z);
          [lx, lz] = this.toLocal(nx, nz);
          floor = Math.max(floor, res.floor);
        }
      }

      // floor / surface
      if (it.y - r <= floor) {
        it.y = floor + r;
        if (v[1] < 0) {
          // a hard landing eats most of the sideways speed too (no skating across counters)
          if (v[1] < -1.5) { v[0] *= 0.55; v[2] *= 0.55; }
          v[1] = v[1] < -1.5 ? -v[1] * 0.25 : 0;
        }
        this.grip.set(it.id, it.rv && floor <= RV.floorY + 0.01 ? 0.5 : 1.4);
      } else this.grip.set(it.id, 0);

      // write back + frame transitions
      let inside = insideBounds(lx, lz);
      // props only leave the cabin through the open door; anything else bounces back in
      if (wasInside && !inside) {
        const viaDoor = rv.doorOpen && lx > 0 && lz > RV.doorZ0 && lz < RV.doorZ1 && it.y < RV.doorTop;
        const viaWin = winOpen && inWin(lx, it.y) && lz > RV.zRear - 0.25;
        if (!viaDoor && !viaWin) {
          lx = Math.max(-RV.innerHalfW + r, Math.min(RV.innerHalfW - r, lx));
          lz = Math.max(RV.zFront + r, Math.min(RV.zRear - 0.08 - r, lz));
          v[0] *= -0.3; v[2] *= -0.3;
          inside = true;
        }
      }
      if (it.rv) {
        it.x = lx; it.z = lz;
        if (!inside) {
          // left the RV through the door: carry the RV's velocity into the world
          const [wx, wz] = this.toWorld(lx, lz); const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
          const vx = v[0] * c + v[2] * sn - Math.sin(rv.yaw) * rv.speed, vz = -v[0] * sn + v[2] * c - Math.cos(rv.yaw) * rv.speed;
          it.x = wx; it.z = wz; v[0] = vx; v[2] = vz; it.rv = false;
        }
      } else {
        const [wx, wz] = this.toWorld(lx, lz); it.x = wx; it.z = wz;
        if (inside && it.y >= RV.floorY - 0.05) {
          const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
          const vx = v[0] + Math.sin(rv.yaw) * rv.speed, vz = v[2] + Math.cos(rv.yaw) * rv.speed;
          it.x = lx; it.z = lz; v[0] = vx * c - vz * sn; v[2] = vx * sn + vz * c; it.rv = true;
        }
      }
      // items far behind the RV are lost forever
      if (!it.rv && Math.hypot(it.x - rv.x, it.z - rv.z) > 600) this.remove(it.id);
    }
    this.separate();
  }

  /** Loose props shove each other apart so they never pile up on one spot. */
  private separate() {
    const loose = this.s.items.filter((i) => i.h === -1 && !i.s);
    for (let a = 0; a < loose.length; a++) {
      const A = loose[a], ra = KINDS[A.k]?.r ?? 0.05;
      for (let b = a + 1; b < loose.length; b++) {
        const B = loose[b];
        if (A.rv !== B.rv) continue;
        const rb = KINDS[B.k]?.r ?? 0.05, min = (ra + rb) * 0.95;
        const dx = B.x - A.x, dz = B.z - A.z;
        if (Math.abs(dx) > min || Math.abs(dz) > min || Math.abs(B.y - A.y) > ra + rb) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const nx = d > 1e-4 ? dx / d : Math.cos(A.id * 2.4), nz = d > 1e-4 ? dz / d : Math.sin(A.id * 2.4);
        const push = (min - d) * 0.5 * 0.7;
        A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
        for (const it of [A, B]) {
          if (!it.rv) continue;
          const r = KINDS[it.k]?.r ?? 0.05;
          it.x = Math.max(-RV.innerHalfW + r, Math.min(RV.innerHalfW - r, it.x));
          it.z = Math.max(RV.zFront + r, Math.min(RV.zRear - 0.08 - r, it.z));
        }
      }
    }
  }
}
