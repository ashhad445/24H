// Blender-built cabin furniture (art/rvinterior.py → rvinterior.glb) swapped onto the procedural RV once the models load.
// Purely visual: colliders and surfaces stay procedural, so every piece matches its box. Missing file = nothing changes.
import type * as THREE from 'three';
import { RV } from '../config';
import { Assets } from '../core/AssetLoader';

export interface RVInteriorHooks {
  body: THREE.Group;
  /** Procedural meshes each kit piece replaces, by piece name. */
  inHide: Record<string, THREE.Object3D[]>;
}

const FILE = 'rvinterior';

export function dressRVInterior(rv: RVInteriorHooks) {
  if (!Assets.has(FILE)) return;
  const put = (name: string, x: number, y: number, z: number, iid = '', flipZ = false) => {
    const n = Assets.node(FILE, name);
    if (!n) return false;
    n.position.set(x, y, z);
    if (flipZ) n.scale.z = -1;
    n.traverse((o) => { o.receiveShadow = true; if (iid) o.userData.iid = iid; });
    rv.body.add(n);
    return true;
  };
  const swap = (key: string, ...ok: boolean[]) => { if (ok.every(Boolean)) for (const o of rv.inHide[key] ?? []) o.visible = false; };
  const f = RV.floorY, bx = (-RV.innerHalfW - 0.6) / 2;
  // the seats stay clickable: the model carries the same interact id as the boxes it replaces
  swap('seat', put('seat', -0.7, f, -2.15, 'seat_driver'), put('seat', 0.7, f, -2.15, 'seat_nav'));
  swap('bench', put('bench', bx, f, -0.75), put('bench', bx, f, 1.0, '', true));
  swap('table', put('table', (-RV.innerHalfW - 0.62) / 2, f, 0.13));
  swap('stove', put('stove', 1.0, 1.55, 0.35));
  swap('sink', put('sink', 1.02, 1.555, 1.6));
}
