// Procedural characters: the crew's "bean" avatars and the human NPCs (Cletus, Roscoe, Flo, …).
// One builder, many looks. Everything faces −Z. Animation is procedural: walk cycle, sitting, holding,
// eating, slapping, a rigged skeleton (shoulder + elbow, hip + knee), blinking eyelids, eye saccades,
// head glances, weight shifts, breathing, a talking mouth, and a few NPC idle poses.
//
// Humans are rigid parts from the Blender kit (public/models/people.glb, art/people.py) on pivots; until the
// kit loads (or if it is missing) a primitive body stands in. The face is built here, not in Blender: eyes,
// lids, brows, mouth, glasses are raycast onto the skin of the head so they sit on the surface whatever the
// head looks like.
import * as THREE from 'three';
import { Assets, tint } from '../core/AssetLoader';

export type Hat = 'none' | 'cap' | 'cowboy' | 'sheriff' | 'beanie' | 'bucket' | 'trucker' | 'party' | 'beehive' | 'hardhat';
export type Pose = 'idle' | 'read' | 'cross' | 'wipe' | 'hips' | 'notepad' | 'wave'
  // seated extras (place the root ~0.38 m below the seat height for humans)
  | 'sit' | 'eat' | 'sleep' | 'kick' | 'slots' | 'sing';
export type Mood = 'neutral' | 'happy' | 'grumpy' | 'worried' | 'sleepy';
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
  hairStyle?: 'short' | 'long';
  beard?: string;
  mustache?: string;
  shades?: boolean;
  glasses?: boolean;
  apron?: string;
  badge?: boolean;
  vest?: string;
  tie?: string;
  /** Long sleeves (default: on when the outfit has a tie or a badge). */
  long?: boolean;
  /** Resting expression: eyebrows, eyelids and the mouth curve. */
  mood?: Mood;
  eyeColor?: string;
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
const EYE_WHITE = mat('#fbfbf4', 0.3);
const PUPIL = mat('#0c0c0e', 0.25);
const MOUTH_IN = mat('#4a1517', 0.6);
const TONGUE = mat('#d9534f', 0.6);
const LIP = mat('#3b1d1a', 0.6);
const LENS = mat('#0d0d10', 0.12, { metalness: 0.5 });
const FRAME = mat('#1a1a1a', 0.35, { metalness: 0.4 });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; return o;
}

/** Cheap deterministic hash of a string → [0, 1). */
function hash01(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; }
const EYE_COLORS = ['#5a3b1e', '#2e6b9e', '#3d7a4a', '#6b4a22', '#4a3a2a'];

// ---- Blender kit (public/models/people.glb, built by art/people.py) ----
const GLB_HATS: Partial<Record<Hat, string>> = { cowboy: 'hat_cowboy', sheriff: 'hat_sheriff', cap: 'hat_cap', trucker: 'hat_trucker', hardhat: 'hat_hardhat', beehive: 'hat_beehive' };
/** Head-local height of the hat band (kit hats are modelled around it). */
const HAT_BAND = 0.35;

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
      for (const s of [-1, 1]) { const curl = mesh(new THREE.BoxGeometry(r * 0.45, 0.03, r * 2.0), m, s * r * 1.5, 0.07, 0); curl.rotation.z = s * 0.45; g.add(curl); }
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

/** A thin cylinder between two points (glasses arms, etc). */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const d = b.clone().sub(a), len = d.length();
  const o = mesh(new THREE.CylinderGeometry(r, r, len, 6), m, 0, 0, 0, false);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}

interface Eye { g: THREE.Group; look: THREE.Group; lid: THREE.Mesh; brow: THREE.Group; side: number }

const lerp = (cur: number, to: number, k: number) => cur + (to - cur) * Math.min(1, k);
// scratch for raycasts
const RAY = new THREE.Raycaster();
const FWD = new THREE.Vector3(0, 0, -1);

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
  // skeleton: shoulder → elbow, hip → knee (humans); beans are single-piece arms with no knees
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private face = new THREE.Group();
  private eyes: Eye[] = [];
  private line!: THREE.Mesh; // closed mouth
  private maw!: THREE.Group; // open mouth
  private torso: THREE.Object3D;
  private torsoBase = new THREE.Vector3(1, 1, 1);
  private surf: THREE.Object3D[] = [];
  private prim: THREE.Object3D[] = []; // primitive body parts, dropped when the kit arrives
  private t = Math.random() * 100;
  private blinkT = 1 + Math.random() * 3;
  private walkPhase = 0;
  private eatT = 0;
  private slapT = 0;
  private waveT = 0;
  private headBaseY: number;
  private readonly bean: boolean;
  private readonly mood: Mood;
  private lookYaw = 0; private lookPitch = 0; // eyes (rad)
  private glanceYaw = 0; private glancePitch = 0; private glanceT = 2 + Math.random() * 3; private saccadeT = 1;
  private shift = 0; private shiftTo = 0; private shiftT = 3 + Math.random() * 4;
  private tapT = 3 + Math.random() * 5;
  private lean = 0;
  private readonly ph = Math.random() * 6.28;
  private faceR: number; // head radius, for the face
  private faceY: number; // face centre height (head-local)
  private topY: number; // hat band height (head-local)
  pose: Pose;
  anim: AnimInput = { walk: 0, seated: false, hold: false, aim: 0, talk: 0 };

  constructor(readonly o: CharOpts) {
    this.pose = o.pose ?? 'idle';
    if (SEATED_POSES.has(this.pose)) this.anim.seated = true;
    const bean = this.bean = o.kind === 'bean';
    this.mood = o.mood ?? 'neutral';
    const skin = o.skin ?? '#e0ac69';
    const bodyM = mat(o.body, bean ? 0.55 : 0.8);
    this.root.add(this.body);

    let shoulder: [number, number];
    let armLen: number;
    const keepPrim = <T extends THREE.Object3D>(parent: THREE.Object3D, c: T): T => { parent.add(c); this.prim.push(c); return c; };

    if (bean) {
      // one smooth bean: lathe profile, wide at the bottom
      const pts = [[0, 0.1], [0.24, 0.11], [0.34, 0.25], [0.37, 0.55], [0.355, 0.95], [0.32, 1.3], [0.27, 1.55], [0.18, 1.71], [0.06, 1.77], [0, 1.775]]
        .map(([x, y]) => new THREE.Vector2(x, y));
      const b = mesh(new THREE.LatheGeometry(pts, 28), bodyM); this.torso = b; this.body.add(b);
      this.surf = [b];
      // belly patch
      const belly = mesh(new THREE.SphereGeometry(0.26, 18, 12), mat(new THREE.Color(o.body).lerp(new THREE.Color('#ffffff'), 0.35).getStyle(), 0.6), 0, 0.62, -0.13, false);
      belly.scale.set(1, 1.25, 0.6); this.body.add(belly);
      this.head.position.set(0, 1.35, 0);
      this.faceR = 0.3; this.faceY = 0.13; this.topY = 0.29;
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
      for (const [leg, shin, s] of [[this.legL, this.shinL, -1], [this.legR, this.shinR, 1]] as const) {
        leg.position.set(s * 0.13 * Math.max(1, bel * 0.9), 0.85, 0);
        shin.position.set(0, -0.42, 0); leg.add(shin);
        keepPrim(leg, mesh(new THREE.CapsuleGeometry(0.115, 0.3, 4, 10), pantsM, 0, -0.21, 0));
        keepPrim(shin, mesh(new THREE.CapsuleGeometry(0.095, 0.26, 4, 10), pantsM, 0, -0.2, 0));
        keepPrim(shin, mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), shoeM, 0, -0.37, -0.06));
        this.root.add(leg);
      }
      const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 16), bodyM, 0, 1.17, 0);
      this.torsoBase.set(bel, 1, bel * 0.8); torso.scale.copy(this.torsoBase); this.torso = torso; this.prim.push(torso); this.body.add(torso);
      if (bel > 1.1) { const gut = mesh(new THREE.SphereGeometry(0.3 * bel, 16, 12), bodyM, 0, 1.0, -0.06 * bel); gut.scale.set(1, 0.9, 0.95); keepPrim(this.body, gut); }
      keepPrim(this.body, mesh(new THREE.BoxGeometry(0.62 * bel, 0.09, 0.5 * bel), pantsM, 0, 0.88, 0)); // belt line
      keepPrim(this.body, mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 10), mat(skin), 0, 1.58, 0)); // neck
      this.head.position.set(0, 1.62, 0);
      const h = mesh(new THREE.SphereGeometry(0.24, 20, 16), mat(skin, 0.7), 0, 0.2, 0); h.scale.set(1, 1.08, 1); keepPrim(this.head, h);
      this.surf = [h];
      for (const s of [-1, 1]) keepPrim(this.head, mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(skin, 0.7), s * 0.235, 0.2, 0.01));
      keepPrim(this.head, mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(new THREE.Color(skin).multiplyScalar(0.92).getStyle(), 0.7), 0, 0.17, -0.25));
      if (o.hair) { const hair = mesh(new THREE.SphereGeometry(0.255, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(o.hair, 0.9), 0, 0.23, 0.03); hair.rotation.x = -0.25; keepPrim(this.head, hair); }
      this.faceR = 0.24; this.faceY = 0.2; this.topY = HAT_BAND;
      shoulder = [0.36 + (bel - 1) * 0.14, 1.5]; armLen = 0.64;
      // clothing details
      if (o.apron) keepPrim(this.body, mesh(new THREE.BoxGeometry(0.46 * bel, 0.75, 0.02), mat(o.apron, 0.8), 0, 1.0, -0.27 * bel - 0.02));
      if (o.vest) for (const s of [-1, 1]) keepPrim(this.body, mesh(new THREE.BoxGeometry(0.2 * bel, 0.55, 0.03), mat(o.vest, 0.8), s * 0.15 * bel, 1.25, -0.25 * bel));
      if (o.tie) keepPrim(this.body, mesh(new THREE.BoxGeometry(0.07, 0.38, 0.02), mat(o.tie, 0.6), 0, 1.3, -0.26 * bel - 0.01));
      if (o.badge) { const st = mesh(new THREE.CircleGeometry(0.07, 5), GOLD, -0.13 * bel, 1.38, -0.25 * bel - 0.02); st.rotation.y = Math.PI; keepPrim(this.body, st); }
    }
    this.headBaseY = this.head.position.y;
    this.body.add(this.head);
    this.head.add(this.face);

    // ---- arms ----
    const handM = bean ? mat(o.glove ?? '#fafafa', 0.6) : mat(skin, 0.7);
    for (const [arm, fore, hand, s] of [[this.armL, this.foreL, this.handL, -1], [this.armR, this.foreR, this.hand, 1]] as const) {
      arm.position.set(s * shoulder[0], shoulder[1], 0);
      if (bean) {
        arm.add(mesh(new THREE.CapsuleGeometry(0.065, armLen * 0.6, 4, 10), bodyM, 0, -armLen * 0.45, 0));
        arm.add(mesh(new THREE.SphereGeometry(0.085, 10, 8), handM, 0, -armLen, 0));
        hand.position.set(0, -armLen - 0.02, 0);
        arm.add(hand);
      } else {
        fore.position.set(0, -0.3, 0); arm.add(fore);
        keepPrim(arm, mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 10), bodyM, 0, -0.15, 0));
        keepPrim(fore, mesh(new THREE.CapsuleGeometry(0.07, 0.15, 4, 10), handM, 0, -0.17, 0));
        keepPrim(fore, mesh(new THREE.SphereGeometry(0.075, 10, 8), handM, 0, -0.34, 0));
        hand.position.set(0, -0.36, 0);
        fore.add(hand);
      }
      arm.rotation.z = s * 0.12;
      arm.rotation.order = 'XZY';
      this.body.add(arm);
    }

    // hat + (primitive) facial hair
    if (!bean) {
      if (o.mustache) for (const s of [-1, 1]) { const m = mesh(new THREE.CapsuleGeometry(0.022, 0.07, 4, 8), mat(o.mustache, 0.9), s * 0.05, 0.12, -0.245, false); m.rotation.z = s * 1.2; keepPrim(this.head, m); }
      if (o.beard) { const b = mesh(new THREE.SphereGeometry(0.2, 14, 10), mat(o.beard, 0.95), 0, 0.06, -0.1); b.scale.set(1.05, 1.0, 0.8); keepPrim(this.head, b); }
    }
    if (o.hat && o.hat !== 'none') {
      const hat = buildHat(o.hat, o.hatColor ?? '#c62828', this.faceR * (bean ? 0.86 : 0.92)); hat.position.y = this.topY; hat.rotation.x = bean ? 0 : -0.05;
      if (bean) this.head.add(hat); else keepPrim(this.head, hat);
    }
    this.buildFace();
    this.root.scale.setScalar(o.height ?? 1);
    if (o.npc) Character.all.add(this);
    // humans swap their primitive body for the Blender kit as soon as it's loaded
    if (!bean) Assets.onReady(() => this.useKit());
  }

  // ---------------------------------------------------------------------------------------------- face
  /** Where a ray along head-local +z at (x, y) first touches the skin: surface point + outward normal (head-local). */
  private snap(x: number, y: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const head = this.head;
    head.updateWorldMatrix(true, true);
    const o = head.localToWorld(new THREE.Vector3(x, y, -1.5));
    const d = new THREE.Vector3(0, 0, 1).transformDirection(head.matrixWorld);
    RAY.set(o, d); RAY.far = 4;
    const hit = RAY.intersectObjects(this.surf, true)[0];
    if (!hit) return { p: new THREE.Vector3(x, y, -this.faceR), n: new THREE.Vector3(0, 0, -1) };
    const inv = new THREE.Matrix4().copy(head.matrixWorld).invert();
    const p = head.worldToLocal(hit.point.clone());
    const n = (hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : d.clone().negate()).transformDirection(inv);
    return { p, n };
  }

  private rebuildFace() {
    this.face.removeFromParent();
    this.face.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.face = new THREE.Group();
    this.head.add(this.face);
    this.buildFace();
  }

  private buildFace() {
    const o = this.o, bean = this.bean;
    this.root.updateWorldMatrix(true, true);
    this.eyes = [];
    const skinCol = bean ? o.body : (o.skin ?? '#e0ac69');
    const skinM = mat(skinCol, bean ? 0.55 : 0.7);
    const ex = bean ? 0.115 : 0.088, ey = bean ? this.faceY + 0.06 : 0.262;
    const er = bean ? 0.068 : 0.046;
    const irisCol = o.eyeColor ?? EYE_COLORS[Math.floor(hash01(o.body + (o.hair ?? '') + (o.hat ?? '')) * EYE_COLORS.length)];
    const irisM = mat(irisCol, 0.35);
    const mood = this.mood;
    const browCol = bean ? '#1b1b1b' : (o.hair || o.beard || o.mustache || new THREE.Color(skinCol).multiplyScalar(0.45).getStyle());
    const browM = mat(browCol, 0.9);
    // rest openness of the lids (lid angle: 1.45 = fully open, 0 = half shut, −1.5 = closed) and brow tilt
    const lidOpen = { neutral: 0.6, happy: 0.75, grumpy: 0.15, worried: 0.9, sleepy: -0.25 }[mood];
    const tilt = { neutral: 0, happy: -0.12, grumpy: 0.42, worried: -0.38, sleepy: 0.08 }[mood];
    const browLift = { neutral: 0, happy: 0.008, grumpy: -0.01, worried: 0.012, sleepy: -0.004 }[mood];

    for (const s of [-1, 1]) {
      const { p, n } = this.snap(s * ex, ey);
      const g = new THREE.Group();
      g.position.copy(p).addScaledVector(n, -er * 0.4);
      g.quaternion.setFromUnitVectors(FWD, n);
      const white = mesh(new THREE.SphereGeometry(er, 14, 10), EYE_WHITE, 0, 0, 0, false); white.scale.set(1, 1.1, 0.95);
      g.add(white);
      const look = new THREE.Group(); g.add(look);
      const iris = mesh(new THREE.SphereGeometry(er * 0.68, 12, 8), irisM, 0, 0, -er * 0.52, false); iris.scale.z = 0.55; look.add(iris);
      const pupil = mesh(new THREE.SphereGeometry(er * 0.4, 10, 8), PUPIL, 0, 0, -er * 0.85, false); pupil.scale.z = 0.4; look.add(pupil);
      look.add(mesh(new THREE.SphereGeometry(er * 0.13, 6, 4), WHITE, er * 0.2, er * 0.22, -er * 1.0, false));
      const lid = mesh(new THREE.SphereGeometry(er * 1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), skinM, 0, 0, 0, false);
      lid.rotation.x = lidOpen; g.add(lid);
      this.face.add(g);
      // brow: a capsule above the eye, tilted by mood (inner end down = grumpy)
      const bp = this.snap(s * ex, ey + (bean ? er * 1.5 : 0.062));
      const bg = new THREE.Group();
      bg.position.copy(bp.p).addScaledVector(bp.n, bean ? 0.012 : 0.008);
      bg.quaternion.setFromUnitVectors(FWD, bp.n);
      const brow = mesh(new THREE.CapsuleGeometry(bean ? 0.012 : 0.015, bean ? 0.07 : 0.075, 3, 6).rotateZ(Math.PI / 2), browM, 0, 0, 0, false);
      brow.rotation.z = s * tilt; brow.position.y = browLift; brow.userData.base = [s * tilt, browLift];
      bg.add(brow); this.face.add(bg);
      this.eyes.push({ g, look, lid, brow: bg, side: s });
      if (bean) {
        const c = this.snap(s * 0.2, this.faceY - 0.04);
        const cheek = mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#ff8a80', 0.8), 0, 0, 0, false); cheek.scale.set(1, 0.8, 0.3);
        cheek.position.copy(c.p).addScaledVector(c.n, 0.004); cheek.quaternion.setFromUnitVectors(FWD, c.n); this.face.add(cheek);
      }
    }

    // mouth: a line that follows the face surface, and an open mouth (cavity, teeth, tongue)
    const my = bean ? this.faceY - 0.085 : 0.088;
    const mw = bean ? 0.06 : 0.052;
    const curve = { neutral: 0.012, happy: 0.026, grumpy: -0.016, worried: -0.006, sleepy: 0.0 }[mood] * (bean ? 1.2 : 1);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 3 - 1; // −1..1
      const sp = this.snap(u * mw, my + curve * u * u);
      pts.push(sp.p.addScaledVector(sp.n, 0.004));
    }
    this.line = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, bean ? 0.0095 : 0.008, 5, false), LIP, 0, 0, 0, false);
    this.face.add(this.line);
    const m = this.snap(0, my);
    this.maw = new THREE.Group();
    this.maw.position.copy(m.p).addScaledVector(m.n, 0.002); this.maw.quaternion.setFromUnitVectors(FWD, m.n);
    const cav = mesh(new THREE.SphereGeometry(1, 12, 8), MOUTH_IN, 0, 0, 0, false); cav.scale.set(mw * 0.9, 0.02, 0.012); cav.name = 'cav';
    const teeth = mesh(new THREE.BoxGeometry(mw * 1.2, 0.012, 0.006), WHITE, 0, 0.0, -0.011, false); teeth.name = 'teeth';
    const tongue = mesh(new THREE.SphereGeometry(1, 8, 6), TONGUE, 0, 0, -0.004, false); tongue.scale.set(mw * 0.45, 0.01, 0.006); tongue.name = 'tongue';
    this.maw.add(cav, teeth, tongue); this.maw.visible = false; this.face.add(this.maw);

    // eyewear sits in front of the eyes
    if (o.shades || o.glasses) {
      const lens: THREE.Vector3[] = [];
      for (const s of [-1, 1]) {
        const { p, n } = this.snap(s * ex, ey);
        const c = p.clone().addScaledVector(n, o.shades ? er * 0.92 : er * 1.15);
        lens.push(c);
        const q = new THREE.Quaternion().setFromUnitVectors(FWD, n);
        if (o.shades) {
          const l = mesh(new THREE.SphereGeometry(er * 1.45, 14, 10), LENS, 0, 0, 0, false); l.scale.set(1.12, 0.92, 0.38);
          l.position.copy(c); l.quaternion.copy(q);
          const rim = mesh(new THREE.TorusGeometry(er * 1.42, 0.006, 5, 18), FRAME, 0, 0, 0, false); rim.scale.set(1.12, 0.92, 1);
          rim.position.copy(c); rim.quaternion.copy(q);
          const shine = mesh(new THREE.BoxGeometry(er * 0.18, er * 1.2, 0.002), mat('#ffffff', 0.2, { transparent: true, opacity: 0.55 }), -s * er * 0.35, er * 0.15, -er * 0.4, false);
          shine.rotation.z = 0.5; l.add(shine);
          this.face.add(l, rim);
        } else {
          const rim = mesh(new THREE.TorusGeometry(er * 1.35, 0.0075, 6, 20), FRAME, 0, 0, 0, false);
          rim.position.copy(c); rim.quaternion.copy(q); this.face.add(rim);
        }
      }
      // bridge + arms to the ears
      this.face.add(bar(lens[0].clone().add(new THREE.Vector3(er * 1.3, 0, 0)), lens[1].clone().add(new THREE.Vector3(-er * 1.3, 0, 0)), 0.006, FRAME));
      for (const [i, s] of [[0, -1], [1, 1]] as const) {
        const a = lens[i].clone().add(new THREE.Vector3(s * er * 1.4, 0, 0.0));
        this.face.add(bar(a, new THREE.Vector3(s * (bean ? 0.29 : 0.245), this.faceY + 0.02, bean ? -0.02 : 0.0), 0.006, FRAME));
      }
    }
  }

  /** Replace the primitive human body/head/arms/hat with people.glb parts. */
  private useKit() {
    if (!Assets.has('people') || this.kit) return;
    const P = (n: string) => Assets.node('people', n);
    if (!P('torso') || !P('head')) return;
    this.kit = true;
    const o = this.o, bel = o.belly ?? 1;
    const colors: Record<string, string | undefined> = {
      skin: o.skin ?? '#e0ac69', shirt: o.body, pants: o.pants ?? '#3e4a5a', shoes: o.shoes ?? '#3e2723',
      hair: o.hair || '#5d4037', beard: o.beard ?? o.mustache ?? '#eeeeee', must: o.mustache ?? o.beard ?? '#eeeeee',
      hat: o.hatColor ?? '#c62828', vest: o.vest, apron: o.apron, tie: o.tie,
    };
    const K = (n: string) => { const x = P(n); return x ? tint(x, colors) : null; };
    this.prim.forEach((c) => c.removeFromParent());
    this.prim = [];

    const wide = 1 + (bel - 1) * 0.35;
    this.torsoBase.set(wide, 1, wide * 0.92);
    const place = (x: THREE.Object3D | null, scale = true) => { if (x) { if (scale) x.scale.copy(this.torsoBase); this.body.add(x); } return x; };
    this.torso = place(K('torso'))!;
    if (bel > 1.1) { const g = K('gut'); if (g) { const sy = 1 + (bel - 1) * 0.3; g.scale.set(0.5 + bel * 0.42, sy, 0.45 + bel * 0.4); g.position.y = 1.0 * (1 - sy); this.body.add(g); } }
    for (const [on, n] of [[o.vest, 'vest'], [o.apron, 'apron'], [o.tie, 'tie'], [o.badge, 'badge']] as const) if (on) place(K(n));
    for (const [leg, shin, s] of [[this.legL, this.shinL, 'L'], [this.legR, this.shinR, 'R']] as const) {
      const a = K('leg' + s), b = K('leg' + s + '_lo');
      if (a) leg.add(a);
      if (b) shin.add(b);
    }
    const longSleeves = o.long ?? !!(o.tie || o.badge);
    for (const [arm, fore, s] of [[this.armL, this.foreL, 'L'], [this.armR, this.foreR, 'R']] as const) {
      const a = K('arm' + s), b = K('arm' + s + '_lo');
      if (a) arm.add(a);
      if (b) fore.add(b);
      if (longSleeves) { const su = K('arm' + s + '_su'), sl = K('arm' + s + '_sl'); if (su) arm.add(su); if (sl) fore.add(sl); }
    }
    const head = K('head')!;
    this.head.add(head);
    this.surf = [head];
    const top = (n: string) => { const x = K(n); if (x) { x.position.y = HAT_BAND; this.head.add(x); } return x; };
    if (o.hair) top(o.hairStyle === 'long' ? 'hair_1' : 'hair_0');
    if (o.beard) top('beard_0');
    if (o.mustache) top('mustache_0');
    if (o.hat && o.hat !== 'none') {
      const hat = GLB_HATS[o.hat] ? K(GLB_HATS[o.hat]!) : buildHat(o.hat, o.hatColor ?? '#c62828', 0.215);
      if (hat) { hat.position.y = HAT_BAND; hat.rotation.x = -0.05; this.head.add(hat); }
    }
    this.rebuildFace();
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
    const bean = this.bean;
    const human = !bean;
    const k = (r: number) => Math.min(1, dt * r);

    // ---- walk cycle ----
    const walking = !a.seated && a.walk > 0.3;
    const stride = Math.min(1, a.walk / 4);
    this.walkPhase += dt * (walking ? 4 + a.walk * 1.6 : 0);
    const sw = walking ? Math.sin(this.walkPhase) : 0;
    const cw = walking ? Math.cos(this.walkPhase) : 0;
    const idle = !walking && !a.seated;

    // ---- weight shift + foot tap (standing idle) ----
    this.shiftT -= dt;
    if (this.shiftT < 0) { this.shiftTo = this.shiftTo > 0.3 ? -1 : this.shiftTo < -0.3 ? 1 : (Math.random() < 0.5 ? -1 : 1); this.shiftT = 4 + Math.random() * 6; }
    this.shift = lerp(this.shift, idle && this.o.npc ? this.shiftTo : 0, k(1.6));
    this.tapT -= dt;
    const tapping = this.tapT < 0 && (this.pose === 'cross' || this.pose === 'hips' || this.pose === 'wipe');
    if (this.tapT < -1.4) this.tapT = 4 + Math.random() * 6;
    const tap = tapping ? Math.max(0, Math.sin(t * 11)) * 0.2 : 0;

    // ---- legs ----
    if (bean) {
      for (const [leg, s] of [[this.legL, 1], [this.legR, -1]] as const) {
        if (a.seated) { leg.position.z = lerp(leg.position.z, -0.32, k(12)); leg.position.y = lerp(leg.position.y, 0.32, k(12)); }
        else {
          leg.position.z = lerp(leg.position.z, s * sw * 0.2 * stride, k(20));
          leg.position.y = lerp(leg.position.y, walking ? Math.max(0, s * Math.cos(this.walkPhase)) * 0.09 * stride : 0, k(20));
        }
      }
      this.body.position.y = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.05 * stride : 0;
      this.body.rotation.z = walking ? sw * 0.06 * stride : lerp(this.body.rotation.z, 0, k(12));
    } else {
      for (const [leg, shin, s, side] of [[this.legL, this.shinL, 1, -1], [this.legR, this.shinR, -1, 1]] as const) {
        let hip = 0, knee = 0, spread = 0;
        if (a.seated) {
          hip = Math.PI / 2 - 0.05; knee = -Math.PI / 2 + 0.1;
          if (this.pose === 'kick') { hip = Math.PI / 2 - 0.2; knee = -1.0 - (0.5 + Math.sin(t * 7 + (side > 0 ? 2 : 0)) * 0.5) * 0.7; }
          spread = side * 0.05;
        } else if (walking) {
          hip = s * sw * 0.62 * stride;
          knee = -(0.06 + 0.8 * Math.max(0, s * cw) * stride);
          spread = side * 0.03;
        } else {
          // standing: relax the leg that isn't taking the weight, tap a foot now and then
          const rest = side * this.shift; // >0 = this leg is the relaxed one
          knee = -0.02 - Math.max(0, rest) * 0.14; hip = Math.max(0, rest) * 0.1;
          spread = side * (0.035 + (this.pose === 'hips' || this.pose === 'cross' ? 0.04 : 0));
          if (side > 0) { knee -= tap * 0.5; hip += tap * 0.2; }
        }
        leg.rotation.x = lerp(leg.rotation.x, hip, k(15));
        leg.rotation.z = lerp(leg.rotation.z, spread, k(10));
        shin.rotation.x = lerp(shin.rotation.x, knee, k(15));
      }
      this.body.position.y = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.035 : 0;
      this.body.position.x = lerp(this.body.position.x, this.shift * 0.022, k(6));
      this.body.rotation.z = walking ? sw * 0.04 * stride : lerp(this.body.rotation.z, -this.shift * 0.025, k(6));
      this.body.rotation.y = walking ? -sw * 0.08 * stride : lerp(this.body.rotation.y, 0, k(6));
    }

    // ---- breathing ----
    const breathe = Math.sin(t * 1.9 + this.ph);
    this.torso.scale.set(this.torsoBase.x * (1 + breathe * 0.008), this.torsoBase.y * (1 + breathe * 0.014), this.torsoBase.z * (1 + breathe * 0.012));
    this.head.position.y = this.headBaseY + breathe * 0.004;

    // ---- eye saccades + head glances (NPCs); beans only blink ----
    this.saccadeT -= dt; this.glanceT -= dt;
    if (this.saccadeT < 0) { this.saccadeT = 0.6 + Math.random() * 2.4; this.lookYaw = (Math.random() - 0.5) * 0.7; this.lookPitch = (Math.random() - 0.5) * 0.3; }
    if (this.glanceT < 0) {
      const away = Math.random() < 0.6;
      this.glanceYaw = away ? (Math.random() - 0.5) * 1.3 : 0; this.glancePitch = away ? (Math.random() - 0.5) * 0.3 : 0;
      this.glanceT = away ? 1.2 + Math.random() * 2 : 3 + Math.random() * 4;
      if (away) { this.lookYaw = this.glanceYaw * 0.6; this.saccadeT = this.glanceT; }
    }
    let headYaw = 0, headPitch = bean ? a.aim * 0.35 : a.aim * 0.7;
    let eyeYaw = 0, eyePitch = 0;
    if (this.o.npc) { headYaw = this.glanceYaw; headPitch += this.glancePitch; eyeYaw = this.lookYaw - headYaw * 0.4; eyePitch = this.lookPitch; }
    else { eyeYaw = Math.sin(t * 0.7) * 0.15; eyePitch = Math.sin(t * 0.5) * 0.05; }
    let lidShut = 0; // 0 = rest, 1 = closed
    let browUp = 0;

    // ---- arms: shoulder raise (x), abduct (z) and twist (y, inward = + on the right arm) + elbow flex per arm ----
    // Euler order XZY: twist the arm about its own axis first, so the elbow can fold across the body.
    const nat = 0.16;
    let lx = -sw * 0.5 * stride, lz = -0.1, le = nat + Math.max(0, -sw) * 0.5 * stride, ly = 0;
    let rx = sw * 0.5 * stride, rz = 0.1, re = nat + Math.max(0, sw) * 0.5 * stride, ry = 0;
    const npc = !!this.o.npc;
    switch (this.pose) {
      case 'read': {
        const b = Math.sin(t * 0.6) * 0.03;
        lx = rx = 0.8; lz = -0.05; rz = 0.05; ly = -0.55; ry = 0.55; le = re = 1.15 + b;
        headPitch -= 0.38; eyePitch = -0.3; eyeYaw = Math.sin(t * 0.8) * 0.35; // eyes sweep the page
        if (Math.sin(t * 0.37) > 0.93) { headPitch += 0.3; eyePitch = 0.1; eyeYaw = 0; } // glances over the paper
        break;
      }
      case 'cross': lx = 0.62; rx = 0.42; lz = rz = 0; ly = -1.35; ry = 1.35; le = re = 1.65; break;
      case 'hips': lx = rx = -0.1; lz = -0.5; rz = 0.5; ly = -0.9; ry = 0.9; le = re = 1.35; break;
      case 'notepad': {
        const wr = this.pose === 'notepad' && Math.sin(t * 0.5) > 0.3; // writing
        lx = 0.85; lz = -0.05; ly = -0.6; le = 1.3; rx = 0.75; rz = 0.05; ry = 0.55; re = 1.25 + (wr ? Math.sin(t * 9) * 0.07 : 0);
        if (wr) { headPitch -= 0.25; eyePitch = -0.3; eyeYaw = 0; }
        break;
      }
      case 'wipe': rx = 0.85; rz = 0.1; ry = 0.4; re = 0.95 + Math.sin(t * 4) * 0.4; lx = -0.1; lz = -0.5; ly = -0.9; le = 1.35; this.body.rotation.x = lerp(this.body.rotation.x, -0.1 - Math.sin(t * 4) * 0.03, k(6)); headPitch -= 0.25; eyePitch = -0.2; eyeYaw = 0; break;
      case 'wave': rx = Math.PI * 0.8; rz = 0.35; re = 0.5 + Math.sin(t * 8) * 0.55; break;
      case 'idle': if (!walking) { lx = Math.sin(t * 0.9) * 0.05; rx = -lx; if (npc && Math.sin(t * 0.21 + 1) > 0.97) { rx = 0.95; ry = 0.6; re = 2.0; } } break;
    }
    if (a.hold) { rx = 1.05 + a.aim * 0.8; rz = 0; ry = 0.3; re = 0.55; }
    if (a.seated && !a.hold) { lx = rx = 0.55; lz = -0.05; rz = 0.05; ly = -0.6; ry = 0.6; le = re = 1.2; } // hands on the lap / wheel
    switch (this.pose) {
      case 'eat': if (this.eatT <= 0 && Math.sin(t * 0.7) > 0.97) this.eatT = 1.3; lx = 0.7; le = 1.2; rx = 0.7; re = 1.2; break;
      case 'sleep': lx = rx = 0.6; ly = -0.7; ry = 0.7; le = re = 1.4; this.lean = lerp(this.lean, -(0.5 + breathe * 0.02), k(3)); headPitch = -0.3; lidShut = 1; break;
      case 'kick': lx = 0.3; le = 1.0; rx = 0.4; re = 1.2; break;
      case 'slots': { const pull = Math.max(0, Math.sin(t * 1.4)); rx = 0.9 + pull * 0.9; re = 0.35 + pull * 0.2; rz = 0.15; ry = 0.3; lx = 0.7; ly = -0.6; le = 1.1; headPitch -= 0.1; break; }
      case 'sing': lx = 2.6; lz = -0.35; le = 0.4; rx = Math.PI * 0.76; rz = 0.5 + Math.sin(t * 3) * 0.3; re = 0.5 + Math.sin(t * 6) * 0.3; this.body.rotation.z = Math.sin(t * 4) * 0.08; a.talk = 0.7; eyePitch = 0.1; browUp = 1; break;
    }
    if (this.pose === 'sleep') {
      // slump forward about the hips (not the feet)
      this.body.rotation.x = this.lean; this.body.position.y = 0.85 * (1 - Math.cos(this.lean)); this.body.position.z = -0.85 * Math.sin(this.lean);
    } else { this.body.position.z = 0; if (this.pose !== 'wipe' && human) this.body.rotation.x = lerp(this.body.rotation.x, 0, k(6)); }
    // the free hand talks along
    if (human && a.talk > 0.05 && !a.hold && (this.pose === 'idle' || this.pose === 'hips' || this.pose === 'sit' || this.pose === 'notepad')) {
      lx = 0.5 + Math.sin(t * 2.7) * 0.25; le = 1.0 + Math.sin(t * 3.3) * 0.3; lz = -0.1; ly = -0.4;
    }
    if (this.eatT > 0) {
      this.eatT -= dt;
      rx = 0.95; ry = 0.5; re = 1.95 + Math.sin(t * 14) * 0.05; rz = 0; // hand to mouth
      headPitch -= 0.06 + Math.sin(t * 14) * 0.04;
    }
    if (this.slapT > 0) { this.slapT -= dt; rx = 1.4; rz = -1.2 + (0.45 - this.slapT) * 6; re = 0.3; }
    if (this.waveT > 0) { this.waveT -= dt; rx = Math.PI * 0.8; rz = 0.35; re = 0.5 + Math.sin(t * 9) * 0.55; }
    if (bean) { // single-piece arms
      lx = -sw * 0.5 * stride; lz = -0.12; rx = sw * 0.5 * stride; rz = 0.12;
      if (a.hold) { rx = 1.25 + a.aim * 0.8; rz = 0; }
      if (a.seated && !a.hold) { lx = rx = 0.9; lz = 0.1; rz = -0.1; }
      if (this.eatT > 0) { rx = 2.5; rz = -0.55; }
      if (this.slapT > 0) { rx = 1.4; rz = -1.2 + (0.45 - this.slapT) * 6; }
      if (this.waveT > 0) { rx = Math.PI * 0.95; rz = 0.3 + Math.sin(t * 9) * 0.35; }
    }
    this.armL.rotation.x = lerp(this.armL.rotation.x, lx, k(12));
    this.armL.rotation.z = lerp(this.armL.rotation.z, lz, k(12));
    this.armL.rotation.y = lerp(this.armL.rotation.y, ly, k(12));
    this.armR.rotation.x = lerp(this.armR.rotation.x, rx, k(16));
    this.armR.rotation.z = lerp(this.armR.rotation.z, rz, k(16));
    this.armR.rotation.y = lerp(this.armR.rotation.y, ry, k(16));
    if (human) {
      this.foreL.rotation.x = lerp(this.foreL.rotation.x, le, k(12));
      this.foreR.rotation.x = lerp(this.foreR.rotation.x, re, k(16));
      // keep held things roughly upright
      this.hand.rotation.x = -(this.armR.rotation.x + this.foreR.rotation.x) * 0.9;
    } else this.hand.rotation.x = -this.armR.rotation.x;

    // ---- head ----
    if (this.pose === 'sing') { headYaw = Math.sin(t * 1.3) * 0.25; headPitch += 0.12 + Math.sin(t * 2.6) * 0.05; }
    const talk = a.talk > 0.05 ? a.talk : 0;
    if (talk && human) { headPitch += Math.sin(t * 8.5) * 0.035 * talk; headYaw += Math.sin(t * 2.1) * 0.08 * talk; browUp = Math.max(browUp, Math.max(0, Math.sin(t * 3.3)) * talk); }
    this.head.rotation.y = lerp(this.head.rotation.y, headYaw, k(3.5));
    this.head.rotation.x = lerp(this.head.rotation.x, headPitch, k(8));

    // ---- blink / lids ----
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = Math.random() < 0.18 ? 0.35 : 2 + Math.random() * 4;
    const blink = this.blinkT < 0.14 ? Math.sin(Math.PI * (1 - this.blinkT / 0.14)) : 0;
    const closed = Math.max(blink, lidShut);
    const lidRest = ({ neutral: 0.6, happy: 0.75, grumpy: 0.15, worried: 0.9, sleepy: -0.25 })[this.mood];
    for (const e of this.eyes) {
      e.lid.rotation.x = lidRest + (-1.55 - lidRest) * closed;
      e.look.rotation.set(eyePitch * 0.9, eyeYaw * 0.9, 0);
      const br = e.brow.children[0] as THREE.Mesh;
      const base = br.userData.base as [number, number];
      br.position.y = base[1] + browUp * 0.014 + (this.mood === 'grumpy' ? Math.sin(t * 0.7) * 0.001 : 0) - closed * 0.004;
      br.rotation.z = base[0] + e.side * (browUp * -0.14);
    }

    // ---- mouth: open while eating, talking or singing; a line otherwise ----
    const chomp = this.eatT > 0 ? Math.abs(Math.sin(t * 14)) * 0.8 : 0;
    const snore = this.pose === 'sleep' ? 0.25 + Math.max(0, Math.sin(t * 1.9)) * 0.4 : 0;
    const open = Math.max(chomp, snore, talk > 0.05 ? talk * (0.45 + 0.55 * Math.abs(Math.sin(t * 17))) : 0);
    this.maw.visible = open > 0.05;
    this.line.visible = !this.maw.visible;
    if (this.maw.visible) {
      const h = 0.006 + open * (bean ? 0.045 : 0.036);
      const cav = this.maw.getObjectByName('cav')!; cav.scale.y = h;
      const teeth = this.maw.getObjectByName('teeth')!; teeth.position.y = h * 0.78; teeth.visible = open > 0.2;
      const tongue = this.maw.getObjectByName('tongue')!; tongue.position.y = -h * 0.55; tongue.visible = open > 0.3;
    }
  }
}

/** Interaction ids on every mesh. */
export function tagAll(o: THREE.Object3D, iid: string) { o.traverse((c) => { c.userData.iid = iid; }); }
