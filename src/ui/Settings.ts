// Pause-menu settings: volume mixer + mouse sensitivity, saved per browser.
import { DEFAULT_VOLUMES, type Sound, type Volumes } from '../core/Sound';
import type { Input } from '../core/Input';

interface Saved extends Volumes { sens: number }
const KEY = 'rr-settings';

export function setupSettings(sound: Sound, input: Input) {
  let saved: Saved = { ...DEFAULT_VOLUMES, sens: input.sensitivity };
  try { saved = { ...saved, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* storage blocked */ }

  const apply = () => {
    sound.setVolumes(saved);
    input.sensitivity = saved.sens;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  };

  const bind = (id: string, key: keyof Saved, fmt: (v: number) => string) => {
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
  document.getElementById('p-resume')!.addEventListener('click', () => { sound.init(); apply(); input.lock(); });
  apply();
  return { reapply: apply };
}
