// Dresses a box building with Blender kit pieces (public/models/buildings.glb, built by art/buildings.py):
// cornice, corner pilasters, base strip, framed windows, door frame, striped awnings, wall lamps, drain pipes
// and roof clutter. Pure visuals: colliders and the door gap stay exactly where building() puts them.
import * as THREE from 'three';
import { Assets } from '../core/AssetLoader';

export interface KitOpts {
  x0: number; x1: number; z0: number; z1: number; h: number; door: [number, number];
  wall: string; roof: string;
  trim?: string; awning?: string; accent?: string;
  /** false = no windows (casinos don't want you to see daylight). */
  windows?: boolean;
  /** Gold pilasters every N meters along the walls. */
  pilasters?: number;
  /** Grand entrance (columns, bulb pediment, red carpet) instead of the plain door frame. */
  portal?: boolean;
}

let stucco: THREE.CanvasTexture | null = null;
/** Pale speckled plaster with a dusty base; multiplied by the wall color. */
export function stuccoTexture() {
  if (stucco) return stucco;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 215 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // a couple of hairline cracks
  g.strokeStyle = 'rgba(90,80,70,0.35)'; g.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    let x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 18; g.lineTo(x, y); }
    g.stroke();
  }
  stucco = new THREE.CanvasTexture(c);
  stucco.wrapS = stucco.wrapT = THREE.RepeatWrapping;
  stucco.colorSpace = THREE.SRGBColorSpace;
  return stucco;
}

/** A wall material with the plaster texture tiled every ~2.5 m. */
export function wallMaterial(color: string, len: number, h: number) {
  const t = stuccoTexture().clone();
  t.repeat.set(Math.max(1, len / 2.5), Math.max(1, h / 2.5));
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, map: t });
}

const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** Returns false (and adds nothing) when the kit isn't loaded. */
export function dressBuilding(group: THREE.Group, o: KitOpts, t = 0.2): boolean {
  if (!Assets.has('buildings')) return false;
  const colors = { trim: o.trim ?? '#efe6d2', awning: o.awning ?? o.roof, accent: o.accent ?? o.roof };
  const K = (n: string) => Assets.tinted('buildings', n, colors);
  const put = (n: string, x: number, y: number, z: number, rotY: number, sx = 1, sy = 1, sz = 1) => {
    const m = K(n); if (!m) return null;
    m.position.set(x, y, z); m.rotation.y = rotY; m.scale.set(sx, sy, sz);
    group.add(m); return m;
  };
  const { x0, x1, z0, z1, h } = o;
  // each side: outer-face line, outward-facing rotation, and how "along" maps to world x/z
  const sides = [
    { rot: Math.PI / 2, a: z1, b: z0, at: (s: number) => [x0 - t, s] as const, front: true }, // faces the road (−X)
    { rot: -Math.PI / 2, a: z0, b: z1, at: (s: number) => [x1 + t, s] as const, front: false },
    { rot: 0, a: x0, b: x1, at: (s: number) => [s, z0 - t] as const, front: false },
    { rot: Math.PI, a: x1, b: x0, at: (s: number) => [s, z1 + t] as const, front: false },
  ];
  const [d0, d1] = o.door;
  for (const sd of sides) {
    const lo = Math.min(sd.a, sd.b), hi = Math.max(sd.a, sd.b), mid = (lo + hi) / 2, len = hi - lo + 2 * t;
    const [cx, cz] = sd.at(mid);
    put('parapet', cx, h, cz, sd.rot, len + 0.4);
    // segments without the door
    const segs: [number, number][] = sd.front ? [[lo, d0], [d1, hi]] : [[lo, hi]];
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.3) continue;
      const [px, pz] = sd.at((s0 + s1) / 2);
      put('plinth', px, 0, pz, sd.rot, s1 - s0);
      if (o.pilasters) for (let s = s0 + o.pilasters / 2; s < s1 - 0.8; s += o.pilasters) { const [px2, pz2] = sd.at(s); put('corner', px2, 0, pz2, sd.rot, 0.7, h, 0.5); }
      // windows every ~3.4 m, kept clear of corners and the door
      const usable = o.windows === false ? 0 : s1 - s0 - 2.4;
      const n = usable > 0 ? Math.floor(usable / 3.4) + (usable > 1.7 ? 1 : 0) : 0;
      for (let i = 0; i < n; i++) {
        const s = s0 + 1.2 + (usable * (i + 0.5)) / n;
        const [wx, wz] = sd.at(s);
        put('window', wx, 1.0, wz, sd.rot);
        if (sd.front && o.awning) put('awning', wx, 2.55, wz, sd.rot, 2.0);
      }
    }
    if (sd.front && o.portal) {
      const [dx, dz] = sd.at((d0 + d1) / 2);
      put('portal', dx, 0, dz, sd.rot);
    } else if (sd.front) {
      const [dx, dz] = sd.at((d0 + d1) / 2), w = d1 - d0;
      put('door', dx, 0, dz, sd.rot, w);
      put('awning', dx, 3.0, dz, sd.rot, w + 1.4, 1, 1.1);
      for (const s of [d0 - 0.45, d1 + 0.45]) { const [lx, lz] = sd.at(s); put('sconce', lx, 2.2, lz, sd.rot); }
    }
  }
  // corner pilasters + drain pipes on the front corners
  for (const [cx, cz] of [[x0 - t / 2, z0 - t / 2], [x0 - t / 2, z1 + t / 2], [x1 + t / 2, z0 - t / 2], [x1 + t / 2, z1 + t / 2]]) put('corner', cx, 0, cz, 0, 1, h + 0.05);
  put('pipe', x0 - t, 0, z0 + 0.45, Math.PI / 2, 1, h);
  put('pipe', x0 - t, 0, z1 - 0.45, Math.PI / 2, 1, h);
  // roof: gravel deck, AC units, vents, maybe a dish
  const deck = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 2 * t, 0.12, z1 - z0 + 2 * t), new THREE.MeshStandardMaterial({ color: shade(o.roof, 0.85), roughness: 1 }));
  deck.position.set((x0 + x1) / 2, h + 0.06, (z0 + z1) / 2); deck.receiveShadow = true; group.add(deck);
  const area = (x1 - x0) * (z1 - z0);
  const acs = Math.min(3, Math.max(1, Math.round(area / 110)));
  for (let i = 0; i < acs; i++) put('ac', x0 + (x1 - x0) * (0.55 + 0.25 * (i % 2)), h + 0.12, z0 + (z1 - z0) * ((i + 0.5) / acs), (i * 0.7) % 1.6);
  put('vent', x0 + (x1 - x0) * 0.3, h + 0.12, z0 + (z1 - z0) * 0.2, 0);
  put('vent', x0 + (x1 - x0) * 0.35, h + 0.12, z0 + (z1 - z0) * 0.8, 0);
  if (area > 100) put('sat', x1 - 1.2, h + 0.12, z1 - 1.2, 2.4);
  return true;
}

/** A free kit prop (barrel, crate, dumpster, scorpion…) at stop-local x, z. */
export function kitProp(group: THREE.Group, name: string, x: number, z: number, rotY = 0, s = 1, y = 0) {
  const m = Assets.node('buildings', name);
  if (!m) return null;
  m.position.set(x, y, z); m.rotation.y = rotY; m.scale.setScalar(s);
  group.add(m);
  return m;
}
