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
  ROUTE_MILES: 250,
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
export const WHEELBASE = RV.wheelRearZ - RV.wheelFrontZ;

export interface GearInfo { name: string; top: number; acc: number }
/** index = gear + 1 (gear −1 = R, 0 = N, 1–5) */
export const GEARS: GearInfo[] = [
  { name: 'R', top: -16, acc: 2.2 },
  { name: 'N', top: 0, acc: 0 },
  { name: '1', top: 22, acc: 3.3 },
  { name: '2', top: 42, acc: 2.8 },
  { name: '3', top: 62, acc: 2.2 },
  { name: '4', top: 82, acc: 1.75 },
  { name: '5', top: 104, acc: 1.45 },
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
  jump: 5.5,
  gravity: 18,
  stepUp: 0.72,
  reach: 2.4,
};

export const PLAYER_COLORS = [0xff7f50, 0x4fc3f7, 0x9ccc65, 0xba68c8];

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
