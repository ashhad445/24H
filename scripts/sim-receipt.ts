// Headless: the end-of-run receipt (ledger → lines, blame board, awards) and the STRANDED ending.
import './dom-stub';
import { RVModel } from '../src/rv/RV';
import { HostSim } from '../src/net/Host';
import type { GameMsg, Receipt } from '../src/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) fails++; };

const rvm = new RVModel();
const make = () => {
  const toasts: string[] = []; const receipts: Receipt[] = [];
  const host = new HostSim((m: GameMsg) => {
    if (m.t === 'ev' && m.k === 'toast') toasts.push(m.text);
    if (m.t === 'ev' && m.k === 'receipt') receipts.push(m.r);
  }, (o) => rvm.activeColliders(o));
  host.names = (id) => ['', 'Ann', 'Bo'][id] ?? `Bean ${id}`;
  host.crew(1); host.crew(2);
  for (const c of Object.values(host.s.crew)) c.hunger = 1e9;
  (host as any).stormIn = 1e9;
  return { host, toasts, receipts };
};

// ---------- receipt ----------
{
  const { host, receipts } = make();
  host.charge(1, 10, 'Gas'); host.charge(1, 2.5, 'Gas'); // merges with the line above
  host.charge(2, 10, 'Roulette: $10 on red'); host.charge(2, 10, 'Roulette: $10 on black'); host.charge(2, 25, 'High Roller slot spin');
  host.credit(2, 20, 'Roulette win (red)');
  host.credit(1, 35, 'Car wash job');
  host.charge(2, 50, 'Ticket from Sheriff Roscoe');
  host.log(2, 'Bribed Roscoe with a burger');
  const r = host.receipt();
  const ann = r.crew.find((c) => c.name === 'Ann')!, bo = r.crew.find((c) => c.name === 'Bo')!;
  check('money matches the ledger', Math.abs(r.money - (200 - 12.5 - 45 + 20 + 35 - 50)) < 1e-6, `$${r.money}`);
  check('Ann: spent 12.50, earned 35', ann.spent === 12.5 && ann.earned === 35 && ann.bet === 0);
  check('Bo: bet 45, won 20, spent 50', bo.bet === 45 && bo.won === 20 && bo.spent === 50, JSON.stringify(bo));
  const roul = r.lines.filter((l) => l[1] === 'Roulette');
  check('roulette bets collapse into one line', roul.length === 1 && roul[0][2] === -20, JSON.stringify(roul));
  check('lines are sorted biggest first', r.lines.every((l, i) => i === 0 || Math.abs(r.lines[i - 1][2]) >= Math.abs(l[2])));
  check('Bo is The Degenerate', r.awards.some((a) => a.includes('Degenerate') && a.includes('Bo') && a.includes('$25')), r.awards.join(' | '));
  check('Ann is the Breadwinner', r.awards.some((a) => a.includes('Breadwinner') && a.includes('Ann')));
  check('Bo is The Liability (ticket + bribe)', r.awards.some((a) => a.includes('Liability') && a.includes('Bo') && a.includes('2 run-ins')));

  // the receipt goes out exactly once, right after the run ends
  host.s.rv.integrity = 0;
  for (let i = 0; i < 10; i++) host.step(1 / 60);
  check('run ended (totaled)', host.s.phase === 'ended' && host.s.ending.startsWith('TOTALED'));
  check('one receipt event', receipts.length === 1 && receipts[0].lines.length === r.lines.length, `${receipts.length}`);
}

// ---------- stranded ----------
{
  const { host, toasts } = make();
  const s = host.s;
  const run = (sec: number) => { for (let t = 0; t < sec && s.phase === 'drive'; t += 1 / 30) host.step(1 / 30); };
  s.rv.fuel = 0;
  run(60);
  check('gas in the jerrycans → not stranded', s.phase === 'drive');
  for (const it of s.items) if (it.k === 'jerrycan') it.d = 0;
  run(20);
  check('warned first', s.phase === 'drive' && toasts.some((t) => t.includes('Bone dry')));
  s.rv.fuel = 3; run(2); s.rv.fuel = 0; run(40);
  check('refuelling resets the countdown', s.phase === 'drive');
  run(10);
  check('STRANDED after 45 s dry', s.phase === 'ended' && s.ending.includes('STRANDED'), s.ending);
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
