// Headless checks for road encounters: the director, hitchhikers, the broken-down motorist, cattle,
// the suitcase + snake, tumbleweeds, the ostrich, road work and the train crossing.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { RV } from '../src/config';
import { RUSTY_SET } from '../src/stops/rusty';
import { STOPS } from '../src/stops/Stops';
import { stopFrame, stopOnRoute } from '../src/stops/kit';
import { setRouteChoices, FORKS, forkZ } from '../src/world/Route';
import { LANES, LANE_OFFSET, roadPoint, roadYaw } from '../src/world/World';
import { rvWorld } from '../src/road/common';
import type { Cow } from '../src/road/kinds/cattle';
import { ZONE_LEN } from '../src/road/kinds/roadwork';
import type { GameMsg } from '../src/types';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const make = () => {
  const rvm = new RVModel();
  const evs: GameMsg[] = [];
  const host = new HostSim((m: GameMsg) => { evs.push(m); }, (o) => rvm.activeColliders(o));
  host.crew(1);
  const s = host.s; s.route = [0, 0]; setRouteChoices(s.route);
  host.enc.next = 1e9; // director off unless a test wants it
  let hand: [number, number, number] = [0, 1.2, 0];
  host.handOf = () => hand;
  const act = (id: string) => host.handle(1, { t: 'act', id, btn: 0 });
  let roadZ = 0;
  const place = (z: number, off = LANE_OFFSET, speed = 0) => {
    roadZ = z;
    const [x, zz] = roadPoint(z, off); const yaw = roadYaw(z);
    Object.assign(s.rv, { x, z: zz, yaw, speed });
    (host as any).prevPose = { x, z: zz, yaw };
  };
  /** Drive straight down a lane at a fixed speed (bypassing the drivetrain). */
  let lane = LANE_OFFSET;
  const step = (sec: number, v?: number, dt = 1 / 60) => {
    for (let t = 0; t < sec; t += dt) {
      host.step(dt); s.cab.flat = -1; s.cab.fuseOut = false;
      if (v !== undefined) place(roadZ - v * dt, lane, v);
    }
  };
  const toasts = () => evs.filter((e) => e.t === 'ev' && e.k === 'toast').map((e) => (e as { text: string }).text);
  const hold = (k: string, d = 0) => { const it = host.items.spawn(k, false, hand[0], hand[1], hand[2]); it.d = d; it.h = 1; while (host.held(1)?.id !== it.id) act('slot:1'); return it; };
  const standIn = (lx: number, lz: number) => { const [x, z] = rvWorld(s, lx, lz); hand = [x, 1.2, z]; };
  return { host, s, evs, act, step, place, toasts, hold, standIn, setLane: (o: number) => { lane = o; }, setHand: (h: [number, number, number]) => { hand = h; } };
};

// ---------------- director ----------------
{
  const t = make();
  t.host.enc.next = 30;
  t.place(-3000, LANE_OFFSET, 40);
  let most = 0; const starts: number[] = [];
  let seen = 0;
  for (let i = 0; i < 20 * 60 * 20; i++) {
    t.step(1 / 20, 40, 1 / 20);
    t.s.rv.integrity = 100; t.s.heat = 0; t.s.crew[1].hp = 100; t.s.crew[1].hunger = 100; t.s.rv.fuel = 20;
    most = Math.max(most, t.s.enc.list.length);
    if (t.host.enc.started > seen) { seen = t.host.enc.started; starts.push(t.s.enc.list[t.s.enc.list.length - 1].z); }
  }
  const sets = [RUSTY_SET, ...STOPS.filter((d) => stopOnRoute(d, t.s.route)).map(stopFrame)];
  const nearStop = starts.filter((z) => sets.some((set) => Math.abs(set.z - z) < 1200) || FORKS.some((f) => Math.abs(forkZ(f) - z) < 2200));
  ok(seen >= 10 && seen <= 22, `20 min at 90 mph: ${seen} encounters`);
  ok(most <= 1, 'never two at once');
  ok(nearStop.length === 0, 'none start near a stop or fork');
}

// ---------------- hitchhiker ----------------
{
  const t = make();
  t.place(-20000);
  const e = t.host.enc.spawn('hitch', t.s.rv.z - 12);
  e.type = 0; e.name = 'Test Drifter';
  t.step(3);
  ok(!t.s.enc.rider && e.ph === 0, 'door closed: the hitchhiker waits');
  t.act('door'); t.step(8);
  ok(t.s.enc.rider?.type === 0, 'stopped + door open: they walk over and climb in');
  const m0 = t.s.money; t.act('enc:rider');
  ok(!t.s.enc.rider && t.s.money === m0 + 20, 'drifter pays $20 when asked to leave');

  t.s.seats.driver = 1; t.s.crew[1].hypno = 0.5;
  t.s.enc.rider = { type: 2, t: 0, name: 'Rev' }; t.step(10);
  ok(t.s.crew[1].hypno < 0.42, `preacher calms the driver (hypnosis 0.50 → ${t.s.crew[1].hypno.toFixed(2)})`);
  t.s.enc.rider = { type: 3, t: 58, name: 'Tank' }; t.s.heat = 0; t.step(3);
  ok(t.s.heat === 2, 'convict: +2 heat after a minute aboard');
  t.step(12);
  ok(t.s.cop.phase >= 1, 'convict: Roscoe shows up fast');
  t.s.enc.rider = { type: 1, t: 0, name: 'Slim' };
  const loose = () => t.s.items.filter((i) => i.rv && i.h === -1 && !i.s && i.k !== 'weed' && i.k !== 'card').length;
  t.s.rv.speed = 0;
  const n0 = loose(); t.act('enc:rider');
  ok(loose() === n0 - 1, 'shady guy walks off with one of your things');
}

// ---------------- broken-down motorist ----------------
{
  const t = make();
  t.place(-20000);
  const e = t.host.enc.spawn('motorist', t.s.rv.z - 20);
  e.need = 0; // fuse
  t.hold('coolant', 2); t.act(`enc:${e.id}:help`);
  ok(e.ph === 0 && /fuse/i.test(t.toasts().at(-1) ?? ''), 'wrong item: they tell you what they need');
  for (const it of t.s.items.filter((i) => i.h === 1)) t.host.items.remove(it.id);
  const fuse = t.hold('fuse'); const m0 = t.s.money;
  t.act(`enc:${e.id}:help`);
  const gift = t.s.items.some((i) => i.h === 1);
  ok(e.ph === 2 && !t.s.items.includes(fuse) && (t.s.money === m0 + 35 || gift), `fuse fixes it: ${t.s.money > m0 ? '+$35' : 'a free item'}, fuse used up`);
  t.step(25); ok(!t.s.enc.list.includes(e), 'fixed car drives off and is gone');
  const e2 = t.host.enc.spawn('motorist', t.s.rv.z - 20);
  for (const it of t.s.items.filter((i) => i.h === 1)) t.host.items.remove(it.id);
  t.hold('pistol', 12); const m1 = t.s.money;
  t.act(`enc:${e2.id}:help`);
  ok(t.s.money === m1 + 40 && e2.ph === 3, 'pistol: rob them for $40');
}

// ---------------- cattle ----------------
{
  const t = make();
  t.place(-20000);
  const e = t.host.enc.spawn('cattle', t.s.rv.z - 120);
  e.go = 1;
  for (const c of e.cows as Cow[]) { c.o = LANE_OFFSET + (Math.random() - 0.5) * 2; c.wait = 0; c.v = 0.01; }
  t.step(0.05);
  ok(t.host.traffic.obstacles().length > 0, 'cows on the road are traffic obstacles');
  ok(!(t.host.traffic as any).laneClear(1, LANE_OFFSET, e.z, 20, 20, 1), 'their lane reads as blocked to traffic');
  const i0 = t.s.rv.integrity;
  t.step(6, 25);
  ok(t.s.rv.integrity <= i0 - 6 && t.s.rv.integrity > 40 && (e.cows as Cow[]).some((c) => c.st === 2), `hit a cow at 56 mph: −${(i0 - t.s.rv.integrity).toFixed(0)} integrity`);
  ok(!!(t.host.traffic as any).rancher, 'the rancher comes after you');

  const t2 = make();
  t2.place(-20000); t2.s.seats.driver = 1;
  const e2 = t2.host.enc.spawn('cattle', t2.s.rv.z - 60);
  e2.go = 1;
  for (const c of e2.cows as Cow[]) { c.o = (Math.random() - 0.5) * 12; c.wait = 0; }
  t2.act('horn'); t2.step(5);
  const onRoad = (e2.cows as Cow[]).filter((c) => Math.abs(c.o) < 11).length;
  ok((e2.cows as Cow[]).every((c) => c.st === 1) && onRoad === 0, 'honk: the whole herd bolts off the road');
}

// ---------------- suitcase + snake ----------------
{
  const t = make();
  t.place(-20000);
  const e = t.host.enc.spawn('suitcase', t.s.rv.z - 40);
  e.off = LANE_OFFSET; const it = t.s.items.find((i) => i.id === e.item)!;
  [it.x, it.z] = roadPoint(e.z, LANE_OFFSET);
  t.step(4, 20);
  ok(!t.s.items.includes(it) && e.burst === 1, 'running it over: clothes everywhere');

  t.s.rv.speed = 0;
  t.standIn(0, 1.2);
  const open = (roll: number) => { const sc = t.hold('suitcase'); t.host.enc.open(1, sc, roll); };
  const m0 = t.s.money; open(0.1);
  ok(t.s.money > m0, `cash inside (+$${t.s.money - m0})`);
  for (const i of t.s.items.filter((x) => x.h === 1)) t.host.items.remove(i.id);
  open(0.5);
  ok(t.s.items.filter((x) => x.h === 1).length === 1, `an item inside (${t.s.items.find((x) => x.h === 1)?.k})`);
  for (const i of t.s.items.filter((x) => x.h === 1)) t.host.items.remove(i.id);
  open(0.8);
  const snake = t.s.items.find((x) => x.k === 'snake');
  ok(!!snake && snake.rv, 'a snake, loose in the cabin');
  const hp0 = t.s.crew[1].hp;
  t.step(6);
  ok(t.s.crew[1].hp < hp0, `it bites a standing player (${hp0} → ${t.s.crew[1].hp} hp)`);
  snake!.h = 1; const hp1 = t.s.crew[1].hp; t.step(5);
  ok(t.s.crew[1].hp >= hp1, 'held: no more bites');
  snake!.h = -1; snake!.rv = false; snake!.x = t.s.rv.x + 10; snake!.z = t.s.rv.z; snake!.y = 0.2; t.step(7);
  ok(!t.s.items.includes(snake!), 'thrown outside: it slithers away');
}

// ---------------- tumbleweeds ----------------
{
  const t = make();
  t.place(-20000, LANE_OFFSET, 20);
  t.s.weather.storm = 1;
  const [x, z] = rvWorld(t.s, 0, RV.noseZ - 8);
  t.s.enc.rolling.push({ id: 99, x, z, vx: 0, vz: 0, r: 0.5 });
  t.step(1, 20);
  ok(t.s.enc.weeds >= 1, 'a tumbleweed sticks to the windshield');
  t.s.weather.storm = 0; t.s.rv.wipers = true;
  t.step(t.s.enc.weeds * 1.7 + 0.5);
  ok(t.s.enc.weeds === 0, 'wipers clear them, one at a time');
}

// ---------------- ostrich ----------------
{
  const t = make();
  t.place(-20000, LANE_OFFSET, 15);
  const e = t.host.enc.spawn('ostrich', t.s.rv.z - 30);
  t.step(5, 15);
  const gap = Math.hypot(e.x - t.s.rv.x, e.wz - t.s.rv.z);
  ok(e.run === 1 && gap < 25, `it races alongside the RV (${gap.toFixed(1)} m away)`);
  t.host.items.spawn('burger', false, e.x, 1.0, e.wz);
  t.step(0.5, 15);
  ok(e.ph === 1, 'food tossed to it: tamed');
  t.s.rv.speed = 0; t.act('door'); t.step(6);
  ok(t.s.enc.bird === 1, 'stopped with the door open: it hops in');
  const yaw = RUSTY_SET.yaw; void yaw;
  Object.assign(t.s.rv, { x: RUSTY_SET.x, z: RUSTY_SET.z, speed: 0 }); (t.host as any).prevPose = { x: t.s.rv.x, z: t.s.rv.z, yaw: t.s.rv.yaw };
  const m0 = t.s.money; t.step(1);
  ok(t.s.enc.bird === 0 && t.s.money === m0 + 70, 'parked at a stop: $70 reward for the bird');
}

// ---------------- road work ----------------
{
  const t = make();
  t.place(-20000, LANES[0], 0);
  t.setLane(LANES[0]);
  const e = t.host.enc.spawn('roadwork', t.s.rv.z - 120);
  t.step(0.1);
  e.sg = 0; e.sgT = 99;
  ok(t.host.traffic.obstacles().some((o) => o.off > 5), 'closed lanes are traffic obstacles');
  t.s.heat = 0;
  t.step(5, 30);
  ok(e.flagged === 1 && t.s.heat >= 1, `ran the STOP sign: plate taken (heat ${t.s.heat})`);
  t.step(12, 30);
  ok(e.sped === 1, 'and speeding through the zone');

  const t2 = make();
  t2.place(-20000, 4.2, 0); t2.setLane(4.2); // straddling the cone line
  const e2 = t2.host.enc.spawn('roadwork', t2.s.rv.z - 40);
  t2.step(5, 20);
  ok((e2.cones as { st: number }[]).some((c) => c.st === 1), 'cones go flying');
  t2.s.enc.cone = 1; t2.s.rv.speed = 0; t2.act('enc:cone');
  ok(t2.s.enc.cone === 0, 'a mechanic yanks the jammed cone out');
  void ZONE_LEN;
}

// ---------------- train ----------------
{
  const t = make();
  t.place(-20000);
  const e = t.host.enc.spawn('train', t.s.rv.z - 30);
  let maxGate = 0, obs = 0;
  for (let i = 0; i < 60 * 60; i++) { t.step(1 / 60); maxGate = Math.max(maxGate, e.gate ?? 0); if (t.host.traffic.obstacles().length) obs = 1; }
  ok(maxGate === 1 && t.s.rv.integrity > 99, 'waiting at the gates: they drop, the train passes, no damage');
  ok(obs === 1, 'closed gates hold traffic');
  ok(e.ph === 2 && e.gate < 0.1, 'gates go back up after the last car');

  const t2 = make();
  t2.place(-20000);
  const e2 = t2.host.enc.spawn('train', t2.s.rv.z);
  for (let i = 0; i < 40 * 60 && !e2.hit; i++) t2.step(1 / 60);
  ok(e2.hit === 1 && t2.s.rv.integrity <= 65, `parked on the tracks: the train hits the RV (integrity ${t2.s.rv.integrity.toFixed(0)})`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
