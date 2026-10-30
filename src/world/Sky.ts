// Sky dome: Rayleigh / Mie flavoured single-scatter gradient for daylight, an art-directed twilight palette for
// sunrise / sunset (red-orange horizon, belt of pink, indigo zenith), sun disk + glare halo, moon, and a drifting
// procedural cloud layer. It is a plain dome material (everything comes from normalize(position)), so fx/Graphics
// can still bake reflections from it.
import * as THREE from 'three';
import { makeCloudNoise } from './TexGen';

// scattering constants (per metre, scaled up a little for an art-directed look)
const BR = [5.8e-6, 13.5e-6, 33.1e-6];
const BM = 21e-6;
const HR = 8000, HM = 1200;
const SCALE_R = 2.0, SCALE_M = 0.5;
const MIE_G = 0.8;
const W0 = 0.08;     // how much of the sun's path the zenith sky "sees" (keeps the zenith blue)
const SAT = 1.6;     // saturation boost applied before tone mapping (the physical model is dusty)
const TINT: [number, number, number] = [1.04, 0.86, 1.0];
export const DAY_GAIN = 1.5;

/** sin(sun elevation) at which the day scatter model is fully replaced by the twilight palette, and vice versa. */
const DUSK_FULL = 0.09, DUSK_NONE = 0.34;
export const duskAmount = (sunY: number) => 1 - THREE.MathUtils.smoothstep(sunY, DUSK_FULL, DUSK_NONE);

/** Daylight scatter radiance (linear). Mirrors the shader. */
function scatter(dy: number, cosT: number, sunY: number, out: number[]) {
  const d = Math.max(dy, 0), sy = Math.max(sunY, 0);
  const mv = 1 / (d + 0.03), ms = 1 / (sy + 0.03);
  const w = W0 + (1 - W0) * Math.exp(-d * 4);
  const phR = 0.75 * (1 + cosT * cosT);
  const g2 = MIE_G * MIE_G;
  const phM = ((1 - g2) / Math.pow(1 + g2 - 2 * MIE_G * cosT, 1.5)) * 0.25;
  const bM = BM * SCALE_M * HM * 1.1;
  const gain = DAY_GAIN * THREE.MathUtils.smoothstep(sunY, -0.05, 0.1);
  for (let c = 0; c < 3; c++) {
    const bR = BR[c] * SCALE_R * HR, ext = bR + bM;
    const T = Math.exp(-ext * ms * w);
    out[c] = gain * T * ((bR * phR + bM * phM) / ext) * (1 - Math.exp(-ext * mv));
  }
  const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  for (let c = 0; c < 3; c++) out[c] = Math.max(0, l + (out[c] - l) * SAT) * TINT[c];
}

const lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;
/** Twilight palette (linear). `side` = 1 looking toward the sun's azimuth, 0 away from it. Mirrors the shader. */
function twilight(dy: number, cosT: number, side: number, sunY: number, out: number[]) {
  const h = Math.max(dy, 0);
  const lit = sstep(sunY, -0.2, 0.03);
  const s15 = Math.pow(side, 1.5);
  const hor = [lerp(0.5, 0.95, s15), lerp(0.28, 0.27, s15), lerp(0.36, 0.06, s15)];
  const mid = [lerp(0.28, 0.55, side), lerp(0.2, 0.3, side), lerp(0.46, 0.34, side)];
  const zen = [0.03, 0.065, 0.27];
  const t1 = sstep(h, 0, 0.32), t2 = sstep(h, 0.15, 0.9);
  const g = Math.pow(Math.max(cosT, 0), 6) * 0.7 + Math.pow(Math.max(cosT, 0), 2) * 0.22 * (1 - h);
  for (let c = 0; c < 3; c++) {
    let v = lerp(hor[c], mid[c], t1); v = lerp(v, zen[c], t2);
    out[c] = v * lit + [1.0, 0.36, 0.07][c] * g * lit;
  }
}

const _a = [0, 0, 0], _b = [0, 0, 0];
/** Linear sky radiance for a view direction (dy) at angle cosT from the sun, `side` toward / away from its azimuth. */
export function skyColor(dy: number, cosT: number, side: number, sunY: number, out: THREE.Color): THREE.Color {
  scatter(dy, cosT, sunY, _a); twilight(dy, cosT, side, sunY, _b);
  const k = duskAmount(sunY);
  return out.setRGB(lerp(_a[0], _b[0], k), lerp(_a[1], _b[1], k), lerp(_a[2], _b[2], k), THREE.LinearSRGBColorSpace);
}

/**
 * What a linear scene colour looks like after three's ACES tone mapping + sRGB encoding. Only used on Low quality
 * (direct render): there `scene.fog` colour is written straight to the screen, so it has to be pre-converted to match
 * the (tone mapped) sky and lit surfaces. On Medium / High everything is composed in linear and tone mapped once.
 */
export function toDisplay(c: THREE.Color, out: THREE.Color, exposure = 1): THREE.Color {
  const r0 = (c.r * exposure) / 0.6, g0 = (c.g * exposure) / 0.6, b0 = (c.b * exposure) / 0.6;
  let r = 0.59719 * r0 + 0.35458 * g0 + 0.04823 * b0, g = 0.076 * r0 + 0.90834 * g0 + 0.01566 * b0, b = 0.0284 * r0 + 0.13383 * g0 + 0.83777 * b0;
  const fit = (x: number) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);
  r = fit(r); g = fit(g); b = fit(b);
  const R = 1.60475 * r - 0.53108 * g - 0.07367 * b, G = -0.10208 * r + 1.10813 * g - 0.00605 * b, B = -0.00327 * r - 0.07276 * g + 1.07602 * b;
  const enc = (x: number) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
  out.r = enc(R); out.g = enc(G); out.b = enc(B); // raw assignment: the value is already display-referred
  return out;
}

const VERT = `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = `
uniform vec3 sunDir; uniform vec3 moonDir;
uniform vec3 uNightTop; uniform vec3 uNightHor; uniform float uNightAmt;
uniform vec3 uHaze;       // fog / horizon colour (linear)
uniform float uStorm; uniform vec3 uDust;
uniform vec3 uSunCol; uniform vec3 uAmb;   // cloud lighting
uniform float uCover; uniform vec2 uCloudOff; uniform float uCloudQ;
uniform float uMoonI;
uniform sampler2D uNoise;
varying vec3 vDir;
const vec3 BR = vec3(${BR.map((b) => (b * SCALE_R * HR).toFixed(5)).join(', ')});
const float BMX = ${(BM * SCALE_M * HM * 1.1).toFixed(5)};
const float G = ${MIE_G.toFixed(3)};

vec3 scatter(vec3 d){
  float dy = max(d.y, 0.0);
  float sy = max(sunDir.y, 0.0);
  float mv = 1.0 / (dy + 0.03), ms = 1.0 / (sy + 0.03);
  float w = ${W0.toFixed(3)} + ${(1 - W0).toFixed(3)} * exp(-dy * 4.0);
  float cosT = dot(d, sunDir);
  float phR = 0.75 * (1.0 + cosT * cosT);
  float g2 = G * G;
  float phM = (1.0 - g2) / pow(1.0 + g2 - 2.0 * G * cosT, 1.5) * 0.25;
  vec3 ext = BR + vec3(BMX);
  vec3 T = exp(-ext * ms * w);
  float gain = ${DAY_GAIN.toFixed(2)} * smoothstep(-0.05, 0.1, sunDir.y);
  vec3 c = gain * T * ((BR * phR + vec3(BMX * phM)) / ext) * (1.0 - exp(-ext * mv));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(0.0), vec3(l) + (c - vec3(l)) * ${SAT.toFixed(2)}) * vec3(${TINT.map((t) => t.toFixed(2)).join(', ')});
}

vec3 twilight(vec3 d){
  float h = max(d.y, 0.0);
  float side = clamp(0.5 + 0.5 * dot(normalize(d.xz + vec2(1e-5)), normalize(sunDir.xz + vec2(1e-5))), 0.0, 1.0); // can round below 0: pow(<0) = NaN on D3D
  float cosT = max(dot(d, sunDir), 0.0);
  float lit = smoothstep(-0.2, 0.03, sunDir.y);
  vec3 hor = mix(vec3(0.5, 0.28, 0.36), vec3(0.95, 0.27, 0.06), pow(side, 1.5));
  vec3 mid = mix(vec3(0.28, 0.2, 0.46), vec3(0.55, 0.3, 0.34), side);
  vec3 zen = vec3(0.03, 0.065, 0.27);
  vec3 c = mix(mix(hor, mid, smoothstep(0.0, 0.32, h)), zen, smoothstep(0.15, 0.9, h));
  float g = pow(cosT, 6.0) * 0.7 + pow(cosT, 2.0) * 0.22 * (1.0 - h);
  return c * lit + vec3(1.0, 0.36, 0.07) * g * lit;
}

float cn(vec2 p){ return texture2D(uNoise, p).r; }

void main(){
  vec3 d = normalize(vDir);
  float dy = d.y;
  float dusk = 1.0 - smoothstep(${DUSK_FULL.toFixed(2)}, ${DUSK_NONE.toFixed(2)}, sunDir.y);
  vec3 col = dusk < 0.999 ? scatter(d) : vec3(0.0);
  if (dusk > 0.001) col = mix(col, twilight(d), dusk);
  // night: deep blue gradient + moon
  float h = pow(max(dy, 0.0), 0.5);
  col += mix(uNightHor, uNightTop, h) * uNightAmt;
  float mc = dot(d, moonDir);
  col += uMoonI * (vec3(1.0, 0.96, 0.86) * smoothstep(0.99955, 0.99975, mc) * 2.2 + vec3(0.35, 0.42, 0.6) * pow(max(mc, 0.0), 90.0) * 0.5);
  // sun glare: disk + halo
  float s = max(dot(d, sunDir), 0.0);
  float sunVis = smoothstep(-0.03, 0.02, sunDir.y);
  vec3 glare = uSunCol * (smoothstep(0.99975, 0.99992, s) * 22.0 + pow(s, 220.0) * 1.4 + pow(s, 18.0) * 0.12 + pow(s, 4.0) * 0.03) * sunVis;
  // clouds on a plane above the viewer
  float ca = 0.0; vec3 cloud = vec3(0.0);
  if (dy > 0.015) {
    vec2 p = d.xz / (dy + 0.14) * 2.0 + uCloudOff;
    float n = cn(p * 0.33) * 0.58 + cn(p * 0.86 + vec2(3.1, 1.7)) * 0.3;
    if (uCloudQ > 0.5) n += texture2D(uNoise, p * 2.3 + vec2(7.3, 2.9)).g * 0.12; else n += 0.06;
    float lo = mix(0.64, 0.36, uCover);
    float dens = smoothstep(lo, lo + 0.2, n);
    float lit = 0.6;
    if (uCloudQ > 0.5) {
      vec2 sdir = normalize(sunDir.xz + vec2(1e-4)) * 0.05;
      float n2 = cn((p + sdir) * 0.33) * 0.58 + cn((p + sdir) * 0.86 + vec2(3.1, 1.7)) * 0.3 + 0.06;
      lit = clamp(0.55 + (n - n2) * 3.8, 0.0, 1.0);
    }
    float cosS = max(dot(d, sunDir), 0.0);
    float lining = (1.0 - dens) * pow(cosS, 5.0) * 0.9 * smoothstep(0.0, 0.3, dens + 0.1);
    vec3 shadow = uAmb * 0.9 + uHaze * 0.25;
    vec3 bright = uSunCol * 1.05 + uAmb * 0.3;
    cloud = mix(shadow, bright, lit) + uSunCol * lining;
    cloud *= mix(1.0, 0.78, dens * dens);
    cloud = mix(cloud, uDust * 0.55, uStorm * 0.85);
    ca = dens * smoothstep(0.015, 0.22, dy);
    glare *= 1.0 - ca * 0.92;
  }
  col += glare;
  col = mix(col, cloud, ca);
  // dust storm: brown sky
  col = mix(col, uDust * (0.94 + 0.12 * (1.0 - max(dy, 0.0))), uStorm * 0.95);
  // horizon blends into the fog colour so the ground never shows a seam
  float hz = 1.0 - smoothstep(0.0, 0.05, dy);
  col = mix(col, uHaze, hz * hz);
  // never emit NaN / Inf (bit test: survives the NaN-check optimisations some Windows drivers apply)
  uvec3 bits = floatBitsToUint(col) & uvec3(0x7f800000u);
  if (any(equal(bits, uvec3(0x7f800000u)))) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyMaterial(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: sunDir },
      moonDir: { value: new THREE.Vector3(-200, 300, 100).normalize() },
      uNightTop: { value: new THREE.Color('#0b1030') },
      uNightHor: { value: new THREE.Color('#1c2245') },
      uNightAmt: { value: 0 },
      uHaze: { value: new THREE.Color('#f2d9b0') },
      uStorm: { value: 0 },
      uDust: { value: new THREE.Color('#b08458') },
      uSunCol: { value: new THREE.Color('#fff2cc') },
      uAmb: { value: new THREE.Color('#7aa0d0') },
      uCover: { value: 0.4 },
      uCloudOff: { value: new THREE.Vector2() },
      uCloudQ: { value: 1 },
      uMoonI: { value: 0 },
      uNoise: { value: makeCloudNoise() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}
