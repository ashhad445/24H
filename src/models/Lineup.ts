// Dev-only character line-up: every NPC look (and the crew beans) in a row in front of a camera, in
// daylight, on a separate canvas with its own renderer. It never touches the game scene or main loop.
//   const L = await (await import('/src/models/Lineup.ts')).showLineup();   // browser console / Playwright
//   L.view(0, 8)            frame characters 0..7 from the front
//   L.view(3, 1, { close: true, yaw: 0.6 })   head-and-shoulders of one character, camera swung 0.6 rad
//   L.names                 the label of every character
import * as THREE from 'three';
import { Assets } from '../core/AssetLoader';
import { Character, type CharOpts } from './Character';
import { CAST } from './npcs';

type Look = [string, Partial<CharOpts> & { base?: keyof typeof CAST }];
const G = 'generic' as const;

/** Every one-off look in the game, copied from where it is created. */
export const LOOKS: Look[] = [
  ['cletus', { base: 'cletus' }], ['roscoe', { base: 'roscoe' }], ['flo', { base: 'flo' }], ['earl', { base: 'earl' }],
  ['dusty', { base: 'dusty' }], ['bouncer', { base: 'bouncer' }],
  ['vinnie', { base: G, body: '#2d2f33', pants: '#17181a', shades: true, hat: 'cap', hatColor: '#111', pose: 'cross', skin: '#b98152' }],
  ['tammy', { base: G, body: '#e91e63', pants: '#880e4f', hat: 'beehive', hatColor: '#ffeb3b', skin: '#e8b98a', pose: 'hips' }],
  ['goon', { base: G, body: '#16161a', pants: '#0c0c0e', shoes: '#000', shades: true, tie: '#b71c1c', pose: 'cross', skin: '#a9744f' }],
  ['trucker', { base: G, body: '#1565c0', hat: 'trucker', hatColor: '#2e7d32', belly: 1.35, beard: '#5d4037', pose: 'eat' }],
  ['diner gal', { base: G, body: '#f06292', hair: '#ffeb3b', pose: 'eat', skin: '#f1c27d' }],
  ['diner guy', { base: G, body: '#455a64', hat: 'cap', hatColor: '#455a64', mustache: '#3e2723', pose: 'sit' }],
  ['sleeper', { base: G, body: '#8d6e63', beard: '#eeeeee', hair: '', pose: 'sleep', belly: 1.2 }],
  ['kid', { base: G, body: '#ffb300', hat: 'party', hatColor: '#e91e63', pose: 'kick', height: 0.65 }],
  ['cowboy', { base: G, body: '#6d4c41', hat: 'cowboy', hatColor: '#3e2723', mustache: '#212121', pose: 'cross', vest: '#3e2723' }],
  ['waitress', { base: G, body: '#c2185b', pants: '#111', hair: '#ffd54f', apron: '#111', pose: 'notepad', skin: '#e8b98a' }],
  ['elvis', { base: G, body: '#fafafa', pants: '#fafafa', hair: '#111', shades: true, pose: 'sing', belly: 1.1 }],
  ['teller', { base: G, body: '#2e7d32', glasses: true, hair: '', tie: '#ffd54f', pose: 'read' }],
  ['gambler 1', { base: G, body: '#9e9e9e', hair: '#eeeeee', glasses: true, pose: 'slots', belly: 1.2 }],
  ['gambler 2', { base: G, body: '#795548', hat: 'cowboy', hatColor: '#212121', pose: 'slots', beard: '#3e2723' }],
  // hitchhikers (road/EncounterView OUTFITS)
  ['drifter', { base: G, body: '#a1887f', pants: '#5d4037', vest: '#e65100', hat: 'cowboy', hatColor: '#6d4c41', beard: '#795548', skin: '#c68e5d', pose: 'wave' }],
  ['shady guy', { base: G, body: '#37474f', pants: '#212121', hat: 'beanie', hatColor: '#111111', shades: true, pose: 'wave' }],
  ['preacher', { base: G, body: '#121212', pants: '#121212', tie: '#fafafa', glasses: true, hair: '#9e9e9e', skin: '#e8b98a', pose: 'wave' }],
  ['convict', { base: G, body: '#ff6d00', pants: '#ff6d00', hair: '', mustache: '#3e2723', belly: 1.15, pose: 'wave' }],
  ['motorist', { base: G, body: '#1e88e5', pants: '#37474f', hat: 'cap', hatColor: '#c62828', pose: 'wave' }],
  ['flagger', { base: G, body: '#5d4037', pants: '#37474f', hat: 'hardhat', hatColor: '#fbc02d', vest: '#ff6d00', pose: 'idle' }],
  ['worker', { base: G, body: '#455a64', pants: '#37474f', hat: 'hardhat', hatColor: '#fbc02d', vest: '#ff6d00', pose: 'hips' }],
];

/** The crew's bean avatars (Avatar.ts picks a color and hat per player id). */
const BEANS: CharOpts[] = [
  { kind: 'bean', body: '#e53935', hat: 'cap', hatColor: '#fafafa' },
  { kind: 'bean', body: '#1e88e5', hat: 'cowboy', hatColor: '#8d6e63' },
  { kind: 'bean', body: '#43a047', hat: 'beanie', hatColor: '#ffca28' },
  { kind: 'bean', body: '#fb8c00', hat: 'bucket', hatColor: '#7cb342' },
];

const SEATED = new Set(['sit', 'eat', 'sleep', 'kick', 'slots']);

export async function showLineup() {
  await Assets.preload();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', zIndex: '99999' });
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9fd2f2');
  scene.fog = new THREE.Fog('#cfe6f4', 40, 120);
  scene.add(new THREE.HemisphereLight('#cfe8ff', '#b79a6a', 1.5));
  const sun = new THREE.DirectionalLight('#fff0d0', 3.0);
  sun.position.set(-6, 10, -8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 6, bottom: -6, near: 1, far: 40 });
  sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.MeshStandardMaterial({ color: '#d9b574', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const chars: { name: string; ch: Character }[] = [];
  const add = (name: string, o: CharOpts) => {
    const ch = new Character({ ...o, npc: true });
    const g = new THREE.Group();
    const x = chars.length * 1.45;
    g.position.set(x, 0, 0); g.rotation.y = Math.PI; // face the camera (+Z)
    if (SEATED.has(ch.pose)) {
      const stool = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.47, 0.7), new THREE.MeshStandardMaterial({ color: '#8d3b2f', roughness: 0.8 }));
      stool.position.set(0, 0.235, 0.0); stool.castShadow = stool.receiveShadow = true; g.add(stool);
      ch.root.position.y = -0.38;
    }
    g.add(ch.root); scene.add(g);
    chars.push({ name, ch });
  };
  for (const [name, spec] of LOOKS) { const { base, ...over } = spec; add(name, { ...CAST[base ?? G], ...over, kind: 'human' }); }
  BEANS.forEach((b, i) => add(`bean ${i + 1}`, b));

  const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
  const API = {
    names: chars.map((c) => c.name),
    chars,
    /** Frame characters i0 … i0+n−1. yaw swings the camera around them; close = head and shoulders. */
    view(i0 = 0, n = 8, o: { yaw?: number; close?: boolean; y?: number; hold?: boolean } = {}) {
      const yaw = o.yaw ?? 0;
      const xs = chars.slice(i0, i0 + n).map((_, i) => (i0 + i) * 1.45);
      const cx = (xs[0] + xs[xs.length - 1]) / 2, w = (xs[xs.length - 1] - xs[0]) + 1.6;
      const fov = (cam.fov * Math.PI) / 180, aspect = innerWidth / innerHeight;
      const h = o.close ? 0.9 : 2.1;
      const dist = Math.max(o.close ? 1.1 : 3, Math.max(w / aspect, h) / 2 / Math.tan(fov / 2) + 0.6);
      const ty = o.y ?? (o.close ? 1.52 : 1.0);
      cam.position.set(cx + Math.sin(yaw) * dist, ty + (o.close ? 0.05 : 0.35), Math.cos(yaw) * dist);
      cam.lookAt(cx, ty, 0);
    },
    /** Make one character play a one-shot (eat / wave / slap) or talk. */
    talk(i: number, v = 0.8) { chars[i].ch.anim.talk = v; },
    renderer,
  };
  API.view(0, 8);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  let last = performance.now();
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    Character.tickAll(dt);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
  (window as unknown as { __lineup: typeof API }).__lineup = API;
  return API;
}
