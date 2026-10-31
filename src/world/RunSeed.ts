// One seed per run decides the road shape (RoadShape.ts) and where the stops and forks are.
// The host picks it at start and shares it in `s.seed`; every client rebuilds the same layout locally.
import { CFG } from '../config';
import { STOPS } from '../stops/defs';
import { placeRusty } from '../stops/rusty';
import { FORKS, FORK_LEN } from './Route';
import { STOP_MILES } from './World';
import { keepZones, layoutFor, planRoad, shapeSeed, type RunLayout } from './RoadShape';

const ALT_LEN = 3600; // keep in sync with World.ALT_LEN (how far the untaken branch is drawn)
let layout: RunLayout = layoutFor(0);
export const runLayout = () => layout;
/** Miles of every stop on any route (speed cameras keep clear of them). */
export const stopMiles = () => [layout.rusty, layout.forkA + 40, layout.forkB + 40, layout.lastChance];

export function applyRunSeed(seed: number) {
  if (seed === shapeSeed()) return false;
  layout = layoutFor(seed);
  const L = layout;
  const [a, b] = FORKS;
  a.mile = L.forkA; b.mile = L.forkB;
  a.branches[0].side = L.sideA; a.branches[1].side = (-L.sideA) as 1 | -1;
  b.branches[0].side = L.sideB; b.branches[1].side = (-L.sideB) as 1 | -1;
  a.branches[0].delta = L.deltaI15; a.branches[1].delta = L.deltaCanyon; b.branches[1].delta = L.deltaCasino;
  a.branches[0].sign[2] = `Diner · Gas · +${L.deltaI15} mi`;
  a.branches[1].sign[2] = `Rough road · No gas · −${-L.deltaCanyon} mi`;
  b.branches[1].sign[2] = `Blackjack · Roulette · +${L.deltaCasino} mi`;
  for (const d of STOPS) {
    if (d.id === 'rustyx') d.mile = L.rusty;
    else if (d.branch) d.mile = (d.branch.fork === 0 ? L.forkA : L.forkB) + 40;
    else if (d.id === 'lastchance') d.mile = L.lastChance;
  }
  STOP_MILES.splice(0, STOP_MILES.length, ...stopMiles());
  planRoad(seed, keepZones(L, FORK_LEN, ALT_LEN));
  placeRusty(L.rusty);
  return true;
}

/** A fresh run seed (host). `?seed=N` forces one (0 = the old straight highway). */
export function newRunSeed(): number {
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('seed');
  if (q !== null && q !== '' && Number.isFinite(Number(q))) return Number(q) >>> 0;
  return 1 + Math.floor(Math.random() * 2 ** 30);
}
export const MILE_M = 1 / CFG.MILES_PER_METER;
