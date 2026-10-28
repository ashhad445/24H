// Gameplay particle effects: extinguisher foam, grease-fire flames, cabin smoke.
// Effects inside the RV live in the RV body's local frame so they ride along at 70 MPH.
import * as THREE from 'three';
import { RV } from '../config';
import type { RVModel } from '../rv/RV';
import { Particles } from './Particles';

const insideBounds = (x: number, z: number) => Math.abs(x) < RV.innerHalfW && z > RV.zFront && z < RV.zRear - 0.04;
const FIRE_POS = new THREE.Vector3(1.0, 1.66, 0.53);

export class Effects {
  private foamRV: Particles;
  private foamWorld: Particles;
  private flames: Particles;
  private smoke: Particles;
  private all: Particles[];
  private v = new THREE.Vector3();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private fireAcc = 0;
  private smokeAcc = 0;

  constructor(private rv: RVModel, dyn: THREE.Group) {
    const rvFloor = (x: number, z: number, y: number) => {
      let f = insideBounds(x, z) ? RV.floorY : 0;
      for (const b of rv.colliders) {
        if (b.top !== undefined && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y >= b.top - 0.15) f = Math.max(f, b.top);
      }
      return f;
    };
    this.foamRV = new Particles(2500, { blob: true, floor: rvFloor });
    this.foamWorld = new Particles(1200, { blob: true, floor: () => 0 });
    this.flames = new Particles(600, { additive: true });
    this.smoke = new Particles(500, { ceiling: () => RV.ceilY - 0.12 });
    rv.body.add(this.foamRV.points, this.flames.points, this.smoke.points);
    dyn.add(this.foamWorld.points);
    this.all = [this.foamRV, this.foamWorld, this.flames, this.smoke];
  }

  setScale(h: number, fov: number) { for (const s of this.all) s.setScale(h, fov); }

  /** Spray foam from a nozzle (world position + world direction) for dt seconds. */
  spray(worldPos: THREE.Vector3, worldDir: THREE.Vector3, dt: number) {
    const local = this.rv.body.worldToLocal(this.p.copy(worldPos));
    const inside = insideBounds(local.x, local.z);
    const sys = inside ? this.foamRV : this.foamWorld;
    const origin = inside ? local : worldPos;
    const dir = inside ? worldDir.clone().applyQuaternion(this.rv.body.getWorldQuaternion(this.q).invert()) : worldDir.clone();
    const n = Math.round(150 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const spread = 0.13;
      this.v.copy(dir).add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2)).normalize();
      this.v.multiplyScalar(5.5 + Math.random() * 2.5);
      // dense foam blobs that splat and pile up
      sys.emit(origin, this.v, { life: 1.2, size: [0.035, 0.11 + Math.random() * 0.07], color: ['#ffffff', '#eef3f6'], alpha: [0.95, 0.9], gravity: 7, drag: 1.4, stick: true, stickLife: 6 });
    }
    // soft mist around the jet
    if (Math.random() < 0.6) {
      this.v.copy(dir).multiplyScalar(3 + Math.random() * 2);
      sys.emit(origin, this.v, { life: 0.5, size: [0.08, 0.45], color: ['#ffffff', '#dfe6ea'], alpha: [0.35, 0], gravity: 1, drag: 3 });
    }
  }

  update(dt: number, fire: number) {
    // flames: hot core → orange → red, licking upward from the skillet
    if (fire > 0) {
      this.fireAcc += fire * 160 * dt + 25 * dt;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        const spread = 0.07 + fire * 0.12;
        this.p.set(FIRE_POS.x + (Math.random() - 0.5) * spread * 2, FIRE_POS.y, FIRE_POS.z + (Math.random() - 0.5) * spread * 2);
        this.v.set((Math.random() - 0.5) * 0.4, (1.0 + Math.random() * 1.3) * (0.6 + fire * 0.8), (Math.random() - 0.5) * 0.4);
        const big = 0.12 + fire * 0.22;
        this.flames.emit(this.p, this.v, { life: 0.3 + Math.random() * 0.35, size: [big * (0.7 + Math.random() * 0.6), 0.03], color: ['#ffd27a', '#ff2d00'], alpha: [0.7, 0], gravity: -1.5, drag: 1.5 });
        if (Math.random() < 0.05) {
          this.v.set((Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2);
          this.flames.emit(this.p, this.v, { life: 0.8 + Math.random() * 0.6, size: [0.025, 0.01], color: ['#ffd54f', '#ff6d00'], alpha: [1, 0], gravity: 1.5, drag: 0.5 });
        }
      }
      // thick smoke that rolls along the ceiling
      this.smokeAcc += fire * 30 * dt;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        this.p.set(FIRE_POS.x + (Math.random() - 0.5) * 0.2, FIRE_POS.y + 0.35 + fire * 0.3, FIRE_POS.z + (Math.random() - 0.5) * 0.2);
        this.v.set((Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5);
        this.smoke.emit(this.p, this.v, { life: 3 + Math.random() * 2, size: [0.25, 1.1 + Math.random() * 0.5], color: ['#2b2724', '#5a5550'], alpha: [0.6, 0], gravity: -0.4, drag: 0.6 });
      }
    }
    for (const s of this.all) s.update(dt);
  }
}
