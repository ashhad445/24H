// Headless: outrunning Roscoe / the Loan Shark, the mafia can't be outrun, the distant train horn.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import { LANE_OFFSET, roadX, roadYaw } from '../src/world/World';
import type { GameMsg } from '../src/types';

let fails = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails++; };

function setup() {
  const rvm = new RVModel();
  const toasts: string[] = []; const horns: number[] = [];
  const host: HostSim = new HostSim((m: GameMsg) => {
    if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text);
    if (m.t === 'ev' && m.k === 'sfx' && m.name === 'trainhorn' && m.at) horns.push(Math.hypot(m.at[0] - host.s.rv.x, m.at[2] - host.s.rv.z));
  }, (o) => rvm.activeColliders(o));
  host.crew(1); const s = host.s; const r = s.rv;
  s.seats.driver = 1; s.crew[1].caf = 1e9; s.crew[1].hunger = 1e9;
  Object.assign(r, { ignition: 2, handbrake: false, gear: 7, speed: 30, fuel: 25, z: -3000 });
  r.x = roadX(r.z) + LANE_OFFSET;
  (host as any).enc.next = 1e9; // no random encounters
  const drive = (sec: number, mps: number) => {
    for (let t = 0; t < sec; t += 1 / 60) {
      const az = r.z - 40, yawT = roadYaw(az);
      const tx = roadX(az) + LANE_OFFSET * Math.cos(yawT);
      let err = Math.atan2(-(tx - r.x), -(az - r.z)) - r.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      host.handle(1, { t: 'drive', i: { th: 0.5, br: 0, st: Math.max(-1, Math.min(1, err * 6)), horn: false } });
      r.speed = mps; r.fuel = 25; r.temp = 180;
      host.step(1 / 60);
      r.integrity = Math.max(r.integrity, 50);
      if (s.cab.flat >= 0) s.cab.flat = -1;
      s.npcs = s.npcs.filter((n) => n.k === 'cop' || n.k === 'shark'); // no civilian traffic in the way
    }
  };
  return { host, s, r, drive, toasts, horns };
}

// 1. Roscoe catches you at 50 m/s (~112 mph)
{
  const { s, drive } = setup();
  s.heat = 2; drive(60, 50);
  check(s.cop.phase === 2, `slow RV: Roscoe catches up (phase ${s.cop.phase})`);
}
// 2. … but flooring it (88 m/s ≈ 197 mph) loses him: −1 heat
{
  const { s, drive, toasts } = setup();
  s.heat = 2; drive(28, 30); // he spawns
  const had = s.npcs.some((n) => n.k === 'cop');
  drive(45, 88);
  check(had && !s.npcs.some((n) => n.k === 'cop') && s.cop.phase === 0, `fast RV: Roscoe lost (phase ${s.cop.phase})`);
  check(s.heat === 1, `heat 2 → ${s.heat}`);
  check(toasts.some((t) => /lost Roscoe/.test(t)), 'escape toast');
}
// 2b. Roscoe right on the bumper, then floor it: lost within ~45 s
{
  const { s, drive } = setup();
  s.heat = 1; drive(60, 50);
  const close = s.cop.phase === 2;
  let t = 0; while (s.cop.phase !== 0 && t < 90) { drive(1, 86); t++; }
  check(close && s.cop.phase === 0 && t < 50, `Roscoe on the bumper → lost after ${t} s at 192 mph`);
}
// 3. Loan shark outrun
{
  const { s, drive } = setup();
  s.money = -20; drive(14, 30);
  const had = s.shark.on;
  drive(45, 88);
  check(had && !s.shark.on && !s.npcs.some((n) => n.k === 'shark'), `loan shark outrun (on ${s.shark.on})`);
}
// 4. Mafia can't be outrun
{
  const { s, drive } = setup();
  s.mafia.on = true; drive(14, 30);
  drive(45, 88);
  check(s.shark.on, 'mafia Cadillac stays on you');
}
// 5. Train horn heard from far away
{
  const { host, r, drive, horns } = setup();
  (host as any).enc.spawn('train', r.z - 2100);
  drive(20, 40);
  check(horns.length >= 3, `train horns while approaching: ${horns.length}`);
  check(horns.length > 0 && Math.max(...horns) > 1200, `first horn from ${horns.length ? Math.max(...horns).toFixed(0) : '-'} m`);
}
console.log(fails ? `${fails} FAILED` : 'all chase checks passed');
process.exit(fails ? 1 : 0);
