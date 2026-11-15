// Crew pings: "look here" labels pinned to a point in the world (or inside the moving RV), drawn over the HUD.
import * as THREE from 'three';
import type { RVModel } from '../rv/RV';

const LIFE = 6;

export class Pings {
  private root = document.getElementById('pings')!;
  private list: { el: HTMLElement; p: THREE.Vector3; rv: boolean; t: number }[] = [];
  private v = new THREE.Vector3();

  constructor(private rv: RVModel, private camera: THREE.Camera) {}

  /** `p` is RV-local when `inRV`, else world space. One live ping per player. */
  add(who: string, inRV: boolean, p: [number, number, number]) {
    if (!p.every((n) => Number.isFinite(n))) return;
    const i = this.list.findIndex((q) => q.el.dataset.who === who);
    if (i >= 0) { this.list[i].el.remove(); this.list.splice(i, 1); }
    const el = document.createElement('div');
    el.dataset.who = who;
    this.root.append(el);
    this.list.push({ el, p: new THREE.Vector3(...p), rv: inRV, t: LIFE });
  }

  clear() { for (const q of this.list) q.el.remove(); this.list = []; }

  update(dt: number) {
    if (!this.list.length) return;
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert(); // don't rely on the last render
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      if ((q.t -= dt) <= 0) { q.el.remove(); this.list.splice(i, 1); continue; }
      this.v.copy(q.p);
      if (q.rv) this.rv.body.localToWorld(this.v);
      const dist = this.v.distanceTo(cam);
      this.v.project(this.camera);
      const shown = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      q.el.style.display = shown ? '' : 'none';
      if (!shown) continue;
      q.el.style.left = `${(this.v.x + 1) / 2 * innerWidth}px`;
      q.el.style.top = `${(1 - this.v.y) / 2 * innerHeight}px`;
      q.el.style.opacity = String(Math.min(1, q.t));
      q.el.textContent = `📍 ${q.el.dataset.who} · ${dist < 10 ? dist.toFixed(1) : Math.round(dist)} m`;
    }
  }
}
