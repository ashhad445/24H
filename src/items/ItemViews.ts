// Client-side rendering of networked items. Held items attach to the holder's hand.
import * as THREE from 'three';
import type { Avatar } from '../player/Avatar';
import type { RVModel } from '../rv/RV';
import type { ItemState } from '../types';
import { buildItemMesh, pattyColor } from './Items';

interface View { obj: THREE.Object3D; parent: THREE.Object3D | null; patty: THREE.MeshStandardMaterial | null; lastD: number }

export class ItemViews {
  private views = new Map<number, View>();
  private handOffset = new THREE.Vector3(0.24, -0.24, -0.45);

  constructor(
    private rv: RVModel,
    private dyn: THREE.Group,
    private camera: THREE.Camera,
    private avatars: Map<number, Avatar>,
    private myId: number,
  ) {}

  /** Current rendered world position of an item, or null if it has no view. */
  worldPosOf(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v && v.parent ? v.obj.getWorldPosition(new THREE.Vector3()) : null;
  }

  sync(items: ItemState[], dt: number, slots: Record<number, { slot: number }> = {}) {
    const seen = new Set<number>();
    for (const it of items) {
      seen.add(it.id);
      let v = this.views.get(it.id);
      if (!v) {
        const obj = buildItemMesh(it.k);
        obj.traverse((o) => { o.userData.iid = `item:${it.id}`; });
        let patty: THREE.MeshStandardMaterial | null = null;
        if (it.k === 'patty') patty = ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
        if (patty) (obj as THREE.Mesh).material = patty;
        v = { obj, parent: null, patty, lastD: -1 };
        this.views.set(it.id, v);
      }

      v.obj.visible = it.h === -1 || it.sl === (slots[it.h]?.slot ?? 0);
      // pick the parent
      let parent: THREE.Object3D | null;
      if (it.h === this.myId) parent = this.camera;
      else if (it.h !== -1) parent = this.avatars.get(it.h)?.hand ?? null;
      else parent = it.rv ? this.rv.body : this.dyn;

      if (parent !== v.parent) {
        if (parent) parent.add(v.obj); else v.obj.removeFromParent();
        v.parent = parent;
        if (it.h === -1) v.obj.position.set(it.x, it.y, it.z);
      }

      if (it.h === this.myId) {
        v.obj.position.copy(this.handOffset);
        v.obj.rotation.set(0.2, 0.4, 0);
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

      if (v.patty && Math.abs(it.d - v.lastD) > 0.01) { v.patty.color.copy(pattyColor(it.d)); v.lastD = it.d; }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.obj.removeFromParent(); this.views.delete(id); }
    }
  }
}
