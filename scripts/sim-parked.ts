// A parked RV in the right lane: does traffic hit it?
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import type { GameMsg } from '../src/types';
const rvm = new RVModel();
const toasts: string[] = [];
let lastT = 0;
const host = new HostSim((m: GameMsg) => {
  if (m.t === 'ev' && m.k === 'toast') {
    toasts.push(m.text);
    if (/Fender|SMASH|HEAD/.test(m.text)) {
      const rr = host.s.rv; const c = Math.cos(rr.yaw), sn = Math.sin(rr.yaw);
      for (const n of host.s.npcs) {
        const dx = n.x - rr.x, dz = n.z - rr.z; if (Math.hypot(dx, dz) > 9) continue;
        const L = (host.traffic as any).lanes.get(n.id);
        console.log(`  t=${lastT.toFixed(1)} ${n.k} local x=${(dx * c - dz * sn).toFixed(1)} z=${(dx * sn + dz * c).toFixed(1)} v=${n.speed.toFixed(1)} lane=${L?.lane} dir=${L?.dir} off=${L?.off.toFixed(2)} wrecked=${n.w.toFixed(1)}`);
      }
    }
  }
}, (o) => rvm.activeColliders(o));
host.crew(1);
const r = host.s.rv;
for (let t = 0; t < 180; t += 1 / 60) { lastT = t; host.step(1 / 60); }
console.log(`3 min parked: integrity ${r.integrity.toFixed(1)}, rv pos drift ${r.x.toFixed(2)},${r.z.toFixed(2)}`);
console.log(toasts.join('\n'));
