// Remote player "bean" avatar. Parented to the RV body when the player is inside.
import * as THREE from 'three';
import { PLAYER_COLORS } from '../config';
import type { RVModel } from '../rv/RV';
import type { Pose } from '../types';

function nameTag(name: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(8, 8, 240, 48, 20); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(0.8, 0.2, 1); s.renderOrder = 10;
  return s;
}

export class Avatar {
  readonly group = new THREE.Group();
  /** Held items attach here. */
  readonly hand = new THREE.Group();
  private head = new THREE.Group();
  private target: Pose | null = null;
  private inRV: boolean | null = null;

  constructor(readonly id: number, readonly name: string, private rv: RVModel, private dyn: THREE.Group) {
    const color = PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 6, 14), mat);
    body.position.y = 0.68; body.castShadow = true;
    this.group.add(body);
    this.head.position.y = 1.4;
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const black = new THREE.MeshStandardMaterial({ color: '#111111' });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); eye.position.set(s * 0.11, 0, -0.26);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), black); pupil.position.set(s * 0.11, 0, -0.32);
      this.head.add(eye, pupil);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#fafafa' }));
    cap.position.y = 0.2;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.25), new THREE.MeshStandardMaterial({ color }));
    brim.position.set(0, 0.15, -0.3);
    this.head.add(cap, brim);
    this.group.add(this.head);
    // hand: in front of the body, follows head pitch a little
    this.hand.position.set(0.3, -0.35, -0.38);
    this.head.add(this.hand);
    this.group.traverse((o) => { o.userData.iid = `player:${id}`; });
    const tag = nameTag(name); tag.position.y = 1.95; this.group.add(tag);
  }

  setPose(p: Pose) { this.target = p; }

  /** World-space nozzle position and aim direction (for the foam spray). */
  nozzle(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.hand.getWorldPosition(pos);
    this.head.getWorldDirection(dir).negate(); // avatar faces −Z
  }

  update(dt: number) {
    const p = this.target;
    if (!p) return;
    if (p.inRV !== this.inRV) {
      (p.inRV ? this.rv.body : this.dyn).add(this.group);
      this.group.position.set(p.x, p.y, p.z);
      this.inRV = p.inRV;
    }
    const k = Math.min(1, dt * 15);
    const y = p.seat ? p.y - 0.38 : p.y;
    this.group.position.x += (p.x - this.group.position.x) * k;
    this.group.position.y += (y - this.group.position.y) * k;
    this.group.position.z += (p.z - this.group.position.z) * k;
    let dy = p.yaw - this.group.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.group.rotation.y += dy * k;
    this.head.rotation.x += (p.pitch - this.head.rotation.x) * k;
  }

  dispose() { this.group.removeFromParent(); }
}
