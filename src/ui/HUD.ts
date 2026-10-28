// Minimal diegetic-first HUD: clock, odometer, card balance, reticle, prompts, toasts.
import { CFG, ENGINE, gearInfo } from '../config';
import { progressMiles, totalMiles } from '../world/Route';
import type { SharedState, SeatRole } from '../types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function hhmm(sec: number) {
  const m = Math.floor(sec / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export class HUD {
  private el = {
    hud: $('hud'), wedding: $('h-wedding'), time: $('h-time'), miles: $('h-miles'), money: $('h-money'), badges: $('h-badges'),
    reticle: $('reticle'), prompt: $('prompt'), hints: $('hints'), toasts: $('toasts'), tab: $('tab'), end: $('end'),
    pause: $('pause'), room: $('p-room'), dev: $('dev'),
    hunger: $('v-hunger'), stam: $('v-stam'), awake: $('v-awake'), awakeRow: $('v-awake-row'), held: $('v-held'),
    gearbox: $('gearbox'), gear: $('g-gear'), gspeed: $('g-speed'), grpm: $('g-rpm'),
    smoke: $('fx-smoke'), hangry: $('fx-hangry'), lidTop: $('fx-lid-top'), lidBot: $('fx-lid-bot'),
  };

  show() { this.el.hud.classList.remove('hidden'); }

  update(s: SharedState, opts: { prompt: string; seat: SeatRole; locked: boolean; tab: boolean; room: string; players: string[]; dev: string; myId: number; stamina: number; held: string; inRV: boolean }) {
    const remaining = Math.max(0, CFG.RUN_HOURS * 3600 - s.clock);
    const tod = CFG.START_HOUR * 3600 + s.clock;
    const day = Math.floor(tod / 86400) + 1;
    this.el.wedding.textContent = `💒 Wedding in ${hhmm(remaining)}`;
    this.el.wedding.classList.toggle('urgent', remaining < 3 * 3600);
    this.el.time.textContent = `🕗 ${hhmm(tod % 86400)} · Day ${day}`;
    this.el.miles.textContent = `🛣️ Mile ${progressMiles(s.rv.z).toFixed(1)} / ${totalMiles()}`;
    this.el.money.textContent = `💳 $${s.money.toFixed(2)}`;
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
      this.el.grpm.style.width = `${Math.min(100, (s.rv.rpm / ENGINE.REDLINE) * 100)}%`;
    }

    // vitals & screen effects
    const me = s.crew[opts.myId];
    const hunger = me?.hunger ?? 100, hypno = me?.hypno ?? 0;
    this.el.hunger.style.width = `${hunger}%`;
    this.el.hunger.classList.toggle('low', hunger < 25);
    this.el.stam.style.width = `${opts.stamina}%`;
    const driving = opts.seat === 'driver';
    this.el.awakeRow.classList.toggle('hidden', !driving && hypno < 0.05);
    this.el.awake.style.width = `${(1 - hypno) * 100}%`;
    this.el.held.textContent = opts.held ? `✋ ${opts.held}` : '';
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
      ? 'W/S throttle·brake   A/D steer   E/Q shift up·down   Space handbrake   H horn   Click dash   F stand'
      : opts.seat === 'nav'
        ? 'Mouse look   Click dash   F stand'
        : opts.held
          ? 'E / Click use · combine   Click eat (food) · spray (hold)   G drop   RMB throw   Tab players'
          : 'WASD move   Shift sprint   Space jump   E / Click grab · interact   Tab players';

    this.el.pause.classList.toggle('hidden', opts.locked || s.phase === 'ended');
    if (!opts.locked) this.el.room.textContent = opts.room === 'SOLO' ? 'Solo run' : `Room code: ${opts.room}`;
    this.el.tab.classList.toggle('hidden', !opts.tab);
    if (opts.tab) this.el.tab.innerHTML = `<div class="tab-code">Room <b>${opts.room}</b></div>` + opts.players.map((p) => `<div>${p}</div>`).join('');

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
