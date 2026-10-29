// Shared bits for road encounters: the host interface, the kind contract, and small geometry helpers.
import { RV } from '../config';
import type { ItemSim } from '../items/ItemPhysics';
import { rvLocal } from '../stops/chase';
import type { Obstacle, TrafficSim } from '../traffic/TrafficSim';
import type { CrewState, Enc, ItemState, SharedState } from '../types';
import { roadDX, roadPoint, roadX } from '../world/World';

export interface EncHost {
  s: SharedState;
  items: ItemSim;
  traffic: TrafficSim;
  toast(text: string): void;
  sfx(name: string, at?: [number, number, number]): void;
  joltAll(mag: number): void;
  hurtStanding(mag: number): void;
  hurt(id: number, amount: number): void;
  credit(from: number, amount: number, what: string): void;
  charge(from: number, amount: number, what: string): boolean;
  held(id: number): ItemState | undefined;
  handOf: (id: number) => [number, number, number] | null;
  name(id: number): string;
  crew(id: number): CrewState;
  /** Is the RV parked within r meters of a stop (Rusty's or a kit stop)? */
  nearStop(r: number): boolean;
}

/** One encounter type. Host side only; views live in road/EncounterView.ts. */
export interface KindDef {
  weight: number;
  /** may the director pick this kind right now? */
  ok?(h: EncHost): boolean;
  /** fill in kind fields (z/off are preset, may be changed) */
  spawn(h: EncHost, e: Enc): void;
  /** false = done, remove it */
  step(h: EncHost, e: Enc, dt: number): boolean;
  act?(h: EncHost, e: Enc, from: number, key: string): void;
  honk?(h: EncHost, e: Enc): void;
  obstacles?(e: Enc, out: Obstacle[]): void;
  remove?(h: EncHost, e: Enc): void;
}

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Lateral offset of the RV from the road centerline (+ = right). */
export const rvOff = (s: SharedState) => (s.rv.x - roadX(s.rv.z)) * Math.hypot(1, roadDX(s.rv.z));

/** World [x, z] → road [z, off]. Road distance ≈ world z (the road runs along −Z). */
export function toRoad(x: number, z: number): [number, number] { return [z, (x - roadX(z)) * Math.hypot(1, roadDX(z))]; }

/** Unit vector pointing to the right of the road at z (world). */
export function rightVec(z: number): [number, number] { const dx = roadDX(z), l = Math.hypot(1, dx); return [1 / l, -dx / l]; }

/** Does a circle at world (x, z) with radius r touch the RV's footprint? Returns RV-local [lx, lz] of the hit, else null. */
export function rvHit(s: SharedState, x: number, z: number, r: number): [number, number] | null {
  const [lx, lz] = rvLocal(s, x, z);
  const px = Math.max(-RV.halfW, Math.min(RV.halfW, lx)), pz = Math.max(RV.noseZ, Math.min(RV.zRear, lz));
  return Math.hypot(lx - px, lz - pz) <= r ? [lx, lz] : null;
}

/** World position at road distance z, offset off. */
export const at = (z: number, off: number) => roadPoint(z, off);

/** RV-local → world [x, z]. */
export function rvWorld(s: SharedState, lx: number, lz: number): [number, number] {
  const r = s.rv, c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
  return [r.x + lx * c + lz * sn, r.z - lx * sn + lz * c];
}

/** Players standing inside the RV (not seated), with their RV-local hand position. */
export function standingInRV(h: EncHost): { id: number; lx: number; lz: number }[] {
  const s = h.s, out: { id: number; lx: number; lz: number }[] = [];
  for (const id of Object.keys(s.crew).map(Number)) {
    if (id === s.seats.driver || id === s.seats.nav) continue;
    const p = h.handOf(id); if (!p) continue;
    const [lx, lz] = rvLocal(s, p[0], p[2]);
    if (Math.abs(lx) < RV.halfW && lz > RV.zFront && lz < RV.zRear) out.push({ id, lx, lz });
  }
  return out;
}

export const stopped = (s: SharedState) => Math.abs(s.rv.speed) < 0.6;
