// GLB models built in Blender (art/*.py → public/models/*.glb). Everything is optional: if a file is
// missing or still loading, callers get null and keep their procedural fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const scenes = new Map<string, THREE.Object3D>();
const bakedCache = new Map<string, THREE.BufferGeometry | null>();
const listeners: (() => void)[] = [];
let loaded = false;

/** One flat-shaded material for every vertex-colored (baked) model. */
export const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });

function prep(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
  });
}

const tintCache = new Map<string, THREE.Material>();
/** Recolor every material named tint_<slot> from `colors[slot]` (one shared material per color). */
export function tint(o: THREE.Object3D, colors: Record<string, string | undefined>) {
  const swap = (mt: THREE.Material) => {
    if (!mt.name.startsWith('tint_')) return mt;
    const col = colors[mt.name.slice(5)];
    if (!col) return mt;
    const key = mt.name + col;
    let m = tintCache.get(key);
    if (!m) { m = mt.clone(); (m as THREE.MeshStandardMaterial).color.set(col); tintCache.set(key, m); }
    return m;
  };
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
  return o;
}

export const Assets = {
  get ready() { return loaded; },
  has(file: string) { return scenes.has(file); },

  /** Load every model listed in public/models/index.json. Never throws. */
  async preload(): Promise<void> {
    try {
      const res = await fetch('models/index.json');
      if (!res.ok) return;
      const list: string[] = await res.json();
      const loader = new GLTFLoader();
      await Promise.all(list.map(async (name) => {
        try {
          const g = await loader.loadAsync(`models/${name}.glb`);
          prep(g.scene);
          scenes.set(name, g.scene);
        } catch (e) { console.warn('model failed', name, e); }
      }));
    } catch { /* no manifest: procedural everything */ }
    loaded = true;
    bakedCache.clear();
    listeners.splice(0).forEach((f) => f());
  },

  /** Run once models are in (immediately if they already are). */
  onReady(f: () => void) { if (loaded) f(); else listeners.push(f); },

  /** Wait for the preload, but never longer than `ms`. */
  wait(ms = 6000): Promise<void> {
    return new Promise((r) => { if (loaded) r(); else { listeners.push(r); setTimeout(r, ms); } });
  },

  /** A fresh copy of a named node (position reset to the origin), or null. */
  node(file: string, name: string): THREE.Object3D | null {
    const src = scenes.get(file)?.getObjectByName(name);
    if (!src) return null;
    const c = src.clone(true);
    c.position.set(0, 0, 0);
    return c;
  },

  /** node() with every material named tint_<slot> recolored from `colors[slot]`. */
  tinted(file: string, name: string, colors: Record<string, string | undefined>): THREE.Object3D | null {
    const n = this.node(file, name);
    return n ? tint(n, colors) : null;
  },

  /** Names of the top-level nodes in a file that start with `prefix` (e.g. 'saguaro_'). */
  names(file: string, prefix: string): string[] {
    const s = scenes.get(file);
    return s ? s.children.filter((c) => c.name.startsWith(prefix)).map((c) => c.name).sort() : [];
  },

  /** A node merged into one geometry with its material colors baked into vertex colors (for instancing). */
  baked(file: string, name: string): THREE.BufferGeometry | null {
    const key = file + '/' + name;
    if (bakedCache.has(key)) return bakedCache.get(key)!;
    const n = this.node(file, name);
    let out: THREE.BufferGeometry | null = null;
    if (n) {
      n.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      n.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        const groups = src.groups.length ? src.groups : [{ start: 0, count: src.attributes.position.count, materialIndex: 0 }];
        const col = new Float32Array(src.attributes.position.count * 3);
        for (const g of groups) {
          const c = ((mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1));
          for (let i = g.start; i < g.start + g.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', src.attributes.position.clone());
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.applyMatrix4(m.matrixWorld);
        parts.push(geo);
      });
      out = parts.length ? mergeGeometries(parts) : null;
      out?.computeVertexNormals();
      out?.computeBoundingSphere();
    }
    bakedCache.set(key, out);
    return out;
  },
};
