// Remote player "bean" avatar. Parented to the RV body when the player is inside.
import * as THREE from 'three';
import { PLAYER_COLORS } from '../config';
import { Character, type Hat } from '../models/Character';
import type { RVModel } from '../rv/RV';
import type { Pose } from '../types';

/** Per-player look until cosmetics land (Phase 7). */
const HATS: [Hat, string][] = [['cap', '#fafafa'], ['cowboy', '#8d6e63'], ['beanie', '#ffca28'], ['bucket', '#7cb342']];

function nameTag(name: string, color: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(8, 8, 240, 48, 20); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(34, 32, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 28px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name.slice(0, 14), 140, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.8, 0.2, 1); s.renderOrder = 10;
  return s;
}

export class Avatar {
  readonly group = new THREE.Group();
  /** Held items attach here. */
  readonly hand: THREE.Group;
  readonly char: Character;
  private aim = new THREE.Object3D();
  private tag: THREE.Sprite;
  private target: Pose | null = null;
  private inRV: boolean | null = null;
  private last = new THREE.Vector3();

  constructor(readonly id: number, readonly name: string, private rv: RVModel, private dyn: THREE.Group) {
    const color = '#' + new THREE.Color(PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length]).getHexString();
    const [hat, hatColor] = HATS[(id - 1) % HATS.length];
    this.char = new Character({ kind: 'bean', body: color, hat, hatColor });
    this.hand = this.char.hand;
    this.group.add(this.char.root);
    this.aim.position.y = 1.5; this.group.add(this.aim);
    this.group.traverse((o) => { o.userData.iid = `player:${id}`; });
    this.tag = nameTag(name, color); this.tag.position.y = 2.1; this.group.add(this.tag);
  }

  setPose(p: Pose) { this.target = p; }

  /** World-space nozzle position and aim direction (for the foam spray). */
  nozzle(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.hand.getWorldPosition(pos);
    this.aim.getWorldDirection(dir).negate(); // avatar faces −Z
  }

  update(dt: number) {
    const p = this.target;
    if (!p) return;
    if (p.inRV !== this.inRV) {
      (p.inRV ? this.rv.body : this.dyn).add(this.group);
      this.group.position.set(p.x, p.y, p.z);
      this.last.copy(this.group.position);
      this.inRV = p.inRV;
    }
    const k = Math.min(1, dt * 15);
    const y = p.seat ? p.y - 0.38 : p.y;
    const g = this.group.position;
    g.x += (p.x - g.x) * k;
    g.y += (y - g.y) * k;
    g.z += (p.z - g.z) * k;
    let dy = p.yaw - this.group.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.group.rotation.y += dy * k;
    this.aim.rotation.x = p.pitch;

    // drive the procedural animation from what the pose is doing
    const speed = dt > 0 ? Math.hypot(g.x - this.last.x, g.z - this.last.z) / dt : 0;
    this.last.copy(g);
    const a = this.char.anim;
    a.walk += (speed - a.walk) * Math.min(1, dt * 8);
    a.seated = !!p.seat;
    a.aim = p.pitch;
    a.hold = this.hand.children.length > 0;
    this.char.update(dt);
  }

  dispose() { this.char.dispose(); this.group.removeFromParent(); }
}
