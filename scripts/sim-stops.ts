// Headless check of the kit-built stops: activation per branch + each stop's main loop.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { STOPS } from '../src/stops/Stops';
import { stopFrame } from '../src/stops/kit';
import { fromSetLocal } from '../src/stops/geom';
import { setRouteChoices } from '../src/world/Route';
import type { GameMsg } from '../src/types';

const run = (route: number[]) => {
  const rvm = new RVModel();
  const toasts: string[] = [];
  const host = new HostSim((m: GameMsg) => { if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text); }, (o) => rvm.activeColliders(o));
  host.crew(1);
  const s = host.s; s.route = route.slice(); setRouteChoices(s.route);
  let hand: [number, number, number] = [0, 0, 0];
  host.handOf = () => hand;
  const act = (id: string) => host.handle(1, { t: 'act', id, btn: 0 });
  const step = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) host.step(1 / 60); };
  const card = s.items.find((i) => i.k === 'card')!;
  const grabCard = () => { const c = s.items.find((i) => i.k === 'card')!; c.s = ''; c.h = 1; };
  return { host, s, act, step, toasts, card, grabCard, setHand: (h: [number, number, number]) => { hand = h; } };
};
const park = (r: ReturnType<typeof run>, id: string) => {
  const def = STOPS.find((d) => d.id === id)!;
  const set = stopFrame(def);
  Object.assign(r.s.rv, { x: set.x, z: set.z + 40, speed: 0 }); (r.host as any).prevPose = { x: set.x, z: set.z + 40, yaw: r.s.rv.yaw };
  r.step(0.5);
  return (lx: number, y: number, lz: number): [number, number, number] => { const [x, z] = fromSetLocal(set, lx, lz); return [x, y, z]; };
};

// --- I-15 + Motel Row
{
  const r = run([0, 0]);
  const L = park(r, 'diner');
  console.log('diner active:', !!r.s.stops.diner, ' junkyard active:', !!r.s.stops.junkyard);
  // grill job: grab patty from fridge, grill it, serve
  r.setHand(L(33, 1.2, 1)); r.act('stop:diner:grill:fridge');
  r.act('stop:diner:grill:g0'); r.step(19);
  r.act('stop:diner:grill:g0');
  const m0 = r.s.money; r.act('stop:diner:grill:window');
  console.log(`grill job: patty d≈${'cooked'} → +$${(r.s.money - m0).toFixed(0)}, tickets left ${r.s.stops.diner.grill.tickets}`);
  // buy a burger at the counter
  const burger = r.s.items.find((i) => i.k === 'burger' && i.p > 0)!;
  r.setHand(L(23, 1.2, 5)); r.act(`item:${burger.id}`);
  r.host.handle(1, { t: 'drop', inRV: false, p: L(27.5, 1.3, -4), v: [0, 0, 0] }); r.step(0.5);
  r.grabCard(); const m1 = r.s.money; r.act('stop:diner:shop:register');
  console.log(`bought a burger: -$${(m1 - r.s.money).toFixed(2)}, unpaid now ${burger.p}`);
  r.act('stop:diner:juke:play');
  // motel
  const M = park(r, 'motel'); void M;
  const clock0 = r.s.clock; r.s.crew[1].hypno = 0.8;
  r.act('stop:motel:bed:sleep');
  console.log(`motel: slept ${((r.s.clock - clock0) / 3600).toFixed(1)}h, hypno ${r.s.crew[1].hypno}, casino active: ${!!r.s.stops.casino}`);
  console.log(r.toasts.slice(-4).join('\n'));
}
// --- Canyon + Cactus Strip
{
  const r = run([1, 1]);
  const L = park(r, 'junkyard');
  console.log('\njunkyard active:', !!r.s.stops.junkyard, ' diner active:', !!r.s.stops.diner, ' loot items:', r.s.items.filter((i) => !i.rv).length);
  const spare = r.s.items.find((i) => i.k === 'spare' && !i.rv)!;
  r.setHand(L(33, 1.2, 4)); r.act(`item:${spare.id}`);
  const m0 = r.s.money; r.act('stop:junkyard:pawn:sell');
  console.log(`pawned a junkyard spare: +$${(r.s.money - m0).toFixed(0)}`);
  park(r, 'casino');
  r.grabCard();
  const m1 = r.s.money;
  for (let i = 0; i < 6; i++) { r.act('stop:casino:hr1:spin'); r.step(2.6); }
  console.log(`6 high-roller spins: ${(r.s.money - m1).toFixed(0)}`);
  const m2 = r.s.money; r.act('stop:casino:roulette:red'); r.step(12);
  console.log(`roulette on red: ${(r.s.money - m2).toFixed(0)} (result ${r.s.stops.casino.roulette.result})`);
  const m3 = r.s.money; r.act('stop:casino:bj:deal'); r.act('stop:casino:bj:stand'); r.step(6);
  console.log(`blackjack hand: ${(r.s.money - m3).toFixed(0)}`);
  // last chance gas
  const LC = park(r, 'lastchance');
  console.log(`last chance active: ${!!r.s.stops.lastchance}, nozzles: ${r.s.items.filter((i) => i.k === 'nozzle').length}`);
  r.act('stop:lastchance:pump:pump0');
  r.host.handle(1, { t: 'drop', inRV: true, p: [0, 1.2, 0], v: [0, 0, 0] }); r.step(0.3);
  const noz = r.s.items.find((i) => i.k === 'nozzle' && i.d >= 100)!;
  r.setHand(LC(13, 1.2, -3)); r.act(`item:${noz.id}`);
  r.s.rv.fuel = 5; const m4 = r.s.money;
  for (let i = 0; i < 10; i++) { r.act('fuelport'); r.step(0.2); }
  console.log(`pumped at $4: fuel ${r.s.rv.fuel.toFixed(1)} gal, -$${(m4 - r.s.money).toFixed(2)}`);
  console.log(r.toasts.slice(-5).join('\n'));
}
