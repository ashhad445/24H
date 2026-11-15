// The one-line "what now?" hint at the top of the HUD: first-drive walkthrough, how to fix whatever
// just broke, and otherwise the next place on the road. Derived from shared state; nothing is synced.
import { STOPS } from '../stops/defs';
import { FORKS, progressMiles, totalMiles } from '../world/Route';
import { runLayout } from '../world/RunSeed';
import type { SeatRole, SharedState } from '../types';

/** Next stop, undecided fork, or the chapel ahead of the RV on this run's route. */
export function nextWaypoint(s: SharedState): { label: string; miles: number } {
  const here = progressMiles(s.rv.z);
  const pts: [number, string][] = [[runLayout().rusty, "Rusty's Oasis (gas · store · slots)"], [totalMiles(), '💒 The wedding chapel']];
  for (const f of FORKS) {
    if (s.route[f.id] !== -1) continue;
    const [a, b] = f.branches;
    const side = (k: number) => (k > 0 ? 'right' : 'left');
    pts.push([f.mile, `Fork: ${a.name} (${side(a.side)}) or ${b.name} (${side(b.side)})`]);
  }
  for (const d of STOPS) {
    if (d.id === 'rustyx') continue;
    if (d.branch && s.route[d.branch.fork] !== d.branch.index) continue;
    pts.push([d.mile, d.name]);
  }
  const ahead = pts.filter(([m]) => m > here - 0.25).sort((x, y) => x[0] - y[0])[0] ?? pts[1];
  return { label: ahead[1], miles: Math.max(0, ahead[0] - here) };
}

/** Every place on this run's route, as a 0..1 position along it (for the HUD route bar). */
export function routeMarks(s: SharedState): { at: number; kind: 'stop' | 'fork' | 'end'; label: string }[] {
  const total = totalMiles();
  const out: { at: number; kind: 'stop' | 'fork' | 'end'; label: string }[] = [{ at: runLayout().rusty / total, kind: 'stop', label: "Rusty's Oasis" }];
  for (const f of FORKS) if (s.route[f.id] === -1) out.push({ at: f.mile / total, kind: 'fork', label: 'Fork' });
  for (const d of STOPS) {
    if (d.id === 'rustyx') continue;
    if (d.branch && s.route[d.branch.fork] !== d.branch.index) continue;
    out.push({ at: d.mile / total, kind: 'stop', label: d.name });
  }
  out.push({ at: 1, kind: 'end', label: 'The wedding' });
  return out.filter((m) => m.at > 0 && m.at <= 1);
}

export function objective(s: SharedState, myId: number, seat: SeatRole, nameOf: (id: number) => string): string {
  if (s.phase === 'ended') return '';
  const rv = s.rv, cab = s.cab, mine = seat === 'driver', d = s.seats.driver;
  // whatever is on fire comes first
  if (cab.fire > 0) return '🔥 Grease fire! Grab the extinguisher by the door and hold Click at the stove';
  if (s.cop.phase === 3) return '🤠 Roscoe is at the driver window: hand him the card (or a cheeseburger)';
  if (rv.fuel <= 0.01) return '⛽ Out of gas: carry a jerrycan to the fuel port (outside, rear-left) and hold Click';
  if (cab.flat >= 0) return '🛞 Flat tire: stop, then fit the spare from the rack (4 lug nuts) or wrap it in duct tape';
  if (rv.steam) return '🌡️ Overheating: ease off the throttle, pour coolant into the front grille';
  if (cab.fuseOut) return '⚡ Fuse popped: find it on the floor and put it back in the fuse box at the rear';

  // first drive: walk the crew through getting the RV moving
  if (rv.odometer < 500) {
    if (d === -1) return "🚐 Somebody take the wheel: sit in the driver's seat, front left (E)";
    if (rv.ignition !== 2) return mine ? '🔑 Click the ignition key on the dash to start the engine' : `Waiting for ${nameOf(d)} to start the engine (the key is on the dash)`;
    if (mine && rv.handbrake) return 'Space: release the handbrake';
    if (mine && rv.gear === 0) return 'E: shift into 1st, then hold W';
    if (mine) return 'Hold W. Shift up with E as the revs climb, down with Q';
    if (d !== myId && seat === '') return 'You have the back: cook (stove + raw patties), keep the driver fed and awake, fix what breaks';
  }
  if (d === -1 && Math.abs(rv.speed) < 1) return "🚐 Nobody's driving: sit in the driver's seat, front left (E)";

  const w = nextWaypoint(s);
  return w.miles < 0.3 ? `📍 ${w.label}: right here` : `📍 ${w.label} in ${w.miles < 10 ? w.miles.toFixed(1) : Math.round(w.miles)} mi`;
}
