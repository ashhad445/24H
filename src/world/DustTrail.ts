// Dust kicked up behind the RV when it drives on the dirt (off the asphalt and gravel shoulder).
// A small pooled Points cloud with a soft-disc shader; the material exists from construction so shader warm-up covers it.
import * as THREE from 'three';

const N = 96;

const VERT = `
attribute float aLife; attribute float aSize;
uniform float uVH;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * (1.0 + aLife * 2.4) * projectionMatrix[1][1] * uVH * 0.5 / max(0.5, -mv.z), 1.0, 420.0);
  vA = (1.0 - aLife) * (1.0 - aLife) * 0.5 * step(aLife, 0.999);
}`;
const FRAG = `
uniform vec3 uCol; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class DustTrail {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3); private life = new Float32Array(N).fill(1); private size = new Float32Array(N);
  private vel = new Float32Array(N * 3); private age = new Float32Array(N).fill(99); private span = new Float32Array(N).fill(1);
  private last = new THREE.Vector3(); private haveLast = false; private emit = 0; private next = 0;
  private mat: THREE.ShaderMaterial;
  private vhT = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uCol: { value: new THREE.Color('#cfae80') }, uVH: { value: 720 } },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  /** `offRoad`: the focus is on dirt. `day` tints the dust (dark at night). */
  update(dt: number, focus: THREE.Vector3, offRoad: boolean, day: number, wind: number, enabled: boolean) {
    this.points.visible = enabled;
    if (!enabled || dt <= 0) { this.haveLast = false; return; }
    if (!this.haveLast) { this.last.copy(focus); this.haveLast = true; return; }
    const vx = (focus.x - this.last.x) / dt, vz = (focus.z - this.last.z) / dt;
    this.last.copy(focus);
    const speed = Math.hypot(vx, vz);
    if (speed > 60) return; // teleport (dev jump / fork choice), not driving
    this.mat.uniforms.uCol.value.setRGB(0.62, 0.5, 0.34).multiplyScalar(0.12 + 0.88 * day);
    this.vhT -= dt;
    if (this.vhT <= 0) { this.vhT = 1; const c = document.getElementById('game') as HTMLCanvasElement | null; if (c) this.mat.uniforms.uVH.value = c.height; }

    if (offRoad && speed > 5) {
      this.emit += Math.min(70, speed * 1.4) * dt;
      const dx = vx / speed, dz = vz / speed;
      while (this.emit >= 1) {
        this.emit -= 1;
        const i = this.next; this.next = (this.next + 1) % N;
        const side = (Math.random() - 0.5) * 2.4;
        this.pos[i * 3] = focus.x - dx * 3.4 - dz * side; this.pos[i * 3 + 1] = 0.15 + Math.random() * 0.25; this.pos[i * 3 + 2] = focus.z - dz * 3.4 + dx * side;
        this.vel[i * 3] = dx * speed * 0.12 + (Math.random() - 0.5) * 1.2 + wind * 1.5; this.vel[i * 3 + 1] = 0.6 + Math.random() * 1.2; this.vel[i * 3 + 2] = dz * speed * 0.12 + (Math.random() - 0.5) * 1.2;
        this.size[i] = 1.4 + Math.random() * 1.6; this.age[i] = 0; this.span[i] = 1.5 + Math.random() * 1.0;
      }
    }
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= this.span[i]) { this.life[i] = 1; continue; }
      this.age[i] += dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] *= 1 - 0.8 * dt; this.vel[i * 3] *= 1 - 0.5 * dt; this.vel[i * 3 + 2] *= 1 - 0.5 * dt;
      this.life[i] = Math.min(1, this.age[i] / this.span[i]);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }
}
