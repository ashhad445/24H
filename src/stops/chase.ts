// Host-side foot chases: a shopkeeper with a bat (or Roscoe with a taser) runs a thief down.
import type { ItemSim } from '../items/ItemPhysics';
import type { ChaseState as Chase, SharedState } from '../types';

export type { Chase };

export interface ChaseHost {
  s: SharedState;
  items: ItemSim;
  handOf(id: number): [number, number, number] | null;
  fade(to: number, dur: number, ko?: boolean): void;
  toast(text: string): void;
  sfx(name: string, at?: [number, number, number]): void;
}

/** RV-local position of a world point. */
export function rvLocal(s: SharedState, wx: number, wz: number): [number, number] {
  const r = s.rv, c = Math.cos(r.yaw), sn = Math.sin(r.yaw), dx = wx - r.x, dz = wz - r.z;
  return [dx * c - dz * sn, dx * sn + dz * c];
}
export function inRV(s: SharedState, p: [number, number, number]) {
  const [lx, lz] = rvLocal(s, p[0], p[2]);
  return Math.abs(lx) < 1.5 && Math.abs(lz) < 3.6;
}

/** Somebody saw a crime: +1 heat, the cops want this player, and Roscoe hurries. */
export function caught(h: ChaseHost, who: number) {
  h.s.heat += 1; h.s.wanted = who;
}

/** Run toward the target. 'lost' once they get away (20 s, or the RV left with them). */
export function stepChase(h: ChaseHost, ch: Chase, dt: number, speed: number, reach: number, home: [number, number]): 'run' | 'hit' | 'lost' {
  ch.t += dt;
  const p = h.handOf(ch.who);
  if (!p || ch.t > 20) return 'lost';
  if (inRV(h.s, p) && Math.hypot(h.s.rv.x - home[0], h.s.rv.z - home[1]) > 80) return 'lost';
  const dx = p[0] - ch.x, dz = p[2] - ch.z, d = Math.hypot(dx, dz);
  if (d < reach) return 'hit';
  const k = Math.min(1, (speed * dt) / d);
  ch.x += dx * k; ch.z += dz * k;
  return 'run';
}

/** Walk back toward a spot; true once there. */
export function walkHome(ch: Chase, dt: number, home: [number, number]) {
  const dx = home[0] - ch.x, dz = home[1] - ch.z, d = Math.hypot(dx, dz);
  if (d < 0.5) return true;
  const k = Math.min(1, (3 * dt) / d); ch.x += dx * k; ch.z += dz * k;
  return false;
}

/** Knocked out: blackout for `sec`, everything carried hits the floor and stolen goods are taken back. */
export function bonk(h: ChaseHost, who: number, sec: number) {
  const p = h.handOf(who);
  h.fade(who, sec, true);
  h.sfx('bonk', p ?? undefined);
  const c = h.s.crew[who];
  if (c) c.hp = Math.max(0, (c.hp ?? 100) - 10);
  const carried = h.s.items.filter((i) => i.h === who);
  for (const it of carried) {
    if (it.st || it.p > 0) { h.items.remove(it.id); continue; }
    it.h = -1;
    if (p && inRV(h.s, p)) { const [lx, lz] = rvLocal(h.s, p[0], p[2]); it.rv = true; it.x = lx; it.y = 1.0; it.z = lz; }
    else if (p) { it.rv = false; it.x = p[0]; it.y = Math.max(0.3, p[1] - 0.5); it.z = p[2]; }
    else { it.rv = true; it.x = 0; it.y = 1.2; it.z = 0; }
  }
}
