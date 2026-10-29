// Minimal diegetic-first HUD: clock, odometer, card balance, reticle, prompts, toasts.
import { CFG, ENGINE, NOS, gearInfo } from '../config';
import { SPEED_LIMIT } from '../world/World';
import { progressMiles, totalMiles } from '../world/Route';
import { itemName } from '../items/Items';
import type { SharedState, SeatRole } from '../types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function hhmm(sec: number) {
  const m = Math.floor(sec / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export class HUD {
  private el = {
    hud: $('hud'), wedding: $('h-wedding'), time: $('h-time'), miles: $('h-miles'), money: $('h-money'), moneyV: $('h-money-v'), moneyFly: $('h-money-fly'), badges: $('h-badges'),
    phone: $('phone'), radioCap: $('radio-cap'), hurt: $('fx-hurt'), speedFx: $('fx-speed'), nosFx: $('fx-nos'), flash: $('fx-flash'), black: $('fx-black'), camWarn: $('cam-warn'), nos: $('g-nos'),
    reticle: $('reticle'), prompt: $('prompt'), hints: $('hints'), toasts: $('toasts'), tab: $('tab'), end: $('end'),
    pause: $('pause'), room: $('p-room'), dev: $('dev'),
    hp: $('v-hp'), puke: $('fx-puke'), hunger: $('v-hunger'), stam: $('v-stam'), awake: $('v-awake'), awakeRow: $('v-awake-row'), held: $('v-held'),
    gearbox: $('gearbox'), gear: $('g-gear'), gspeed: $('g-speed'), grpm: $('g-rpm'),
    smoke: $('fx-smoke'), hangry: $('fx-hangry'), lidTop: $('fx-lid-top'), lidBot: $('fx-lid-bot'),
  };

  private shownMoney: number | null = null;
  private pendingDelta = 0;
  private deltaT = 0;
  private flyEl: HTMLElement | null = null;
  private hurtA = 0;
  private flashA = 0;
  private blackT = 0;
  private nosA = 0;
  private capT = 0;
  /** The groom's latest texts (shown on Tab). */
  readonly texts: string[] = [];

  show() { this.el.hud.classList.remove('hidden'); }

  /** Fade to black for `sec` seconds (then ease back in). */
  blackout(sec: number) { this.blackT = sec; }

  /** Green "I ate something bad" wash. */
  puke() { this.pukeA = 1; }
  private pukeA = 0;

  /** White speed-camera flash. */
  flash() { this.flashA = 1; }

  /** Red damage vignette, 0..1. */
  hurt(amount: number) { this.hurtA = Math.min(1, this.hurtA + amount); }

  /** A text from the groom: buzzes onto the phone stack. */
  text(from: string, msg: string) {
    this.texts.push(msg); if (this.texts.length > 4) this.texts.shift();
    const d = document.createElement('div');
    d.className = 'sms';
    const b = document.createElement('b'); b.textContent = from;
    d.append(b, document.createTextNode(msg));
    this.el.phone.appendChild(d);
    setTimeout(() => d.classList.add('out'), 9000);
    setTimeout(() => d.remove(), 9700);
    while (this.el.phone.children.length > 3) this.el.phone.firstChild!.remove();
  }

  /** What the radio is saying right now. */
  caption(who: string, text: string) {
    const c = this.el.radioCap;
    c.innerHTML = '';
    const i = document.createElement('i'); i.textContent = `📻 ${who}: `;
    c.append(i, document.createTextNode(text));
    c.classList.remove('hidden');
    this.capT = 2.5 + text.length * 0.068;
  }

  /** Per-frame effects that don't depend on state (dt in seconds). */
  fx(dt: number, speedMph: number, inRV: boolean, nos = false) {
    this.blackT = Math.max(0, this.blackT - dt);
    this.el.black.style.opacity = this.blackT > 1.2 ? '1' : (this.blackT / 1.2).toFixed(3);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.pukeA = Math.max(0, this.pukeA - dt * 0.35);
    this.el.puke.style.opacity = this.pukeA.toFixed(3);
    this.el.flash.style.opacity = (this.flashA * 0.85).toFixed(3);
    this.nosA += ((nos && inRV ? 1 : 0) - this.nosA) * Math.min(1, dt * 5);
    this.el.nosFx.style.opacity = this.nosA.toFixed(3);
    this.hurtA = Math.max(0, this.hurtA - dt * 1.4);
    this.el.hurt.style.opacity = this.hurtA.toFixed(3);
    this.el.speedFx.style.opacity = inRV ? Math.min(0.8, Math.max(0, (speedMph - 70) / 130)).toFixed(3) : '0';
    if (this.capT > 0 && (this.capT -= dt) <= 0) this.el.radioCap.classList.add('hidden');
  }

  /** Balance ticks toward the real value; changes fly off as +$/−$ chips (merged within ~1 s). */
  private money(v: number, dt: number) {
    if (this.shownMoney === null) this.shownMoney = v;
    const diff = v - this.shownMoney;
    if (Math.abs(diff) >= 0.005) {
      if (Math.abs(diff) > 0.009 && this.deltaT <= 0) this.el.money.classList.remove('bump');
      this.pendingDelta += diff;
      this.shownMoney = v;
      this.deltaT = 1.0;
      this.showFly();
    }
    if (this.deltaT > 0 && (this.deltaT -= dt) <= 0) { this.pendingDelta = 0; this.flyEl = null; }
    this.ticker += (v - this.ticker) * Math.min(1, dt * 6);
    if (Math.abs(v - this.ticker) < 0.01) this.ticker = v;
    this.el.moneyV.textContent = `💳 $${this.ticker.toFixed(2)}`;
  }
  private ticker = 0;
  private showFly() {
    const d = this.pendingDelta;
    if (Math.abs(d) < 0.5) return; // tiny pump ticks merge until they're worth showing
    if (!this.flyEl) {
      this.flyEl = document.createElement('div');
      this.el.moneyFly.appendChild(this.flyEl);
      const el = this.flyEl;
      setTimeout(() => el.remove(), 1700);
      void this.el.money.offsetWidth; this.el.money.classList.add('bump');
    } else {
      // restart the animation so a merged chip stays visible
      this.flyEl.style.animation = 'none'; void this.flyEl.offsetWidth; this.flyEl.style.animation = '';
    }
    this.flyEl.className = `fly ${d >= 0 ? 'plus' : 'minus'}`;
    this.flyEl.textContent = `${d >= 0 ? '+' : '−'}$${Math.abs(d).toFixed(2)}`;
  }

  update(s: SharedState, opts: { prompt: string; seat: SeatRole; locked: boolean; tab: boolean; room: string; players: string[]; dev: string; myId: number; stamina: number; held: string; inRV: boolean; dt: number; cam: number | null }) {
    const remaining = Math.max(0, CFG.RUN_HOURS * 3600 - s.clock);
    const tod = CFG.START_HOUR * 3600 + s.clock;
    const day = Math.floor(tod / 86400) + 1;
    this.el.wedding.textContent = s.mafia.on ? '💀 MAFIA ON YOUR TAIL' : `🌿 Deliver the stash in ${hhmm(remaining)}`;
    this.el.wedding.classList.toggle('urgent', remaining < 3 * 3600);
    this.el.time.textContent = `🕗 ${hhmm(tod % 86400)} · Day ${day}`;
    this.el.miles.textContent = `🛣️ Mile ${progressMiles(s.rv.z).toFixed(1)} / ${totalMiles()}`;
    this.money(s.money, opts.dt);
    this.el.money.classList.toggle('low', s.money < CFG.WEDDING_MIN_BALANCE);
    this.el.money.classList.toggle('overdraft', s.money < 0);
    this.el.money.title = `Need $${CFG.WEDDING_MIN_BALANCE} for the wedding gift`;

    const badges: string[] = [];
    if (s.cab.fire > 0) badges.push('🔥 Grease fire');
    if (s.cab.fuseOut) badges.push('⚡ Fuse out');
    if (s.cab.flat >= 0) badges.push('🛞 Flat tire');
    if (s.rv.integrity < 60) badges.push(`🔧 RV ${Math.round(s.rv.integrity)}%`);
    if (s.weather.storm > 0.3) badges.push('🌪️ Sandstorm');
    if (s.rv.steam) badges.push('🌡️ Overheating');
    if (s.rv.fuel < 3) badges.push('⛽ Low fuel');
    if (s.rv.ignition === 0 && s.seats.driver !== -1) badges.push('🔑 Engine off');
    if (s.shark.on) badges.push('🦈 LOAN SHARK — get the card above $0!');
    if (s.cop.phase === 1 || s.cop.phase === 2) badges.push('🚔 Roscoe on your tail — stop to pull over');
    else if (s.cop.phase === 3) badges.push('🤠 Roscoe at the driver window — hand him the card');
    else if (s.heat > 0) badges.push(`🚔 Heat ${s.heat}`);
    this.el.badges.textContent = badges.join('  ');

    // gear readout for the driver
    this.el.gearbox.classList.toggle('hidden', opts.seat !== 'driver');
    if (opts.seat === 'driver') {
      const on = s.rv.ignition === 2;
      this.el.gear.textContent = on ? gearInfo(s.rv.gear).name : s.rv.ignition === 1 ? '…' : 'OFF';
      this.el.gear.classList.toggle('off', !on);
      this.el.gear.classList.toggle('rev', on && s.rv.gear === -1);
      this.el.gspeed.textContent = `${Math.round(Math.abs(s.rv.speed) * CFG.MPH)} mph`;
      this.el.nos.textContent = `NOS ${'●'.repeat(s.rv.nos)}${'○'.repeat(Math.max(0, NOS.CHARGES - s.rv.nos))}${s.rv.nosT > 0 ? ' 🔥' : '  [N]'}`;
      this.el.nos.classList.toggle('burn', s.rv.nosT > 0);
      this.el.nos.classList.toggle('dry', s.rv.nos <= 0 && s.rv.nosT <= 0);
      this.el.grpm.style.width = `${Math.min(100, (s.rv.rpm / ENGINE.REDLINE) * 100)}%`;
    }

    // speed camera countdown (cameras are the only place the limit is enforced)
    const mph = Math.abs(s.rv.speed) * CFG.MPH;
    const camShow = opts.inRV && opts.cam !== null && opts.cam < 1400;
    this.el.camWarn.classList.toggle('hidden', !camShow);
    if (camShow) {
      this.el.camWarn.textContent = `📷 SPEED CAMERA ${Math.max(0, Math.round(opts.cam! / 10) * 10)} m — limit ${SPEED_LIMIT} mph${mph > SPEED_LIMIT + 5 ? '  ·  SLOW DOWN!' : ''}`;
      this.el.camWarn.classList.toggle('hot', mph > SPEED_LIMIT + 5);
    }

    // vitals & screen effects
    const me = s.crew[opts.myId];
    const hunger = me?.hunger ?? 100, hypno = me?.hypno ?? 0;
    const hp = me?.hp ?? 100;
    this.el.hp.style.width = `${hp}%`;
    this.el.hp.classList.toggle('low', hp < 25);
    this.el.hunger.style.width = `${hunger}%`;
    this.el.hunger.classList.toggle('low', hunger < 25);
    this.el.stam.style.width = `${opts.stamina}%`;
    const driving = opts.seat === 'driver';
    this.el.awakeRow.classList.toggle('hidden', !driving && hypno < 0.05);
    this.el.awake.style.width = `${(1 - hypno) * 100}%`;
    const sl = me?.slot ?? 0;
    this.el.held.textContent = [0, 1, 2].map((n) => { const it = s.items.find((i) => i.h === opts.myId && i.sl === n); return `${n === sl ? '▶' : ' '}${n + 1}:${it ? itemName(it.k, it.d) : '—'}`; }).join('   ');
    this.el.smoke.style.opacity = String(opts.inRV ? s.cab.smoke * 0.75 : 0);
    const t = performance.now() / 1000;
    this.el.hangry.style.opacity = hunger < 25 ? String(0.35 + 0.35 * Math.sin(t * 4)) : '0';
    const lid = driving && hypno > 0.3 ? Math.min(1, (hypno - 0.3) / 0.7) * (0.75 + 0.25 * Math.sin(t * 1.7)) : 0;
    this.el.lidTop.style.height = `${lid * 46}vh`;
    this.el.lidBot.style.height = `${lid * 46}vh`;

    this.el.reticle.classList.toggle('active', !!opts.prompt);
    this.el.prompt.textContent = opts.prompt;
    this.el.prompt.classList.toggle('hidden', !opts.prompt);

    this.el.hints.textContent = opts.seat === 'driver'
      ? 'W/S throttle·brake   A/D steer   E/Q shift up·down   N nitrous   Space handbrake   H horn   Click dash   F stand'
      : opts.seat === 'nav'
        ? 'Mouse look   Click dash   F stand'
        : opts.held
          ? 'E / Click use · combine   Click eat (food) · spray (hold)   G drop   RMB throw   Tab players'
          : 'WASD move   Shift sprint   Space jump   E / Click grab · interact   Tab players';

    this.el.pause.classList.toggle('hidden', opts.locked || s.phase === 'ended');
    if (!opts.locked) this.el.room.textContent = opts.room === 'SOLO' ? 'Solo run' : `Room code: ${opts.room}`;
    this.el.tab.classList.toggle('hidden', !opts.tab);
    if (opts.tab) {
      const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
      this.el.tab.innerHTML = `<div class="tab-code">Room <b>${opts.room}</b></div>` + opts.players.map((p) => `<div>${esc(p)}</div>`).join('')
        + (this.texts.length ? `<div class="tab-texts">💍 Kevin: ${this.texts.slice(-2).map(esc).join('<br>')}</div>` : '');
    }

    if (s.phase === 'ended') { this.el.end.classList.remove('hidden'); this.el.end.querySelector('h1')!.textContent = s.ending; }

    this.el.dev.classList.toggle('hidden', !opts.dev);
    if (opts.dev) this.el.dev.textContent = opts.dev;
  }

  toast(text: string) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3700);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild!.remove();
  }
}
