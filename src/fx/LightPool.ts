// Fixed light budget. Three.js recompiles every shader whenever the number of visible lights
// changes, which froze the game for 1–2 s (a cop showing up, NOS, a grease fire, driving past a stop).
// Local lights are PoolLight markers instead; a fixed set of real PointLights follows the nearest ones.
import * as THREE from 'three';

const all = new Set<PoolLight>();

/** Drop-in stand-in for a THREE.PointLight. Not a light itself: the pool lends it a real one. */
export class PoolLight extends THREE.Object3D {
  readonly color: THREE.Color;
  intensity: number;
  distance: number;
  decay: number;
  /** seconds spent outside the scene; removed from the pool after a while */
  detached = 0;
  constructor(color: THREE.ColorRepresentation = '#ffffff', intensity = 1, distance = 0, decay = 2) {
    super();
    this.color = new THREE.Color(color);
    this.intensity = intensity; this.distance = distance; this.decay = decay;
    all.add(this);
  }
}

const tmp = new THREE.Vector3();

export class LightPool {
  private real: THREE.PointLight[] = [];
  private picks: { p: PoolLight; score: number; x: number; y: number; z: number }[] = [];

  constructor(private scene: THREE.Scene, size = 6) {
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 1, 1);
      scene.add(l); this.real.push(l);
    }
  }

  /** Call once per frame before rendering. */
  update(cam: THREE.Vector3, dt: number) {
    const picks = this.picks; picks.length = 0;
    for (const p of all) {
      let o: THREE.Object3D = p, vis = p.visible;
      while (o.parent) { o = o.parent; if (!o.visible) vis = false; }
      if (o !== this.scene) { p.detached += dt; if (p.detached > 20) all.delete(p); continue; }
      p.detached = 0;
      if (!vis || p.intensity <= 0) continue;
      p.updateWorldMatrix(true, false);
      tmp.setFromMatrixPosition(p.matrixWorld);
      const reach = p.distance > 0 ? p.distance : 40;
      const d = tmp.distanceTo(cam);
      if (d > reach + 120) continue;
      picks.push({ p, score: d - reach * 0.5, x: tmp.x, y: tmp.y, z: tmp.z });
    }
    picks.sort((a, b) => a.score - b.score);
    this.real.forEach((l, i) => {
      const c = picks[i];
      if (!c) { l.intensity = 0; return; }
      l.position.set(c.x, c.y, c.z);
      l.color.copy(c.p.color); l.intensity = c.p.intensity; l.distance = c.p.distance; l.decay = c.p.decay;
    });
  }
}
