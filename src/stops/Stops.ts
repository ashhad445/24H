// Runs every kit-built stop: activation along the route (host), state, acts, steps, and the client views.
import * as THREE from 'three';
import type { PromptCtx } from '../rv/RV';
import type { ItemState, SharedState } from '../types';
import { addClearZone } from '../world/World';
import { STOPS } from './defs';
import type { StaticSet } from './geom';
import { makeHostCtx, signTexture, stopFrame, stopOnRoute, type HostCtx, type StopDef, type ViewCtx } from './kit';
import { PUMP_BASE, pumpIntoRV, pumpRegistry } from './parts';

type Base = Parameters<typeof makeHostCtx>[0];

// ------------------------------------------------------------------ host
export class StopsHost {
  private active = new Map<string, { def: StopDef; set: StaticSet; ctx: HostCtx }>();

  constructor(private base: Base, private statics: StaticSet[]) {}

  sets() { return [...this.active.values()].map((a) => a.set); }

  step(dt: number) {
    const s = this.base.s, rv = s.rv;
    for (const def of STOPS) {
      if (this.active.has(def.id) || !stopOnRoute(def, s.route)) continue;
      const set = stopFrame(def);
      if (Math.hypot(rv.x - set.x, rv.z - set.z) > 1500) continue;
      const ctx = makeHostCtx(this.base, set, def.id);
      this.active.set(def.id, { def, set, ctx });
      this.statics.push(set);
      s.stops[def.id] = Object.fromEntries(def.parts.map((p) => [p.id, p.init?.() ?? null]));
      for (const p of def.parts) p.spawn?.(ctx);
    }
    for (const { def, ctx } of this.active.values()) {
      const st = s.stops[def.id];
      for (const p of def.parts) p.step?.(ctx, st[p.id], dt);
    }
  }

  /** Acts look like `stop:<stopId>:<partId>:<key>`. Returns true if handled. */
  act(from: number, id: string): boolean {
    if (!id.startsWith('stop:')) return false;
    const [, stopId, partId, ...rest] = id.split(':');
    const a = this.active.get(stopId);
    const part = a?.def.parts.find((p) => p.id === partId);
    if (!a || !part?.act) return true;
    part.act(a.ctx, this.base.s.stops[stopId][partId], from, rest.join(':'));
    return true;
  }

  /** Is this nozzle one of ours? Then pump from its stop. */
  pumpInto(from: number, nozzle: ItemState): boolean {
    if (nozzle.d < PUMP_BASE) return false;
    const reg = pumpRegistry.get(nozzle.d);
    const a = reg && this.active.get(reg.stopId);
    if (!reg || !a) return true;
    pumpIntoRV(a.ctx, this.base.s.stops[reg.stopId][reg.comp.id], reg.index, reg.price, from);
    return true;
  }
}

// ------------------------------------------------------------------ client
type Prompt = (st: any, c: PromptCtx, s: SharedState) => string;

export class StopsView {
  readonly root = new THREE.Group();
  private built = new Map<string, { def: StopDef; group: THREE.Group; ctx: ViewCtx; prompts: Map<string, Prompt> }>();

  constructor(scene: THREE.Scene, private statics: StaticSet[], private play: (n: string) => void) {
    scene.add(this.root);
  }

  private build(def: StopDef) {
    const set = stopFrame(def);
    const group = new THREE.Group();
    group.position.set(set.x, 0, set.z); group.rotation.y = set.yaw;
    this.root.add(group);
    const prompts = new Map<string, Prompt>();
    let current = '';
    const ctx: ViewCtx = {
      group,
      reg: (key, obj, prompt) => {
        const id = `stop:${def.id}:${current}:${key}`;
        obj.traverse((o) => { o.userData.iid = id; });
        prompts.set(id, prompt);
      },
      box: (mat, x0, x1, y0, y1, z0, z1, cast = false) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = cast; m.receiveShadow = true;
        group.add(m); return m;
      },
      sign: (lines, bg, w, h, px = 512, py = 256) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(lines, bg, px, py) }));
        group.add(m); return m;
      },
      play: this.play,
    };
    for (const p of def.parts) { current = p.id; p.build(ctx); }
    this.built.set(def.id, { def, group, ctx, prompts });
    this.statics.push(set);
    addClearZone({ ...set, x0: def.lot.x0 - 1, x1: def.lot.x1 + 15, z0: def.lot.z0 - 10, z1: def.lot.z1 + 10 });
  }

  update(s: SharedState, dt: number, focus: THREE.Vector3, itemPos: (id: number) => THREE.Vector3 | null) {
    for (const def of STOPS) if (s.stops[def.id] && !this.built.has(def.id)) this.build(def);
    for (const b of this.built.values()) {
      b.group.visible = Math.hypot(focus.x - b.group.position.x, focus.z - b.group.position.z) < 1600;
      if (!b.group.visible) continue;
      const st = s.stops[b.def.id]; if (!st) continue;
      for (const p of b.def.parts) p.update?.(b.ctx, st[p.id], s, dt, itemPos);
    }
  }

  promptFor(id: string, s: SharedState, c: PromptCtx) {
    const [, stopId, partId] = id.split(':');
    const b = this.built.get(stopId);
    const st = s.stops[stopId]?.[partId];
    return b?.prompts.get(id)?.(st, c, s) ?? '';
  }
}

export { STOPS };
