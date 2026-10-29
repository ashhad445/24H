// Basic stop components: buildings, tables, signs, shop + clerk, pumps, pawn, vending, ice, bed, scrap, junk.
// Coordinates are stop-local: +X away from the road, −Z = road forward. Doors face the road (−X).
import * as THREE from 'three';
import { itemName } from '../items/Items';
import type { Box2 } from '../rv/RV';
import type { ChaseState, ItemState } from '../types';
import { MAT, canvasTex, signTexture, type Component, type HostCtx } from './kit';
import { makeNpc } from '../models/npcs';
import { bonk, caught, stepChase } from './chase';
import { chaserPose, makeBat } from './chaseView';
import { Assets } from '../core/AssetLoader';
import { dressBuilding, wallMaterial } from './buildingKit';

type Rect = { x0: number; x1: number; z0: number; z1: number };
const rectBox = (r: Rect, top?: number): Box2 => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, top });
const inRect = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

// ---------------------------------------------------------------- static
export function lot(r: Rect, dirt = false): Component {
  return {
    id: 'lot',
    build(v) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), dirt ? MAT.dirt : MAT.lot);
      m.position.set((r.x0 + r.x1) / 2, 0.006, (r.z0 + r.z1) / 2); m.receiveShadow = true; v.group.add(m);
    },
  };
}

export interface BuildingOpts extends Rect {
  id: string; h: number; door: [number, number]; wall: string; roof: string; floor: string;
  sign?: { lines: [string, number, string][]; bg: string; w: number; h: number };
  inner?: { x: number; door: [number, number] };
  light?: string;
  /** Kit colors: cornice/frames, front-window awnings (omit = door awning only), cornice stripe. */
  trim?: string; awning?: string; accent?: string;
  windows?: boolean; pilasters?: number; portal?: boolean;
}
export function building(o: BuildingOpts): Component {
  const t = 0.2;
  const walls: Box2[] = [
    { x0: o.x0 - t, x1: o.x0, z0: o.z0, z1: o.door[0] }, { x0: o.x0 - t, x1: o.x0, z0: o.door[1], z1: o.z1 },
    { x0: o.x1, x1: o.x1 + t, z0: o.z0, z1: o.z1 }, { x0: o.x0, x1: o.x1, z0: o.z0 - t, z1: o.z0 }, { x0: o.x0, x1: o.x1, z0: o.z1, z1: o.z1 + t },
  ];
  if (o.inner) walls.push({ x0: o.inner.x, x1: o.inner.x + t, z0: o.z0, z1: o.inner.door[0] }, { x0: o.inner.x, x1: o.inner.x + t, z0: o.inner.door[1], z1: o.z1 });
  return {
    id: o.id,
    colliders: () => walls,
    build(v) {
      const kit = Assets.has('buildings');
      const flat = new THREE.MeshStandardMaterial({ color: o.wall, roughness: 0.9 });
      const wallMat = (w: Box2, h: number) => kit ? wallMaterial(o.wall, Math.max(w.x1 - w.x0, w.z1 - w.z0), h) : flat;
      for (const w of walls) v.box(wallMat(w, o.h), w.x0, w.x1, 0, o.h, w.z0, w.z1, true);
      v.box(flat, o.x0 - t, o.x0, 2.6, o.h, o.door[0], o.door[1], true);
      if (o.inner) v.box(flat, o.inner.x, o.inner.x + t, 2.4, o.h, o.inner.door[0], o.inner.door[1]);
      // ceiling seen from inside (the kit adds its own roof deck on top)
      if (kit) v.box(new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 }), o.x0, o.x1, o.h - 0.02, o.h, o.z0, o.z1);
      else v.box(new THREE.MeshStandardMaterial({ color: o.roof, roughness: 0.9 }), o.x0 - 0.6, o.x1 + 0.4, o.h, o.h + 0.25, o.z0 - 0.5, o.z1 + 0.5, true);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(o.x1 - o.x0, o.z1 - o.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: o.floor, roughness: 0.7 }));
      floor.position.set((o.x0 + o.x1) / 2, 0.012, (o.z0 + o.z1) / 2); floor.receiveShadow = true; v.group.add(floor);
      if (kit) dressBuilding(v.group, { ...o }, t);
      // windows either side of the door
      else for (const [za, zb] of [[o.z0 + 1, o.door[0] - 1], [o.door[1] + 1, o.z1 - 1]]) {
        if (zb - za < 1.5) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(zb - za, 1.1), MAT.glassDark);
        win.position.set(o.x0 - t - 0.01, 1.75, (za + zb) / 2); win.rotation.y = -Math.PI / 2; v.group.add(win);
      }
      if (o.sign && kit) {
        // a rooftop sign board on two steel legs, above the cornice
        const s = v.sign(o.sign.lines, o.sign.bg, o.sign.w, o.sign.h);
        const y = o.h + 0.55 + o.sign.h / 2 + (o.portal ? 2.3 : 0), zc = (o.door[0] + o.door[1]) / 2;
        s.position.set(o.x0 + 0.15, y, zc); s.rotation.y = -Math.PI / 2;
        for (const dz of [-o.sign.w * 0.35, o.sign.w * 0.35]) v.box(MAT.steel, o.x0 + 0.2, o.x0 + 0.32, o.h, y, zc + dz - 0.06, zc + dz + 0.06, true);
        v.box(MAT.dark, o.x0 + 0.17, o.x0 + 0.22, y - o.sign.h / 2 - 0.05, y + o.sign.h / 2 + 0.05, zc - o.sign.w / 2 - 0.05, zc + o.sign.w / 2 + 0.05);
      } else if (o.sign) {
        const s = v.sign(o.sign.lines, o.sign.bg, o.sign.w, o.sign.h);
        s.position.set(o.x0 - t - 0.03, o.h - 0.75, (o.door[0] + o.door[1]) / 2); s.rotation.y = -Math.PI / 2;
      }
      const n = Math.max(1, Math.round((o.x1 - o.x0) * (o.z1 - o.z0) / 90));
      for (let i = 0; i < n; i++) {
        const l = new THREE.PointLight(o.light ?? '#ffe2a8', 5, 14, 1);
        l.position.set(o.x0 + ((o.x1 - o.x0) * (i + 0.5)) / n, o.h - 0.4, (o.z0 + o.z1) / 2);
        v.group.add(l);
      }
    },
  };
}

export function table(id: string, r: Rect, top: number, mat: 'wood' | 'felt' | 'white' = 'wood', label?: string): Component {
  return {
    id, colliders: () => [rectBox(r, top)],
    build(v) {
      v.box(MAT[mat], r.x0, r.x1, 0, top, r.z0, r.z1, true);
      if (label) {
        const s = v.sign([[label, 70, '#fff']], '#2e7d32', Math.min(1.1, r.z1 - r.z0), 0.3, 512, 128);
        s.position.set(r.x0 - 0.01, top * 0.7, (r.z0 + r.z1) / 2); s.rotation.y = -Math.PI / 2;
      }
    },
  };
}

export function pylon(id: string, x: number, z: number, lines: [string, number, string][], bg: string): Component {
  return {
    id, colliders: () => [{ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }],
    build(v) {
      v.box(MAT.steel, x - 0.2, x + 0.2, 0, 8.5, z - 0.2, z + 0.2, true);
      const tex = signTexture(lines, bg, 512, 384);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 5.4), [MAT.dark, MAT.dark, MAT.dark, MAT.dark,
        new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
      board.rotation.y = Math.PI / 2; board.position.set(x, 9.6, z); board.castShadow = true; v.group.add(board);
    },
  };
}

/** Free-form visuals (pool, booths, neon…) with optional colliders. */
export function decor(id: string, build: Component['build'], colliders: Box2[] = []): Component {
  return { id, build, colliders: () => colliders };
}

export function junkCars(id: string, cars: [number, number, number, string][]): Component {
  return {
    id,
    colliders: () => cars.map(([x, z]) => ({ x0: x - 1.4, x1: x + 1.4, z0: z - 2.6, z1: z + 2.6, top: 1.5 })),
    build(v) {
      for (const [x, z, yaw, color] of cars) {
        const g = new THREE.Group();
        const paint = new THREE.MeshStandardMaterial({ color, roughness: 1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.4), paint); body.position.y = 0.55; body.rotation.z = 0.06;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2), paint); cab.position.set(0, 1.25, 0.2); cab.rotation.x = 0.08;
        const rust = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.3, 1.2), MAT.rust); rust.position.set(0, 0.45, -1.2);
        g.add(body, cab, rust);
        g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
        g.position.set(x, 0, z); g.rotation.y = yaw; v.group.add(g);
      }
    },
  };
}

// ---------------------------------------------------------------- shop + clerk
export interface ShopOpts {
  id: string;
  products: [string, number, number][]; // kind, price, count
  shelves: (Rect & { top: number })[];
  checkout: Rect & { top: number };
  register: [number, number, number];
  clerk: [number, number]; // x, z (faces the door, −X)
  store: Rect; // building interior for theft checks
  clerkName: string;
  clerkColor: string;
}
export function shop(o: ShopOpts): Component {
  const wasInside = new Map<number, boolean>();
  let unseen: { who: number; at: number }[] = [];
  let time = 0;
  let clerkView: THREE.Group, paper: THREE.Mesh, bat: THREE.Mesh;
  const NAME = o.clerkName.toUpperCase();
  /** caught red-handed: heat + the clerk comes out swinging */
  const busted = (h: HostCtx, st: any, who: number) => {
    caught(h, who); h.sfx('yell');
    if (st.chase) return;
    const [x, , z] = h.world(o.clerk[0], 0, o.clerk[1]);
    st.chase = { who, x, z, t: 0 };
    h.toast(`🏏 ${NAME} COMES OVER THE COUNTER WITH A BAT! Run!`);
  };
  return {
    id: o.id,
    colliders: () => [...o.shelves.map((s) => rectBox(s, s.top)), rectBox(o.checkout, o.checkout.top)],
    init: () => ({ watch: true, t: 6, chase: null }),
    unpaid(h, st, from) {
      const p = h.handOf(from);
      if (!p) return false;
      const [lx, lz] = h.local(p[0], p[2]);
      if (!inRect(o.store, lx, lz)) return false;
      if (st.watch) { h.toast(`🚨 ${NAME}: "YOU GONNA PAY FOR THAT?!" (+1 heat)`); busted(h, st, from); }
      else { h.toast('🤫 Ate the evidence.'); unseen.push({ who: from, at: time }); }
      return true;
    },
    spawn(h) {
      let slot = 0;
      for (const [k, price, count] of o.products) {
        for (let n = 0; n < count; n++, slot++) {
          const sh = o.shelves[slot % o.shelves.length];
          const row = Math.floor(slot / o.shelves.length);
          const along = sh.z1 - sh.z0 - 0.5, perRow = Math.max(1, Math.floor(along / 0.4));
          const lz = sh.z0 + 0.25 + (row % perRow) * 0.4;
          const lx = sh.x0 + 0.25 + (Math.floor(row / perRow) % 3) * 0.33;
          const [wx, y, wz] = h.world(lx, sh.top + 0.3, lz);
          h.items.spawn(k, false, wx, y, wz, '', undefined, price);
        }
      }
    },
    act(h, _st, from, key) {
      if (key !== 'register' || !h.needCard(from)) return;
      const onZone = (it: ItemState) => {
        const [lx, lz] = h.local(it.x, it.z);
        return inRect(o.checkout, lx, lz) && it.y > o.checkout.top - 0.05 && it.y < o.checkout.top + 0.6;
      };
      const due = h.s.items.filter((it) => it.p > 0 && it.h === -1 && !it.rv && onZone(it));
      if (!due.length) { h.toast(`${o.clerkName.toUpperCase()}: "Put your stuff on the counter, hon."`); return; }
      const total = due.reduce((a, it) => a + it.p, 0);
      if (h.charge(from, total, `${o.clerkName}'s counter: ${due.map((it) => itemName(it.k, it.d)).join(', ')}`)) {
        due.forEach((it) => { it.p = 0; });
        h.toast(`🧾 Paid $${total.toFixed(2)} for ${due.length} item${due.length > 1 ? 's' : ''}`);
      }
    },
    step(h, st, dt) {
      time += dt;
      st.t -= dt;
      if (st.t <= 0) {
        st.watch = !st.watch; st.t = st.watch ? 9 + Math.random() * 6 : 2 + Math.random() * 2;
        if (st.watch) {
          const hit = unseen.filter((u) => time - u.at < 10).find(() => Math.random() < 0.5);
          if (hit) { h.toast(`🚨 ${NAME}: "...hey. HEY! Where'd my stuff go?!"`); busted(h, st, hit.who); }
          unseen = [];
        }
      }
      if (st.chase) {
        const [hx, , hz] = h.world(o.clerk[0], 0, o.clerk[1]);
        const res = stepChase(h, st.chase, dt, 5.2, 1.3, [hx, hz]);
        if (res === 'hit') { bonk(h, st.chase.who, 3); h.toast(`💥 ${NAME} BONKED ${h.name(st.chase.who).toUpperCase()} WITH A BAT. (stolen goods taken back)`); st.chase = null; }
        else if (res === 'lost') { h.toast(`🏏 ${o.clerkName} gives up the chase, wheezing.`); st.chase = null; }
      }
      for (const it of h.s.items) {
        if (it.p <= 0) continue;
        const w = h.itemWorld(it); if (!w) continue;
        const [lx, lz] = h.local(w[0], w[2]);
        if (Math.abs(lx) > 300 || Math.abs(lz) > 300) continue;
        const inside = inRect(o.store, lx, lz);
        const was = wasInside.get(it.id) ?? inside;
        wasInside.set(it.id, inside);
        if (was && !inside) {
          const what = itemName(it.k, it.d); it.p = 0; it.st = 1;
          if (st.watch && it.h >= 0) { h.toast(`🚨 ${NAME}: "HEY! THAT ${what.toUpperCase()} AIN'T FREE!" (+1 heat)`); busted(h, st, it.h); }
          else { h.toast(`🤫 Five-finger discount: ${what}`); if (it.h >= 0) unseen.push({ who: it.h, at: time }); }
        }
      }
    },
    build(v) {
      const reg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.35), MAT.dark); body.position.y = 0.11;
      const scr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: '#0b3', emissive: '#0a2', emissiveIntensity: 0.6 }));
      scr.position.set(-0.12, 0.3, 0); scr.rotation.z = 0.3; reg.add(body, scr);
      reg.position.set(...o.register); v.group.add(reg);
      v.reg('register', reg, (_st, c) => (c.held === 'card' ? 'Pay for everything on the counter' : `${o.clerkName}'s register — bring the card (items on the counter)`));
      clerkView = makeNpc(o.clerkName.toLowerCase(), { body: o.clerkColor });
      clerkView.position.set(o.clerk[0], 0, o.clerk[1]);
      paper = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshStandardMaterial({ color: '#eee', side: THREE.DoubleSide }));
      paper.position.set(0, 1.25, -0.42); paper.rotation.x = -0.4; clerkView.add(paper);
      bat = makeBat(); bat.visible = false; clerkView.add(bat);
      v.group.add(clerkView);
      v.reg('clerk', clerkView, (st) => (st.chase ? `${NAME} IS COMING WITH A BAT` : st.watch ? `${NAME}: "Can I help ya?"` : `${o.clerkName} is reading a magazine…`));
    },
    update(v, st, _s, dt) {
      const ch = st.chase as ChaseState | null;
      chaserPose(clerkView, v.group, ch, o.clerk, dt);
      bat.visible = !!ch;
      if (!ch) {
        const target = st.watch ? Math.PI / 2 : -Math.PI / 2;
        let d = target - clerkView.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        clerkView.rotation.y += d * Math.min(1, dt * 4);
      }
      paper.visible = !st.watch && !ch;
    },
  };
}

// ---------------------------------------------------------------- fuel pumps
/** Nozzle item `d` = PUMP_BASE + global pump index (Rusty's own pumps use 0–1). */
export const PUMP_BASE = 100;
let pumpCounter = 0;
export const pumpRegistry = new Map<number, { stopId: string; comp: Component; index: number; price: number }>();

export function pumps(id: string, list: [number, number][], price: number): Component {
  const base = PUMP_BASE + pumpCounter; pumpCounter += list.length;
  const holster = (i: number): [number, number, number] => [list[i][0] + 0.42, 1.15, list[i][1] + 0.12];
  const displays: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; last: string }[] = [];
  const hoses: THREE.Mesh[] = [];
  let group: THREE.Group;
  const comp: Component = {
    id,
    colliders: () => list.map(([x, z]) => ({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.3, z1: z + 0.3 })),
    init: () => ({ p: list.map(() => ({ auth: 0, gal: 0, cost: 0 })) }),
    spawn(h) {
      list.forEach((_, i) => {
        const slot = h.slot(`${id}${i}`, ...holster(i));
        h.items.spawn('nozzle', false, 0, 0, 0, slot, base + i);
        pumpRegistry.set(base + i, { stopId: h.stopId, comp, index: i, price });
      });
    },
    act(h, st, from, key) {
      const i = Number(key.slice(4)); const p = st.p[i]; if (!p) return;
      const held = h.held(from);
      if (held?.k === 'nozzle' && held.d === base + i) { held.h = -1; held.s = `stop:${h.stopId}:${id}${i}`; h.sfx('clank'); return; }
      if (held?.k === 'jerrycan') {
        if (p.auth <= 0) { h.toast('Swipe the card first'); return; }
        const gal = Math.max(0, 5 - held.d);
        if (gal > 0 && h.charge(from, gal * price, `Gas (jerrycan) ${gal.toFixed(1)} gal`)) { held.d = 5; p.gal += gal; p.cost += gal * price; h.sfx('pour'); }
        return;
      }
      if (!h.needCard(from)) return;
      p.auth = 180; p.gal = 0; p.cost = 0; h.sfx('cash');
      h.toast(`⛽ Pump ${i + 1} authorized ($${price.toFixed(2)}/gal) — fuel port is on the RV's back-left`);
    },
    step(h, st, dt) {
      for (const p of st.p) p.auth = Math.max(0, p.auth - dt);
      for (const it of h.s.items) {
        if (it.k !== 'nozzle' || it.s || it.d < base || it.d >= base + list.length) continue;
        const i = it.d - base, w = h.itemWorld(it);
        const [px, , pz] = h.world(list[i][0], 0, list[i][1]);
        if (!w || Math.hypot(w[0] - px, w[2] - pz) > 7) {
          it.h = -1; it.s = `stop:${h.stopId}:${id}${i}`; h.sfx('clank'); h.toast('*SNAP* — the hose yanked the nozzle back');
        }
      }
    },
    build(v) {
      group = v.group;
      list.forEach(([x, z], i) => {
        const pump = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.6), MAT.red); body.position.y = 0.85; body.castShadow = true;
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.25, 0.65), MAT.white); top.position.y = 1.8;
        const c = document.createElement('canvas'); c.width = 128; c.height = 96;
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshBasicMaterial({ map: tex }));
        disp.position.set(0.352, 1.35, 0); disp.rotation.y = Math.PI / 2;
        const holsterMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), MAT.dark); holsterMesh.position.set(0.39, 1.15, 0.12);
        pump.add(body, top, disp, holsterMesh); pump.position.set(x, 0, z); v.group.add(pump);
        displays.push({ tex, g: c.getContext('2d')!, last: '' });
        v.reg(`pump${i}`, pump, (st, ctx) => {
          const p = st.p[i];
          if (ctx.held === 'nozzle') return 'Hang up the nozzle';
          if (ctx.held === 'jerrycan') return p.auth > 0 ? `Fill jerrycan ($${price.toFixed(2)}/gal)` : 'Swipe the card first';
          if (ctx.held === 'card') return `Swipe card at pump ${i + 1}`;
          return p.auth > 0 ? `Pump ${i + 1} authorized — grab the nozzle` : `Pump ${i + 1}: swipe the debit card ($${price.toFixed(2)}/gal)`;
        });
        const hose = new THREE.Mesh(new THREE.BufferGeometry(), MAT.dark); v.group.add(hose); hoses.push(hose);
      });
    },
    update(_v, st, s, _dt, itemPos) {
      st.p.forEach((p: { auth: number; gal: number; cost: number }, i: number) => {
        const d = displays[i]; const text = `${p.auth > 0}|${p.gal.toFixed(1)}|${p.cost.toFixed(2)}`;
        if (text !== d.last) {
          d.last = text; const g = d.g;
          g.fillStyle = '#111'; g.fillRect(0, 0, 128, 96);
          g.fillStyle = p.auth > 0 ? '#76ff03' : '#ff5252'; g.font = 'bold 16px monospace'; g.fillText(p.auth > 0 ? 'AUTHORIZED' : 'SWIPE CARD', 8, 20);
          g.fillStyle = '#ffd54f'; g.font = 'bold 24px monospace'; g.fillText(`${p.gal.toFixed(1)} GAL`, 8, 52); g.fillText(`$${p.cost.toFixed(2)}`, 8, 84);
          d.tex.needsUpdate = true;
        }
        const nz = s.items.find((it) => it.k === 'nozzle' && it.d === base + i);
        const a = new THREE.Vector3(list[i][0] + 0.36, 1.45, list[i][1] + 0.22);
        const wp = nz ? itemPos(nz.id) : null;
        const b = wp ? group.worldToLocal(wp.clone()) : new THREE.Vector3(...holster(i));
        const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(0.05, Math.min(a.y, b.y) - Math.max(0.15, 1.6 - a.distanceTo(b) * 0.2));
        hoses[i].geometry.dispose();
        hoses[i].geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.025, 6, false);
      });
    },
  };
  return comp;
}

/** Pump fuel from a held stop nozzle into the RV (called every 0.2 s while held). */
export function pumpIntoRV(h: HostCtx, st: any, index: number, price: number, from: number) {
  const p = st.p[index];
  if (p.auth <= 0) { h.toast('Pump isn\'t authorized — swipe the card at the pump'); return; }
  const room = 25 - h.s.rv.fuel;
  if (room <= 0.01) { h.toast('⛽ Tank is full'); return; }
  const gal = Math.min(0.5, room);
  if (!h.charge(from, gal * price, 'Gas')) return;
  h.s.rv.fuel += gal; p.gal += gal; p.cost += gal * price; p.auth = Math.max(p.auth, 30);
}

// ---------------------------------------------------------------- pawn / vending / ice / bed / scrap
export const PAWN_VALUES: Record<string, number> = {
  spare: 45, extinguisher: 18, hammer: 9, tape: 5, jerrycan: 12, coolant: 7, fuse: 2, map: 1, sponge: 1,
  nozzle: 0, scratch: 0, card: 0, ice: 0, weed: 0, pistol: 0, rock: 0, rocket: 0, battery: 35, cat: 80, wheel: 25,
};
export function pawn(id: string, pos: [number, number, number], who: string): Component {
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.5, x1: pos[0] + 0.5, z0: pos[2] - 0.5, z1: pos[2] + 0.5, top: pos[1] }],
    act(h, _st, from) {
      const it = h.held(from);
      if (!it) return;
      if (it.k === 'card') { h.toast(`${who.toUpperCase()}: "I ain't buying your debit card, genius."`); return; }
      const v = PAWN_VALUES[it.k] ?? 1;
      if (v <= 0 || it.p > 0) { h.toast(`${who.toUpperCase()}: "Can't take that."`); return; }
      h.items.remove(it.id);
      h.credit(from, v, `Pawned ${itemName(it.k, it.d)}`);
      h.toast(`💵 ${who}: "I'll give ya $${v} for that ${itemName(it.k, it.d)}." (+$${v})`);
    },
    build(v) {
      const bin = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1, pos[1], 1), MAT.wood); crate.position.y = pos[1] / 2; crate.castShadow = true;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: signTexture([['WE BUY', 80, '#3b1f0e'], ['ANYTHING', 64, '#b71c1c']], '#ffd54f', 512, 256) }));
      s.position.set(-0.51, pos[1] * 0.6, 0); s.rotation.y = -Math.PI / 2;
      bin.add(crate, s); bin.position.set(pos[0], 0, pos[2]); v.group.add(bin);
      v.reg('sell', bin, (_st, c) => (c.held && c.held !== 'card' ? `Sell your ${c.held} ($${PAWN_VALUES[c.held] ?? 1})` : `${who}'s buy counter — bring something to sell`));
    },
  };
}

export function vending(id: string, pos: [number, number], item: string, price: number, color: string, label: string): Component {
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.45, x1: pos[0] + 0.45, z0: pos[1] - 0.5, z1: pos[1] + 0.5 }],
    act(h, _st, from) {
      if (!h.needCard(from) || !h.charge(from, price, `Vending: ${itemName(item, 0)}`)) return;
      const [x, y, z] = h.world(pos[0] - 0.7, 0.9, pos[1]);
      h.items.spawn(item, false, x, y, z); h.sfx('clank');
    },
    build(v) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.95), new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); body.position.y = 0.95; body.castShadow = true;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshStandardMaterial({ map: signTexture([[label, 60, '#fff'], [`$${price}`, 90, '#ffeb3b']], color, 256, 384), emissive: '#ffffff', emissiveIntensity: 0.15 }));
      front.position.set(-0.41, 1.1, 0); front.rotation.y = -Math.PI / 2;
      g.add(body, front); g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      v.reg('buy', g, (_st, c) => (c.held === 'card' ? `Buy ${itemName(item, 0)} ($${price})` : `${label} machine — need the card ($${price})`));
    },
  };
}

export function iceMachine(id: string, pos: [number, number]): Component {
  let cd = 0;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.5, x1: pos[0] + 0.5, z0: pos[1] - 0.6, z1: pos[1] + 0.6 }],
    act(h) {
      if (cd > 0) { h.toast('Ice machine is grinding…'); return; }
      cd = 8; const [x, y, z] = h.world(pos[0] - 0.8, 0.9, pos[1]);
      h.items.spawn('ice', false, x, y, z); h.sfx('clank');
    },
    step(_h, _st, dt) { cd = Math.max(0, cd - dt); },
    build(v) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 1.1), MAT.white); body.position.y = 0.8; body.castShadow = true;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: signTexture([['ICE', 140, '#0277bd']], '#e1f5fe', 512, 256) }));
      s.position.set(-0.46, 1.25, 0); s.rotation.y = -Math.PI / 2;
      g.add(body, s); g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      v.reg('ice', g, () => 'Free ice (cools a boiling radiator)');
    },
  };
}

export function bed(id: string, pos: [number, number], price: number, hours: number, label: string): Component {
  return {
    id,
    colliders: () => [{ x0: pos[0] - 1.1, x1: pos[0] + 1.1, z0: pos[1] - 1, z1: pos[1] + 1, top: 0.6 }],
    act(h, _st, from) {
      if (!h.needCard(from) || !h.charge(from, price, `${label} (${hours}h sleep)`)) return;
      h.s.clock += hours * 3600;
      for (const c of Object.values(h.s.crew)) { c.hypno = 0; c.caf = 0; c.hunger = Math.max(0, c.hunger - 15); }
      h.sfx('bell');
      h.toast(`😴 Everyone crashed for ${hours} hours. Fully rested, a little hungrier, ${hours}h closer to the wedding.`);
    },
    build(v) {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2, 0.45, 1.8), MAT.wood); frame.position.y = 0.22;
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.18, 1.75), new THREE.MeshStandardMaterial({ color: '#e8d5b0' })); mattress.position.y = 0.53;
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.78), new THREE.MeshStandardMaterial({ color: '#7b1fa2' })); blanket.position.set(0.3, 0.64, 0);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 1.2), MAT.white); pillow.position.set(-0.75, 0.68, 0);
      g.add(frame, mattress, blanket, pillow); g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      v.reg('sleep', g, (_st, c) => (c.held === 'card' ? `Rent it & sleep ${hours}h ($${price}) — resets hypnosis, costs time` : `${label} — need the card ($${price})`));
    },
  };
}

export function scrap(id: string, list: [string, number, number, number][]): Component {
  return {
    id,
    spawn(h) { for (const [k, x, y, z] of list) { const [wx, wy, wz] = h.world(x, y, z); h.items.spawn(k, false, wx, wy, wz); } },
    build() {},
  };
}

/** Price-tag helper for floating labels. */
export function priceTag(text: string) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: canvasTex(256, 96, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#c62828'; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.fillText(text, 128, 66);
  }) }));
  return m;
}
