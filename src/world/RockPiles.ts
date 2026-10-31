// Roadside rock piles you can raid for ammo. Positions come from World.chunkRocks (deterministic),
// the host keeps track of how many rocks are left in each.
import * as THREE from 'three';
import { routeVersion } from './Route';
import { CHUNK, chunkRocks, groundY } from './World';

export class RockPiles {
  readonly group = new THREE.Group();
  private piles = new Map<number, THREE.Group>();
  private geo = new THREE.DodecahedronGeometry(1, 0);
  private mats = ['#8a8176', '#6f675d', '#a09585'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  private ver = '';

  private build(i: number): THREE.Group | null {
    const p = chunkRocks(i);
    if (!p) return null;
    const g = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4 + i, r = k === 0 ? 0 : 0.3 + (k % 3) * 0.18;
      const s = k === 0 ? 0.42 : 0.14 + ((k * 7 + i) % 5) * 0.045;
      const m = new THREE.Mesh(this.geo, this.mats[(k + i) % 3]);
      m.scale.set(s * 1.15, s * 0.75, s);
      m.position.set(Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
      m.rotation.set(k, a, k * 0.5);
      m.castShadow = true;
      g.add(m);
    }
    g.traverse((o) => { o.userData.iid = `rocks:${i}`; });
    g.position.set(p.x, groundY(p.x, p.z), p.z);
    return g;
  }

  /** Keep piles built for the stretch of road around z. */
  update(z: number) {
    const ver = String(routeVersion());
    if (ver !== this.ver) { this.ver = ver; for (const [, g] of this.piles) this.group.remove(g); this.piles.clear(); }
    const ci = Math.floor(-z / CHUNK);
    for (let i = Math.max(1, ci - 2); i <= ci + 4; i++) {
      if (this.piles.has(i)) continue;
      const g = this.build(i);
      if (g) { this.group.add(g); this.piles.set(i, g); } else this.piles.set(i, new THREE.Group());
    }
    for (const [i, g] of this.piles) if (i < ci - 3 || i > ci + 6) { this.group.remove(g); this.piles.delete(i); }
  }
}
