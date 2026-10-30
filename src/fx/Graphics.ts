// Graphics quality + the look: sky reflections (PMREM env map), bloom, color grade, vignette, grain.
//  Low:    direct render, 1024 shadows, pixel ratio 1.
//  Medium: post (half-res bloom + grade), 2048 shadows, pixel ratio ≤ 1.5.
//  High:   post (full bloom + grade), 4096 shadows, pixel ratio ≤ 2.
// The env map is on at every quality and is set before anything is warmed (a later toggle would recompile
// every material). Rendering the scene into the composer's target uses the same shader variant as the
// mirrors (no tone mapping, linear output), which ShaderWarm already compiles.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];

/** Warm desert grade + vignette + film grain, applied after tone mapping (sRGB). */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 }, warmth: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, vignette, grain, warmth; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // gentle S-curve + warm highlights / cool shadows
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.32);
      c += warmth * (vec3(0.025, 0.012, -0.02) * smoothstep(0.35, 1.0, l) + vec3(-0.012, 0.0, 0.018) * (1.0 - smoothstep(0.0, 0.35, l)));
      c = mix(vec3(l), c, 1.12); // a touch more saturation
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c += (hash(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Graphics {
  quality: Quality = 'medium';
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envT = 0;

  /** `sky`: a material whose uniforms the World keeps updated (sky dome shader). */
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera, sky: THREE.Material, private sun: THREE.DirectionalLight) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // env scene: the live sky dome + a sand-colored lower hemisphere (what chrome sees below the horizon)
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky));
    const ground = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#8a6a48', side: THREE.BackSide, fog: false }));
    ground.position.y = -2;
    this.envScene.add(ground);
    this.groundMat = ground.material;
    this.bakeEnv();
    scene.environmentIntensity = 0.3;
  }
  private groundMat: THREE.MeshBasicMaterial;

  /** Re-render the sky into the reflection map (cheap; a few times a minute). */
  private bakeEnv() {
    const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 400);
    this.scene.environment = rt.texture;
    this.envRT?.dispose();
    this.envRT = rt;
  }

  setQuality(q: Quality) {
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2));
    const size = q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.composer?.dispose(); this.composer = null; this.bloom = null; this.grade = null;
    if (q !== 'low') {
      const w = innerWidth, h = innerHeight, pr = r.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
      const c = new EffectComposer(r, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      const bs = q === 'high' ? 1 : 0.5;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w * bs, h * bs), 0.32, 0.55, 1.05);
      c.addPass(this.bloom);
      c.addPass(new OutputPass());
      this.grade = new ShaderPass(GradeShader);
      c.addPass(this.grade);
      this.composer = c;
    }
    this.setSize(innerWidth, innerHeight);
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
  }

  /** Per frame: `night` 0..1 (bloom stronger at night), `storm` 0..1. */
  update(dt: number, night: number, storm: number) {
    this.envT -= dt;
    if (this.envT <= 0) {
      this.envT = 4;
      this.groundMat.color.setRGB(0.54, 0.42, 0.28).multiplyScalar(Math.max(0.04, 1 - night * 0.95));
      this.bakeEnv();
    }
    this.scene.environmentIntensity = 0.3 * (1 - night * 0.7) * (1 - storm * 0.3);
    if (this.bloom) { this.bloom.strength = 0.25 + night * 0.25; this.bloom.threshold = 1.1; }
    if (this.grade) { const u = this.grade.uniforms; u.time.value = (u.time.value + dt) % 100; u.warmth.value = 1 - night * 0.7; }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
