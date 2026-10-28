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
  rock: { name: 'Rock', r: 0.07 },
  rocket: { name: 'Rocket fuel', r: 0.1 },
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

function labelTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Sesame-topped bun half (domed). */
function bunMesh(y = 0): THREE.Object3D {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.067, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), M.bun); dome.position.y = y; dome.castShadow = true; g.add(dome);
  const seed = new THREE.MeshStandardMaterial({ color: '#f5e9c8', roughness: 0.6 });
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, r = 0.012 + (i % 4) * 0.012;
    const sd = new THREE.Mesh(new THREE.SphereGeometry(0.004, 5, 4).scale(1.5, 0.6, 1), seed);
    sd.position.set(Math.cos(a) * r, y + 0.041 * (1 - (r / 0.067) ** 2) + 0.002, Math.sin(a) * r); sd.rotation.y = a; g.add(sd);
  }
  if (y === 0) { const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.058, 0.02, 16), M.bun); bot.position.y = -0.012; g.add(bot); }
  return g;
}

/** Soda / energy can with a printed label and a pull-tab top. */
function can(color: string, ink: string, text: string, r: number, h: number): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5, map: labelTex(128, 128, (c) => {
    c.fillStyle = color; c.fillRect(0, 0, 128, 128);
    c.fillStyle = ink; c.fillRect(0, 44, 128, 40);
    c.fillStyle = color === '#76ff03' ? '#76ff03' : '#c62828'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText(text, 64, 74);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(8, 0, 6, 128);
  }) }));
  body.castShadow = true; g.add(body);
  const metal = new THREE.MeshStandardMaterial({ color: '#cfd4d8', metalness: 0.85, roughness: 0.25 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, 0.008, 18), metal); top.position.y = h / 2; g.add(top);
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.88, 0.008, 18), metal); bot.position.y = -h / 2; g.add(bot);
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 4, 10), metal); tab.rotation.x = Math.PI / 2; tab.position.set(0.006, h / 2 + 0.006, 0); g.add(tab);
  return g;
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
    case 'bun': return bunMesh();
    case 'cheese': {
      const g = stack([[new THREE.BoxGeometry(0.09, 0.006, 0.09), M.cheese, 0]]);
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.03), M.cheese); corner.position.set(0.055, -0.004, 0.055); corner.rotation.y = 0.5; g.add(corner); // droopy corner
      return g;
    }
    case 'burger':
    case 'cheeseburger':
    case 'burntburger':
    case 'rawburger': {
      const pc = k === 'burntburger' ? '#161010' : k === 'rawburger' ? '#e57f86' : '#6b3f22';
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); return o; };
      add(new THREE.CylinderGeometry(0.066, 0.06, 0.022, 16), M.bun, -0.035); // bottom bun
      const patty = add(new THREE.CylinderGeometry(0.064, 0.06, 0.024, 16), mat(pc, { roughness: 0.95 }), -0.015);
      patty.scale.set(1.04, 1, 1.04);
      if (k !== 'burntburger') add(new THREE.CylinderGeometry(0.058, 0.058, 0.008, 12), mat('#c44a3a'), -0.0); // tomato
      if (k === 'cheeseburger') { const c = add(new THREE.BoxGeometry(0.105, 0.006, 0.105), M.cheese, 0.004); c.rotation.y = Math.PI / 4; } // cheese hanging over
      const lettuce = add(new THREE.TorusGeometry(0.062, 0.012, 6, 18).rotateX(Math.PI / 2), M.lettuce, 0.009); lettuce.scale.set(1.08, 1, 1.08);
      g.add(bunMesh(0.019));
      return g;
    }
    case 'coffee': {
      const g = stack([[new THREE.CylinderGeometry(0.036, 0.028, 0.1, 14), M.white, 0], [new THREE.CylinderGeometry(0.037, 0.037, 0.012, 14), M.black, 0.055], [new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), mat('#3a1f0e', { roughness: 0.3 }), 0.052]]);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12, Math.PI), M.white); handle.rotation.z = -Math.PI / 2; handle.position.set(0.04, 0, 0); g.add(handle);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0305, 0.03, 14), mat('#8d6e63')); band.position.y = -0.01; g.add(band);
      return g;
    }
    case 'energy': return can('#76ff03', '#1b5e20', 'BOLT', 0.03, 0.12);
    case 'soda': return can('#c62828', '#ffffff', 'COLA', 0.033, 0.11);
    case 'extinguisher': {
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
      const body = add(new THREE.CylinderGeometry(0.065, 0.065, 0.32, 18), mat('#c62828', { roughness: 0.35, metalness: 0.2 }));
      add(new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.red, 0, 0.16);
      add(new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.red, 0, -0.16);
      body.userData.label = true;
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0665, 0.0665, 0.14, 18, 1, true), new THREE.MeshStandardMaterial({ map: labelTex(128, 64, (c) => { c.fillStyle = '#f5f5f5'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#c62828'; c.font = 'bold 18px Arial'; c.textAlign = 'center'; c.fillText('FIRE', 64, 26); c.fillText('EXTINGUISHER', 64, 48); c.fillStyle = '#ffd600'; c.fillRect(0, 0, 128, 6); }), roughness: 0.6 }));
      lab.position.y = -0.02; lab.rotation.y = Math.PI; g.add(lab);
      add(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 10), M.black, 0, 0.245); // valve
      add(new THREE.BoxGeometry(0.02, 0.012, 0.09), M.black, 0, 0.285, 0.015); // handle
      const lever = add(new THREE.BoxGeometry(0.014, 0.01, 0.1), M.black, 0, 0.268, 0.03); lever.rotation.x = 0.25;
      const gauge = add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14).rotateX(Math.PI / 2), mat('#ffffff'), 0.03, 0.24, -0.03);
      gauge.add(new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), mat('#2e7d32')));
      // hose curls from the valve to a flared nozzle
      const hose = add(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8), M.black, 0, 0.22, -0.1); hose.rotation.x = Math.PI / 2 - 0.5;
      add(new THREE.ConeGeometry(0.025, 0.05, 10).rotateX(Math.PI / 2), M.black, 0, 0.17, -0.2);
      return g;
    }
    case 'hammer': {
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
      add(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 10), M.wood); // handle
      add(new THREE.CylinderGeometry(0.019, 0.019, 0.12, 10), mat('#c62828', { roughness: 0.9 }), 0, -0.09); // rubber grip
      add(new THREE.BoxGeometry(0.05, 0.045, 0.05), M.steel, 0, 0.16); // head
      add(new THREE.CylinderGeometry(0.022, 0.025, 0.05, 10).rotateZ(Math.PI / 2), M.steel, 0.045, 0.16); // striking face
      const claw = add(new THREE.ConeGeometry(0.022, 0.1, 6).rotateZ(Math.PI / 2), M.steel, -0.07, 0.16); claw.scale.set(1, 1, 0.5);
      claw.rotation.z = Math.PI / 2 + 0.2;
      return g;
    }
    case 'tape': {
      const g = new THREE.Group();
      const roll = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.022, 8, 20).rotateX(Math.PI / 2), mat('#a7adb3', { metalness: 0.5, roughness: 0.35 })); roll.castShadow = true; g.add(roll);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.044, 12, 1, true), mat('#d7ccc8', { side: THREE.DoubleSide })); g.add(core);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.05), mat('#a7adb3', { metalness: 0.5, roughness: 0.35 })); tail.position.set(0.045, -0.02, 0.045); tail.rotation.set(0.2, 0.6, 0.15); g.add(tail);
      return g;
    }
    case 'coolant': {
      const jug = mat('#43a047', { transparent: true, opacity: 0.88, roughness: 0.25 });
      const g = stack([[new THREE.BoxGeometry(0.14, 0.2, 0.08), jug, 0], [new THREE.CylinderGeometry(0.02, 0.025, 0.035, 10), M.black, 0.115], [new THREE.CylinderGeometry(0.026, 0.026, 0.012, 10), M.black, 0.135]]);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12, Math.PI), jug); handle.position.set(-0.04, 0.1, 0); handle.rotation.z = 0.2; g.add(handle);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.1), new THREE.MeshStandardMaterial({ map: labelTex(128, 112, (c) => { c.fillStyle = '#fafafa'; c.fillRect(0, 0, 128, 112); c.fillStyle = '#1565c0'; c.fillRect(0, 0, 128, 30); c.fillStyle = '#fff'; c.font = 'bold 20px Arial'; c.textAlign = 'center'; c.fillText('COOLANT', 64, 23); c.fillStyle = '#2e7d32'; c.font = 'bold 14px Arial'; c.fillText('50 / 50', 64, 62); c.fillText('DO NOT DRINK', 64, 90); }) }));
      lab.position.set(0, 0, 0.041); g.add(lab);
      const back = lab.clone(); back.position.z = -0.041; back.rotation.y = Math.PI; g.add(back);
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
      const red = mat('#c62828', { roughness: 0.45 });
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
      add(new THREE.BoxGeometry(0.17, 0.34, 0.26), red);
      add(new THREE.BoxGeometry(0.17, 0.06, 0.26), red, 0, 0.19, 0).scale.set(0.96, 1, 0.96);
      for (const y of [-0.08, 0.03, 0.12]) add(new THREE.BoxGeometry(0.176, 0.012, 0.266), mat('#8e1b1b'), 0, y, 0); // stamped ribs
      const x = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: labelTex(64, 64, (c) => { c.strokeStyle = 'rgba(80,0,0,.55)'; c.lineWidth = 6; c.beginPath(); c.moveTo(8, 8); c.lineTo(56, 56); c.moveTo(56, 8); c.lineTo(8, 56); c.stroke(); }), transparent: true }));
      x.rotation.y = Math.PI / 2; x.position.set(0.087, 0.0, 0); g.add(x);
      add(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 10), M.black, 0.04, 0.24, 0.06); // spout
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10), M.black, 0.04, 0.268, 0.06);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.15), red, 0, 0.215, -0.05); // carry handle
      add(new THREE.BoxGeometry(0.028, 0.06, 0.02), red, 0, 0.19, -0.115);
      return g;
    }
    case 'sponge': {
      const g = stack([[new THREE.BoxGeometry(0.13, 0.05, 0.09), mat('#ffeb3b', { roughness: 1 }), 0.0], [new THREE.BoxGeometry(0.13, 0.014, 0.09), mat('#43a047', { roughness: 1 }), -0.032]]); // scrubby side
      for (let n = 0; n < 7; n++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), mat('#d4b800', { roughness: 1 })); p.position.set((Math.random() - 0.5) * 0.11, 0.022, (Math.random() - 0.5) * 0.07); p.scale.y = 0.4; g.add(p); }
      return g;
    }
    case 'scratch': {
      const tex = scratchTex();
      return stack([[new THREE.BoxGeometry(0.07, 0.002, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 0]]);
    }
    case 'ice': return stack([[new THREE.BoxGeometry(0.2, 0.12, 0.16), mat('#e1f5fe', { transparent: true, opacity: 0.85, roughness: 0.2 }), 0]]);
    case 'map': {
      const face = new THREE.MeshStandardMaterial({ roughness: 0.9, map: labelTex(128, 192, (c) => {
        c.fillStyle = '#efe1b8'; c.fillRect(0, 0, 128, 192);
        c.strokeStyle = '#8d6e63'; c.lineWidth = 1; c.strokeRect(5, 5, 118, 182);
        c.strokeStyle = 'rgba(120,90,60,.5)'; for (let y = 24; y < 190; y += 24) { c.beginPath(); c.moveTo(5, y); c.lineTo(123, y); c.stroke(); }
        c.strokeStyle = '#c62828'; c.lineWidth = 3; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(26, 176); c.bezierCurveTo(30, 120, 90, 110, 70, 60); c.lineTo(96, 22); c.stroke();
        c.setLineDash([]); c.fillStyle = '#c62828'; c.font = 'bold 14px Arial'; c.textAlign = 'center'; c.fillText('X', 96, 30);
      }) });
      const edge = new THREE.MeshStandardMaterial({ color: '#d9c58f', roughness: 0.95 });
      const g = new THREE.Group();
      // three-panel fold: slight zigzag so it reads as a folded map
      for (let n = 0; n < 3; n++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.3), [edge, edge, face, edge, edge, edge]);
        p.position.set((n - 1) * 0.074, n === 1 ? 0.006 : 0, 0); p.rotation.z = (n - 1) * 0.12; p.castShadow = true; g.add(p);
      }
      return g;
    }
    case 'rock': {
      const geo = new THREE.DodecahedronGeometry(0.07, 0); geo.scale(1.15, 0.8, 0.95);
      const m = new THREE.Mesh(geo, mat('#8a8176', { roughness: 1 })); m.castShadow = true; return m;
    }
    case 'rocket': {
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 18), mat('#e8e8ec', { metalness: 0.5, roughness: 0.3 }));
      add(new THREE.ConeGeometry(0.07, 0.11, 18), mat('#d32f2f', { roughness: 0.4 }), 0, 0.185);
      add(new THREE.CylinderGeometry(0.072, 0.072, 0.02, 18), M.black, 0, -0.13);
      for (let n = 0; n < 3; n++) {
        const fin = add(new THREE.BoxGeometry(0.012, 0.09, 0.06), mat('#d32f2f'), 0, -0.1, 0);
        fin.position.set(Math.cos(n * 2.094) * 0.08, -0.1, Math.sin(n * 2.094) * 0.08); fin.rotation.y = -n * 2.094;
      }
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0715, 0.0715, 0.12, 18, 1, true), new THREE.MeshStandardMaterial({ map: labelTex(128, 64, (c) => { c.fillStyle = '#212121'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#ffeb3b'; c.font = 'bold 17px Arial'; c.textAlign = 'center'; c.fillText('ROCKET', 64, 26); c.fillText('FUEL', 64, 46); c.fillStyle = '#ff5722'; c.fillRect(0, 0, 128, 5); c.fillRect(0, 59, 128, 5); }), roughness: 0.5 }));
      lab.position.y = 0.0; lab.rotation.y = Math.PI; g.add(lab);
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
