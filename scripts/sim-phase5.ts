// Headless Phase 5: take the canyon branch at fork A, check the road follows, then finish at the chapel.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { FORKS, chapelZ, chosen, forkZ, routeOffset, totalMiles } from '../src/world/Route';
import { LANE_OFFSET, baseX, chunkHazards, roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

const rvm = new RVModel();
const toasts: string[] = [];
const host = new HostSim((m: GameMsg) => { if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text); }, (o) => rvm.activeColliders(o));
host.crew(1); const s = host.s, r = s.rv;
s.seats.driver = 1; s.crew[1].caf = 1e9; s.crew[1].hunger = 1e9;
(host as any).stormIn = 1e9; // no storms in this test
const place = (z: number) => {
  const yaw = roadYaw(z);
  Object.assign(r, { x: roadX(z) + LANE_OFFSET * Math.cos(yaw), z: z, yaw, speed: 22, ignition: 2, gear: 4, handbrake: false, fuel: 25 });
  (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
};
const fA = FORKS[0];
const hazBefore = [1, 2, 3].map((k) => chunkHazards(Math.floor(-forkZ(fA) / 250) + 4 + k).length).reduce((a, b) => a + b);
place(forkZ(fA) + 400);
// steer along branch 1 (the canyon) of fork A
const pickX = (z: number) => baseX(z) + routeOffset(z, (id) => (id === fA.id ? 1 : chosen(id))) + LANE_OFFSET;
for (let t = 0; t < 60; t += 1 / 60) {
  const az = r.z - 25;
  let err = Math.atan2(-(pickX(az) - r.x), -(az - r.z)) - r.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
  host.handle(1, { t: 'drive', i: { th: r.speed < 24 ? 0.8 : 0.1, br: 0, st: Math.max(-1, Math.min(1, err * 6)), horn: false } });
  host.step(1 / 60);
  if (s.cab.flat >= 0) s.cab.flat = -1;
  r.integrity = 100;
}
console.log(`route ${JSON.stringify(s.route)}, total ${totalMiles()} mi, RV distance from road center: ${Math.abs(r.x - roadX(r.z)).toFixed(1)} m`);
const hazAfter = [1, 2, 3].map((k) => chunkHazards(Math.floor(-forkZ(fA) / 250) + 4 + k).length).reduce((a, b) => a + b);
console.log(`potholes in 3 chunks past the fork: ${hazBefore} (default) → ${hazAfter} (canyon)`);

// finish line
place(chapelZ() + 80);
for (let t = 0; t < 8 && s.phase === 'drive'; t += 1 / 60) {
  host.handle(1, { t: 'drive', i: { th: 0.6, br: 0, st: 0, horn: false } });
  host.step(1 / 60);
}
console.log(`phase ${s.phase}: ${s.ending}`);
console.log(toasts.filter((t) => /took|SANDSTORM/.test(t)).join('\n'));
