// Headless Phase 3 check at Rusty's Oasis.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { fromSetLocal, toSetLocal } from '../src/stops/geom';
import { COUNTER, RUSTY_FRAME, RUSTY_SET, inStore } from '../src/stops/rusty';
import { LANE_OFFSET, roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

const rvm = new RVModel();
const log: string[] = [];
const host = new HostSim((m: GameMsg) => { if (m.t === 'ev' && m.k === 'toast') log.push(m.text); }, (o) => rvm.activeColliders(o));
const s = host.s; host.crew(1);
// pretend player 1's hands are wherever we say
let hand: [number, number, number] = [0, 0, 0];
host.handOf = () => hand;
const local = (lx: number, y: number, lz: number): [number, number, number] => { const [x, z] = fromSetLocal(RUSTY_SET, lx, lz); return [x, y, z]; };
const act = (id: string, btn = 0) => host.handle(1, { t: 'act', id, btn });
const drop = (p: [number, number, number]) => host.handle(1, { t: 'drop', inRV: false, p, v: [0, 0, 0] });
const step = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) host.step(1 / 60); };

// park the RV beside pump 1 (stop-local x≈14.2, heading along the road)
const [px, pz] = fromSetLocal(RUSTY_SET, 14.3, 0);
Object.assign(s.rv, { x: px, z: pz, yaw: RUSTY_FRAME.yaw, speed: 0, fuel: 4 });
(host as any).prevPose = { x: px, z: pz, yaw: RUSTY_FRAME.yaw };
step(1);
console.log('items after arriving:', s.items.length, 'nozzles:', s.items.filter((i) => i.k === 'nozzle').length, 'merch:', s.items.filter((i) => i.p > 0).length);

// card → pump
const card = s.items.find((i) => i.k === 'card')!;
hand = local(14, 1.2, 0);
act(`item:${card.id}`); act('rusty:pump0');
console.log('pump0 auth:', s.rusty.pumps[0].auth.toFixed(0), 'holding:', host.held(1)?.k);
drop(local(13, 1.2, 0.5)); step(0.5);
const noz = s.items.find((i) => i.k === 'nozzle' && i.d === 0)!;
act(`item:${noz.id}`);
for (let i = 0; i < 20; i++) { act('fuelport'); step(0.2); }
console.log(`fuel ${s.rv.fuel.toFixed(1)} gal, money $${s.money.toFixed(2)}, pump shows ${s.rusty.pumps[0].gal.toFixed(1)} gal $${s.rusty.pumps[0].cost.toFixed(2)}`);
// walk away with the nozzle → hose snaps back
hand = local(25, 1.2, 0); step(0.1);
console.log('nozzle back in holster:', noz.s, 'held by', noz.h);

// shopping: carry 2 patties to the counter, pay
const pats = s.items.filter((i) => i.k === 'patty' && i.p > 0).slice(0, 2);
for (const p of pats) { hand = local(40, 1.2, -6); act(`item:${p.id}`); hand = local(38.9, 1.3, 5); drop(local(38.9, 1.3, 4 + pats.indexOf(p) * 0.4)); step(0.5); }
console.log('patties on counter (local y):', pats.map((p) => { const [lx, lz] = toSetLocal(RUSTY_SET, p.x, p.z); return `${lx.toFixed(2)},${p.y.toFixed(2)},${lz.toFixed(2)}`; }).join(' '));
const cardItem = s.items.find((i) => i.k === 'card')!;
hand = local(37.5, 1.2, 4); act(`item:${cardItem.id}`); act('rusty:register');
console.log('patties paid:', pats.map((p) => p.p), 'money', s.money.toFixed(2));

// shoplift a soda while Cletus watches vs. reads
drop(local(37.5, 1.2, 3)); step(0.3);
const soda = s.items.find((i) => i.k === 'soda' && i.p > 0)!;
s.rusty.cletus.watch = true; s.rusty.cletus.t = 99;
hand = local(41, 1.2, -6); act(`item:${soda.id}`); step(0.1);
hand = local(30, 1.2, -2); step(0.1);
console.log('soda stolen while watched → heat', s.heat, 'price now', soda.p);
drop(local(30, 1, -2)); step(0.3);
const soda2 = s.items.find((i) => i.k === 'soda' && i.p > 0)!;
s.rusty.cletus.watch = false;
hand = local(41, 1.2, -6); act(`item:${soda2.id}`); step(0.1);
hand = local(30, 1.2, -2); step(0.1);
console.log('soda stolen while reading → heat', s.heat);
drop(local(30, 1, -1)); step(0.3);

// slots with the card
hand = local(37.5, 1.2, 3.2); act(`item:${cardItem.id}`);
const m0 = s.money;
for (let i = 0; i < 5; i++) { act('rusty:slot'); step(2.6); }
console.log(`5 slot spins: $${(s.money - m0).toFixed(2)}`);
// crab derby
act('rusty:crab1'); step(25);
console.log('derby winner', s.rusty.derby.winner, 'phase', s.rusty.derby.phase);

// car wash
drop(local(36, 1, 20)); step(0.3);
const sponge = s.items.find((i) => i.k === 'sponge')!;
hand = local(36, 1.2, 19); act(`item:${sponge.id}`);
const m1 = s.money;
for (let i = 0; i < 8; i++) for (let k = 0; k < 2; k++) { if (sponge.d <= 0) act('rusty:bucket'); act(`rusty:dirt${i}`); }
console.log(`wash done: +$${(s.money - m1).toFixed(2)}, car away ${s.rusty.wash.away}`);

// siphon
drop(local(37, 1, 21)); step(0.3);
const can = s.items.find((i) => i.k === 'jerrycan')!;
act(`item:${can.id}`);
for (let i = 0; i < 15; i++) act('rusty:suv');
console.log('jerrycan after siphon:', can.d, 'heat', s.heat);

// drive into the store wall
Object.assign(s.rv, { ...Object.fromEntries([['x', 0]]) });
const [sx, sz] = fromSetLocal(RUSTY_SET, 25, -2);
const yawIn = RUSTY_FRAME.yaw - Math.PI / 2; // face +x (toward the store)
Object.assign(s.rv, { x: sx, z: sz, yaw: yawIn, speed: 12, ignition: 2, gear: 3, handbrake: false });
(host as any).prevPose = { x: sx, z: sz, yaw: yawIn };
step(3);
const [lx] = toSetLocal(RUSTY_SET, s.rv.x, s.rv.z);
console.log(`crash test: RV front stopped at stop-local x=${lx.toFixed(1)} (store wall at 34), integrity ${s.rv.integrity.toFixed(0)}, inStore? ${inStore(lx, 0)}`);
console.log('\nledger:', host.ledger.map((l) => `${l.what} ${l.amount.toFixed(2)}`).join(' | '));
console.log('\ntoasts:\n  ' + log.join('\n  '));
void COUNTER; void roadX; void roadYaw; void LANE_OFFSET;
