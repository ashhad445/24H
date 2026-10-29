// Vultures circle above the RV while anyone in the crew is close to passing out. A health warning you can see.
import * as THREE from 'three';
import type { SharedState } from '../types';

export class Vultures {
  private group = new THREE.Group();
  private birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; ph: number }[] = [];
  private t = 0;
  private a = 0; // fade in/out 0..1

  constructor(scene: THREE.Scene) {
    const body = new THREE.MeshStandardMaterial({ color: '#2b2320', roughness: 1 });
    const head = new THREE.MeshStandardMaterial({ color: '#c97b6b', roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 3, 6).rotateX(Math.PI / 2), body);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), head); h.position.set(0, 0.08, -0.55);
      const wing = new THREE.BoxGeometry(1.6, 0.04, 0.5);
      const l = new THREE.Mesh(wing.clone().translate(-0.8, 0, 0), body), r = new THREE.Mesh(wing.translate(0.8, 0, 0), body);
      g.add(b, h, l, r);
      this.group.add(g);
      this.birds.push({ g, l, r, ph: i * 1.7 });
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number, s: SharedState, rvPos: THREE.Vector3) {
    this.t += dt;
    const low = Object.values(s.crew).some((c) => (c.hp ?? 100) < 25);
    this.a = Math.max(0, Math.min(1, this.a + (low ? dt : -dt) * 0.4));
    this.group.visible = this.a > 0.01;
    if (!this.group.visible) return;
    // they hang lower the closer someone is to dying
    this.group.position.set(rvPos.x, 14 + (1 - this.a) * 40, rvPos.z);
    this.birds.forEach((b, i) => {
      const ang = this.t * (0.35 + i * 0.05) + b.ph, rad = 9 + i * 2.5;
      b.g.position.set(Math.cos(ang) * rad, i * 1.4, Math.sin(ang) * rad);
      b.g.rotation.set(0, -ang, -0.35); // bank into the circle, beak forward
      const flap = Math.sin(this.t * 3 + b.ph) * 0.25;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
    });
  }
}
