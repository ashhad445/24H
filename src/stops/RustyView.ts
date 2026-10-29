// Client-side meshes, interactables and animation for Rusty's Oasis.
import * as THREE from 'three';
import { makeNpc } from '../models/npcs';
import type { PromptCtx } from '../rv/RV';
import type { SharedState } from '../types';
import { chaserPose, makeBat } from './chaseView';
import { Assets } from '../core/AssetLoader';
import { dressBuilding, kitProp } from './buildingKit';
import {
  BUCKET, CANOPY, CLETUS, COUNTER, CRABS, CRAB_COLORS, CRATE, DERBY, HOLSTER, LOT, PRICES, PUMPS, REGISTER, RUSTY_FRAME,
  SEDAN, SIGN, SLOT, SPLATS, STORE, SUV, SUV_CAP, TABLES, WASH, AMMO_BOX, DEALER, DEALER_CRATE, JUNKERS, PART_SELL, TAMMY,
} from './rusty';

type Prompt = (s: SharedState, c: PromptCtx) => string;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function signTex(lines: [string, number, string][], bg: string, w = 512, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let y = 0; const total = lines.reduce((a, l) => a + l[1] * 1.15, 0); y = (h - total) / 2;
    for (const [text, size, color] of lines) {
      g.font = `900 ${size}px "Arial Black", Arial, sans-serif`; g.fillStyle = color;
      const fit = Math.min(1, (w * 0.92) / Math.max(1, g.measureText(text).width));
      if (fit < 1) g.font = `900 ${Math.floor(size * fit)}px "Arial Black", Arial, sans-serif`;
      g.fillText(text, w / 2, y + size * 0.6); y += size * 1.15;
    }
  });
}

const SYMBOLS = ['7', '🍒', 'BAR', '🔔', '🍋', '★'];

const carPrompt = (i: number) => (s: SharedState, c: { held: string }) => {
  const car = s.rusty.cars[i];
  if (!car) return '';
  if (c.held === 'jerrycan') return car.gas > 0 ? 'Siphon gas (minigame — mess up and you get caught)' : 'Bone dry';
  if (c.held) return 'Empty hands to strip it, or a jerrycan to siphon';
  return car.parts > 0 ? `Strip the ${['battery', 'catalytic converter', 'wheel'][3 - car.parts]} (sell it to Vinnie out back)` : 'A stripped shell';
};

export class RustyView {
  readonly group = new THREE.Group();
  private prompts = new Map<string, Prompt>();
  private pumpDisplays: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; last: string }[] = [];
  private hoses: THREE.Mesh[] = [];
  private cletus = new THREE.Group();
  private bat!: THREE.Mesh;
  private paper: THREE.Mesh;
  private reels: THREE.Mesh[] = [];
  private reelAngle = [0, 0, 0];
  private reelStopped = [true, true, true];
  private crabs: THREE.Group[] = [];
  private sedan = new THREE.Group();
  private splats: THREE.Mesh[] = [];
  private M = {
    lot: new THREE.MeshStandardMaterial({ color: '#4a4642', roughness: 1 }),
    paint: new THREE.MeshStandardMaterial({ color: '#f2f0e6', roughness: 0.8 }),
    wall: new THREE.MeshStandardMaterial({ color: '#e9c48a', roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: '#b5653e', roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: '#7d4b2a', roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.4, metalness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.8 }),
    felt: new THREE.MeshStandardMaterial({ color: '#1b5e20', roughness: 1 }),
    tire: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fc6d6', roughness: 0.1, transparent: true, opacity: 0.35 }),
    hose: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }),
  };

  constructor(scene: THREE.Scene) {
    const g = this.group, M = this.M;
    g.position.set(RUSTY_FRAME.x, 0, RUSTY_FRAME.z);
    g.rotation.y = RUSTY_FRAME.yaw;
    scene.add(g);

    // lot + parking stripes
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(LOT.x1 - LOT.x0, LOT.z1 - LOT.z0).rotateX(-Math.PI / 2), M.lot);
    lot.position.set((LOT.x0 + LOT.x1) / 2, 0.006, (LOT.z0 + LOT.z1) / 2); lot.receiveShadow = true; g.add(lot);
    for (let i = 0; i < 6; i++) this.box(M.paint, 54 + i * 0, 58, 0.008, 0.012, -38 + i * 3.2, -37.9 + i * 3.2);

    // ---------- canopy + pumps ----------
    this.box(M.white, CANOPY.x0, CANOPY.x1, CANOPY.y, CANOPY.y + 0.5, CANOPY.z0, CANOPY.z1, true);
    this.box(M.red, CANOPY.x0 - 0.02, CANOPY.x1 + 0.02, CANOPY.y + 0.1, CANOPY.y + 0.4, CANOPY.z0 - 0.02, CANOPY.z1 + 0.02);
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.42), new THREE.MeshBasicMaterial({ map: signTex([["RUSTY'S", 150, '#fff']], '#c62828', 1024, 160) }));
    fascia.position.set(CANOPY.x0 - 0.03, CANOPY.y + 0.25, 0); fascia.rotation.y = -Math.PI / 2; g.add(fascia);
    for (const [x, z] of [[CANOPY.x0, CANOPY.z0], [CANOPY.x1, CANOPY.z0], [CANOPY.x0, CANOPY.z1], [CANOPY.x1, CANOPY.z1]]) this.box(M.steel, x - 0.15, x + 0.15, 0, CANOPY.y, z - 0.15, z + 0.15, true);
    const canopyLight = new THREE.PointLight('#fff4d6', 6, 16, 1); canopyLight.position.set(12.5, CANOPY.y - 0.4, 0); g.add(canopyLight);
    this.box(M.paint, 11.3, 12.7, 0, 0.18, -6.5, 6.5); // island curb
    PUMPS.forEach(([x, z], i) => {
      const pump = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.6), M.red); body.position.y = 0.85; body.castShadow = true;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.25, 0.65), M.white); top.position.y = 1.8;
      const c = document.createElement('canvas'); c.width = 128; c.height = 96;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshBasicMaterial({ map: tex }));
      disp.position.set(0.352, 1.35, 0); disp.rotation.y = Math.PI / 2;
      const reader = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.14), M.dark); reader.position.set(0.37, 1.0, -0.18);
      const holster = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), M.dark); holster.position.set(0.39, 1.15, 0.12);
      pump.add(body, top, disp, reader, holster);
      pump.position.set(x, 0, z);
      g.add(pump);
      this.pumpDisplays.push({ tex, ctx: c.getContext('2d')!, last: '' });
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ map: signTex([[String(i + 1), 120, '#c62828']], '#fff', 128, 96) }));
      num.position.set(0.379, 1.8, 0); num.rotation.y = Math.PI / 2; pump.add(num);
      this.reg(`rusty:pump${i}`, pump, (s, c2) => {
        const p = s.rusty.pumps[i];
        if (c2.held === 'nozzle') return 'Hang up the nozzle';
        if (c2.held === 'jerrycan') return p.auth > 0 ? `Fill jerrycan ($${PRICES.gas.toFixed(2)}/gal)` : 'Swipe the card first';
        if (c2.held === 'card') return `Swipe card at pump ${i + 1}`;
        return p.auth > 0 ? `Pump ${i + 1} authorized — grab the nozzle` : `Pump ${i + 1}: swipe the debit card ($${PRICES.gas.toFixed(2)}/gal)`;
      });
      const hose = new THREE.Mesh(new THREE.BufferGeometry(), M.hose); hose.castShadow = true; g.add(hose);
      this.hoses.push(hose);
    });

    // ---------- store ----------
    const S = STORE, wt = 0.2;
    const shellWalls: [number, number, number, number][] = [
      [S.x0 - wt, S.x0, S.z0, S.doorZ0], [S.x0 - wt, S.x0, S.doorZ1, S.z1], [S.x1, S.x1 + wt, S.z0, S.z1],
      [S.x0, S.x1, S.z0 - wt, S.z0], [S.x0, S.x1, S.z1, S.z1 + wt],
      [S.innerX, S.innerX + wt, S.z0, S.innerDoorZ0], [S.innerX, S.innerX + wt, S.innerDoorZ1, S.z1],
    ];
    for (const [x0, x1, z0, z1] of shellWalls) this.box(M.wall, x0, x1, 0, S.h, z0, z1, true);
    this.box(M.wall, S.x0 - wt, S.x0, 2.6, S.h, S.doorZ0, S.doorZ1, true); // over the door
    this.box(M.wall, S.innerX, S.innerX + wt, 2.4, S.h, S.innerDoorZ0, S.innerDoorZ1);
    const roofSlab = this.box(M.roof, S.x0 - 0.6, S.x1 + 0.4, S.h, S.h + 0.25, S.z0 - 0.5, S.z1 + 0.5, true);
    const wainscot = this.box(M.trim, S.x0 - 0.25, S.x0 - 0.2, 0, 0.6, S.z0, S.z1); // wainscot
    // front windows (glass in a frame) either side of the door
    const panes = [[-10, -5], [1.5, 6]].map(([z0, z1]) => this.glassPane(S.x0 - wt - 0.01, 1.2, 2.3, z0, z1));
    const floorTex = canvasTex(128, 128, (c) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#d9d2c3' : '#6d4c41'; c.fillRect(i * 16, j * 16, 16, 16); } });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(8, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0, S.z1 - S.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
    floor.position.set((S.x0 + S.x1) / 2, 0.012, (S.z0 + S.z1) / 2); floor.receiveShadow = true; g.add(floor);
    const storeSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: signTex([['GENERAL STORE', 70, '#3b1f0e'], ['ICE · BAIT · BEER · PARTS', 34, '#7a2a1a']], '#f0ad4e') }));
    storeSign.position.set(S.x0 - wt - 0.02, 3.2, -2); storeSign.rotation.y = -Math.PI / 2; g.add(storeSign);
    // Blender kit dressing once the models are in: cornice, framed windows, awnings, roof clutter, yard junk
    Assets.onReady(() => {
      if (!dressBuilding(g, { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1, h: S.h, door: [S.doorZ0, S.doorZ1], wall: '#e9c48a', roof: '#7d4b2a', trim: '#fff3e0', awning: '#b71c1c', accent: '#b71c1c' }, wt)) return;
      roofSlab.visible = wainscot.visible = false; panes.forEach((p) => (p.visible = false));
      this.box(new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 }), S.x0, S.x1, S.h - 0.02, S.h, S.z0, S.z1);
      // the sign moves up onto the roof on two legs
      storeSign.position.set(S.x0 + 0.15, S.h + 1.2, -2);
      for (const dz of [-2.1, 2.1]) this.box(M.dark, S.x0 + 0.2, S.x0 + 0.32, S.h, S.h + 1.2, -2 + dz - 0.06, -2 + dz + 0.06, true);
      for (const [n, x, z, r] of [['dumpster', 52.5, -8, Math.PI / 2], ['trashcan', 32.8, -4.3, 0], ['newsbox', 32.8, 0.6, Math.PI / 2], ['bench', 32.6, -8, Math.PI / 2],
        ['barrel', 31.5, 10.5, 0], ['barrel', 32.2, 11, 0], ['tires', 47.5, 12, 0], ['crate', 52.6, 4, 0.3]] as [string, number, number, number][]) kitProp(g, n, x, z, r);
    });
    for (const lp of [[40, -3], [48, 0]]) { const l = new THREE.PointLight('#ffe2a8', 5, 14, 1); l.position.set(lp[0], 3.5, lp[1]); g.add(l); }
    // counter + register
    this.box(M.wood, COUNTER.x0, COUNTER.x1, 0, COUNTER.top, COUNTER.z0, COUNTER.z1, true);
    const reg = new THREE.Group();
    const regBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.35), M.dark); regBody.position.y = 0.11;
    const regScreen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: '#0b3', emissive: '#0a2', emissiveIntensity: 0.6 }));
    regScreen.position.set(-0.12, 0.3, 0); regScreen.rotation.z = 0.3;
    reg.add(regBody, regScreen); reg.position.set(...REGISTER); g.add(reg);
    this.reg('rusty:register', reg, (_s, c) => (c.held === 'card' ? 'Pay for everything on the counter' : 'Register — bring the card (put items on the counter next to it)'));
    // display tables
    TABLES.forEach((t, i) => {
      this.box(M.wood, t.x0, t.x1, 0, t.top, t.z0, t.z1, true);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({ map: signTex([[i === 0 ? 'GROCERIES' : 'AUTO & SUNDRIES', 80, '#fff']], '#2e7d32', 512, 128) }));
      tag.position.set(t.x0 - 0.01, 0.75, (t.z0 + t.z1) / 2); tag.rotation.y = -Math.PI / 2; g.add(tag);
    });
    // Cletus
    this.buildCletus();
    const paperMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', side: THREE.DoubleSide });
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), paperMat);
    this.paper.position.set(0, 1.3, -0.35); this.cletus.add(this.paper);

    // ---------- back room: slots + crab derby ----------
    const brLight = new THREE.PointLight('#ff4d6d', 4, 8, 1); brLight.position.set(48, 3.2, -4); g.add(brLight);
    const slot = new THREE.Group(); slot.position.set(...SLOT);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.9), new THREE.MeshStandardMaterial({ color: '#6a1b9a', roughness: 0.5 })); cab.position.y = 0.95; cab.castShadow = true;
    const topper = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.35), new THREE.MeshBasicMaterial({ map: signTex([['LUCKY 777', 90, '#ffd54f']], '#4a148c', 512, 192) }));
    topper.position.set(-0.43, 1.7, 0); topper.rotation.y = -Math.PI / 2;
    const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.66), M.dark); window_.position.set(-0.43, 1.2, 0);
    slot.add(cab, topper, window_);
    const reelTex = canvasTex(384, 96, (c) => {
      c.fillStyle = '#fffde7'; c.fillRect(0, 0, 384, 96);
      SYMBOLS.forEach((sym, i) => {
        c.save(); c.translate(i * 64 + 32, 48); c.rotate(-Math.PI / 2);
        c.fillStyle = i === 0 ? '#d32f2f' : '#222'; c.font = `bold ${sym.length > 2 ? 22 : 40}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(sym, 0, 0); c.restore();
      });
    });
    for (let i = 0; i < 3; i++) {
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: reelTex, roughness: 0.5 }));
      reel.position.set(-0.32, 1.2, -0.21 + i * 0.21);
      slot.add(reel); this.reels.push(reel);
    }
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), M.steel); lever.position.set(-0.1, 1.35, 0.5);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.red); knob.position.set(-0.1, 1.62, 0.5);
    slot.add(lever, knob);
    g.add(slot);
    this.reg('rusty:slot', slot, (s, c) => (s.rusty.slot.left > 0 ? 'Spinning…' : c.held === 'card' ? `Pull the lever ($${PRICES.slot}) — pair = money back, triple = $100, 777 = $250` : `Lucky 777 — need the card ($${PRICES.slot})`));

    // derby table
    this.box(M.wood, DERBY.x0, DERBY.x1, 0, DERBY.top - 0.04, DERBY.z0, DERBY.z1, true);
    this.box(M.felt, DERBY.x0 + 0.05, DERBY.x1 - 0.05, DERBY.top - 0.04, DERBY.top, DERBY.z0 + 0.05, DERBY.z1 - 0.05);
    for (let i = 0; i < 4; i++) { const lx = DERBY.lanes[0] - 0.325 + i * 0.65; this.box(M.paint, lx - 0.015, lx + 0.015, DERBY.top, DERBY.top + 0.06, DERBY.start - 0.2, DERBY.finish + 0.2); }
    this.box(M.red, DERBY.x0 + 0.1, DERBY.x1 - 0.1, DERBY.top, DERBY.top + 0.005, DERBY.finish, DERBY.finish + 0.06);
    DERBY.lanes.forEach((lx, i) => {
      const crab = this.buildCrab(CRAB_COLORS[i]);
      crab.position.set(lx, DERBY.top, DERBY.start); g.add(crab); this.crabs.push(crab);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14), new THREE.MeshStandardMaterial({ color: CRAB_COLORS[i], emissive: CRAB_COLORS[i], emissiveIntensity: 0.4 }));
      btn.position.set(lx, DERBY.top + 0.03, DERBY.z0 + 0.15); g.add(btn);
      this.reg(`rusty:crab${i}`, btn, (s, c) => (s.rusty.derby.phase === 2 ? 'Race in progress!' : c.held === 'card' ? `Bet $${PRICES.crab} on ${CRABS[i]} (wins $${PRICES.crabWin})` : `${CRABS[i]} — need the card to bet`));
      this.reg(`rusty:crab${i}`, crab, (s, c) => (s.rusty.derby.phase === 2 ? `${CRABS[i]} is scuttling!` : c.held === 'card' ? `Bet $${PRICES.crab} on ${CRABS[i]}` : `${CRABS[i]} the crab`));
    });
    const derbySign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: signTex([['LIVE CRAB DERBY', 60, '#ffd54f'], ['$15 BET · WIN $45', 44, '#fff']], '#b71c1c') }));
    derbySign.position.set(S.x1 - 0.02, 2.2, 3.8); derbySign.rotation.y = -Math.PI / 2; g.add(derbySign);

    // ---------- car wash ----------
    this.box(M.white, WASH.x0, WASH.x1, WASH.h, WASH.h + 0.3, WASH.z0 - 0.2, WASH.z1 + 0.2, true);
    this.box(M.wall, WASH.x0, WASH.x1, 0, WASH.h, WASH.z0 - 0.2, WASH.z0, true);
    this.box(M.wall, WASH.x0, WASH.x1, 0, WASH.h, WASH.z1, WASH.z1 + 0.2, true);
    const washSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ map: signTex([['CAR WASH', 90, '#0d47a1'], ['WASH A CAR · EARN $35', 40, '#1565c0']], '#e3f2fd') }));
    washSign.position.set(WASH.x0 - 0.01, WASH.h - 0.2, (WASH.z0 + WASH.z1) / 2); washSign.rotation.y = -Math.PI / 2; g.add(washSign);
    this.buildCar(this.sedan, '#4fc3f7', SEDAN.len, SEDAN.wid, 1.0, 0.5, false);
    this.sedan.position.set(SEDAN.x, 0, SEDAN.z); g.add(this.sedan);
    this.reg('rusty:car0', this.sedan, carPrompt(0)); // registered before the mud so the splats keep their own id
    const mud = canvasTex(128, 128, (c) => {
      for (let i = 0; i < 26; i++) {
        const x = 64 + (Math.random() - 0.5) * 70, y = 64 + (Math.random() - 0.5) * 70, r = 8 + Math.random() * 22;
        c.fillStyle = `rgba(${90 + Math.random() * 30},${62 + Math.random() * 20},${35},0.9)`;
        c.beginPath(); c.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); c.fill();
      }
    });
    SPLATS.forEach((sp, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshStandardMaterial({ map: mud, transparent: true, depthWrite: false, roughness: 1 }));
      m.position.set(sp.p[0] - SEDAN.x, sp.p[1], sp.p[2] - SEDAN.z);
      if (sp.n === 'z-') m.rotation.y = Math.PI;
      if (sp.n === 'y') { m.rotation.x = -Math.PI / 2; m.position.y += 0.012; }
      this.sedan.add(m); this.splats.push(m);
      this.reg(`rusty:dirt${i}`, m, (s, c) => (s.rusty.wash.dirt[i] <= 0 ? '' : c.held === 'sponge' ? 'Scrub the mud' : 'Mud — grab the sponge (crate by the bucket)'));
    });
    const bucket = new THREE.Group(); bucket.position.set(...BUCKET);
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.38, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#1565c0', side: THREE.DoubleSide })); pail.position.y = 0.19;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.19, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e1f5fe', roughness: 0.2 })); water.position.y = 0.33;
    bucket.add(pail, water); g.add(bucket);
    this.reg('rusty:bucket', bucket, (_s, c) => (c.held === 'sponge' ? 'Dip the sponge' : 'Bucket of soapy water'));
    this.box(M.wood, CRATE.x0, CRATE.x1, 0, CRATE.top, CRATE.z0, CRATE.z1, true);

    // ---------- the stranger's SUV ----------
    const suv = new THREE.Group();
    this.buildCar(suv, '#33691e', SUV.len, SUV.wid, 1.25, 0.6, true);
    suv.rotation.y = Math.PI / 2; suv.position.set(SUV.x, 0, SUV.z); g.add(suv);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateZ(Math.PI / 2), M.dark);
    cap.position.set(...SUV_CAP); g.add(cap);
    this.reg('rusty:car1', suv, carPrompt(1));
    JUNKERS.forEach((j, n) => {
      const car = new THREE.Group();
      this.buildCar(car, j.color, 4.4, 1.9, 1.0, 0.5, n === 1);
      car.rotation.y = Math.PI / 2 + (n - 1) * 0.08; car.position.set(j.x, 0, j.z); g.add(car);
      this.reg(`rusty:car${n + 2}`, car, carPrompt(n + 2));
    });

    // ---------- the shady corner behind the store ----------
    this.box(this.M.wood, DEALER_CRATE.x0, DEALER_CRATE.x1, 0, DEALER_CRATE.top, DEALER_CRATE.z0, DEALER_CRATE.z1, true);
    const vinnie = makeNpc('generic', { body: '#2d2f33', pants: '#17181a', shades: true, hat: 'cap', hatColor: '#111', pose: 'cross', skin: '#b98152' });
    vinnie.position.set(...DEALER); vinnie.rotation.y = Math.PI / 2; g.add(vinnie);
    const gunBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: '#4e5d3a', roughness: 0.8 }));
    gunBox.position.set(...AMMO_BOX); g.add(gunBox);
    this.reg('rusty:ammo', gunBox, (_s, c) => (c.held === 'card' ? `Buy 12 rounds for your pistol — $${PRICES.ammo}` : 'Box of ammo (bring the card; carry a pistol)'));
    this.reg('rusty:dealer', vinnie, (_s, c) => (PART_SELL[c.held] ? `Sell the ${c.held === 'cat' ? 'catalytic converter' : c.held} to Vinnie — $${PART_SELL[c.held]}` : c.held === 'card' ? `Buy a pistol — $${PRICES.pistol} (no receipt)` : 'VINNIE: "Psst. Bring the card. Or bring parts."'));
    const tammy = makeNpc('generic', { body: '#e91e63', pants: '#880e4f', hat: 'beehive', hatColor: '#ffeb3b', skin: '#e8b98a', pose: 'hips' });
    tammy.position.set(...TAMMY); tammy.rotation.y = Math.PI / 2; g.add(tammy);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff1744' }));
    lamp.position.set(TAMMY[0] + 0.6, 2.4, TAMMY[2]); g.add(lamp);
    this.reg('rusty:tammy', tammy, () => `TAMMY: "$${PRICES.favor}, sugar. Round the back. Costs you your appetite and legs."`);
    this.reg('rusty:suv', cap, (_s, c) => (c.held === 'jerrycan' ? 'Siphon gas (minigame — mess up and you get caught)' : "Somebody's SUV. Full tank, probably."));

    // ---------- pylon sign ----------
    this.box(M.steel, SIGN[0] - 0.2, SIGN[0] + 0.2, 0, 9, SIGN[1] - 0.2, SIGN[1] + 0.2, true);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 5.5), [M.trim, M.trim, M.trim, M.trim,
      new THREE.MeshBasicMaterial({ map: signTex([["RUSTY'S", 110, '#fff'], ['OASIS', 90, '#ffd54f'], ['GAS · SLOTS · LIVE CRABS', 34, '#fff'], [`REG $${PRICES.gas.toFixed(2)}`, 46, '#ffeb3b']], '#b71c1c', 512, 384) }),
      new THREE.MeshBasicMaterial({ map: signTex([["RUSTY'S", 110, '#fff'], ['OASIS', 90, '#ffd54f'], ['GAS · SLOTS · LIVE CRABS', 34, '#fff'], [`REG $${PRICES.gas.toFixed(2)}`, 46, '#ffeb3b']], '#b71c1c', 512, 384) })]);
    pylon.position.set(SIGN[0], 9.5, SIGN[1]); pylon.rotation.y = Math.PI / 2; pylon.castShadow = true; g.add(pylon);
  }

  private box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, cast = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = cast; m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private glassPane(x: number, y0: number, y1: number, z0: number, z1: number) {
    // a "window" is a darker inset with glass; walls stay solid for collision simplicity
    const w = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), new THREE.MeshStandardMaterial({ color: '#33414a', roughness: 0.15, metalness: 0.5 }));
    w.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2); w.rotation.y = -Math.PI / 2;
    this.group.add(w);
    return w;
  }

  private reg(id: string, obj: THREE.Object3D, prompt: Prompt) {
    obj.traverse((o) => { o.userData.iid = id; });
    if (!this.prompts.has(id)) this.prompts.set(id, prompt);
  }

  promptFor(id: string, s: SharedState, c: PromptCtx) { return this.prompts.get(id)?.(s, c) ?? ''; }

  private buildCletus() {
    const c = this.cletus;
    c.add(makeNpc('cletus'));
    // shotgun leaning on the counter
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.06), this.M.wood);
    gun.position.set(COUNTER.x1 + 0.12, 0.5, COUNTER.z1 - 0.2); gun.rotation.z = 0.25; this.group.add(gun);
    c.position.set(...CLETUS);
    this.bat = makeBat(); this.bat.visible = false; c.add(this.bat);
    c.traverse((o) => { o.userData.iid = 'rusty:cletus'; });
    this.prompts.set('rusty:cletus', (s) => (s.rusty.cletus.chase ? 'CLETUS IS COMING WITH A BAT' : s.rusty.cletus.watch ? 'CLETUS: "I got my eye on you."' : 'Cletus is reading the paper…'));
    this.group.add(c);
  }

  private buildCrab(color: string) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), m); body.scale.set(1.3, 0.5, 1); body.position.y = 0.05;
    g.add(body);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m); claw.position.set(s * 0.1, 0.06, -0.09); g.add(claw);
      for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.012), m); leg.position.set(s * 0.12, 0.03, -0.03 + k * 0.04); leg.rotation.z = s * 0.4; g.add(leg); }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 5), new THREE.MeshStandardMaterial({ color: '#111' })); eye.position.set(s * 0.03, 0.11, -0.06); g.add(eye);
    }
    return g;
  }

  private buildCar(g: THREE.Group, color: string, len: number, wid: number, bodyH: number, cabH: number, tall: boolean) {
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
    // car length along x
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, bodyH - 0.3, wid), paint); body.position.y = 0.3 + (bodyH - 0.3) / 2; body.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(len * (tall ? 0.7 : 0.5), cabH, wid * 0.9), paint); cab.position.set(tall ? -0.2 : 0.1, bodyH + cabH / 2, 0); cab.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(len * (tall ? 0.7 : 0.5) + 0.02, cabH * 0.7, wid * 0.9 + 0.02), this.M.glass); glass.position.copy(cab.position);
    g.add(body, cab, glass);
    for (const [x, z] of [[len * 0.33, wid / 2], [-len * 0.33, wid / 2], [len * 0.33, -wid / 2], [-len * 0.33, -wid / 2]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16).rotateX(Math.PI / 2), this.M.tire); w.position.set(x, 0.34, z); g.add(w);
    }
  }

  /** Per-frame animation. `itemPos(id)` gives an item's current world position (for the hose). */
  update(dt: number, s: SharedState, focus: THREE.Vector3, itemPos: (id: number) => THREE.Vector3 | null, sound: (name: string) => void) {
    const dist = Math.hypot(focus.x - RUSTY_FRAME.x, focus.z - RUSTY_FRAME.z);
    this.group.visible = dist < 1600;
    if (!this.group.visible) return;
    const r = s.rusty;

    // pump displays
    r.pumps.forEach((p, i) => {
      const d = this.pumpDisplays[i];
      const text = `${p.auth > 0 ? 'ON' : 'OFF'}|${p.gal.toFixed(1)}|${p.cost.toFixed(2)}`;
      if (text === d.last) return;
      d.last = text;
      const g = d.ctx;
      g.fillStyle = '#111'; g.fillRect(0, 0, 128, 96);
      g.fillStyle = p.auth > 0 ? '#76ff03' : '#ff5252'; g.font = 'bold 16px monospace'; g.fillText(p.auth > 0 ? 'AUTHORIZED' : 'SWIPE CARD', 8, 20);
      g.fillStyle = '#ffd54f'; g.font = 'bold 24px monospace';
      g.fillText(`${p.gal.toFixed(1)} GAL`, 8, 52); g.fillText(`$${p.cost.toFixed(2)}`, 8, 84);
      d.tex.needsUpdate = true;
    });

    // hoses: sagging tube from the pump to its nozzle
    const nozzles = s.items.filter((it) => it.k === 'nozzle');
    this.hoses.forEach((hose, i) => {
      const nz = nozzles.find((it) => it.d === i);
      const [px, pz] = PUMPS[i];
      const a = new THREE.Vector3(px + 0.36, 1.45, pz + 0.22);
      let b: THREE.Vector3;
      const wp = nz ? itemPos(nz.id) : null;
      if (wp) b = this.group.worldToLocal(wp.clone()); else { const h = HOLSTER(i); b = new THREE.Vector3(h[0], h[1], h[2]); }
      const len = a.distanceTo(b);
      const mid = a.clone().lerp(b, 0.5); mid.y = Math.min(a.y, b.y) - Math.max(0.15, 1.6 - len * 0.2);
      mid.y = Math.max(0.05, mid.y);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      hose.geometry.dispose();
      hose.geometry = new THREE.TubeGeometry(curve, 16, 0.025, 6, false);
    });

    // Cletus turns between the floor (door) and his newspaper — or comes after you with a bat
    const ch = r.cletus.chase;
    chaserPose(this.cletus, this.group, ch, CLETUS, dt);
    this.bat.visible = !!ch;
    if (!ch) {
      const targetYaw = r.cletus.watch ? Math.PI / 2 : -Math.PI / 2;
      let dy = targetYaw - this.cletus.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.cletus.rotation.y += dy * Math.min(1, dt * 4);
    }
    this.paper.visible = !r.cletus.watch && !ch;

    // slot reels (stop one by one)
    const left = r.slot.left;
    for (let i = 0; i < 3; i++) {
      const stopAt = 1.6 - i * 0.6;
      const spinning = left > stopAt;
      if (spinning) { this.reelAngle[i] += dt * 18; this.reelStopped[i] = false; }
      else {
        // symbol k faces the player (−x side of the machine)
        // symbol k is centred at cylinder angle θ = 2π(k+½)/6; rotate it to face −x (toward the player)
        this.reelAngle[i] = (3 * Math.PI) / 2 - (2 * Math.PI * (r.slot.res[i] + 0.5)) / SYMBOLS.length;
        if (!this.reelStopped[i]) { this.reelStopped[i] = true; if (left > 0 || i === 2) sound('clank'); }
      }
      this.reels[i].rotation.z = this.reelAngle[i];
    }

    // crabs
    const d = r.derby;
    this.crabs.forEach((crab, i) => {
      const z = DERBY.start + (DERBY.finish - DERBY.start) * d.pos[i];
      crab.position.z += (z - crab.position.z) * Math.min(1, dt * 10);
      crab.rotation.y = Math.PI; // face the finish (+z)
      crab.position.x = DERBY.lanes[i] + (d.phase === 2 && d.winner < 0 ? Math.sin(performance.now() * 0.03 + i) * 0.04 : 0);
    });

    // car wash
    this.sedan.visible = r.wash.away <= 0;
    this.splats.forEach((m, i) => {
      const v = r.wash.dirt[i] / 2;
      (m.material as THREE.MeshStandardMaterial).opacity = v;
      m.visible = v > 0.01;
    });
  }
}
