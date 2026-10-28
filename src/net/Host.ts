// Authoritative simulation. Runs only on the host; clients send intents.
import { CFG, RV, SURV } from '../config';
import { ItemSim } from '../items/ItemPhysics';
import { KINDS, START_ITEMS, itemName } from '../items/Items';
import { newRVState, shift, stepRV, type RVAux } from '../rv/Drivetrain';
import type { Box2 } from '../rv/RV';
import { LANE_OFFSET, hazardsNear, roadX, roadYaw } from '../world/World';
import type { CrewState, DriveInput, GameMsg, ItemState, SharedState } from '../types';

const WHEELS: [number, number][] = [[-RV.wheelX, RV.wheelFrontZ], [RV.wheelX, RV.wheelFrontZ], [-RV.wheelX, RV.wheelRearZ], [RV.wheelX, RV.wheelRearZ]];
const FOOD_KINDS = new Set(Object.entries(KINDS).filter(([, k]) => k.food).map(([n]) => n));

export class HostSim {
  readonly s: SharedState;
  readonly items: ItemSim;
  private aux: RVAux = { crankT: 0, lugT: 0, hornT: 0 };
  private drive: DriveInput = { th: 0, br: 0, st: 0, horn: false };
  private driveT = 0;
  private t = 0;
  private hitHazards = new Map<number, number>(); // hazard id → time last hit
  private hornWas = false;
  private hornCd = 0;
  private hammerCd = new Map<number, number>();
  private warned = new Set<string>();

  constructor(private emit: (msg: GameMsg) => void, colliders: (doorOpen: boolean) => Box2[] = () => []) {
    const yaw = roadYaw(0);
    const x = roadX(0) + LANE_OFFSET * Math.cos(yaw);
    this.s = {
      rv: newRVState(x, -LANE_OFFSET * Math.sin(yaw), yaw),
      cab: { stoveOn: false, fire: 0, smoke: 0, fuseOut: false, flat: -1, nuts: 0, brew: 0 },
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
  }

  private toast(text: string) { this.emit({ t: 'ev', k: 'toast', text }); }
  private sfx(name: string) { this.emit({ t: 'ev', k: 'sfx', name }); }
  private once(key: string, text: string) { if (!this.warned.has(key)) { this.warned.add(key); this.toast(text); } }
  private name(id: number) { return this.names(id); }
  names: (id: number) => string = (id) => `Bean ${id}`;

  crew(id: number): CrewState {
    return (this.s.crew[id] ??= { hunger: 100, hypno: 0, caf: 0, spray: 0 });
  }

  private held(id: number) { return this.s.items.find((i) => i.h === id); }

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
      case 'self': if (held && FOOD_KINDS.has(held.k)) this.feed(from, from, held); else if (held?.k === 'patty') this.toast('Cook it first. Please.'); break;
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
          if (held?.k === 'tape' && held.d > 0) { this.useUp(held); cab.flat = -1; cab.nuts = 0; this.sfx('tape'); this.toast('🛞 Duct-taped the tire. What could go wrong?'); break; }
          if (held?.k !== 'spare') break;
          cab.nuts++; this.sfx('clank');
          if (cab.nuts >= 4) { cab.flat = -1; cab.nuts = 0; this.items.remove(held.id); this.toast('🛞 Spare tire on. Good as new-ish.'); }
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
      this.sfx('slap');
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
    this.sfx('eat');
    const what = itemName(it.k, it.d);
    this.toast(from === to ? `${this.name(from)} ate a ${what}` : `${this.name(from)} fed ${this.name(to)} a ${what}`);
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

  private joltAll(mag: number) {
    this.items.jolt(mag);
    this.emit({ t: 'ev', k: 'jolt', mag });
    this.s.rv.integrity = Math.max(0, this.s.rv.integrity - mag * 1.0);
    if (mag >= SURV.FUSE_JOLT && !this.s.cab.fuseOut && Math.random() < 0.4) {
      this.s.cab.fuseOut = true;
      const f = this.items.spawn('fuse', true, 0.65, 1.8, RV.zRear - 0.25);
      this.items.setVel(f.id, [(Math.random() - 0.5) * 2, 2.5, -2 - Math.random() * 2]);
      this.sfx('pop');
      this.toast('⚡ Fuse popped out! Lights & gauges dead');
    }
  }

  step(dt: number, accel: { x: number; z: number } = { x: 0, z: 0 }) {
    const s = this.s, rv = s.rv, cab = s.cab;
    if (s.phase !== 'drive') return;
    this.t += dt;
    this.driveT += dt;
    this.hornCd = Math.max(0, this.hornCd - dt);
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
    const offroad = Math.abs(rv.x - roadX(rv.z)) > 6.5;
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
          else if (cab.flat < 0) { cab.flat = wi; cab.nuts = 0; this.sfx('bang'); this.toast('🛞 BLOWOUT! Pull over and put the spare on'); this.joltAll(Math.min(mag, 0.6)); }
          break;
        }
      }
    }

    // ---------- props ----------
    this.items.step(dt, accel);

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
    const miles = rv.odometer * CFG.MILES_PER_METER;
    if (miles >= CFG.ROUTE_MILES) {
      s.phase = 'ended';
      s.ending = s.money >= CFG.WEDDING_MIN_BALANCE ? 'JUST MARRIED — you made it with a gift!' : 'EMPTY-HANDED — you made it, but you\'re broke.';
    }
  }
}
