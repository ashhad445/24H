// Headless checks: two full jerrycans, Cletus' bat chase, eating unpaid food, car-heist results, Roscoe on foot.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { KINDS } from '../src/items/Items';
import { fromSetLocal } from '../src/stops/geom';
import { RUSTY_FRAME, RUSTY_SET } from '../src/stops/rusty';
import type { GameMsg } from '../src/types';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const rvm = new RVModel();
const evs: GameMsg[] = [];
const host = new HostSim((m: GameMsg) => { evs.push(m); }, (o) => rvm.activeColliders(o));
host.crew(1); const s = host.s, r = s.rv;
let me: [number, number, number] = [0, 1.2, 0];
host.handOf = () => me;
const act = (id: string) => host.handle(1, { t: 'act', id, btn: 0 });
const step = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) { host.step(1 / 60); r.integrity = 100; s.cab.flat = -1; s.cab.fuseOut = false; } };
const ko = () => evs.some((e) => e.t === 'ev' && e.k === 'fade' && e.to === 1 && e.ko);

ok(s.items.filter((i) => i.k === 'jerrycan' && i.d === 5).length === 2, 'the RV starts with two full 5-gal jerrycans');

const [px, pz] = fromSetLocal(RUSTY_SET, 14.3, 0);
Object.assign(r, { x: px, z: pz, yaw: RUSTY_FRAME.yaw, speed: 0, ignition: 0 });
(host as any).prevPose = { x: px, z: pz, yaw: RUSTY_FRAME.yaw };
step(1);
const lot: [number, number, number] = [px + 6 * Math.cos(r.yaw), 1.2, pz - 6 * Math.sin(r.yaw)]; // beside the RV, outside the store
const cl = s.rusty.cletus;

// ---- shoplifting in front of Cletus ----
{
  const it = s.items.find((i) => i.p > 0 && i.k !== 'scratch')!;
  me = [it.x, 1.2, it.z]; it.h = 1; step(0.1);
  cl.watch = true; cl.t = 100; evs.length = 0;
  const h0 = s.heat;
  me = lot; step(0.1);
  ok(!!cl.chase && s.heat === h0 + 1 && it.st === 1, 'walking out unpaid while he watches: +1 heat, Cletus grabs his bat');
  step(9);
  ok(ko() && !s.items.includes(it) && !cl.chase, 'he catches you: knocked out, stolen item taken back');
}

// ---- eating unpaid food inside ----
{
  const food = s.items.find((i) => i.p > 0 && KINDS[i.k]?.food)!;
  me = [food.x, 1.2, food.z]; food.h = 1; step(0.1);
  while (host.held(1)?.id !== food.id) act('slot:1');
  cl.watch = true; cl.t = 100; cl.chase = null;
  act('self');
  ok(!!cl.chase && !s.items.includes(food), 'eating unpaid food in front of Cletus starts a chase');
  cl.chase = null; me = lot; step(1.2);
}

// ---- car heist results ----
{
  s.items.filter((i) => i.h === 1).forEach((i) => { i.h = -1; }); step(0.1);
  const h0 = s.heat;
  act('rusty:car2:fail');
  ok(s.heat === h0 + 1 && !!cl.chase && !host.held(1), 'failed strip: no part, +1 heat, Cletus comes');
  cl.chase = null; step(1.2);
  act('rusty:car0:ok');
  const part = host.held(1);
  ok(part?.k === 'battery' && part.st === 1 && s.rusty.cars[0].parts === 2, 'passed strip: the battery is yours (flagged stolen)');
  part!.h = -1; step(1.2); cl.chase = null;
  const can = host.items.spawn('jerrycan', false, 0, 0, 0); can.h = 1; can.d = 0; step(0.1);
  while (host.held(1)?.id !== can.id) act('slot:1');
  act('rusty:car1:ok');
  ok(can.d === 1.5 && s.rusty.cars[1].gas === 2, `passed siphon: +1.5 gal (${can.d})`);
  can.h = -1; step(0.1); cl.chase = null;
}

// ---- Roscoe on foot ----
{
  s.heat = 2; s.wanted = 1; me = lot; evs.length = 0;
  const car = (host as any).traffic.spawnChaser('cop');
  car.x = r.x + 15; car.z = r.z; car.speed = 0;
  Object.assign(s.cop, { phase: 3, t: 0, fled: false });
  step(0.1);
  ok(s.cop.phase === 5 && s.cop.foot?.who === 1, 'the wanted player is on foot: Roscoe gets out with the taser');
  const m0 = s.money;
  s.cop.foot!.x = me[0] + 8; s.cop.foot!.z = me[2];
  step(3);
  ok(s.cop.phase === 4 && s.money < m0 && s.heat === 0 && ko(), `tased: fine charged ($${(m0 - s.money).toFixed(0)}), heat cleared, he leaves`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
