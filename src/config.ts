// All tuning constants live here.

export const CFG = {
  RELAY_PORT: 3001,
  SNAPSHOT_HZ: 20,
  POSE_HZ: 20,
  INTERP_DELAY: 0.1, // seconds of snapshot buffering on clients

  START_MONEY: 200,
  WEDDING_MIN_BALANCE: 100,

  RUN_HOURS: 24,
  TIME_SCALE: 24, // game seconds per real second → 24 h ≈ 60 real min
  START_HOUR: 6,

  MILES_PER_METER: 1 / 225, // compressed miles
  ROUTE_MILES: 500, // doubled with the 200 mph RV so a run still takes ~an hour
  MPH: 2.23694, // m/s → mph

  FUEL_CAPACITY: 25,
  START_FUEL: 18,
};

/** RV dimensions in RV-local space (meters). −Z is the front of the RV. */
export const RV = {
  halfW: 1.4,
  innerHalfW: 1.32,
  floorY: 0.65,
  ceilY: 3.0,
  roofY: 3.1,
  zFront: -3.0, // windshield / dash plane
  zRear: 3.34,
  noseZ: -4.35,
  wheelR: 0.5,
  wheelFrontZ: -3.5,
  wheelRearZ: 1.9,
  wheelX: 1.2,
  doorZ0: -1.75,
  doorZ1: -0.95,
  doorTop: 2.75,
};
/** Nitrous: a small tank, refilled with (expensive) rocket fuel. */
/** Chasers (Roscoe, the Loan Shark) top out below the RV's ~88 m/s, so flooring it loses them:
 *  stay more than `loseDist` ahead for `loseT` s (after `grace` s, since they spawn 480 m back). */
export const CHASE = { copV: 78, sharkV: 76, loseDist: 280, loseT: 8, grace: 15 };
export const NOS = { CHARGES: 3, BURN: 5, ACC: 7, OVER: 1.25 };

export const WHEELBASE = RV.wheelRearZ - RV.wheelFrontZ;

export interface GearInfo { name: string; top: number; acc: number }
/** index = gear + 1 (gear −1 = R, 0 = N, 1–7) */
export const GEARS: GearInfo[] = [
  { name: 'R', top: -20, acc: 3.4 },
  { name: 'N', top: 0, acc: 0 },
  { name: '1', top: 30, acc: 6.0 },
  { name: '2', top: 56, acc: 5.2 },
  { name: '3', top: 84, acc: 4.6 },
  { name: '4', top: 114, acc: 4.2 },
  { name: '5', top: 146, acc: 4.0 },
  { name: '6', top: 178, acc: 3.9 },
  { name: '7', top: 208, acc: 3.9 },
];
export const gearInfo = (g: number) => GEARS[g + 1];

export const ENGINE = {
  IDLE: 820,
  REDLINE: 6200,
  CRANK_TIME: 0.9,
  STALL_TIME: 1.2,
  OVERHEAT_F: 235,
  OVERHEAT_CLEAR_F: 215,
};

export const PLAYER = {
  radius: 0.28,
  eye: 1.6,
  walk: 3.2,
  sprint: 5.5,
  /** Sprint stamina (0–100): drain and refill per second. 100 / 7 ≈ 14 s of sprinting. */
  sprintDrain: 7,
  sprintRegen: 12,
  jump: 5.5,
  gravity: 18,
  stepUp: 0.72,
  reach: 2.4,
};

export const PLAYER_COLORS = [0xff7f50, 0x4fc3f7, 0x9ccc65, 0xba68c8];

/** Radio stations (dial order). Music is generated client-side in audio/Radio.ts. */
export const RADIO_STATIONS = [
  { freq: '98.1', call: 'KCAC', tag: 'Cactus Country', genre: 'country' },
  { freq: '66.6', call: 'SURF', tag: 'Reverb Rock', genre: 'surf' },
  { freq: '103.5', call: 'MIRAGE', tag: 'Smooth Lounge', genre: 'lounge' },
  { freq: 'AM 1220', call: 'KDST', tag: 'Desert Talk', genre: 'talk' },
  { freq: 'FM 91.3', call: 'VOID', tag: 'The Void Cast (dark comedy)', genre: 'podcast' },
  { freq: '107.7', call: 'KRYP', tag: 'Murder Ballads & Grave Surf', genre: 'surf' },
] as const;

export const DEV = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

/** Phase 2 survival / galley tuning (real seconds). */
export const SURV = {
  HUNGER_TIME: 720, // 100 → 0 hunger
  HANGRY_BELOW: 25,
  HYPNO_TIME: 240, // 0 → 1 road hypnosis while cruising without caffeine
  HYPNO_MIN_SPEED: 6.7, // m/s (15 mph)
  SOLO_EASE: 0.6, // decay multiplier when playing alone
  COOK_TIME: 35, // raw → cooked
  FIRE_AT: 1.6, // cook progress where the grease ignites
  BREW_TIME: 20,
  FUSE_JOLT: 0.8,
};

/** Health (per player, host). Rates are hp per second. */
export const HP = {
  STARVING_BELOW: 20, STARVING: 1 / 6, // hungry: slow drain
  EMPTY: 1 / 2, // hunger at 0: faster
  REGEN_ABOVE: 60, REGEN: 1 / 4,
  CRASH: 15, // × jolt magnitude, only if standing
  BONK: 10,
  POISON: 15, // raw / burnt food
  WAKE_HP: 35, ER_BILL: 40, KO_SEC: 8,
};
