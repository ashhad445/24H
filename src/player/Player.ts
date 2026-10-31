// Local first-person controller. Inside the RV the player lives in RV-local space
// (camera parented to the RV body) so walking at 70 MPH has no jitter.
import * as THREE from 'three';
import { PLAYER, RV } from '../config';
import type { Input } from '../core/Input';
import { RVModel, SEATS, SEAT_EYE } from '../rv/RV';
import { collideCircle, fromSetLocal, toSetLocal, type StaticSet } from '../stops/geom';
import type { DriveInput, Pose, SeatRole, SharedState } from '../types';
import { groundY } from '../world/World';

const insideBounds = (x: number, z: number) => Math.abs(x) < RV.innerHalfW + 0.04 && z > RV.zFront && z < RV.zRear - 0.04;

export class Player {
  inRV = true;
  pos = new THREE.Vector3(0.1, RV.floorY, 0.2);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = -0.05;
  seat: SeatRole = '';
  onGround = true;
  stamina = 100;
  /** caffeine sprint buzz: seconds left, sprint drain ×, refill × */
  boost = { t: 0, drain: 1, regen: 1 };
  private tired = false;
  private bob = 0;
  private shake = 0;
  private kickP = 0;
  private kickV = 0;
  /** 0..~1.5 continuous cabin vibration (set each frame by main). */
  rumble = 0;
  /** Static buildings to collide with when outside the RV. */
  statics: StaticSet[] = [];

  constructor(private camera: THREE.PerspectiveCamera, private rv: RVModel, private scene: THREE.Scene) {
    rv.body.add(camera);
  }

  private rvPose() { return { x: this.rv.root.position.x, z: this.rv.root.position.z, yaw: this.rv.root.rotation.y }; }

  private toLocal(wx: number, wz: number) {
    const r = this.rvPose(); const dx = wx - r.x, dz = wz - r.z; const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }
  private toWorld(lx: number, lz: number) {
    const r = this.rvPose(); const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return { x: r.x + lx * c + lz * s, z: r.z - lx * s + lz * c };
  }

  /** Returns driver input when seated as driver, else null. */
  update(dt: number, input: Input, shared: SharedState, myId: number): DriveInput | null {
    // seat assignment comes from the host
    const seat: SeatRole = shared.seats.driver === myId ? 'driver' : shared.seats.nav === myId ? 'nav' : '';
    if (seat && seat !== this.seat) {
      this.setInRV(true);
      this.yaw = 0; this.pitch = -0.28; this.vel.set(0, 0, 0);
    } else if (!seat && this.seat) {
      this.pos.copy(SEATS[this.seat].stand); this.vel.set(0, 0, 0);
    }
    this.seat = seat;

    // mouse look
    this.yaw -= input.mouseDX * input.sensitivity;
    this.pitch -= input.mouseDY * input.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    let drive: DriveInput | null = null;
    if (this.seat) {
      this.yaw = THREE.MathUtils.clamp(this.yaw, -2.0, 2.0);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 0.9);
      this.pos.copy(SEATS[this.seat].pos);
      if (this.seat === 'driver') {
        drive = {
          th: input.down('KeyW') || input.down('ArrowUp') ? 1 : 0,
          br: input.down('KeyS') || input.down('ArrowDown') ? 1 : 0,
          st: (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) - (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0),
          horn: input.down('KeyH'),
        };
      }
      this.placeCamera(SEAT_EYE, 0);
      return drive;
    }

    // ---------- walking ----------
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (input.down('KeyW')) wish.add(fwd);
    if (input.down('KeyS')) wish.sub(fwd);
    if (input.down('KeyD')) wish.add(right);
    if (input.down('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    const moving = wish.lengthSq() > 0;
    if (this.stamina <= 0) this.tired = true;
    if (this.stamina > 25) this.tired = false;
    const sprinting = input.down('ShiftLeft') && moving && !this.tired;
    const bz = this.boost.t > 0 ? this.boost : { drain: 1, regen: 1 };
    this.boost.t = Math.max(0, this.boost.t - dt);
    this.stamina = Math.max(0, Math.min(100, this.stamina + (sprinting ? -PLAYER.sprintDrain * bz.drain : PLAYER.sprintRegen * bz.regen) * dt));
    const speed = sprinting ? PLAYER.sprint : PLAYER.walk;
    const accel = this.onGround ? 14 : 2;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;

    // inertial jolts from the RV (pseudo-force = −a of the frame)
    if (this.inRV) {
      const a = this.rv.accelLocal;
      const f = this.onGround ? 0.55 : 1;
      this.vel.x -= a.x * dt * f;
      this.vel.z -= a.z * dt * f;
    }

    if (this.onGround && input.pressed('Space')) { this.vel.y = PLAYER.jump; this.onGround = false; }
    this.vel.y -= PLAYER.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);

    // collide in RV-local space
    let l = this.inRV ? { x: this.pos.x, z: this.pos.z } : this.toLocal(this.pos.x, this.pos.z);
    const ry = this.rv.root.position.y;
    if (this.pos.y - (this.inRV ? 0 : ry) < RV.roofY) {
      const r = PLAYER.radius;
      for (const b of this.rv.activeColliders(shared.rv.doorOpen)) {
        const cx = THREE.MathUtils.clamp(l.x, b.x0, b.x1), cz = THREE.MathUtils.clamp(l.z, b.z0, b.z1);
        let dx = l.x - cx, dz = l.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) {
          // center inside the box: push out along the shallowest axis
          const px = Math.min(l.x - b.x0, b.x1 - l.x), pz = Math.min(l.z - b.z0, b.z1 - l.z);
          if (px < pz) l.x = l.x - b.x0 < b.x1 - l.x ? b.x0 - r : b.x1 + r; else l.z = l.z - b.z0 < b.z1 - l.z ? b.z0 - r : b.z1 + r;
        } else {
          const d = Math.sqrt(d2); dx /= d; dz /= d;
          l.x = cx + dx * r; l.z = cz + dz * r;
        }
      }
    }
    const inside = insideBounds(l.x, l.z);

    // floor (RV-local heights inside, world heights outside; the RV root sits at height ry)
    let floor: number;
    if (inside) floor = RV.floorY + (this.inRV ? 0 : ry);
    else { const w = this.toWorld(l.x, l.z); floor = groundY(w.x, w.z) - (this.inRV ? ry : 0); }
    if (!this.inRV && !inside) {
      // stop buildings (walls, counters, cars) in world space
      let [wx, wz] = [this.pos.x, this.pos.z];
      { const w = this.toWorld(l.x, l.z); wx = w.x; wz = w.z; }
      for (const set of this.statics) {
        if (Math.abs(wx - set.x) > 200 || Math.abs(wz - set.z) > 200) continue;
        const [sx, sz] = toSetLocal(set, wx, wz);
        const res = collideCircle(sx, sz, PLAYER.radius, this.pos.y, set.boxes, 0.3);
        [wx, wz] = fromSetLocal(set, res.x, res.z);
        floor = Math.max(floor, res.floor);
      }
      l = this.toLocal(wx, wz);
    }
    if (this.pos.y <= floor + 0.001) {
      if (floor - this.pos.y <= PLAYER.stepUp || this.vel.y <= 0) { this.pos.y = floor; this.vel.y = Math.max(0, this.vel.y); this.onGround = true; }
    } else if (this.pos.y > floor + 0.05) this.onGround = false;

    // write back & handle frame transitions
    if (this.inRV) {
      this.pos.x = l.x; this.pos.z = l.z;
      if (!inside) this.setInRV(false, shared.rv.speed);
    } else {
      const w = this.toWorld(l.x, l.z); this.pos.x = w.x; this.pos.z = w.z;
      if (inside) this.setInRV(true, shared.rv.speed);
    }

    const walking = this.onGround && moving;
    this.bob += walking ? dt * speed * 2.6 : 0;
    this.placeCamera(PLAYER.eye, walking ? Math.sin(this.bob) * 0.035 : 0);
    return null;
  }

  /** Passed out: the crew drags you onto the RV floor (seated players stay put). */
  wakeInRV() {
    if (this.seat) return;
    if (!this.inRV) this.setInRV(true);
    this.pos.set(0.2, RV.floorY, 1.6); this.vel.set(0, 0, 0); this.pitch = 0.4;
  }

  /** Switch between RV-local and world frames, preserving world position & velocity. */
  setInRV(v: boolean, rvSpeed = 0) {
    if (v === this.inRV) return;
    const r = this.rvPose(); const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const rvVx = -Math.sin(r.yaw) * rvSpeed, rvVz = -Math.cos(r.yaw) * rvSpeed;
    const ry = this.rv.root.position.y;
    this.pos.y += v ? -ry : ry;
    if (!v) {
      const w = this.toWorld(this.pos.x, this.pos.z);
      const vx = this.vel.x * c + this.vel.z * s, vz = -this.vel.x * s + this.vel.z * c;
      this.pos.x = w.x; this.pos.z = w.z;
      this.vel.x = vx + rvVx; this.vel.z = vz + rvVz;
      this.yaw += r.yaw;
      this.scene.add(this.camera);
    } else {
      const l = this.toLocal(this.pos.x, this.pos.z);
      const vx = this.vel.x - rvVx, vz = this.vel.z - rvVz;
      this.pos.x = l.x; this.pos.z = l.z;
      this.vel.x = vx * c - vz * s; this.vel.z = vx * s + vz * c;
      this.yaw -= r.yaw;
      this.rv.body.add(this.camera);
    }
    this.inRV = v;
  }

  private placeCamera(eye: number, bob: number) {
    this.shake = Math.max(0, this.shake - 0.016 * 3);
    // gear-shift kick: a damped spring on pitch
    this.kickV += (-this.kickP * 140 - this.kickV * 14) * 0.016;
    this.kickP += this.kickV * 0.016;
    const sh = this.shake * 0.06;
    // road + engine rumble: a smooth high-frequency wobble rather than random jitter
    const t = performance.now() / 1000;
    const rb = this.inRV ? this.rumble : 0;
    const ry = (Math.sin(t * 61) * 0.6 + Math.sin(t * 37.3) * 0.4) * rb * 0.004;
    const rr = Math.sin(t * 23.1) * rb * 0.0015;
    this.camera.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + eye + bob + ry + (Math.random() - 0.5) * sh, this.pos.z);
    this.camera.rotation.set(this.pitch + this.kickP + (Math.random() - 0.5) * sh * 0.5, this.yaw, rr + (Math.random() - 0.5) * sh * 0.3, 'YXZ');
  }

  /** Camera pitch nudge (gear change, brake slam). + = look down. */
  kick(amount: number) { this.kickV -= amount * 12; }

  /** Caffeine buzz. A stronger buzz replaces a weaker one; the same kind just tops up the time. */
  addBoost(t: number, drain: number, regen: number) {
    const b = this.boost;
    if (b.t <= 0 || drain <= b.drain) { b.drain = drain; b.regen = regen; b.t = Math.max(b.t, t); }
    else b.t = Math.max(b.t, t * 0.5); // weaker drink on top of a strong one: extends a little
  }

  /** Pothole / crash: bounce the player if they're standing in the RV, shake everyone inside. */
  jolt(mag: number) {
    if (!this.inRV) return;
    this.shake = Math.min(1.5, this.shake + mag);
    if (!this.seat && this.onGround) {
      this.vel.y += mag * 2.2;
      this.vel.x += (Math.random() - 0.5) * mag * 2;
      this.vel.z += (Math.random() - 0.5) * mag * 2;
      this.onGround = false;
    }
  }

  /** Forward look direction in the player's current frame. */
  lookDir() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** Eye position in the player's current frame. */
  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.seat ? SEAT_EYE : PLAYER.eye), this.pos.z);
  }

  pose(): Pose {
    return { inRV: this.inRV, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, seat: this.seat };
  }
}
