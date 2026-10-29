// Client side of foot chases: the angry NPC runs at the synced chase position, then strolls home.
import * as THREE from 'three';
import type { ChaseState } from '../types';

/** A baseball bat held over the shoulder (child of an NPC). */
export function makeBat() {
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.85, 8), new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.7 }));
  bat.position.set(0.32, 1.45, 0.05); bat.rotation.z = -0.5; bat.rotation.x = 0.4;
  return bat;
}

const _v = new THREE.Vector3();

/** Move `npc` (a child of `parent`) toward the chase target, or back to `home` (parent-local x, z). */
export function chaserPose(npc: THREE.Object3D, parent: THREE.Object3D, ch: ChaseState | null | undefined, home: [number, number] | [number, number, number], dt: number) {
  const hx = home[0], hz = home.length === 3 ? home[2] : home[1];
  if (ch) { _v.set(ch.x, 0, ch.z); parent.worldToLocal(_v); }
  else _v.set(hx, 0, hz);
  const dx = _v.x - npc.position.x, dz = _v.z - npc.position.z, d = Math.hypot(dx, dz);
  const k = Math.min(1, dt * (ch ? 10 : 3));
  npc.position.x += dx * k; npc.position.z += dz * k;
  const moving = d > 0.05;
  npc.position.y = moving ? Math.abs(Math.sin(performance.now() / 90)) * 0.08 : 0;
  if (moving && (ch || d > 0.3)) npc.rotation.y = Math.atan2(-dx, -dz);
}
