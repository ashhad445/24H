// Item catalogue: names, collision radius, food values and procedural meshes.
import * as THREE from 'three';

export interface ItemKind {
  name: string;
  r: number; // collision radius
  food?: { hunger: number; stam: number; hypno?: number; caf?: number };
  uses?: number; // starting uses for tools
}

export const KINDS: Record<string, ItemKind> = {
  patty: { name: 'Raw patty', r: 0.06 },
  bun: { name: 'Bun', r: 0.07, food: { hunger: 8, stam: 5 } },
  cheese: { name: 'Cheese slice', r: 0.05, food: { hunger: 4, stam: 2 } },
  burger: { name: 'Burger', r: 0.08, food: { hunger: 45, stam: 20 } },
  cheeseburger: { name: 'Cheeseburger', r: 0.08, food: { hunger: 60, stam: 25 } },
  burntburger: { name: 'Burnt burger', r: 0.08, food: { hunger: 20, stam: 5 } },
  rawburger: { name: 'Raw burger (gross)', r: 0.08, food: { hunger: 15, stam: -10 } },
  coffee: { name: 'Coffee', r: 0.05, food: { hunger: 2, stam: 10, hypno: -1, caf: 150 } },
  energy: { name: 'Energy drink', r: 0.04, food: { hunger: 10, stam: 30, hypno: -0.6, caf: 60 } },
  soda: { name: 'Soda', r: 0.04, food: { hunger: 5, stam: 10 } },
  extinguisher: { name: 'Fire extinguisher', r: 0.09, uses: 100 },
  hammer: { name: 'Hammer', r: 0.08 },
  tape: { name: 'Duct tape', r: 0.06, uses: 4 },
  coolant: { name: 'Coolant jug', r: 0.1, uses: 2 },
  fuse: { name: 'Fuse', r: 0.03 },
  spare: { name: 'Spare tire', r: 0.42 },
  card: { name: 'Shared debit card', r: 0.03 },
  nozzle: { name: 'Gas nozzle', r: 0.06 },
  jerrycan: { name: 'Jerrycan', r: 0.15 },
  sponge: { name: 'Sponge', r: 0.06 },
  scratch: { name: 'Scratch-off ticket', r: 0.04 },
  map: { name: 'Paper map', r: 0.08 },
  ice: { name: 'Bag of ice', r: 0.1 },
};

export function itemName(k: string, d: number) {
  if (k === 'patty') return d < 0.3 ? 'Raw patty' : d < 1 ? 'Cooking patty' : d < 1.35 ? 'Cooked patty' : 'Burnt patty';
  if (k === 'jerrycan') return `Jerrycan (${d.toFixed(1)} gal)`;
  if (k === 'sponge') return d > 0 ? `Soapy sponge (${d})` : 'Dry sponge';
  const kind = KINDS[k];
  if (!kind) return k;
  return kind.uses && kind.uses > 1 && k !== 'extinguisher' ? `${kind.name} (${d})` : kind.name;
}

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const M = {
  bun: mat('#d9a35b'), cheese: mat('#ffcc33'), lettuce: mat('#5fae3b'), red: mat('#c62828'), chrome: mat('#cfd4d8', { metalness: 0.8, roughness: 0.3 }),
  black: mat('#1a1a1a'), wood: mat('#8b5a2b'), steel: mat('#8d9399', { metalness: 0.7, roughness: 0.35 }), grey: mat('#9e9e9e'),
  green: mat('#2e7d32'), lime: mat('#76ff03'), brown: mat('#4e2c16'), white: mat('#f5f5f5'), jug: mat('#43a047', { transparent: true, opacity: 0.85 }),
  fuse: mat('#ffb300', { emissive: '#ff6f00', emissiveIntensity: 0.3 }),
};

export function pattyColor(d: number) {
  const raw = new THREE.Color('#e57f86'), done = new THREE.Color('#6b3f22'), burnt = new THREE.Color('#141010');
  return d < 1 ? raw.lerp(done, Math.max(0, d)) : done.lerp(burnt, Math.min(1, (d - 1) / 0.6));
}

function stack(parts: [THREE.BufferGeometry, THREE.Material, number][]) {
  const g = new THREE.Group();
  for (const [geo, m, y] of parts) { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.castShadow = true; g.add(mesh); }
  return g;
}

/** Build the mesh for an item. Origin is at the item's center. */
export function buildItemMesh(k: string): THREE.Object3D {
  const cyl = (r: number, h: number, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg);
  switch (k) {
    case 'patty': {
      const m = new THREE.Mesh(cyl(0.055, 0.022), mat('#e57f86', { roughness: 0.9 }));
      m.name = 'patty'; m.castShadow = true; return m;
    }
    case 'bun': return stack([[new THREE.SphereGeometry(0.065, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), M.bun, 0.005], [cyl(0.065, 0.02), M.bun, -0.015]]);
    case 'cheese': return stack([[new THREE.BoxGeometry(0.09, 0.006, 0.09), M.cheese, 0]]);
    case 'burger':
    case 'cheeseburger':
    case 'burntburger':
    case 'rawburger': {
      const pc = k === 'burntburger' ? '#161010' : k === 'rawburger' ? '#e57f86' : '#6b3f22';
      const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
        [cyl(0.065, 0.02), M.bun, -0.035],
        [cyl(0.06, 0.022), mat(pc), -0.014],
      ];
      if (k === 'cheeseburger') parts.push([new THREE.BoxGeometry(0.1, 0.006, 0.1), M.cheese, 0.0]);
      parts.push([cyl(0.068, 0.008), M.lettuce, 0.007]);
      parts.push([new THREE.SphereGeometry(0.066, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), M.bun, 0.011]);
      return stack(parts);
    }
    case 'coffee': return stack([[new THREE.CylinderGeometry(0.035, 0.028, 0.1, 12), M.white, 0], [cyl(0.037, 0.012), M.brown, 0.055]]);
    case 'energy': return stack([[cyl(0.03, 0.12), M.lime, 0], [cyl(0.026, 0.008), M.chrome, 0.064]]);
    case 'soda': return stack([[cyl(0.033, 0.11), M.red, 0], [cyl(0.029, 0.008), M.chrome, 0.059]]);
    case 'extinguisher': {
      const g = stack([[cyl(0.065, 0.36), M.red, 0], [new THREE.SphereGeometry(0.065, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.red, 0.18], [cyl(0.015, 0.06), M.black, 0.26]]);
      const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), M.black);
      hose.position.set(0, 0.24, -0.08); hose.rotation.x = Math.PI / 2; g.add(hose);
      return g;
    }
    case 'hammer': {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.3, 0.025), M.wood); g.add(handle);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), M.steel); head.position.y = 0.15; g.add(head);
      g.traverse((o) => { o.castShadow = true; });
      return g;
    }
    case 'tape': return stack([[new THREE.TorusGeometry(0.045, 0.02, 8, 18).rotateX(Math.PI / 2), M.grey, 0]]);
    case 'coolant': {
      const g = stack([[new THREE.BoxGeometry(0.14, 0.22, 0.08), M.jug, 0], [cyl(0.02, 0.04), M.black, 0.13]]);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI), M.jug); handle.position.set(-0.03, 0.11, 0); g.add(handle);
      return g;
    }
    case 'fuse': return stack([[new THREE.BoxGeometry(0.04, 0.025, 0.012), M.fuse, 0], [new THREE.BoxGeometry(0.008, 0.02, 0.004), M.chrome, -0.02]]);
    case 'card': {
      const g = stack([[new THREE.BoxGeometry(0.086, 0.003, 0.054), mat('#00838f', { roughness: 0.35, metalness: 0.3 }), 0]]);
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.01), mat('#d4a017', { metalness: 0.9, roughness: 0.3 }));
      chip.position.set(-0.025, 0.001, 0); g.add(chip);
      return g;
    }
    case 'nozzle': {
      const g = new THREE.Group();
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.05), M.black); g.add(grip);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8).rotateX(Math.PI / 2), M.steel);
      spout.position.set(0, 0.06, -0.11); spout.rotation.x = -0.25; g.add(spout);
      const trig = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.04), M.steel); trig.position.set(0, -0.02, -0.04); g.add(trig);
      g.traverse((o) => { o.castShadow = true; });
      return g;
    }
    case 'jerrycan': {
      const g = stack([[new THREE.BoxGeometry(0.17, 0.36, 0.26), mat('#c62828', { roughness: 0.5 }), 0], [cyl(0.025, 0.06), M.black, 0.2]]);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.16), M.red); handle.position.set(0, 0.2, -0.04); g.add(handle);
      return g;
    }
    case 'sponge': return stack([[new THREE.BoxGeometry(0.13, 0.05, 0.09), mat('#ffeb3b', { roughness: 1 }), 0]]);
    case 'scratch': {
      const tex = scratchTex();
      return stack([[new THREE.BoxGeometry(0.07, 0.002, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 0]]);
    }
    case 'ice': return stack([[new THREE.BoxGeometry(0.2, 0.12, 0.16), mat('#e1f5fe', { transparent: true, opacity: 0.85, roughness: 0.2 }), 0]]);
    case 'map': {
      const paper = new THREE.MeshStandardMaterial({ color: '#efe1b8', roughness: 0.9 });
      const g = stack([[new THREE.BoxGeometry(0.22, 0.012, 0.3), paper, 0]]);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.26), M.red); line.rotation.y = 0.3; g.add(line);
      return g;
    }
    case 'spare': {
      const g = stack([[cyl(0.42, 0.25, 20), M.black, 0], [cyl(0.24, 0.26, 10), M.chrome, 0]]);
      g.rotation.x = Math.PI / 2; const w = new THREE.Group(); w.add(g); return w;
    }
  }
  return new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M.grey);
}

let _scratchTex: THREE.Texture | null = null;
function scratchTex() {
  if (_scratchTex) return _scratchTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7b1fa2'; g.fillRect(0, 0, 64, 96);
  g.fillStyle = '#ffd54f'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('LUCKY', 32, 18); g.fillText('DESERT', 32, 32);
  g.fillStyle = '#b0bec5'; for (let i = 0; i < 3; i++) g.fillRect(8, 42 + i * 17, 48, 12);
  _scratchTex = new THREE.CanvasTexture(c); _scratchTex.colorSpace = THREE.SRGBColorSpace;
  return _scratchTex;
}

/** Starting loadout in RV-local coordinates. */
export const START_ITEMS: [string, number, number, number][] = [
  // galley counter
  ['patty', 0.95, 1.6, 1.0], ['patty', 1.1, 1.6, 1.05], ['patty', 0.95, 1.6, 1.15], ['patty', 1.1, 1.6, 1.2],
  ['bun', 1.0, 1.62, 2.0], ['bun', 1.15, 1.62, 2.1], ['bun', 1.0, 1.62, 2.2], ['bun', 1.15, 1.62, 2.25],
  ['cheese', 0.9, 1.58, 0.85], ['cheese', 1.05, 1.58, 0.85], ['cheese', 1.2, 1.58, 0.85],
  // dinette table
  ['coffee', -0.8, 1.45, -0.2], ['energy', -1.0, 1.45, 0.1], ['soda', -0.75, 1.45, 0.3], ['soda', -1.1, 1.45, 0.45],
  // tools
  ['extinguisher', 1.22, 1.15, -0.7], ['hammer', -0.9, 1.1, 2.0], ['tape', -1.0, 1.1, 1.7], ['coolant', 0.9, 0.8, 2.9],
  ['jerrycan', 0.35, 0.85, 3.0],
  ['map', 0.75, 1.47, -2.85],
];
