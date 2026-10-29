// Compile shaders before something is first drawn, so new stops / cars / items don't stall a frame.
// With KHR_parallel_shader_compile (desktop Chrome) the compile runs off the main thread.
import * as THREE from 'three';

let R: THREE.WebGLRenderer | null = null, C: THREE.Camera | null = null, S: THREE.Scene | null = null;
let RT: THREE.WebGLRenderTarget | null = null;

/** `rt`: a render target (the mirrors). Shaders drawn into one are a separate variant (no tone mapping). */
export function initShaderWarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, rt?: THREE.WebGLRenderTarget) {
  R = renderer; C = camera; S = scene; RT = rt ?? null;
}

/** Compile every material under `obj` (hidden ones too) against the scene's lights. */
export function warm(obj: THREE.Object3D): Promise<void> {
  if (!R || !C || !S) return Promise.resolve();
  try {
    const jobs = [R.compileAsync(obj, C, S)];
    if (RT) {
      const prev = R.getRenderTarget();
      R.setRenderTarget(RT); // the compile itself is synchronous; only the ready-check is async
      jobs.push(R.compileAsync(obj, C, S));
      R.setRenderTarget(prev);
    }
    return Promise.all(jobs).then(() => undefined, () => undefined);
  } catch { return Promise.resolve(); }
}
