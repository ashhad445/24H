// Small CPU particle system rendered as soft round point sprites.
// Used for extinguisher foam, grease-fire flames and smoke.
import * as THREE from 'three';

export interface EmitOpts {
  life: number;
  size: [number, number]; // start → end (meters)
  color: [THREE.ColorRepresentation, THREE.ColorRepresentation];
  alpha?: [number, number];
  gravity?: number; // m/s² (negative = rises)
  drag?: number; // 1/s
  stick?: boolean; // stop and linger when hitting a surface (foam)
  stickLife?: number;
}

const VERT = `
attribute float size; attribute vec3 pcolor; attribute float alpha;
uniform float uScale; varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = pcolor; vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform float uBlob; varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.1, d);
  // uBlob = 1 fakes a lit sphere (foam); 0 = soft glow (fire / smoke)
  float shade = mix(1.0, 0.72 + 0.28 * sqrt(max(0.0, 1.0 - 4.0 * d * d)) - 0.25 * (c.y), uBlob);
  float a = vAlpha * mix(soft, smoothstep(0.5, 0.4, d), uBlob);
  gl_FragColor = vec4(vColor * shade, a);
}`;

export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;
  private vel: Float32Array; private age: Float32Array; private life: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private c0: Float32Array; private c1: Float32Array;
  private a0: Float32Array; private a1: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private flags: Uint8Array; // 1 = sticky, 2 = stuck
  private stickLife: Float32Array;
  private next = 0;
  private mat: THREE.ShaderMaterial;
  private tmpA = new THREE.Color(); private tmpB = new THREE.Color();

  /**
   * @param floor surface height under (x, z) in this system's frame, for sticky particles / bounces
   * @param ceiling max height in this system's frame (smoke spreads under it)
   */
  constructor(max: number, opts: { additive?: boolean; blob?: boolean; floor?: (x: number, z: number, y: number) => number; ceiling?: (x: number, z: number) => number }) {
    this.n = max;
    const f = (k: number) => new Float32Array(max * k);
    this.pos = f(3); this.col = f(3); this.size = f(1); this.alpha = f(1);
    this.vel = f(3); this.age = f(1); this.life = f(1); this.s0 = f(1); this.s1 = f(1);
    this.c0 = f(3); this.c1 = f(3); this.a0 = f(1); this.a1 = f(1); this.grav = f(1); this.drag = f(1);
    this.flags = new Uint8Array(max); this.stickLife = f(1);
    this.floor = opts.floor ?? null;
    this.ceiling = opts.ceiling ?? null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uBlob: { value: opts.blob ? 1 : 0 } },
      transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  private floor: ((x: number, z: number, y: number) => number) | null;
  private ceiling: ((x: number, z: number) => number) | null;

  /** Pixel scale for point sizes: call on resize / FOV change. */
  setScale(viewportHeight: number, fovDeg: number) {
    this.mat.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, o: EmitOpts) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.age[i] = 0; this.life[i] = o.life;
    this.s0[i] = o.size[0]; this.s1[i] = o.size[1];
    this.tmpA.set(o.color[0]); this.tmpB.set(o.color[1]);
    this.c0[i3] = this.tmpA.r; this.c0[i3 + 1] = this.tmpA.g; this.c0[i3 + 2] = this.tmpA.b;
    this.c1[i3] = this.tmpB.r; this.c1[i3 + 1] = this.tmpB.g; this.c1[i3 + 2] = this.tmpB.b;
    const a = o.alpha ?? [1, 0];
    this.a0[i] = a[0]; this.a1[i] = a[1];
    this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0;
    this.flags[i] = o.stick ? 1 : 0; this.stickLife[i] = o.stickLife ?? 4;
  }

  update(dt: number) {
    const { pos, vel } = this;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.life[i] = 0; this.alpha[i] = 0; this.size[i] = 0; continue; }
      const i3 = i * 3;
      if (this.flags[i] !== 2) {
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - this.grav[i] * dt; vel[i3 + 2] *= dr;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        if (this.floor) {
          const fl = this.floor(pos[i3], pos[i3 + 2], pos[i3 + 1]);
          if (pos[i3 + 1] < fl) {
            pos[i3 + 1] = fl + 0.01;
            if (this.flags[i] === 1) {
              // splat: stick to the surface and linger
              this.flags[i] = 2; vel[i3] = vel[i3 + 1] = vel[i3 + 2] = 0;
              this.life[i] = this.age[i] + this.stickLife[i] * (0.7 + Math.random() * 0.6);
              this.s1[i] = Math.max(this.s1[i], this.size[i] * 1.3);
            } else { vel[i3 + 1] = Math.abs(vel[i3 + 1]) * 0.2; vel[i3] *= 0.6; vel[i3 + 2] *= 0.6; }
          }
        }
        if (this.ceiling) {
          const cl = this.ceiling(pos[i3], pos[i3 + 2]);
          if (pos[i3 + 1] > cl) {
            // smoke hits the ceiling and spreads out
            pos[i3 + 1] = cl; vel[i3 + 1] = 0;
            vel[i3] += (Math.random() - 0.5) * 2 * dt * 10; vel[i3 + 2] += (Math.random() - 0.5) * 2 * dt * 10;
          }
        }
      }
      const t = this.age[i] / this.life[i];
      const k = this.flags[i] === 2 ? Math.min(1, t * 3) : t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.min(1, this.flags[i] === 2 ? 1 : t);
      this.alpha[i] = this.flags[i] === 2 ? this.a0[i] * (1 - Math.max(0, (t - 0.6) / 0.4)) : this.a0[i] + (this.a1[i] - this.a0[i]) * k;
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * k;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * k;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * k;
    }
    const g = this.points.geometry;
    for (const name of ['position', 'pcolor', 'size', 'alpha']) g.getAttribute(name).needsUpdate = true;
  }
}
