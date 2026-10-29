// Store fixtures you take stock from: a glass-door drinks fridge (open the door first), a hot-dog
// roller and a snack rack. Taking something puts it in your hand at its price; pay at the counter
// like any other unpaid item (or walk out with it and see if the clerk notices).
// Coordinates are stop-local; `face` is the direction the front points.
import * as THREE from 'three';
import { KINDS, buildItemMesh, itemName } from '../items/Items';
import { MAT, type Component } from './kit';

export type Face = '-x' | '+x' | '-z' | '+z';
export interface DispenserOpts {
  id: string;
  type: 'fridge' | 'roller' | 'rack';
  x: number; z: number; face: Face;
  /** one row (shelf) per entry: item kind, price, stock */
  rows: [string, number, number][];
  sign?: string;
}

const YAW: Record<Face, number> = { '-x': 0, '+x': Math.PI, '-z': -Math.PI / 2, '+z': Math.PI / 2 };
const SIZE = { fridge: { w: 1.5, d: 0.75, h: 2.05 }, roller: { w: 1.1, d: 0.62, h: 1.25 }, rack: { w: 1.1, d: 0.5, h: 1.6 } };
const ROW_Y = { fridge: [0.42, 0.98, 1.54], roller: [1.03, 1.03], rack: [0.42, 0.88, 1.34] };
const RESTOCK = 90; // seconds per item, back up to the starting stock
const AUTO_CLOSE = 12;

const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const glowMat = new THREE.MeshStandardMaterial({ color: '#e3f2fd', emissive: '#bbdefb', emissiveIntensity: 0.9 });
const wireMat = new THREE.MeshStandardMaterial({ color: '#b0bec5', metalness: 0.8, roughness: 0.35 });

export function dispenser(o: DispenserOpts): Component {
  const sz = SIZE[o.type];
  const along = o.face === '-x' || o.face === '+x';
  const half = along ? { x: sz.d / 2, z: sz.w / 2 } : { x: sz.w / 2, z: sz.d / 2 };
  /** stop-local point from unit-local (front = −x, width along z) */
  const toStop = (lx: number, lz: number): [number, number] => {
    const a = YAW[o.face];
    return [o.x + lx * Math.cos(a) + lz * Math.sin(a), o.z - lx * Math.sin(a) + lz * Math.cos(a)];
  };
  const hasDoor = o.type === 'fridge';
  let door: THREE.Group, rowMeshes: THREE.Object3D[][] = [], rollers: THREE.Mesh[] = [];

  return {
    id: o.id,
    colliders: () => [{ x0: o.x - half.x, x1: o.x + half.x, z0: o.z - half.z, z1: o.z + half.z }],
    init: () => ({ open: false, t: 0, left: o.rows.map((r) => r[2]), re: 0 }),
    act(h, st, from, key) {
      if (key === 'door') {
        st.open = !st.open; st.t = AUTO_CLOSE;
        h.sfx('door', h.world(...lift(toStop(-half.x, 0), 1.2)));
        return;
      }
      if (!key.startsWith('row')) return;
      const i = Number(key.slice(3));
      const row = o.rows[i]; if (!row) return;
      if (hasDoor && !st.open) { h.toast('Open the door first'); return; }
      if (st.left[i] <= 0) { h.toast(`${KINDS[row[0]]?.name ?? row[0]}: sold out`); h.sfx('error'); return; }
      if (h.s.items.filter((it) => it.h === from).length >= 3) { h.toast('Pockets full (3 slots). Drop something first.'); return; }
      const [sx, sz2] = toStop(-half.x - 0.3, 0);
      const [wx, wy, wz] = h.world(sx, 1.1, sz2);
      const it = h.items.spawn(row[0], false, wx, wy, wz, '', undefined, row[1]);
      it.h = from;
      st.left[i]--; st.t = AUTO_CLOSE;
      h.sfx('grab');
    },
    step(_h, st, dt) {
      if (st.open && (st.t -= dt) <= 0) st.open = false;
      if ((st.re += dt) > RESTOCK) { st.re = 0; o.rows.forEach((r, i) => { if (st.left[i] < r[2]) st.left[i]++; }); }
    },
    build(v) {
      const g = new THREE.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = YAW[o.face]; v.group.add(g);
      const box = (m: THREE.Material, w: number, hgt: number, d: number, x: number, y: number, z: number) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(d, hgt, w), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b;
      };
      const { w, d, h: H } = sz;
      if (o.type === 'fridge') {
        const shell = new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.4, metalness: 0.3 });
        box(shell, w, H, 0.06, d / 2 - 0.03, H / 2, 0); // back
        box(shell, 0.06, H, d, 0, H / 2, -w / 2 + 0.03); box(shell, 0.06, H, d, 0, H / 2, w / 2 - 0.03); // sides
        box(shell, w, 0.12, d, 0, H - 0.06, 0); box(shell, w, 0.16, d, 0, 0.08, 0); // top, plinth
        box(glowMat, w - 0.14, H - 0.4, 0.01, d / 2 - 0.065, H / 2, 0); // lit back panel
        for (const y of ROW_Y.fridge) box(wireMat, w - 0.12, 0.02, d - 0.1, 0.02, y - 0.01, 0);
        const header = v.sign([[o.sign ?? 'ICE COLD', 70, '#fff']], '#1565c0', w - 0.1, 0.26, 512, 96);
        header.position.set(-d / 2 - 0.005, H - 0.06, 0); header.rotation.y = -Math.PI / 2; g.add(header);
        // glass door hinged on the +z side
        door = new THREE.Group(); door.position.set(-d / 2 - 0.02, 0, w / 2 - 0.04); g.add(door);
        const frame = new THREE.MeshStandardMaterial({ color: '#90a4ae', metalness: 0.7, roughness: 0.3 });
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.02, H - 0.36, w - 0.12), glassMat); pane.position.set(0, H / 2, -(w - 0.08) / 2); door.add(pane);
        for (const [y, hh] of [[0.18, 0.05], [H - 0.14, 0.05]] as const) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, hh, w - 0.08), frame); r.position.set(0, y, -(w - 0.08) / 2); door.add(r); }
        for (const z of [-0.02, -(w - 0.1)]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, H - 0.3, 0.04), frame); r.position.set(0, H / 2, z); door.add(r); }
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), MAT.steel); handle.position.set(-0.04, 1.1, -(w - 0.16)); door.add(handle);
        v.reg('door', door, (st) => (st?.open ? 'Close the fridge door' : '🧊 Open the drinks fridge'));
      } else if (o.type === 'roller') {
        box(MAT.steel, w, 0.95, d, 0, 0.475, 0); // stand
        box(MAT.dark, w, 0.06, d, 0, 0.98, 0); // tray
        for (let i = 0; i < 8; i++) {
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, w - 0.16, 10).rotateX(Math.PI / 2), MAT.steel);
          r.position.set(-d / 2 + 0.1 + i * ((d - 0.2) / 7), 1.02, 0); g.add(r); rollers.push(r);
        }
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, w), glassMat); guard.position.set(-d / 2 + 0.02, 1.2, 0); guard.rotation.z = -0.35; g.add(guard);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(d * 0.7, 0.02, w), glassMat); roof.position.set(0.05, 1.33, 0); g.add(roof);
        const header = v.sign([[o.sign ?? 'HOT DOGS', 70, '#fff']], '#c62828', w - 0.1, 0.22, 512, 96);
        header.position.set(-d / 2 - 0.005, 0.8, 0); header.rotation.y = -Math.PI / 2; g.add(header);
      } else {
        for (const z of [-w / 2 + 0.02, w / 2 - 0.02]) box(wireMat, 0.03, H, 0.03, d / 2 - 0.03, H / 2, z);
        for (const y of ROW_Y.rack) { box(wireMat, w, 0.02, d, 0, y - 0.01, 0); box(wireMat, w, 0.08, 0.015, -d / 2 + 0.01, y + 0.03, 0); }
        const header = v.sign([[o.sign ?? 'SNACKS', 70, '#3e2723']], '#ffca28', w - 0.1, 0.24, 512, 96);
        header.position.set(d / 2 - 0.05, H + 0.1, 0); header.rotation.y = -Math.PI / 2; g.add(header);
      }
      // stock: product meshes per row, plus an invisible hit box to click
      rowMeshes = o.rows.map(([k, price], i) => {
        const y = ROW_Y[o.type][i] ?? 0.5;
        const meshes: THREE.Object3D[] = [];
        const span = o.type === 'roller' ? d - 0.2 : w - 0.3;
        const nShow = Math.min(5, o.rows[i][2]);
        const rowZ = o.type === 'roller' ? (o.rows.length > 1 ? (i - 0.5) * (w / 2) : 0) : 0;
        for (let n = 0; n < nShow; n++) {
          const m = buildItemMesh(k);
          const r = KINDS[k]?.r ?? 0.06;
          if (o.type === 'roller') { m.position.set(-span / 2 + (n + 0.5) * (span / nShow), y + 0.02, rowZ); m.rotation.y = Math.PI / 2; }
          else { m.position.set(-0.05, y + r, -span / 2 + (n + 0.5) * (span / nShow)); m.rotation.y = -Math.PI / 2; }
          g.add(m); meshes.push(m);
        }
        const hit = new THREE.Mesh(new THREE.BoxGeometry(o.type === 'roller' ? d - 0.1 : d - 0.15, 0.4, o.type === 'roller' ? w / Math.max(1, o.rows.length) - 0.05 : w - 0.15), hitMat);
        hit.position.set(o.type === 'roller' ? 0 : -0.05, y + 0.18, rowZ); g.add(hit);
        const prompt = (st: any) => {
          const left = st?.left?.[i] ?? 0;
          if (hasDoor && !st?.open) return '';
          return left > 0 ? `Take a ${itemName(k, 0)} — $${price.toFixed(2)} (${left} left)` : `${itemName(k, 0)} — sold out`;
        };
        v.reg(`row${i}`, hit, prompt);
        meshes.forEach((m) => v.reg(`row${i}`, m, prompt));
        return meshes;
      });
    },
    update(_v, st, _s, dt) {
      if (!st) return;
      rowMeshes.forEach((ms, i) => ms.forEach((m, n) => { m.visible = n < (st.left?.[i] ?? 0); }));
      if (door) {
        const target = st.open ? 1.9 : 0;
        door.rotation.y += (target - door.rotation.y) * Math.min(1, dt * 6);
      }
      for (const r of rollers) r.rotation.z += dt * 2;
    },
  };
}

const lift = (p: [number, number], y: number): [number, number, number] => [p[0], y, p[1]];
