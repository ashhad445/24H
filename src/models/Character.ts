// Procedural characters: the crew's "bean" avatars and the human NPCs (Cletus, Roscoe, Flo, …).
// One builder, many looks. Everything faces −Z. Animation is procedural: walk cycle, sitting,
// holding, eating, slapping, blinking, talking mouth, breathing, and a few NPC idle poses.
import * as THREE from 'three';
import { Assets, tint } from '../core/AssetLoader';

export type Hat = 'none' | 'cap' | 'cowboy' | 'sheriff' | 'beanie' | 'bucket' | 'trucker' | 'party' | 'beehive' | 'hardhat';
export type Pose = 'idle' | 'read' | 'cross' | 'wipe' | 'hips' | 'notepad' | 'wave'
  // seated extras (place the root ~0.35 m below the seat height for humans)
  | 'sit' | 'eat' | 'sleep' | 'kick' | 'slots' | 'sing';
const SEATED_POSES = new Set<Pose>(['sit', 'eat', 'sleep', 'kick', 'slots']);

export interface CharOpts {
  kind: 'bean' | 'human';
  body: string; // bean color / shirt color
  skin?: string;
  pants?: string;
  shoes?: string;
  hat?: Hat;
  hatColor?: string;
  hair?: string; // human: hair color ('' = bald)
  beard?: string;
  mustache?: string;
  shades?: boolean;
  glasses?: boolean;
  apron?: string;
  badge?: boolean;
  vest?: string;
  tie?: string;
  belly?: number; // 1 = normal, 1.4 = big
  height?: number; // overall scale
  glove?: string; // bean hands
  pose?: Pose;
  /** NPCs animate themselves via Character.tickAll(). */
  npc?: boolean;
}

export interface AnimInput { walk: number; seated: boolean; hold: boolean; aim: number; talk: number }

const mat = (color: string, rough = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const DARK = mat('#141414', 0.5);
const WHITE = mat('#ffffff', 0.4);
const GOLD = mat('#d4a017', 0.3, { metalness: 0.8 });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; return o;
}

// ---- Blender kit (public/models/people.glb, built by art/people.py) ----
const GLB_HATS: Partial<Record<Hat, string>> = { cowboy: 'hat_cowboy', sheriff: 'hat_sheriff', cap: 'hat_cap', trucker: 'hat_trucker', hardhat: 'hat_hardhat', beehive: 'hat_beehive' };

/** A hat whose band sits at y=0 and fits a head of radius r. */
function buildHat(type: Hat, color: string, r: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, 0.7);
  switch (type) {
    case 'cap': case 'trucker': {
      const crown = mesh(new THREE.SphereGeometry(r * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
      crown.scale.y = 0.75; g.add(crown);
      const brim = mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.025, 16, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.01, -r * 0.75);
      brim.scale.z = 0.9; g.add(brim);
      if (type === 'trucker') { const front = mesh(new THREE.SphereGeometry(r * 1.04, 12, 8, Math.PI * 0.62, Math.PI * 0.76, 0.25, 1.0), WHITE); front.scale.y = 0.75; g.add(front); }
      g.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), m, 0, r * 0.76, 0));
      break;
    }
    case 'cowboy': case 'sheriff': {
      const crown = mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.95, r * 0.95, 16), m, 0, r * 0.45, 0);
      g.add(crown);
      const dent = mesh(new THREE.BoxGeometry(r * 0.25, r * 0.2, r * 1.4), m, 0, r * 0.9, 0); g.add(dent);
      // wide brim with the sides curled up
      const brim = mesh(new THREE.CylinderGeometry(r * 1.9, r * 1.9, 0.03, 24), m, 0, 0.02, 0); brim.scale.x = 0.85; g.add(brim);
      for (const s of [-1, 1]) { const curl = mesh(new THREE.BoxGeometry(r * 0.5, 0.03, r * 2.2), m, s * r * 1.65, 0.1, 0); curl.rotation.z = s * 0.7; g.add(curl); }
      const band = mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, r * 0.18, 16), DARK, 0, r * 0.1, 0); g.add(band);
      if (type === 'sheriff') { const star = mesh(new THREE.CircleGeometry(r * 0.28, 5), GOLD, 0, r * 0.45, -r * 0.87); star.rotation.x = 0.15; g.add(star); }
      break;
    }
    case 'beanie': {
      const b = mesh(new THREE.SphereGeometry(r * 1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); b.scale.y = 0.95; g.add(b);
      g.add(mesh(new THREE.TorusGeometry(r * 1.0, r * 0.12, 6, 20).rotateX(Math.PI / 2), m));
      g.add(mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), WHITE, 0, r * 1.02, 0));
      break;
    }
    case 'bucket': {
      g.add(mesh(new THREE.CylinderGeometry(r * 0.8, r * 1.0, r * 0.8, 16), m, 0, r * 0.38, 0));
      g.add(mesh(new THREE.CylinderGeometry(r * 1.0, r * 1.45, r * 0.25, 18, 1, true), m, 0, 0, 0));
      break;
    }
    case 'hardhat': {
      const d = mesh(new THREE.SphereGeometry(r * 1.08, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); d.scale.y = 0.85; g.add(d);
      g.add(mesh(new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.03, 18), m, 0, 0.01, -0.02));
      g.add(mesh(new THREE.BoxGeometry(0.04, r * 0.9, r * 2.0), m, 0, r * 0.5, 0));
      break;
    }
    case 'party': {
      g.add(mesh(new THREE.ConeGeometry(r * 0.6, r * 1.6, 14), m, 0, r * 0.8, 0));
      g.add(mesh(new THREE.SphereGeometry(r * 0.16, 8, 6), mat('#ffeb3b'), 0, r * 1.65, 0));
      break;
    }
    case 'beehive': {
      const h = mesh(new THREE.SphereGeometry(r * 1.0, 14, 12), m, 0, r * 0.75, 0.02); h.scale.set(0.95, 1.45, 0.95); g.add(h);
      g.add(mesh(new THREE.SphereGeometry(r * 1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, -0.02, 0.03));
      break;
    }
    case 'none': break;
  }
  return g;
}

export class Character {
  static all = new Set<Character>();
  /** Animate every NPC character (call once per frame). */
  static tickAll(dt: number) { for (const c of Character.all) c.update(dt); }

  readonly root = new THREE.Group();
  /** Bobs/leans as a whole (everything but the feet/legs). */
  readonly body = new THREE.Group();
  /** Face + hat. Pitches with where the character looks. */
  readonly head = new THREE.Group();
  /** Held items attach here (right hand). */
  readonly hand = new THREE.Group();
  /** Left hand (for props like Flo's notepad or a newspaper). */
  readonly handL = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private eyes: THREE.Group[] = [];
  private smile: THREE.Mesh;
  private mouth: THREE.Mesh;
  private torso: THREE.Object3D;
  private t = Math.random() * 100;
  private blinkT = 2 + Math.random() * 3;
  private walkPhase = 0;
  private eatT = 0;
  private slapT = 0;
  private waveT = 0;
  private headBaseY: number;
  pose: Pose;
  anim: AnimInput = { walk: 0, seated: false, hold: false, aim: 0, talk: 0 };

  constructor(readonly o: CharOpts) {
    this.pose = o.pose ?? 'idle';
    if (SEATED_POSES.has(this.pose)) this.anim.seated = true;
    const bean = o.kind === 'bean';
    const skin = o.skin ?? '#e0ac69';
    const bodyM = mat(o.body, bean ? 0.55 : 0.8);
    this.root.add(this.body);

    let faceR: number; // head radius, for features
    let faceY: number; // face center (local to head)
    let topY: number; // hat band height (local to head)
    let shoulder: [number, number];
    let armLen: number;

    if (bean) {
      // one smooth bean: lathe profile, wide at the bottom
      const pts = [[0, 0.1], [0.24, 0.11], [0.34, 0.25], [0.37, 0.55], [0.355, 0.95], [0.32, 1.3], [0.27, 1.55], [0.18, 1.71], [0.06, 1.77], [0, 1.775]]
        .map(([x, y]) => new THREE.Vector2(x, y));
      const b = mesh(new THREE.LatheGeometry(pts, 28), bodyM); this.torso = b; this.body.add(b);
      // belly patch
      const belly = mesh(new THREE.SphereGeometry(0.26, 18, 12), mat(new THREE.Color(o.body).lerp(new THREE.Color('#ffffff'), 0.35).getStyle(), 0.6), 0, 0.62, -0.13, false);
      belly.scale.set(1, 1.25, 0.6); this.body.add(belly);
      this.head.position.set(0, 1.35, 0);
      faceR = 0.3; faceY = 0.13; topY = 0.29;
      shoulder = [0.35, 1.0]; armLen = 0.36;
      // feet
      const shoeM = mat(o.shoes ?? new THREE.Color(o.body).multiplyScalar(0.45).getStyle(), 0.7);
      for (const [leg, s] of [[this.legL, -1], [this.legR, 1]] as const) {
        leg.position.set(s * 0.15, 0, 0);
        const f = mesh(new THREE.CapsuleGeometry(0.085, 0.13, 4, 10).rotateX(Math.PI / 2), shoeM, 0, 0.085, -0.06);
        leg.add(f); this.root.add(leg);
      }
    } else {
      const bel = o.belly ?? 1;
      const pantsM = mat(o.pants ?? '#3e4a5a', 0.85);
      const shoeM = mat(o.shoes ?? '#3e2723', 0.6);
      for (const [leg, s] of [[this.legL, -1], [this.legR, 1]] as const) {
        leg.position.set(s * 0.13 * Math.max(1, bel * 0.9), 0.85, 0);
        leg.add(mesh(new THREE.CapsuleGeometry(0.095, 0.6, 4, 10), pantsM, 0, -0.39, 0));
        leg.add(mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), shoeM, 0, -0.8, -0.06));
        this.root.add(leg);
      }
      const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 16), bodyM, 0, 1.17, 0);
      torso.scale.set(bel, 1, bel * 0.9); this.torso = torso; this.body.add(torso);
      if (bel > 1.1) { const gut = mesh(new THREE.SphereGeometry(0.3 * bel, 16, 12), bodyM, 0, 1.0, -0.06 * bel); gut.scale.set(1, 0.9, 0.95); this.body.add(gut); }
      this.body.add(mesh(new THREE.BoxGeometry(0.62 * bel, 0.09, 0.5 * bel), pantsM, 0, 0.88, 0)); // belt line
      this.body.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 10), mat(skin), 0, 1.58, 0)); // neck
      this.head.position.set(0, 1.62, 0);
      const h = mesh(new THREE.SphereGeometry(0.22, 20, 16), mat(skin, 0.7), 0, 0.2, 0); h.scale.set(1, 1.08, 1); this.head.add(h);
      // ears + nose
      for (const s of [-1, 1]) this.head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(skin, 0.7), s * 0.22, 0.2, 0.01));
      this.head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(new THREE.Color(skin).multiplyScalar(0.92).getStyle(), 0.7), 0, 0.18, -0.22));
      if (o.hair) { const hair = mesh(new THREE.SphereGeometry(0.235, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(o.hair, 0.9), 0, 0.23, 0.03); hair.rotation.x = -0.25; this.head.add(hair); }
      faceR = 0.22; faceY = 0.2; topY = 0.36;
      shoulder = [0.26 * bel + 0.07, 1.5]; armLen = 0.62;
      // clothing details
      if (o.apron) { const a = mesh(new THREE.BoxGeometry(0.46 * bel, 0.75, 0.02), mat(o.apron, 0.8), 0, 1.0, -0.27 * bel - 0.02); this.body.add(a); }
      if (o.vest) for (const s of [-1, 1]) this.body.add(mesh(new THREE.BoxGeometry(0.2 * bel, 0.55, 0.03), mat(o.vest, 0.8), s * 0.15 * bel, 1.25, -0.25 * bel));
      if (o.tie) { const t = mesh(new THREE.BoxGeometry(0.07, 0.38, 0.02), mat(o.tie, 0.6), 0, 1.3, -0.26 * bel - 0.01); this.body.add(t); }
      if (o.badge) { const st = mesh(new THREE.CircleGeometry(0.07, 5), GOLD, -0.13 * bel, 1.38, -0.25 * bel - 0.02); st.rotation.y = Math.PI; this.body.add(st); }
    }
    this.headBaseY = this.head.position.y;
    this.body.add(this.head);

    // ---- face ----
    const ez = -Math.sqrt(Math.max(0, faceR * faceR - (bean ? 0.11 : 0.075) ** 2)) + (bean ? 0.03 : 0.015);
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(s * (bean ? 0.11 : 0.075), faceY + (bean ? 0.04 : 0.04), ez);
      const r = bean ? 0.075 : 0.045;
      const white = mesh(new THREE.SphereGeometry(r, 12, 10), WHITE, 0, 0, 0, false); white.scale.z = 0.6; e.add(white);
      e.add(mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), DARK, 0, -r * 0.05, -r * 0.45, false));
      e.add(mesh(new THREE.SphereGeometry(r * 0.16, 6, 4), WHITE, r * 0.18, r * 0.2, -r * 0.75, false)); // glint
      e.userData.face = true;
      this.head.add(e); this.eyes.push(e);
      if (bean) { const cheek = mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#ff8a80', 0.8), s * 0.19, faceY - 0.06, ez + 0.06, false); cheek.scale.z = 0.4; this.head.add(cheek); }
    }
    const mz = -faceR + (bean ? 0.025 : 0.012);
    const my = faceY - (bean ? 0.08 : 0.1);
    this.smile = mesh(new THREE.TorusGeometry(bean ? 0.06 : 0.045, 0.012, 6, 12, Math.PI), DARK, 0, my + 0.03, mz, false);
    this.smile.rotation.z = Math.PI; this.head.add(this.smile);
    this.mouth = mesh(new THREE.SphereGeometry(bean ? 0.05 : 0.04, 10, 8), mat('#5d1a1a', 0.6), 0, my, mz, false);
    this.mouth.scale.set(1.3, 0.2, 0.4); this.mouth.visible = false; this.head.add(this.mouth);
    this.smile.userData.face = this.mouth.userData.face = true;

    if (o.shades) {
      const sh = mesh(new THREE.BoxGeometry(faceR * 1.55, faceR * 0.28, 0.04), mat('#111', 0.15, { metalness: 0.6 }), 0, faceY + 0.04, ez - 0.03, false);
      sh.userData.face = true;
      this.head.add(sh); this.eyes.forEach((e) => (e.visible = false));
    }
    if (o.glasses) for (const s of [-1, 1]) { const gl = mesh(new THREE.TorusGeometry(bean ? 0.085 : 0.055, 0.008, 6, 16), DARK, s * (bean ? 0.11 : 0.075), faceY + 0.04, ez - 0.03, false); gl.userData.face = true; this.head.add(gl); }
    if (o.mustache) for (const s of [-1, 1]) {
      const m = mesh(new THREE.CapsuleGeometry(0.022, 0.07, 4, 8), mat(o.mustache, 0.9), s * 0.045, my + 0.05, mz - 0.01, false);
      m.rotation.z = s * 1.2; this.head.add(m);
    }
    if (o.beard) { const b = mesh(new THREE.SphereGeometry(faceR * 0.8, 14, 10), mat(o.beard, 0.95), 0, faceY - faceR * 0.55, -faceR * 0.35); b.scale.set(1.05, 1.0, 0.75); this.head.add(b); }
    if (o.hat && o.hat !== 'none') { const hat = buildHat(o.hat, o.hatColor ?? '#c62828', faceR * (bean ? 0.86 : 1.05)); hat.position.y = topY; hat.rotation.x = bean ? 0 : -0.05; this.head.add(hat); }

    // ---- arms ----
    const sleeveM = bodyM;
    const handM = bean ? mat(o.glove ?? '#fafafa', 0.6) : mat(skin, 0.7);
    for (const [arm, hand, s] of [[this.armL, this.handL, -1], [this.armR, this.hand, 1]] as const) {
      arm.position.set(s * shoulder[0], shoulder[1], 0);
      arm.add(mesh(new THREE.CapsuleGeometry(bean ? 0.065 : 0.075, armLen * 0.6, 4, 10), sleeveM, 0, -armLen * 0.45, 0));
      arm.add(mesh(new THREE.SphereGeometry(bean ? 0.085 : 0.07, 10, 8), handM, 0, -armLen, 0));
      hand.position.set(0, -armLen - 0.02, 0);
      arm.add(hand);
      arm.rotation.z = s * 0.12;
      this.body.add(arm);
    }

    this.root.scale.setScalar(o.height ?? 1);
    if (o.npc) Character.all.add(this);
    // humans swap their primitive body for the Blender kit as soon as it's loaded
    if (!bean) Assets.onReady(() => this.useKit());
  }

  /** Replace the primitive human body/head/arms/hat with people.glb parts (face features stay). */
  private useKit() {
    if (!Assets.has('people') || this.kit) return;
    const P = (n: string) => Assets.node('people', n);
    if (!P('torso') || !P('head')) return;
    this.kit = true;
    const o = this.o, bel = o.belly ?? 1;
    const colors: Record<string, string | undefined> = {
      skin: o.skin ?? '#e0ac69', shirt: o.body, pants: o.pants ?? '#3e4a5a', shoes: o.shoes ?? '#3e2723',
      hair: o.hair || '#5d4037', beard: o.beard ?? o.mustache ?? '#eeeeee', brow: o.hair || o.beard || o.mustache || '#4e342e',
      hat: o.hatColor ?? '#c62828', vest: o.vest, apron: o.apron, tie: o.tie,
    };
    const K = (n: string) => { const x = P(n); return x ? tint(x, colors) : null; };
    // drop the primitives (keep face features and anything held in the hands)
    const old: THREE.Object3D[] = [];
    const walk = (g: THREE.Object3D) => {
      for (const c of g.children) {
        if (c.userData.face || c === this.hand || c === this.handL) continue;
        if (c === this.head || c === this.armL || c === this.armR || c === this.legL || c === this.legR || c === this.body) walk(c);
        else old.push(c);
      }
    };
    walk(this.root);
    old.forEach((c) => c.removeFromParent());

    const body = (x: THREE.Object3D | null, sx = bel, sz = bel * 0.9) => { if (x) { x.scale.set(sx, 1, sz); this.body.add(x); } return x; };
    this.torso = body(K('torso'))!;
    if (bel > 1.1) { const g = body(K('gut'), 0.55 + bel * 0.4, 0.45 + bel * 0.4); if (g) { g.scale.y = 1 + (bel - 1) * 0.3; g.position.y = 1.02 * (1 - g.scale.y); } }
    if (o.vest) body(K('vest'));
    if (o.apron) body(K('apron'));
    if (o.tie) body(K('tie'));
    if (o.badge) body(K('badge'));
    for (const [leg, n] of [[this.legL, 'legL'], [this.legR, 'legR']] as const) { const x = K(n); if (x) leg.add(x); }
    for (const [arm, n] of [[this.armL, 'armL'], [this.armR, 'armR']] as const) { const x = K(n); if (x) arm.add(x); }
    this.head.add(K('head')!);
    const top = (n: string) => { const x = K(n); if (x) { x.position.y = 0.36; this.head.add(x); } return x; };
    if (o.hair) top('hair_0');
    if (o.beard) top('beard_0');
    if (o.mustache) top('mustache_0');
    if (o.hat && o.hat !== 'none') {
      const hat = GLB_HATS[o.hat] ? K(GLB_HATS[o.hat]!) : buildHat(o.hat, o.hatColor ?? '#c62828', 0.22 * 1.05);
      if (hat) { hat.position.y = 0.36; hat.rotation.x = -0.05; this.head.add(hat); }
    }
  }
  private kit = false;

  eat() { this.eatT = 1.3; }
  slap() { this.slapT = 0.45; }
  wave() { this.waveT = 1.6; }

  dispose() { Character.all.delete(this); this.root.removeFromParent(); }

  update(dt: number) {
    const a = this.anim;
    this.t += dt;
    const t = this.t;
    const bean = this.o.kind === 'bean';

    // blink
    this.blinkT -= dt;
    const closed = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = closed ? 0.1 : 1;

    // walk cycle
    const walking = !a.seated && a.walk > 0.3;
    const stride = Math.min(1, a.walk / 4);
    this.walkPhase += dt * (walking ? 4 + a.walk * 1.6 : 0);
    const sw = walking ? Math.sin(this.walkPhase) : 0;
    const lerp = (cur: number, to: number, k = 12) => cur + (to - cur) * Math.min(1, dt * k);

    // legs / feet
    if (bean) {
      for (const [leg, s] of [[this.legL, 1], [this.legR, -1]] as const) {
        if (a.seated) { leg.position.z = lerp(leg.position.z, -0.32); leg.position.y = lerp(leg.position.y, 0.32); }
        else {
          leg.position.z = lerp(leg.position.z, s * sw * 0.2 * stride, 20);
          leg.position.y = lerp(leg.position.y, walking ? Math.max(0, s * Math.cos(this.walkPhase)) * 0.09 * stride : 0, 20);
        }
      }
      this.body.position.y = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.05 * stride : 0;
      this.body.rotation.z = walking ? sw * 0.06 * stride : lerp(this.body.rotation.z, 0);
    } else {
      for (const [leg, s] of [[this.legL, 1], [this.legR, -1]] as const) leg.rotation.x = lerp(leg.rotation.x, a.seated ? Math.PI / 2 : s * sw * 0.55 * stride, 15);
      this.body.position.y = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.03 : 0;
    }

    // breathing + idle head motion
    const breathe = 1 + Math.sin(t * 1.9) * 0.012;
    this.torso.scale.y = (this.o.kind === 'human' ? 1 : 1) * breathe;
    this.head.position.y = this.headBaseY + (breathe - 1) * 0.6;
    if (this.o.npc) this.head.rotation.y = Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1) * 0.45;
    this.head.rotation.x = lerp(this.head.rotation.x, bean ? a.aim * 0.35 : a.aim * 0.7);

    // arms: pick a target (x = swing forward, z = out to the side) per arm
    let lx = -sw * 0.5 * stride, lz = -0.12, rx = sw * 0.5 * stride, rz = 0.12;
    switch (this.pose) {
      case 'read': lx = rx = 1.15; lz = 0.35; rz = -0.35; break;
      case 'cross': lx = rx = 1.35; lz = 0.95; rz = -0.95; break;
      case 'hips': lx = rx = -0.25; lz = -0.75; rz = 0.75; break;
      case 'notepad': lx = 1.0; lz = 0.3; rx = 1.1 + Math.sin(t * 9) * 0.06; rz = -0.25; break;
      case 'wipe': rx = 0.95; rz = -0.2 + Math.sin(t * 4) * 0.35; break;
      case 'wave': rx = Math.PI * 0.95; rz = 0.3 + Math.sin(t * 8) * 0.3; break;
      case 'idle': if (!walking) { lx = Math.sin(t * 0.9) * 0.04; rx = -lx; } break;
    }
    if (a.hold) { rx = 1.25 + a.aim * 0.8; rz = 0; }
    if (a.seated && !a.hold) { lx = rx = 0.9; lz = 0.1; rz = -0.1; } // hands on the lap / wheel
    switch (this.pose) {
      case 'eat': if (this.eatT <= 0 && Math.sin(t * 0.7) > 0.97) this.eatT = 1.3; break;
      case 'sleep': lx = rx = 1.4; lz = 0.4; rz = -0.4; this.body.rotation.x = lerp(this.body.rotation.x, -0.55, 3); this.head.rotation.x = 0.5; break;
      case 'kick': this.legL.rotation.x = Math.PI / 2 + Math.sin(t * 7) * 0.45; this.legR.rotation.x = Math.PI / 2 + Math.sin(t * 7 + 2) * 0.35; break;
      case 'slots': rx = 1.2 + Math.max(0, Math.sin(t * 1.4)) * 0.9; rz = -0.3; lx = 0.9; break;
      case 'sing': lx = 2.4; lz = 0.2; rx = Math.PI * 0.8; rz = 0.4 + Math.sin(t * 3) * 0.4; this.body.rotation.z = Math.sin(t * 4) * 0.08; a.talk = 0.7; break;
    }
    if (this.eatT > 0) {
      this.eatT -= dt;
      rx = 2.5; rz = -0.55; // hand to mouth
    }
    if (this.slapT > 0) { this.slapT -= dt; rx = 1.4; rz = -1.2 + (0.45 - this.slapT) * 6; }
    if (this.waveT > 0) { this.waveT -= dt; rx = Math.PI * 0.95; rz = 0.3 + Math.sin(t * 9) * 0.35; }
    this.armL.rotation.x = lerp(this.armL.rotation.x, lx);
    this.armL.rotation.z = lerp(this.armL.rotation.z, lz);
    this.armR.rotation.x = lerp(this.armR.rotation.x, rx, 16);
    this.armR.rotation.z = lerp(this.armR.rotation.z, rz, 16);
    // keep held things roughly upright
    this.hand.rotation.x = -this.armR.rotation.x;

    // mouth: open while eating or talking, smile otherwise
    const chomp = this.eatT > 0 ? Math.abs(Math.sin(t * 14)) : 0;
    const open = Math.max(chomp, a.talk > 0.05 ? a.talk * (0.5 + 0.5 * Math.abs(Math.sin(t * 17))) : 0);
    this.mouth.visible = open > 0.05;
    this.smile.visible = !this.mouth.visible;
    this.mouth.scale.y = 0.2 + open;
  }
}

/** Interaction ids on every mesh. */
export function tagAll(o: THREE.Object3D, iid: string) { o.traverse((c) => { c.userData.iid = iid; }); }
