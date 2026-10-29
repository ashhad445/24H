// Headless checks: health + pass-out, food poisoning, crash physics, canyon rockfall + bandits,
// speed cameras, bribes, the diner's Scorpion Challenge, and the new casino games.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { CFG, HP } from '../src/config';
import { STOPS } from '../src/stops/Stops';
import { stopFrame } from '../src/stops/kit';
import { fromSetLocal, obbMtv } from '../src/stops/geom';
import { WHEEL_SEGS } from '../src/stops/casino';
import { NPC_DIMS } from '../src/traffic/TrafficSim';
import { setRouteChoices } from '../src/world/Route';
import { LANE_OFFSET, addClearZone, chunkRadar, noLimitAt, onRoad, roadPoint, roadX, roadYaw } from '../src/world/World';
import type { GameMsg, NPCState } from '../src/types';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const M = 1 / CFG.MILES_PER_METER;

const make = (route = [-1, -1]) => {
  const rvm = new RVModel();
  const evs: GameMsg[] = [];
  const host = new HostSim((m: GameMsg) => { evs.push(m); }, (o) => rvm.activeColliders(o));
  host.crew(1);
  const s = host.s; s.route = route.slice(); setRouteChoices(s.route);
  let hand: [number, number, number] = [0, 1.2, 0];
  host.handOf = () => hand;
  const act = (id: string) => host.handle(1, { t: 'act', id, btn: 0 });
  const step = (sec: number, keep = true) => { for (let t = 0; t < sec; t += 1 / 60) { host.step(1 / 60); if (keep) { s.cab.flat = -1; s.cab.fuseOut = false; } } };
  const toasts = () => evs.filter((e) => e.t === 'ev' && e.k === 'toast').map((e) => (e as { text: string }).text);
  const hold = (k: string, d = 0) => { const it = host.items.spawn(k, false, hand[0], hand[1], hand[2]); it.d = d; it.h = 1; while (host.held(1)?.id !== it.id) act('slot:1'); return it; };
  const place = (z: number, off = LANE_OFFSET, speed = 0) => {
    const [x, zz] = roadPoint(z, off); const yaw = roadYaw(z);
    Object.assign(s.rv, { x, z: zz, yaw, speed });
    (host as any).prevPose = { x, z: zz, yaw };
  };
  return { host, s, evs, act, step, toasts, hold, place, setHand: (h: [number, number, number]) => { hand = h; } };
};

// ---------------- health ----------------
{
  const t = make();
  const c = t.s.crew[1];
  c.hunger = 10; t.step(30);
  ok(c.hp < 100 && c.hp > 90, `starving slowly eats health (${c.hp.toFixed(1)} hp after 30 s at 10% hunger)`);
  c.hunger = 0; c.hp = 2; const m0 = t.s.money; t.evs.length = 0;
  t.step(10);
  ok(c.hp > HP.WAKE_HP - 3 && c.hp <= HP.WAKE_HP && t.s.money === m0 - HP.ER_BILL, `0 hp passes you out: wake at ~${HP.WAKE_HP} hp (${c.hp.toFixed(1)}, still starving), $${m0 - t.s.money} urgent-care bill`);
  ok(t.evs.some((e) => e.t === 'ev' && e.k === 'wake'), 'the passed-out player gets a wake-up (moved into the RV)');
}

// ---------------- food poisoning ----------------
{
  const t = make();
  const c = t.s.crew[1]; c.hp = 100;
  t.hold('patty', 0.1); t.evs.length = 0;
  t.act('self');
  ok(c.hp === 100 - HP.POISON && t.evs.some((e) => e.t === 'ev' && e.k === 'puke'), `eating a raw patty: puke, −${HP.POISON} hp`);
}

// ---------------- crash physics ----------------
const crash = (k: NPCState['k']) => {
  const t = make();
  t.place(-400, LANE_OFFSET, 30);
  const r = t.s.rv;
  const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
  const ahead = 4.35 + NPC_DIMS[k][1] + 1.5;
  const n: NPCState = { id: 9999, k, x: r.x + fx * ahead, z: r.z + fz * ahead, yaw: r.yaw, speed: 0, c: 0, w: 0 };
  t.s.npcs.push(n);
  const before = r.speed;
  t.step(0.5);
  const midZ = (-4.35 + 3.34) / 2, hl = (3.34 + 4.35) / 2;
  const cx = r.x + midZ * Math.sin(r.yaw), cz = r.z + midZ * Math.cos(r.yaw);
  const overlap = t.s.npcs.includes(n) ? obbMtv(cx, cz, r.yaw, 1.4, hl, n.x, n.z, n.yaw, NPC_DIMS[k][0], NPC_DIMS[k][1]) : null;
  return { before, after: r.speed, n, overlap, hp: r.integrity };
};
{
  const a = crash('sedan');
  ok(a.n.vx !== undefined && Math.hypot(a.n.vx!, a.n.vz!) > 10 && !a.overlap, `RV rear-ends a sedan at 30 m/s: the sedan is punted (${Math.hypot(a.n.vx ?? 0, a.n.vz ?? 0).toFixed(1)} m/s) and the boxes don't overlap`);
  const b = crash('semi');
  ok(b.after < a.after - 5, `a semi stops the RV much harder than a sedan (RV after: semi ${b.after.toFixed(1)} vs sedan ${a.after.toFixed(1)} m/s)`);
  ok(b.hp < a.hp, `and hurts more (integrity semi ${b.hp.toFixed(0)} vs sedan ${a.hp.toFixed(0)})`);
}

// ---------------- canyon rockfall ----------------
{
  const t = make([1, -1]);
  t.place(-280 * M, LANE_OFFSET, 0);
  const b = (t.host as any).canyon.drop(70, LANE_OFFSET);
  t.step(6);
  const off = (b.x - roadX(b.z)) * Math.hypot(1, roadX(b.z + 0.5) - roadX(b.z - 0.5));
  ok(b.y === b.r && onRoad(b.x, b.z) && Math.abs(off - LANE_OFFSET) < 2.5, `a boulder falls off the cliff and lands on the road near where it aimed (y ${b.y.toFixed(2)}, lane offset ${off.toFixed(1)} m)`);
  const hp0 = t.s.rv.integrity; t.s.rv.handbrake = false; t.s.rv.speed = 20;
  t.step(5);
  ok(t.s.rv.integrity <= hp0 - 10 && b.broken > 0, `driving into it: −${(hp0 - t.s.rv.integrity).toFixed(0)} integrity, the boulder shatters`);
}

// ---------------- canyon bandits ----------------
const ambush = () => {
  const t = make([1, -1]);
  t.place(-280 * M, LANE_OFFSET, 0);
  (t.host as any).traffic.banditRolled = true; // skip the random roll
  (t.host as any).traffic.rollBandits(true);
  for (let i = 0; i < 40 && t.s.bandits.phase !== 2; i++) t.step(0.5);
  t.step(4); // let them park
  return t;
};
{
  const t = ambush();
  ok(t.s.bandits.phase === 2 && t.s.npcs.filter((n) => n.k === 'bandit').length === 2, 'two bandit trucks overtake and set up a roadblock');
  const blockS = (t.host as any).traffic.blockS as number;
  t.place(blockS + 18, LANE_OFFSET, 0);
  t.step(3);
  ok(t.s.money <= 0.01 && t.s.bandits.phase === 3, `stopping at the roadblock: robbed down to $${t.s.money.toFixed(2)}`);
}
{
  const t = ambush();
  const blockS = (t.host as any).traffic.blockS as number;
  t.place(blockS + 25, 8.2, 28);
  const m0 = t.s.money;
  t.step(2);
  const wrecked = t.s.npcs.filter((n) => n.k === 'bandit' && n.w > 0).length;
  ok(wrecked >= 1 && t.s.money === m0, `ramming the roadblock at 28 m/s wrecks ${wrecked} truck(s) and keeps the money`);
}
{
  const t = ambush();
  const blockS = (t.host as any).traffic.blockS as number;
  t.place(blockS + 18, LANE_OFFSET, 0);
  t.hold('cheeseburger');
  t.act('bandit');
  const m0 = t.s.money;
  t.step(3);
  ok(Math.abs(t.s.money - m0 / 2) < 0.02, `feeding the bandits a burger: they only take half ($${(m0 - t.s.money).toFixed(0)} of $${m0})`);
}

// ---------------- speed cameras ----------------
{
  let i = 2; while (!chunkRadar(i)) i++;
  const cam = chunkRadar(i)!;
  let inNoLimit = 0;
  for (let k = 0; k < 400; k++) { const r = chunkRadar(k); if (r && noLimitAt(r.z)) inNoLimit++; }
  ok(inNoLimit === 0, 'no camera gantry ever stands inside a "SPEED UNTIL YOU DIE" stretch');
  const t = make();
  t.place(cam.z + 6, LANE_OFFSET, 67); // ~150 mph, 6 m before the gantry
  t.step(0.4);
  ok(t.s.heat === 1, `crossing a camera at ~150 mph from 6 m before it: heat ${t.s.heat}`);
  const before = chunkRadar(i);
  addClearZone({ x: cam.x, z: cam.z, yaw: 0, x0: -60, x1: 60, z0: -60, z1: 60 });
  const after = chunkRadar(i);
  ok(!!before && !!after && before.z === after.z, 'camera placement does not depend on which stop clear-zones are loaded');
}

// ---------------- bribes ----------------
const pulledOver = () => {
  const t = make();
  t.place(-500, LANE_OFFSET, 0);
  t.s.heat = 2;
  const car = (t.host as any).traffic.spawnChaser('cop');
  const r = t.s.rv;
  car.x = r.x + Math.sin(r.yaw) * 10; car.z = r.z + Math.cos(r.yaw) * 10; car.speed = 0; car.yaw = r.yaw;
  Object.assign(t.s.cop, { phase: 3, t: 0, fled: false });
  t.setHand([r.x, 1.2, r.z]); // the driver's in the RV
  return t;
};
{
  const t = pulledOver();
  t.hold('cheeseburger'); t.act('roscoe');
  ok(t.s.heat === 0 && t.s.cop.phase === 4, 'a cheeseburger at the window: heat cleared, Roscoe leaves');
  const u = pulledOver();
  u.hold('burntburger'); u.act('roscoe');
  ok(u.s.heat === 3 && u.s.cop.phase === 3, 'a burnt burger: +1 heat ("assaulting an officer with a hockey puck")');
}

// ---------------- diner: Scorpion Challenge ----------------
const atStop = (id: string, route: number[]) => {
  const t = make(route);
  const def = STOPS.find((d) => d.id === id)!;
  const set = stopFrame(def);
  Object.assign(t.s.rv, { x: set.x, z: set.z + 40, speed: 0 }); (t.host as any).prevPose = { x: set.x, z: set.z + 40, yaw: t.s.rv.yaw };
  t.step(0.5);
  const L = (lx: number, y: number, lz: number): [number, number, number] => { const [x, z] = fromSetLocal(set, lx, lz); return [x, y, z]; };
  const card = () => { const c = t.s.items.find((i) => i.k === 'card')!; c.s = ''; c.rv = false; c.h = 1; while (t.host.held(1)?.id !== c.id) t.act('slot:1'); };
  return { ...t, L, card };
};
{
  const t = atStop('diner', [0, -1]);
  t.setHand(t.L(26, 1.2, -1.6));
  t.s.crew[1].hunger = 5;
  t.card(); const m0 = t.s.money;
  t.act('stop:diner:scorpion:order');
  const burger = t.s.items.find((i) => i.k === 'scorpion');
  ok(!!burger && t.s.money === m0 - 15, 'ordering the Scorpion Challenge: $15, a 4-lb burger');
  while (t.host.held(1)?.k !== 'scorpion') t.act('slot:1');
  for (let b = 0; b < 4; b++) { t.act('self'); t.step(7.2); }
  ok(t.s.money === m0 + 40 && t.s.stops.diner.scorpion.wall.length === 1, `4 bites in time: +$40 net and a spot on the Wall of Fame`);
  const u = atStop('diner', [0, -1]);
  u.setHand(u.L(26, 1.2, -1.6)); u.s.crew[1].hunger = 5; u.card();
  u.act('stop:diner:scorpion:order');
  u.s.crew[1].hunger = 50; // not starving, not regenerating: only the challenge touches health
  const hp0 = u.s.crew[1].hp; u.step(61);
  ok(u.s.crew[1].hp === hp0 - 20 && !u.s.items.some((i) => i.k === 'scorpion'), 'running out of time: −20 health and Flo shames you over the PA');
}

// ---------------- casino ----------------
{
  const pay: Record<string, number> = { '2×': 20, '5×': 50, '10×': 100 };
  const ev = WHEEL_SEGS.reduce((a, s) => a + (pay[s] ?? 0), 0) / WHEEL_SEGS.length;
  ok(ev < 10 && ev > 7, `Big Wheel pays back $${ev.toFixed(2)} per $10 spin on average (the house wins, a little)`);
  const t = atStop('casino', [1, 1]);
  t.card(); const m0 = t.s.money;
  t.act('stop:casino:wheel:spin'); t.step(5.2);
  ok(t.s.money !== m0 || t.toasts().some((x) => /LOSE|CACTUS/.test(x)), 'a Big Wheel spin resolves');
  // dice
  t.setHand(t.L(22.4, 1.3, 6)); t.card();
  const m1 = t.s.money; t.act('stop:casino:dice:roll'); t.step(5);
  const d = t.s.money - m1;
  ok(t.toasts().some((x) => x.startsWith('🎲')) && [-10, 0, 10].includes(Math.round(d)), `dice land and pay out correctly (net ${d >= 0 ? '+' : ''}${d.toFixed(0)})`);
  // claw: force the aim, the grip and the prize roll
  t.card(); t.act('stop:casino:claw:play'); t.step(0.3); t.act('stop:casino:claw:play');
  t.s.stops.casino.claw.x = 0.15; // dropped right over the good prize
  t.step(2.4);
  const rnd = Math.random; Math.random = () => 0.65; // aim ok, grip holds, prize roll → energy drink
  t.step(0.2); Math.random = rnd;
  ok(t.s.items.some((i) => i.k === 'energy' && i.h === -1 && !i.rv && i.p === 0), 'a good claw grab drops a prize in the chute');
  // free drink → drunk
  const held = t.host.held(1); if (held) held.h = -1;
  t.act('stop:casino:waitress:drink');
  while (t.host.held(1) && t.host.held(1)?.k !== 'cocktail') t.act('slot:1');
  t.act('self');
  ok(t.s.crew[1].drunk > 0, `a free cocktail makes you drunk (${t.s.crew[1].drunk.toFixed(0)} s of wobble)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
