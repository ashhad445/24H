// Client view of road encounters: hitchhikers, the broken-down car, cattle, the ostrich, suitcase
// confetti, the road work zone, the railroad crossing + train, tumbleweeds, and the riders in the RV.
import * as THREE from 'three';
import { RV } from '../config';
import { warm } from '../fx/ShaderWarm';
import { itemName } from '../items/Items';
import { Character, type CharOpts } from '../models/Character';
import type { RVModel } from '../rv/RV';
import { buildVehicle } from '../traffic/TrafficView';
import type { Enc, NPCState, SharedState } from '../types';
import { ROAD_HALF, roadPoint, roadYaw } from '../world/World';
import type { Cow } from './kinds/cattle';
import { NEEDS } from './kinds/motorist';
import { ZONE_LEN, ZONE_MPH, type Cone } from './kinds/roadwork';
import { trainCars } from './kinds/train';
import { buildArrowBoard, buildCone, buildCow, buildOstrich, buildSign, buildSignal, buildTrack, buildTrainCar, stride, type Legged } from './meshes';

type Prompt = (s: SharedState, held: string) => string;
interface V { g: THREE.Group; ready: boolean; upd: (e: Enc, s: SharedState, dt: number, t: number) => void; dispose?: () => void }
type Play = (n: string, at?: [number, number, number]) => void;

const OUTFITS: (Partial<CharOpts> & { body: string })[] = [
  { body: '#a1887f', pants: '#5d4037', vest: '#e65100', hat: 'cowboy', hatColor: '#6d4c41', beard: '#795548', skin: '#c68e5d' }, // drifter
  { body: '#37474f', pants: '#212121', hat: 'beanie', hatColor: '#111111', shades: true }, // shady guy
  { body: '#121212', pants: '#121212', tie: '#fafafa', glasses: true, hair: '#9e9e9e', skin: '#e8b98a' }, // preacher
  { body: '#ff6d00', pants: '#ff6d00', hair: '', mustache: '#3e2723', belly: 1.15 }, // escaped convict
];

const lerpTo = (o: THREE.Object3D, x: number, z: number, k: number) => {
  if (Math.hypot(o.position.x - x, o.position.z - z) > 15) o.position.set(x, o.position.y, z);
  else { o.position.x += (x - o.position.x) * k; o.position.z += (z - o.position.z) * k; }
};
const lerpYaw = (o: THREE.Object3D, yaw: number, k: number) => { let d = yaw - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += d * k; };
const tag = (o: THREE.Object3D, id: string) => o.traverse((c) => { c.userData.iid = id; });

/** Put a sign on a shoulder at road distance z, facing the drivers who'll read it. */
function placeSign(g: THREE.Group, sign: THREE.Group, z: number, off: number) {
  const [x, wz] = roadPoint(z, off);
  sign.position.set(x, 0, wz); sign.rotation.y = roadYaw(z) + (off < 0 ? Math.PI : 0);
  g.add(sign);
}

export class EncounterView {
  readonly root = new THREE.Group();
  private views = new Map<number, V>();
  private prompts = new Map<string, Prompt>();
  private rider: { ch: Character; type: number } | null = null;
  private bird: Legged;
  private weeds: THREE.Mesh[] = [];
  private cone: THREE.Group;
  private rolling = new Map<number, THREE.Mesh>();
  private weedGeo = new THREE.IcosahedronGeometry(1, 1);
  private weedMat = new THREE.MeshStandardMaterial({ color: '#a1835a', wireframe: true });
  private bits: { m: THREE.Mesh; vx: number; vy: number; vz: number; t: number }[] = [];

  constructor(scene: THREE.Scene, private rv: RVModel, private play: Play) {
    scene.add(this.root);
    // the ostrich riding in the back
    this.bird = buildOstrich();
    this.bird.g.position.set(0.25, RV.floorY, 2.25); this.bird.g.rotation.y = 2.6; this.bird.g.scale.setScalar(0.85);
    this.bird.g.visible = false; rv.body.add(this.bird.g);
    // tumbleweeds stuck to the windshield (outside)
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(this.weedGeo, this.weedMat);
      m.scale.setScalar(0.32 + (i % 3) * 0.06);
      m.position.set([-0.75, 0.6, -0.1, 0.95, -0.35][i], [1.65, 2.0, 1.75, 1.6, 2.1][i], RV.zFront - 0.3);
      m.visible = false; tag(m, 'enc:weed'); rv.body.add(m); this.weeds.push(m);
    }
    // a cone jammed under the front bumper
    this.cone = buildCone(); this.cone.position.set(0.45, 0.3, RV.noseZ - 0.05); this.cone.rotation.set(-1.35, 0.4, 0);
    this.cone.visible = false; tag(this.cone, 'enc:cone'); rv.body.add(this.cone);
  }

  update(s: SharedState, dt: number, cam: THREE.Vector3) {
    const t = performance.now() / 1000, enc = s.enc;
    if (!enc) return;
    const seen = new Set<number>();
    for (const e of enc.list) {
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) { v = this.build(e); this.views.set(e.id, v); }
      v.g.visible = v.ready;
      if (v.ready) v.upd(e, s, dt, t);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.dispose?.(); this.root.remove(v.g); this.views.delete(id); for (const k of [...this.prompts.keys()]) if (k.startsWith(`enc:${id}:`)) this.prompts.delete(k); }

    // rider at the dinette
    const r = enc.rider;
    if (r && (!this.rider || this.rider.type !== r.type)) {
      this.rider?.ch.dispose();
      const ch = new Character({ kind: 'human', ...OUTFITS[r.type], pose: 'sit', npc: true });
      ch.root.position.set(-0.95, 0.73, -0.78); ch.root.rotation.y = Math.PI;
      tag(ch.root, 'enc:rider'); this.rv.body.add(ch.root);
      this.rider = { ch, type: r.type };
    } else if (!r && this.rider) { this.rider.ch.dispose(); this.rider = null; }
    if (this.rider) this.rider.ch.anim.talk = Math.sin(t * 0.7) > 0.6 ? 1 : 0;

    // ostrich in the aisle
    this.bird.g.visible = !!enc.bird;
    if (enc.bird && this.bird.head) { this.bird.head.rotation.x = Math.sin(t * 2.3) * 0.25; this.bird.g.rotation.y = 2.6 + Math.sin(t * 0.4) * 0.6; }
    // windshield weeds + jammed cone
    this.weeds.forEach((m, i) => { m.visible = i < enc.weeds; if (m.visible) m.rotation.set(t * 0.3 + i, i * 1.7, 0); });
    this.cone.visible = !!enc.cone;
    if (enc.cone) this.cone.rotation.z = Math.sin(t * 30) * 0.03 * Math.min(1, Math.abs(s.rv.speed) / 10);
    // rolling tumbleweeds
    const live = new Set<number>();
    for (const w of enc.rolling ?? []) {
      live.add(w.id);
      let m = this.rolling.get(w.id);
      if (!m) { m = new THREE.Mesh(this.weedGeo, this.weedMat); m.scale.setScalar(w.r); this.root.add(m); this.rolling.set(w.id, m); m.position.set(w.x, w.r, w.z); }
      lerpTo(m, w.x, w.z, Math.min(1, dt * 12));
      m.position.y = w.r + Math.abs(Math.sin(t * 4 + w.id)) * 0.8;
      m.rotation.x += dt * Math.hypot(w.vx, w.vz) / w.r * 0.6; m.rotation.z += dt * 2;
    }
    for (const [id, m] of this.rolling) if (!live.has(id)) { this.root.remove(m); this.rolling.delete(id); }
    // confetti / debris bits
    for (const b of this.bits) {
      b.t -= dt; b.vy -= 9.8 * dt;
      const p = b.m.position;
      p.x += b.vx * dt; p.y = Math.max(0.02, p.y + b.vy * dt); p.z += b.vz * dt;
      if (p.y <= 0.02) { b.vx *= 0.85; b.vz *= 0.85; b.vy = 0; } else b.m.rotation.x += dt * 6;
    }
    this.bits = this.bits.filter((b) => (b.t > 0 ? true : (this.root.remove(b.m), b.m.geometry.dispose(), (b.m.material as THREE.Material).dispose(), false)));
    void cam;
  }

  promptFor(id: string, s: SharedState, held: string): string {
    const enc = s.enc;
    if (id === 'enc:rider') return enc.rider ? (Math.abs(s.rv.speed) < 0.6 ? `🎒 Ask ${enc.rider.name} to get out` : `🎒 ${enc.rider.name} (stop the RV to let them out)`) : '';
    if (id === 'enc:weed') return enc.weeds > 0 ? `🌾 Pull a tumbleweed off the windshield (${enc.weeds} stuck)` : '';
    if (id === 'enc:cone') return enc.cone ? '🚧 Yank out the jammed cone' : '';
    return this.prompts.get(id)?.(s, held) ?? '';
  }

  // ------------------------------------------------------------------ builders
  private build(e: Enc): V {
    const g = new THREE.Group();
    this.root.add(g);
    const v: V = { g, ready: false, upd: () => {} };
    const b = this[`b_${e.k}` as const] as (e: Enc, g: THREE.Group) => Pick<V, 'upd' | 'dispose'>;
    Object.assign(v, b.call(this, e, g));
    g.visible = false;
    void warm(g).then(() => { v.ready = true; });
    return v;
  }

  private b_hitch(e: Enc, g: THREE.Group) {
    const ch = new Character({ kind: 'human', ...OUTFITS[e.type], pose: 'wave', npc: true });
    const [x, z] = roadPoint(e.z, e.off);
    ch.root.position.set(x, 0, z); ch.root.rotation.y = roadYaw(e.z) + Math.PI - 0.5;
    g.add(ch.root);
    // cardboard sign + backpack
    const card = buildSign([['VEGAS?', 56, '#3e2723']], '#c9a66b', 'rect', 0.55, 0, '#8d6e63');
    card.children[0].visible = false; card.position.set(-0.45, 0.85, -0.25); ch.root.add(card);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: ['#2e7d32', '#424242', '#5d4037', '#ef6c00'][e.type], roughness: 0.9 }));
    pack.position.set(0.6, 0.3, 0); pack.castShadow = true; ch.root.add(pack);
    return {
      upd: (e: Enc, _s: SharedState, dt: number) => {
        const k = Math.min(1, dt * 10);
        lerpTo(ch.root, e.x, e.wz, k);
        if (e.ph === 1) { ch.pose = 'idle'; ch.anim.walk = 1; lerpYaw(ch.root, e.yaw ?? 0, k); pack.visible = false; card.visible = false; }
        else { ch.pose = 'wave'; ch.anim.walk = 0; }
      },
      dispose: () => ch.dispose(),
    };
  }

  private b_motorist(e: Enc, g: THREE.Group) {
    const car = buildVehicle(e.car as NPCState['k'], e.c);
    g.add(car.g);
    // hood up
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.1), new THREE.MeshStandardMaterial({ color: '#9e9e9e', roughness: 0.4, metalness: 0.4 }));
    hood.geometry.translate(0, 0, 0.55); hood.position.set(0, 1.05, -1.75); hood.rotation.x = -1.0; car.g.add(hood);
    const steam = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#eeeeee', transparent: true, opacity: 0.35, depthWrite: false }));
    steam.position.set(0, 1.4, -1.9); car.g.add(steam);
    const ch = new Character({ kind: 'human', body: ['#1e88e5', '#8e24aa', '#43a047', '#f4511e'][e.c % 4], pants: '#37474f', hat: e.c % 2 ? 'cap' : 'none', hatColor: '#c62828', pose: 'wave', npc: true });
    g.add(ch.root);
    const id = `enc:${e.id}:help`;
    tag(car.g, id); tag(ch.root, id);
    const need = NEEDS[e.need];
    this.prompts.set(id, (s, held) => {
      const ee = s.enc.list.find((x) => x.id === e.id);
      if (!ee || ee.ph >= 2) return '';
      if (held === 'pistol') return '🔫 Rob the stranded driver';
      if (held === need.k || held === 'tape') return `🚗 Give them the ${held === 'tape' ? 'duct tape ("it\'ll hold")' : itemName(held, 1).replace(/ \(.*\)/, '').toLowerCase()}`;
      return `🚗 "I ${need.why}." Bring a ${need.k === 'jerrycan' ? 'jerrycan with gas' : need.k === 'coolant' ? 'coolant jug' : 'fuse'} (or duct tape)`;
    });
    let wheel = 0;
    return {
      upd: (e: Enc, _s: SharedState, dt: number, t: number) => {
        const [x, z] = roadPoint(e.s, e.off);
        car.g.position.set(x, 0, z); car.g.rotation.y = roadYaw(e.s);
        const blink = e.ph < 2 && Math.floor(t * 2.5) % 2 === 0 ? 2.5 : 0;
        car.sigL.emissiveIntensity = blink; car.sigR.emissiveIntensity = blink;
        hood.rotation.x = e.ph >= 2 ? 0 : -1.0; hood.visible = e.ph < 2;
        steam.visible = e.ph < 2 && e.need === 1;
        if (steam.visible) { steam.position.y = 1.4 + (t % 1.5) * 0.6; (steam.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - (t % 1.5) / 1.5); }
        wheel += (e.v ?? 0) * dt; for (const w of car.wheels) w.rotation.x = -wheel / car.wheelR;
        ch.root.visible = e.ph < 2;
        const [px, pz] = roadPoint(e.s + 1.2, e.off - 1.7);
        ch.root.position.set(px, 0, pz); ch.root.rotation.y = roadYaw(e.s) + Math.PI - 0.7;
      },
      dispose: () => ch.dispose(),
    };
  }

  private b_cattle(e: Enc, g: THREE.Group) {
    const cows = (e.cows as Cow[]).map((_, i) => { const c = buildCow(i * 0.37); g.add(c.g); return c; });
    placeSign(g, buildSign([['CATTLE', 46, '#111'], ['XING', 46, '#111']], '#ffd600', 'diamond'), e.z + 420, ROAD_HALF + 2.5);
    placeSign(g, buildSign([['CATTLE', 46, '#111'], ['XING', 46, '#111']], '#ffd600', 'diamond'), e.z - 420, -(ROAD_HALF + 2.5));
    let mooT = 2;
    return {
      upd: (e: Enc, s: SharedState, dt: number, t: number) => {
        (e.cows as Cow[]).forEach((c, i) => {
          const v = cows[i]; if (!v) return;
          const z = e.z + c.d;
          let [x, wz] = roadPoint(z, c.o);
          const ry = roadYaw(z);
          if (c.st === 2) {
            // sent flying
            const el = Math.max(0, e.t - (c.ht ?? e.t));
            const fl = Math.min(el, 1.6);
            x += (c.fx ?? 0) * fl * 0.6; wz += (c.fz ?? 0) * fl * 0.6;
            v.g.position.set(x, Math.max(0, 7 * fl - 4.9 * fl * fl), wz);
            v.g.rotation.z = Math.min(Math.PI / 2, el * 3);
            stride(v, 0, 0);
            return;
          }
          lerpTo(v.g, x, wz, Math.min(1, dt * 10));
          const walking = e.go && c.wait <= 0 && (c.st === 1 || Math.abs(c.o) < ROAD_HALF + 9);
          v.g.rotation.y = ry + (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
          stride(v, t * (c.st === 1 ? 11 : 4) + i, walking ? (c.st === 1 ? 0.6 : 0.3) : 0);
          if (v.head) v.head.rotation.x = walking ? 0 : Math.sin(t * 0.8 + i) * 0.15 + 0.3;
        });
        if ((mooT -= dt) <= 0) {
          mooT = 2 + Math.random() * 4;
          const c = (e.cows as Cow[])[Math.floor(Math.random() * e.cows.length)];
          if (c && c.st !== 2) { const [x, z] = roadPoint(e.z + c.d, c.o); if (Math.hypot(x - s.rv.x, z - s.rv.z) < 120) this.play('moo', [x, 1.2, z]); }
        }
      },
    };
  }

  private b_ostrich(e: Enc, g: THREE.Group) {
    const o = buildOstrich(); g.add(o.g);
    o.g.position.set(e.x, 0, e.wz);
    let ph = 0;
    return {
      upd: (e: Enc, _s: SharedState, dt: number) => {
        lerpTo(o.g, e.x, e.wz, Math.min(1, dt * 12));
        lerpYaw(o.g, e.yaw, Math.min(1, dt * 8));
        ph += dt * (2 + (e.v ?? 0) * 0.9);
        stride(o, ph, Math.min(0.9, (e.v ?? 0) * 0.06));
        o.g.position.y = (e.v ?? 0) > 2 ? Math.abs(Math.sin(ph)) * 0.12 : 0;
        if (o.head) o.head.rotation.x = (e.v ?? 0) > 2 ? -0.35 : Math.sin(ph * 0.3) * 0.2;
      },
    };
  }

  private b_suitcase(_e: Enc, _g: THREE.Group) {
    let burst = false;
    return {
      upd: (e: Enc) => {
        if (!e.burst || burst) return;
        burst = true;
        const colors = ['#e91e63', '#ffeb3b', '#00bcd4', '#8bc34a', '#ff5722', '#ffffff', '#3f51b5'];
        for (let i = 0; i < 28; i++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.9 }));
          m.position.set(e.bx, 0.5, e.bz); this.root.add(m);
          this.bits.push({ m, vx: (Math.random() - 0.5) * 10, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 10 - 6, t: 25 });
        }
      },
    };
  }

  private b_roadwork(e: Enc, g: THREE.Group) {
    const cones = (e.cones as Cone[]).map(() => { const c = buildCone(); g.add(c); return c; });
    const sign = (lines: [string, number, string][], bg: string, shape: 'diamond' | 'rect', z: number) => placeSign(g, buildSign(lines, bg, shape), z, ROAD_HALF + 2.5);
    sign([['ROAD', 44, '#111'], ['WORK', 44, '#111'], ['AHEAD', 44, '#111']], '#ff9800', 'diamond', e.z + 520);
    sign([['SPEED', 34, '#111'], ['LIMIT', 34, '#111'], [`${ZONE_MPH}`, 76, '#111']], '#fafafa', 'rect', e.z + 280);
    sign([['END', 44, '#111'], ['ROAD WORK', 40, '#111']], '#ff9800', 'rect', e.z - ZONE_LEN - 80);
    const board = buildArrowBoard();
    const [bx, bz] = roadPoint(e.z + 85, 7.4); board.g.position.set(bx, 0, bz); board.g.rotation.y = roadYaw(e.z + 85); g.add(board.g);
    const work = (over: Partial<CharOpts>) => { const c = new Character({ kind: 'human', body: '#5d4037', pants: '#37474f', hat: 'hardhat', hatColor: '#fbc02d', vest: '#ff6d00', npc: true, ...over }); g.add(c.root); return c; };
    const flagger = work({ pose: 'idle' });
    const [fx, fz] = roadPoint(e.z, 4.6); flagger.root.position.set(fx, 0, fz); flagger.root.rotation.y = roadYaw(e.z) + Math.PI;
    const stop = buildSign([['STOP', 70, '#fff']], '#d50000', 'octagon', 0.55, 1.15, '#fff');
    const slow = buildSign([['SLOW', 62, '#111']], '#ff9800', 'diamond', 0.6, 1.1);
    for (const p of [stop, slow]) { p.position.set(-0.45, 0, -0.2); flagger.root.add(p); }
    const workers = (e.workers as { d: number; o: number }[]).map((w, i) => {
      const c = work({ pose: i === 1 ? 'hips' : 'cross', body: ['#5d4037', '#455a64', '#6d4c41'][i] });
      const [x, z] = roadPoint(e.z + w.d, w.o); c.root.position.set(x, 0, z); c.root.rotation.y = roadYaw(e.z) + (i % 2 ? 1.2 : -2);
      // a barricade + a hole for them to stare into
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.08), new THREE.MeshStandardMaterial({ color: '#ff6d00' }));
      const [hx, hz] = roadPoint(e.z + w.d - 4, w.o - 1.2); bar.position.set(hx, 0.9, hz); bar.rotation.y = roadYaw(e.z); bar.castShadow = true; g.add(bar);
      return c;
    });
    return {
      upd: (e: Enc, _s: SharedState, _dt: number, t: number) => {
        (e.cones as Cone[]).forEach((c, i) => {
          const m = cones[i]; if (!m) return;
          let [x, z] = roadPoint(e.z + c.d, c.o);
          if (c.st) {
            const el = Math.min(1.3, Math.max(0, e.t - (c.ht ?? e.t)));
            x += (c.fx ?? 0) * el * 0.5; z += (c.fz ?? 0) * el * 0.5;
            m.position.set(x, Math.max(0, 5 * el - 4.9 * el * el), z); m.rotation.set(el * 6, 0, Math.PI / 2 * Math.min(1, el * 2));
          } else m.position.set(x, 0, z);
        });
        stop.visible = e.sg === 0; slow.visible = e.sg !== 0;
        board.lamp.emissiveIntensity = Math.floor(t * 1.6) % 2 === 0 ? 3 : 0.1;
        (e.workers as { d: number; o: number; dove: number }[]).forEach((w, i) => {
          const c = workers[i];
          if (w.dove && c.root.rotation.z === 0) { const [x, z] = roadPoint(e.z + w.d, ROAD_HALF + 3); c.root.position.set(x, 0.25, z); c.root.rotation.z = Math.PI / 2; c.pose = 'idle'; }
        });
      },
      dispose: () => { flagger.dispose(); workers.forEach((w) => w.dispose()); },
    };
  }

  private b_train(e: Enc, g: THREE.Group) {
    const X = new THREE.Group();
    const [cx, cz] = roadPoint(e.z, 0);
    X.position.set(cx, 0, cz); X.rotation.y = roadYaw(e.z);
    g.add(X);
    X.add(buildTrack(700, ROAD_HALF));
    const right = buildSignal(ROAD_HALF - 0.6); right.g.position.set(ROAD_HALF + 1.4, 0, 6); X.add(right.g);
    const left = buildSignal(ROAD_HALF - 0.6); left.g.position.set(-(ROAD_HALF + 1.4), 0, -6); left.g.rotation.y = Math.PI; X.add(left.g);
    placeSign(g, buildSign([['R X R', 52, '#111']], '#ffd600', 'circle'), e.z + 330, ROAD_HALF + 2.5);
    placeSign(g, buildSign([['R X R', 52, '#111']], '#ffd600', 'circle'), e.z - 330, -(ROAD_HALF + 2.5));
    const cars: THREE.Group[] = [];
    for (let i = 0; i <= e.n; i++) { const c = buildTrainCar(i, i === 0); c.position.y = 0.12; c.rotation.y = e.dir > 0 ? 0 : Math.PI; c.visible = false; X.add(c); cars.push(c); }
    let bell = 0, clack = 0;
    const at: [number, number, number] = [cx, 2, cz];
    return {
      upd: (e: Enc, s: SharedState, dt: number, t: number) => {
        const flashing = e.ph === 1 || e.gate > 0.02;
        const on = Math.floor(t * 2.2) % 2 === 0;
        for (const sig of [left, right]) { sig.lamps[0].emissiveIntensity = flashing && on ? 4 : 0; sig.lamps[1].emissiveIntensity = flashing && !on ? 4 : 0; }
        for (const sig of [left, right]) sig.arm.rotation.z = -(Math.PI / 2) * (1 - (e.gate ?? 0));
        right.arm.visible = !e.snap;
        const near = Math.hypot(s.rv.x - cx, s.rv.z - cz) < 500;
        if (flashing && near && (bell -= dt) <= 0) { bell = 0.55; this.play('ding', at); }
        trainCars(e).forEach(([u], i) => {
          const c = cars[i]; if (!c) return;
          c.visible = Math.abs(u) < 720;
          // smooth between snapshots: the train only moves along its track
          c.position.x += (u - c.position.x) * Math.min(1, dt * 10);
          if (Math.abs(c.position.x - u) > 30) c.position.x = u;
        });
        // wheels clattering over the road while any car is on the crossing
        const onX = trainCars(e).some(([u, h]) => Math.abs(u) < h + ROAD_HALF);
        if (near && onX && (clack -= dt) <= 0) { clack = 1.4; this.play('clack', at); }
      },
    };
  }

  /** One of everything, for shader warm-up at boot. */
  static samples(): THREE.Group {
    const g = new THREE.Group();
    g.add(buildCow().g, buildOstrich().g, buildCone(), buildArrowBoard().g, buildSignal(5).g, buildTrack(30, 12));
    for (let i = 0; i < 4; i++) g.add(buildTrainCar(i, i === 0));
    g.add(buildSign([['X', 40, '#111']], '#ffd600', 'diamond'));
    for (const o of OUTFITS) g.add(new Character({ kind: 'human', ...o }).root);
    return g;
  }
}
