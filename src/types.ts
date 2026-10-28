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
  d: number; // patty: cook progress · tools: uses left
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

export interface SharedState {
  rv: RVState;
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
