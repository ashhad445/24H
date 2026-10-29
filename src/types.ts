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
  station: number; // index into RADIO_STATIONS
  charm: number; // index into CHARM_QUOTES (the skull on the mirror)
  charm2: number; // index into CHARM2_QUOTES (the coffin on the rear-view mirror)
  nos: number; // nitrous charges left
  nosT: number; // seconds of nitrous burn left
  rocks: number; // rocks stashed in the rock bin
  rearWin: boolean; // rear window hatch open
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
  sl: number; // inventory slot 0–2 while carried, else −1
  st?: number; // 1 = stolen goods (confiscated if you get bonked)
}

/** A shopkeeper / sheriff running a player down on foot (world space). */
export interface ChaseState { who: number; x: number; z: number; t: number }

export interface CrewState {
  hunger: number; // 0–100
  hypno: number; // 0–1 road hypnosis (driver)
  caf: number; // seconds of caffeine left
  slot: number; // selected inventory slot 0–2
  spray: number; // seconds of extinguisher spray visual left
  hp: number; // 0–100 health; 0 = passed out
  drunk: number; // seconds of free-casino-drink wobble left
}

export interface CabinState {
  stoveOn: boolean;
  fire: number; // 0–1 grease fire
  smoke: number; // 0–1 cabin smoke
  fuseOut: boolean;
  flat: number; // wheel index with a flat, −1 = none (0 FL, 1 FR, 2 RL, 3 RR)
  nuts: number; // lug nuts done on the flat
  brew: number; // seconds left brewing coffee, 0 = idle
  fridge: [string, number][]; // RV fridge contents (kind, d), last in = first out
  fridgeT: number; // seconds the fridge door stays open (visual)
}

/** Rusty's Oasis (Mile 50) live state. */
export interface RustyState {
  pumps: { auth: number; gal: number; cost: number }[]; // auth = seconds the pump stays authorized
  slot: { res: number[]; left: number; spins: number }; // left = seconds of spin animation remaining
  derby: { phase: 0 | 1 | 2; t: number; pos: number[]; bets: [number, number][]; winner: number }; // 0 idle, 1 betting, 2 racing
  wash: { dirt: number[]; away: number }; // dirt per splat (0–2), seconds until the next dirty car
  cletus: { watch: boolean; t: number; chase: ChaseState | null };
  cars: { parts: number; gas: number }[]; // parked cars: parts left to strip, siphon charges left
}

/** NPC vehicle (traffic, Sheriff Roscoe, the Loan Shark). World space. */
export interface NPCState {
  id: number;
  k: 'sedan' | 'pickup' | 'camper' | 'semi' | 'cop' | 'shark' | 'bandit';
  x: number; z: number; yaw: number;
  speed: number;
  c: number; // paint color index (traffic)
  w: number; // wrecked seconds left (0 = fine)
  /** Wrecked cars are free bodies: world velocity, yaw rate, and barrel-roll angle (radians, client animates). */
  vx?: number; vz?: number; spin?: number; roll?: number;
}

/** A canyon boulder: falling (y > 0), rolling, or resting on the road. World space. */
export interface Boulder { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; broken: number /* seconds since it shattered, 0 = whole */ }

/** Canyon bandits: 0 none, 1 driving in, 2 roadblock, 3 robbing / leaving. */
export interface BanditState { phase: 0 | 1 | 2 | 3; t: number; near: number; fed: boolean; couch: [number, number, number] | null /* x, z, yaw */ }

/** Police: 0 none, 1 chasing, 2 tailing, 3 pulled over (Roscoe at the window), 4 leaving, 5 on foot after a player. */
export interface CopState { phase: 0 | 1 | 2 | 3 | 4 | 5; t: number; fled: boolean; foot?: ChaseState | null }

/** Road encounter kinds (see road/Encounters.ts). */
export type EncKind = 'hitch' | 'motorist' | 'cattle' | 'ostrich' | 'suitcase' | 'roadwork' | 'train';

/** One active road encounter. `z` = road distance (centerline z) it sits at, `off` = lateral offset (+ = right). Kind modules add their own small fields. */
export interface Enc { id: number; k: EncKind; z: number; off: number; ph: number; t: number; [key: string]: any }

/** A tumbleweed rolling across the road (world space). */
export interface Weed { id: number; x: number; z: number; vx: number; vz: number; r: number }

export interface EncState {
  list: Enc[];
  rider: { type: number; t: number; name: string } | null; // hitchhiker riding at the dinette
  weeds: number; // tumbleweeds stuck on the windshield (0–5)
  rolling: Weed[];
  cone: number; // 1 = a traffic cone is jammed under the front bumper
  bird: number; // 1 = a tamed ostrich is riding in the back
}

export interface SharedState {
  rv: RVState;
  route: number[]; // branch chosen at each fork (−1 = not reached yet)
  weather: { storm: number; wind: number }; // storm 0–1, wind = lateral push (± = right/left)
  npcs: NPCState[];
  cop: CopState;
  shark: { on: boolean; t: number };
  mafia: { on: boolean; thugs: { id: number; x: number; z: number; hp: number }[] }; // late = the Bonetti crew hunts you; thugs wait at the chapel
  boulders: Boulder[];
  bandits: BanditState;
  enc: EncState;
  rusty: RustyState;
  stops: Record<string, Record<string, any>>; // kit-built stops: stopId → partId → state
  cab: CabinState;
  items: ItemState[];
  crew: Record<string, CrewState>;
  money: number;
  clock: number; // elapsed game seconds since the run started
  seats: { driver: number; nav: number }; // peer ids, −1 = empty
  heat: number;
  wanted: number; // last player caught stealing (−1 = nobody); Roscoe goes after them on foot
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
  | { t: 'shoot'; o: [number, number, number]; d: [number, number, number] }
  | { t: 'drop'; inRV: boolean; p: [number, number, number]; v: [number, number, number] }
  | { t: 'ev'; k: 'toast'; text: string }
  | { t: 'ev'; k: 'sfx'; name: string; at?: [number, number, number] }
  | { t: 'ev'; k: 'text'; from: string; text: string }
  | { t: 'ev'; k: 'emote'; who: number; what: 'slap' | 'eat' | 'wave' }
  | { t: 'ev'; k: 'jolt'; mag: number }
  | { t: 'ev'; k: 'fade'; to: number; dur: number; ko?: boolean } // ko = knocked out (bat / taser), not Tammy
  | { t: 'ev'; k: 'fed'; to: number; stam: number; boost?: [number, number, number] } // boost: seconds, sprint drain ×, refill ×
  | { t: 'ev'; k: 'puke'; to: number }
  | { t: 'ev'; k: 'wake'; to: number }; // passed out: wake up on the RV floor
