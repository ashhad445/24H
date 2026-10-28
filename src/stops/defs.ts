// The stops after Rusty's Oasis, built from kit parts. Stop-local coords: +X away from the road.
import * as THREE from 'three';
import { MAT, bean, type StopDef } from './kit';
import { blackjack, grillJob, jukebox, roulette, slots } from './games';
import { bed, building, decor, iceMachine, junkCars, lot, pawn, pumps, pylon, scrap, shop, table, vending } from './parts';

const canopy = (x0: number, x1: number, z0: number, z1: number, h: number, title: string) => decor('canopy', (v) => {
  v.box(MAT.white, x0, x1, h, h + 0.5, z0, z1, true);
  v.box(MAT.red, x0 - 0.02, x1 + 0.02, h + 0.1, h + 0.4, z0 - 0.02, z1 + 0.02);
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) v.box(MAT.steel, x - 0.15, x + 0.15, 0, h, z - 0.15, z + 0.15, true);
  const s = v.sign([[title, 110, '#fff']], '#c62828', z1 - z0, 0.42, 1024, 160);
  s.position.set(x0 - 0.03, h + 0.25, (z0 + z1) / 2); s.rotation.y = -Math.PI / 2;
  const l = new THREE.PointLight('#fff4d6', 6, 16, 1); l.position.set((x0 + x1) / 2, h - 0.4, (z0 + z1) / 2); v.group.add(l);
}, [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => ({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 })));

// ------------------------------------------------------------------ Lucky Scorpion Diner (I-15)
const DINER = { x0: 20, x1: 36, z0: -10, z1: 8 };
const diner: StopDef = {
  id: 'diner', name: 'Lucky Scorpion Diner', mile: 120, branch: { fork: 0, index: 0 },
  lot: { x0: 5, x1: 50, z0: -30, z1: 30 },
  parts: [
    lot({ x0: 5, x1: 50, z0: -30, z1: 30 }),
    building({ id: 'bldg', ...DINER, h: 4, door: [-2, 0], wall: '#80cbc4', roof: '#00695c', floor: '#eceff1',
      sign: { lines: [['LUCKY SCORPION', 64, '#ffeb3b'], ['DINER · PIE · COFFEE', 40, '#fff']], bg: '#004d40', w: 7, h: 1.3 }, light: '#fff3e0' }),
    // counter: checkout end by the register, pastry case for goods
    shop({ id: 'shop', clerkName: 'Flo', clerkColor: '#ec407a',
      products: [['burger', 8, 3], ['cheeseburger', 10, 2], ['coffee', 2, 3], ['soda', 2, 3], ['energy', 4, 2]],
      shelves: [{ x0: 22.5, x1: 23.7, z0: 3, z1: 7.4, top: 1.0 }],
      checkout: { x0: 27, x1: 28, z0: -6, z1: 4, top: 1.05 }, register: [27.5, 1.05, -5.3], clerk: [29, -3.5], store: DINER }),
    grillJob('grill', { x0: 33, x1: 34, z0: -7, z1: -5, top: 1.0 }, [27.5, 1.08, 2.6], [34.8, 1.5], 8, 6),
    jukebox('juke', [35.3, 6.6], 1),
    table('booth1', { x0: 20.3, x1: 21.6, z0: -8.6, z1: -7 }, 0.78, 'white'),
    table('booth2', { x0: 20.3, x1: 21.6, z0: -5.4, z1: -3.8 }, 0.78, 'white'),
    table('booth3', { x0: 20.3, x1: 21.6, z0: 2.4, z1: 4 }, 0.78, 'white'),
    pylon('sign', 8, 24, [['LUCKY', 100, '#ffeb3b'], ['SCORPION', 80, '#fff'], ['🦂 DINER', 60, '#ffeb3b'], ['OPEN 24 HRS', 40, '#fff']], '#00695c'),
  ],
};

// ------------------------------------------------------------------ Canyon Junkyard (Devil's Canyon)
const SHACK = { x0: 16, x1: 24, z0: -14, z1: -6 };
const fence: [number, number, number, number][] = [[12, 12.2, -32, -6], [12, 12.2, 6, 32], [12, 58, -32.2, -32], [12, 58, 32, 32.2], [58, 58.2, -32, 32]];
const junkyard: StopDef = {
  id: 'junkyard', name: 'Canyon Junkyard', mile: 120, branch: { fork: 0, index: 1 },
  lot: { x0: 5, x1: 60, z0: -35, z1: 35 },
  parts: [
    lot({ x0: 5, x1: 60, z0: -35, z1: 35 }, true),
    decor('fence', (v) => {
      const m = new THREE.MeshStandardMaterial({ color: '#8d8d8d', roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.6 });
      for (const [x0, x1, z0, z1] of fence) v.box(m, x0, x1, 0, 2.4, z0, z1);
      const gate = v.sign([['JUNK · PARTS · PAWN', 60, '#ffd54f']], '#3e2723', 6, 0.7, 1024, 128);
      gate.position.set(12.3, 3.2, 0); gate.rotation.y = -Math.PI / 2;
      v.box(MAT.rust, 12, 12.3, 0, 3.6, -6.3, -6); v.box(MAT.rust, 12, 12.3, 0, 3.6, 6, 6.3);
    }, fence.map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1 }))),
    building({ id: 'shack', ...SHACK, h: 3.2, door: [-11, -9], wall: '#8d6e63', roof: '#4e342e', floor: '#6d4c41',
      sign: { lines: [['DUSTY\'S', 70, '#ffd54f'], ['WE BUY ANYTHING', 40, '#fff']], bg: '#3e2723', w: 4, h: 1 } }),
    pawn('pawn', [21.5, 0.9, -8.2], 'Dusty'),
    decor('dusty', (v) => { const d = bean('#5d4037', '#a1887f'); d.position.set(22.8, 0, -8.2); d.rotation.y = Math.PI / 2; v.group.add(d); }),
    vending('soda', [15.6, -3], 'soda', 2, '#c62828', 'COLA'),
    junkCars('cars', [[30, -20, 0.3, '#5d4037'], [36, -18, -0.2, '#455a64'], [44, -22, 1.2, '#827717'], [30, 14, 0.1, '#4e342e'],
      [38, 18, 1.5, '#37474f'], [47, 10, -0.4, '#6d4c41'], [50, -6, 0.8, '#3e2723'], [26, 26, 1.1, '#5d4037']]),
    scrap('loot', [['spare', 33, 0.5, 4], ['fuse', 30, 1.6, 14], ['fuse', 44, 1.6, -22], ['coolant', 38, 0.3, -2], ['tape', 36, 1.6, -18],
      ['hammer', 47, 1.6, 10], ['jerrycan', 25, 0.3, 2]]),
    pylon('sign', 8, 22, [['CANYON', 100, '#ffd54f'], ['JUNKYARD', 90, '#fff'], ['PARTS · PAWN', 50, '#ffd54f']], '#4e342e'),
  ],
};

// ------------------------------------------------------------------ Roadside Motel (Motel Row)
const OFFICE = { x0: 14, x1: 22, z0: -22, z1: -14 };
const ROOM6 = { x0: 27, x1: 35, z0: 0, z1: 6 };
const motel: StopDef = {
  id: 'motel', name: 'Roadside Motel', mile: 190, branch: { fork: 1, index: 0 },
  lot: { x0: 5, x1: 60, z0: -35, z1: 35 },
  parts: [
    lot({ x0: 5, x1: 60, z0: -35, z1: 35 }),
    building({ id: 'office', ...OFFICE, h: 3.4, door: [-19, -17], wall: '#ffcc80', roof: '#bf360c', floor: '#a1887f',
      sign: { lines: [['OFFICE', 80, '#fff']], bg: '#bf360c', w: 3, h: 0.8 } }),
    vending('energy', [16, -11.5], 'energy', 4, '#33691e', 'VOLT'),
    building({ id: 'room6', ...ROOM6, h: 3.2, door: [2, 4], wall: '#ffe0b2', roof: '#bf360c', floor: '#5d4037',
      sign: { lines: [['ROOM 6', 80, '#3e2723']], bg: '#ffd54f', w: 2, h: 0.6 }, light: '#ffcc80' }),
    bed('bed', [32.5, 3], 40, 4, 'Room 6'),
    decor('rooms', (v) => {
      // the rest of the motel row: doors and windows on a long block
      const wall = new THREE.MeshStandardMaterial({ color: '#ffe0b2', roughness: 0.9 });
      v.box(wall, 27, 35, 0, 3.2, -26, -0.2, true); v.box(wall, 27, 35, 0, 3.2, 6.2, 26, true);
      v.box(new THREE.MeshStandardMaterial({ color: '#bf360c' }), 26.4, 35.4, 3.2, 3.45, -26.5, 26.5, true);
      for (let z = -24; z < 25; z += 6) {
        if (z === 0) continue;
        v.box(new THREE.MeshStandardMaterial({ color: '#4e342e' }), 26.95, 27, 0, 2.2, z + 1, z + 2);
        v.box(MAT.glassDark, 26.95, 27, 1.2, 2.2, z + 3, z + 4.5);
      }
    }, [{ x0: 27, x1: 35, z0: -26, z1: -0.2 }, { x0: 27, x1: 35, z0: 6.2, z1: 26 }]),
    iceMachine('ice', [25, -7]),
    decor('pool', (v) => {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(9, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4dd0e1', roughness: 0.1, metalness: 0.2 }));
      water.position.set(46, 0.02, -12); v.group.add(water);
      const fm = new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.6, roughness: 0.4 });
      v.box(fm, 41, 41.1, 0, 1.2, -20, -4); v.box(fm, 51, 51.1, 0, 1.2, -20, -4); v.box(fm, 41, 51.1, 0, 1.2, -20.1, -20); v.box(fm, 41, 51.1, 0, 1.2, -4, -3.9);
      const s = v.sign([['POOL', 80, '#006064'], ['NO LIFEGUARD · NO REFUNDS', 30, '#006064']], '#e0f7fa', 2.4, 0.9, 512, 192);
      s.position.set(40.95, 1.6, -12); s.rotation.y = -Math.PI / 2;
    }, [{ x0: 41, x1: 51.1, z0: -20.1, z1: -3.9 }]),
    pylon('sign', 8, 26, [['MOTEL', 120, '#ff5252'], ['VACANCY', 70, '#69f0ae'], ['COLOR TV · ICE', 44, '#fff']], '#263238'),
  ],
};

// ------------------------------------------------------------------ Rusty Cactus Casino (Cactus Strip)
const CASINO = { x0: 18, x1: 44, z0: -18, z1: 18 };
const casino: StopDef = {
  id: 'casino', name: 'Rusty Cactus Casino', mile: 190, branch: { fork: 1, index: 1 },
  lot: { x0: 5, x1: 70, z0: -40, z1: 40 },
  parts: [
    lot({ x0: 5, x1: 70, z0: -40, z1: 40 }),
    building({ id: 'bldg', ...CASINO, h: 5, door: [-2, 2], wall: '#4a148c', roof: '#1a0033', floor: '#7f0000',
      sign: { lines: [['RUSTY CACTUS', 70, '#ffd54f'], ['CASINO', 90, '#ff4081']], bg: '#1a0033', w: 9, h: 2 }, light: '#ff80ab' }),
    slots('hr1', [43.3, -14], 25, 300, 1000, 'HIGH ROLLER', '#b71c1c'),
    slots('hr2', [43.3, -11], 25, 300, 1000, 'HIGH ROLLER', '#b71c1c'),
    slots('pen1', [43.3, 11], 5, 100, 250, 'PENNY 777', '#1565c0'),
    slots('pen2', [43.3, 14], 5, 100, 250, 'PENNY 777', '#1565c0'),
    roulette('roulette', [31, -8], 10),
    blackjack('bj', [31, 9], 20),
    decor('bouncer', (v) => {
      const b = bean('#212121'); b.scale.setScalar(1.25); b.position.set(16.6, 0, -3.6); b.rotation.y = Math.PI / 2; v.group.add(b);
      const rope = new THREE.MeshStandardMaterial({ color: '#b71c1c' });
      for (const z of [-5, 5]) v.box(MAT.steel, 15.9, 16.1, 0, 1, z - 0.1, z + 0.1);
      v.box(rope, 15.95, 16.05, 0.8, 0.85, -5, -2.2);
    }),
    decor('neon', (v) => {
      // a giant neon saguaro on the roof
      const neon = new THREE.MeshStandardMaterial({ color: '#69f0ae', emissive: '#00e676', emissiveIntensity: 2 });
      v.box(neon, 20, 21, 5, 13, -1, 1); v.box(neon, 20, 21, 8, 9, 1, 3.5); v.box(neon, 20, 21, 9, 11.5, 2.5, 3.5);
      v.box(neon, 20, 21, 7, 8, -3.5, -1); v.box(neon, 20, 21, 8, 10.5, -3.5, -2.5);
      const l = new THREE.PointLight('#00e676', 20, 40, 1.2); l.position.set(18, 9, 0); v.group.add(l);
    }),
    pylon('sign', 8, 32, [['RUSTY CACTUS', 70, '#ffd54f'], ['CASINO', 120, '#ff4081'], ['LOOSEST SLOTS IN NEVADA', 34, '#fff']], '#1a0033'),
  ],
};

// ------------------------------------------------------------------ Last Chance Gas (every route)
const LCSTORE = { x0: 30, x1: 42, z0: -10, z1: 6 };
const lastChance: StopDef = {
  id: 'lastchance', name: 'Last Chance Gas', mile: 230,
  lot: { x0: 5, x1: 55, z0: -30, z1: 30 },
  parts: [
    lot({ x0: 5, x1: 55, z0: -30, z1: 30 }),
    canopy(8, 17.5, -9, 9, 5.2, 'LAST CHANCE'),
    pumps('pump', [[12, -4], [12, 4]], 4),
    building({ id: 'store', ...LCSTORE, h: 3.6, door: [-3, -1], wall: '#bcaaa4', roof: '#3e2723', floor: '#8d6e63',
      sign: { lines: [['LAST CHANCE', 64, '#ffeb3b'], ['NEXT GAS: NEVER', 40, '#fff']], bg: '#b71c1c', w: 6, h: 1.2 } }),
    shop({ id: 'shop', clerkName: 'Earl', clerkColor: '#546e7a',
      products: [['patty', 5, 4], ['bun', 2.5, 4], ['cheese', 2, 3], ['coffee', 4, 3], ['energy', 6, 3], ['soda', 3, 3],
        ['coolant', 18, 2], ['tape', 12, 2], ['fuse', 5, 2], ['spare', 90, 1]],
      shelves: [{ x0: 36.5, x1: 37.7, z0: -9, z1: -3.5, top: 1.0 }, { x0: 39, x1: 40.2, z0: -9, z1: -3.5, top: 1.0 }],
      checkout: { x0: 33, x1: 34, z0: 0.5, z1: 5, top: 1.05 }, register: [33.5, 1.05, 1.1], clerk: [35, 3], store: LCSTORE }),
    pawn('pawn', [40.5, 0.9, 3.8], 'Earl'),
    pylon('sign', 8, 22, [['LAST CHANCE', 80, '#ffeb3b'], ['GAS', 120, '#fff'], ['REG $4.00', 60, '#ffeb3b']], '#b71c1c'),
  ],
};

export const STOPS: StopDef[] = [diner, junkyard, motel, casino, lastChance];
