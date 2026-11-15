// Blender-built exterior parts (art/rvkit.py → rvkit.glb) swapped onto the procedural RV once the models load.
// Purely visual: colliders, click targets and the lit lenses stay procedural. Missing file = nothing changes.
import type * as THREE from 'three';
import { RV } from '../config';
import { Assets } from '../core/AssetLoader';

export interface RVKitHooks {
  body: THREE.Group;
  /** Procedural meshes the kit replaces. */
  kitHide: THREE.Object3D[];
  /** Each wheel's spinning group, which side it is on, and its procedural tire / hub. */
  kitWheels: { spin: THREE.Group; side: number; proc: THREE.Object3D[] }[];
}

const FILE = 'rvkit';

export function dressRVKit(rv: RVKitHooks) {
  if (!Assets.has(FILE)) return;
  const put = (name: string, x: number, y: number, z: number, ry = 0) => {
    const n = Assets.node(FILE, name);
    if (!n) return false;
    n.position.set(x, y, z); n.rotation.y = ry;
    rv.body.add(n);
    return true;
  };
  const { noseZ, zRear, roofY, halfW } = RV;
  const swapped = [
    put('bumper_front', 0, 0.52, noseZ - 0.01),
    put('bumper_rear', 0, 0.52, zRear + 0.11),
    put('grille', 0, 0.87, noseZ),
    put('headlight', -0.98, 0.9, noseZ + 0.03),
    put('headlight', 0.98, 0.9, noseZ + 0.03),
    put('ac', 0, roofY, 0.8),
    put('ladder', 1.05, 0, zRear + 0.15),
  ];
  if (swapped.every(Boolean)) for (const o of rv.kitHide) o.visible = false;
  // extras with no procedural twin
  put('roofrack', 0, roofY, -1.35);
  put('awning', halfW + 0.09, 2.95, 1.15);
  put('antenna', 0.55, roofY, 2.65);
  put('vent', -0.55, roofY, 2.3);
  for (const s of [-1, 1]) put('mudflap', s * RV.wheelX, 0.58, RV.wheelRearZ + 0.64);
  for (const w of rv.kitWheels) {
    const n = Assets.node(FILE, 'wheel');
    if (!n) continue;
    if (w.side < 0) n.rotation.y = Math.PI; // hubcap faces out
    w.spin.add(n);
    for (const o of w.proc) o.visible = false;
  }
}
