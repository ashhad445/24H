// Headless check of store fixtures (drinks fridge, roller, snack rack), the RV fridge, and food boosts.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { STOPS } from '../src/stops/Stops';
import { stopFrame } from '../src/stops/kit';
import { fromSetLocal } from '../src/stops/geom';
import { KINDS } from '../src/items/Items';
import type { GameMsg } from '../src/types';

let fails = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };

const rvm = new RVModel();
const toasts: string[] = [];
const fed: GameMsg[] = [];
const host = new HostSim((m: GameMsg) => {
  if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text);
  if (m.t === 'ev' && m.k === 'fed') fed.push(m);
}, (o) => rvm.activeColliders(o));
host.crew(1);
const s = host.s;
let hand: [number, number, number] = [0, 0, 0];
host.handOf = () => hand;
const act = (id: string) => host.handle(1, { t: 'act', id, btn: 0 });
const step = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) host.step(1 / 60); };
const mine = () => s.items.filter((i) => i.h === 1);

// park at Rusty's (the 'rustyx' extras share its frame)
const def = STOPS.find((d) => d.id === 'rustyx')!;
const set = stopFrame(def);
Object.assign(s.rv, { x: set.x, z: set.z + 40, speed: 0 }); (host as any).prevPose = { x: set.x, z: set.z + 40, yaw: s.rv.yaw };
step(0.5);
const L = (lx: number, y: number, lz: number): [number, number, number] => { const [x, z] = fromSetLocal(set, lx, lz); return [x, y, z]; };
check(!!s.stops.rustyx, "Rusty's coolers activate with Rusty's");

// fridge: closed door blocks, open lets you take a priced drink
hand = L(36, 1.2, -10.5);
act('stop:rustyx:fridge:row0');
check(mine().length === 0 && toasts.at(-1) === 'Open the door first', 'closed fridge: can\'t reach in');
act('stop:rustyx:fridge:door');
check(s.stops.rustyx.fridge.open === true, 'door opens');
act('stop:rustyx:fridge:row0');
const water = mine().find((i) => i.k === 'water');
check(!!water && water.p === 1, `took a water at $${water?.p}`);
check(s.stops.rustyx.fridge.left[0] === 3, 'stock went down 4 → 3');
step(13);
check(s.stops.rustyx.fridge.open === false, 'door swings shut on its own');

// roller + rack, then pockets are full
hand = L(36, 1.2, 6.8);
act('stop:rustyx:roller:row0');
hand = L(38.4, 1.2, -10.8);
act('stop:rustyx:rack:row2');
check(mine().length === 3 && mine().some((i) => i.k === 'hotdog') && mine().some((i) => i.k === 'candy'), 'hot dog + candy bar in pockets');
act('stop:rustyx:rack:row0');
check(mine().length === 3 && /Pockets full/.test(toasts.at(-1) ?? ''), 'fourth item refused: pockets full');

// pay at Cletus's counter (Rusty's checkout handles kit stock too)
const before = s.money;
for (const it of mine()) { it.h = -1; it.rv = false; [it.x, it.y, it.z] = L(38.9, 1.1, 3.2 + Math.random() * 0.4); it.vx = it.vy = it.vz = 0; }
step(0.5);
const cardIt = s.items.find((i) => i.k === 'card')!; cardIt.s = ''; cardIt.h = 1;
act('rusty:register');
check(Math.abs(before - s.money - (1 + 3 + 1.5)) < 0.01, `paid $${(before - s.money).toFixed(2)} for water + hot dog + candy`);

// boosts: coffee stronger than the energy drink
const cf = KINDS.coffee.food!.boost!, en = KINDS.energy.food!.boost!;
check(cf.t > en.t && cf.drain < en.drain && cf.regen > en.regen && KINDS.coffee.food!.stam > KINDS.energy.food!.stam, 'coffee buzz > energy drink buzz');
const coffee = s.items.find((i) => i.k === 'coffee')!; coffee.s = ''; coffee.h = 1; coffee.p = 0; cardIt.h = -1; cardIt.s = 'tray';
s.crew[1].slot = coffee.sl = mine().findIndex((i) => i === coffee) >= 0 ? coffee.sl : 0;
act('self');
const ev = fed.at(-1) as any;
check(!!ev && ev.boost?.[0] === cf.t, `drinking coffee sends a ${ev?.boost?.[0]} s sprint boost`);

// RV fridge: starts with drinks, LIFO take, put back, full at 8
check(s.cab.fridge.length === 3, 'RV fridge starts stocked (soda + 2 water)');
for (const it of mine()) host.items.remove(it.id);
act('fridge');
const got = mine()[0];
check(got?.k === 'water' && s.cab.fridge.length === 2, 'took a water out of the RV fridge');
act('fridge');
check(mine().length === 0 && s.cab.fridge.length === 3, 'put it back');
for (let n = 0; n < 6; n++) { const it = host.items.spawn('soda', true, 0, 1, 0); it.h = 1; act('fridge'); }
check(s.cab.fridge.length === 8 && /full/.test(toasts.at(-1) ?? ''), 'RV fridge holds 8, refuses the 9th');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
