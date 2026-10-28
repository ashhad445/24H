// Props must stay in the RV through crashes, rams and instant speed changes (door closed).
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import type { GameMsg } from '../src/types';

const rvm = new RVModel();
const host = new HostSim((_m: GameMsg) => {}, (o) => rvm.activeColliders(o));
const s = host.s; const r = s.rv;
const inRV = () => s.items.filter((i) => i.rv).length;
const n0 = inRV();
const frame = (dt = 1 / 60) => { rvm.update(r, s.cab, dt); host.step(dt, rvm.accelLocal); };
for (let k = 0; k < 40; k++) {
  r.speed = k % 2 ? 35 : 0;            // brutal instant speed swaps
  r.yaw += 0.2;                        // and yaw kicks
  host.joltAll(1.5);                   // max pothole
  for (let i = 0; i < 20; i++) frame();
  for (let i = 0; i < 3; i++) frame(0.05); // frame hitch
}
console.log(`props inside RV: ${n0} → ${inRV()} (door closed)`);
r.doorOpen = true; r.speed = 0;
for (let k = 0; k < 20; k++) { r.speed = k % 2 ? 30 : 0; for (let i = 0; i < 30; i++) frame(); }
console.log(`with the door open and hard braking: ${inRV()} left inside (some may fly out the door — intended)`);
