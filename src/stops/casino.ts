// Rusty Cactus Casino extras: Big Wheel, dice table, coin pusher, claw machine, free drinks, Elvis,
// the gamblers who never leave, and a bouncer who doesn't like winners.
// Stop-local coords: casino box x 18..44, z −18..18, door on the x = 18 wall.
import * as THREE from 'three';
import { makeNpc } from '../models/npcs';
import { bonk, type ChaseHost } from './chase';
import { MAT, canvasTex, type Component, type HostCtx } from './kit';

// ---------------------------------------------------------------- "we don't like winners"
const streak = new Map<number, number>();
/** Track big wins per player; three in a row and the bouncer escorts you out (head first). */
function judged(h: HostCtx, who: number, big: boolean) {
  const n = big ? (streak.get(who) ?? 0) + 1 : 0;
  streak.set(who, n);
  if (n < 3) return;
  streak.set(who, 0);
  bonk(h as unknown as ChaseHost, who, 4);
  h.toast(`🕴️ The bouncer taps ${h.name(who)} on the shoulder. "We don't like winners." Lights out.`);
}

// ---------------------------------------------------------------- Big Wheel
const SEGS = (() => {
  const s: string[] = [];
  const add = (k: string, n: number) => { for (let i = 0; i < n; i++) s.push(k); };
  add('2×', 4); add('5×', 1); add('10×', 1); add('🌵', 3); add('LOSE', 15);
  // spread them out so the wheel looks fair (it isn't)
  const out: string[] = []; const pools = [s.filter((x) => x === 'LOSE'), s.filter((x) => x !== 'LOSE')];
  while (pools[0].length || pools[1].length) { if (pools[0].length) out.push(pools[0].pop()!); if (pools[0].length) out.push(pools[0].pop()!); if (pools[1].length) out.push(pools[1].pop()!); }
  return out;
})();
export const WHEEL_SEGS = SEGS;
const SEG_COL: Record<string, string> = { '2×': '#1e88e5', '5×': '#8e24aa', '10×': '#ffb300', '🌵': '#43a047', LOSE: '#212121' };

export function bigWheel(id: string, pos: [number, number], bet = 10): Component {
  let wheel: THREE.Group;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 1.6, x1: pos[0] + 1.6, z0: pos[1] - 0.6, z1: pos[1] + 0.6 }],
    init: () => ({ left: 0, res: 0, who: -1 }),
    act(h, st, from) {
      if (st.left > 0) return;
      if (!h.needCard(from) || !h.charge(from, bet, 'Big Wheel spin')) return;
      st.res = Math.floor(Math.random() * SEGS.length); st.left = 5; st.who = from;
      h.sfx('clack');
    },
    step(h, st, dt) {
      if (st.left <= 0) return;
      st.left -= dt;
      if (st.left > 0) return;
      st.left = 0;
      const seg = SEGS[st.res];
      if (seg === 'LOSE') { h.toast('🎡 LOSE. The wheel laughs at you. (It has a speaker in it. It actually laughs.)'); judged(h, st.who, false); return; }
      if (seg === '🌵') {
        const [x, y, z] = h.world(pos[0], 1.0, pos[1] + 1.0);
        const c = h.items.spawn('cactus', false, x, y, z);
        if (h.s.items.filter((i) => i.h === st.who).length < 3) c.h = st.who;
        h.toast('🌵 CACTUS! You win… a potted cactus. Worth $0. Emotionally priceless.'); judged(h, st.who, false); return;
      }
      const mult = Number(seg.replace('×', ''));
      h.credit(st.who, bet * mult, `Big Wheel ${seg}`); h.sfx('jackpot');
      h.toast(`🎡 ${seg}! +$${bet * mult}`);
      judged(h, st.who, mult >= 5);
    },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      v.box(MAT.wood, pos[0] - 0.15, pos[0] + 0.15, 0, 2.2, pos[1] - 0.5, pos[1] - 0.3, true); // post
      const tex = canvasTex(512, 512, (c) => {
        const n = SEGS.length;
        SEGS.forEach((s, i) => {
          c.beginPath(); c.moveTo(256, 256); c.arc(256, 256, 250, (i / n) * Math.PI * 2 - Math.PI / 2, ((i + 1) / n) * Math.PI * 2 - Math.PI / 2);
          c.fillStyle = SEG_COL[s]; c.fill(); c.strokeStyle = '#ffd54f'; c.lineWidth = 3; c.stroke();
          c.save(); c.translate(256, 256); c.rotate(((i + 0.5) / n) * Math.PI * 2); c.fillStyle = '#fff'; c.font = `bold ${s.length > 3 ? 22 : 30}px Arial`; c.textAlign = 'center'; c.fillText(s, 0, -190); c.restore();
        });
        c.fillStyle = '#d4a017'; c.beginPath(); c.arc(256, 256, 40, 0, Math.PI * 2); c.fill();
      });
      wheel = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      wheel.add(disc); wheel.position.set(0, 2.4, -0.25); g.add(wheel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.06, 8, 48), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 }));
      rim.position.copy(wheel.position); g.add(rim);
      const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 3).rotateZ(Math.PI), MAT.red); pointer.position.set(0, 3.95, -0.15); g.add(pointer);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), MAT.red); lever.position.set(1.15, 0.5, 0.2); lever.castShadow = true; g.add(lever);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffd54f', emissive: '#ffb300', emissiveIntensity: 0.5 })); top.position.set(1.15, 1.1, 0.2); g.add(top);
      const sign = v.sign([['BIG WHEEL', 70, '#ffd54f'], [`$${bet} A SPIN · UP TO 10×`, 30, '#fff']], '#4a148c', 2.4, 0.7, 512, 160);
      sign.position.set(pos[0], 4.55, pos[1] - 0.2);
      v.reg('spin', lever, (st, c) => (st.left > 0 ? 'Round and round…' : c.held === 'card' ? `Spin the Big Wheel ($${bet}) — 2× / 5× / 10× / 🌵` : `Big Wheel — need the card ($${bet})`));
      v.reg('spin2', top, (st, c) => (st.left > 0 ? 'Round and round…' : c.held === 'card' ? `Spin the Big Wheel ($${bet})` : `Big Wheel — need the card ($${bet})`));
    },
    update(_v, st) {
      // deterministic ease-out onto the result: the pointer is at the top
      const target = ((st.res + 0.5) / SEGS.length) * Math.PI * 2;
      wheel.rotation.z = target + 0.9 * st.left * st.left;
    },
  };
}

// ---------------------------------------------------------------- dice table (craps-lite)
export function diceTable(id: string, pos: [number, number], bet = 10): Component {
  const T = { x0: pos[0] - 1.0, x1: pos[0] + 1.0, z0: pos[1] - 1.5, z1: pos[1] + 1.5, top: 0.9 };
  let board: THREE.CanvasTexture, bctx: CanvasRenderingContext2D, last = '';
  const onTable = (h: HostCtx, x: number, y: number, z: number) => { const [lx, lz] = h.local(x, z); return lx > T.x0 && lx < T.x1 && lz > T.z0 && lz < T.z1 && y > T.top - 0.1; };
  return {
    id,
    colliders: () => [{ ...T }],
    init: () => ({ phase: 0, who: -1, dice: [] as number[], faces: [] as number[], t: 0, msg: '' }),
    act(h, st, from) {
      if (st.phase === 1) { h.toast('🎲 Dice are rolling…'); return; }
      if (!h.needCard(from) || !h.charge(from, bet, 'Dice roll')) return;
      const hand = h.handOf(from) ?? h.world(pos[0] - 1.6, 1.3, pos[1]);
      const [cx, , cz] = h.world(pos[0], T.top, pos[1]);
      st.dice = []; st.faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      for (let i = 0; i < 2; i++) {
        const d = h.items.spawn('dice', false, hand[0], hand[1], hand[2]);
        const dx = cx - hand[0] + (Math.random() - 0.5) * 0.8, dz = cz - hand[2] + (Math.random() - 0.5) * 1.2, L = Math.hypot(dx, dz) || 1;
        const sp = Math.min(7, L / 0.55) * (0.85 + Math.random() * 0.35); // some throws are a bit too enthusiastic
        h.items.setVel(d.id, [(dx / L) * sp, 2.2, (dz / L) * sp]);
        st.dice.push(d.id);
      }
      st.phase = 1; st.who = from; st.t = 0; st.msg = 'ROLLING…';
      h.sfx('clank');
    },
    step(h, st, dt) {
      if (st.phase === 0) return;
      st.t += dt;
      if (st.phase === 2) { if (st.t > 3) { for (const id of st.dice) h.items.remove(id); st.dice = []; st.phase = 0; } return; }
      const dice = st.dice.map((id: number) => h.s.items.find((i) => i.id === id)).filter(Boolean);
      const resting = dice.every((d: any) => { const v = h.items.velOf(d.id); return !v || Math.hypot(v[0], v[1], v[2]) < 0.15; });
      if (st.t < 0.8 || (!resting && st.t < 4)) return;
      st.phase = 2; st.t = 0;
      const off = dice.length < 2 || dice.some((d: any) => !onTable(h, d.x, d.y, d.z));
      if (off) { st.msg = 'OFF THE TABLE'; h.toast('🎲 A die flew off the table! The croupier keeps your money and gives you A Look.'); judged(h, st.who, false); return; }
      const sum = st.faces[0] + st.faces[1];
      if (sum === 7 || sum === 11) { h.credit(st.who, bet * 2, `Dice: ${sum}`); h.sfx('jackpot'); st.msg = `${st.faces.join(' + ')} = ${sum} · WIN $${bet * 2}`; h.toast(`🎲 ${sum}! WINNER, +$${bet * 2}`); judged(h, st.who, false); }
      else if (sum === 2 || sum === 3 || sum === 12) { st.msg = `${st.faces.join(' + ')} = ${sum} · CRAPS`; h.toast(`🎲 ${sum}. CRAPS. The table eats your $${bet}.`); judged(h, st.who, false); }
      else { h.credit(st.who, bet, 'Dice: push'); st.msg = `${st.faces.join(' + ')} = ${sum} · PUSH`; h.toast(`🎲 ${sum} — push, $${bet} back`); }
    },
    build(v) {
      v.box(MAT.wood, T.x0, T.x1, 0, T.top, T.z0, T.z1, true);
      const felt = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0 - 0.2, T.z1 - T.z0 - 0.2).rotateX(-Math.PI / 2), MAT.felt);
      felt.position.set(pos[0], T.top + 0.005, pos[1]); v.group.add(felt);
      for (const [x0, x1, z0, z1] of [[T.x0, T.x1, T.z0, T.z0 + 0.1], [T.x0, T.x1, T.z1 - 0.1, T.z1], [T.x1 - 0.1, T.x1, T.z0, T.z1]]) v.box(MAT.wood, x0, x1, T.top, T.top + 0.14, z0, z1); // rails (the near side is open)
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; bctx = c.getContext('2d')!;
      board = new THREE.CanvasTexture(c); board.colorSpace = THREE.SRGBColorSpace;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: board }));
      b.position.set(T.x1 + 0.05, 2.0, pos[1]); b.rotation.y = -Math.PI / 2; v.group.add(b);
      v.box(MAT.steel, T.x1 + 0.02, T.x1 + 0.08, 0, 1.8, pos[1] - 0.03, pos[1] + 0.03);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.18, 14), new THREE.MeshStandardMaterial({ color: '#4e342e' }));
      cup.position.set(T.x0 + 0.25, T.top + 0.09, pos[1]); v.group.add(cup);
      v.reg('roll', cup, (st, cx) => (st.phase === 1 ? 'Rolling…' : cx.held === 'card' ? `Throw the dice ($${bet}) — 7 or 11 pays 2×, 2/3/12 loses, else push` : `Dice — need the card ($${bet})`));
    },
    update(_v, st) {
      const key = `${st.phase}:${st.msg}`;
      if (key === last) return;
      last = key; const g = bctx;
      g.fillStyle = '#0b3d1e'; g.fillRect(0, 0, 512, 128); g.textAlign = 'center';
      g.fillStyle = '#ffd54f'; g.font = 'bold 34px Arial'; g.fillText('🎲 DICE · $10 · 7/11 WINS', 256, 44);
      g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.fillText(st.msg || 'Grab the cup and throw', 256, 100);
      board.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- coin pusher
export function coinPusher(id: string, pos: [number, number], cost = 1): Component {
  let shelf: THREE.Mesh, chip: THREE.Mesh;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.7, x1: pos[0] + 0.7, z0: pos[1] - 0.9, z1: pos[1] + 0.7 }],
    init: () => ({ t: 0 }),
    act(h, st, from, key) {
      if (key === 'slap') {
        if (h.held(from)) { h.toast('Empty your hand to slap it.'); return; }
        h.sfx('slap');
        if (Math.random() < 0.3) {
          h.sfx('alarm');
          h.toast('🚨 TILT! TILT! The bouncer is already walking over…');
          bonk(h as unknown as ChaseHost, from, 4);
          return;
        }
        if (Math.random() < 0.5) { const w = 2 + Math.floor(Math.random() * 5); h.credit(from, w, 'Coin pusher (slapped)'); h.sfx('coin'); h.toast(`🪙 A little avalanche of coins! +$${w}`); }
        else h.toast('🪙 The pile wobbles. Nothing falls. The machine judges you.');
        return;
      }
      if (!h.needCard(from) || !h.charge(from, cost, 'Coin pusher')) return;
      st.t = 1.5; h.sfx('coin');
      const r = Math.random();
      if (r < 0.01) { h.credit(from, 40, 'Coin pusher HOT CHIP'); h.sfx('jackpot'); h.toast('🔥 THE HOT CHIP FELL! +$40'); judged(h, from, true); }
      else if (r < 0.07) { h.credit(from, 4, 'Coin pusher'); h.toast('🪙 Clink clink — +$4'); }
      else if (r < 0.37) { h.credit(from, 1, 'Coin pusher'); h.toast('🪙 One coin falls. You broke even. Thrilling.'); }
      else h.toast('🪙 The pile shifts. Almost. ALMOST.');
    },
    step(_h, st, dt) { st.t = Math.max(0, st.t - dt); },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.5), new THREE.MeshStandardMaterial({ color: '#0277bd', roughness: 0.4 })); body.position.set(0, 0.5, -0.1); body.castShadow = true; g.add(body);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.3), new THREE.MeshStandardMaterial({ color: '#e1f5fe', transparent: true, opacity: 0.25 })); glass.position.set(0, 1.35, -0.1); g.add(glass);
      const gold = new THREE.MeshStandardMaterial({ color: '#ffca28', metalness: 0.8, roughness: 0.3 });
      for (let i = 0; i < 40; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10), gold); c.position.set((Math.random() - 0.5) * 1.0, 1.02 + Math.random() * 0.04, -0.1 + (Math.random() - 0.3) * 0.9); c.rotation.set(Math.random() * 0.3, 0, Math.random() * 0.3); g.add(c); }
      chip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), new THREE.MeshStandardMaterial({ color: '#ff3d00', emissive: '#ff3d00', emissiveIntensity: 0.6 })); chip.position.set(0.1, 1.06, 0.25); g.add(chip);
      shelf = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.15, 0.5), MAT.steel); shelf.position.set(0, 1.08, -0.55); g.add(shelf);
      const sign = v.sign([['COIN PUSHER', 60, '#ffd54f'], ['HOT CHIP = $40', 36, '#ff5252']], '#01579b', 1.3, 0.4, 512, 160);
      sign.position.set(pos[0], 2.0, pos[1] + 0.62);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14).rotateX(Math.PI / 2), MAT.red); btn.position.set(0.4, 0.8, 0.66); g.add(btn);
      v.reg('push', btn, (_st, c) => (c.held === 'card' ? `Drop a coin ($${cost})` : `Coin pusher — need the card ($${cost})`));
      v.reg('slap', glass, (_st, c) => (c.held ? '' : 'SLAP the machine (might shake coins loose… might TILT)'));
    },
    update(_v, st) {
      shelf.position.z = -0.55 + Math.sin(performance.now() * 0.0015) * 0.15;
      chip.position.y = 1.06 + (st.t > 0 ? Math.sin(performance.now() * 0.05) * 0.01 : 0);
    },
  };
}

// ---------------------------------------------------------------- claw machine (one-button timing)
const PRIZES: [string, number][] = [['plush', 0.45], ['energy', 0.25], ['fakecard', 0.2], ['rocket', 0.1]];
export function clawMachine(id: string, pos: [number, number], cost = 3): Component {
  let claw: THREE.Group, fingers: THREE.Mesh[] = [];
  const clawX = (t: number) => Math.sin(t * 2.2) * 0.42;
  const TARGET = 0.15; // the good prize sits a bit off-center
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.7, x1: pos[0] + 0.7, z0: pos[1] - 0.8, z1: pos[1] + 0.8 }],
    init: () => ({ phase: 0, t: 0, who: -1, x: 0 }),
    act(h, st, from) {
      if (st.phase === 1 && from === st.who) { st.phase = 2; st.x = clawX(st.t); st.t = 0; h.sfx('claw'); return; }
      if (st.phase !== 0) { h.toast('🕹️ Someone is playing.'); return; }
      if (!h.needCard(from) || !h.charge(from, cost, 'Claw machine')) return;
      st.phase = 1; st.t = 0; st.who = from;
      h.toast('🕹️ The claw slides back and forth… click again to DROP it.');
    },
    step(h, st, dt) {
      if (st.phase === 0) return;
      st.t += dt;
      if (st.phase === 1 && st.t > 10) { st.phase = 2; st.x = clawX(st.t); st.t = 0; h.sfx('claw'); } // auto-drop
      if (st.phase !== 2 || st.t < 2.5) return;
      st.phase = 0;
      const aim = Math.max(0, 1 - Math.abs(st.x - TARGET) / 0.35);
      if (Math.random() > aim * 0.9) { h.toast('🕹️ The claw closes on… nothing. It waves at you on the way up.'); return; }
      if (Math.random() < 0.6) { h.toast('🕹️ IT GRABS ONE! …and drops it at the last second. Classic. (The grip is set to 40%.)'); return; }
      let r = Math.random(), k = 'plush';
      for (const [p, w] of PRIZES) { if ((r -= w) <= 0) { k = p; break; } }
      const [x, y, z] = h.world(pos[0] + 0.45, 0.6, pos[1] - 0.9);
      const it = h.items.spawn(k, false, x, y, z);
      h.sfx('jackpot');
      h.toast(`🕹️ WINNER! A ${k === 'plush' ? 'stuffed scorpion' : k === 'energy' ? 'energy drink' : k === 'fakecard' ? 'TOY debit card (it does not work, we checked)' : 'can of ROCKET FUEL?!'} drops into the chute.`);
      void it;
    },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); g.rotation.y = Math.PI; v.group.add(g);
      const frame = new THREE.MeshStandardMaterial({ color: '#ec407a', roughness: 0.5 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.3), frame); base.position.y = 0.45; base.castShadow = true; g.add(base);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.2, 1.25), new THREE.MeshStandardMaterial({ color: '#e1f5fe', transparent: true, opacity: 0.2 })); glass.position.y = 1.5; g.add(glass);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.25, 1.35), frame); roof.position.y = 2.22; g.add(roof);
      const fur = ['#d84315', '#7e57c2', '#26a69a', '#ffca28', '#ef5350'];
      for (let i = 0; i < 16; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardMaterial({ color: fur[i % fur.length], roughness: 1 })); p.position.set((Math.random() - 0.5) * 1.0, 0.98 + Math.random() * 0.15, (Math.random() - 0.5) * 1.0); g.add(p); }
      claw = new THREE.Group();
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 5), MAT.steel); cable.position.y = 0.3; claw.add(cable);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), MAT.steel); claw.add(hub);
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02).translate(0, -0.09, 0), MAT.steel); f.rotation.y = (i * Math.PI * 2) / 3; const arm = new THREE.Group(); arm.rotation.y = (i * Math.PI * 2) / 3; arm.add(f); claw.add(arm); fingers.push(f); }
      claw.position.set(0, 1.85, 0); g.add(claw);
      const sign = v.sign([['CLAW', 70, '#fff'], [`$${cost} · WIN A FRIEND`, 30, '#fff59d']], '#ad1457', 1.3, 0.45, 512, 170);
      sign.position.set(pos[0], 2.6, pos[1] - 0.69); sign.rotation.y = Math.PI;
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14), MAT.red); btn.position.set(0.3, 0.93, 0.55); g.add(btn);
      v.reg('play', btn, (st, c) => (st.phase === 1 ? 'DROP THE CLAW (now!)' : st.phase === 2 ? 'Grabbing…' : c.held === 'card' ? `Play the claw ($${cost}) — click again to drop` : `Claw machine — need the card ($${cost})`));
    },
    update(_v, st) {
      if (st.phase === 1) { claw.position.x = clawX(st.t); claw.position.y = 1.85; }
      else if (st.phase === 2) { claw.position.x = st.x; claw.position.y = 1.85 - Math.min(1, st.t / 1.0) * 0.65 + Math.max(0, st.t - 1.5) * 0.65; }
      else { claw.position.x += (0 - claw.position.x) * 0.05; claw.position.y = 1.85; }
      const close = st.phase === 2 && st.t > 1.0 ? 0.1 : 0.5;
      for (const f of fingers) f.rotation.x = close;
    },
  };
}

// ---------------------------------------------------------------- free drinks + Elvis
const ELVIS = ['"Thank you. Thank you very much."', '"Viva… the Cactus Strip."', '"Uh-huh-huh. Nice RV, baby."', '"Love me tender… love me with your debit card."', '"Elvis has NOT left the building. Elvis lives here now."'];
export function cocktailWaitress(id: string, pos: [number, number]): Component {
  return {
    id,
    colliders: () => [],
    init: () => ({ cd: {} as Record<number, number>, t: 0 }),
    act(h, st, from) {
      if ((st.cd[from] ?? -99) > st.t - 40) { h.toast('🍹 "Pace yourself, sugar. Come back in a bit."'); return; }
      if (h.s.items.filter((i) => i.h === from).length >= 3) { h.toast('🍹 "Your hands are full, sugar."'); return; }
      st.cd[from] = st.t;
      const [x, y, z] = h.world(pos[0], 1.2, pos[1]);
      const c = h.items.spawn('cocktail', false, x, y, z); c.h = from;
      h.toast('🍹 "Compliments of the house!" (The house wants you drunk. The house always wins.)');
    },
    step(_h, st, dt) { st.t += dt; },
    build(v) {
      const w = makeNpc('generic', { body: '#c2185b', pants: '#111', hair: '#ffd54f', apron: '#111', pose: 'notepad', skin: '#e8b98a' });
      w.position.set(pos[0], 0, pos[1]); w.rotation.y = Math.PI / 2; v.group.add(w);
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), MAT.steel); tray.position.set(pos[0] - 0.35, 1.3, pos[1] + 0.25); v.group.add(tray);
      v.reg('drink', w, () => '🍹 Grab a free cocktail (makes you drunk — maybe not the driver)');
      v.reg('drink2', tray, () => '🍹 Grab a free cocktail');
    },
  };
}

export function elvis(id: string, pos: [number, number]): Component {
  let singT = 6;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 1.5, x1: pos[0] + 1.5, z0: pos[1] - 1.5, z1: pos[1] + 1.5, top: 0.3 }],
    act(h) { h.toast(`🕺 ELVIS: ${ELVIS[Math.floor(Math.random() * ELVIS.length)]}`); h.sfx('jukebox'); },
    build(v) {
      v.box(new THREE.MeshStandardMaterial({ color: '#4a148c', roughness: 0.6 }), pos[0] - 1.5, pos[0] + 1.5, 0, 0.3, pos[1] - 1.5, pos[1] + 1.5, true);
      const e = makeNpc('generic', { body: '#fafafa', pants: '#fafafa', hair: '#111', shades: true, pose: 'sing', belly: 1.1 });
      e.position.set(pos[0] + 0.5, 0.3, pos[1]); e.rotation.y = Math.PI / 2; v.group.add(e);
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.6), new THREE.MeshStandardMaterial({ color: '#ffd54f', metalness: 0.6, roughness: 0.3 })); cape.position.set(pos[0] + 0.72, 1.6, pos[1]); v.group.add(cape);
      const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), MAT.steel); mic.position.set(pos[0] - 0.1, 1.05, pos[1]); v.group.add(mic);
      const spot = new THREE.SpotLight('#fff3e0', 25, 12, 0.5, 0.5); spot.position.set(pos[0] - 3, 4.6, pos[1]); spot.target.position.set(pos[0] + 0.5, 1, pos[1]); v.group.add(spot, spot.target);
      v.reg('sing', e, () => '🕺 Request a song from Elvis');
    },
    update(v, _st, _s, dt) {
      singT -= dt;
      if (singT <= 0) { singT = 14 + Math.random() * 8; v.play('jukebox', [pos[0], 1.6, pos[1]]); }
    },
  };
}

// ---------------------------------------------------------------- room dressing + regulars
export function casinoDecor(id: string): Component {
  const chandeliers: THREE.Object3D[] = [];
  return {
    id,
    colliders: () => [{ x0: 19, x1: 23, z0: 13, z1: 17.8, top: 2.6 }], // cashier cage
    build(v) {
      const g = v.group;
      // carpet: the most casino pattern possible
      const carpet = canvasTex(256, 256, (c) => {
        c.fillStyle = '#5d0f2e'; c.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 40; i++) { c.strokeStyle = ['#ffb300', '#00bcd4', '#e91e63', '#7cb342'][i % 4]; c.lineWidth = 3; c.beginPath(); c.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 20, 0, Math.PI * (0.5 + Math.random())); c.stroke(); }
      });
      carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(6, 8);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }));
      floor.position.set(31, 0.016, 0); floor.receiveShadow = true; g.add(floor);
      // chandeliers
      const crystal = new THREE.MeshStandardMaterial({ color: '#fffde7', emissive: '#ffe082', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
      for (const [x, z] of [[26, -6], [26, 6], [36, -8], [36, 8]]) {
        const ch = new THREE.Group();
        for (let i = 0; i < 10; i++) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), crystal); const a = (i / 10) * Math.PI * 2; cr.position.set(Math.cos(a) * 0.45, -0.2 - (i % 3) * 0.12, Math.sin(a) * 0.45); ch.add(cr); }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8 })); ch.add(ring);
        const l = new THREE.PointLight('#ffe0b2', 6, 13, 1.2); l.position.y = -0.4; ch.add(l);
        ch.position.set(x, 4.4, z); g.add(ch); chandeliers.push(ch);
      }
      // cashier cage
      v.box(MAT.wood, 19, 23, 0, 1.1, 13, 13.3, true);
      for (let x = 19.1; x < 23; x += 0.25) v.box(MAT.steel, x, x + 0.03, 1.1, 2.6, 13.1, 13.15);
      const teller = makeNpc('generic', { body: '#2e7d32', glasses: true, hair: '', tie: '#ffd54f', pose: 'read' });
      teller.position.set(21, 0, 15); teller.rotation.y = 0; g.add(teller);
      const cage = v.sign([['CASHIER', 60, '#ffd54f'], ['NO REFUNDS · NO TEARS', 28, '#fff']], '#1b5e20', 2.6, 0.6, 512, 140);
      cage.position.set(21, 2.9, 13.05); cage.rotation.y = Math.PI;
      // the gamblers who never leave
      const seat = (o: THREE.Object3D, x: number, z: number) => { o.position.set(x, -0.35, z); o.rotation.y = -Math.PI / 2; g.add(o); };
      for (const z of [11, -14]) { const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 12), MAT.red); stool.position.set(42.4, 0.25, z); g.add(stool); }
      seat(makeNpc('generic', { body: '#9e9e9e', hair: '#eeeeee', glasses: true, pose: 'slots', belly: 1.2 }), 42.4, 11);
      seat(makeNpc('generic', { body: '#795548', hat: 'cowboy', hatColor: '#212121', pose: 'slots', beard: '#3e2723' }), 42.4, -14);
      const day3 = v.sign([['DAY 3', 60, '#ff1744'], ['DO NOT DISTURB', 26, '#fff']], '#111', 0.7, 0.35, 256, 128);
      day3.position.set(42.0, 2.15, 11); day3.rotation.y = -Math.PI / 2;
      // house rules
      const rules = v.sign([['THERE ARE NO CLOCKS IN HERE', 40, '#ffd54f'], ['TIME IS AN ILLUSION · KEEP PLAYING', 28, '#fff'], ['(the wedding can wait)', 24, '#ff80ab']], '#1a0033', 5, 1.1, 1024, 230);
      rules.position.set(31, 3.6, -17.85);
    },
    update(_v, _st, _s, dt) { for (const c of chandeliers) c.rotation.y += dt * 0.15; },
  };
}
