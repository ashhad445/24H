// RV visual polish: interior textures, curtains, window trim, rounded hull edges,
// and wear that follows the RV's integrity (dents, rust, cracked windshield, smoke stains).
import * as THREE from 'three';
import { RV } from '../config';

/** Side mirrors hang off the front of the cab window so the driver can see them. */
const MZ = -2.78;

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type Mats = Record<string, THREE.MeshStandardMaterial | THREE.Material>;

export class RVPolish {
  private dents: { m: THREE.Mesh; at: number }[] = [];
  private rust: { m: THREE.MeshBasicMaterial; at: number; max: number }[] = [];
  private crack: THREE.MeshBasicMaterial;
  private soot: THREE.MeshBasicMaterial;
  private hull: THREE.MeshStandardMaterial;
  private lastHP = -1;
  /** Mirror glass planes (main.ts points a camera at each and assigns the render target). */
  readonly sideGlass: { left: THREE.Mesh; right: THREE.Mesh };
  /** Where the side-mirror cameras sit (RV-local) + their yaw. */
  readonly sideCams = [
    { x: -(RV.halfW + 0.5), y: 1.75, z: MZ, yaw: Math.PI - 0.45 },
    { x: RV.halfW + 0.5, y: 1.75, z: MZ, yaw: Math.PI + 0.45 },
  ];
  /** The skull charm: its meshes are the click target. */
  readonly charmHit: THREE.Object3D;
  private charm = new THREE.Group();
  private cp = { x: 0, z: 0, vx: 0, vz: 0 };
  /** The little coffin on the rear-view mirror. */
  readonly charm2Hit: THREE.Object3D;
  private charm2 = new THREE.Group();
  private cp2 = { x: 0, z: 0, vx: 0, vz: 0 };

  constructor(private body: THREE.Group, private M: Mats) {
    this.textures();
    this.trim();
    this.curtains();
    this.edges();
    this.wear();
    this.crack = this.windshieldCracks();
    this.soot = this.sootStain();
    this.sideGlass = this.sideMirrors();
    this.charmHit = this.buildCharm();
    this.charm2Hit = this.buildCharm2();
    this.hull = M.cream as THREE.MeshStandardMaterial;
  }

  // ---------- textures ----------
  private textures() {
    const M = this.M as Record<string, THREE.MeshStandardMaterial>;
    // wood paneling (dash, cabinets)
    M.wood.map = tex(256, 256, (g) => {
      g.fillStyle = '#8b5a2b'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 90; i++) {
        const y = Math.random() * 256;
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '60,34,12' : '170,120,70'},${rnd(0.15, 0.4)})`;
        g.lineWidth = rnd(0.6, 2.4);
        g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(80, y + rnd(-6, 6), 170, y + rnd(-6, 6), 256, y + rnd(-4, 4)); g.stroke();
      }
      for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(40,20,8,.5)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(rnd(40, 216), rnd(20, 236), rnd(6, 14), rnd(3, 6), 0, 0, Math.PI * 2); g.stroke(); }
    });
    M.wood.color.set('#ffffff');
    M.woodLight.map = tex(256, 256, (g) => {
      g.fillStyle = '#c49a6c'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(120,80,40,${rnd(0.1, 0.3)})`; g.lineWidth = rnd(0.5, 1.6); const y = Math.random() * 256; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + rnd(-5, 5)); g.stroke(); }
    });
    M.woodLight.color.set('#ffffff');
    // worn shag carpet
    M.carpet.map = tex(256, 256, (g) => {
      g.fillStyle = '#7a5a3c'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,28,16' : '150,115,80'},${rnd(0.12, 0.32)})`; g.fillRect(Math.random() * 256, Math.random() * 256, rnd(1, 3), rnd(1, 3)); }
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(30,20,12,.22)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, rnd(10, 26), rnd(6, 16), Math.random() * 3, 0, Math.PI * 2); g.fill(); } // stains
    }, [3, 4]);
    M.carpet.color.set('#ffffff');
    // vinyl seats: stitched diamonds + a cracked patch
    M.seat.map = tex(256, 256, (g) => {
      g.fillStyle = '#8d4a2f'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(40,16,8,.5)'; g.lineWidth = 2;
      for (let i = -256; i < 512; i += 42) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); }
      for (let y = 0; y < 256; y += 42) for (let x = 0; x < 256; x += 42) { g.fillStyle = 'rgba(30,12,6,.65)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(210,170,130,.5)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rnd(150, 230), rnd(10, 60)); g.lineTo(rnd(150, 230), rnd(60, 120)); g.stroke(); }
    });
    M.seat.color.set('#ffffff');
    M.cushion.map = tex(128, 128, (g) => {
      g.fillStyle = '#c9a66b'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) { g.fillStyle = y % 32 ? 'rgba(160,100,40,.28)' : 'rgba(255,240,200,.2)'; g.fillRect(0, y, 128, 8); }
      for (let x = 0; x < 128; x += 16) { g.fillStyle = 'rgba(120,70,30,.12)'; g.fillRect(x, 0, 8, 128); }
    });
    M.cushion.color.set('#ffffff');
    M.counter.map = tex(128, 128, (g) => {
      g.fillStyle = '#e0d2b4'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,100,70' : '255,250,235'},${rnd(0.1, 0.35)})`; g.fillRect(Math.random() * 128, Math.random() * 128, rnd(1, 2.5), rnd(1, 2.5)); }
    });
    M.counter.color.set('#ffffff');
    // lining (cabin walls): faint vertical paneling + water stains
    M.lining.map = tex(256, 256, (g) => {
      g.fillStyle = '#e8dcc4'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(120,100,70,.22)'; g.lineWidth = 1.5; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
      for (let i = 0; i < 3; i++) { const gr = g.createRadialGradient(rnd(40, 216), rnd(20, 60), 2, rnd(40, 216), rnd(20, 60), rnd(30, 60)); gr.addColorStop(0, 'rgba(150,110,60,.28)'); gr.addColorStop(1, 'rgba(150,110,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    });
    M.lining.color.set('#ffffff');
    // hull: slightly faded paint
    (M.cream as THREE.MeshStandardMaterial).roughness = 0.62;
    (M.cream as THREE.MeshStandardMaterial).map = tex(256, 256, (g) => {
      g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 18; i++) { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(120,100,70,${rnd(0.03, 0.08)})`); g.fillStyle = gr; g.fillRect(rnd(0, 256), 0, rnd(6, 24), 256); } // rain streaks
    });
    (M.cream as THREE.MeshStandardMaterial).color.set('#ffffff');
  }

  // ---------- exterior trim ----------
  private trim() {
    const { halfW, floorY, ceilY, roofY, zFront, zRear } = RV;
    const trim = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6 });
    const chrome = this.M.chrome;
    const add = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, cast = false) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = cast; this.body.add(o); return o;
    };
    // window frames (outside)
    const frame = (side: number, z0: number, z1: number, y0: number, y1: number) => {
      const x = side * (halfW + 0.012), t = 0.045;
      add(trim, 0.03, t, z1 - z0 + t, x, y0, (z0 + z1) / 2); add(trim, 0.03, t, z1 - z0 + t, x, y1, (z0 + z1) / 2);
      add(trim, 0.03, y1 - y0, t, x, (y0 + y1) / 2, z0); add(trim, 0.03, y1 - y0, t, x, (y0 + y1) / 2, z1);
    };
    frame(-1, -2.9, -1.9, 1.45, 2.3); frame(-1, -0.5, 0.7, 1.5, 2.3); frame(-1, 1.0, 1.9, 1.5, 2.3);
    frame(1, -2.9, -1.9, 1.45, 2.3); frame(1, 0.6, 1.8, 1.5, 2.3);
    // windshield rubber seal
    add(trim, 2.5, 0.05, 0.04, 0, 1.45, zFront - 0.05); add(trim, 2.5, 0.05, 0.04, 0, 2.35, zFront - 0.05);
    add(trim, 0.05, 0.9, 0.04, -1.22, 1.9, zFront - 0.05); add(trim, 0.05, 0.9, 0.04, 1.22, 1.9, zFront - 0.05);
    // door handle + hinge
    add(chrome, 0.03, 0.05, 0.16, halfW + 0.03, 1.4, RV.doorZ1 - 0.12);
    // fender flares + mud flaps
    for (const [z, rear] of [[RV.wheelFrontZ, false], [RV.wheelRearZ, true]] as [number, boolean][]) for (const s of [-1, 1]) {
      const fl = new THREE.Mesh(new THREE.TorusGeometry(RV.wheelR + 0.1, 0.035, 6, 24, Math.PI).rotateY(Math.PI / 2), trim);
      fl.position.set(s * (halfW + 0.015), RV.wheelR, z); this.body.add(fl);
      if (rear) add(trim, 0.34, 0.4, 0.03, s * RV.wheelX, 0.28, z + RV.wheelR + 0.15);
    }
    // tail lights + license plate + bumper sticker
    for (const s of [-1, 1]) { add(new THREE.MeshStandardMaterial({ color: '#8b0000', emissive: '#ff1a1a', emissiveIntensity: 0.4 }), 0.14, 0.34, 0.05, s * 1.3, 0.95, zRear + 0.06); add(new THREE.MeshStandardMaterial({ color: '#ffe0b2', emissive: '#ffcc80', emissiveIntensity: 0.1 }), 0.14, 0.1, 0.05, s * 1.3, 0.62, zRear + 0.06); }
    const plate = add(new THREE.MeshStandardMaterial({ map: tex(128, 64, (g) => { g.fillStyle = '#fff8e1'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#1a237e'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 60); g.fillStyle = '#1a237e'; g.font = 'bold 28px Arial'; g.textAlign = 'center'; g.fillText('24 HRS', 64, 42); }) }), 0.34, 0.17, 0.02, 0, 0.55, zRear + 0.2);
    plate.rotation.x = 0;
    const sticker = tex(256, 64, (g) => { g.fillStyle = '#ffd54f'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#b71c1c'; g.font = 'bold 24px Arial'; g.textAlign = 'center'; g.fillText('HONK IF YOU\'RE BROKE', 128, 40); });
    add(new THREE.MeshStandardMaterial({ map: sticker }), 0.8, 0.2, 0.01, 0.4, 1.1, zRear + 0.2);
    // side mirrors
    for (const s of [-1, 1]) {
      const arm = add(chrome, 0.35, 0.03, 0.03, s * (halfW + 0.22), 1.75, MZ); arm.rotation.z = s * 0.15;
      add(trim, 0.24, 0.4, 0.08, s * (halfW + 0.5), 1.75, MZ).rotation.y = -s * 0.65; // head turned toward the driver
    }
    // roof vents + antenna
    add(this.M.steel, 0.3, 0.12, 0.3, -0.7, roofY + 0.06, -1.2); add(this.M.steel, 0.3, 0.12, 0.3, 0.7, roofY + 0.06, 2.4);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.9, 5), chrome); ant.position.set(-1.1, roofY + 0.45, -2.2); ant.rotation.z = 0.12; this.body.add(ant);
    void floorY; void ceilY;
  }

  // ---------- curtains ----------
  private curtains() {
    const { innerHalfW } = RV;
    const fabric = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide, roughness: 1,
      map: tex(128, 128, (g) => {
        g.fillStyle = '#e07b39'; g.fillRect(0, 0, 128, 128);
        for (let x = 0; x < 128; x += 16) { g.fillStyle = 'rgba(255,230,180,.45)'; g.fillRect(x, 0, 7, 128); }
        for (let y = 8; y < 128; y += 24) { g.fillStyle = 'rgba(120,40,10,.35)'; g.fillRect(0, y, 128, 4); }
      }),
    });
    const rod = this.M.steel;
    const curtain = (side: number, z0: number, z1: number, y0: number, y1: number) => {
      const x = side * (innerHalfW - 0.02), zc = (z0 + z1) / 2, w = z1 - z0;
      for (const half of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.015, y1 - y0 + 0.08, w * 0.28), fabric);
        c.position.set(x, (y0 + y1) / 2 - 0.02, zc + half * w * 0.36); this.body.add(c);
        // gather folds
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, y1 - y0, 0.02), fabric); f.position.set(x - side * 0.01, (y0 + y1) / 2 - 0.02, zc + half * w * 0.24); this.body.add(f);
      }
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w + 0.1, 6).rotateX(Math.PI / 2), rod); r.position.set(x, y1 + 0.05, zc); this.body.add(r);
    };
    curtain(-1, -0.5, 0.7, 1.5, 2.3); curtain(-1, 1.0, 1.9, 1.5, 2.3);
    curtain(1, 0.6, 1.8, 1.5, 2.3);
  }

  // ---------- rounded hull ----------
  private edges() {
    const { halfW, roofY, zRear, zFront } = RV;
    const cream = this.M.cream;
    const cyl = (r: number, len: number, x: number, y: number, z: number, rotX = 0, rotZ = 0) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), cream); c.position.set(x, y, z); c.rotation.set(rotX, 0, rotZ); c.castShadow = true; this.body.add(c);
    };
    for (const s of [-1, 1]) {
      cyl(0.09, zRear - zFront + 0.1, s * (halfW - 0.02), roofY - 0.04, (zRear + zFront) / 2, Math.PI / 2); // roof side rails
      cyl(0.08, roofY - 0.45, s * (halfW - 0.02), (roofY + 0.45) / 2, zRear + 0.02); // rear vertical corners
    }
    cyl(0.09, halfW * 2 - 0.05, 0, roofY - 0.04, zRear + 0.02, 0, Math.PI / 2); // rear roof edge
  }

  // ---------- wear (follows integrity) ----------
  private wear() {
    const { halfW, zRear } = RV;
    const dentTex = tex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 60);
      gr.addColorStop(0, 'rgba(60,50,40,.75)'); gr.addColorStop(0.55, 'rgba(90,80,70,.35)'); gr.addColorStop(0.8, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    const dentMat = new THREE.MeshBasicMaterial({ map: dentTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const spots: [number, number, number, number][] = []; // side, z, y, size
    for (let i = 0; i < 12; i++) spots.push([i % 2 ? 1 : -1, rnd(-2.6, 3.0), rnd(0.55, 1.4), rnd(0.25, 0.55)]);
    spots.forEach(([side, z, y, sz], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz * rnd(0.7, 1.2)), dentMat);
      m.position.set(side * (halfW + 0.02), y, z); m.rotation.y = side * Math.PI / 2; m.visible = false; this.body.add(m);
      this.dents.push({ m, at: 96 - i * 6.5 });
    });
    // front/rear crumple dents
    for (const [z, rot, at] of [[RV.noseZ - 0.005, Math.PI, 70], [zRear + 0.22, 0, 80]] as [number, number, number][]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), dentMat); m.position.set(rnd(-0.5, 0.5), 0.8, z); m.rotation.y = rot; m.visible = false; this.body.add(m); this.dents.push({ m, at });
    }
    // rust patches along the skirt, wheel wells and roof
    const rustTex = tex(256, 128, (g) => {
      for (let i = 0; i < 60; i++) {
        const x = rnd(10, 246), y = rnd(10, 118), r = rnd(3, 16);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${rnd(120, 170) | 0},${rnd(50, 80) | 0},20,.9)`); gr.addColorStop(1, 'rgba(120,50,20,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
    const sides: [number, number, number][] = [[-1, -0.8, 60], [1, 0.8, 45], [-1, 2.2, 35], [1, 2.4, 25], [-1, -2.6, 15], [1, -2.9, 10]];
    for (const [side, z, at] of sides) {
      const mat = new THREE.MeshBasicMaterial({ map: rustTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), mat);
      m.position.set(side * (halfW + 0.018), 0.62, z); m.rotation.y = side * Math.PI / 2; this.body.add(m);
      this.rust.push({ m: mat, at: 100 - at, max: 0.95 });
    }
    void zRear;
  }

  private windshieldCracks() {
    const t = tex(512, 256, (g) => {
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.lineCap = 'round';
      const cx = 380, cy = 90;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + rnd(-0.2, 0.2); let x = cx, y = cy; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { const l = rnd(18, 55); x += Math.cos(a + rnd(-0.3, 0.3)) * l; y += Math.sin(a + rnd(-0.3, 0.3)) * l; g.lineTo(x, y); }
        g.stroke();
      }
      g.lineWidth = 1; for (let r = 18; r < 70; r += 22) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    });
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.44, 0.9), mat); m.position.set(0, 1.9, RV.zFront - 0.05); m.renderOrder = 3; this.body.add(m);
    return mat;
  }

  /** Burn marks on the ceiling over the stove after grease fires (driven by cabin smoke). */
  private sootStain() {
    const t = tex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(10,10,10,.85)'); gr.addColorStop(1, 'rgba(10,10,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat); m.rotation.x = Math.PI / 2; m.position.set(1.0, RV.ceilY - 0.025, 0.55); this.body.add(m);
    return mat;
  }

  // ---------- side mirrors ----------
  private sideMirrors() {
    const mk = (s: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.35), new THREE.MeshBasicMaterial({ color: '#8899aa' }));
      const rot = -s * 0.65; // angled toward the driver seat
      m.rotation.y = rot;
      m.position.set(s * (RV.halfW + 0.5) + Math.sin(rot) * 0.046, 1.75, MZ + Math.cos(rot) * 0.046);
      this.body.add(m);
      // chrome rim
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.375, 0.01), this.M.chrome);
      rim.position.set(m.position.x - Math.sin(rot) * 0.012, m.position.y, m.position.z - Math.cos(rot) * 0.012); rim.rotation.y = m.rotation.y; this.body.add(rim);
      return m;
    };
    return { left: mk(-1), right: mk(1) };
  }

  // ---------- skull charm on the driver's mirror ----------
  private buildCharm() {
    const g = this.charm;
    const bone = new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.9, roughness: 0.3 });
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), dark); cord.position.y = -0.08; g.add(cord);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 5, 10), gold); cap.position.y = -0.165; cap.rotation.y = 0.8; g.add(cap);
    const skull = new THREE.Group(); skull.position.y = -0.23; g.add(skull);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), bone); cranium.scale.set(1, 0.95, 1); skull.add(cranium);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.03, 0.05), bone); jaw.position.set(0, -0.055, -0.012); skull.add(jaw);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark); eye.position.set(s * 0.02, 0.005, -0.042); skull.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.004, 5, 4), new THREE.MeshBasicMaterial({ color: '#ff3b2f' })); glint.position.set(s * 0.02, 0.005, -0.054); skull.add(glint);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, 4), dark); nose.position.set(0, -0.022, -0.048); nose.rotation.x = Math.PI; skull.add(nose);
    for (let i = -2; i <= 2; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.004), dark); t.position.set(i * 0.011, -0.062, -0.039); skull.add(t); }
    // a tiny rusted bell under the chin
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.8), gold); bell.position.set(0, -0.12, 0); bell.rotation.x = Math.PI; skull.add(bell);
    g.position.set(-(RV.halfW + 0.5) + 0.08, 1.74 - 0.2, MZ - 0.02);
    this.body.add(g);
    g.traverse((o) => { o.castShadow = true; });
    return skull; // raycast target (the cord is too thin to click)
  }

  // ---------- coffin charm on the rear-view mirror ----------
  private buildCharm2() {
    const g = this.charm2;
    const wood = new THREE.MeshStandardMaterial({ color: '#2b1b12', roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.9, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 });
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 5), dark); cord.position.y = -0.05; g.add(cord);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, 5, 8), gold); cap.position.y = -0.105; g.add(cap);
    const coffin = new THREE.Group(); coffin.position.y = -0.19; g.add(coffin);
    const shape = new THREE.Shape();
    const pts = [[-0.02, 0.07], [0.02, 0.07], [0.043, 0.026], [0.024, -0.07], [-0.024, -0.07], [-0.043, 0.026]];
    shape.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
    shape.closePath();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }), wood);
    body.position.z = -0.013; coffin.add(body);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.004), gold); v.position.set(0, 0.015, 0.019);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.004), gold); h.position.set(0, 0.03, 0.019);
    coffin.add(v, h);
    g.position.set(0.17, 2.165, -2.9);
    this.body.add(g);
    g.traverse((o) => { o.castShadow = true; });
    return coffin; // raycast target
  }

  private swing(g: THREE.Group, p: { x: number; z: number; vx: number; vz: number }, L: number, dt: number, accel: { x: number; z: number }, speed: number) {
    const G = 9.8, damp = 1.3;
    const wind = Math.min(1, speed / 90) ** 2 * 0.55; // streams backward at speed
    const bumpy = Math.min(1, speed / 60) * 0.35;
    const n = Math.ceil(dt / 0.016);
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      const fx = accel.x / L - (G / L) * p.x - damp * p.vx + (Math.random() - 0.5) * bumpy * 60;
      const fz = accel.z / L - (G / L) * (p.z - wind) - damp * p.vz + (Math.random() - 0.5) * bumpy * 60;
      p.vx += fx * h; p.vz += fz * h; p.x += p.vx * h; p.z += p.vz * h;
      const m = Math.hypot(p.x, p.z);
      if (m > 0.95) { p.x *= 0.95 / m; p.z *= 0.95 / m; p.vx *= 0.5; p.vz *= 0.5; }
    }
    g.rotation.z = Math.asin(Math.max(-0.95, Math.min(0.95, p.x)));
    g.rotation.x = -Math.asin(Math.max(-0.95, Math.min(0.95, p.z)));
  }

  /** Pendulum physics for both charms: they swing with the RV's acceleration and stream back at speed. */
  step(dt: number, accel: { x: number; z: number }, speed: number) {
    this.swing(this.charm, this.cp, 0.17, dt, accel, speed);
    this.charm.children[2].rotation.y += dt * (0.4 + Math.abs(this.cp.vx) * 3); // the skull slowly turns
    this.swing(this.charm2, this.cp2, 0.12, dt, accel, speed);
    this.charm2.children[2].rotation.y = this.cp2.vx * 0.5;
  }

  /** Call every frame. `fire` marks the ceiling permanently the first time it burns. */
  update(integrity: number, fire: number) {
    if (Math.abs(integrity - this.lastHP) > 0.2) {
      this.lastHP = integrity;
      for (const d of this.dents) d.m.visible = integrity < d.at;
      for (const r of this.rust) r.m.opacity = Math.min(r.max, Math.max(0, (100 - integrity - r.at) / 18));
      this.crack.opacity = integrity < 55 ? Math.min(1, (55 - integrity) / 20) : 0;
      // paint dulls and darkens as the RV gets beaten up
      const wear = 1 - integrity / 100;
      this.hull.color.setScalar(1 - wear * 0.22);
    }
    if (fire > 0.4) this.soot.opacity = Math.min(0.85, this.soot.opacity + 0.002);
  }
}
