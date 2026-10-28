// Stop kit: shared plumbing for data-driven roadside stops.
// A stop is a frame (placed beside the road at a mile, on a branch) plus a list of components.
// Each component contributes colliders, host logic (state/acts/steps/spawns) and client visuals.
import * as THREE from 'three';
import { CFG } from '../config';
import type { ItemSim } from '../items/ItemPhysics';
import type { Box2, PromptCtx } from '../rv/RV';
import type { ItemState, SharedState } from '../types';
import { FORKS } from '../world/Route';
import { roadPoint, roadYaw } from '../world/World';
import { fromSetLocal, toSetLocal, type StaticSet } from './geom';

/** What host-side component logic can use. */
export interface HostCtx {
  s: SharedState;
  items: ItemSim;
  toast(text: string): void;
  sfx(name: string): void;
  name(id: number): string;
  held(id: number): ItemState | undefined;
  itemWorld(it: ItemState): [number, number, number] | null;
  charge(from: number, amount: number, what: string): boolean;
  credit(from: number, amount: number, what: string): void;
  /** this stop */
  set: StaticSet;
  stopId: string;
  world(lx: number, y: number, lz: number): [number, number, number];
  local(wx: number, wz: number): [number, number];
  /** register a world slot (item resting place) in stop-local coords */
  slot(name: string, lx: number, y: number, lz: number): string;
  needCard(from: number): boolean;
}

/** What client-side component visuals can use. */
export interface ViewCtx {
  group: THREE.Group; // stop-local frame
  reg(key: string, obj: THREE.Object3D, prompt: (st: any, c: PromptCtx, s: SharedState) => string): void;
  box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, cast?: boolean): THREE.Mesh;
  sign(lines: [string, number, string][], bg: string, w: number, h: number, px?: number, py?: number): THREE.Mesh;
  play(name: string): void;
}

export interface Component {
  id: string;
  colliders?(): Box2[];
  init?(): any; // shared state (synced in snapshots)
  spawn?(h: HostCtx): void; // once, when the stop activates (host)
  act?(h: HostCtx, st: any, from: number, key: string): void;
  step?(h: HostCtx, st: any, dt: number): void;
  build(v: ViewCtx): void; // once (client)
  update?(v: ViewCtx, st: any, s: SharedState, dt: number, itemPos: (id: number) => THREE.Vector3 | null): void;
}

export interface StopDef {
  id: string;
  name: string;
  mile: number;
  /** only exists if this fork took this branch */
  branch?: { fork: number; index: number };
  side?: number; // lateral offset of the frame origin from the centerline (default 5)
  lot: { x0: number; x1: number; z0: number; z1: number };
  parts: Component[];
}

const M = 1 / CFG.MILES_PER_METER;

/** Is this stop part of the route (its branch chosen, or no branch)? Undecided forks → not yet. */
export function stopOnRoute(def: StopDef, route: number[]) {
  if (!def.branch) return FORKS.every((f) => f.mile > def.mile || route[f.id] !== -1);
  return route[def.branch.fork] === def.branch.index;
}

/** The stop's frame. Only valid once every fork before it is decided. */
export function stopFrame(def: StopDef): StaticSet {
  const z0 = -def.mile * M;
  const [x, z] = roadPoint(z0, def.side ?? 5);
  const boxes = def.parts.flatMap((p) => p.colliders?.() ?? []);
  return { x, z, yaw: roadYaw(z0), boxes };
}

export function makeHostCtx(base: Omit<HostCtx, 'set' | 'stopId' | 'world' | 'local' | 'slot' | 'needCard'>, set: StaticSet, stopId: string): HostCtx {
  // delegate explicitly: `base` is a class instance, so spreading would drop its methods
  const ctx: HostCtx = {
    get s() { return base.s; },
    items: base.items,
    toast: (t) => base.toast(t),
    sfx: (n) => base.sfx(n),
    name: (id) => base.name(id),
    held: (id) => base.held(id),
    itemWorld: (it) => base.itemWorld(it),
    charge: (from, amount, what) => base.charge(from, amount, what),
    credit: (from, amount, what) => base.credit(from, amount, what),
    set, stopId,
    world: (lx, y, lz) => { const [x, z] = fromSetLocal(set, lx, lz); return [x, y, z]; },
    local: (wx, wz) => toSetLocal(set, wx, wz),
    slot: (name, lx, y, lz) => {
      const key = `stop:${stopId}:${name}`;
      const [x, z] = fromSetLocal(set, lx, lz);
      base.items.worldSlots.set(key, [x, y, z]);
      return key;
    },
    needCard: (from) => {
      if (base.held(from)?.k === 'card') return true;
      base.toast('💳 You need the debit card in your hand'); base.sfx('error');
      return false;
    },
  };
  return ctx;
}

// ---------- shared visual helpers ----------
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function signTexture(lines: [string, number, string][], bg: string, w = 512, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const total = lines.reduce((a, l) => a + l[1] * 1.15, 0); let y = (h - total) / 2;
    for (const [text, size, color] of lines) {
      g.font = `900 ${size}px "Arial Black", Arial, sans-serif`; g.fillStyle = color;
      g.fillText(text, w / 2, y + size * 0.6); y += size * 1.15;
    }
  });
}

export const MAT = {
  lot: new THREE.MeshStandardMaterial({ color: '#4a4642', roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: '#9c7a52', roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.4, metalness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.8 }),
  red: new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.5 }),
  felt: new THREE.MeshStandardMaterial({ color: '#1b5e20', roughness: 1 }),
  rust: new THREE.MeshStandardMaterial({ color: '#8d4a2a', roughness: 1 }),
  glassDark: new THREE.MeshStandardMaterial({ color: '#33414a', roughness: 0.15, metalness: 0.5 }),
};

/** A simple bean NPC (clerk, bouncer…). Faces −Z. */
export function bean(body: string, hat?: string) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 6, 14), new THREE.MeshStandardMaterial({ color: body, roughness: 0.8 }));
  b.position.y = 0.74; b.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshStandardMaterial({ color: '#e0ac69' })); head.position.y = 1.6;
  g.add(b, head);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.dark); e.position.set(s * 0.09, 1.66, -0.23); g.add(e); }
  if (hat) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 14), new THREE.MeshStandardMaterial({ color: hat })); h.position.y = 1.88; g.add(h); }
  return g;
}
