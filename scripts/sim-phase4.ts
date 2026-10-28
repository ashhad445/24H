// Headless Phase 4: traffic, radar, Roscoe pull-over, Loan Shark.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { LANE_OFFSET, roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

const rvm = new RVModel();
const toasts: string[] = []; let jolts = 0;
const host = new HostSim((m: GameMsg) => {
  if (m.t === 'ev' && m.k === 'toast') {
    toasts.push(m.text);
    if (/Fender|SMASH|HEAD/.test(m.text)) {
      const rr = host.s.rv; const c = Math.cos(rr.yaw), sn = Math.sin(rr.yaw);
      for (const n of host.s.npcs) {
        const dx = n.x - rr.x, dz = n.z - rr.z; if (Math.hypot(dx, dz) > 9) continue;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // RV-local
        console.log(`  CRASH ${m.text} ${n.k} local x=${lx.toFixed(1)} z=${lz.toFixed(1)} npcV=${(n.speed*2.237).toFixed(0)} rvV=${(rr.speed*2.237).toFixed(0)} relYaw=${(n.yaw-rr.yaw).toFixed(2)} cop=${host.s.cop.phase}`);
      }
    }
  }
  if (m.t === 'ev' && m.k === 'jolt') jolts++;
}, (o) => rvm.activeColliders(o));
host.crew(1); const s = host.s; const r = s.rv;
s.seats.driver = 1; s.crew[1].caf = 1e9; s.crew[1].hunger = 1e9;
Object.assign(r, { ignition: 2, handbrake: false, gear: 5, speed: 30, fuel: 25 });
let wantMph = 68;
const drive = (sec: number) => {
  for (let t = 0; t < sec; t += 1 / 60) {
    const az = r.z - 25, yawT = roadYaw(az);
    const tx = roadX(az) + LANE_OFFSET * Math.cos(yawT);
    let err = Math.atan2(-(tx - r.x), -(az - r.z)) - r.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
    const mph = r.speed * 2.237;
    // simple adaptive cruise: brake for a car in our lane ahead
    const lead = s.npcs.find((n) => n.k !== 'cop' && n.k !== 'shark' && r.z - n.z > 0 && r.z - n.z < 45 && Math.abs(n.x - (roadX(n.z) + LANE_OFFSET)) < 2.4 && Math.cos(n.yaw - r.yaw) > 0);
    const brake = (wantMph === 0 && r.speed > 0.3) || (lead && lead.speed < r.speed);
    host.handle(1, { t: 'drive', i: { th: !brake && mph < wantMph ? 0.9 : 0.1, br: brake ? 1 : 0, st: Math.max(-1, Math.min(1, err * 6)), horn: false } });
    host.step(1 / 60);
    if (s.cab.flat >= 0) s.cab.flat = -1;
    if (s.cab.fuseOut) s.cab.fuseOut = false;
    r.integrity = Math.max(r.integrity, 30);
  }
};
drive(120);
const kinds = s.npcs.map((n) => n.k).join(',');
console.log(`2 min at ~68 mph: ${(r.odometer / 225).toFixed(1)} mi, npcs [${kinds}], heat ${s.heat}, cop phase ${s.cop.phase}, jolts ${jolts}`);
// count traffic that passed us or that we passed: just print distances of nearby cars
console.log('nearby:', s.npcs.map((n) => `${n.k}@${(n.z - r.z).toFixed(0)}m ${(n.speed * 2.237).toFixed(0)}mph`).join(' | '));

// Roscoe: give heat, wait for him to arrive, pull over, pay
s.heat = Math.max(1, s.heat);
wantMph = 55; drive(45);
console.log(`after 45s with heat: cop phase ${s.cop.phase}, cop dist ${(() => { const c = s.npcs.find((n) => n.k === 'cop'); return c ? Math.hypot(c.x - r.x, c.z - r.z).toFixed(0) : 'none'; })()}`);
wantMph = 0; drive(8);
console.log(`pulled over: speed ${r.speed.toFixed(2)}, cop phase ${s.cop.phase}`);
const card = s.items.find((i) => i.k === 'card')!;
card.s = ''; card.h = 1;
const m0 = s.money;
host.handle(1, { t: 'act', id: 'roscoe', btn: 0 });
console.log(`ticket: -$${(m0 - s.money).toFixed(0)}, heat ${s.heat}, cop phase ${s.cop.phase}`);
wantMph = 60; drive(25);
console.log(`cop after leaving: phase ${s.cop.phase}`);

// Loan Shark
s.money = -30; const i0 = r.integrity; const j0 = jolts;
drive(45);
console.log(`shark 45s: on ${s.shark.on}, rams(jolts) ${jolts - j0}, integrity ${i0.toFixed(0)}→${r.integrity.toFixed(0)}`);
s.money = 10; drive(30);
console.log(`after paying back: shark on ${s.shark.on}`);
console.log('\n' + toasts.filter((t) => !/Fuse|Power|BLOWOUT|Stalled/.test(t)).slice(0, 30).join('\n'));
