// Lucky Scorpion Diner extras: the room dressing, regulars, the parking lot, and the Scorpion Challenge.
// Stop-local coords: +X away from the road. The diner box is x 20..36, z −10..8; the counter runs x 27–28.
import * as THREE from 'three';
import * as PT from '../fx/ProcTex';
import { PoolLight } from '../fx/LightPool';
import type { Box2 } from '../rv/RV';
import { makeNpc } from '../models/npcs';
import { MAT, type Component } from './kit';

const BOOTHS: [number, number][] = [[-8.6, -7], [-5.4, -3.8], [2.4, 4]]; // table z ranges (x 20.3–21.6)
const STOOLS = [-4.4, -3.2, -2.0, -0.8, 0.4, 1.6, 2.8];

/** Benches for each booth (seat 0.45, backrest 1.1). */
function benchBoxes(): Box2[] {
  const out: Box2[] = [];
  for (const [z0, z1] of BOOTHS) {
    out.push({ x0: 20.1, x1: 21.8, z0: z0 - 0.75, z1: z0 - 0.15, top: 1.1 }, { x0: 20.1, x1: 21.8, z0: z1 + 0.15, z1: z1 + 0.75, top: 1.1 });
  }
  return out;
}

export function dinerDecor(id: string): Component {
  const fans: THREE.Object3D[] = [];
  const pies: THREE.Object3D[] = [];
  let snoreT = 2, jukeWas = 0;
  let cowboy: THREE.Object3D;
  return {
    id,
    colliders: () => [
      ...benchBoxes(),
      { x0: 41, x1: 44, z0: -26, z1: -9, top: 3.5 }, // parked semi
      { x0: 11.1, x1: 12.9, z0: -20.2, z1: -15.8, top: 1.5 }, { x0: 11.1, x1: 12.9, z0: 15.8, z1: 20.2, top: 1.5 }, // parked cars
      { x0: 36.6, x1: 37.6, z0: 9.2, z1: 10.6, top: 1.1 }, // trash cans
    ],
    build(v) {
      const g = v.group;
      // checkered floor in the customer half
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 18).rotateX(-Math.PI / 2), PT.surfaceMat(PT.tile('#f5f5f5', '#161616', 8), '#ffffff', 7, 18, 2.0));
      floor.position.set(23.5, 0.016, -1); floor.receiveShadow = true; g.add(floor);

      // booths: red vinyl benches, plates, ketchup, napkins
      const vinyl = PT.applyTex(new THREE.MeshStandardMaterial({ color: '#c62828' }), PT.vinyl('#c62828', 4, 0.5), { tile: 0.6, normal: 1 });
      for (const [z0, z1] of BOOTHS) {
        // seat + backrest on the side away from the table
        v.box(vinyl, 20.1, 21.8, 0, 0.45, z0 - 0.75, z0 - 0.15, true); v.box(vinyl, 20.1, 21.8, 0.45, 1.1, z0 - 0.75, z0 - 0.55, true);
        v.box(vinyl, 20.1, 21.8, 0, 0.45, z1 + 0.15, z1 + 0.75, true); v.box(vinyl, 20.1, 21.8, 0.45, 1.1, z1 + 0.55, z1 + 0.75, true);
      }
      for (const [z0, z1] of BOOTHS) {
        const zc = (z0 + z1) / 2;
        for (const dz of [-0.4, 0.4]) { const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.02, 16), MAT.white); plate.position.set(21.2, 0.79, zc + dz); g.add(plate); }
        const ketchup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), MAT.red); ketchup.position.set(20.5, 0.88, zc - 0.1); g.add(ketchup);
        const mustard = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#fbc02d' })); mustard.position.set(20.5, 0.88, zc + 0.05); g.add(mustard);
        v.box(MAT.steel, 20.45, 20.6, 0.78, 0.92, zc + 0.15, zc + 0.3);
      }
      // pancakes for the sleeper (booth 2)
      for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 14), new THREE.MeshStandardMaterial({ color: '#d9a35b' })); p.position.set(21.2, 0.81 + i * 0.026, -4.2); g.add(p); }

      // counter stools
      const chrome = MAT.steel;
      for (const z of STOOLS) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.72, 10), chrome); post.position.set(26.4, 0.36, z);
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 16), vinyl); seat.position.set(26.4, 0.76, z); seat.castShadow = true;
        g.add(post, seat);
      }

      // menu board on the back wall, pass-through window with a bell
      const menu = v.sign([['TODAY: MEAT', 64, '#ffeb3b'], ['BURGER $8 · CHEESE $10 · COFFEE $2', 30, '#fff'], ['PIE: ASK FLO · SCORPION CHALLENGE $15', 28, '#ff8a80'], ['NO REFUNDS · NO SHIRT NO SERVICE · NO CRYING', 22, '#80cbc4']], '#212121', 4.6, 1.6, 1024, 360);
      menu.position.set(35.78, 2.9, -1.2); menu.rotation.y = -Math.PI / 2;
      v.box(MAT.steel, 30.5, 31.5, 1.0, 1.05, -2.6, 0.2);

      // pie case on the counter
      const glass = new THREE.MeshStandardMaterial({ color: '#e1f5fe', transparent: true, opacity: 0.3, roughness: 0.1 });
      v.box(glass, 27.05, 27.95, 1.05, 1.6, 0.4, 1.9);
      const pieMats = ['#c0392b', '#f1c40f', '#8e44ad'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
      [0.7, 1.15, 1.6].forEach((z, i) => {
        const pie = new THREE.Group();
        const crust = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.06, 18), new THREE.MeshStandardMaterial({ color: '#d9a35b' }));
        const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 18), pieMats[i]); fill.position.y = 0.035;
        pie.add(crust, fill); pie.position.set(27.5, 1.12 + (i % 2) * 0.22, z); g.add(pie); pies.push(pie);
      });

      // ceiling fans
      for (const z of [-6, 0, 5]) {
        const fan = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), MAT.dark); rod.position.y = 0.25; fan.add(rod);
        for (let k = 0; k < 4; k++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.18), MAT.wood); blade.position.x = 0.55; const arm = new THREE.Group(); arm.add(blade); arm.rotation.y = (k * Math.PI) / 2; fan.add(arm); }
        fan.position.set(23.8, 3.4, z); g.add(fan); fans.push(fan);
      }

      // neon EAT in the window, and the wall of fame frame is drawn by the challenge
      const eat = v.sign([['EAT', 120, '#ff1744']], '#1a0a0a', 1.8, 0.8, 256, 128);
      eat.position.set(19.75, 3.0, 5.2); eat.rotation.y = -Math.PI / 2;
      (eat.material as THREE.MeshBasicMaterial).color.set('#ffffff');
      const eatGlow = new PoolLight('#ff1744', 4, 6, 1.5); eatGlow.position.set(19.3, 3.0, 5.2); g.add(eatGlow);

      // the regulars (human root ≈ seat height − 0.4)
      const seat = (who: THREE.Object3D, x: number, y: number, z: number, yaw: number) => { who.position.set(x, y, z); who.rotation.y = yaw; g.add(who); };
      seat(makeNpc('generic', { body: '#1565c0', hat: 'trucker', hatColor: '#2e7d32', belly: 1.35, beard: '#5d4037', pose: 'eat' }), 26.4, -0.05, -0.8, -Math.PI / 2); // trucker at the counter
      seat(makeNpc('generic', { body: '#f06292', hair: '#ffeb3b', pose: 'eat', skin: '#f1c27d' }), 21.0, -0.38, BOOTHS[0][0] - 0.45, Math.PI); // couple, booth 1
      seat(makeNpc('generic', { body: '#455a64', hat: 'cap', hatColor: '#455a64', mustache: '#3e2723', pose: 'sit' }), 21.0, -0.38, BOOTHS[0][1] + 0.45, 0);
      seat(makeNpc('generic', { body: '#8d6e63', beard: '#eeeeee', hair: '', pose: 'sleep', belly: 1.2 }), 21.0, -0.38, BOOTHS[1][1] + 0.45, 0); // asleep in his pancakes
      seat(makeNpc('generic', { body: '#ffb300', hat: 'party', hatColor: '#e91e63', pose: 'kick', height: 0.65 }), 21.0, -0.2, BOOTHS[2][0] - 0.45, Math.PI); // kid kicking the booth
      cowboy = makeNpc('generic', { body: '#6d4c41', hat: 'cowboy', hatColor: '#3e2723', mustache: '#212121', pose: 'cross', vest: '#3e2723' });
      cowboy.position.set(34.0, 0, 6.6); cowboy.rotation.y = -Math.PI / 2; g.add(cowboy); // glaring at the jukebox

      // outside: parked semi, two cars, overflowing trash, the sandwich board
      const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
      const semi = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: '#b71c1c', roughness: 0.5 });
      part(semi, new THREE.BoxGeometry(2.4, 3.0, 3.0), red, 0, 1.8, -7);
      part(semi, new THREE.BoxGeometry(2.5, 3.0, 12), MAT.white, 0, 2.1, 1);
      for (const z of [-7.5, -2, 4.5, 6]) for (const s of [-1, 1]) part(semi, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateZ(Math.PI / 2), MAT.dark, s * 1.15, 0.5, z);
      semi.position.set(42.5, 0, -17); g.add(semi);
      const trailerSign = v.sign([['SCORPION', 80, '#c62828'], ['MEAT CO.', 60, '#212121'], ['"IT\'S MOSTLY BEEF"', 30, '#555']], '#ffffff', 8, 2.2, 1024, 300);
      trailerSign.position.set(41.2, 2.2, -16); trailerSign.rotation.y = -Math.PI / 2;
      for (const [x, z, col] of [[12, -18, '#1e88e5'], [12, 18, '#43a047']] as [number, number, string][]) {
        const car = new THREE.Group(); const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.3 });
        part(car, new THREE.BoxGeometry(1.8, 0.7, 4.3), paint, 0, 0.6, 0);
        part(car, new THREE.BoxGeometry(1.6, 0.55, 2.1), MAT.glassDark, 0, 1.2, 0.2);
        for (const zz of [-1.4, 1.4]) for (const s of [-1, 1]) part(car, new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12).rotateZ(Math.PI / 2), MAT.dark, s * 0.85, 0.33, zz);
        car.position.set(x, 0, z); g.add(car);
      }
      for (const dz of [0, 0.7]) { const can = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 12), MAT.steel); can.position.set(37.1, 0.47, 9.6 + dz); can.castShadow = true; g.add(can); }
      for (let k = 0; k < 7; k++) { const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT.dark); bag.position.set(36.9 + Math.random() * 0.6, 0.95 + (k % 3) * 0.15, 9.4 + Math.random() * 1.2); g.add(bag); }
      const board = v.sign([['TRY THE', 50, '#212121'], ['SCORPION', 70, '#c62828'], ["IT'S CHICKEN", 44, '#212121'], ['(PROBABLY)', 30, '#555']], '#fff8e1', 1.2, 1.3, 256, 300);
      board.position.set(17.3, 0.8, 2.6); board.rotation.y = -Math.PI / 2; board.rotateX(-0.15); // leaning sandwich board
    },
    update(v, _st, s, dt) {
      for (const f of fans) f.rotation.y += dt * 2.2;
      for (const p of pies) p.rotation.y += dt * 0.6;
      // the sleeper snores (positional, so only when you're inside)
      snoreT -= dt;
      if (snoreT <= 0) { snoreT = 4 + Math.random() * 2; v.play('snore', [21, 1, -2.9]); }
      // the cowboy hates whatever you put on the jukebox
      const juke = s.stops.diner?.juke?.t ?? 0;
      if (juke > 0 && jukeWas <= 0) v.play('yell', [34, 1.6, 6.6]);
      jukeWas = juke;
      if (cowboy) cowboy.rotation.z = juke > 0 ? Math.sin(performance.now() * 0.02) * 0.04 : 0; // shaking with rage
    },
  };
}

// ---------------------------------------------------------------- the Scorpion Challenge
/** Order a 4-lb burger, eat it in 4 bites (chew between) within 60 s. Come hungry. */
export function scorpionChallenge(id: string, stand: [number, number, number], price = 15, prize = 40): Component {
  let clockTex: THREE.CanvasTexture, clockCtx: CanvasRenderingContext2D, fameTex: THREE.CanvasTexture, fameCtx: CanvasRenderingContext2D;
  let lastClock = '', lastFame = '';
  const reset = (st: any) => { st.who = -1; st.itemId = -1; st.t = 0; st.bites = 0; st.chew = 0; st.name = ''; };
  const end = (h: Parameters<NonNullable<Component['act']>>[0], st: any, win: boolean, why = '') => {
    const it = h.s.items.find((i) => i.id === st.itemId);
    if (it) h.items.remove(it.id);
    if (win) {
      h.credit(st.who, price + prize, 'Scorpion Challenge prize');
      st.wall = [st.name, ...st.wall].slice(0, 4);
      h.sfx('jackpot'); h.sfx('bell');
      h.toast(`🦂🏆 ${st.name} ATE THE WHOLE SCORPION! +$${price + prize}. Flo pins a blurry polaroid to the Wall of Fame.`);
    } else {
      h.hurt(st.who, why === 'puke' ? 5 : 20);
      if (why === 'puke') h.poison(st.who);
      h.toast(`📢 FLO (over the PA): "Folks, give it up for ${st.name}, who could NOT finish the Scorpion." *one slow clap from the kitchen*${why === 'time' ? ' (−20 health, meat sweats)' : ''}`);
    }
    reset(st);
  };
  return {
    id,
    colliders: () => [],
    init: () => ({ who: -1, itemId: -1, t: 0, bites: 0, chew: 0, name: '', hunger0: 0, wall: [] as string[] }),
    act(h, st, from) {
      if (st.who >= 0) { h.toast(`🦂 ${st.name} is mid-challenge. Wait your turn.`); return; }
      if (!h.needCard(from) || !h.charge(from, price, 'Scorpion Challenge')) return;
      const [x, y, z] = h.world(stand[0], stand[1] + 0.1, stand[2]);
      const it = h.items.spawn('scorpion', false, x, y, z);
      // land it in a free pocket if there's room, otherwise on the counter
      if (h.s.items.filter((i) => i.h === from).length < 3) it.h = from;
      Object.assign(st, { who: from, itemId: it.id, t: 60, bites: 0, chew: 0, name: h.name(from), hunger0: h.s.crew[from]?.hunger ?? 100 });
      h.sfx('bell');
      h.toast(`🦂 DING DING! Flo slams down a 4-lb SCORPION BURGER. ${h.name(from)}: 4 bites, 60 seconds. GO! (eat it with LMB)`);
    },
    eat(h, st, from, it) {
      if (it.k !== 'scorpion') return false;
      if (it.id !== st.itemId) { h.items.remove(it.id); h.toast('🦂 Somebody ate a cold, abandoned Scorpion Burger. Respect.'); return true; }
      if (st.chew > 0) { h.toast(`😤 Still chewing… (${Math.ceil(st.chew)} s)`); return true; }
      st.bites++; st.chew = 7;
      const c = h.s.crew[from]; if (c) c.hunger = Math.min(100, c.hunger + 25);
      h.sfx('eat');
      // too full going in? the meat fights back
      if (st.hunger0 > 60 && st.bites >= 2 && Math.random() < 0.35) { end(h, st, false, 'puke'); return true; }
      if (st.bites >= 4) end(h, st, true);
      else h.toast(`🦂 Bite ${st.bites}/4… (${Math.ceil(st.t)} s left)`);
      return true;
    },
    step(h, st, dt) {
      if (st.who < 0) return;
      st.t -= dt; st.chew = Math.max(0, st.chew - dt);
      if (!h.s.items.some((i) => i.id === st.itemId)) { reset(st); return; } // lost it somehow
      if (st.t <= 0) end(h, st, false, 'time');
    },
    build(v) {
      const g = v.group;
      // the stand on the counter: a skull-and-scorpion placard
      const placard = v.sign([['🦂 SCORPION', 54, '#ffeb3b'], ['CHALLENGE', 54, '#ffeb3b'], ['4 LB · 60 SEC', 34, '#fff'], [`$${price} · WIN $${prize}`, 34, '#69f0ae']], '#3e2723', 0.8, 0.8, 256, 256);
      placard.position.set(stand[0] - 0.46, stand[1] + 0.4, stand[2]); placard.rotation.y = -Math.PI / 2;
      const easel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.8), MAT.wood); easel.position.set(stand[0] - 0.42, stand[1] + 0.4, stand[2]); g.add(easel);
      v.reg('order', easel, (st, c) => (st.who >= 0 ? `🦂 ${st.name}: ${st.bites}/4 bites, ${Math.ceil(st.t)} s left` : c.held === 'card' ? `Order the SCORPION CHALLENGE ($${price}) — 4 bites in 60 s wins $${prize}. Come hungry.` : `Scorpion Challenge — need the card ($${price})`));
      v.reg('order2', placard, (st, c) => (st.who >= 0 ? `🦂 ${st.name}: ${st.bites}/4 bites, ${Math.ceil(st.t)} s left` : c.held === 'card' ? `Order the SCORPION CHALLENGE ($${price})` : `Scorpion Challenge — need the card ($${price})`));
      // countdown clock above the counter
      const cc = document.createElement('canvas'); cc.width = 256; cc.height = 96; clockCtx = cc.getContext('2d')!;
      clockTex = new THREE.CanvasTexture(cc); clockTex.colorSpace = THREE.SRGBColorSpace;
      const clock = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: clockTex }));
      clock.position.set(26.9, 2.7, stand[2]); clock.rotation.y = -Math.PI / 2; g.add(clock);
      // wall of fame (side wall)
      const fc = document.createElement('canvas'); fc.width = 512; fc.height = 320; fameCtx = fc.getContext('2d')!;
      fameTex = new THREE.CanvasTexture(fc); fameTex.colorSpace = THREE.SRGBColorSpace;
      const fame = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ map: fameTex }));
      fame.position.set(24, 2.2, 7.85); fame.rotation.y = Math.PI; g.add(fame);
    },
    update(_v, st) {
      const ck = st.who >= 0 ? `${Math.ceil(st.t)}:${st.bites}` : 'idle';
      if (ck !== lastClock) {
        lastClock = ck; const c = clockCtx;
        c.fillStyle = '#111'; c.fillRect(0, 0, 256, 96); c.textAlign = 'center'; c.font = 'bold 54px monospace';
        c.fillStyle = st.who >= 0 ? (st.t < 15 ? '#ff1744' : '#ffeb3b') : '#69f0ae';
        c.fillText(st.who >= 0 ? `0:${String(Math.max(0, Math.ceil(st.t))).padStart(2, '0')}  ${st.bites}/4` : 'READY?', 128, 66);
        clockTex.needsUpdate = true;
      }
      const fk = st.wall.join('|');
      if (fk !== lastFame) {
        lastFame = fk; const c = fameCtx;
        c.fillStyle = '#4e342e'; c.fillRect(0, 0, 512, 320); c.fillStyle = '#ffeb3b'; c.textAlign = 'center'; c.font = 'bold 40px Arial'; c.fillText('🦂 WALL OF FAME 🦂', 256, 50);
        for (let i = 0; i < 4; i++) {
          const x = 70 + i * 124, y = 90;
          c.fillStyle = '#fff'; c.fillRect(x - 50, y, 100, 120); c.fillStyle = st.wall[i] ? '#ffcc80' : '#9e9e9e'; c.fillRect(x - 42, y + 8, 84, 84);
          c.fillStyle = '#212121'; c.font = 'bold 15px Arial'; c.fillText(st.wall[i] ? st.wall[i].slice(0, 10) : 'YOUR FACE', x, y + 110);
          if (st.wall[i]) { c.font = '40px Arial'; c.fillText('😵', x, y + 66); }
        }
        c.fillStyle = '#ff8a80'; c.font = 'bold 22px Arial'; c.fillText(st.wall.length ? 'LEGENDS. IDIOTS. BOTH.' : 'NOBODY HAS EVER FINISHED IT', 256, 300);
        fameTex.needsUpdate = true;
      }
    },
  };
}
