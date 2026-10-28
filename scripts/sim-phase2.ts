// Headless Phase 2 check: items settle, braking flings them, cooking → fire → extinguish, fuse pop, hunger.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import type { GameMsg } from '../src/types';

const rv = new RVModel();
const log: string[] = [];
const host = new HostSim((m: GameMsg) => { if (m.t === 'ev' && m.k === 'toast') log.push(m.text); }, (o) => rv.activeColliders(o));
host.crew(1);
const s = host.s;
const step = (sec: number, accel = { x: 0, z: 0 }) => { for (let t = 0; t < sec; t += 1 / 60) host.step(1 / 60, accel); };
const where = (k: string) => s.items.filter((i) => i.k === k).map((i) => `(${i.x.toFixed(2)},${i.y.toFixed(2)},${i.z.toFixed(2)})`).join(' ');

step(2);
console.log('settled patties:', where('patty'));
console.log('settled coffee:', where('coffee'), ' extinguisher:', where('extinguisher'));
// hard braking: RV decelerates at 7 m/s² → accelLocal.z = +7 (forward accel is −z)
step(1.2, { x: 0, z: 7 });
console.log('after braking patties:', where('patty'));
console.log('after braking cheese:', where('cheese'));

// cook: grab a patty, put it in the skillet, stove on
const patty = s.items.find((i) => i.k === 'patty')!;
host.handle(1, { t: 'act', id: `item:${patty.id}`, btn: 0 });
host.handle(1, { t: 'act', id: 'skillet', btn: 0 });
host.handle(1, { t: 'act', id: 'stove', btn: 0 });
step(40);
console.log('patty cook progress after 40s:', patty.d.toFixed(2));
step(25);
console.log('fire:', s.cab.fire.toFixed(2), 'smoke:', s.cab.smoke.toFixed(2), 'integrity:', s.rv.integrity.toFixed(1));
const ext = s.items.find((i) => i.k === 'extinguisher')!;
host.handle(1, { t: 'act', id: `item:${ext.id}`, btn: 0 });
console.log('holding:', s.items.find((i) => i.h === 1)?.k);
for (let i = 0; i < 20 && s.cab.fire > 0; i++) { host.handle(1, { t: 'act', id: 'spray', btn: 1 }); step(0.2); }
console.log('fire after spraying:', s.cab.fire.toFixed(2), 'ext uses left:', ext.d);

// burger: drop extinguisher, take a cooked patty → second patty cooked properly
host.handle(1, { t: 'drop', inRV: true, p: [0, 1.2, 0], v: [0, 0, 0] });
s.cab.stoveOn = true;
const p2 = s.items.find((i) => i.k === 'patty' && i.s === '')!;
host.handle(1, { t: 'act', id: `item:${p2.id}`, btn: 0 });
host.handle(1, { t: 'act', id: 'skillet', btn: 0 });
console.log('skillet holds:', s.items.filter((i) => i.s === 'skillet').map((i) => i.id), '(burnt one still in pan → expect "Skillet is full")');
// take the burnt one out, put p2 in
const burnt = s.items.find((i) => i.s === 'skillet' && i.id !== p2.id);
host.handle(1, { t: 'drop', inRV: true, p: [0, 1.2, 0], v: [0, 0, 0] });
if (burnt) { host.handle(1, { t: 'act', id: 'skillet', btn: 0 }); host.handle(1, { t: 'drop', inRV: true, p: [0.2, 1.2, 0.5], v: [0, 0, 0] }); }
host.handle(1, { t: 'act', id: `item:${p2.id}`, btn: 0 });
host.handle(1, { t: 'act', id: 'skillet', btn: 0 });
step(38);
host.handle(1, { t: 'act', id: 'skillet', btn: 0 }); // take cooked patty
const bun = s.items.find((i) => i.k === 'bun')!;
host.handle(1, { t: 'act', id: `item:${bun.id}`, btn: 0 });
const cheese = s.items.find((i) => i.k === 'cheese')!;
host.handle(1, { t: 'act', id: `item:${cheese.id}`, btn: 0 });
console.log('now holding:', s.items.find((i) => i.h === 1)?.k);
s.crew[1].hunger = 30;
host.handle(1, { t: 'act', id: 'self', btn: 0 });
console.log('hunger after eating:', s.crew[1].hunger.toFixed(0));

// fuse pop via pothole-sized jolt
(host as any).joltAll(1.2);
console.log('fuseOut:', s.cab.fuseOut, 'fuse at', where('fuse'));
step(2);
const fuse = s.items.find((i) => i.k === 'fuse')!;
console.log('fuse landed at', where('fuse'));
host.handle(1, { t: 'act', id: `item:${fuse.id}`, btn: 0 });
host.handle(1, { t: 'act', id: 'fusebox', btn: 0 });
console.log('fuseOut after fix:', s.cab.fuseOut);
console.log('\ntoasts:\n  ' + log.join('\n  '));
