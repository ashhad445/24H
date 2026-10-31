// Authoritative simulation. Runs only on the host; clients send intents.
import { CFG, HP, NOS, RADIO_STATIONS, RV, SURV } from '../config';
import { ItemSim } from '../items/ItemPhysics';
import { KINDS, START_ITEMS, itemName } from '../items/Items';
import { newRVState, shift, stepRV, type RVAux } from '../rv/Drivetrain';
import type { Box2 } from '../rv/RV';
import { obbHitsBox, toSetLocal } from '../stops/geom';
import { bonk, inRV, rvLocal } from '../stops/chase';
import { PRICES, RUSTY_SET } from '../stops/rusty';
import { RustySim, newRustyState, type StopHost } from '../stops/RustySim';
import { NPC_DIMS, TrafficSim } from '../traffic/TrafficSim';
import { StopsHost } from '../stops/Stops';
import { CanyonSim } from '../world/Canyon';
import { EncounterSim, newEncState } from '../road/Encounters';
import { CHARM2_QUOTES, CHARM_QUOTES } from '../rv/charmQuotes';
import { GROOM, Groom } from './Groom';
import { LANE_OFFSET, PILE_ROCKS, ROAD_HALF, roadPoint, baseX, chunkRocks, clearHazardsBeyond, groundY, hazardsNear, onRoad, railAt, roadDX, roadFrame, roadHalf, roadS, roadX, roadYaw } from '../world/World';
import { FORKS, branchAt, chapelZ, chosen, forkZ, routeOffset, setRouteChoices } from '../world/Route';
import { shapeSeed } from '../world/RoadShape';
import type { CrewState, DriveInput, GameMsg, ItemState, SharedState } from '../types';

const totalMilesWith = (route: number[]) => CFG.ROUTE_MILES + FORKS.reduce((a, f) => a + f.branches[Math.max(0, route[f.id])].delta, 0);

const WHEELS: [number, number][] = [[-RV.wheelX, RV.wheelFrontZ], [RV.wheelX, RV.wheelFrontZ], [-RV.wheelX, RV.wheelRearZ], [RV.wheelX, RV.wheelRearZ]];
const RV_FRIDGE_MAX = 8;
const FOOD_KINDS = new Set(Object.entries(KINDS).filter(([, k]) => k.food).map(([n]) => n));

export interface LedgerEntry { who: number; what: string; amount: number }

export class HostSim implements StopHost {
  readonly s: SharedState;
  readonly items: ItemSim;
  readonly rusty: RustySim;
  readonly traffic: TrafficSim;
  readonly canyon: CanyonSim;
  readonly stops: StopsHost;
  readonly enc: EncounterSim;
  private groom = new Groom((text) => this.emit({ t: 'ev', k: 'text', from: GROOM, text }));
  /** Every card transaction, for the end-of-run receipt. */
  readonly ledger: LedgerEntry[] = [];
  /** World position of a player's hand (set by main from poses). */
  handOf: (id: number) => [number, number, number] | null = () => null;
  private aux: RVAux = { crankT: 0, lugT: 0, hornT: 0 };
  private drive: DriveInput = { th: 0, br: 0, st: 0, horn: false };
  private driveT = 0;
  private t = 0;
  private hitHazards = new Map<number, number>(); // hazard id → time last hit
  private hornWas = false;
  private hornCd = 0;
  private hammerCd = new Map<number, number>();
  private warned = new Set<string>();
  private lowHp = new Set<number>();
  /** Seconds of blowout immunity after a flat (so tires don't pop back-to-back). */
  private tireGrace = 60;
  private fuseGrace = 60;
  /** Rocks left in each roadside pile (chunk index → count). */
  private pileLeft = new Map<number, number>();

  constructor(private emit: (msg: GameMsg) => void, colliders: (doorOpen: boolean) => Box2[] = () => []) {
    const yaw = roadYaw(0);
    const x = roadX(0) + LANE_OFFSET * Math.cos(yaw);
    this.s = {
      rv: newRVState(x, -LANE_OFFSET * Math.sin(yaw), yaw),
      cab: { stoveOn: false, fire: 0, smoke: 0, fuseOut: false, flat: -1, nuts: 0, brew: 0, fridge: [['soda', 0], ['water', 0], ['water', 0]], fridgeT: 0 },
      rusty: newRustyState(),
      stops: {},
      seed: shapeSeed(),
      route: FORKS.map(() => -1),
      weather: { storm: 0, wind: 0 },
      npcs: [],
      cop: { phase: 0, t: 0, fled: false },
      shark: { on: false, t: 0 },
      mafia: { on: false, thugs: [] },
      boulders: [],
      bandits: { phase: 0, t: 0, near: 0, fed: false, couch: null },
      enc: newEncState(),
      items: [],
      crew: {},
      money: CFG.START_MONEY,
      clock: 0,
      seats: { driver: -1, nav: -1 },
      heat: 0,
      wanted: -1,
      phase: 'drive',
      ending: '',
    };
    this.items = new ItemSim(this.s, colliders);
    for (const [k, x, y, z] of START_ITEMS) {
      if (k === 'extinguisher') this.items.spawn(k, true, 0, 0, 0, 'wall');
      else if (k === 'jerrycan') this.items.spawn(k, true, x, y, z).d = 5; // two full 5-gal cans
      else this.items.spawn(k, true, x, y, z);
    }
    this.items.spawn('spare', true, 0, 0, 0, 'rack');
    this.items.spawn('weed', true, 0.6, 1.0, 1.4); // the whole point of the trip
    this.items.spawn('card', true, 0, 0, 0, 'tray');
    this.prevPose = { x: this.s.rv.x, z: this.s.rv.z, yaw: this.s.rv.yaw };
    this.rusty = new RustySim(this);
    this.traffic = new TrafficSim(this);
    this.canyon = new CanyonSim(this);
    this.stops = new StopsHost(this, this.items.statics);
    this.enc = new EncounterSim(this);
  }

  /** Is the RV within r meters of a stop (Rusty's or an active kit stop)? */
  nearStop(r: number) {
    const rv = this.s.rv;
    return [RUSTY_SET, ...this.stops.sets()].some((set) => Math.hypot(rv.x - set.x, rv.z - set.z) < r);
  }

  /** World position of an item, following its holder when carried. */
  itemWorld(it: ItemState): [number, number, number] | null {
    if (it.h !== -1) return this.handOf(it.h);
    if (!it.rv) return [it.x, it.y, it.z];
    const r = this.s.rv; const c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    return [r.x + it.x * c + it.z * sn, it.y, r.z - it.x * sn + it.z * c];
  }

  /** Spend from the shared card. Returns false (declined) past the overdraft limit. */
  charge(from: number, amount: number, what: string): boolean {
    const s = this.s;
    if (s.money - amount < PRICES.overdraftLimit) { this.toast('💳 CARD DECLINED'); this.sfx('error'); return false; }
    const before = s.money;
    s.money -= amount;
    const last = this.ledger[this.ledger.length - 1];
    if (last && last.who === from && last.what === what) last.amount -= amount;
    else this.ledger.push({ who: from, what, amount: -amount });
    if (what !== 'Gas') this.sfx('cash');
    if (before >= CFG.WEDDING_MIN_BALANCE && s.money < CFG.WEDDING_MIN_BALANCE) this.toast(`⚠️ Card is under $${CFG.WEDDING_MIN_BALANCE} — not enough for the wedding gift!`);
    if (before >= 0 && s.money < 0) this.toast('🦈 OVERDRAWN. The Loan Shark has your number…');
    return true;
  }

  credit(from: number, amount: number, what: string) {
    this.s.money += amount;
    this.ledger.push({ who: from, what, amount });
    this.sfx('cash');
  }

  /** A $0 line on the receipt (bribes and other crimes against dignity). */
  log(from: number, what: string) { this.ledger.push({ who: from, what, amount: 0 }); }

  fade(to: number, dur: number, ko = false) { this.emit(ko ? { t: 'ev', k: 'fade', to, dur, ko } : { t: 'ev', k: 'fade', to, dur }); }
  toast(text: string) { this.emit({ t: 'ev', k: 'toast', text }); }
  sfx(name: string, at?: [number, number, number]) { this.emit(at ? { t: 'ev', k: 'sfx', name, at } : { t: 'ev', k: 'sfx', name }); }
  private once(key: string, text: string) { if (!this.warned.has(key)) { this.warned.add(key); this.toast(text); } }
  name(id: number) { return this.names(id); }
  names: (id: number) => string = (id) => `Bean ${id}`;

  crew(id: number): CrewState {
    return (this.s.crew[id] ??= { hunger: 100, hypno: 0, caf: 0, spray: 0, slot: 0, hp: 100, drunk: 0 });
  }

  held(id: number) { this.fixSlots(); const sl = this.s.crew[id]?.slot ?? 0; return this.s.items.find((i) => i.h === id && i.sl === sl); }

  /** Keep every carried item in a unique pocket (0–2); released items clear theirs. */
  private fixSlots() {
    const used = new Map<number, Set<number>>();
    for (const it of this.s.items) {
      if (it.h < 0) { it.sl = -1; continue; }
      const u = used.get(it.h) ?? new Set<number>(); used.set(it.h, u);
      if (it.sl < 0 || it.sl > 2 || u.has(it.sl)) {
        const pref = this.s.crew[it.h]?.slot ?? 0;
        it.sl = !u.has(pref) ? pref : [0, 1, 2].find((n) => !u.has(n)) ?? pref;
      }
      u.add(it.sl);
    }
  }

  handle(from: number, m: GameMsg) {
    this.crew(from);
    if (m.t === 'shoot') { this.shoot(from, m.o, m.d); return; }
    if (m.t === 'act' && m.id.startsWith('slot:')) { const c = this.crew(from); c.slot = (c.slot + Number(m.id.slice(5)) + 3) % 3; return; }
    if (m.t === 'drive') {
      if (from === this.s.seats.driver) { this.drive = m.i; this.driveT = 0; }
    } else if (m.t === 'act') this.act(from, m.id, m.btn);
    else if (m.t === 'drop') {
      const it = this.held(from);
      if (!it) return;
      it.h = -1; it.rv = m.inRV; [it.x, it.y, it.z] = m.p;
      this.items.setVel(it.id, [...m.v]);
    }
  }

  peerLeft(id: number) {
    if (this.s.seats.driver === id) this.s.seats.driver = -1;
    if (this.s.seats.nav === id) this.s.seats.nav = -1;
  }

  /** Drop everything a departing player holds and remove their stats. */
  peerGone(id: number) {
    this.peerLeft(id);
    for (const it of this.s.items) if (it.h === id) { it.h = -1; it.rv = true; it.x = 0; it.y = 1.2; it.z = 0; }
    delete this.s.crew[id];
  }

  private act(from: number, id: string, btn: number) {
    const s = this.s, rv = s.rv, cab = s.cab;
    const isDriver = from === s.seats.driver;
    const held = this.held(from);

    if (id.startsWith('item:')) return this.itemAct(from, held, Number(id.slice(5)));
    if (id.startsWith('rocks:')) return this.rockPile(from, held, Number(id.slice(6)));
    if (this.rusty.act(from, id)) return;
    if (id === 'roscoe') return this.traffic.payTicket(from);
    if (id === 'bandit') return this.traffic.feedBandits(from);
    if (this.stops.act(from, id)) return;
    if (id.startsWith('enc:')) return this.enc.act(from, id);
    if (id.startsWith('player:')) return this.playerAct(from, held, Number(id.slice(7)));

    switch (id) {
      case 'seat_driver':
      case 'seat_nav': {
        const key = id === 'seat_driver' ? 'driver' : 'nav';
        if (s.seats[key] === -1) { this.peerLeft(from); s.seats[key] = from; }
        else if (s.seats[key] !== from) this.toast('Seat taken!');
        break;
      }
      case 'stand':
        if (isDriver) this.drive = { th: 0, br: 0, st: 0, horn: false };
        this.peerLeft(from);
        break;
      case 'ignition':
        if (rv.ignition === 2) { rv.ignition = 0; this.sfx('click'); }
        else if (rv.ignition === 0) { rv.ignition = 1; this.aux.crankT = 0; this.sfx('crank'); }
        break;
      case 'handbrake': rv.handbrake = !rv.handbrake; this.sfx('ratchet'); break;
      case 'shifter': this.doShift(btn === 2 ? -1 : 1); break;
      case 'shift_up': if (isDriver) this.doShift(1); break;
      case 'shift_down': if (isDriver) this.doShift(-1); break;
      case 'headlights': rv.headlights = !rv.headlights; this.sfx('click'); break;
      case 'wipers': rv.wipers = !rv.wipers; this.sfx('click'); break;
      case 'dome': rv.dome = !rv.dome; this.sfx('click'); break;
      case 'radio': rv.radio = !rv.radio; this.sfx('click'); break;
      case 'charm': { rv.charm = (rv.charm + 1 + Math.floor(Math.random() * (CHARM_QUOTES.length - 1))) % CHARM_QUOTES.length; this.sfx('clank'); this.toast(`💀 "${CHARM_QUOTES[rv.charm]}"`); break; }
      case 'charm2': { rv.charm2 = (rv.charm2 + 1 + Math.floor(Math.random() * (CHARM2_QUOTES.length - 1))) % CHARM2_QUOTES.length; this.sfx('clank'); this.toast(`⚰️ "${CHARM2_QUOTES[rv.charm2]}"`); break; }
      case 'nos':
        if (!isDriver) break;
        if (rv.ignition !== 2) { this.toast('Start the engine first'); break; }
        if (rv.nosT > 0) break;
        if (rv.nos <= 0) { this.toast('💨 The nitrous tank is empty — gas stations sell rocket fuel (pricey)'); this.sfx('error'); break; }
        rv.nos--; rv.nosT = NOS.BURN; this.sfx('nos');
        this.toast(`🚀 NITROUS! ${rv.nos} ${rv.nos === 1 ? 'shot' : 'shots'} left`);
        break;
      case 'nos_tank':
        if (held?.k === 'rocket') {
          if (rv.nos >= NOS.CHARGES) { this.toast('The nitrous tank is already full'); break; }
          rv.nos = NOS.CHARGES; this.items.remove(held.id); this.sfx('pour');
          this.toast('🚀 Rocket fuel in — nitrous tank full (3 shots)');
        }
        break;
      case 'rockbin':
        if (held?.k === 'rock') {
          if (rv.rocks >= 12) { this.toast('The rock bin is full'); break; }
          rv.rocks++; this.items.remove(held.id); this.sfx('clank');
        } else if (!held && rv.rocks > 0) {
          rv.rocks--; const r = this.items.spawn('rock', true, 0, 1.2, RV.zRear - 0.6); r.h = from; this.sfx('grab');
        }
        break;
      case 'rearwin': rv.rearWin = !rv.rearWin; this.sfx('click'); break;
      case 'radio_tune': rv.station = (rv.station + 1) % RADIO_STATIONS.length; rv.radio = true; this.sfx('click'); break;
      case 'door': rv.doorOpen = !rv.doorOpen; this.sfx('door'); break;
      case 'horn': this.aux.hornT = 0.45; this.honked(); break;

      // ---------- galley ----------
      case 'stove': cab.stoveOn = !cab.stoveOn; this.sfx('click'); break;
      case 'skillet': {
        const inPan = s.items.find((i) => i.s === 'skillet');
        if (held?.k === 'patty' && !inPan) { held.h = -1; held.s = 'skillet'; this.sfx('sizzle'); }
        else if (held?.k === 'patty') this.toast('Skillet is full');
        else if (!held && inPan) { inPan.s = ''; inPan.h = from; }
        break;
      }
      case 'fridge': {
        cab.fridgeT = 4; this.sfx('door');
        if (held && (FOOD_KINDS.has(held.k) || held.k === 'patty')) {
          if (cab.fridge.length >= RV_FRIDGE_MAX) { this.toast('Fridge is full'); break; }
          if (held.p > 0) this.eatUnpaid(from, held); // stashing stock you haven't paid for counts as taking it
          cab.fridge.push([held.k, held.d]); this.items.remove(held.id);
        } else if (held) this.toast('Only food and drinks go in the fridge');
        else if (cab.fridge.length) {
          if (s.items.filter((i) => i.h === from).length >= 3) { this.toast('Pockets full (3 slots)'); break; }
          const [k, d] = cab.fridge.pop()!;
          const it = this.items.spawn(k, true, -0.9, 1.2, 2.9, '', d); it.h = from; this.sfx('grab');
        } else this.toast('Fridge is empty. Stock it with food and drinks from the stores.');
        break;
      }
      case 'coffeemaker':
        if (cab.brew <= 0) { cab.brew = SURV.BREW_TIME; this.sfx('click'); this.toast('☕ Coffee brewing…'); }
        break;
      case 'self':
        if (held && FOOD_KINDS.has(held.k)) this.feed(from, from, held);
        else if (held?.k === 'patty') this.eatPatty(from, held);
        else if (held?.k === 'scratch') this.scratch(from, held);
        else if (held?.k === 'suitcase') this.enc.open(from, held);
        break;
      case 'fuelport':
        if (held?.k === 'nozzle') { if (!this.stops.pumpInto(from, held)) this.rusty.pumpInto(from, held); }
        else if (held?.k === 'jerrycan') {
          if (held.d <= 0) { this.toast('Jerrycan is empty'); break; }
          const gal = Math.min(held.d, CFG.FUEL_CAPACITY - rv.fuel);
          rv.fuel += gal; held.d -= gal; this.sfx('pour');
          this.toast(`⛽ Poured ${gal.toFixed(1)} gal into the tank`);
        }
        break;
      case 'spray':
        if (held?.k !== 'extinguisher' || held.d <= 0) break;
        held.d -= 1;
        this.crew(from).spray = 0.35;
        if (btn === 1 && cab.fire > 0) {
          cab.fire = Math.max(0, cab.fire - 0.06);
          if (cab.fire === 0) { this.toast('🧯 Fire is out!'); cab.stoveOn = false; const p = s.items.find((i) => i.s === 'skillet'); if (p) p.d = Math.max(p.d, 2.5); }
        }
        if (held.d <= 0) this.toast('Extinguisher is empty');
        break;

      // ---------- repairs ----------
      case 'fusebox':
        if (!cab.fuseOut) break;
        if (held?.k === 'fuse') { this.items.remove(held.id); cab.fuseOut = false; this.fuseGrace = SURV.FUSE_GRACE; this.sfx('clank'); this.toast('⚡ Power restored'); }
        else if (held?.k === 'tape' && held.d > 0) { this.useUp(held); cab.fuseOut = false; this.fuseGrace = SURV.FUSE_GRACE; this.sfx('tape'); this.toast('⚡ Duct tape hack — power restored (sketchy)'); }
        break;
      case 'radiator':
        if (held?.k === 'coolant' && held.d > 0) { rv.temp = Math.max(150, rv.temp - 70); this.useUp(held); this.sfx('pour'); this.toast('🌡️ Radiator topped up'); }
        else if (held?.k === 'energy') { rv.temp = Math.max(150, rv.temp - 30); this.items.remove(held.id); this.sfx('pour'); this.toast('Poured an energy drink in the radiator. Sure.'); }
        else if (held?.k === 'ice') { rv.temp = Math.max(150, rv.temp - 45); this.items.remove(held.id); this.sfx('pour'); this.toast('🧊 Dumped a bag of ice on the radiator'); }
        break;
      case 'hull':
        if (held?.k === 'hammer') {
          const now = this.t;
          if ((this.hammerCd.get(from) ?? 0) > now) break;
          this.hammerCd.set(from, now + 0.4);
          if (rv.integrity < 100) { rv.integrity = Math.min(100, rv.integrity + 3); this.sfx('hammer'); } else this.sfx('clank');
        } else if (held?.k === 'tape' && held.d > 0 && rv.integrity < 100) {
          rv.integrity = Math.min(100, rv.integrity + 12); this.useUp(held); this.sfx('tape');
        }
        break;
      default:
        if (id.startsWith('wheel_')) {
          const wi = Number(id.slice(6));
          if (cab.flat !== wi || Math.abs(rv.speed) > 0.5) break;
          if (held?.k === 'tape' && held.d > 0) { this.useUp(held); cab.flat = -1; this.tireGrace = 90; cab.nuts = 0; this.sfx('tape'); this.toast('🛞 Duct-taped the tire. What could go wrong?'); break; }
          if (held?.k !== 'spare') break;
          cab.nuts++; this.sfx('clank');
          if (cab.nuts >= 4) { cab.flat = -1; this.tireGrace = 90; cab.nuts = 0; this.items.remove(held.id); this.toast('🛞 Spare tire on. Good as new-ish.'); }
        }
    }
  }

  /** Take a rock from a roadside pile. */
  private rockPile(from: number, held: ItemState | undefined, i: number) {
    const pile = chunkRocks(i);
    if (!pile) return;
    const hand = this.handOf(from);
    if (hand && Math.hypot(hand[0] - pile.x, hand[2] - pile.z) > 7) return;
    if (held) { this.toast('Hands full — drop it first'); return; }
    const left = this.pileLeft.get(i) ?? PILE_ROCKS;
    if (left <= 0) { this.toast('🪨 This pile is picked clean'); return; }
    this.pileLeft.set(i, left - 1);
    const r = this.items.spawn('rock', false, pile.x, 1, pile.z); r.h = from;
    this.sfx('grab');
  }

  /** Thrown rocks: a gentle aim assist toward the cruiser, then a hit test in its frame. */
  private stepRocks(dt: number) {
    const cop = this.traffic.hittableCop();
    if (!cop) return;
    for (const it of [...this.s.items]) {
      if (it.k !== 'rock' || it.rv || it.h !== -1 || it.s) continue;
      const v = this.items.velOf(it.id);
      if (!v) continue;
      // work in the cruiser's frame: a rock only matters if it's moving fast relative to the car
      const cvx = -Math.sin(cop.yaw) * cop.speed, cvz = -Math.cos(cop.yaw) * cop.speed;
      let rvx = v[0] - cvx, rvz = v[2] - cvz;
      const sp = Math.hypot(rvx, rvz);
      if (sp < 6) continue;
      const dx = cop.x - it.x, dz = cop.z - it.z, d = Math.hypot(dx, dz);
      if (d < 60 && d > 1) {
        const k = Math.min(1, dt * 3.5);
        const nx = (rvx / sp) * (1 - k) + (dx / d) * k, nz = (rvz / sp) * (1 - k) + (dz / d) * k, nl = Math.hypot(nx, nz) || 1;
        rvx = (nx / nl) * sp; rvz = (nz / nl) * sp;
        v[0] = cvx + rvx; v[2] = cvz + rvz;
      }
      const rx = it.x - cop.x, rz = it.z - cop.z;
      const along = rx * -Math.sin(cop.yaw) + rz * -Math.cos(cop.yaw), side = rx * Math.cos(cop.yaw) + rz * -Math.sin(cop.yaw);
      const [hw, hl] = NPC_DIMS.cop;
      if (Math.abs(side) < hw + 0.4 && Math.abs(along) < hl + 0.5 && it.y < 2.8) {
        this.items.remove(it.id);
        this.traffic.hitCop();
        return;
      }
    }
  }

  /** Pistol: a hitscan ray from the player's eye against cars and mafia thugs. */
  private shoot(from: number, o: [number, number, number], d: [number, number, number]) {
    const gun = this.held(from);
    if (!gun || gun.k !== 'pistol') return;
    if (gun.d <= 0) { this.toast('*click* — empty. Vinnie sells ammo behind Rusty\'s.'); this.sfx('click'); return; }
    gun.d--; this.sfx('shot', o);
    const len = Math.hypot(...d) || 1, dx = d[0] / len, dy = d[1] / len, dz = d[2] / len;
    let best: { t: number; hit: () => void } | null = null;
    const test = (cx: number, cy: number, cz: number, r: number, hit: () => void) => {
      const vx = cx - o[0], vy = cy - o[1], vz = cz - o[2], t = vx * dx + vy * dy + vz * dz;
      if (t < 0 || t > 170 || (best && t > best.t)) return;
      if (vx * vx + vy * vy + vz * vz - t * t <= r * r) best = { t, hit };
    };
    for (const n of this.s.npcs) if (n.w <= 0) test(n.x, 1.0, n.z, NPC_DIMS[n.k][1] * 0.55 + 0.8, () => this.traffic.shootCar(n));
    for (const th of this.s.mafia.thugs) if (th.hp > 0) test(th.x, 1.0, th.z, 0.65, () => this.hitThug(th));
    (best as { hit: () => void } | null)?.hit();
  }

  private hitThug(th: { hp: number; x: number; z: number }) {
    th.hp--; this.sfx('crunch', [th.x, 1, th.z]);
    if (th.hp > 0) return;
    const left = this.s.mafia.thugs.filter((t) => t.hp > 0).length;
    this.toast(left ? `💀 One of the Bonetti goons drops. ${left} left.` : '💀 The last goon falls.');
    if (!left && this.s.mafia.on) {
      this.s.phase = 'ended';
      this.s.ending = '🔫 SHOWDOWN WON — the Bonetti crew is dead in the sand. The wedding goes on (nobody mentions the bodies).';
    }
  }

  private thugT = 0;
  private thugsSpawned = false;
  /** Late = the mafia hunts you; its goons wait at the chapel and shoot at the RV. */
  private stepMafia(dt: number) {
    const s = this.s, m = s.mafia, rv = s.rv;
    if (!m.on) return;
    const cz = chapelZ();
    if (!this.thugsSpawned && rv.z - cz < 900) {
      this.thugsSpawned = true;
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        const [x, z] = roadPoint(cz + 25 + Math.floor(i / 2) * 14, side * (ROAD_HALF + 5 + (i % 3) * 2));
        m.thugs.push({ id: i + 1, x, z, hp: 2 });
      }
      this.toast('🕴️ The Bonetti crew is waiting at the chapel. Bring a gun… or a very good excuse.');
    }
    this.thugT -= dt;
    if (this.thugT > 0) return;
    this.thugT = 1.4 + Math.random();
    for (const th of m.thugs) {
      if (th.hp <= 0 || Math.hypot(th.x - rv.x, th.z - rv.z) > 95) continue;
      if (Math.random() < 0.6) {
        rv.integrity = Math.max(0, rv.integrity - 1.6); this.joltAll(0.25); this.sfx('shot', [th.x, 1.4, th.z]);
        if (Math.random() < 0.25) this.sfx('crunch', [rv.x, 1, rv.z]);
      } else this.sfx('shot', [th.x, 1.4, th.z]);
    }
  }

  private itemAct(from: number, held: ItemState | undefined, targetId: number) {
    const target = this.items.get(targetId);
    if (!target || target.h !== -1) return;
    if (this.s.items.filter((i) => i.h === from).length >= 3) { this.toast('Pockets full (3 slots) — drop something'); return; }
    if (!held) {
      target.h = from; target.s = '';
      this.sfx('grab');
      return;
    }
    if (!this.combine(from, held, target)) this.toast('Hands full — G to drop');
  }

  /** Burger assembly. Returns true if something was combined. */
  private combine(from: number, a: ItemState, b: ItemState): boolean {
    const pair = (x: string, y: string) => (a.k === x && b.k === y) || (a.k === y && b.k === x);
    let result = '';
    if (pair('patty', 'bun')) {
      const d = (a.k === 'patty' ? a : b).d;
      result = d < 1 ? 'rawburger' : d <= 1.35 ? 'burger' : 'burntburger';
    } else if (pair('burger', 'cheese')) result = 'cheeseburger';
    if (!result) return false;
    this.items.remove(a.id); this.items.remove(b.id);
    const out = this.items.spawn(result, true, 0, 1.2, 0);
    out.h = from;
    this.sfx('grab');
    this.toast(`Made a ${itemName(result, 0)}${result === 'rawburger' ? ' (still pink…)' : result === 'burntburger' ? ' (charcoal edition)' : '!'}`);
    return true;
  }

  private playerAct(from: number, held: ItemState | undefined, target: number) {
    if (held && FOOD_KINDS.has(held.k)) return this.feed(from, target, held);
    if (!held && target === this.s.seats.driver) {
      const c = this.crew(target);
      c.hypno = Math.max(0, c.hypno - 0.5);
      this.sfx('slap'); this.emit({ t: 'ev', k: 'emote', who: from, what: 'slap' });
      this.toast(`👋 ${this.name(from)} slapped ${this.name(target)} awake`);
    }
  }

  /** Consuming store stock you never paid for: whichever clerk saw it reacts. */
  private eatUnpaid(from: number, it: ItemState) {
    if (it.p <= 0) return;
    it.p = 0;
    if (!this.rusty.unpaid(from)) this.stops.unpaid(from);
  }

  private feed(from: number, to: number, it: ItemState) {
    if (this.stops.eat(from, it)) return; // e.g. the Scorpion Challenge burger
    this.eatUnpaid(from, it);
    const food = KINDS[it.k].food!;
    const c = this.crew(to);
    c.hunger = Math.min(100, c.hunger + food.hunger);
    if (it.k === 'cocktail') { c.drunk = Math.min(240, (c.drunk ?? 0) + 120); this.toast(`🍹 ${this.name(to)} is feeling GREAT. Maybe don't drive for a bit.`); }
    if (food.hypno) c.hypno = Math.max(0, c.hypno + food.hypno);
    if (food.caf) c.caf = Math.max(c.caf, food.caf);
    if (it.k === 'water' && c.drunk > 0) { c.drunk = Math.max(0, c.drunk - 90); this.toast(`💧 ${this.name(to)} sobers up a bit`); }
    this.items.remove(it.id);
    const b = food.boost;
    this.emit({ t: 'ev', k: 'fed', to, stam: food.stam, boost: b ? [b.t, b.drain, b.regen] : undefined });
    this.emit({ t: 'ev', k: 'emote', who: to, what: 'eat' });
    this.sfx('eat');
    const what = itemName(it.k, it.d);
    this.toast(from === to ? `${this.name(from)} ate a ${what}` : `${this.name(from)} fed ${this.name(to)} a ${what}`);
    if (food.poison) this.poison(to);
  }

  /** Eating a bare patty. Cooked is fine (if sad); raw or burnt is a mistake. */
  private eatPatty(from: number, it: ItemState) {
    this.eatUnpaid(from, it);
    const bad = it.d < 1 || it.d > 1.35;
    const c = this.crew(from);
    c.hunger = Math.min(100, c.hunger + 25);
    this.items.remove(it.id);
    this.emit({ t: 'ev', k: 'emote', who: from, what: 'eat' });
    this.sfx('eat');
    this.toast(bad ? `${this.name(from)} ate a ${it.d < 1 ? 'RAW' : 'charcoal'} patty with their bare hands. Bold.` : `${this.name(from)} ate a plain patty. Sad, but food.`);
    if (bad) this.poison(from);
  }

  /** Food poisoning: lose health, puke, drop what you're holding. */
  poison(id: number) {
    this.hurt(id, HP.POISON);
    const p = this.handOf(id);
    this.emit({ t: 'ev', k: 'puke', to: id });
    this.sfx('puke', p ?? undefined);
    const held = this.held(id);
    if (held) {
      held.h = -1;
      if (p && !inRV(this.s, p)) { held.rv = false; held.x = p[0]; held.y = Math.max(0.3, p[1] - 0.4); held.z = p[2]; }
      else { const [lx, lz] = p ? rvLocal(this.s, p[0], p[2]) : [0, 0]; held.rv = true; held.x = lx; held.y = 1.0; held.z = lz; }
    }
    const lines = ['🤮 BLEEEGH. Somebody get the mop.', '🤮 That came back up. All of it.', '🤮 The RV smells different now. Worse.', '🤮 Food poisoning! −15 health.'];
    this.toast(lines[Math.floor(Math.random() * lines.length)]);
  }

  private scratch(from: number, it: ItemState) {
    this.eatUnpaid(from, it);
    this.items.remove(it.id);
    const roll = Math.random();
    const win = roll < 0.05 ? 50 : roll < 0.25 ? 10 : 0;
    this.sfx('scrub');
    if (win) { this.credit(from, win, 'Scratch-off win'); this.toast(`🎟️ ${this.name(from)} scratched a WINNER: +$${win}!`); }
    else this.toast(`🎟️ ${this.name(from)} scratched… nothing. "Better luck next time"`);
  }

  /** Lose health. Hitting 0 passes you out (next crew tick). */
  hurt(id: number, amount: number) {
    const c = this.crew(id);
    c.hp = Math.max(0, c.hp - amount);
  }

  /** Standing passengers get thrown around in a crash. */
  hurtStanding(mag: number) {
    const s = this.s;
    for (const id of Object.keys(s.crew).map(Number)) {
      if (id === s.seats.driver || id === s.seats.nav) continue;
      const p = this.handOf(id);
      if (p && !inRV(s, p)) continue; // outside, not in the cabin
      this.hurt(id, mag * HP.CRASH);
    }
  }

  /** 0 hp: blackout, drop everything, wake up on the RV floor with an urgent-care bill. */
  private passOut(id: number) {
    const c = this.crew(id);
    bonk(this, id, HP.KO_SEC);
    c.hp = HP.WAKE_HP;
    this.emit({ t: 'ev', k: 'wake', to: id });
    this.charge(id, HP.ER_BILL, 'Desert Urgent Care');
    this.toast(`🚑 ${this.name(id)} PASSED OUT. The crew dragged them back in by the ankles. Desert Urgent Care billed $${HP.ER_BILL} anyway.`);
  }

  private useUp(it: ItemState) {
    it.d -= 1;
    if (it.d <= 0) { this.items.remove(it.id); this.toast(`${KINDS[it.k].name} used up`); }
  }

  private honked() {
    const d = this.s.seats.driver;
    if (d === -1 || this.hornCd > 0) return;
    this.hornCd = 3;
    const c = this.crew(d);
    c.hypno = Math.max(0, c.hypno - 0.15);
    this.enc.honk();
  }

  private doShift(dir: number) {
    const r = shift(this.s.rv, dir);
    if (r === 'grind') { this.sfx('grind'); this.toast('*GRRRIND* — too fast for that gear'); }
    else if (r === 'shift') this.sfx('shift');
  }

  joltAll(mag: number) {
    this.items.jolt(mag);
    this.emit({ t: 'ev', k: 'jolt', mag });
    this.s.rv.integrity = Math.max(0, this.s.rv.integrity - mag * 0.6);
    if (mag >= SURV.FUSE_JOLT && !this.s.cab.fuseOut && this.fuseGrace <= 0 && Math.random() < SURV.FUSE_CHANCE) {
      this.s.cab.fuseOut = true; this.fuseGrace = SURV.FUSE_GRACE;
      const f = this.items.spawn('fuse', true, 0.65, 1.8, RV.zRear - 0.25);
      this.items.setVel(f.id, [(Math.random() - 0.5) * 2, 2.5, -2 - Math.random() * 2]);
      this.sfx('pop');
      this.toast('⚡ Fuse popped out! Lights & gauges dead');
    }
  }

  private stormIn = 150 + Math.random() * 150;
  private stormLeft = 0;

  /** Lock in a branch once the RV is committed past the split. */
  private stepRoute() {
    const s = this.s, rv = s.rv;
    let changed = false;
    for (const f of FORKS) {
      if (s.route[f.id] !== -1 || rv.z > forkZ(f) - 650) continue;
      const branchX = (k: number) => baseX(rv.z) + routeOffset(rv.z, (id) => (id === f.id ? k : chosen(id)));
      const pick = Math.abs(rv.x - branchX(0)) <= Math.abs(rv.x - branchX(1)) ? 0 : 1;
      s.route[f.id] = pick;
      changed = true;
      const b = f.branches[pick];
      this.toast(`🛣️ You took ${b.name} → ${b.stop}. Wedding is now ${totalMilesWith(s.route)} miles total.`);
    }
    if (changed) { const z = setRouteChoices(s.route); if (z !== null) clearHazardsBeyond(z); }
  }

  private stepWeather(dt: number) {
    const s = this.s, rv = s.rv, w = s.weather;
    const windMul = branchAt(rv.z)?.wind ?? 0.6;
    if (this.stormLeft > 0) {
      this.stormLeft -= dt;
      if (this.stormLeft <= 0) this.toast('🌤️ The sandstorm is clearing.');
    } else {
      this.stormIn -= dt * windMul;
      if (this.stormIn <= 0) {
        this.stormLeft = 45 + Math.random() * 45;
        this.stormIn = 160 + Math.random() * 200;
        this.toast('🌪️ SANDSTORM rolling in! Wipers on, headlights on, slow down.');
      }
    }
    const target = this.stormLeft > 0 ? 1 : 0;
    w.storm += Math.max(-dt / 15, Math.min(dt / 15, target - w.storm));
    // gusty crosswind: stronger in storms and on exposed branches (the canyon)
    w.wind = (w.storm * 1.0 + 0.15) * windMul * (0.65 * Math.sin(this.t * 0.37) + 0.35 * Math.sin(this.t * 1.31 + 1));
    if (Math.abs(rv.speed) > 2) {
      // push the RV sideways along its right vector (cos yaw, −sin yaw)
      const push = w.wind * 1.3 * dt;
      rv.x += Math.cos(rv.yaw) * push; rv.z += -Math.sin(rv.yaw) * push;
    }
    rv.grime = Math.min(1, rv.grime + w.storm * dt * 0.035);
  }

  private railCd = 0;
  /** Solid guardrails on shelves, passes and tight bends: push back, redirect along the rail, scrape. */
  private collideRails(dt: number) {
    const rv = this.s.rv;
    this.railCd = Math.max(0, this.railCd - dt);
    if (!(railAt(rv.z) | railAt(rv.z - 6) | railAt(rv.z + 6))) return;
    const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
    for (const side of [-1, 1] as const) {
      const bit = side < 0 ? 1 : 2;
      let worst = 0;
      for (const lx of [-RV.halfW, RV.halfW]) for (const lz of [RV.noseZ, RV.zRear]) {
        const wx = rv.x + lx * c + lz * sn, wz = rv.z - lx * sn + lz * c;
        const fr = roadFrame(wx, wz);
        if (!(railAt(fr.s) & bit)) continue;
        worst = Math.max(worst, side * fr.off - (roadHalf(fr.s) + 1.85));
      }
      if (worst <= 0) continue;
      const s0 = roadS(rv.x, rv.z), dx = roadDX(s0), len = Math.hypot(1, dx), ry = roadYaw(s0);
      rv.x -= (side * worst) / len; rv.z -= (side * -dx * worst) / len; // back along the road's right normal
      const vn = Math.max(0, side * rv.speed * Math.sin(ry - rv.yaw)); // speed into the rail
      let rel = rv.yaw - ry; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) < Math.PI / 2) rv.yaw = ry + rel * 0.4; // redirect along the rail
      rv.speed *= Math.max(0.55, 1 - vn * 0.03 - dt * 0.6);
      if (vn > 1.5 && this.railCd <= 0) {
        this.railCd = 0.5;
        const mag = Math.min(1.2, vn / 14);
        rv.integrity = Math.max(0, rv.integrity - Math.min(6, 1 + vn * 0.3));
        this.sfx(vn > 8 ? 'bang' : 'scrape'); this.joltAll(mag); if (vn > 6) this.hurtStanding(mag * 0.6);
        this.once('rail' + Math.floor(this.t / 20), vn > 8 ? '💥 SMASHED into the guardrail' : '⚙️ Scraping the guardrail…');
      } else if (vn > 0.2 && this.railCd <= 0) { this.railCd = 0.4; this.sfx('scrape'); }
    }
  }

  private prevPose = { x: 0, z: 0, yaw: 0 };
  private crashCd = 0;
  private collideStatics(dt: number) {
    const rv = this.s.rv;
    this.crashCd = Math.max(0, this.crashCd - dt);
    // RV footprint: center between nose and rear, in RV-local z
    const midZ = (RV.noseZ + RV.zRear) / 2, hl = (RV.zRear - RV.noseZ) / 2;
    const sets = [RUSTY_SET, ...this.stops.sets()].filter((set) => Math.abs(rv.x - set.x) < 150 && Math.abs(rv.z - set.z) < 150);
    const blocked = (x: number, z: number, yaw: number) => {
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      return sets.some((set) => {
        const [cx, cz] = toSetLocal(set, x + midZ * sn, z + midZ * c);
        return set.boxes.some((b) => obbHitsBox(cx, cz, yaw - set.yaw, RV.halfW, hl, b));
      });
    };
    if (sets.length && blocked(rv.x, rv.z, rv.yaw)) {
      // slide along the wall: keep whichever axis of the move still fits, lose the part that went into the wall
      const p = this.prevPose, dx = rv.x - p.x, dz = rv.z - p.z, moved = Math.hypot(dx, dz) || 1;
      const sp = Math.abs(rv.speed);
      const tries: [number, number, number][] = [[p.x + dx, p.z, rv.yaw], [p.x, p.z + dz, rv.yaw], [p.x + dx, p.z, p.yaw], [p.x, p.z + dz, p.yaw]];
      const ok = tries.find(([x, z, yw]) => !blocked(x, z, yw));
      let kept = 0;
      if (ok) { kept = Math.hypot(ok[0] - p.x, ok[1] - p.z) / moved; rv.x = ok[0]; rv.z = ok[1]; rv.yaw = ok[2]; }
      else { rv.x = p.x; rv.z = p.z; rv.yaw = p.yaw; }
      const lost = sp * (1 - kept);
      rv.speed = ok ? rv.speed * Math.max(0.3, kept) : rv.speed * -0.15;
      if (lost > 2 && this.crashCd <= 0) {
        this.crashCd = 0.6; this.sfx('bang');
        const mag = Math.min(1.5, lost / 12);
        this.joltAll(mag); this.hurtStanding(mag);
        this.toast(kept > 0.3 ? '💥 SCRAAAPE along the wall' : '💥 CRUNCH');
      }
    }
    this.prevPose = { x: rv.x, z: rv.z, yaw: rv.yaw };
  }

  step(dt: number, accel: { x: number; z: number } = { x: 0, z: 0 }) {
    const s = this.s, rv = s.rv, cab = s.cab;
    if (s.phase !== 'drive') return;
    this.t += dt;
    this.driveT += dt;
    this.hornCd = Math.max(0, this.hornCd - dt);
    this.tireGrace = Math.max(0, this.tireGrace - dt);
    this.fuseGrace = Math.max(0, this.fuseGrace - dt);
    if (this.driveT > 0.5 || s.seats.driver === -1) this.drive = { th: 0, br: 0, st: 0, horn: false };
    const solo = Object.keys(s.crew).length <= 1 ? SURV.SOLO_EASE : 1;

    // ---------- driver condition → controls ----------
    const input = { ...this.drive };
    const dc = s.seats.driver !== -1 ? this.crew(s.seats.driver) : null;
    if (dc) {
      if (dc.hunger < SURV.HANGRY_BELOW) input.th = Math.min(1, input.th * (0.75 + 0.4 * Math.sin(this.t * 2.3)));
      if (dc.hypno > 0.4) {
        const k = (dc.hypno - 0.4) / 0.6;
        input.st += (Math.sin(this.t * 0.9) * 0.45 + Math.sin(this.t * 2.7) * 0.2) * k;
      }
      if ((dc.drunk ?? 0) > 0) input.st += Math.sin(this.t * 1.3) * 0.22 + Math.sin(this.t * 3.7) * 0.08; // free casino drinks
      if (dc.hypno >= 1) { input.st = Math.sin(this.t * 0.5) * 0.6; input.br = 0; this.once('asleep' + Math.floor(this.t / 30), `😴 ${this.name(s.seats.driver)} fell asleep at the wheel! Slap them / honk / coffee`); }
    }
    if (rv.horn && !this.hornWas) this.honked();
    this.hornWas = rv.horn;

    // ---------- drivetrain ----------
    const wipers = rv.wipers;
    if (cab.fuseOut) rv.wipers = false;
    const offroad = !onRoad(rv.x, rv.z);
    // hill under the RV: rise between the axles along its heading (same sampling as the RV model)
    const fc = Math.cos(rv.yaw), fs = Math.sin(rv.yaw);
    const slope = (groundY(rv.x - fs * 2.6, rv.z - fc * 2.6) - groundY(rv.x + fs * 2.6, rv.z + fc * 2.6)) / 5.2;
    for (const e of stepRV(rv, this.aux, input, dt, offroad, slope)) {
      if (e === 'stall') { this.sfx('stall'); this.toast('Stalled! Shift down and turn the key.'); }
      else if (e === 'nofuel') this.toast('Out of gas!');
      else if (e === 'overheat') this.toast('🌡️ Radiator overheating! Ease off or add coolant (front grille)');
    }
    rv.wipers = wipers;
    if (offroad && Math.abs(rv.speed) > 10) rv.integrity = Math.max(0, rv.integrity - dt * 0.4);

    // flat tire: pulls toward the flat side, drags, chews up the RV
    if (cab.flat >= 0) {
      const side = cab.flat % 2 === 0 ? 1 : -1;
      rv.yaw += side * 0.05 * Math.min(1, Math.abs(rv.speed) / 10) * dt * Math.sign(rv.speed);
      if (rv.speed > 15.6) rv.speed -= 2.5 * dt;
      if (Math.abs(rv.speed) > 11) rv.integrity = Math.max(0, rv.integrity - dt * 0.25);
    }

    // ---------- road hazards ----------
    if (Math.abs(rv.speed) > 2) {
      const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
      for (const hz of hazardsNear(rv.z)) {
        if ((this.hitHazards.get(hz.id) ?? -9) > this.t - 1.5) continue;
        for (let wi = 0; wi < 4; wi++) {
          const [lx, lz] = WHEELS[wi];
          const wx = rv.x + lx * c + lz * sn, wz = rv.z - lx * sn + lz * c;
          if (Math.hypot(wx - hz.x, wz - hz.z) > hz.r + 0.17) continue;
          this.hitHazards.set(hz.id, this.t);
          const mag = Math.min(1.5, Math.abs(rv.speed) / 25);
          if (hz.type === 'pothole') { this.sfx('thump'); this.joltAll(mag); }
          else if (cab.flat < 0 && this.tireGrace <= 0 && Math.random() < 0.6) { this.tireGrace = 90; cab.flat = wi; cab.nuts = 0; this.sfx('bang'); this.toast('🛞 BLOWOUT! Pull over and put the spare on'); this.joltAll(Math.min(mag, 0.6)); }
          break;
        }
      }
    }

    // ---------- route: which branch did we take at each fork? ----------
    this.stepRoute();
    // ---------- weather: sandstorms + crosswind ----------
    this.stepWeather(dt);

    // ---------- stop buildings: the RV can't drive through them ----------
    this.collideStatics(dt);
    this.collideRails(dt);

    // ---------- props ----------
    this.fixSlots();
    this.items.step(dt, accel);
    this.stepRocks(dt);
    this.rusty.step(dt);
    this.traffic.step(dt);
    this.canyon.step(dt);
    this.enc.step(dt);
    this.stops.step(dt);
    this.groom.step(s, dt);

    // ---------- galley ----------
    const pan = s.items.find((i) => i.s === 'skillet');
    if (pan && (cab.stoveOn || cab.fire > 0)) {
      const prev = pan.d;
      pan.d += dt / SURV.COOK_TIME;
      if (pan.d >= 1 && prev < 1) this.toast('🍔 Patty is cooked — grab it!');
      if (pan.d >= 1.35 && prev < 1.35) this.toast('Patty is burning!');
      if (pan.d >= SURV.FIRE_AT && prev < SURV.FIRE_AT && cab.fire === 0 && cab.stoveOn) { cab.fire = 0.25; this.sfx('whoosh'); this.toast('🔥 GREASE FIRE! Grab the extinguisher by the door'); }
    }
    if (cab.fire > 0) {
      cab.fire = Math.min(1, cab.fire + dt * 0.035);
      rv.integrity = Math.max(0, rv.integrity - dt * cab.fire * 0.5);
    }
    cab.smoke = Math.min(1, Math.max(0, cab.smoke + dt * (cab.fire * 0.1 - (rv.doorOpen ? 0.2 : 0.03))));
    cab.fridgeT = Math.max(0, cab.fridgeT - dt);
    if (cab.brew > 0) {
      cab.brew -= dt;
      if (cab.brew <= 0) { cab.brew = 0; this.items.spawn('coffee', true, 0.9, 1.65, -0.12); this.sfx('cash'); this.toast('☕ Coffee is ready'); }
    }

    // ---------- crew ----------
    for (const [idStr, c] of Object.entries(s.crew)) {
      const id = Number(idStr);
      const before = c.hunger;
      c.hunger = Math.max(0, c.hunger - (dt * 100 / SURV.HUNGER_TIME) * solo);
      if (before >= SURV.HANGRY_BELOW && c.hunger < SURV.HANGRY_BELOW) this.toast(`😠 ${this.name(id)} is getting hangry`);
      c.caf = Math.max(0, c.caf - dt);
      c.spray = Math.max(0, c.spray - dt);
      c.drunk = Math.max(0, (c.drunk ?? 0) - dt);
      // health: starving slowly eats you; a full belly patches you up
      c.hp ??= 100;
      if (c.hunger <= 0) c.hp -= HP.EMPTY * dt * solo;
      else if (c.hunger < HP.STARVING_BELOW) c.hp -= HP.STARVING * dt * solo;
      else if (c.hunger > HP.REGEN_ABOVE) c.hp = Math.min(100, c.hp + HP.REGEN * dt);
      if (c.hp < 25 && !this.lowHp.has(id)) { this.lowHp.add(id); this.toast(`🦅 ${this.name(id)} looks rough. Vultures are circling. EAT SOMETHING.`); }
      else if (c.hp > 30) this.lowHp.delete(id);
      if (c.hp <= 0) this.passOut(id);
      if (id === s.seats.driver && Math.abs(rv.speed) > SURV.HYPNO_MIN_SPEED && c.caf <= 0) c.hypno = Math.min(1, c.hypno + (dt / SURV.HYPNO_TIME) * solo);
      else if (id !== s.seats.driver) c.hypno = Math.max(0, c.hypno - dt / 20);
    }

    // ---------- clock & endings ----------
    s.clock += dt * CFG.TIME_SCALE;
    this.once('plot', '🌿 THE JOB: get the stash to Kevin\'s wedding before 24:00. Miss it and the Bonetti mafia — who paid for it — comes for you.');
    this.stepMafia(dt);
    if (rv.integrity <= 0) { s.phase = 'ended'; s.ending = 'TOTALED — the RV fell apart in the desert.'; }
    if (s.clock >= CFG.RUN_HOURS * 3600 && !s.mafia.on) {
      s.mafia.on = true;
      this.toast('⏰ TIME\'S UP. The Bonetti crew has your location. Guns up — or deliver late and pray.');
    }
    if (rv.z < chapelZ()) {
      // drove through the wedding arch
      s.phase = 'ended';
      const left = CFG.RUN_HOURS * 3600 - s.clock;
      const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60);
      const stash = s.items.some((i) => { const w = i.k === 'weed' && this.itemWorld(i); return !!w && Math.hypot(w[0] - rv.x, w[2] - rv.z) < 25; });
      s.ending = !stash
        ? '🚫 NO STASH — you drove through the arch with nothing. Kevin has never been so sober, or so angry.'
        : left >= 0
          ? `💒 DELIVERED — the stash reached the wedding with ${h}h ${m}m to spare. The toast was... lit. $${s.money.toFixed(2)} left on the card.`
          : '🌿 DELIVERED LATE — the stash arrived, the mafia did not get you. Kevin cries a little.';
    }
  }
}
