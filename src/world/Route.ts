// The run's route: forks along the highway and which branch the crew took.
// The road centerline is the base highway plus a lateral offset per fork, so after a fork the
// branch you drove down simply *is* the road. Choices are host-decided and synced in snapshots.
import { CFG } from '../config';

export interface Branch {
  name: string;
  side: 1 | -1; // +1 bears right, −1 bears left
  delta: number; // miles this branch adds to the trip
  rough: number; // pothole multiplier
  wind: number; // crosswind / sandstorm multiplier
  canyon: boolean; // red cliff walls along the road
  stop: string; // what this branch leads to
  sign: string[]; // overhead sign lines
}
export interface Fork { id: number; mile: number; branches: [Branch, Branch] }

export const BASE_MILES = CFG.ROUTE_MILES;
export const FORK_SPLIT = 60; // each branch swings this far sideways (m)
export const FORK_LEN = 1500; // distance over which the branches separate (m)
const M = 1 / CFG.MILES_PER_METER; // meters per mile

export const FORKS: Fork[] = [
  {
    id: 0, mile: 200, branches: [
      { name: 'I-15', side: 1, delta: 40, rough: 0.6, wind: 0.5, canyon: false, stop: 'Lucky Scorpion Diner', sign: ['I-15 NORTH', 'LAS VEGAS', 'Diner · Gas · +40 mi'] },
      { name: "Devil's Canyon", side: -1, delta: -30, rough: 2.6, wind: 1.6, canyon: true, stop: 'Canyon Junkyard', sign: ["DEVIL'S CANYON", 'SHORTCUT', 'Rough road · No gas · −30 mi'] },
    ],
  },
  {
    id: 1, mile: 340, branches: [
      { name: 'Motel Row', side: 1, delta: 0, rough: 1, wind: 0.8, canyon: false, stop: 'Roadside Motel', sign: ['MOTEL ROW', 'VACANCY', 'Sleep · Ice · Pool'] },
      { name: 'Cactus Strip', side: -1, delta: 10, rough: 1, wind: 1, canyon: false, stop: 'Rusty Cactus Casino', sign: ['CACTUS STRIP', 'CASINO', 'Blackjack · Roulette · +10 mi'] },
    ],
  },
];

export const forkZ = (f: Fork) => -f.mile * M;

/** Current choices (−1 = undecided → branch 0 is assumed). Module-level so roadX can use it. */
let choices: number[] = FORKS.map(() => -1);
let version = 0;
export const routeVersion = () => version;
export const routeChoices = () => choices.slice();
export const chosen = (forkId: number) => Math.max(0, choices[forkId]);

/** Apply choices (from the host or a snapshot). Returns the z beyond which the road changed, or null. */
export function setRouteChoices(next: number[]): number | null {
  let changedZ: number | null = null;
  next.forEach((c, i) => {
    if (c !== choices[i] && Math.max(0, c) !== Math.max(0, choices[i])) changedZ = Math.max(changedZ ?? -Infinity, forkZ(FORKS[i]));
  });
  const any = next.some((c, i) => c !== choices[i]);
  choices = next.slice();
  if (any) version++;
  return changedZ;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Lateral offset of the road at z from all forks, given a branch per fork. */
export function routeOffset(z: number, pick: (forkId: number) => number = chosen): number {
  let off = 0;
  for (const f of FORKS) {
    const fz = forkZ(f);
    if (z >= fz) break; // forks are ordered by mile; z decreases along the route
    off += f.branches[pick(f.id)].side * FORK_SPLIT * smooth((fz - z) / FORK_LEN);
  }
  return off;
}

/** The branch in effect at z (latest fork already passed), or null before the first fork. */
export function branchAt(z: number): Branch | null {
  let b: Branch | null = null;
  for (const f of FORKS) if (z < forkZ(f)) b = f.branches[chosen(f.id)];
  return b;
}

/** Total trip length in miles given the current choices (undecided → branch 0). */
export function totalMiles() {
  return BASE_MILES + FORKS.reduce((a, f) => a + f.branches[chosen(f.id)].delta, 0);
}
export const chapelZ = () => -totalMiles() * M;
export const progressMiles = (z: number) => Math.max(0, -z / M);
