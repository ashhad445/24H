// Pause-menu settings: volume mixer, mouse sensitivity and field of view, saved per browser.
import { DEFAULT_VOLUMES, type Sound, type Volumes } from '../core/Sound';
import type { Input } from '../core/Input';
import { QUALITIES, type Quality } from '../fx/Graphics';

interface Saved extends Volumes { sens: number; fov: number; gfx: Quality }
const KEY = 'rr-settings';

export function setupSettings(sound: Sound, input: Input, onQuality: (q: Quality) => void) {
  let saved: Saved = { ...DEFAULT_VOLUMES, sens: input.sensitivity, fov: 75, gfx: 'medium' };
  try { saved = { ...saved, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* storage blocked */ }

  const apply = () => {
    sound.setVolumes(saved);
    input.sensitivity = saved.sens;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  };

  if (!QUALITIES.includes(saved.gfx)) saved.gfx = 'medium';
  const bind = (id: string, key: Exclude<keyof Saved, 'gfx'>, fmt: (v: number) => string) => {
    const el = document.getElementById(id) as HTMLInputElement;
    const out = el.nextElementSibling as HTMLOutputElement;
    el.value = String(saved[key]);
    out.textContent = fmt(saved[key]);
    el.addEventListener('input', () => { saved[key] = Number(el.value); out.textContent = fmt(saved[key]); apply(); });
  };
  const pct = (v: number) => `${Math.round(v * 100)}`;
  bind('v-master', 'master', pct);
  bind('v-vehicle', 'vehicle', pct);
  bind('v-effects', 'effects', pct);
  bind('v-radio', 'radio', pct);
  bind('v-sens', 'sens', (v) => (v / 0.0022).toFixed(1) + '×');
  bind('v-fov', 'fov', (v) => `${Math.round(v)}°`);
  const gfx = document.getElementById('v-gfx') as HTMLSelectElement;
  gfx.value = saved.gfx;
  gfx.addEventListener('change', () => { saved.gfx = gfx.value as Quality; onQuality(saved.gfx); apply(); });
  document.getElementById('p-resume')!.addEventListener('click', () => { sound.init(); apply(); input.lock(); });
  apply();
  return { reapply: apply, get fov() { return saved.fov; }, get gfx() { return saved.gfx; } };
}
