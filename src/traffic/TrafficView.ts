// Client rendering of NPC vehicles, Roscoe on foot, flashing lights and the siren.
import * as THREE from 'three';
import type { RVModel } from '../rv/RV';
import type { NPCState, SharedState } from '../types';

const PAINT = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#f5f5f5', '#8e24aa'];

interface View { g: THREE.Group; k: NPCState['k']; red?: THREE.MeshStandardMaterial; blue?: THREE.MeshStandardMaterial; heads: THREE.MeshStandardMaterial; flash?: THREE.PointLight }

const tire = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: '#7fa7b8', roughness: 0.1, metalness: 0.4 });
const chrome = new THREE.MeshStandardMaterial({ color: '#d0d4d8', roughness: 0.3, metalness: 0.9 });
const black = new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.75 });

function box(g: THREE.Group, mat: THREE.Material, w: number, h: number, l: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}

/** Vehicle facing −Z (like the RV). */
function buildVehicle(k: NPCState['k'], c: number): View {
  const g = new THREE.Group();
  const heads = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c0', emissiveIntensity: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff1a1a', emissiveIntensity: 0.5 });
  const view: View = { g, k, heads };
  const paint = new THREE.MeshStandardMaterial({ color: k === 'cop' ? '#f5f5f5' : k === 'shark' ? '#18181b' : PAINT[c % PAINT.length], roughness: k === 'shark' ? 0.85 : 0.4, metalness: k === 'shark' ? 0.1 : 0.3 });
  const dims: Record<NPCState['k'], [number, number, number]> = { sedan: [1.8, 4.4, 0.7], pickup: [2.0, 5.0, 0.85], camper: [2.3, 6.0, 0.9], cop: [1.9, 4.8, 0.72], shark: [1.9, 4.6, 0.6] };
  const [w, l, bodyH] = dims[k];
  const base = 0.32;
  box(g, paint, w, bodyH, l, 0, base + bodyH / 2, 0);
  if (k === 'pickup') {
    box(g, paint, w * 0.95, 0.7, l * 0.38, 0, base + bodyH + 0.35, -l * 0.12);
    box(g, glass, w * 0.96, 0.45, l * 0.36, 0, base + bodyH + 0.4, -l * 0.12);
    box(g, black, w * 0.9, 0.05, l * 0.4, 0, base + bodyH + 0.02, l * 0.27); // bed
  } else if (k === 'camper') {
    box(g, new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.7 }), w, 1.5, l * 0.72, 0, base + bodyH + 0.75, l * 0.12);
    box(g, glass, w * 0.96, 0.5, l * 0.18, 0, base + bodyH + 0.3, -l * 0.33);
    box(g, paint, w + 0.02, 0.18, l * 0.72, 0, base + bodyH + 0.6, l * 0.12);
  } else {
    const cabL = k === 'shark' ? l * 0.38 : l * 0.48;
    box(g, paint, w * 0.88, 0.55, cabL, 0, base + bodyH + 0.27, k === 'shark' ? 0.25 : 0.1);
    box(g, glass, w * 0.9, 0.38, cabL * 0.96, 0, base + bodyH + 0.3, k === 'shark' ? 0.25 : 0.1);
  }
  for (const [x, z] of [[w / 2, l * 0.32], [-w / 2, l * 0.32], [w / 2, -l * 0.32], [-w / 2, -l * 0.32]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14).rotateZ(Math.PI / 2), tire); t.position.set(x, 0.34, z); g.add(t);
  }
  for (const s of [-1, 1]) {
    box(g, heads, 0.32, 0.14, 0.04, s * (w / 2 - 0.3), base + bodyH * 0.6, -l / 2 - 0.01);
    box(g, tail, 0.3, 0.12, 0.04, s * (w / 2 - 0.25), base + bodyH * 0.6, l / 2 + 0.01);
  }
  box(g, k === 'shark' ? black : chrome, w + 0.05, 0.14, 0.12, 0, base + 0.08, -l / 2 - 0.02);
  if (k === 'cop') {
    box(g, black, w + 0.02, 0.32, l * 0.5, 0, base + bodyH * 0.55, 0.1); // two-tone doors
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.18, 5), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 }));
    for (const s of [-1, 1]) { const st = star.clone(); st.position.set(s * (w / 2 + 0.02), base + bodyH * 0.55, 0.1); st.rotation.y = s * Math.PI / 2; g.add(st); }
    view.red = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff1a1a', emissiveIntensity: 0 });
    view.blue = new THREE.MeshStandardMaterial({ color: '#006', emissive: '#2962ff', emissiveIntensity: 0 });
    const roofY = base + bodyH + 0.6;
    box(g, black, w * 0.7, 0.08, 0.3, 0, roofY, 0.1);
    box(g, view.red, w * 0.32, 0.14, 0.26, -w * 0.18, roofY + 0.1, 0.1);
    box(g, view.blue, w * 0.32, 0.14, 0.26, w * 0.18, roofY + 0.1, 0.1);
    view.flash = new THREE.PointLight('#ff1a1a', 0, 22, 1.2); view.flash.position.set(0, roofY + 0.5, 0.1); g.add(view.flash);
  }
  if (k === 'shark') {
    // red racing stripes, hood scoop and a bumper full of spikes
    box(g, new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.6 }), 0.25, 0.01, l * 0.98, 0, base + bodyH + 0.005, 0);
    box(g, black, 0.5, 0.18, 0.7, 0, base + bodyH + 0.1, -l * 0.25);
    for (let i = -3; i <= 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6).rotateX(-Math.PI / 2), chrome);
      spike.position.set(i * 0.25, base + 0.1, -l / 2 - 0.2); g.add(spike);
    }
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 3), new THREE.MeshStandardMaterial({ color: '#455a64' }));
    fin.position.set(0, base + bodyH + 0.85, 0.5); fin.scale.set(0.3, 1, 1.4); g.add(fin);
  }
  return view;
}

function buildRoscoe() {
  const g = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: '#c8b27a', roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 6, 14), uniform); body.position.y = 0.78; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skin); head.position.y = 1.68;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.22, 14), new THREE.MeshStandardMaterial({ color: '#5d4037' })); hat.position.y = 1.95;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 18), new THREE.MeshStandardMaterial({ color: '#5d4037' })); brim.position.y = 1.86;
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), black); shades.position.set(0, 1.72, -0.23);
  const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: '#3e2723' })); mustache.position.set(0, 1.6, -0.24);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.07, 5), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 })); badge.position.set(-0.14, 1.15, -0.33);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: '#fafafa' })); pad.position.set(0.3, 1.05, -0.3); pad.rotation.x = -0.5;
  g.add(body, head, hat, brim, shades, mustache, badge, pad);
  g.traverse((o) => { o.userData.iid = 'roscoe'; });
  return g;
}

export class TrafficView {
  private views = new Map<number, View>();
  private roscoe = buildRoscoe();

  constructor(private scene: THREE.Scene, rv: RVModel) {
    // Roscoe stands at the driver's window (RV-local, untilted root so he stays upright)
    this.roscoe.position.set(-2.15, 0, -2.25);
    this.roscoe.rotation.y = -Math.PI / 2; // face +x, toward the RV
    this.roscoe.visible = false;
    rv.root.add(this.roscoe);
  }

  /** Returns the siren loudness (0–1) for the audio mix. */
  update(dt: number, s: SharedState, camPos: THREE.Vector3, daylight: number): number {
    const seen = new Set<number>();
    const t = performance.now() / 1000;
    let siren = 0;
    for (const n of s.npcs) {
      seen.add(n.id);
      let v = this.views.get(n.id);
      if (!v) { v = buildVehicle(n.k, n.c); this.views.set(n.id, v); this.scene.add(v.g); v.g.position.set(n.x, 0, n.z); v.g.rotation.y = n.yaw; }
      const k = Math.min(1, dt * 12);
      const p = v.g.position;
      if (Math.hypot(n.x - p.x, n.z - p.z) > 30) p.set(n.x, 0, n.z);
      else { p.x += (n.x - p.x) * k; p.z += (n.z - p.z) * k; }
      let dy = n.yaw - v.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.g.rotation.y += dy * k;
      v.g.rotation.z = n.w > 0 ? 0.06 : 0; // wrecked cars sag
      v.heads.emissiveIntensity = daylight < 0.5 ? 2.2 : 0.2;
      if (n.k === 'cop' && v.red && v.blue && v.flash) {
        const on = s.cop.phase > 0 && s.cop.phase < 4;
        const phase = Math.floor(t * 4) % 2 === 0;
        v.red.emissiveIntensity = on && phase ? 3 : 0.1;
        v.blue.emissiveIntensity = on && !phase ? 3 : 0.1;
        v.flash.color.set(phase ? '#ff1a1a' : '#2962ff');
        v.flash.intensity = on ? 18 : 0;
        if (on && s.cop.phase !== 3) siren = Math.max(siren, Math.max(0, 1 - camPos.distanceTo(p) / 250));
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.scene.remove(v.g); this.views.delete(id); }

    this.roscoe.visible = s.cop.phase === 3;
    if (this.roscoe.visible) this.roscoe.position.y = Math.abs(Math.sin(t * 2)) * 0.02;
    return siren;
  }
}
