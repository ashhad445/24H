// Procedural meshes for road encounters: cows, the ostrich, cones, road signs, the crossing and the train.
// Everything faces −Z (like the RV) unless noted.
import * as THREE from 'three';
import { PoolLight } from '../fx/LightPool';
import { canvasTex } from '../stops/kit';
import { TRAIN } from './kinds/train';

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const M = {
  cowW: std('#f2efe9'), cowB: std('#262321'), pink: std('#e8a3a0'), horn: std('#e6dcc3'), hoof: std('#2b2018'),
  ostB: std('#1b1b1b', { roughness: 0.95 }), ostW: std('#f5f5f0'), ostSkin: std('#d9a3a0'),
  cone: std('#ff6d00', { roughness: 0.6 }), coneW: std('#f5f5f5', { emissive: '#666', emissiveIntensity: 0.3 }), coneBase: std('#212121'),
  post: std('#9aa0a6', { metalness: 0.6, roughness: 0.4 }), steel: std('#6b6f73', { metalness: 0.6, roughness: 0.5 }),
  rail: std('#8a8f94', { metalness: 0.8, roughness: 0.35 }), tie: std('#4e3b2a', { roughness: 1 }), ballast: std('#7d756c', { roughness: 1 }),
  rubber: std('#2a2a2a', { roughness: 1 }), black: std('#151515'), white: std('#f5f5f5'),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);

// ------------------------------------------------------------------ animals
export interface Legged { g: THREE.Group; legs: THREE.Object3D[]; head?: THREE.Object3D }

export function buildCow(spots = Math.random()): Legged {
  const g = new THREE.Group();
  const body = mesh(box(0.85, 0.75, 1.7), M.cowW, 0, 1.05, 0, g);
  // a few black patches
  for (let i = 0; i < 3; i++) {
    const p = mesh(box(0.87, 0.4 + ((spots * 7 + i) % 1) * 0.2, 0.45), M.cowB, 0, 1.1 + (i % 2) * 0.1, -0.5 + i * 0.5 + spots * 0.2, g);
    p.scale.x = 1.002;
  }
  void body;
  const head = new THREE.Group(); head.position.set(0, 1.25, -0.95); g.add(head);
  mesh(box(0.42, 0.42, 0.5), M.cowW, 0, 0, -0.1, head);
  mesh(box(0.36, 0.24, 0.16), M.pink, 0, -0.1, -0.4, head);
  for (const s of [-1, 1]) {
    mesh(box(0.22, 0.06, 0.06), M.horn, s * 0.25, 0.22, 0, head);
    mesh(box(0.14, 0.08, 0.04), M.cowB, s * 0.28, 0.1, 0.05, head);
    mesh(new THREE.SphereGeometry(0.035, 6, 4), M.black, s * 0.14, 0.08, -0.36, head);
  }
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.28, -0.6], [0.28, -0.6], [-0.28, 0.6], [0.28, 0.6]]) {
    const l = new THREE.Group(); l.position.set(x, 0.72, z); g.add(l);
    mesh(box(0.16, 0.66, 0.16), M.cowW, 0, -0.33, 0, l);
    mesh(box(0.17, 0.1, 0.17), M.hoof, 0, -0.67, 0, l);
    legs.push(l);
  }
  mesh(box(0.3, 0.12, 0.3), M.pink, 0, 0.62, 0.45, g, false); // udder
  const tail = mesh(box(0.05, 0.6, 0.05), M.cowW, 0, 1.05, 0.88, g); tail.rotation.x = 0.25;
  return { g, legs, head };
}

export function buildOstrich(): Legged {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.45, 12, 9), M.ostB, 0, 1.25, 0, g); body.scale.set(0.85, 0.75, 1.15);
  const tail = mesh(new THREE.SphereGeometry(0.25, 8, 6), M.ostW, 0, 1.35, 0.45, g); tail.scale.set(1, 0.7, 0.8);
  for (const s of [-1, 1]) { const w = mesh(new THREE.SphereGeometry(0.28, 8, 6), M.ostB, s * 0.36, 1.25, 0.05, g); w.scale.set(0.3, 0.6, 1); }
  const neck = new THREE.Group(); neck.position.set(0, 1.45, -0.32); g.add(neck);
  const n = mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.95, 8), M.ostSkin, 0, 0.45, -0.05, neck); n.rotation.x = -0.12;
  const head = new THREE.Group(); head.position.set(0, 0.95, -0.12); neck.add(head);
  mesh(new THREE.SphereGeometry(0.1, 10, 8), M.ostSkin, 0, 0, 0, head);
  const beak = mesh(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2), std('#c9a26b'), 0, -0.02, -0.14, head); void beak;
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 6, 4), M.black, s * 0.07, 0.03, -0.06, head);
  const legs: THREE.Object3D[] = [];
  for (const x of [-0.14, 0.14]) {
    const l = new THREE.Group(); l.position.set(x, 1.0, 0.05); g.add(l);
    mesh(new THREE.CylinderGeometry(0.045, 0.035, 1.0, 6), M.ostSkin, 0, -0.5, 0, l);
    mesh(box(0.1, 0.05, 0.2), M.ostSkin, 0, -1.0, -0.06, l);
    legs.push(l);
  }
  return { g, legs, head: neck };
}

/** Swing legs for a walk / run cycle at `phase` (radians). */
export function stride(a: Legged, phase: number, amount: number) {
  const off = a.legs.length === 4 ? [0, Math.PI, Math.PI, 0] : [0, Math.PI]; // diagonal pairs move together
  a.legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + off[i]) * amount; });
}

// ------------------------------------------------------------------ road furniture
export function buildCone(): THREE.Group {
  const g = new THREE.Group();
  mesh(box(0.42, 0.04, 0.42), M.coneBase, 0, 0.02, 0, g);
  mesh(new THREE.ConeGeometry(0.17, 0.72, 12), M.cone, 0, 0.4, 0, g);
  mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.1, 12, 1, true), M.coneW, 0, 0.42, 0, g, false);
  return g;
}

export type SignShape = 'diamond' | 'rect' | 'circle' | 'octagon';
const signCache = new Map<string, THREE.Texture>();

/** A road sign on a post. Text lines: [text, px size, color]. Faces +Z (rotate to face drivers). */
export function buildSign(lines: [string, number, string][], bg: string, shape: SignShape, size = 1.6, postH = 2.2, border = '#111'): THREE.Group {
  const key = JSON.stringify([lines, bg, shape, border]);
  let tex = signCache.get(key);
  if (!tex) {
    tex = canvasTex(256, 256, (c) => {
      c.clearRect(0, 0, 256, 256);
      const path = () => {
        c.beginPath();
        if (shape === 'diamond') { c.moveTo(128, 6); c.lineTo(250, 128); c.lineTo(128, 250); c.lineTo(6, 128); }
        else if (shape === 'circle') c.arc(128, 128, 122, 0, Math.PI * 2);
        else if (shape === 'octagon') for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; c.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); }
        else c.rect(10, 40, 236, 176);
        c.closePath();
      };
      path(); c.fillStyle = border; c.fill();
      c.save(); c.translate(128, 128); c.scale(0.9, 0.9); c.translate(-128, -128); path(); c.fillStyle = bg; c.fill(); c.restore();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const total = lines.reduce((a, l) => a + l[1] * 1.1, 0); let y = 128 - total / 2;
      for (const [t, px, col] of lines) {
        c.font = `900 ${px}px "Arial Black", Arial, sans-serif`; c.fillStyle = col;
        const fit = Math.min(1, 170 / Math.max(1, c.measureText(t).width));
        if (fit < 1) c.font = `900 ${Math.floor(px * fit)}px "Arial Black", Arial, sans-serif`;
        c.fillText(t, 128, y + px * 0.55); y += px * 1.1;
      }
    });
    signCache.set(key, tex);
  }
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.04, 0.04, postH + size / 2, 6), M.post, 0, (postH + size / 2) / 2, -0.03, g);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.15 }));
  face.position.y = postH + size / 2; g.add(face);
  return g;
}

/** Flashing arrow board trailer (closed lanes). Returns the lamp material to blink. */
export function buildArrowBoard(): { g: THREE.Group; lamp: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  mesh(box(1.4, 0.5, 1.8), std('#ff8f00'), 0, 0.55, 0, g);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12).rotateZ(Math.PI / 2), M.black, s * 0.78, 0.3, 0.2, g);
  mesh(box(0.12, 1.8, 0.12), M.steel, 0, 1.6, 0, g);
  mesh(box(2.4, 1.3, 0.12), M.black, 0, 2.9, 0, g);
  const lamp = std('#5a3a00', { emissive: '#ffb300', emissiveIntensity: 0 });
  // a left-pointing arrow made of lamps: merge right
  for (let i = 0; i < 7; i++) mesh(box(0.14, 0.14, 0.05), lamp, 0.8 - i * 0.24, 2.9, 0.08, g, false);
  for (const [x, y] of [[-0.55, 3.15], [-0.55, 2.65], [-0.32, 3.3], [-0.32, 2.5]]) mesh(box(0.14, 0.14, 0.05), lamp, x, y, 0.08, g, false);
  return { g, lamp };
}

// ------------------------------------------------------------------ railroad
/** Crossing signal for one side: post, crossbuck, two flashers, a gate arm that swings down over `armLen` m. Arm points toward −x. */
export function buildSignal(armLen: number): { g: THREE.Group; arm: THREE.Group; lamps: THREE.MeshStandardMaterial[] } {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), M.post, 0, 2.1, 0, g);
  const xTex = canvasTex(256, 48, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 48); c.strokeStyle = '#111'; c.lineWidth = 6; c.strokeRect(2, 2, 252, 44); c.fillStyle = '#111'; c.font = '900 30px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RAILROAD', 128, 26); });
  for (const r of [0.6, -0.6]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshStandardMaterial({ map: xTex, side: THREE.DoubleSide, roughness: 0.5 }));
    b.position.set(0, 3.9, 0.12); b.rotation.z = r; g.add(b);
  }
  mesh(box(1.4, 0.08, 0.08), M.black, 0, 3.1, 0.1, g);
  const lamps: THREE.MeshStandardMaterial[] = [];
  for (const s of [-1, 1]) {
    const lamp = std('#4a0000', { emissive: '#ff1a1a', emissiveIntensity: 0 });
    mesh(new THREE.CircleGeometry(0.22, 14), M.black, s * 0.55, 3.1, 0.12, g, false);
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 14).rotateX(Math.PI / 2), lamp, s * 0.55, 3.1, 0.18, g, false);
    lamps.push(lamp);
  }
  mesh(box(0.5, 0.8, 0.4), M.steel, 0, 0.4, 0, g); // signal box
  // gate arm: striped, pivoting at the post
  const arm = new THREE.Group(); arm.position.set(-0.15, 1.15, 0.25); g.add(arm);
  const stripes = canvasTex(256, 16, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff' : '#d50000'; c.fillRect(i * 32, 0, 32, 16); } });
  stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.set(armLen / 4, 1);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.12, 0.08), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }));
  bar.position.x = -armLen / 2; bar.castShadow = true; arm.add(bar);
  mesh(box(0.5, 0.3, 0.3), M.black, 0.3, 0, 0, arm); // counterweight
  return { g, arm, lamps };
}

/** Rails, ties and ballast along local x (u), length 2·half, with a rubber panel where it crosses the road. */
export function buildTrack(half: number, roadHalf: number): THREE.Group {
  const g = new THREE.Group();
  const gauge = 0.72;
  for (const z of [-gauge, gauge]) mesh(box(half * 2, 0.14, 0.09), M.rail, 0, 0.17, z, g, false);
  for (const s of [-1, 1]) {
    const len = half - roadHalf - 1;
    mesh(box(len, 0.1, 3.4), M.ballast, s * (roadHalf + 1 + len / 2), 0.03, 0, g, false);
  }
  mesh(box(roadHalf * 2 + 2, 0.06, 2.6), M.rubber, 0, 0.03, 0, g, false);
  const n = Math.floor((half - roadHalf - 1) / 0.75) * 2;
  const ties = new THREE.InstancedMesh(box(0.24, 0.12, 2.5), M.tie, n);
  const m = new THREE.Matrix4(); let i = 0;
  for (let u = roadHalf + 1; u < half && i < n; u += 0.75) for (const s of [-1, 1]) { if (i < n) { m.makeTranslation(s * u, 0.1, 0); ties.setMatrixAt(i++, m); } }
  ties.count = i; ties.receiveShadow = true; g.add(ties);
  // telegraph poles along the line
  for (let u = -half + 30; u < half; u += 55) {
    if (Math.abs(u) < roadHalf + 8) continue;
    mesh(new THREE.CylinderGeometry(0.1, 0.13, 7, 6), M.tie, u, 3.5, 4.5, g);
    mesh(box(0.1, 0.1, 1.6), M.tie, u, 6.6, 4.5, g);
  }
  return g;
}

const CAR_COLORS = ['#8d3b2a', '#5d4037', '#37474f', '#1b5e20', '#6d6a64', '#9e5b2f', '#283593'];

/** One train car (or the locomotive), length along local x, nose toward +x. */
export function buildTrainCar(i: number, loco: boolean): THREE.Group {
  const g = new THREE.Group();
  const len = loco ? TRAIN.loco : TRAIN.car;
  const w = TRAIN.halfW * 2;
  for (const x of [-len / 2 + 2, len / 2 - 2]) {
    mesh(box(2.6, 0.7, w - 0.4), M.black, x, 0.55, 0, g);
    for (const s of [-1, 1]) for (const dx of [-0.8, 0.8]) mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 12).rotateX(Math.PI / 2), M.steel, x + dx, 0.48, s * (w / 2 - 0.35), g, false);
  }
  mesh(box(len, 0.3, w), M.black, 0, 1.05, 0, g); // frame
  if (loco) {
    const yellow = std('#f9a825', { roughness: 0.5, metalness: 0.2 }), dark = std('#263238', { roughness: 0.5 });
    mesh(box(len - 5, 2.8, w - 0.4), yellow, -2, 2.6, 0, g);
    mesh(box(4, 3.4, w), yellow, len / 2 - 3, 2.9, 0, g); // cab
    mesh(box(1.2, 1.6, w - 0.6), yellow, len / 2 - 0.6, 1.9, 0, g); // nose
    mesh(box(0.05, 1.0, w - 0.3), dark, len / 2 - 0.98, 3.7, 0, g, false); // windshield
    mesh(box(len - 4.6, 0.25, w + 0.02), std('#c62828'), -2, 1.5, 0, g, false); // stripe
    const head = std('#fffbe6', { emissive: '#fff3c0', emissiveIntensity: 2.5 });
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12).rotateZ(Math.PI / 2), head, len / 2 + 0.02, 2.4, 0, g, false);
    const light = new PoolLight('#fff3c0', 30, 60, 1.2); light.position.set(len / 2 + 2, 2.5, 0); g.add(light);
    mesh(box(0.8, 0.6, 0.6), dark, -len / 2 + 4, 4.2, 0, g); // exhaust stack
    return g;
  }
  const kind = i % 4;
  const col = std(CAR_COLORS[i % CAR_COLORS.length], { roughness: 0.85 });
  if (kind === 1) {
    // tanker
    const tank = mesh(new THREE.CylinderGeometry(1.4, 1.4, len - 1.4, 16).rotateZ(Math.PI / 2), std(i % 2 ? '#212121' : '#eceff1', { roughness: 0.4, metalness: 0.3 }), 0, 2.6, 0, g); void tank;
  } else if (kind === 2) {
    // open hopper with a heap of coal / gravel
    mesh(box(len - 0.6, 2.2, w), col, 0, 2.3, 0, g);
    mesh(box(len - 1.2, 0.5, w - 0.4), std(i % 3 ? '#212121' : '#bcaaa4', { roughness: 1 }), 0, 3.3, 0, g, false);
  } else {
    // boxcar with a sliding door and a spray-painted tag
    mesh(box(len - 0.6, 3.1, w), col, 0, 2.75, 0, g);
    for (const s of [-1, 1]) mesh(box(2.6, 2.6, 0.06), std('#4e342e'), 0, 2.6, s * (w / 2 + 0.03), g, false);
    mesh(box(len - 0.4, 0.12, w + 0.1), std('#3e2723'), 0, 4.35, 0, g, false);
  }
  return g;
}
