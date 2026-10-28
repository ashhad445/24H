// Procedural 1980s Class-C RV: hull, interior, clickable dash, gauges, wheels, lights.
// root = untilted transform (x, z, yaw). body = child that pitches/rolls; everything visual hangs off body.
import * as THREE from 'three';
import { CFG, RV, WHEELBASE, gearInfo } from '../config';
import type { CabinState, RVState } from '../types';

export interface PromptCtx { held: string; cab: CabinState }
export interface Interactable { id: string; obj: THREE.Object3D; prompt: (s: RVState, c: PromptCtx) => string }
/** RV-local XZ box. `top` = surface height props can rest on (walls have none). */
export interface Box2 { x0: number; x1: number; z0: number; z1: number; door?: boolean; top?: number }

export const SEATS = {
  driver: { pos: new THREE.Vector3(-0.7, 1.08, -2.15), stand: new THREE.Vector3(-0.1, RV.floorY, -1.55) },
  nav: { pos: new THREE.Vector3(0.7, 1.08, -2.15), stand: new THREE.Vector3(0.35, RV.floorY, -1.45) },
};
export const SEAT_EYE = 0.86;

type Rect = [number, number, number, number]; // u0,u1,v0,v1

/** Subtract holes from a rectangle, returning covering rectangles. */
function wallRects(u0: number, u1: number, v0: number, v1: number, holes: Rect[]): Rect[] {
  const vs = new Set([v0, v1]);
  for (const h of holes) { if (h[2] > v0 && h[2] < v1) vs.add(h[2]); if (h[3] > v0 && h[3] < v1) vs.add(h[3]); }
  const vList = [...vs].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < vList.length - 1; i++) {
    const a = vList[i], b = vList[i + 1], mid = (a + b) / 2;
    const cuts = holes.filter((h) => h[2] <= mid && h[3] >= mid).map((h) => [h[0], h[1]] as [number, number]).sort((p, q) => p[0] - q[0]);
    let u = u0;
    for (const [c0, c1] of cuts) { if (c0 > u) out.push([u, c0, a, b]); u = Math.max(u, c1); }
    if (u < u1) out.push([u, u1, a, b]);
  }
  return out;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function gaugeFace(label: string, ticks: string[], redFrom = 1) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#111'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5ecd7'; g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.fill();
    const a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
    if (redFrom < 1) {
      g.strokeStyle = '#d33'; g.lineWidth = 12; g.beginPath();
      g.arc(128, 128, 100, a0 + sweep * redFrom, a0 + sweep); g.stroke();
    }
    g.strokeStyle = '#222'; g.fillStyle = '#222'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = (ticks.length - 1) * 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n; const major = i % 2 === 0;
      g.lineWidth = major ? 5 : 2;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108);
      g.lineTo(128 + Math.cos(a) * (major ? 88 : 96), 128 + Math.sin(a) * (major ? 88 : 96)); g.stroke();
      if (major) { g.font = 'bold 22px Arial'; g.fillText(ticks[i / 2], 128 + Math.cos(a) * 68, 128 + Math.sin(a) * 68); }
    }
    g.font = 'bold 20px Arial'; g.fillStyle = '#7a2a1a'; g.fillText(label, 128, 178);
  });
}

export class RVModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly interactables: Interactable[] = [];
  readonly colliders: Box2[] = [];
  readonly mirror: THREE.Mesh;
  readonly mirrorAnchor = new THREE.Object3D();

  private wheels: { g: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  private steeringWheel = new THREE.Group();
  private needles: Record<'speed' | 'tach' | 'fuel' | 'temp', THREE.Object3D> = {} as any;
  private ledTex: THREE.CanvasTexture;
  private ledCtx: CanvasRenderingContext2D;
  private ledText = '';
  private wipers: THREE.Group[] = [];
  private wiperPhase = 0;
  private door = new THREE.Group();
  private doorAngle = 0;
  private shifter = new THREE.Group();
  private handbrake = new THREE.Group();
  private key = new THREE.Group();
  private headLights: THREE.SpotLight[] = [];
  private headLens: THREE.MeshStandardMaterial;
  private tailMat: THREE.MeshStandardMaterial;
  private domeLight: THREE.PointLight;
  private domeLens: THREE.MeshStandardMaterial;
  private grimeMat: THREE.MeshStandardMaterial;
  private switchMeshes: Record<string, THREE.Mesh> = {};
  private steam: THREE.Group;
  private fuseLamp!: THREE.MeshStandardMaterial;
  private stoveKnob!: THREE.Mesh;
  private fireGroup!: THREE.Group;
  private fireLight!: THREE.PointLight;
  private brewLamp!: THREE.MeshStandardMaterial;
  private lastSpeed = 0;
  private pitch = 0;
  private roll = 0;
  /** smoothed RV-local acceleration (x lateral, z longitudinal) for cabin jolts */
  readonly accelLocal = new THREE.Vector3();

  private M = {
    cream: new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.7 }),
    orange: new THREE.MeshStandardMaterial({ color: '#f0ad4e', roughness: 0.6 }),
    maroon: new THREE.MeshStandardMaterial({ color: '#d9534f', roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.25, metalness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.8 }),
    tire: new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.95 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.7 }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.7 }),
    lining: new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: 0.9 }),
    seat: new THREE.MeshStandardMaterial({ color: '#8d4a2f', roughness: 0.9 }),
    cushion: new THREE.MeshStandardMaterial({ color: '#c9a66b', roughness: 1 }),
    counter: new THREE.MeshStandardMaterial({ color: '#e0d2b4', roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.4, metalness: 0.7 }),
    red: new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#a9d4e6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    amber: new THREE.MeshStandardMaterial({ color: '#ffb300', emissive: '#ff8f00', emissiveIntensity: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.6 }),
    fuse: new THREE.MeshStandardMaterial({ color: '#ffb300', roughness: 0.5 }),
  };

  constructor() {
    this.root.add(this.body);
    const M = this.M;
    const { halfW, innerHalfW, floorY, ceilY, roofY, zFront, zRear } = RV;
    const wallT = halfW - innerHalfW;

    // ---------- hull ----------
    this.box(M.carpet, -innerHalfW, innerHalfW, floorY - 0.05, floorY, zFront, zRear, false, true);
    this.box(M.cream, -halfW, halfW, 0.4, floorY - 0.05, zFront - 0.02, zRear + 0.04, true); // skirt
    this.box(M.cream, -halfW, halfW, ceilY, roofY, zFront - 0.02, zRear + 0.04, true); // roof
    this.box(M.lining, -innerHalfW, innerHalfW, ceilY - 0.02, ceilY, zFront, zRear); // ceiling lining

    // side walls: u = z, v = y
    const winBand: [number, number] = [1.5, 2.3];
    const leftHoles: Rect[] = [[-2.9, -1.9, 1.45, 2.3], [-0.5, 0.7, ...winBand], [1.0, 1.9, ...winBand]];
    const rightHoles: Rect[] = [[-2.9, -1.9, 1.45, 2.3], [RV.doorZ0, RV.doorZ1, floorY, RV.doorTop], [0.6, 1.8, ...winBand]];
    for (const r of wallRects(zFront, zRear, floorY, ceilY, leftHoles)) this.box(M.cream, -halfW, -innerHalfW, r[2], r[3], r[0], r[1], true);
    for (const r of wallRects(zFront, zRear, floorY, ceilY, rightHoles)) this.box(M.cream, innerHalfW, halfW, r[2], r[3], r[0], r[1], true);
    for (const h of leftHoles) this.glass(-halfW + wallT / 2, (h[2] + h[3]) / 2, (h[0] + h[1]) / 2, 'x', h[1] - h[0], h[3] - h[2]);
    for (const h of rightHoles) if (h[0] !== RV.doorZ0) this.glass(halfW - wallT / 2, (h[2] + h[3]) / 2, (h[0] + h[1]) / 2, 'x', h[1] - h[0], h[3] - h[2]);
    // rear wall: u = x, v = y
    const rearHoles: Rect[] = [[-0.7, 0.7, 1.6, 2.3]];
    for (const r of wallRects(-halfW, halfW, floorY, ceilY, rearHoles)) this.box(M.cream, r[0], r[1], r[2], r[3], zRear - wallT, zRear, true);
    this.glass(0, 1.95, zRear - wallT / 2, 'z', 1.4, 0.7);
    // front: windshield frame
    this.box(M.cream, -halfW, -1.22, 1.4, ceilY, zFront - 0.06, zFront, true);
    this.box(M.cream, 1.22, halfW, 1.4, ceilY, zFront - 0.06, zFront, true);
    this.box(M.cream, -halfW, halfW, 2.35, ceilY, zFront - 0.06, zFront, true);
    this.glass(0, 1.9, zFront - 0.03, 'z', 2.44, 0.9);

    // windshield grime overlay
    const grimeTex = canvasTex(512, 256, (g) => {
      for (let i = 0; i < 220; i++) {
        const x = Math.random() * 512, y = Math.random() * 256, r = 2 + Math.random() * 7;
        g.fillStyle = i % 5 === 0 ? 'rgba(90,120,40,0.85)' : 'rgba(120,95,60,0.8)';
        g.beginPath(); g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2); g.fill();
      }
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(160,130,90,0.25)'); grad.addColorStop(1, 'rgba(160,130,90,0.55)');
      g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    });
    this.grimeMat = new THREE.MeshStandardMaterial({ map: grimeTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, roughness: 1 }); // lit, so it darkens at night
    const grime = new THREE.Mesh(new THREE.PlaneGeometry(2.44, 0.9), this.grimeMat);
    grime.position.set(0, 1.9, zFront - 0.045);
    this.body.add(grime);

    // nose / hood / cab
    this.box(M.cream, -1.3, 1.3, 0.45, 1.38, RV.noseZ + 0.05, zFront, true);
    this.box(M.dark, -1.32, 1.32, 0.42, 0.62, RV.noseZ + 0.15, zFront - 0.1, true); // under-hood shadow band
    const hood = this.box(M.cream, -1.25, 1.25, -0.03, 0.03, -0.65, 0.65, true);
    hood.position.set(0, 1.42, -3.62); hood.rotation.x = -0.12;
    const grille = this.box(M.dark, -0.75, 0.75, 0.62, 1.12, RV.noseZ, RV.noseZ + 0.06); // grille
    this.reg('radiator', grille, (s, c) => (c.held === 'coolant' ? 'Pour coolant into radiator' : c.held === 'energy' ? 'Pour energy drink into radiator (desperate)' : s.steam ? 'Radiator is boiling over!' : ''));
    for (let i = 0; i < 5; i++) this.box(M.chrome, -0.72, 0.72, 0.66 + i * 0.1, 0.69 + i * 0.1, RV.noseZ - 0.01, RV.noseZ + 0.02);
    this.box(M.chrome, -1.36, 1.36, 0.42, 0.62, RV.noseZ - 0.08, RV.noseZ + 0.06, true); // bumper
    this.box(M.chrome, -1.38, 1.38, 0.42, 0.62, zRear + 0.04, zRear + 0.18, true); // rear bumper
    // overcab
    this.box(M.cream, -halfW, halfW, 2.35, roofY, -3.9, zFront - 0.06, true);
    this.glass(0, 2.72, -3.91, 'z', 1.6, 0.35);
    for (let i = -2; i <= 2; i++) this.box(M.amber, i * 0.45 - 0.06, i * 0.45 + 0.06, roofY - 0.06, roofY, -3.93, -3.89);
    // roof AC + ladder + spare
    this.box(M.lining, -0.45, 0.45, roofY, roofY + 0.35, 0.3, 1.3, true);
    for (const lx of [0.85, 1.25]) this.box(M.steel, lx - 0.02, lx + 0.02, 0.7, roofY + 0.2, zRear + 0.12, zRear + 0.16);
    for (let y = 0.9; y < roofY; y += 0.32) this.box(M.steel, 0.85, 1.25, y, y + 0.03, zRear + 0.12, zRear + 0.16);
    this.box(M.steel, -0.75, -0.05, 0.95, 1.0, zRear + 0.04, zRear + 0.1); // spare tire carrier
    // stripes (skip the door gap on the right)
    const stripe = (side: number, z0: number, z1: number) => {
      const x0 = side * halfW, x1 = side * (halfW + 0.012);
      this.box(M.orange, Math.min(x0, x1), Math.max(x0, x1), 1.0, 1.15, z0, z1);
      this.box(M.maroon, Math.min(x0, x1), Math.max(x0, x1), 1.15, 1.28, z0, z1);
    };
    stripe(-1, RV.noseZ + 0.1, zRear); stripe(1, RV.noseZ + 0.1, RV.doorZ0); stripe(1, RV.doorZ1, zRear);
    // fuel port (rear-left)
    const port = this.box(M.dark, -halfW - 0.03, -halfW + 0.01, 0.8, 1.0, 2.5, 2.7);
    this.reg('fuelport', port, (s, c) => (c.held === 'nozzle' ? `Hold to pump gas (${s.fuel.toFixed(1)}/25 gal)` : c.held === 'jerrycan' ? 'Pour jerrycan into the tank' : `Fuel port (${s.fuel.toFixed(1)}/25 gal)`));
    // step under door
    this.box(M.steel, halfW, halfW + 0.3, 0.28, 0.33, RV.doorZ0, RV.doorZ1, true);
    // rear wheel arches inside
    for (const s of [-1, 1]) {
      this.box(M.lining, s < 0 ? -innerHalfW : innerHalfW - 0.4, s < 0 ? -innerHalfW + 0.4 : innerHalfW, floorY, 1.05, RV.wheelRearZ - 0.55, RV.wheelRearZ + 0.55);
    }

    // lights
    this.headLens = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c0', emissiveIntensity: 0 });
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16).rotateX(Math.PI / 2), this.headLens);
      lens.position.set(s * 0.98, 0.9, RV.noseZ + 0.02); this.body.add(lens);
      this.box(M.chrome, s * 0.98 - 0.17, s * 0.98 + 0.17, 0.74, 1.06, RV.noseZ + 0.03, RV.noseZ + 0.1);
      const sl = new THREE.SpotLight('#fff1cf', 0, 90, 0.5, 0.45, 1);
      sl.position.set(s * 0.98, 0.9, RV.noseZ - 0.1);
      sl.target.position.set(s * 0.6, -0.5, RV.noseZ - 25);
      this.body.add(sl, sl.target);
      this.headLights.push(sl);
    }
    this.tailMat = new THREE.MeshStandardMaterial({ color: '#8b0000', emissive: '#ff1a1a', emissiveIntensity: 0.15 });
    for (const s of [-1, 1]) this.box(this.tailMat, s * 1.32 - 0.1, s * 1.32 + 0.1, 0.85, 1.25, zRear, zRear + 0.04);
    this.domeLens = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c0', emissiveIntensity: 0 });
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), this.domeLens);
    dome.position.set(0, ceilY - 0.03, 0.2); this.body.add(dome);
    this.domeLight = new THREE.PointLight('#ffe7b8', 0, 9, 1);
    this.domeLight.position.set(0, ceilY - 0.15, 0.2);
    this.body.add(this.domeLight);

    // wheels
    for (const [z, front] of [[RV.wheelFrontZ, true], [RV.wheelRearZ, false]] as [number, boolean][]) {
      for (const s of [-1, 1]) {
        const g = new THREE.Group(); g.position.set(s * RV.wheelX, RV.wheelR, z);
        const spin = new THREE.Group(); g.add(spin);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(RV.wheelR, RV.wheelR, 0.34, 20).rotateZ(Math.PI / 2), M.tire);
        tire.castShadow = true; spin.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 10).rotateZ(Math.PI / 2), M.chrome);
        spin.add(hub);
        const nut = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.08, 0.3), M.dark); spin.add(nut);
        this.root.add(g); // wheels don't tilt with the body
        const wi = this.wheels.length;
        this.wheels.push({ g, spin, front });
        this.reg(`wheel_${wi}`, g, (s, c) => (c.cab.flat !== wi ? '' : c.held !== 'spare' && c.held !== 'tape' ? 'Flat tire! Spare is on the back (or duct tape)' : Math.abs(s.speed) > 0.5 ? 'Stop the RV first!' : c.held === 'tape' ? 'Duct-tape the tire' : `Bolt on spare (${c.cab.nuts}/4)`));
      }
    }

    // ---------- door ----------
    this.door.position.set(halfW - 0.02, floorY, RV.doorZ0);
    const doorW = RV.doorZ1 - RV.doorZ0, doorH = RV.doorTop - floorY;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH, doorW), M.cream);
    panel.position.set(0.0, doorH / 2, doorW / 2); panel.castShadow = true;
    const dwin = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.5), M.glass);
    dwin.rotation.y = Math.PI / 2; dwin.position.set(0.035, 1.55, doorW / 2);
    const dstripeO = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.15, doorW), M.orange); dstripeO.position.set(0, 1.0 - floorY + 0.075, doorW / 2);
    const dstripeM = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.13, doorW), M.maroon); dstripeM.position.set(0, 1.15 - floorY + 0.065, doorW / 2);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), M.chrome); handle.position.set(0, 0.95, doorW - 0.12);
    this.door.add(panel, dwin, dstripeO, dstripeM, handle);
    this.body.add(this.door);
    this.reg('door', this.door, (s) => (s.doorOpen ? 'Close door' : 'Open door'));
    this.colliders.push({ x0: innerHalfW - 0.02, x1: halfW + 0.04, z0: RV.doorZ0, z1: RV.doorZ1, door: true });

    // ---------- cockpit ----------
    this.box(M.wood, -innerHalfW, innerHalfW, floorY, 1.4, zFront, -2.65, false, true); // dash
    this.box(M.black, -innerHalfW, innerHalfW, 1.4, 1.43, zFront, -2.62); // dash pad
    this.box(M.black, -1.12, -0.28, 1.25, 1.62, -2.78, -2.62); // binnacle
    for (const s of [-1, 1]) {
      const seat = SEATS[s < 0 ? 'driver' : 'nav'].pos;
      const base = this.box(M.seat, seat.x - 0.33, seat.x + 0.33, floorY, seat.y, seat.z - 0.3, seat.z + 0.25);
      const back = this.box(M.seat, seat.x - 0.33, seat.x + 0.33, seat.y, seat.y + 0.85, seat.z + 0.25, seat.z + 0.38);
      this.box(M.seat, seat.x - 0.2, seat.x + 0.2, seat.y + 0.85, seat.y + 1.05, seat.z + 0.27, seat.z + 0.36);
      const id = s < 0 ? 'seat_driver' : 'seat_nav';
      this.reg(id, base, () => (s < 0 ? 'Sit: Driver' : 'Sit: Navigator'));
      this.reg(id, back, () => (s < 0 ? 'Sit: Driver' : 'Sit: Navigator'));
      this.colliders.push({ x0: seat.x - 0.35, x1: seat.x + 0.35, z0: seat.z - 0.32, z1: seat.z + 0.4, top: seat.y });
    }
    this.colliders.push({ x0: -innerHalfW, x1: innerHalfW, z0: zFront - 0.1, z1: -2.62, top: 1.43 }); // dash

    // steering wheel
    this.steeringWheel.position.set(-0.7, 1.5, -2.4);
    this.steeringWheel.rotation.x = -0.6;
    const wheelSpin = new THREE.Group(); wheelSpin.name = 'spin';
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 28), M.black);
    wheelSpin.add(rim);
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.015), M.black);
      spoke.position.set(Math.sin(a) * 0.1, -Math.cos(a) * 0.1, 0); spoke.rotation.z = a; wheelSpin.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16).rotateX(Math.PI / 2), M.dark);
    wheelSpin.add(hub);
    this.steeringWheel.add(wheelSpin);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 8).rotateX(Math.PI / 2), M.dark);
    column.position.set(0, -0.06, -0.15); this.steeringWheel.add(column);
    this.body.add(this.steeringWheel);
    this.reg('horn', hub, () => 'Honk horn');

    // gauges on binnacle face
    const gz = -2.615;
    const gauge = (key: 'speed' | 'tach' | 'fuel' | 'temp', x: number, y: number, r: number, tex: THREE.Texture) => {
      const face = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.set(x, y, gz); this.body.add(face);
      const pivot = new THREE.Group(); pivot.position.set(x, y, gz + 0.005);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 0.82, 0.004), new THREE.MeshBasicMaterial({ color: '#e53935' }));
      needle.position.y = r * 0.35; pivot.add(needle);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.1, 12), new THREE.MeshBasicMaterial({ color: '#222' }));
      cap.position.z = 0.003; pivot.add(cap);
      this.body.add(pivot); this.needles[key] = pivot;
    };
    gauge('speed', -0.83, 1.45, 0.1, gaugeFace('MPH', ['0', '20', '40', '60', '80', '100', '120']));
    gauge('tach', -0.57, 1.45, 0.1, gaugeFace('RPM x1000', ['0', '1', '2', '3', '4', '5', '6'], 0.88));
    gauge('fuel', -1.03, 1.38, 0.06, gaugeFace('FUEL', ['E', '½', 'F']));
    gauge('temp', -0.37, 1.38, 0.06, gaugeFace('°F', ['100', '180', '260'], 0.84));
    // gear LED
    const led = document.createElement('canvas'); led.width = 96; led.height = 48;
    this.ledCtx = led.getContext('2d')!;
    this.ledTex = new THREE.CanvasTexture(led); this.ledTex.colorSpace = THREE.SRGBColorSpace;
    const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.04), new THREE.MeshBasicMaterial({ map: this.ledTex }));
    ledMesh.position.set(-0.7, 1.3, gz); this.body.add(ledMesh);

    // ignition key
    this.key.position.set(-0.22, 1.32, -2.64);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12).rotateX(Math.PI / 2), M.chrome);
    const keyHead = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.012), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 }));
    keyHead.position.z = 0.04; keyHead.name = 'head';
    this.key.add(barrel, keyHead); this.body.add(this.key);
    this.reg('ignition', this.key, (s) => (s.ignition === 2 ? 'Turn key: engine OFF' : s.ignition === 1 ? 'Cranking…' : 'Turn key: START'));

    // dash switches
    const sw = (id: string, x: number, y: number, color: string, prompt: (s: RVState) => string) => {
      const plate = this.box(M.black, x - 0.035, x + 0.035, y - 0.035, y + 0.035, -2.655, -2.64);
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.045, 0.03), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
      knob.position.set(x, y, -2.625); this.body.add(knob);
      this.switchMeshes[id] = knob;
      this.reg(id, plate, prompt); this.reg(id, knob, prompt);
    };
    sw('headlights', -1.22, 1.32, '#ffd54f', (s) => `Headlights: ${s.headlights ? 'ON' : 'OFF'}`);
    sw('wipers', -1.22, 1.2, '#4fc3f7', (s) => `Wipers: ${s.wipers ? 'ON' : 'OFF'}`);
    // radio
    const radio = this.box(M.black, 0.0, 0.34, 1.08, 1.26, -2.67, -2.64);
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ color: '#ffb74d' }));
    dial.position.set(0.12, 1.19, -2.637); this.body.add(dial);
    for (const kx of [0.04, 0.3]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10).rotateX(Math.PI / 2), M.chrome); k.position.set(kx, 1.15, -2.63); this.body.add(k); }
    this.reg('radio', radio, (s) => `Radio: ${s.radio ? 'ON (static…)' : 'OFF'}`);
    // card tray (Phase 3)
    this.box(M.dark, 0.45, 0.85, 1.43, 1.46, -2.95, -2.7);

    // rear-view mirror
    this.mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.15), new THREE.MeshBasicMaterial({ color: '#334' }));
    this.mirror.position.set(0, 2.25, -2.92); this.body.add(this.mirror);
    this.box(M.black, -0.25, 0.25, 2.165, 2.335, -2.95, -2.925);
    this.box(M.black, -0.015, 0.015, 2.335, ceilY, -2.95, -2.93);
    this.mirrorAnchor.position.set(0, roofY + 0.25, zRear + 0.3);
    this.mirrorAnchor.rotation.y = Math.PI; // look backward (+Z)
    this.body.add(this.mirrorAnchor);

    // floor console: shifter + handbrake
    this.box(M.dark, -0.15, 0.15, floorY, 0.88, -2.6, -2.05);
    this.colliders.push({ x0: -0.17, x1: 0.17, z0: -2.62, z1: -2.03, top: 0.88 });
    this.shifter.position.set(0, 0.88, -2.35);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 8).translate(0, 0.21, 0), M.chrome);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), M.black); knob.position.y = 0.43;
    this.shifter.add(stick, knob); this.body.add(this.shifter);
    this.reg('shifter', this.shifter, (s) => `Shifter [${gearInfo(s.gear).name}] · LMB up / RMB down`);
    this.handbrake.position.set(0.1, 0.88, -2.12);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.32).translate(0, 0, -0.16), M.dark);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1).translate(0, 0, -0.3), M.red);
    this.handbrake.add(lever, grip); this.body.add(this.handbrake);
    this.reg('handbrake', this.handbrake, (s) => (s.handbrake ? 'Release handbrake' : 'Pull handbrake'));

    // ---------- living area ----------
    // dinette (left)
    this.box(M.cushion, -innerHalfW, -0.6, floorY, 1.08, -1.0, -0.5); // bench front
    this.box(M.cushion, -innerHalfW, -0.6, 1.08, 1.75, -1.0, -0.88);
    this.box(M.cushion, -innerHalfW, -0.6, floorY, 1.08, 0.75, 1.25); // bench rear
    this.box(M.cushion, -innerHalfW, -0.6, 1.08, 1.75, 1.13, 1.25);
    this.box(M.woodLight, -innerHalfW, -0.62, 1.34, 1.38, -0.42, 0.68); // table
    this.box(M.steel, -0.95, -0.9, floorY, 1.34, 0.1, 0.16);
    this.colliders.push({ x0: -innerHalfW, x1: -0.58, z0: -1.02, z1: 1.27, top: 1.38 });
    // galley (right, behind the door)
    this.box(M.wood, 0.72, innerHalfW, floorY, 1.5, -0.3, 2.3, false, true);
    this.box(M.counter, 0.7, innerHalfW, 1.5, 1.55, -0.32, 2.3);
    this.box(M.black, 0.8, 1.2, 1.55, 1.6, 0.0, 0.7); // camp stove
    for (const bz of [0.17, 0.53]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 18).rotateX(Math.PI / 2), M.steel); ring.position.set(1.0, 1.61, bz); this.body.add(ring); }
    this.box(M.steel, 0.82, 1.22, 1.5, 1.555, 1.3, 1.9); // sink
    // burner knob on the counter front (faces the aisle)
    this.stoveKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateZ(Math.PI / 2), M.black);
    this.stoveKnob.position.set(0.69, 1.4, 0.35); this.body.add(this.stoveKnob);
    this.reg('stove', this.stoveKnob, (_s, c) => `Burner: ${c.cab.stoveOn ? 'ON' : 'OFF'}`);
    // skillet on the rear burner
    const skillet = new THREE.Group(); skillet.position.set(1.0, 1.615, 0.53);
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.035, 20), M.black); pan.position.y = 0.0175;
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.22), M.black); ph.position.set(0, 0.03, -0.22);
    skillet.add(pan, ph); this.body.add(skillet);
    this.reg('skillet', skillet, (_s, c) => (c.held === 'patty' ? 'Put patty in skillet' : c.held ? '' : 'Skillet'));
    // grease fire
    this.fireGroup = new THREE.Group(); this.fireGroup.position.set(1.0, 1.65, 0.53);
    this.fireLight = new THREE.PointLight('#ff7a1a', 0, 6, 1); this.fireLight.position.y = 0.3;
    this.fireGroup.add(this.fireLight);
    this.fireGroup.visible = false;
    this.body.add(this.fireGroup);
    // coffee maker
    const cm = new THREE.Group(); cm.position.set(1.08, 1.55, -0.12);
    const cmBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.18), M.black); cmBody.position.y = 0.15;
    this.brewLamp = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1744', emissiveIntensity: 0 });
    const cmLamp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.03), this.brewLamp); cmLamp.position.set(-0.102, 0.05, 0.0);
    cm.add(cmBody, cmLamp); this.body.add(cm);
    this.reg('coffeemaker', cm, (_s, c) => (c.cab.brew > 0 ? `Brewing... ${Math.ceil(c.cab.brew)}s` : c.held ? '' : 'Brew coffee'));
    this.box(M.wood, 0.95, innerHalfW, 2.25, 2.95, -0.3, 2.3); // upper cabinets
    this.colliders.push({ x0: 0.68, x1: innerHalfW, z0: -0.34, z1: 2.32, top: 1.55 });
    // fridge (left rear)
    this.box(M.lining, -innerHalfW, -0.7, floorY, 2.6, 2.45, zRear - wallT);
    this.box(M.steel, -0.72, -0.69, 1.4, 2.0, 2.55, 2.6);
    this.colliders.push({ x0: -innerHalfW, x1: -0.68, z0: 2.43, z1: zRear, top: 2.6 });
    // rear wheel arch colliders
    this.colliders.push({ x0: -innerHalfW, x1: -innerHalfW + 0.42, z0: RV.wheelRearZ - 0.57, z1: RV.wheelRearZ + 0.57, top: 1.05 });
    // fuse box
    const fb = this.box(M.steel, 0.4, 0.9, 1.6, 2.1, zRear - wallT - 0.08, zRear - wallT);
    this.fuseLamp = new THREE.MeshStandardMaterial({ color: '#2e7d32', emissive: '#00e676', emissiveIntensity: 1 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), this.fuseLamp);
    lamp.position.set(0.82, 2.03, zRear - wallT - 0.09); this.body.add(lamp);
    for (let i = 0; i < 4; i++) this.box(M.fuse, 0.48 + i * 0.09, 0.52 + i * 0.09, 1.75, 1.8, zRear - wallT - 0.1, zRear - wallT - 0.08);
    this.reg('fusebox', fb, (_s, c) => (c.cab.fuseOut ? (c.held === 'fuse' ? 'Plug fuse back in' : c.held === 'tape' ? 'Duct-tape the fuse box (hack)' : 'A fuse popped out! Find it') : 'Fuse box (all good)'));
    this.box(M.steel, 1.29, innerHalfW, 1.0, 1.35, -0.8, -0.6); // extinguisher bracket
    // dome switch on ceiling
    const domeSw = this.box(M.black, -0.06, 0.06, ceilY - 0.03, ceilY, -2.45, -2.33);
    this.reg('dome', domeSw, (s) => `Dome light: ${s.dome ? 'ON' : 'OFF'}`);

    // wall colliders
    this.colliders.push({ x0: -halfW - 0.04, x1: -innerHalfW, z0: zFront - 0.1, z1: zRear + 0.05 });
    this.colliders.push({ x0: innerHalfW, x1: halfW + 0.04, z0: zFront - 0.1, z1: RV.doorZ0 });
    this.colliders.push({ x0: innerHalfW, x1: halfW + 0.04, z0: RV.doorZ1, z1: zRear + 0.05 });
    this.colliders.push({ x0: -halfW, x1: halfW, z0: zRear - wallT, z1: zRear + 0.2 });
    this.colliders.push({ x0: -halfW, x1: halfW, z0: RV.noseZ - 0.1, z1: zFront }); // nose, from outside

    // wipers
    for (const px of [-0.6, 0.3]) {
      const w = new THREE.Group(); w.position.set(px, 1.48, zFront - 0.07);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.78, 0.015).translate(0, 0.39, 0), M.black);
      w.add(arm); this.body.add(w); this.wipers.push(w);
    }

    // steam (overheat)
    this.steam = new THREE.Group();
    const steamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.25 + Math.random() * 0.25, 8, 6), steamMat);
      p.position.set((Math.random() - 0.5) * 1.6, 1.5 + Math.random() * 1.2, -3.6 - Math.random() * 0.6);
      this.steam.add(p);
    }
    this.steam.visible = false;
    this.body.add(this.steam);
  }

  private box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, cast = false, receive = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = cast; m.receiveShadow = receive;
    this.body.add(m);
    return m;
  }

  private glass(x: number, y: number, z: number, axis: 'x' | 'z', w: number, h: number) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.M.glass);
    g.position.set(x, y, z);
    if (axis === 'x') g.rotation.y = Math.PI / 2;
    g.renderOrder = 2;
    this.body.add(g);
  }

  private reg(id: string, obj: THREE.Object3D, prompt: (s: RVState, c: PromptCtx) => string) {
    obj.traverse((o) => { o.userData.iid = id; });
    this.interactables.push({ id, obj, prompt });
  }

  promptFor(id: string, s: RVState, c: PromptCtx) { return this.interactables.find((i) => i.id === id)?.prompt(s, c) ?? ''; }

  update(s: RVState, cab: CabinState, dt: number) {
    const power = !cab.fuseOut;
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.yaw;

    // body pitch / roll from acceleration
    const a = dt > 0 ? (s.speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = s.speed;
    const lat = (s.speed * s.speed * Math.tan(s.steer)) / WHEELBASE;
    const k = Math.min(1, dt * 6);
    // clamp to ~1.3 g: crashes/rams are delivered as explicit jolts, and frame hitches or
    // instant speed changes must not turn into 1000 m/s² spikes that fling props through walls
    const MAXA = 13;
    const ac = THREE.MathUtils.clamp(a, -MAXA, MAXA), lc = THREE.MathUtils.clamp(lat, -MAXA, MAXA);
    this.accelLocal.x += (-lc - this.accelLocal.x) * k; // centripetal accel points left (−x) on a left turn
    this.accelLocal.z += (-ac - this.accelLocal.z) * k; // forward accel is −z
    this.pitch += (THREE.MathUtils.clamp(a * 0.006, -0.035, 0.035) - this.pitch) * k;
    this.roll += (THREE.MathUtils.clamp(-lat * 0.006, -0.04, 0.04) - this.roll) * k;
    const bump = Math.abs(s.speed) > 1 ? Math.sin(performance.now() * 0.023) * 0.0015 * Math.min(1, Math.abs(s.speed) / 20) : 0;
    this.body.rotation.set(this.pitch + bump, 0, this.roll);

    // wheels
    this.wheels.forEach((w, i) => {
      w.spin.rotation.x -= (s.speed * dt) / RV.wheelR;
      if (w.front) w.g.rotation.y = s.steer;
      const flat = cab.flat === i;
      w.spin.scale.set(1, flat ? 0.82 : 1, flat ? 0.82 : 1);
      w.g.position.y = RV.wheelR * (flat ? 0.82 : 1);
    });
    if (cab.flat >= 0) this.body.rotation.z += cab.flat % 2 === 0 ? 0.025 : -0.025;
    (this.steeringWheel.getObjectByName('spin') as THREE.Object3D).rotation.z = s.steer * 7;

    // gauges (angle sweeps clockwise from bottom-left)
    const setNeedle = (key: keyof RVModel['needles'], f: number) => {
      this.needles[key].rotation.z = 2.356 - THREE.MathUtils.clamp(f, 0, 1) * 4.712;
    };
    setNeedle('speed', power ? (Math.abs(s.speed) * CFG.MPH) / 120 : 0);
    setNeedle('tach', power ? s.rpm / 6500 : 0);
    setNeedle('fuel', power && s.ignition === 2 ? s.fuel / CFG.FUEL_CAPACITY : 0);
    setNeedle('temp', power ? (s.temp - 100) / 160 : 0);

    const ledText = !power ? '' : s.ignition === 0 ? '--' : gearInfo(s.gear).name;
    if (ledText !== this.ledText) {
      this.ledText = ledText;
      const g = this.ledCtx;
      g.fillStyle = '#100'; g.fillRect(0, 0, 96, 48);
      g.fillStyle = s.ignition === 0 ? '#511' : '#ff3b2f';
      g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ledText, 48, 26);
      this.ledTex.needsUpdate = true;
    }

    // key / shifter / handbrake / switches
    this.key.rotation.z = s.ignition === 0 ? 0 : s.ignition === 1 ? -1.2 : -0.8;
    const H: Record<number, [number, number]> = { [-1]: [-1, 1], 0: [0, 0], 1: [1, -1], 2: [1, 1], 3: [0, -1], 4: [0, 1], 5: [-1, -1] };
    const [col, row] = H[s.gear];
    this.shifter.rotation.x += (row * 0.3 - this.shifter.rotation.x) * Math.min(1, dt * 18);
    this.shifter.rotation.z += (col * 0.22 - this.shifter.rotation.z) * Math.min(1, dt * 18);
    this.handbrake.rotation.x += ((s.handbrake ? 0.55 : 0.05) - this.handbrake.rotation.x) * Math.min(1, dt * 14);
    this.switchMeshes.headlights.rotation.x = s.headlights ? -0.5 : 0.5;
    this.switchMeshes.wipers.rotation.x = s.wipers ? -0.5 : 0.5;

    // wipers
    if ((s.wipers && power) || this.wiperPhase % (Math.PI * 2) > 0.05) this.wiperPhase += dt * 4;
    const sweep = (1 - Math.cos(this.wiperPhase)) / 2;
    for (const w of this.wipers) w.rotation.z = -1.35 + sweep * 1.9;

    // door
    this.doorAngle += ((s.doorOpen ? 1.75 : 0) - this.doorAngle) * Math.min(1, dt * 7);
    this.door.rotation.y = this.doorAngle;

    // lights
    const hl = s.headlights && s.ignition !== 0 && power;
    for (const l of this.headLights) l.intensity = hl ? 40 : 0;
    this.headLens.emissiveIntensity = hl ? 2.5 : 0;
    this.tailMat.emissiveIntensity = s.brake > 0.1 ? 2.5 : hl ? 0.8 : 0.15;
    this.domeLight.intensity = s.dome && power ? 4 : 0;
    this.domeLens.emissiveIntensity = s.dome && power ? 2 : 0;
    this.fuseLamp.emissive.set(power ? '#00e676' : '#ff1744');
    this.fuseLamp.emissiveIntensity = power ? 1 : 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
    this.stoveKnob.rotation.x = cab.stoveOn ? 1.2 : 0;
    this.brewLamp.emissiveIntensity = cab.brew > 0 ? 2 : 0;
    this.fireGroup.visible = cab.fire > 0;
    if (cab.fire > 0) {
      const t = performance.now() * 0.001;
      this.fireLight.intensity = 3 + cab.fire * 10 + Math.sin(t * 23) * 1.5;
    }

    this.grimeMat.opacity = s.grime * 0.9;

    this.steam.visible = s.steam;
    if (s.steam) this.steam.children.forEach((p, i) => { p.position.y = 1.5 + ((performance.now() * 0.0008 + i * 0.37) % 1.4); });
  }

  /** Colliders active for the current door state. */
  activeColliders(doorOpen: boolean) {
    return doorOpen ? this.colliders.filter((c) => !c.door) : this.colliders;
  }
}
