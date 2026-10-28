// Gambling + job components: slot machine, roulette, blackjack, short-order grill job, jukebox.
import * as THREE from 'three';
import { MAT, canvasTex, signTexture, type Component } from './kit';

const SYMBOLS = ['7', '🍒', 'BAR', '🔔', '🍋', '★'];
let reelTex: THREE.Texture | null = null;
function reels() {
  return (reelTex ??= canvasTex(384, 96, (c) => {
    c.fillStyle = '#fffde7'; c.fillRect(0, 0, 384, 96);
    SYMBOLS.forEach((sym, i) => {
      c.save(); c.translate(i * 64 + 32, 48); c.rotate(-Math.PI / 2);
      c.fillStyle = i === 0 ? '#d32f2f' : '#222'; c.font = `bold ${sym.length > 2 ? 22 : 40}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(sym, 0, 0); c.restore();
    });
  }));
}

// ---------------------------------------------------------------- slot machine
export function slots(id: string, pos: [number, number], cost: number, triple: number, jackpot: number, label: string, color: string): Component {
  const angle = [0, 0, 0], stopped = [true, true, true];
  const meshes: THREE.Mesh[] = [];
  let player = -1;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.4, x1: pos[0] + 0.45, z0: pos[1] - 0.45, z1: pos[1] + 0.45 }],
    init: () => ({ res: [0, 0, 0], left: 0 }),
    act(h, st, from) {
      if (st.left > 0) return;
      if (!h.needCard(from) || !h.charge(from, cost, `${label} slot spin`)) return;
      st.res = [0, 1, 2].map(() => Math.floor(Math.random() * SYMBOLS.length)); st.left = 2.4; player = from; h.sfx('click');
    },
    step(h, st, dt) {
      if (st.left <= 0) return;
      st.left -= dt;
      if (st.left > 0) return;
      st.left = 0;
      const [a, b, c] = st.res;
      if (a === b && b === c) { const win = a === 0 ? jackpot : triple; h.credit(player, win, `${label} jackpot`); h.sfx('jackpot'); h.toast(`🎰 ${a === 0 ? '7 7 7 — ' : ''}JACKPOT! +$${win}`); }
      else if (a === b || b === c || a === c) { h.credit(player, cost, `${label} pair`); h.toast(`🎰 A pair — $${cost} back`); }
      else h.toast('🎰 Nothing. House wins.');
    },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.9), new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); cab.position.y = 0.95; cab.castShadow = true;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.35), new THREE.MeshBasicMaterial({ map: signTexture([[label, 70, '#ffd54f']], '#311b92', 512, 192) }));
      top.position.set(-0.43, 1.7, 0); top.rotation.y = -Math.PI / 2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.66), MAT.dark); win.position.set(-0.43, 1.2, 0);
      g.add(cab, top, win);
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: reels() }));
        r.position.set(-0.32, 1.2, -0.21 + i * 0.21); g.add(r); meshes.push(r);
      }
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), MAT.steel); lever.position.set(-0.1, 1.35, 0.5);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), MAT.red); knob.position.set(-0.1, 1.62, 0.5);
      g.add(lever, knob); v.group.add(g);
      v.reg('spin', g, (st, c) => (st.left > 0 ? 'Spinning…' : c.held === 'card' ? `Pull ($${cost}) — pair = money back, triple $${triple}, 777 = $${jackpot}` : `${label} — need the card ($${cost})`));
    },
    update(v, st, _s, dt) {
      for (let i = 0; i < 3; i++) {
        if (st.left > 1.6 - i * 0.6) { angle[i] += dt * 18; stopped[i] = false; }
        else {
          angle[i] = (3 * Math.PI) / 2 - (2 * Math.PI * (st.res[i] + 0.5)) / SYMBOLS.length;
          if (!stopped[i]) { stopped[i] = true; v.play('clank'); }
        }
        meshes[i].rotation.z = angle[i];
      }
    },
  };
}

// ---------------------------------------------------------------- roulette
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n: number) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
export function roulette(id: string, pos: [number, number], bet: number): Component {
  let wheel: THREE.Mesh, ball: THREE.Mesh, resultTex: THREE.CanvasTexture, resultCtx: CanvasRenderingContext2D, lastShown = -2;
  let spinAngle = 0;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 1.2, x1: pos[0] + 1.2, z0: pos[1] - 1.8, z1: pos[1] + 1.8, top: 0.95 }],
    init: () => ({ phase: 0, t: 0, result: -1, bets: [] as [number, string][] }),
    act(h, st, from, key) {
      if (st.phase === 2) { h.toast('No more bets — the wheel is spinning'); return; }
      if (st.bets.some((b: [number, string]) => b[0] === from)) { h.toast('One bet per spin'); return; }
      if (!h.needCard(from) || !h.charge(from, bet, `Roulette: $${bet} on ${key}`)) return;
      st.bets.push([from, key]);
      if (st.phase === 0) { st.phase = 1; st.t = 6; }
      h.toast(`🎡 ${h.name(from)} bets $${bet} on ${key.toUpperCase()}. Spinning in ${Math.ceil(st.t)}s`);
    },
    step(h, st, dt) {
      if (st.phase === 1) { st.t -= dt; if (st.t <= 0) { st.phase = 2; st.t = 4.5; st.result = Math.floor(Math.random() * 37); h.sfx('click'); } }
      else if (st.phase === 2) {
        st.t -= dt;
        if (st.t <= 0) {
          const col = colorOf(st.result);
          h.toast(`🎡 ${st.result} ${col.toUpperCase()}!`);
          for (const [p, k] of st.bets as [number, string][]) {
            if (k !== col) continue;
            const win = col === 'green' ? bet * 14 : bet * 2;
            h.credit(p, win, `Roulette win (${col})`); h.toast(`💰 ${h.name(p)} wins $${win}!`); h.sfx('jackpot');
          }
          st.phase = 0; st.bets = [];
        }
      }
    },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      const tableM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 3.6), MAT.wood); tableM.position.y = 0.45; tableM.castShadow = true; g.add(tableM);
      const felt = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4).rotateX(-Math.PI / 2), MAT.felt); felt.position.y = 0.91; g.add(felt);
      const wheelTex = canvasTex(512, 512, (c) => {
        const n = 37;
        for (let i = 0; i < n; i++) {
          c.beginPath(); c.moveTo(256, 256); c.arc(256, 256, 250, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
          c.fillStyle = i === 0 ? '#2e7d32' : i % 2 ? '#c62828' : '#111'; c.fill();
        }
        c.fillStyle = '#6d4c41'; c.beginPath(); c.arc(256, 256, 120, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#d4a017'; c.beginPath(); c.arc(256, 256, 30, 0, Math.PI * 2); c.fill();
      });
      wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 40), [MAT.wood, new THREE.MeshStandardMaterial({ map: wheelTex }), MAT.wood]);
      wheel.position.set(0, 0.96, -1.0); g.add(wheel);
      ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), MAT.white); ball.position.set(0.55, 1.03, -1.0); g.add(ball);
      const c = document.createElement('canvas'); c.width = 256; c.height = 96;
      resultCtx = c.getContext('2d')!; resultTex = new THREE.CanvasTexture(c); resultTex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.38), new THREE.MeshBasicMaterial({ map: resultTex }));
      board.position.set(-1.21, 1.6, -1.0); board.rotation.y = -Math.PI / 2; g.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), MAT.steel); post.position.set(-1.2, 1.2, -1.0); g.add(post);
      // bet buttons
      ([['red', '#c62828', 0.2], ['black', '#111111', 0.8], ['green', '#2e7d32', 1.4]] as [string, string, number][]).forEach(([k, col, z]) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 }));
        b.position.set(-0.6, 0.95, z); g.add(b);
        v.reg(k, b, (st, ctx) => (st.phase === 2 ? 'Wheel is spinning…' : ctx.held === 'card' ? `Bet $${bet} on ${k.toUpperCase()} (pays ${k === 'green' ? '14×' : '2×'})` : `Roulette ${k} — need the card ($${bet})`));
      });
      const sign = v.sign([['ROULETTE', 80, '#ffd54f'], [`$${bet} · RED / BLACK 2× · GREEN 14×`, 30, '#fff']], '#4a0f0f', 2.4, 0.9, 512, 192);
      sign.position.set(pos[0] + 1.3, 2.4, pos[1]); sign.rotation.y = -Math.PI / 2;
    },
    update(_v, st, _s, dt) {
      if (st.phase === 2) spinAngle += dt * (2 + st.t * 3); else if (st.result >= 0) spinAngle = -(st.result / 37) * Math.PI * 2;
      wheel.rotation.y = spinAngle;
      const ba = st.phase === 2 ? -spinAngle * 1.7 : spinAngle + Math.PI / 37;
      ball.position.set(Math.cos(ba) * 0.55, 1.03, -1.0 + Math.sin(ba) * 0.55);
      const show = st.phase === 2 ? -1 : st.result;
      if (show !== lastShown) {
        lastShown = show; const g = resultCtx;
        g.fillStyle = '#111'; g.fillRect(0, 0, 256, 96); g.textAlign = 'center'; g.font = 'bold 56px Arial';
        g.fillStyle = show < 0 ? '#ffd54f' : colorOf(show) === 'red' ? '#ff5252' : colorOf(show) === 'green' ? '#69f0ae' : '#fff';
        g.fillText(show < 0 ? '???' : String(show), 128, 68); resultTex.needsUpdate = true;
      }
    },
  };
}

// ---------------------------------------------------------------- blackjack
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const handValue = (h: number[]) => {
  let v = 0, aces = 0;
  for (const c of h) { const r = c % 13; if (r === 0) { aces++; v += 11; } else v += Math.min(10, r + 1); }
  while (v > 21 && aces--) v -= 10;
  return v;
};
const draw = () => Math.floor(Math.random() * 52);
export function blackjack(id: string, pos: [number, number], bet: number): Component {
  let tex: THREE.CanvasTexture, ctx: CanvasRenderingContext2D, last = '';
  const finish = (h: Parameters<NonNullable<Component['act']>>[0], st: any) => {
    while (handValue(st.d) < 17) st.d.push(draw());
    const p = handValue(st.p), d = handValue(st.d);
    let pay = 0;
    if (p > 21) st.msg = 'BUST — dealer wins';
    else if (d > 21 || p > d) { pay = p === 21 && st.p.length === 2 ? Math.round(bet * 2.5) : bet * 2; st.msg = `YOU WIN $${pay}`; }
    else if (p === d) { pay = bet; st.msg = 'PUSH — bet returned'; }
    else st.msg = 'Dealer wins';
    if (pay) { h.credit(st.who, pay, 'Blackjack'); h.sfx(pay > bet ? 'jackpot' : 'cash'); }
    h.toast(`🃏 ${st.msg} (you ${p} vs dealer ${d})`);
    st.phase = 2; st.t = 5;
  };
  return {
    id,
    colliders: () => [{ x0: pos[0] - 1, x1: pos[0] + 1, z0: pos[1] - 1.4, z1: pos[1] + 1.4, top: 0.95 }],
    init: () => ({ phase: 0, p: [] as number[], d: [] as number[], who: -1, msg: '', t: 0 }),
    act(h, st, from, key) {
      if (key === 'deal') {
        if (st.phase === 1) { h.toast(`${h.name(st.who)} is playing this hand`); return; }
        if (!h.needCard(from) || !h.charge(from, bet, 'Blackjack hand')) return;
        st.phase = 1; st.who = from; st.p = [draw(), draw()]; st.d = [draw(), draw()]; st.msg = 'Hit or stand?';
        h.sfx('click');
        if (handValue(st.p) === 21) finish(h, st);
      } else if (st.phase === 1 && from === st.who) {
        if (key === 'hit') { st.p.push(draw()); h.sfx('click'); if (handValue(st.p) > 21) finish(h, st); }
        else if (key === 'stand') finish(h, st);
      }
    },
    step(_h, st, dt) { if (st.phase === 2) { st.t -= dt; if (st.t <= 0) { st.phase = 0; st.msg = ''; } } },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]); v.group.add(g);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.9, 32, 1, false, Math.PI, Math.PI), MAT.wood); t.position.y = 0.45; t.castShadow = true; g.add(t);
      const felt = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32, Math.PI, Math.PI).rotateX(-Math.PI / 2), MAT.felt); felt.position.y = 0.91; g.add(felt);
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; ctx = c.getContext('2d')!;
      tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex }));
      board.position.set(0.9, 1.7, 0); board.rotation.y = -Math.PI / 2; g.add(board);
      const dealer = new THREE.Group();
      const db = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: '#212121' })); db.position.y = 0.74;
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), MAT.red); bow.position.set(0, 1.3, -0.3);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshStandardMaterial({ color: '#c68642' })); head.position.y = 1.6;
      dealer.add(db, bow, head); dealer.position.set(0.6, 0, 0); dealer.rotation.y = Math.PI / 2; g.add(dealer);
      ([['deal', '#ffd54f', -0.6], ['hit', '#66bb6a', 0], ['stand', '#ef5350', 0.6]] as [string, string, number][]).forEach(([k, col, z]) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 }));
        b.position.set(-0.9, 0.95, z); g.add(b);
        v.reg(k, b, (st, cx) => (k === 'deal' ? (st.phase === 1 ? 'Hand in progress' : cx.held === 'card' ? `Deal a hand ($${bet})` : `Blackjack — need the card ($${bet})`) : st.phase === 1 ? k.toUpperCase() : ''));
      });
    },
    update(_v, st) {
      const key = JSON.stringify([st.p, st.d, st.msg, st.phase]);
      if (key === last) return;
      last = key; const g = ctx;
      g.fillStyle = '#0b3d1e'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#ffd54f'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText(`BLACKJACK · $${bet}`, 256, 36);
      const show = (hand: number[], hideSecond: boolean) => hand.map((c, i) => (hideSecond && i === 1 ? '🂠' : RANKS[c % 13])).join(' ');
      g.fillStyle = '#fff'; g.font = 'bold 28px Arial'; g.textAlign = 'left';
      if (st.p.length) {
        g.fillText(`DEALER: ${show(st.d, st.phase === 1)}${st.phase === 1 ? '' : `  (${handValue(st.d)})`}`, 24, 100);
        g.fillText(`YOU: ${show(st.p, false)}  (${handValue(st.p)})`, 24, 150);
      } else g.fillText('Press DEAL with the card', 24, 125);
      g.fillStyle = '#ffeb3b'; g.textAlign = 'center'; g.fillText(st.msg, 256, 220);
      tex.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- short-order grill job
export function grillJob(id: string, grill: { x0: number; x1: number; z0: number; z1: number; top: number }, window_: [number, number, number], fridge: [number, number], pay: number, orders: number): Component {
  const slotNames = [0, 1, 2].map((i) => `${id}g${i}`);
  return {
    id,
    colliders: () => [{ ...grill }, { x0: fridge[0] - 0.4, x1: fridge[0] + 0.4, z0: fridge[1] - 0.4, z1: fridge[1] + 0.4 }],
    init: () => ({ done: 0, tickets: orders }),
    act(h, st, from, key) {
      const held = h.held(from);
      if (key === 'fridge') {
        if (st.tickets <= 0) { h.toast('FLO: "Shift\'s over, sugar. Thanks!"'); return; }
        if (held) return;
        const [x, y, z] = h.world(fridge[0] - 0.6, 1.1, fridge[1]);
        const p = h.items.spawn('patty', false, x, y, z); p.h = from; h.sfx('grab');
        return;
      }
      if (key.startsWith('g')) {
        const i = Number(key.slice(1)); const slot = `stop:${h.stopId}:${slotNames[i]}`;
        const inSlot = h.s.items.find((it) => it.s === slot);
        if (held?.k === 'patty' && !inSlot) { h.slot(slotNames[i], grill.x0 + 0.3, grill.top + 0.03, grill.z0 + 0.4 + i * 0.6); held.h = -1; held.s = slot; h.sfx('sizzle'); }
        else if (!held && inSlot) { inSlot.s = ''; inSlot.h = from; }
        return;
      }
      if (key === 'window') {
        if (held?.k !== 'patty') { h.toast(`FLO: "Order up? Bring me a cooked patty. ${st.tickets} tickets left, $${pay} each."`); return; }
        h.items.remove(held.id);
        if (held.d < 1) { h.toast('FLO: "It\'s still MOOING, hon. Customer sent it back."'); return; }
        if (held.d > 1.35) { h.toast('FLO: "That\'s a hockey puck. No tip for you."'); return; }
        st.tickets--; st.done++;
        h.credit(from, pay, 'Diner shift: burger served');
        h.toast(`🍔 Order up! +$${pay} (${st.tickets} tickets left)`);
      }
    },
    step(h, _st, dt) {
      for (const it of h.s.items) {
        if (!it.s.startsWith(`stop:${h.stopId}:${id}g`)) continue;
        it.d += dt / 18;
      }
    },
    build(v) {
      v.box(MAT.dark, grill.x0, grill.x1, 0, grill.top, grill.z0, grill.z1, true);
      const plate = v.box(MAT.steel, grill.x0 + 0.05, grill.x1 - 0.05, grill.top, grill.top + 0.03, grill.z0 + 0.05, grill.z1 - 0.05);
      void plate;
      [0, 1, 2].forEach((i) => {
        const spot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5d4037', emissive: '#ff5722', emissiveIntensity: 0.25 }));
        spot.position.set(grill.x0 + 0.3, grill.top + 0.035, grill.z0 + 0.4 + i * 0.6); v.group.add(spot);
        v.reg(`g${i}`, spot, (_st, c) => (c.held === 'patty' ? 'Put the patty on the grill' : c.held ? '' : 'Grill (takes ~18 s to cook)'));
      });
      const fr = v.box(MAT.white, fridge[0] - 0.4, fridge[0] + 0.4, 0, 1.9, fridge[1] - 0.4, fridge[1] + 0.4, true);
      v.reg('fridge', fr, (st, c) => (st.tickets <= 0 ? 'Shift is over' : c.held ? '' : 'Grab a raw patty (diner job)'));
      const win = new THREE.Group();
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 1.2), MAT.steel); win.add(shelf);
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8 })); bell.position.set(0, 0.03, 0.3); win.add(bell);
      win.position.set(...window_); v.group.add(win);
      v.reg('window', win, (st, c) => (c.held === 'patty' ? `Serve it (+$${pay} if cooked right)` : `Order window — ${st.tickets} tickets left ($${pay} per cooked patty)`));
    },
  };
}

// ---------------------------------------------------------------- jukebox
export function jukebox(id: string, pos: [number, number], cost: number): Component {
  let glow: THREE.MeshStandardMaterial;
  return {
    id,
    colliders: () => [{ x0: pos[0] - 0.4, x1: pos[0] + 0.4, z0: pos[1] - 0.5, z1: pos[1] + 0.5 }],
    init: () => ({ t: 0 }),
    act(h, st, from) {
      if (!h.needCard(from) || !h.charge(from, cost, 'Jukebox')) return;
      st.t = 12; h.sfx('jukebox'); h.toast('🎵 The jukebox plays a crackly honky-tonk number');
    },
    step(_h, st, dt) { st.t = Math.max(0, st.t - dt); },
    build(v) {
      const g = new THREE.Group(); g.position.set(pos[0], 0, pos[1]);
      glow = new THREE.MeshStandardMaterial({ color: '#ff9800', emissive: '#ff6d00', emissiveIntensity: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.95), new THREE.MeshStandardMaterial({ color: '#6d4c41' })); body.position.y = 0.75; body.castShadow = true;
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.7, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), glow);
      arch.position.y = 1.5; arch.rotation.y = Math.PI / 2;
      g.add(body, arch); v.group.add(g);
      v.reg('play', g, (_st, c) => (c.held === 'card' ? `Play a song ($${cost})` : `Jukebox — $${cost} a song`));
    },
    update(_v, st) { glow.emissiveIntensity = st.t > 0 ? 1.2 + Math.sin(performance.now() * 0.01) * 0.6 : 0.6; },
  };
}
