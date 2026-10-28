// Drive the right lane at ~55 mph for 3 minutes with a lane-keeping autopilot; count hazard hits.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { LANE_OFFSET, roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

const rv = new RVModel();
let jolts = 0; const toasts: string[] = [];
const host = new HostSim((m: GameMsg) => {
  if (m.t === 'ev' && m.k === 'jolt') jolts++;
  if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text);
}, (o) => rv.activeColliders(o));
host.crew(1); host.crew(2);
const s = host.s; const r = s.rv;
s.seats.driver = 1; r.ignition = 2; r.handbrake = false; r.gear = 4; r.speed = 24;
s.crew[1].caf = 9999; // keep the autopilot awake
for (let t = 0; t < 180; t += 1 / 60) {
  // aim at a point 25 m ahead on the right lane
  const az = r.z - 25; const yawT = roadYaw(az);
  const tx = roadX(az) + LANE_OFFSET * Math.cos(yawT);
  const desired = Math.atan2(-(tx - r.x), -(az - r.z));
  let err = desired - r.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
  const th = r.speed < 24.5 ? 0.8 : 0.2;
  host.handle(1, { t: 'drive', i: { th, br: 0, st: Math.max(-1, Math.min(1, err * 6)), horn: false } });
  host.step(1 / 60);
  if (s.cab.flat >= 0) { s.cab.flat = -1; }
  if (s.cab.fuseOut) s.cab.fuseOut = false;
}
console.log(`3 min: ${(r.odometer / 225).toFixed(1)} miles, jolts ${jolts}, integrity ${r.integrity.toFixed(1)}, lateral err ${(r.x - roadX(r.z)).toFixed(2)}`);
console.log(toasts.filter((t) => /BLOWOUT|Fuse/.test(t)).join('\n'));
