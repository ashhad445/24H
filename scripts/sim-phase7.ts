// Headless checks for: item friction + de-bundling, speed cameras, nitrous, rocks vs Roscoe.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { NOS, RV } from '../src/config';
import { LANE_OFFSET, chunkRadar, chunkRocks, nextRadar, roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

const rvm = new RVModel();
const toasts: string[] = []; const sfx: string[] = [];
const host = new HostSim((m: GameMsg) => {
  if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text);
  if (m.t === 'ev' && m.k === 'sfx') sfx.push(m.name);
}, (o) => rvm.activeColliders(o));
host.crew(1); const s = host.s, r = s.rv;
s.seats.driver = 1; s.crew[1].caf = 1e9; s.crew[1].hunger = 1e9;
Object.assign(r, { ignition: 2, handbrake: false, gear: 0, speed: 0, fuel: 25 });
const step = (sec: number, drive = { th: 0, br: 0, st: 0, horn: false }) => {
  for (let t = 0; t < sec; t += 1 / 60) {
    host.handle(1, { t: 'drive', i: drive });
    host.step(1 / 60, { x: 0, z: 0 });
    r.integrity = 100; s.cab.flat = -1; s.cab.fuseOut = false;
  }
};

// ---------- friction ----------
{
  const rock = host.items.spawn('rock', true, 0, 1.0, 0);
  host.items.setVel(rock.id, [5, 0, 0]);
  const x0 = rock.x;
  step(2);
  ok(rock.x - x0 < 1.4, `thrown item stops quickly on the carpet (slid ${(rock.x - x0).toFixed(2)} m)`);
  host.items.remove(rock.id);
  const burger = host.items.spawn('burger', true, 0.2, 0.8, -0.2, '', 0);
  host.items.setVel(burger.id, [0, 0, 0]);
  for (let t = 0; t < 1; t += 1 / 60) host.items.step(1 / 60, { x: 0, z: 0 }); // settle on the counter first
  const z0 = burger.z;
  for (let t = 0; t < 2; t += 1 / 60) host.items.step(1 / 60, { x: 0, z: -5 }); // 5 m/s² forward accel
  ok(Math.abs(burger.z - z0) < 0.05, `item stays put under 5 m/s² (moved ${(burger.z - z0).toFixed(3)} m)`);
}

// ---------- bundling ----------
{
  const list = [];
  for (let i = 0; i < 12; i++) list.push(host.items.spawn(i % 2 ? 'soda' : 'coffee', true, -0.3, 0.7, 1.5));
  step(3);
  let minD = 9;
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) minD = Math.min(minD, Math.hypot(list[a].x - list[b].x, list[a].z - list[b].z));
  ok(minD > 0.04, `a dozen cans dropped on one spot spread out (closest pair ${minD.toFixed(3)} m)`);
  list.forEach((i) => host.items.remove(i.id));
}

// ---------- speed cameras ----------
{
  const cam = chunkRadar(3)!;
  ok(!!cam, `speed camera exists at chunk 3 (z=${cam?.z.toFixed(0)})`);
  const ahead = nextRadar(cam.z + 600);
  ok(ahead?.id === 3, 'nextRadar finds the camera ahead');
  const pass = (mph: number) => {
    s.heat = 0; r.gear = 5; r.speed = mph / 2.23694; r.z = cam.z + 80; r.x = roadX(r.z); r.yaw = roadYaw(r.z);
    (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
    for (let t = 0; t < 5; t += 1 / 60) { host.handle(1, { t: 'drive', i: { th: 0.4, br: 0, st: 0, horn: false } }); host.step(1 / 60); r.integrity = 100; }
    return s.heat;
  };
  (host.traffic as any).radarsHit.clear();
  ok(pass(90) === 0, 'driving 90 mph under the camera: no ticket');
  (host.traffic as any).radarsHit.clear();
  ok(pass(170) >= 1, 'driving 170 mph under the camera: flashed (+heat)');
  ok(sfx.includes('camera'), 'camera flash sound event emitted');
  s.heat = 0; (host.traffic as any).copDelay = 25;
}

// ---------- nitrous ----------
{
  const run = (nos: boolean) => {
    Object.assign(r, { gear: 3, speed: 25, nos: NOS.CHARGES, nosT: 0, ignition: 2, z: -20000, x: roadX(-20000), yaw: roadYaw(-20000) });
    (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
    if (nos) host.handle(1, { t: 'act', id: 'nos', btn: 0 });
    step(4, { th: 1, br: 0, st: 0, horn: false });
    return r.speed * 2.23694;
  };
  const plain = run(false);
  const boosted = run(true);
  ok(boosted > plain + 15, `nitrous adds speed in 3rd (${plain.toFixed(0)} → ${boosted.toFixed(0)} mph after 4 s)`);
  ok(r.nos === NOS.CHARGES - 1, 'one charge used');
  r.nosT = 0;
  host.handle(1, { t: 'act', id: 'nos', btn: 0 }); r.nosT = 0;
  host.handle(1, { t: 'act', id: 'nos', btn: 0 }); r.nosT = 0;
  ok(r.nos === 0, 'tank runs dry after 3 shots');
  const n0 = r.nos;
  host.handle(1, { t: 'act', id: 'nos', btn: 0 });
  ok(r.nos === n0 && r.nosT === 0, 'empty tank does nothing');
  const fuel = host.items.spawn('rocket', true, 0, 1, 0); fuel.h = 1;
  host.handle(1, { t: 'act', id: 'nos_tank', btn: 0 });
  ok(r.nos === NOS.CHARGES && !host.items.get(fuel.id), 'rocket fuel refills the tank and is used up');
}

// ---------- rocks ----------
{
  r.speed = 0; r.gear = 0;
  const pile = [1, 3, 5, 7, 9, 11].map((i) => chunkRocks(i)).find((p) => p);
  ok(!!pile, 'roadside rock pile exists nearby');
  const nothing = s.items.find((i) => i.k === 'rock');
  ok(!nothing, 'no stray rocks yet');
  host.handle(1, { t: 'act', id: `rocks:${pile!.id}`, btn: 0 });
  const got = s.items.find((i) => i.k === 'rock' && i.h === 1);
  ok(!!got, 'picked a rock from the pile');
  host.handle(1, { t: 'act', id: 'rockbin', btn: 0 });
  ok(r.rocks === 1 && !host.items.get(got!.id), 'stored the rock in the bin');
  host.handle(1, { t: 'act', id: 'rockbin', btn: 0 });
  const back = s.items.find((i) => i.k === 'rock' && i.h === 1);
  ok(r.rocks === 0 && !!back, 'took it back out');
  back!.h = -1; host.items.remove(back!.id);

  // chase: cruiser 18 m behind at the RV's speed, window open, throw rocks out the back
  const z = -25000; r.z = z; r.x = roadX(z); r.yaw = roadYaw(z); r.speed = 30; r.gear = 4; r.rearWin = true;
  (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
  const bx = Math.sin(r.yaw), bz = Math.cos(r.yaw);
  s.npcs.push({ id: 9001, k: 'cop', x: r.x + bx * 18, z: r.z + bz * 18, yaw: r.yaw, speed: 30, c: 0, w: 0 });
  s.cop.phase = 2; s.cop.t = 5; s.heat = 2;
  step(0.3, { th: 0.3, br: 0, st: 0, horn: false });
  let hits = 0;
  for (let n = 0; n < 5 && s.cop.phase !== 0; n++) {
    const rock = host.items.spawn('rock', true, 0, 2.0, RV.zRear - 0.9); rock.h = 1;
    host.handle(1, { t: 'drop', inRV: true, p: [0, 2.0, RV.zRear - 0.9], v: [0, 0.8, 32] });
    step(1.2, { th: 0.3, br: 0, st: 0, horn: false });
    hits++;
  }
  const cop = s.npcs.find((n) => n.k === 'cop');
  ok(s.cop.phase === 0 && s.heat === 0, `rocks ended the chase after ${hits} throws (phase ${s.cop.phase}, heat ${s.heat})`);
  ok(!!cop && cop.w > 0, 'the cruiser is left wrecked on the road');
  step(20);
  ok(!s.npcs.some((n) => n.k === 'cop'), 'wreck gets towed away');
  void LANE_OFFSET;
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
