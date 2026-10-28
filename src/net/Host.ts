// Authoritative simulation. Runs only on the host; clients send intents.
import { CFG, NOS, RADIO_STATIONS, RV, SURV } from '../config';
import { ItemSim } from '../items/ItemPhysics';
import { KINDS, START_ITEMS, itemName } from '../items/Items';
import { newRVState, shift, stepRV, type RVAux } from '../rv/Drivetrain';
import type { Box2 } from '../rv/RV';
import { obbHitsBox, toSetLocal } from '../stops/geom';
import { PRICES, RUSTY_SET } from '../stops/rusty';
import { RustySim, newRustyState, type StopHost } from '../stops/RustySim';
import { NPC_DIMS, TrafficSim } from '../traffic/TrafficSim';
import { StopsHost } from '../stops/Stops';
import { CHARM2_QUOTES, CHARM_QUOTES } from '../rv/charmQuotes';
import { GROOM, Groom } from './Groom';
import { LANE_OFFSET, PILE_ROCKS, baseX, chunkRocks, clearHazardsBeyond, hazardsNear, onRoad, roadX, roadYaw } from '../world/World';
import { FORKS, branchAt, chapelZ, chosen, forkZ, routeOffset, setRouteChoices } from '../world/Route';
import type { CrewState, DriveInput, GameMsg, ItemState, SharedState } from '../types';

const totalMilesWith = (route: number[]) => CFG.ROUTE_MILES + FORKS.reduce((a, f) => a + f.branches[Math.max(0, route[f.id])].delta, 0);

const WHEELS: [number, number][] = [[-RV.wheelX, RV.wheelFrontZ], [RV.wheelX, RV.wheelFrontZ], [-RV.wheelX, RV.wheelRearZ], [RV.wheelX, RV.wheelRearZ]];
const FOOD_KINDS = new Set(Object.entries(KINDS).filter(([, k]) => k.food).map(([n]) => n));

export interface LedgerEntry { who: number; what: string; amount: number }

export class HostSim implements StopHost {
  readonly s: SharedState;
  readonly items: ItemSim;
  readonly rusty: RustySim;
  readonly traffic: TrafficSim;
  readonly stops: StopsHost;
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
  /** Seconds of blowout immunity after a flat (so tires don't pop back-to-back). */
  private tireGrace = 60;
  /** Rocks left in each roadside pile (chunk index → count). */
  private pileLeft = new Map<number, number>();

  constructor(private emit: (msg: GameMsg) => void, colliders: (doorOpen: boolean) => Box2[] = () => []) {
    const yaw = roadYaw(0);
    const x = roadX(0) + LANE_OFFSET * Math.cos(yaw);
    this.s = {
      rv: newRVState(x, -LANE_OFFSET * Math.sin(yaw), yaw),
      cab: { stoveOn: false, fire: 0, smoke: 0, fuseOut: false, flat: -1, nuts: 0, brew: 0 },
      rusty: newRustyState(),
      stops: {},
      route: FORKS.map(() => -1),
      weather: { storm: 0, wind: 0 },
      npcs: [],
      cop: { phase: 0, t: 0, fled: false },
      shark: { on: false, t: 0 },
      items: [],
      crew: {},
      money: CFG.START_MONEY,
      clock: 0,
      seats: { driver: -1, nav: -1 },
      heat: 0,
      phase: 'drive',
      ending: '',
    };
    this.items = new ItemSim(this.s, colliders);
    for (const [k, x, y, z] of START_ITEMS) {
      if (k === 'extinguisher') this.items.spawn(k, true, 0, 0, 0, 'wall');
      else this.items.spawn(k, true, x, y, z);
    }
    this.items.spawn('spare', true, 0, 0, 0, 'rack');
    this.items.spawn('card', true, 0, 0, 0, 'tray');
    this.prevPose = { x: this.s.rv.x, z: this.s.rv.z, yaw: this.s.rv.yaw };
    this.rusty = new RustySim(this);
    this.traffic = new TrafficSim(this);
    this.stops = new StopsHost(this, this.items.statics);
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

  toast(text: string) { this.emit({ t: 'ev', k: 'toast', text }); }
  sfx(name: string, at?: [number, number, number]) { this.emit(at ? { t: 'ev', k: 'sfx', name, at } : { t: 'ev', k: 'sfx', name }); }
  private once(key: string, text: string) { if (!this.warned.has(key)) { this.warned.add(key); this.toast(text); } }
  name(id: number) { return this.names(id); }
  names: (id: number) => string = (id) => `Bean ${id}`;

  crew(id: number): CrewState {
    return (this.s.crew[id] ??= { hunger: 100, hypno: 0, caf: 0, spray: 0 });
  }

  held(id: number) { return this.s.items.find((i) => i.h === id); }

  handle(from: number, m: GameMsg) {
    this.crew(from);
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
    const it = this.held(id);
    if (it) { it.h = -1; it.rv = true; it.x = 0; it.y = 1.2; it.z = 0; }
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
    if (this.stops.act(from, id)) return;
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
      case 'coffeemaker':
        if (cab.brew <= 0) { cab.brew = SURV.BREW_TIME; this.sfx('click'); this.toast('☕ Coffee brewing…'); }
        break;
      case 'self':
        if (held && FOOD_KINDS.has(held.k)) this.feed(from, from, held);
        else if (held?.k === 'patty') this.toast('Cook it first. Please.');
        else if (held?.k === 'scratch') this.scratch(from, held);
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
        if (held?.k === 'fuse') { this.items.remove(held.id); cab.fuseOut = false; this.sfx('clank'); this.toast('⚡ Power restored'); }
        else if (held?.k === 'tape' && held.d > 0) { this.useUp(held); cab.fuseOut = false; this.sfx('tape'); this.toast('⚡ Duct tape hack — power restored (sketchy)'); }
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

  private itemAct(from: number, held: ItemState | undefined, targetId: number) {
    const target = this.items.get(targetId);
    if (!target || target.h !== -1) return;
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

  private feed(from: number, to: number, it: ItemState) {
    const food = KINDS[it.k].food!;
    const c = this.crew(to);
    c.hunger = Math.min(100, c.hunger + food.hunger);
    if (food.hypno) c.hypno = Math.max(0, c.hypno + food.hypno);
    if (food.caf) c.caf = Math.max(c.caf, food.caf);
    this.items.remove(it.id);
    this.emit({ t: 'ev', k: 'fed', to, stam: food.stam });
    this.emit({ t: 'ev', k: 'emote', who: to, what: 'eat' });
    this.sfx('eat');
    const what = itemName(it.k, it.d);
    this.toast(from === to ? `${this.name(from)} ate a ${what}` : `${this.name(from)} fed ${this.name(to)} a ${what}`);
  }

  private scratch(from: number, it: ItemState) {
    this.items.remove(it.id);
    const roll = Math.random();
    const win = roll < 0.05 ? 50 : roll < 0.25 ? 10 : 0;
    this.sfx('scrub');
    if (win) { this.credit(from, win, 'Scratch-off win'); this.toast(`🎟️ ${this.name(from)} scratched a WINNER: +$${win}!`); }
    else this.toast(`🎟️ ${this.name(from)} scratched… nothing. "Better luck next time"`);
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
    if (mag >= SURV.FUSE_JOLT && !this.s.cab.fuseOut && Math.random() < 0.4) {
      this.s.cab.fuseOut = true;
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

  private prevPose = { x: 0, z: 0, yaw: 0 };
  private crashCd = 0;
  private collideStatics(dt: number) {
    const rv = this.s.rv;
    this.crashCd = Math.max(0, this.crashCd - dt);
    // RV footprint: center between nose and rear, in RV-local z
    const midZ = (RV.noseZ + RV.zRear) / 2, hl = (RV.zRear - RV.noseZ) / 2;
    for (const set of [RUSTY_SET, ...this.stops.sets()]) {
      if (Math.abs(rv.x - set.x) > 150 || Math.abs(rv.z - set.z) > 150) continue;
      const c = Math.cos(rv.yaw), sn = Math.sin(rv.yaw);
      const [cx, cz] = toSetLocal(set, rv.x + midZ * sn, rv.z + midZ * c);
      const yaw = rv.yaw - set.yaw;
      if (set.boxes.some((b) => obbHitsBox(cx, cz, yaw, RV.halfW, hl, b))) {
        // undo the move and bounce
        const sp = Math.abs(rv.speed);
        rv.x = this.prevPose.x; rv.z = this.prevPose.z; rv.yaw = this.prevPose.yaw;
        rv.speed *= -0.15;
        if (sp > 2 && this.crashCd <= 0) { this.crashCd = 0.6; this.sfx('bang'); this.joltAll(Math.min(1.5, sp / 12)); this.toast('💥 CRUNCH'); }
        return;
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
      if (dc.hypno >= 1) { input.st = Math.sin(this.t * 0.5) * 0.6; input.br = 0; this.once('asleep' + Math.floor(this.t / 30), `😴 ${this.name(s.seats.driver)} fell asleep at the wheel! Slap them / honk / coffee`); }
    }
    if (rv.horn && !this.hornWas) this.honked();
    this.hornWas = rv.horn;

    // ---------- drivetrain ----------
    const wipers = rv.wipers;
    if (cab.fuseOut) rv.wipers = false;
    const offroad = !onRoad(rv.x, rv.z);
    for (const e of stepRV(rv, this.aux, input, dt, offroad)) {
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

    // ---------- props ----------
    this.items.step(dt, accel);
    this.stepRocks(dt);
    this.rusty.step(dt);
    this.traffic.step(dt);
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
      if (id === s.seats.driver && Math.abs(rv.speed) > SURV.HYPNO_MIN_SPEED && c.caf <= 0) c.hypno = Math.min(1, c.hypno + (dt / SURV.HYPNO_TIME) * solo);
      else if (id !== s.seats.driver) c.hypno = Math.max(0, c.hypno - dt / 20);
    }

    // ---------- clock & endings ----------
    s.clock += dt * CFG.TIME_SCALE;
    if (rv.integrity <= 0) { s.phase = 'ended'; s.ending = 'TOTALED — the RV fell apart in the desert.'; }
    if (s.clock >= CFG.RUN_HOURS * 3600) { s.phase = 'ended'; s.ending = 'MISSED IT — the wedding happened without you.'; }
    if (rv.z < chapelZ()) {
      // drove through the wedding arch
      s.phase = 'ended';
      const left = CFG.RUN_HOURS * 3600 - s.clock;
      const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60);
      s.ending = s.money >= CFG.WEDDING_MIN_BALANCE
        ? `💒 JUST MARRIED — you made it with ${h}h ${m}m to spare and $${s.money.toFixed(2)} for the gift!`
        : `💸 EMPTY-HANDED — you made it with ${h}h ${m}m to spare… and $${s.money.toFixed(2)}. Awkward.`;
    }
  }
}
