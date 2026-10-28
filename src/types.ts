// Shared, networked state. The host owns it; clients receive it in snapshots.

export type SeatRole = '' | 'driver' | 'nav';

export interface RVState {
  x: number; z: number; yaw: number;
  speed: number; // m/s along local forward (−Z)
  steer: number; // rad, + = left
  gear: number; // −1 R, 0 N, 1–5
  rpm: number;
  fuel: number; // gallons
  temp: number; // °F
  ignition: 0 | 1 | 2; // off, cranking, running
  handbrake: boolean;
  headlights: boolean;
  wipers: boolean;
  dome: boolean;
  radio: boolean;
  doorOpen: boolean;
  horn: boolean;
  steam: boolean;
  grime: number; // 0–1
  integrity: number; // 0–100
  odometer: number; // meters driven
  throttle: number;
  brake: number;
}

/** A physical prop. Lives in RV-local space when rv=true, else world space. */
export interface ItemState {
  id: number;
  k: string; // kind, see items/Items.ts
  rv: boolean;
  x: number; y: number; z: number;
  ry: number; // yaw (visual)
  h: number; // holder peer id, −1 = none
  s: string; // slot: '' | 'skillet' | 'rack'
  d: number; // patty: cook progress · tools: uses left · jerrycan: gallons · sponge: suds
  p: number; // unpaid store price in $ (0 = paid / not merchandise)
}

export interface CrewState {
  hunger: number; // 0–100
  hypno: number; // 0–1 road hypnosis (driver)
  caf: number; // seconds of caffeine left
  spray: number; // seconds of extinguisher spray visual left
}

export interface CabinState {
  stoveOn: boolean;
  fire: number; // 0–1 grease fire
  smoke: number; // 0–1 cabin smoke
  fuseOut: boolean;
  flat: number; // wheel index with a flat, −1 = none (0 FL, 1 FR, 2 RL, 3 RR)
  nuts: number; // lug nuts done on the flat
  brew: number; // seconds left brewing coffee, 0 = idle
}

/** Rusty's Oasis (Mile 50) live state. */
export interface RustyState {
  pumps: { auth: number; gal: number; cost: number }[]; // auth = seconds the pump stays authorized
  slot: { res: number[]; left: number; spins: number }; // left = seconds of spin animation remaining
  derby: { phase: 0 | 1 | 2; t: number; pos: number[]; bets: [number, number][]; winner: number }; // 0 idle, 1 betting, 2 racing
  wash: { dirt: number[]; away: number }; // dirt per splat (0–2), seconds until the next dirty car
  cletus: { watch: boolean; t: number };
}

/** NPC vehicle (traffic, Sheriff Roscoe, the Loan Shark). World space. */
export interface NPCState {
  id: number;
  k: 'sedan' | 'pickup' | 'camper' | 'cop' | 'shark';
  x: number; z: number; yaw: number;
  speed: number;
  c: number; // paint color index (traffic)
  w: number; // wrecked seconds left (0 = fine)
}

/** Police: 0 none, 1 chasing, 2 tailing, 3 pulled over (Roscoe at the window), 4 leaving. */
export interface CopState { phase: 0 | 1 | 2 | 3 | 4; t: number; fled: boolean }

export interface SharedState {
  rv: RVState;
  route: number[]; // branch chosen at each fork (−1 = not reached yet)
  weather: { storm: number; wind: number }; // storm 0–1, wind = lateral push (± = right/left)
  npcs: NPCState[];
  cop: CopState;
  shark: { on: boolean; t: number };
  rusty: RustyState;
  stops: Record<string, Record<string, any>>; // kit-built stops: stopId → partId → state
  cab: CabinState;
  items: ItemState[];
  crew: Record<string, CrewState>;
  money: number;
  clock: number; // elapsed game seconds since the run started
  seats: { driver: number; nav: number }; // peer ids, −1 = empty
  heat: number;
  phase: 'drive' | 'ended';
  ending: string;
}

export interface Pose {
  inRV: boolean;
  x: number; y: number; z: number; // RV-local if inRV, else world
  yaw: number; pitch: number;
  seat: SeatRole;
}

export interface DriveInput { th: number; br: number; st: number; horn: boolean }

/** Game-level messages carried by the relay. */
export type GameMsg =
  | { t: 'snap'; s: SharedState }
  | { t: 'pose'; p: Pose }
  | { t: 'drive'; i: DriveInput }
  | { t: 'act'; id: string; btn: number }
  | { t: 'drop'; inRV: boolean; p: [number, number, number]; v: [number, number, number] }
  | { t: 'ev'; k: 'toast'; text: string }
  | { t: 'ev'; k: 'sfx'; name: string }
  | { t: 'ev'; k: 'jolt'; mag: number }
  | { t: 'ev'; k: 'fed'; to: number; stam: number };
