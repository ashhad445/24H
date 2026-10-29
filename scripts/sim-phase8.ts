// Headless checks: inventory slots, car stripping + fence, dealer pistol, favor, shooting, weed/mafia plot.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { fromSetLocal } from '../src/stops/geom';
import { RUSTY_FRAME, RUSTY_SET } from '../src/stops/rusty';
import { chapelZ } from '../src/world/Route';
import { roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const rvm = new RVModel();
const evs: GameMsg[] = [];
const host = new HostSim((m: GameMsg) => { evs.push(m); }, (o) => rvm.activeColliders(o));
host.crew(1); const s = host.s, r = s.rv;
host.handOf = () => [0, 1.2, 0];
const act = (id: string) => host.handle(1, { t: 'act', id, btn: 0 });
const step = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) { host.step(1 / 60); r.integrity = 100; s.cab.flat = -1; s.cab.fuseOut = false; } };
const pocket = () => s.items.filter((i) => i.h === 1);
const hold = (k: string) => { const it = host.items.spawn(k, false, 0, 1, 0); it.h = 1; step(0.05); return it; };

const [px, pz] = fromSetLocal(RUSTY_SET, 14.3, 0);
Object.assign(r, { x: px, z: pz, yaw: RUSTY_FRAME.yaw, speed: 0, ignition: 0 });
(host as any).prevPose = { x: px, z: pz, yaw: RUSTY_FRAME.yaw };
step(1);

// ---- inventory ----
{
  const a = hold('hammer'), b = hold('tape');
  ok(a.sl !== b.sl && host.held(1)?.id === a.id, 'two carried items sit in different slots; the selected one is in hand');
  act('slot:1');
  ok(host.held(1)?.id === b.id, 'scrolling swaps the item in hand');
  act('slot:1'); ok(host.held(1) === undefined, 'empty third slot = empty hands');
  pocket().forEach((i) => host.items.remove(i.id)); step(0.1);
}

// ---- strip a car, fence the part ----
{
  const m0 = s.money;
  act('rusty:car0:ok'); step(0.05); // the minigame passed
  const part = host.held(1);
  ok(part?.k === 'battery' && s.rusty.cars[0].parts === 2, 'stripping the wash car gives its battery');
  act('rusty:dealer');
  ok(s.money === m0 + 40 && pocket().length === 0, 'Vinnie fences the battery for $40');
  s.rusty.cletus.chase = null; step(1.1);
  const jc = hold('jerrycan');
  act('rusty:car3:ok');
  ok(jc.d === 1.5 && s.rusty.cars[3].gas === 0, `siphoned a junker (${jc.d.toFixed(1)} gal)`);
  host.items.remove(jc.id); s.rusty.cletus.chase = null; step(0.1);
}

// ---- pistol from the dealer + shooting a civilian car ----
{
  const card = s.items.find((i) => i.k === 'card')!; card.h = 1; step(0.1);
  act('rusty:dealer');
  const gun = s.items.find((i) => i.k === 'pistol' && i.h === 1);
  ok(!!gun && gun.d === 12, 'bought a 12-round pistol');
  card.h = -1; step(0.1);
  while (host.held(1)?.k !== 'pistol') act('slot:1');
  const npc = { id: 777, k: 'sedan' as const, x: r.x + 40, z: r.z, yaw: 0, speed: 0, c: 0, w: 0 };
  s.npcs.push(npc);
  host.handle(1, { t: 'shoot', o: [r.x, 1.5, r.z], d: [1, 0, 0] });
  ok(gun!.d === 11 && npc.w > 0, 'a bullet wrecks the car in the crosshair');
}

// ---- favor ----
{
  const me = s.crew[1]; me.hunger = 90; const m0 = s.money;
  evs.length = 0; act('rusty:tammy');
  ok(s.money === m0 + 25 && me.hunger <= 25, 'Tammy: +$25, hunger drops to 25%');
  ok(evs.some((e) => e.t === 'ev' && e.k === 'fade' && e.to === 1), 'a blackout event goes to that player only');
  const m1 = s.money; act('rusty:tammy'); ok(s.money === m1, 'cooldown stops a repeat');
}

// ---- weed + mafia ----
{
  ok(s.items.some((i) => i.k === 'weed'), 'the stash starts in the RV');
  s.clock = 24 * 3600 + 1; step(0.1);
  ok(s.mafia.on, 'missing the deadline turns the mafia on');
  Object.assign(r, { z: chapelZ() + 500, speed: 0 }); r.x = roadX(r.z); r.yaw = roadYaw(r.z);
  (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
  step(1);
  ok(s.mafia.thugs.length === 6, 'six goons wait at the chapel');
  const gun = s.items.find((i) => i.k === 'pistol')!; gun.d = 99;
  for (const th of s.mafia.thugs) {
    r.x = th.x - 20; r.z = th.z; (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
    for (let n = 0; n < 2; n++) host.handle(1, { t: 'shoot', o: [r.x, 1.0, r.z], d: [1, 0, 0] });
  }
  ok(s.phase === 'ended' && /SHOWDOWN/.test(s.ending), 'killing every goon wins the run');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
