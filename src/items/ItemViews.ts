// Client-side rendering of networked items. Held items attach to the holder's hand.
import * as THREE from 'three';
import type { Avatar } from '../player/Avatar';
import type { RVModel } from '../rv/RV';
import type { ItemState } from '../types';
import { buildItemMesh, pattyColor } from './Items';

/** Big props are held smaller in first person so they don't fill the screen. */
const FP_SCALE: Record<string, number> = { extinguisher: 0.62, jerrycan: 0.6, coolant: 0.75, spare: 0.4, wheel: 0.45, suitcase: 0.5, battery: 0.7, cat: 0.7, ice: 0.75, rocket: 0.75, weed: 0.8, flamingo: 0.6 };

interface View { obj: THREE.Object3D; parent: THREE.Object3D | null; patty: THREE.MeshStandardMaterial | null; lastD: number; from: THREE.Vector3 | null; ft: number }

export class ItemViews {
  private views = new Map<number, View>();
  private handOffset = new THREE.Vector3(0.24, -0.24, -0.45);

  /** First-person feel: the held item lags the view, bobs with your steps, rises into view, and jabs when used. */
  private fp = { sx: 0, sy: 0, raise: 1, punch: 0, shown: -1, bob: 0, walk: 0 };
  private arm = new THREE.Group();
  private armMat = new THREE.MeshStandardMaterial({ color: '#f0ad4e', roughness: 0.75 });

  constructor(
    private rv: RVModel,
    private dyn: THREE.Group,
    private camera: THREE.Camera,
    private avatars: Map<number, Avatar>,
    private myId: number,
  ) {
    // your own bean arm under whatever you're holding
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), this.armMat);
    const dir = new THREE.Vector3(0.16, -0.36, 0.34);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, dir.length(), 4, 10), this.armMat);
    fore.position.copy(dir).multiplyScalar(0.5);
    fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.arm.add(fist, fore);
    this.arm.traverse((o) => { o.raycast = () => {}; });
    this.arm.visible = false;
    camera.add(this.arm);
  }

  /** Arm colour = your bean colour. */
  setArmColor(c: string) { this.armMat.color.set(c); }

  /** Fed by main every frame: mouse movement (px), walk cycle, vertical speed. */
  feel(dt: number, mdx: number, mdy: number, stepPhase: number, walking: boolean, vy: number) {
    const f = this.fp, c = THREE.MathUtils.clamp, k = Math.min(1, dt * 10);
    f.sx += (c(-mdx * 0.0011, -0.045, 0.045) - f.sx) * k;
    f.sy += (c(mdy * 0.0011 - vy * 0.007, -0.045, 0.045) - f.sy) * k;
    f.raise = Math.min(1, f.raise + dt * 4.5);
    f.punch = Math.sign(f.punch) * Math.max(0, Math.abs(f.punch) - dt * 4.2);
    f.walk += ((walking ? 1 : 0) - f.walk) * Math.min(1, dt * 8);
    f.bob = stepPhase;
  }

  /** The held item jabs forward (use, eat, swing) or kicks back (gun). */
  punch(k = 1) { this.fp.punch = k; }

  /** Current rendered world position of an item, or null if it has no view. */
  worldPosOf(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v && v.parent ? v.obj.getWorldPosition(new THREE.Vector3()) : null;
  }

  sync(items: ItemState[], dt: number, slots: Record<number, { slot: number }> = {}) {
    const seen = new Set<number>();
    let mineShown = false;
    for (const it of items) {
      seen.add(it.id);
      let v = this.views.get(it.id);
      if (!v) {
        const obj = buildItemMesh(it.k);
        obj.traverse((o) => { o.userData.iid = `item:${it.id}`; });
        let patty: THREE.MeshStandardMaterial | null = null;
        if (it.k === 'patty') patty = ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
        if (patty) (obj as THREE.Mesh).material = patty;
        v = { obj, parent: null, patty, lastD: -1, from: null, ft: 0 };
        this.views.set(it.id, v);
      }

      v.obj.visible = it.h === -1 || it.sl === (slots[it.h]?.slot ?? 0);
      // pick the parent
      let parent: THREE.Object3D | null;
      if (it.h === this.myId) parent = this.camera;
      else if (it.h !== -1) parent = this.avatars.get(it.h)?.hand ?? null;
      else parent = it.rv ? this.rv.body : this.dyn;

      if (parent !== v.parent) {
        // picked up: fly from where it lay into the hand
        v.from = null;
        if (parent === this.camera && v.parent) {
          this.camera.updateMatrixWorld();
          const w = this.camera.worldToLocal(v.obj.getWorldPosition(new THREE.Vector3()));
          if (w.lengthSq() < 16) { v.from = w; v.ft = 0; }
        }
        if (parent) parent.add(v.obj); else v.obj.removeFromParent();
        v.parent = parent;
        if (it.h === -1) v.obj.position.set(it.x, it.y, it.z);
      }

      v.obj.scale.setScalar(it.h === this.myId ? FP_SCALE[it.k] ?? 1 : 1);
      if (it.h === this.myId) {
        const f = this.fp, ho = this.handOffset;
        if (v.obj.visible) {
          mineShown = true;
          if (f.shown !== it.id) { f.shown = it.id; f.raise = v.from ? 1 : 0; }
        }
        const e = 1 - (1 - f.raise) ** 3;
        const pu = Math.sin(Math.min(1, Math.abs(f.punch)) * Math.PI) * Math.sign(f.punch);
        const p = v.obj.position;
        p.set(ho.x + f.sx + Math.cos(f.bob) * 0.007 * f.walk, ho.y + f.sy - (1 - e) * 0.32 - Math.abs(Math.sin(f.bob)) * 0.014 * f.walk + Math.max(0, pu) * 0.03, ho.z - pu * 0.13);
        v.obj.rotation.set(0.2 + (1 - e) * 0.9 - pu * 0.4 + f.sy * 2.2, 0.4 + f.sx * 3, -f.sx * 2.4);
        if (v.from) {
          v.ft = Math.min(1, v.ft + dt * 7);
          const k = 1 - (1 - v.ft) ** 3;
          p.lerpVectors(v.from, p, k); p.y += Math.sin(k * Math.PI) * 0.08;
          if (v.ft >= 1) v.from = null;
        }
        if (v.obj.visible) { this.arm.position.set(p.x + 0.005, p.y - 0.075, p.z + 0.035); this.arm.rotation.set(f.sy * 1.5 - pu * 0.2, f.sx * 2, 0); }
      } else if (it.h !== -1) {
        v.obj.position.set(0, 0, 0);
        v.obj.rotation.set(0, 0, 0);
      } else {
        const k = Math.min(1, dt * 18);
        const p = v.obj.position;
        if (p.distanceToSquared(new THREE.Vector3(it.x, it.y, it.z)) > 4) p.set(it.x, it.y, it.z);
        else { p.x += (it.x - p.x) * k; p.y += (it.y - p.y) * k; p.z += (it.z - p.z) * k; }
        v.obj.rotation.set(0, it.ry, 0);
      }

      // the rattlesnake wriggles (harder when someone's holding it)
      const segs = v.obj.userData.segs as THREE.Object3D[] | undefined;
      if (segs) { const t = (performance.now() / 1000) * (it.h !== -1 ? 11 : 5); segs.forEach((m, i) => { m.position.x = Math.sin(i * 0.7 + t) * (it.h !== -1 ? 0.08 : 0.05); }); }

      if (v.patty && Math.abs(it.d - v.lastD) > 0.01) { v.patty.color.copy(pattyColor(it.d)); v.lastD = it.d; }
    }
    if (!mineShown) this.fp.shown = -1;
    this.arm.visible = mineShown;
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.obj.removeFromParent(); this.views.delete(id); }
    }
  }
}
