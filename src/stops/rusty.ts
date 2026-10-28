// Rusty's Oasis Gas & Slots — Mile 100. Layout shared by the host sim (colliders, zones)
// and the client view (meshes). Coordinates are stop-local: origin on the road centerline,
// −Z = road forward, +X = right side of the road (the lot).
import { CFG } from '../config';
import type { Box2 } from '../rv/RV';
import { ROAD_HALF, addClearZone, roadPoint, roadYaw } from '../world/World';
import type { StaticSet } from './geom';

export const RUSTY_MILE = 100;
const Z0 = -RUSTY_MILE / CFG.MILES_PER_METER;
// origin sits 5 m right of the centerline so the lot clears the 4-lane road
const [FX, FZ] = roadPoint(Z0, ROAD_HALF - 2.45);
export const RUSTY_FRAME = { x: FX, z: FZ, yaw: roadYaw(Z0) };

export const PRICES = { gas: 2.5, slot: 5, crab: 15, crabWin: 45, wash: 35, overdraftLimit: -100 };

// ---------- layout ----------
export const LOT = { x0: 5.6, x1: 70, z0: -45, z1: 45 };
export const CANOPY = { x0: 8, x1: 17.5, z0: -9, z1: 9, y: 5.2 }; // RV fits between pumps (x=12) and the posts
export const PUMPS: [number, number][] = [[12, -4], [12, 4]]; // x, z
export const HOLSTER = (i: number): [number, number, number] => [PUMPS[i][0] + 0.42, 1.15, PUMPS[i][1] + 0.12];
export const HOSE_LEN = 7;

export const STORE = { x0: 34, x1: 50, z0: -12, z1: 8, h: 4, doorZ0: -3, doorZ1: -1, innerX: 46, innerDoorZ0: -1, innerDoorZ1: 1 };
export const COUNTER = { x0: 38.5, x1: 39.3, z0: 2, z1: 7, top: 1.0 };
export const REGISTER: [number, number, number] = [38.9, 1.0, 2.6];
export const CLETUS: [number, number, number] = [40.4, 0, 4.4];
export const TABLES = [
  { x0: 40.5, x1: 41.7, z0: -10.5, z1: -4.5, top: 1.0 },
  { x0: 43, x1: 44.2, z0: -10.5, z1: -4.5, top: 1.0 },
];
export const SLOT: [number, number, number] = [49.35, 0, -8];
export const DERBY = { x0: 47, x1: 49.4, z0: 1, z1: 6.6, top: 0.9, lanes: [47.55, 48.2, 48.85], start: 1.6, finish: 6.1 };
export const CRABS = ['Pinchy', 'Claws', 'Old Bay'];
export const CRAB_COLORS = ['#e53935', '#1e88e5', '#fbc02d'];

export const WASH = { x0: 34, x1: 46, z0: 16, z1: 30, h: 4.2 };
export const SEDAN = { x: 40, z: 23, len: 4.4, wid: 1.8 };
/** Mud splats on the sedan: position + which way the face points. */
export const SPLATS: { p: [number, number, number]; n: 'z+' | 'z-' | 'y' }[] = [
  { p: [38.6, 0.75, 23.92], n: 'z+' }, { p: [40.2, 0.95, 23.92], n: 'z+' }, { p: [41.5, 0.7, 23.92], n: 'z+' },
  { p: [38.9, 0.8, 22.08], n: 'z-' }, { p: [40.6, 0.7, 22.08], n: 'z-' }, { p: [41.6, 0.9, 22.08], n: 'z-' },
  { p: [38.5, 1.02, 23.0], n: 'y' }, { p: [40.4, 1.42, 23.0], n: 'y' },
];
export const BUCKET: [number, number, number] = [35.6, 0, 19.2];
export const CRATE = { x0: 35.2, x1: 36.0, z0: 17.6, z1: 18.4, top: 0.6 };

export const SUV = { x: 62, z: -26, len: 4.8, wid: 2.0 };
export const SUV_CAP: [number, number, number] = [60.98, 1.1, -24.9];
export const SIGN: [number, number] = [8, 30];

/** Building interior used for shoplifting checks. */
export const inStore = (x: number, z: number) => x > STORE.x0 && x < STORE.x1 && z > STORE.z0 && z < STORE.z1;
/** Checkout zone: the end of the counter by the register (the scratch-off display is further down). */
export const onCounter = (x: number, y: number, z: number) => x > COUNTER.x0 - 0.1 && x < COUNTER.x1 + 0.1 && z > COUNTER.z0 - 0.1 && z < COUNTER.z0 + 2.6 && y > COUNTER.top - 0.05 && y < COUNTER.top + 0.6;

// ---------- merchandise (kind, price, count) ----------
export const PRODUCTS: [string, number, number][] = [
  ['patty', 3, 6], ['bun', 1.5, 6], ['cheese', 1, 6], ['coffee', 2, 3], ['energy', 4, 4], ['soda', 2, 4],
  ['coolant', 12, 2], ['tape', 8, 2], ['fuse', 3, 3], ['extinguisher', 25, 1], ['spare', 60, 1], ['rocket', 55, 1],
];
export const SCRATCH_PRICE = 5;
export const SCRATCH_COUNT = 6;

// ---------- colliders ----------
const wall = (x0: number, x1: number, z0: number, z1: number): Box2 => ({ x0, x1, z0, z1 });
export function rustyColliders(): Box2[] {
  const S = STORE, t = 0.2;
  const b: Box2[] = [
    // store shell (door on the road-facing wall)
    wall(S.x0 - t, S.x0, S.z0, S.doorZ0), wall(S.x0 - t, S.x0, S.doorZ1, S.z1),
    wall(S.x1, S.x1 + t, S.z0, S.z1), wall(S.x0, S.x1, S.z0 - t, S.z0), wall(S.x0, S.x1, S.z1, S.z1 + t),
    // back-room partition with a doorway
    wall(S.innerX, S.innerX + t, S.z0, S.innerDoorZ0), wall(S.innerX, S.innerX + t, S.innerDoorZ1, S.z1),
    { ...COUNTER }, ...TABLES.map((tb) => ({ ...tb })),
    { x0: SLOT[0] - 0.4, x1: SLOT[0] + 0.45, z0: SLOT[2] - 0.45, z1: SLOT[2] + 0.45 },
    { x0: DERBY.x0, x1: DERBY.x1, z0: DERBY.z0, z1: DERBY.z1, top: DERBY.top },
    // pumps + canopy posts
    ...PUMPS.map(([x, z]) => ({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.3, z1: z + 0.3 })),
    ...[[CANOPY.x0, CANOPY.z0], [CANOPY.x1, CANOPY.z0], [CANOPY.x0, CANOPY.z1], [CANOPY.x1, CANOPY.z1]].map(([x, z]) => ({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 })),
    // car wash walls + cars + crate
    wall(WASH.x0, WASH.x1, WASH.z0 - t, WASH.z0), wall(WASH.x0, WASH.x1, WASH.z1, WASH.z1 + t),
    { x0: SEDAN.x - SEDAN.len / 2, x1: SEDAN.x + SEDAN.len / 2, z0: SEDAN.z - SEDAN.wid / 2, z1: SEDAN.z + SEDAN.wid / 2, top: 1.45 },
    { x0: SUV.x - SUV.wid / 2, x1: SUV.x + SUV.wid / 2, z0: SUV.z - SUV.len / 2, z1: SUV.z + SUV.len / 2, top: 1.85 },
    { ...CRATE },
    { x0: BUCKET[0] - 0.22, x1: BUCKET[0] + 0.22, z0: BUCKET[2] - 0.22, z1: BUCKET[2] + 0.22, top: 0.4 },
    // sign pole
    { x0: SIGN[0] - 0.3, x1: SIGN[0] + 0.3, z0: SIGN[1] - 0.3, z1: SIGN[1] + 0.3 },
  ];
  return b;
}

export const RUSTY_SET: StaticSet = { ...RUSTY_FRAME, boxes: rustyColliders() };

addClearZone({ ...RUSTY_FRAME, x0: LOT.x0 - 1, x1: LOT.x1 + 15, z0: LOT.z0 - 10, z1: LOT.z1 + 10 });
