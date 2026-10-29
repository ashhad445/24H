// Client rendering of NPC vehicles, Roscoe on foot, flashing lights and the siren.
import * as THREE from 'three';
import { PoolLight } from '../fx/LightPool';
import { makeNpc } from '../models/npcs';
import type { RVModel } from '../rv/RV';
import { chaserPose } from '../stops/chaseView';
import { NPC_DIMS } from './TrafficSim';
import type { NPCState, SharedState } from '../types';

const PAINT = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#f5f5f5', '#8e24aa'];

export interface View {
  g: THREE.Group; k: NPCState['k'];
  red?: THREE.MeshStandardMaterial; blue?: THREE.MeshStandardMaterial; heads: THREE.MeshStandardMaterial; flash?: PoolLight;
  tail: THREE.MeshStandardMaterial; sigL: THREE.MeshStandardMaterial; sigR: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[]; wheelR: number; lastSpeed: number; brakeT: number; sigT: number;
}

const tire = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
const hub = new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.3, metalness: 0.85 });
const glass = new THREE.MeshStandardMaterial({ color: '#5f8794', roughness: 0.08, metalness: 0.5 });
const chrome = new THREE.MeshStandardMaterial({ color: '#d0d4d8', roughness: 0.3, metalness: 0.9 });
const black = new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.75 });
const skinM = new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 0.8 });

function box(g: THREE.Object3D, mat: THREE.Material, w: number, h: number, l: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}

/** Extrude a side profile [z, y] (front = −z) across the width, with softened edges. */
function prof(g: THREE.Object3D, mat: THREE.Material, pts: [number, number][], w: number, bevel = 0.07, x = 0) {
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.02, w - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, -Math.max(0.02, w - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.x = x; m.castShadow = true; m.receiveShadow = true; g.add(m);
  return m;
}

function wheel(v: View, g: THREE.Object3D, r: number, x: number, z: number, wide = 0.26) {
  const w = new THREE.Group(); w.position.set(x, r, z);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wide, 16).rotateZ(Math.PI / 2), tire); t.castShadow = true;
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wide + 0.02, 10).rotateZ(Math.PI / 2), hub);
  const nub = new THREE.Mesh(new THREE.BoxGeometry(wide + 0.04, r * 0.14, r * 0.7), black); // so rolling is visible
  w.add(t, h, nub); g.add(w); v.wheels.push(w);
}

/** A person at the wheel, seen through the glass. */
function driver(g: THREE.Object3D, x: number, y: number, z: number, hat?: string) {
  const d = new THREE.Group(); d.position.set(x, y, z);
  d.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.25, 4, 8), new THREE.MeshStandardMaterial({ color: '#546e7a' })));
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinM); h.position.y = 0.4; d.add(h);
  if (hat) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 10), new THREE.MeshStandardMaterial({ color: hat })); c.position.y = 0.55; d.add(c); }
  g.add(d);
}

/** Vehicle facing −Z (like the RV). */
export function buildVehicle(k: NPCState['k'], c: number): View {
  const g = new THREE.Group();
  const heads = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c0', emissiveIntensity: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff1a1a', emissiveIntensity: 0.35 });
  const sigL = new THREE.MeshStandardMaterial({ color: '#8a5a00', emissive: '#ffa000', emissiveIntensity: 0 });
  const sigR = sigL.clone();
  g.rotation.order = 'YXZ'; // yaw first, then roll about the car's own length
  const view: View = { g, k, heads, tail, sigL, sigR, wheels: [], wheelR: 0.34, lastSpeed: 0, brakeT: 0, sigT: 0 };
  const paintC = k === 'cop' ? '#f5f5f5' : k === 'shark' ? '#18181b' : k === 'bandit' ? '#6d6a64' : PAINT[c % PAINT.length];
  const paint = new THREE.MeshStandardMaterial({ color: paintC, roughness: k === 'shark' ? 0.85 : 0.35, metalness: k === 'shark' ? 0.1 : 0.35 });
  const [hw, hl] = NPC_DIMS[k];
  const w = hw * 2, l = hl * 2, f = -hl, b = hl; // front / back z
  const lights = (y: number, inset = 0.3) => {
    for (const s of [-1, 1]) {
      box(g, heads, 0.3, 0.13, 0.05, s * (hw - inset), y, f - 0.01);
      box(g, tail, 0.32, 0.12, 0.05, s * (hw - inset + 0.03), y, b + 0.01);
      box(g, s < 0 ? sigL : sigR, 0.14, 0.09, 0.05, s * (hw - 0.12), y - 0.02, f - 0.01);
      box(g, s < 0 ? sigL : sigR, 0.14, 0.09, 0.05, s * (hw - 0.1), y - 0.17, b + 0.01);
    }
  };

  if (k === 'sedan' || k === 'cop') {
    // rounded sedan: sloped hood, glasshouse, short trunk
    prof(g, paint, [[f, 0.38], [f, 0.74], [f + 0.9, 0.88], [f + 1.5, 0.92], [b - 0.9, 0.92], [b, 0.82], [b, 0.38]], w);
    prof(g, glass, [[f + 1.55, 0.9], [f + 2.2, 1.42], [b - 1.5, 1.42], [b - 0.95, 0.9]], w * 0.9, 0.04);
    prof(g, paint, [[f + 2.15, 1.4], [f + 2.3, 1.5], [b - 1.6, 1.5], [b - 1.45, 1.4]], w * 0.88, 0.04); // roof
    driver(g, -hw * 0.5, 0.95, f + 2.5, k === 'cop' ? '#5d4037' : undefined);
    if (k === 'sedan' && c % 3 === 0) driver(g, hw * 0.5, 0.95, f + 2.5);
    box(g, chrome, w + 0.05, 0.14, 0.12, 0, 0.45, f - 0.02);
    box(g, chrome, w + 0.05, 0.14, 0.12, 0, 0.45, b + 0.02);
    lights(0.7);
  } else if (k === 'pickup' || k === 'bandit') {
    prof(g, paint, [[f, 0.4], [f, 0.95], [f + 0.8, 1.05], [f + 2.2, 1.1], [f + 2.2, 0.4]], w); // hood + cab base
    prof(g, paint, [[f + 2.0, 1.0], [f + 2.2, 1.0], [f + 2.2, 1.85], [f + 3.0, 1.85], [f + 3.3, 1.05], [f + 3.3, 1.0]], w * 0.95, 0.06); // cab
    prof(g, glass, [[f + 2.4, 1.1], [f + 2.45, 1.75], [f + 2.9, 1.75], [f + 3.15, 1.1]], w * 0.97, 0.03);
    // bed: floor + sides + tailgate
    box(g, black, w * 0.9, 0.06, 1.9, 0, 0.8, b - 1.0);
    for (const s of [-1, 1]) prof(g, paint, [[b - 2.0, 0.4], [b - 2.0, 1.15], [b, 1.15], [b, 0.4]], 0.14, 0.03, s * (hw - 0.07));
    box(g, paint, w * 0.95, 0.75, 0.1, 0, 0.78, b - 0.04);
    driver(g, -hw * 0.45, 1.1, f + 2.9, k === 'bandit' ? '#b71c1c' : '#a1887f');
    if (k === 'bandit') {
      queueMicrotask(() => g.traverse((o) => { o.userData.iid = 'bandit'; })); // after the wheels are added
      // two more goons standing in the bed, red bandanas, a cow skull on the hood, rust patches
      driver(g, -hw * 0.4, 1.35, b - 1.2, '#b71c1c'); driver(g, hw * 0.4, 1.35, b - 0.6, '#b71c1c');
      const bone = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.9 });
      box(g, bone, 0.35, 0.14, 0.4, 0, 1.1, f + 0.4);
      for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45, 6).rotateZ(s * Math.PI / 2), bone); horn.position.set(s * 0.38, 1.15, f + 0.35); g.add(horn); }
      const rust = new THREE.MeshStandardMaterial({ color: '#8d4a24', roughness: 1 });
      for (const [x, y, z] of [[hw + 0.01, 0.7, f + 0.8], [-hw - 0.01, 0.6, b - 0.6], [hw + 0.01, 0.9, b - 1.3]]) box(g, rust, 0.02, 0.3, 0.6, x, y, z);
    }
    box(g, chrome, w + 0.05, 0.16, 0.14, 0, 0.5, f - 0.03);
    box(g, chrome, w + 0.05, 0.14, 0.12, 0, 0.5, b + 0.03);
    lights(0.82);
  } else if (k === 'camper') {
    const cream = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.7 });
    prof(g, cream, [[f, 0.45], [f, 1.5], [f + 0.5, 2.0], [f + 1.7, 2.1], [f + 1.7, 3.3], [b, 3.3], [b, 0.45]], w); // cab nose + box
    prof(g, paint, [[f + 0.1, 1.0], [f + 0.1, 1.3], [b, 1.3], [b, 1.0]], w + 0.04, 0.02); // stripe
    prof(g, glass, [[f + 0.55, 1.55], [f + 0.8, 2.0], [f + 1.65, 2.0], [f + 1.65, 1.55]], w * 0.92, 0.03);
    for (const s of [-1, 1]) for (const z of [-0.2, 1.6]) box(g, glass, 0.03, 0.6, 0.9, s * (hw + 0.02), 2.2, z - 0.3);
    box(g, new THREE.MeshStandardMaterial({ color: '#cfd8dc' }), 0.9, 0.22, 0.9, 0, 3.4, 0.4); // roof AC
    box(g, chrome, 0.08, 1.8, 0.05, hw * 0.7, 1.9, b + 0.05); // ladder
    driver(g, -hw * 0.5, 1.25, f + 1.2, '#ffd54f');
    box(g, chrome, w + 0.05, 0.16, 0.14, 0, 0.55, f - 0.02);
    box(g, chrome, w + 0.05, 0.16, 0.14, 0, 0.55, b + 0.02);
    lights(0.85);
  } else if (k === 'semi') {
    const trailer = new THREE.MeshStandardMaterial({ color: '#e8eaed', roughness: 0.6 });
    // tractor: long hood, sleeper cab
    prof(g, paint, [[f, 0.55], [f, 1.5], [f + 1.6, 1.6], [f + 1.6, 3.0], [f + 2.9, 3.0], [f + 2.9, 0.55]], w);
    box(g, glass, w * 0.96, 0.9, 0.04, 0, 2.3, f + 1.62); // windshield
    box(g, black, w * 0.6, 0.3, 0.04, 0, 1.0, f - 0.02); // grille
    for (const s of [-1, 1]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8), chrome); stack.position.set(s * (hw + 0.1), 2.0, f + 2.0); g.add(stack);
    }
    // trailer
    const tl = hl * 2 - 3.0;
    box(g, trailer, w + 0.1, 2.9, tl, 0, 2.25, f + 3.0 + tl / 2);
    for (let i = 0; i < 9; i++) box(g, trailer, w + 0.16, 2.9, 0.06, 0, 2.25, f + 3.2 + i * 0.62);
    box(g, paint, w + 0.12, 0.35, tl, 0, 1.25, f + 3.0 + tl / 2);
    driver(g, -hw * 0.45, 1.85, f + 2.3, '#c62828');
    box(g, chrome, w + 0.1, 0.2, 0.2, 0, 0.65, f - 0.05);
    lights(1.0, 0.35);
  } else {
    // loan shark muscle car: low, long hood, short cabin
    prof(g, paint, [[f, 0.36], [f, 0.62], [f + 1.2, 0.78], [f + 2.6, 0.82], [b - 0.5, 0.78], [b, 0.7], [b, 0.36]], w);
    prof(g, glass, [[f + 2.6, 0.8], [f + 3.1, 1.2], [b - 1.0, 1.2], [b - 0.5, 0.8]], w * 0.88, 0.03);
    prof(g, black, [[f + 3.05, 1.18], [f + 3.15, 1.26], [b - 1.05, 1.26], [b - 0.95, 1.18]], w * 0.86, 0.03);
    box(g, new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.6 }), 0.25, 0.01, l * 0.98, 0, 0.83, 0);
    box(g, black, 0.5, 0.18, 0.7, 0, 0.88, f + 1.0); // hood scoop
    for (let i = -3; i <= 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6).rotateX(-Math.PI / 2), chrome);
      spike.position.set(i * 0.25, 0.45, f - 0.2); g.add(spike);
    }
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 3), new THREE.MeshStandardMaterial({ color: '#455a64' }));
    fin.position.set(0, 1.55, 0.5); fin.scale.set(0.3, 1, 1.4); g.add(fin);
    box(g, black, w + 0.05, 0.14, 0.12, 0, 0.42, f - 0.02);
    lights(0.62);
  }

  // wheels
  const wr = k === 'semi' ? 0.5 : k === 'camper' ? 0.4 : 0.34;
  view.wheelR = wr;
  const axles = k === 'semi' ? [f + 1.0, b - 1.8, b - 0.7] : [f + l * 0.2, b - l * 0.2];
  for (const z of axles) for (const s of [-1, 1]) wheel(view, g, wr, s * (hw - 0.05), z, k === 'semi' ? 0.36 : 0.26);
  // wheel arches
  if (k !== 'semi') for (const z of axles) for (const s of [-1, 1]) box(g, black, 0.06, wr * 1.5, wr * 2.6, s * (hw + 0.01), wr * 1.15, z);

  if (k === 'cop') {
    box(g, black, w + 0.02, 0.32, l * 0.45, 0, 0.62, 0.1); // two-tone doors
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.18, 5), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 }));
    for (const s of [-1, 1]) { const st = star.clone(); st.position.set(s * (hw + 0.02), 0.62, 0.1); st.rotation.y = s * Math.PI / 2; g.add(st); }
    view.red = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff1a1a', emissiveIntensity: 0 });
    view.blue = new THREE.MeshStandardMaterial({ color: '#006', emissive: '#2962ff', emissiveIntensity: 0 });
    const roofY = 1.55;
    box(g, black, w * 0.7, 0.08, 0.3, 0, roofY, 0.1);
    box(g, view.red, w * 0.32, 0.14, 0.26, -w * 0.18, roofY + 0.1, 0.1);
    box(g, view.blue, w * 0.32, 0.14, 0.26, w * 0.18, roofY + 0.1, 0.1);
    view.flash = new PoolLight('#ff1a1a', 0, 22, 1.2); view.flash.position.set(0, roofY + 0.5, 0.1); g.add(view.flash);
  }
  return view;
}

function buildRoscoe() {
  const g = makeNpc('roscoe');
  g.traverse((o) => { o.userData.iid = 'roscoe'; });
  return g;
}

/** One of every vehicle type, never added to the scene: compiled at boot so the first cop / semi doesn't stall a frame. */
export function vehicleSamples(): THREE.Group {
  const g = new THREE.Group();
  for (const k of ['sedan', 'pickup', 'camper', 'semi', 'cop', 'shark', 'bandit'] as NPCState['k'][]) g.add(buildVehicle(k, 0).g);
  return g;
}

export class TrafficView {
  private views = new Map<number, View>();
  private roscoe = buildRoscoe();
  private footRoscoe = makeNpc('roscoe'); // not interactable: you can't pay a man who is tasing you

  constructor(private scene: THREE.Scene, rv: RVModel) {
    // Roscoe stands at the driver's window (RV-local, untilted root so he stays upright)
    this.roscoe.position.set(-2.15, 0, -2.25);
    this.roscoe.rotation.y = -Math.PI / 2; // face +x, toward the RV
    this.roscoe.visible = false;
    rv.root.add(this.roscoe);
    const taser = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: '#ffd600', emissive: '#665500' }));
    taser.position.set(0.3, 1.2, -0.35); this.footRoscoe.add(taser);
    this.footRoscoe.visible = false;
    scene.add(this.footRoscoe);
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
      if (Math.hypot(n.x - p.x, n.z - p.z) > 30) p.set(n.x, p.y, n.z);
      else { p.x += (n.x - p.x) * k; p.z += (n.z - p.z) * k; }
      let dy = n.yaw - v.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.g.rotation.y += dy * k;
      // wrecked cars sag; crashed ones barrel-roll (lifted so the roof, not the ground, takes it)
      const roll = n.roll ?? 0;
      v.g.rotation.z = roll || (n.w > 0 ? 0.06 : 0);
      p.y = roll ? Math.abs(Math.sin(roll)) * NPC_DIMS[n.k][0] + (1 - Math.cos(roll)) * 0.75 : 0;
      v.heads.emissiveIntensity = daylight < 0.5 ? 2.2 : 0.2;
      // wheels roll; brake lights on when slowing; turn signals while changing lanes
      for (const wh of v.wheels) wh.rotation.x -= (n.speed * dt) / v.wheelR;
      v.brakeT = n.speed < v.lastSpeed - 0.08 ? 0.35 : Math.max(0, v.brakeT - dt);
      v.lastSpeed = n.speed;
      v.tail.emissiveIntensity = (daylight < 0.5 ? 0.9 : 0.35) + (v.brakeT > 0 || n.w > 0 ? 2.2 : 0);
      const turning = Math.abs(dy) > 0.012 && n.w === 0;
      v.sigT = turning ? v.sigT + dt : 0;
      const blink = turning && Math.floor(v.sigT * 3) % 2 === 0 ? 2.5 : 0;
      const hazard = n.w > 0 && Math.floor(t * 2.5) % 2 === 0 ? 2.5 : 0;
      v.sigL.emissiveIntensity = dy > 0 ? Math.max(blink, hazard) : hazard;
      v.sigR.emissiveIntensity = dy < 0 ? Math.max(blink, hazard) : hazard;
      if (n.k === 'cop' && v.red && v.blue && v.flash) {
        const on = (s.cop.phase > 0 && s.cop.phase < 4) || s.cop.phase === 5;
        const phase = Math.floor(t * 4) % 2 === 0;
        v.red.emissiveIntensity = on && phase ? 3 : 0.1;
        v.blue.emissiveIntensity = on && !phase ? 3 : 0.1;
        v.flash.color.set(phase ? '#ff1a1a' : '#2962ff');
        v.flash.intensity = on ? 18 : 0;
        if (on && s.cop.phase < 3) siren = Math.max(siren, Math.max(0, 1 - camPos.distanceTo(p) / 250));
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.scene.remove(v.g); this.views.delete(id); }

    this.roscoe.visible = s.cop.phase === 3;
    if (this.roscoe.visible) this.roscoe.position.y = Math.abs(Math.sin(t * 2)) * 0.02;
    // on foot with the taser
    const ft = s.cop.phase === 5 ? s.cop.foot : null;
    if (ft && !this.footRoscoe.visible) this.footRoscoe.position.set(ft.x, 0, ft.z);
    this.footRoscoe.visible = !!ft;
    if (ft) chaserPose(this.footRoscoe, this.scene, ft, [ft.x, ft.z], dt);
    return siren;
  }
}
