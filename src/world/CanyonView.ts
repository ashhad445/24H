// Client view of Devil's Canyon hazards: falling boulders with dust trails, rubble when they shatter, the bandits' couch.
import * as THREE from 'three';
import type { SharedState } from '../types';

interface Bit { m: THREE.Mesh; vx: number; vy: number; vz: number; t: number }

export class CanyonView {
  private group = new THREE.Group();
  private rocks = new Map<number, { m: THREE.Mesh; broke: boolean }>();
  private bits: Bit[] = [];
  private puffs: Bit[] = [];
  private rockGeo = new THREE.DodecahedronGeometry(1, 0);
  private rockMat = new THREE.MeshStandardMaterial({ color: '#9c5a36', roughness: 1, flatShading: true });
  private dustMat = new THREE.MeshBasicMaterial({ color: '#c9a06a', transparent: true, opacity: 0.5, depthWrite: false });
  private dustGeo = new THREE.SphereGeometry(1, 6, 4);
  private couch: THREE.Group;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    // a sad floral couch
    this.couch = new THREE.Group();
    const fabric = new THREE.MeshStandardMaterial({ color: '#8e3b46', roughness: 1 });
    const add = (w: number, h: number, l: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), fabric); m.position.set(x, y, z); m.castShadow = true; this.couch.add(m); };
    add(2.2, 0.45, 0.9, 0, 0.35, 0); add(2.2, 0.7, 0.25, 0, 0.8, 0.35); add(0.25, 0.55, 0.9, -1.1, 0.6, 0); add(0.25, 0.55, 0.9, 1.1, 0.6, 0);
    this.couch.visible = false;
    this.group.add(this.couch);
  }

  update(dt: number, s: SharedState) {
    const seen = new Set<number>();
    for (const b of s.boulders) {
      seen.add(b.id);
      let v = this.rocks.get(b.id);
      if (!v) { const m = new THREE.Mesh(this.rockGeo, this.rockMat); m.castShadow = true; this.group.add(m); v = { m, broke: false }; this.rocks.set(b.id, v); }
      v.m.scale.setScalar(b.r);
      v.m.position.set(b.x, b.y, b.z);
      v.m.rotation.x += (Math.hypot(b.vx, b.vz) / b.r) * dt + (b.y > b.r + 0.2 ? dt * 2 : 0);
      if (b.y > b.r + 0.5 && Math.random() < dt * 25) this.puff(b.x, b.y, b.z, 0.6 + Math.random() * 0.6);
      if (b.broken > 0 && !v.broke) {
        // shatter: the rock becomes a spray of chunks and a dust cloud
        v.broke = true; v.m.visible = false;
        for (let i = 0; i < 9; i++) {
          const m = new THREE.Mesh(this.rockGeo, this.rockMat); m.scale.setScalar(b.r * (0.2 + Math.random() * 0.25)); m.position.set(b.x, b.y, b.z); m.castShadow = true;
          this.group.add(m);
          this.bits.push({ m, vx: (Math.random() - 0.5) * 9, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 9, t: 6 });
        }
        for (let i = 0; i < 6; i++) this.puff(b.x + (Math.random() - 0.5) * 2, b.y, b.z + (Math.random() - 0.5) * 2, 1.5 + Math.random());
      }
    }
    for (const [id, v] of this.rocks) if (!seen.has(id)) { this.group.remove(v.m); this.rocks.delete(id); }

    for (const p of this.bits) {
      p.t -= dt; p.vy -= 9.8 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(p.m.scale.x * 0.5, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      if (p.m.position.y <= p.m.scale.x * 0.5) { p.vx *= 0.9; p.vz *= 0.9; p.vy = 0; }
      p.m.rotation.x += p.vx * dt;
    }
    for (const p of this.puffs) {
      p.t -= dt; p.m.position.y += p.vy * dt;
      p.m.scale.multiplyScalar(1 + dt * 0.8);
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 * (p.t / 2.5));
    }
    this.bits = this.bits.filter((p) => (p.t > 0 ? true : (this.group.remove(p.m), false)));
    this.puffs = this.puffs.filter((p) => (p.t > 0 ? true : (this.group.remove(p.m), (p.m.material as THREE.Material).dispose(), false)));

    const c = s.bandits?.couch;
    this.couch.visible = !!c;
    if (c) { this.couch.position.set(c[0], 0, c[1]); this.couch.rotation.y = c[2]; }
  }

  private puff(x: number, y: number, z: number, size: number) {
    const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
    m.position.set(x, y, z); m.scale.setScalar(size);
    this.group.add(m);
    this.puffs.push({ m, vx: 0, vy: 0.6, vz: 0, t: 2.5 });
  }
}
