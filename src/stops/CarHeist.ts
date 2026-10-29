// Client-side car-crime minigames, drawn as small 3D gizmos floating in front of the camera.
//  Siphon — "Suck & Pinch": hold LMB to suck gas up a clear hose, release while it's in the green band.
//  Strip  — "Wrench Timing": click when the sweeping pointer is inside the green arc, once per bolt.
// The result ('ok' / 'fail') goes to the host as `rusty:car<N>:<result>`.
import * as THREE from 'three';
import type { Input } from '../core/Input';

type Res = 'ok' | 'fail' | 'cancel' | null;

/** bolts, arc width (rad), pointer speed (rad/s) per part */
const PARTS: Record<string, [number, number, number]> = { battery: [2, 1.55, 2.6], wheel: [4, 1.15, 3.4], cat: [3, 0.75, 4.4] };
const BAND: [number, number] = [0.64, 0.88];

const mat = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });

export class CarHeist {
  car = -1;
  kind: 'siphon' | 'strip' | null = null;
  private g = new THREE.Group();
  private t = 0;
  private at = new THREE.Vector3();
  // siphon
  private level = 0;
  private tries = 0;
  private gas!: THREE.Mesh;
  // strip
  private ang = 0;
  private arcAt = 0;
  private bolt = 0;
  private spec: [number, number, number] = [2, 1, 3];
  private arc!: THREE.Mesh;
  private pointer!: THREE.Object3D;
  private dots: THREE.Mesh[] = [];

  constructor(camera: THREE.Camera, private sfx: (n: string) => void) {
    this.g.position.set(0, -0.05, -0.55);
    this.g.visible = false;
    this.g.renderOrder = 999;
    camera.add(this.g);
  }

  get active() { return this.kind !== null; }

  /** Begin a minigame; `part` = the part being stripped, `alarm` = narrower windows. */
  start(kind: 'siphon' | 'strip', car: number, at: THREE.Vector3, part = 'battery', alarm = false) {
    this.kind = kind; this.car = car; this.t = 0; this.at.copy(at);
    this.g.clear(); this.g.visible = true;
    if (kind === 'siphon') {
      this.level = 0; this.tries = 0;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 12, 1, true), mat('#e0f7fa', 0.35));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.3 * (BAND[1] - BAND[0]), 12, 1, true), mat('#00e676', 0.55));
      band.position.y = -0.15 + 0.3 * (BAND[0] + BAND[1]) / 2;
      this.gas = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.3, 10), mat('#ffab00'));
      this.g.add(tube, band, this.gas);
    } else {
      const [bolts, arc, speed] = PARTS[part] ?? PARTS.battery;
      this.spec = [bolts, arc * (alarm ? 0.85 : 1), speed * (alarm ? 1.05 : 1)];
      this.bolt = 0; this.ang = 0; this.arcAt = Math.random() * Math.PI * 2;
      this.g.add(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 48), mat('#90a4ae')));
      this.arc = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 24, this.spec[1]), mat('#00e676'));
      this.g.add(this.arc);
      this.pointer = new THREE.Group();
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), mat('#ff1744'));
      tick.position.y = 0.09; this.pointer.add(tick); this.g.add(this.pointer);
      this.dots = Array.from({ length: bolts }, (_, i) => {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), mat('#546e7a'));
        d.position.set((i - (bolts - 1) / 2) * 0.03, -0.13, 0); this.g.add(d); return d;
      });
    }
    this.place();
  }

  private place() {
    if (this.kind === 'siphon') {
      const h = Math.max(0.001, this.level) * 0.3;
      this.gas.scale.y = Math.max(0.001, this.level); this.gas.position.y = -0.15 + h / 2;
    } else if (this.kind === 'strip') {
      this.arc.rotation.z = this.arcAt; this.pointer.rotation.z = this.ang - Math.PI / 2;
    }
  }

  cancel() { if (this.kind) this.end('cancel'); }

  private end(r: Res): Res { this.kind = null; this.g.visible = false; this.g.clear(); return r; }

  /** Per frame. `me` = the player's world position (walking off cancels). */
  update(dt: number, input: Input, me: THREE.Vector3): Res {
    if (!this.kind) return null;
    this.t += dt;
    if (me.distanceTo(this.at) > 3.5 || input.pressed('KeyG') || input.pressed('Escape')) return this.end('cancel');
    if (this.kind === 'siphon') {
      if (input.mouseDown(0) || input.down('KeyE')) {
        this.level += (0.1 + 0.65 * this.level) * dt; // faster the higher it gets
        if (this.level >= 1) { this.sfx('error'); return this.end('fail'); } // mouthful of gas
      } else if (this.level > 0.05) {
        if (this.level >= BAND[0] && this.level <= BAND[1]) { this.sfx('pour'); return this.end('ok'); }
        if (++this.tries >= 3) { this.sfx('error'); return this.end('fail'); }
        this.level = 0; this.sfx('click'); // it fell back down — try again
      }
    } else {
      this.ang = (this.ang + this.spec[2] * dt) % (Math.PI * 2);
      if (this.t > 0.25 && (input.clicked(0) || input.pressed('KeyE'))) {
        let d = this.ang - this.arcAt; d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (d > this.spec[1]) { this.sfx('clank'); return this.end('fail'); }
        (this.dots[this.bolt++].material as THREE.MeshBasicMaterial).color.set('#00e676');
        this.sfx('click');
        if (this.bolt >= this.spec[0]) return this.end('ok');
        this.arcAt = Math.random() * Math.PI * 2;
      }
    }
    this.place();
    return null;
  }
}
