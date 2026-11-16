// Minimal diegetic-first HUD: clock, odometer, card balance, reticle, prompts, toasts.
import { CFG, ENGINE, NOS, gearInfo } from '../config';
import { routeMarks } from './Objective';
import { SPEED_LIMIT } from '../world/World';
import { progressMiles, totalMiles } from '../world/Route';
import { KINDS, itemIcon, itemName } from '../items/Items';
import type { ItemState, Receipt, SharedState, SeatRole } from '../types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function hhmm(sec: number) {
  const m = Math.floor(sec / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export class HUD {
  private el = {
    hud: $('hud'), count: $('h-count'), countL: $('h-count-l'), rFill: $('r-fill'), rTicks: $('r-ticks'), rMe: $('r-me'), mFill: $('m-fill'), gift: $('h-gift'), crew: $('crew'), rvstat: $('rvstat'), intro: $('intro'),
    nHp: $('n-hp'), nHunger: $('n-hunger'), nAwake: $('n-awake'), gFuel: $('g-fuel'), gFuelN: $('g-fuel-n'), gTemp: $('g-temp'), gTempN: $('g-temp-n'), lamps: $('g-lamps'), hotbar: $('hotbar'),
    wedding: $('h-wedding'), time: $('h-time'), miles: $('h-miles'), money: $('h-money'), moneyV: $('h-money-v'), moneyFly: $('h-money-fly'), badges: $('h-badges'),
    phone: $('phone'), radioCap: $('radio-cap'), hurt: $('fx-hurt'), speedFx: $('fx-speed'), nosFx: $('fx-nos'), flash: $('fx-flash'), black: $('fx-black'), camWarn: $('cam-warn'), nos: $('g-nos'),
    reticle: $('reticle'), prompt: $('prompt'), hints: $('hints'), toasts: $('toasts'), tab: $('tab'), end: $('end'),
    pause: $('pause'), room: $('p-room'), dev: $('dev'),
    hp: $('v-hp'), puke: $('fx-puke'), hunger: $('v-hunger'), stam: $('v-stam'), awake: $('v-awake'), awakeRow: $('v-awake-row'), buzz: $('v-buzz'), hbName: $('hb-name'),
    gearbox: $('gearbox'), gear: $('g-gear'), gspeed: $('g-speed'), grpm: $('g-rpm'),
    objective: $('objective'), chatLog: $('chat-log'), chatIn: $<HTMLInputElement>('chat-in'), ret: $('return'), retBar: $('return-bar'), receipt: $('receipt'), endNote: $('e-note'), invite: $('p-invite'),
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
  private slots = [...document.querySelectorAll<HTMLElement>('#hotbar .hb-slot')];
  private slotKeys = ['', '', ''];
  private selKey = '';
  private nameT = 0;
  /** The groom's latest texts (shown on Tab). */
  readonly texts: string[] = [];

  show() { this.el.hud.classList.remove('hidden'); }

  /** Full-screen "getting ready" veil between the title screen and the first frame of the run. */
  loading(on: boolean, tip = '') {
    const l = $('loading');
    if (on) { l.classList.remove('hidden', 'out'); $('ld-tip').textContent = tip; }
    else { l.classList.add('out'); setTimeout(() => l.classList.add('hidden'), 700); }
  }

  /** Opening title card for a fresh run (fades itself out). */
  intro() {
    const i = this.el.intro;
    i.classList.remove('hidden'); i.style.animation = 'none'; void i.offsetWidth; i.style.animation = '';
    setTimeout(() => i.classList.add('hidden'), 5200);
  }
  private keyed = new Map<HTMLElement, string>();
  /** Set innerHTML only when it changed (these run every frame). */
  private html(el: HTMLElement, h: string) { if (this.keyed.get(el) !== h) { this.keyed.set(el, h); el.innerHTML = h; } }
  private hintKey = '';
  private hintT = 0;

  /** A line of crew chat (fades after a while). */
  chat(who: string, text: string) {
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = who;
    d.append(b, document.createTextNode(text));
    this.el.chatLog.appendChild(d);
    setTimeout(() => d.classList.add('out'), 12000);
    setTimeout(() => d.remove(), 12700);
    while (this.el.chatLog.children.length > 6) this.el.chatLog.firstChild!.remove();
  }

  /** Open the chat box; calls back with the typed line ('' = cancelled). */
  chatPrompt(done: (text: string) => void) {
    const el = this.el.chatIn;
    el.value = ''; el.classList.remove('hidden'); el.focus();
    let open = true;
    const close = (text: string) => {
      if (!open) return;
      open = false; el.onkeydown = null; el.onblur = null; el.classList.add('hidden'); el.blur(); done(text);
    };
    el.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') close(el.value.trim());
      else if (e.key === 'Escape') close('');
    };
    el.onblur = () => close('');
  }

  /** "Hold R to catch up" bar: null hides it, otherwise text + 0..1 progress. */
  returnHint(text: string | null, k = 0) {
    this.el.ret.classList.toggle('hidden', text === null);
    if (text === null) return;
    this.el.ret.firstElementChild!.textContent = text;
    this.el.retBar.style.width = `${Math.round(k * 100)}%`;
  }

  /** The end-of-run receipt and blame board (arrives from the host right after the ending). */
  showReceipt(r: Receipt) {
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
    const cls = (n: number) => (n < -0.005 ? 'neg' : n > 0.005 ? 'pos' : '');
    const line = (a: string, n: number) => `<div class="rc-line ${cls(n)}"><span>${esc(a)}</span><span>${n > 0.005 ? '+' : ''}${usd(n)}</span></div>`;
    const solo = r.crew.length <= 1;
    const gift = CFG.WEDDING_MIN_BALANCE;
    const paper = `<div class="rc-paper"><h3>ROADTRIP ROULETTE</h3><small>shared card · run #${r.seed}</small>`
      + `<div class="rc-line"><span>Opening balance</span><span>${usd(CFG.START_MONEY)}</span></div><div class="rc-rule"></div>`
      + (r.lines.length ? r.lines.map(([who, what, n]) => line(solo ? what : `${who}: ${what}`, n)).join('') : '<div class="rc-line"><span>Nobody touched the card.</span><span></span></div>')
      + `<div class="rc-rule"></div><div class="rc-line rc-total ${r.money < gift ? 'neg' : 'pos'}"><span>LEFT ON THE CARD</span><span>${usd(r.money)}</span></div>`
      + `<small style="margin-top:8px">${r.money >= gift ? 'Wedding gift covered. Classy.' : r.money >= 0 ? `Under the $${gift} gift line. Awkward.` : 'The Loan Shark sends his regards.'}</small></div>`;
    const h = Math.floor(r.clock / 3600), m = Math.floor((r.clock % 3600) / 60);
    const facts = '<div class="rc-card"><h4>The trip</h4><div class="rc-facts">'
      + `<div><b>${r.miles.toFixed(0)} / ${r.total}</b>miles</div><div><b>${h}h ${String(m).padStart(2, '0')}m</b>on the road</div><div><b>${Math.max(0, Math.round(r.integrity))}%</b>of an RV left</div></div></div>`;
    const board = r.crew.length ? '<div class="rc-card"><h4>Blame board</h4><table><tr><th>Bean</th><th>Spent</th><th>Earned</th><th>Gambling</th></tr>'
      + r.crew.map((c) => { const g = c.won - c.bet; return `<tr><td>${esc(c.name)}</td><td class="${c.spent > 0 ? 'neg' : ''}">${usd(-c.spent)}</td><td class="${c.earned > 0 ? 'pos' : ''}">${usd(c.earned)}</td><td class="${cls(g)}">${g > 0.005 ? '+' : ''}${usd(g)}</td></tr>`; }).join('')
      + '</table></div>' : '';
    const awards = r.awards.length ? `<div class="rc-card"><h4>Awards nobody wanted</h4>${r.awards.map((a) => `<div class="rc-award">${esc(a)}</div>`).join('')}</div>` : '';
    this.el.receipt.innerHTML = `${paper}<div class="rc-side">${facts}${board}${awards}</div>`;
    this.el.receipt.classList.remove('hidden');
  }

  /** A new run started: put the receipt away. */
  hideReceipt() { this.el.receipt.classList.add('hidden'); this.el.receipt.innerHTML = ''; }

  /** End-screen buttons. `again` = what "Play again" does for this player, or null to hide it. */
  endButtons(again: (() => void) | null, lobby: () => void, note: string) {
    const a = $('e-again');
    a.classList.toggle('hidden', !again);
    if (again) a.onclick = again;
    $('e-lobby').onclick = lobby;
    this.el.endNote.textContent = note;
  }

  /** Pause-menu invite button (multiplayer only). */
  invite(url: string) {
    const b = this.el.invite;
    b.classList.remove('hidden');
    b.onclick = () => {
      const ok = () => { b.textContent = 'Link copied'; setTimeout(() => (b.textContent = 'Copy invite link'), 1800); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok, () => prompt('Invite link', url)); else prompt('Invite link', url);
    };
  }
  private objText = '';

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
    this.el.moneyV.textContent = `${this.ticker < 0 ? '−' : ''}$${Math.abs(this.ticker).toFixed(2)}`;
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

  update(s: SharedState, opts: { crew: { id: number; name: string; color: string }[]; prompt: string; seat: SeatRole; locked: boolean; tab: boolean; room: string; players: { id: number; name: string; color: string; host: boolean; you: boolean }[]; objective: string; dev: string; myId: number; stamina: number; boost: { t: number; drain: number }; held: string; inRV: boolean; dt: number; cam: number | null }) {
    const remaining = Math.max(0, CFG.RUN_HOURS * 3600 - s.clock);
    const tod = CFG.START_HOUR * 3600 + s.clock;
    const day = Math.floor(tod / 86400) + 1;
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.el.count.textContent = s.mafia.on ? 'LATE' : hhmm(remaining);
    this.el.countL.textContent = s.mafia.on ? 'the mafia is on your tail' : 'to the wedding';
    this.el.wedding.classList.toggle('urgent', remaining < 3 * 3600);
    this.el.time.textContent = `${hhmm(tod % 86400)} · Day ${day}`;
    const total = totalMiles(), here = progressMiles(s.rv.z), frac = Math.min(1, Math.max(0, here / total));
    this.el.miles.textContent = `Mile ${here.toFixed(1)} of ${total}`;
    this.el.rFill.style.width = `${frac * 100}%`;
    this.el.rMe.style.left = `${frac * 100}%`;
    this.html(this.el.rTicks, routeMarks(s).map((m) => `<i class="${m.kind}${m.at <= frac ? ' done' : ''}" style="left:${(m.at * 100).toFixed(2)}%" title="${esc(m.label)}"></i>`).join(''));
    this.money(s.money, opts.dt);
    const gift = CFG.WEDDING_MIN_BALANCE;
    this.el.money.classList.toggle('low', s.money < gift);
    this.el.money.classList.toggle('overdraft', s.money < 0);
    this.el.mFill.style.width = `${Math.min(100, Math.max(0, s.money / (gift * 2)) * 100)}%`;
    this.el.gift.textContent = s.money < 0 ? 'Overdrawn: the Loan Shark is coming' : s.money < gift ? `$${(gift - s.money).toFixed(0)} short of the $${gift} gift` : `$${(s.money - gift).toFixed(0)} to spare above the $${gift} gift`;

    // status chips: [severity, text]
    const badges: [string, string][] = [];
    if (s.cab.fire > 0) badges.push(['bad', '🔥 Grease fire']);
    if (s.shark.on) badges.push(['bad', '🦈 Loan Shark: get the card above $0']);
    if (s.cop.phase === 1 || s.cop.phase === 2) badges.push(['bad', '🚔 Roscoe on your tail: stop to pull over']);
    else if (s.cop.phase === 3) badges.push(['bad', '🤠 Roscoe at the window: hand him the card']);
    else if (s.heat > 0) badges.push(['warn', `🚔 Heat ${s.heat}`]);
    if (s.rv.steam) badges.push(['bad', '🌡️ Overheating']);
    if (s.cab.flat >= 0) badges.push(['bad', '🛞 Flat tire']);
    if (s.cab.fuseOut) badges.push(['warn', '⚡ Fuse out']);
    if (s.rv.fuel < 3) badges.push([s.rv.fuel < 1 ? 'bad' : 'warn', `⛽ Low fuel (${s.rv.fuel.toFixed(1)} gal)`]);
    if (s.rv.integrity < 60) badges.push([s.rv.integrity < 30 ? 'bad' : 'warn', `🔧 RV ${Math.round(s.rv.integrity)}%`]);
    if (s.weather.storm > 0.3) badges.push(['info', '🌪️ Sandstorm']);
    if (s.rv.ignition === 0 && s.seats.driver !== -1) badges.push(['info', '🔑 Engine off']);
    this.html(this.el.badges, badges.map(([c, t]) => `<span class="${c}">${t}</span>`).join(''));

    // driver cluster
    const rv = s.rv, mphNow = Math.round(Math.abs(rv.speed) * CFG.MPH);
    this.el.gearbox.classList.toggle('hidden', opts.seat !== 'driver');
    if (opts.seat === 'driver') {
      const on = rv.ignition === 2;
      this.el.gear.textContent = on ? gearInfo(rv.gear).name : rv.ignition === 1 ? '…' : 'OFF';
      this.el.gear.classList.toggle('off', !on);
      this.el.gear.classList.toggle('rev', on && rv.gear === -1);
      this.el.gspeed.textContent = String(mphNow);
      this.el.nos.textContent = `NOS ${'●'.repeat(rv.nos)}${'○'.repeat(Math.max(0, NOS.CHARGES - rv.nos))}${rv.nosT > 0 ? ' 🔥' : ' N'}`;
      this.el.nos.classList.toggle('burn', rv.nosT > 0);
      this.el.nos.classList.toggle('dry', rv.nos <= 0 && rv.nosT <= 0);
      const rev = Math.min(1, rv.rpm / ENGINE.REDLINE);
      this.el.grpm.style.width = `${rev * 100}%`;
      this.el.grpm.classList.toggle('red', rev > 0.92);
      this.el.gFuel.style.width = `${Math.min(100, (rv.fuel / CFG.FUEL_CAPACITY) * 100)}%`;
      this.el.gFuel.classList.toggle('low', rv.fuel < 3);
      this.el.gFuelN.textContent = `${rv.fuel.toFixed(1)} gal`;
      this.el.gTemp.style.width = `${Math.min(100, Math.max(0, (rv.temp - 100) / 160) * 100)}%`;
      this.el.gTemp.classList.toggle('low', rv.temp > 220);
      this.el.gTempN.textContent = `${Math.round(rv.temp)}°F`;
      this.html(this.el.lamps, `<i class="${rv.handbrake ? 'on red' : ''}" title="Handbrake">P</i><i class="${rv.headlights ? 'on' : ''}" title="Headlights">💡</i><i class="${rv.wipers ? 'on' : ''}" title="Wipers">〰</i>`);
    }
    // everyone else gets a one-line read of the RV
    const showRv = opts.seat !== 'driver' && s.phase === 'drive';
    this.el.rvstat.classList.toggle('hidden', !showRv);
    if (showRv) this.html(this.el.rvstat, `<span><b>${mphNow}</b> mph</span><span class="${rv.fuel < 3 ? 'bad' : ''}">⛽ <b>${rv.fuel.toFixed(1)}</b> gal</span><span class="${rv.temp > 220 ? 'bad' : ''}">🌡️ <b>${Math.round(rv.temp)}</b>°</span><span class="${rv.integrity < 40 ? 'bad' : ''}">🔧 <b>${Math.round(rv.integrity)}</b>%</span>`);

    // the rest of the crew
    this.html(this.el.crew, opts.crew.map((c) => {
      const st = s.crew[c.id];
      const role = s.seats.driver === c.id ? '🚗' : s.seats.nav === c.id ? '🗺️' : '';
      const hpC = Math.round(st?.hp ?? 100), huC = Math.round(st?.hunger ?? 100);
      return `<div class="${hpC < 25 ? 'hurt' : ''}"><i style="background:${c.color}"></i><span>${esc(c.name)} ${role}</span><em><b class="hp" style="width:${hpC}%"></b></em><em><b class="hu${huC < 25 ? ' low' : ''}" style="width:${huC}%"></b></em></div>`;
    }).join(''));

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
    this.el.hp.style.width = `${Math.round(hp)}%`;
    this.el.hp.classList.toggle('low', hp < 25);
    this.el.nHp.textContent = String(Math.round(hp));
    this.el.nHunger.textContent = String(Math.round(hunger));
    this.el.nAwake.textContent = `${Math.round((1 - hypno) * 100)}`;
    this.el.hunger.style.width = `${Math.round(hunger)}%`;
    this.el.hunger.classList.toggle('low', hunger < 25);
    this.el.stam.style.width = `${Math.round(opts.stamina)}%`;
    const buzz = opts.boost.t > 0;
    this.el.stam.classList.toggle('buzz', buzz);
    this.el.buzz.textContent = buzz ? `${opts.boost.drain <= 0.5 ? '☕' : '⚡'} ${Math.floor(opts.boost.t / 60)}:${String(Math.floor(opts.boost.t % 60)).padStart(2, '0')}` : '';
    const driving = opts.seat === 'driver';
    this.el.awakeRow.classList.toggle('hidden', !driving && hypno < 0.05);
    this.el.awake.style.width = `${Math.round((1 - hypno) * 100)}%`;
    this.hotbar(s, me?.slot ?? 0, opts.myId, opts.dt);
    this.el.smoke.style.opacity = String(opts.inRV ? s.cab.smoke * 0.75 : 0);
    const t = performance.now() / 1000;
    this.el.hangry.style.opacity = hunger < 25 ? String(0.35 + 0.35 * Math.sin(t * 4)) : '0';
    const lid = driving && hypno > 0.3 ? Math.min(1, (hypno - 0.3) / 0.7) * (0.75 + 0.25 * Math.sin(t * 1.7)) : 0;
    this.el.lidTop.style.height = `${lid * 46}vh`;
    this.el.lidBot.style.height = `${lid * 46}vh`;

    if (opts.objective !== this.objText) {
      // "… in 12.3 mi" ticks constantly; only pop when the goal itself changes
      const goal = (t: string) => t.replace(/ in [\d.]+ mi$/, '');
      const o = this.el.objective;
      if (goal(opts.objective) !== goal(this.objText)) { o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop'); }
      this.objText = opts.objective;
      o.textContent = opts.objective;
      o.classList.toggle('hidden', !opts.objective);
    }
    this.el.reticle.classList.toggle('active', !!opts.prompt);
    const act = !opts.prompt ? '' : /^[A-Z]: /.test(opts.prompt) || opts.prompt.includes(' is driving') || opts.prompt.includes(' is navigating') ? '' : opts.seat === 'driver' ? 'Click' : 'E';
    this.html(this.el.prompt, (act ? `<kbd>${act}</kbd>` : '') + esc(opts.prompt));
    this.el.prompt.classList.toggle('hidden', !opts.prompt);

    // key hints: bright when the context changes, then they settle back
    const hints: [string, string][] = opts.seat === 'driver'
      ? [['W S', 'gas · brake'], ['A D', 'steer'], ['E Q', 'shift'], ['Space', 'handbrake'], ['N', 'nitrous'], ['H', 'horn'], ['Click', 'dash'], ['F', 'stand']]
      : opts.seat === 'nav'
        ? [['Click', 'dash'], ['T', 'ping'], ['Enter', 'chat'], ['F', 'stand']]
        : opts.held
          ? [['E', 'use · combine'], ['Click', 'eat · spray'], ['G', 'drop'], ['RMB', 'throw'], ['1 2 3', 'pockets']]
          : [['WASD', 'move'], ['Shift', 'sprint'], ['Space', 'jump'], ['E', 'grab · use'], ['T', 'ping'], ['Enter', 'chat'], ['Tab', 'crew']];
    const hk = opts.seat + (opts.held ? 'h' : '');
    if (hk !== this.hintKey) { this.hintKey = hk; this.hintT = 14; }
    this.hintT = Math.max(0, this.hintT - opts.dt);
    this.el.hints.classList.toggle('dim', this.hintT <= 0);
    this.html(this.el.hints, hints.map(([k, l]) => `<span><kbd>${k}</kbd>${l}</span>`).join(''));
    this.el.hotbar.classList.toggle('tucked', opts.seat === 'driver' && !s.items.some((i) => i.h === opts.myId));

    this.el.pause.classList.toggle('hidden', opts.locked || s.phase === 'ended');
    if (!opts.locked) this.el.room.textContent = opts.room === 'SOLO' ? 'Solo run' : `Room code: ${opts.room}`;
    this.el.tab.classList.toggle('hidden', !opts.tab);
    if (opts.tab) {
      const rows = opts.players.map((p) => {
        const st = s.crew[p.id];
        const role = s.seats.driver === p.id ? '🚗 Driving' : s.seats.nav === p.id ? '🗺️ Navigating' : 'On their feet';
        const it = s.items.find((i) => i.h === p.id && i.sl === (st?.slot ?? 0));
        const hpC = Math.round(st?.hp ?? 100), huC = Math.round(st?.hunger ?? 100);
        return `<div class="tb-row${p.you ? ' you' : ''}"><i style="background:${p.color}"></i><span class="tb-name">${esc(p.name)}${p.host ? '<small>host</small>' : ''}${p.you ? '<small>you</small>' : ''}</span><span class="tb-role">${role}</span>`
          + `<span class="tb-held">${it ? `${itemIcon(it.k)} ${esc(itemName(it.k, it.d))}` : '<s>empty hands</s>'}</span>`
          + `<span class="tb-bar"><em><b class="hp" style="width:${hpC}%"></b></em>${hpC}</span><span class="tb-bar"><em><b class="hu${huC < 25 ? ' low' : ''}" style="width:${huC}%"></b></em>${huC}</span></div>`;
      }).join('');
      this.html(this.el.tab, `<div class="tb-head"><div><small>${opts.room === 'SOLO' ? 'Solo run' : 'Room code'}</small><b>${opts.room === 'SOLO' ? '—' : opts.room}</b></div><div><small>Road</small><b>#${s.seed}</b></div><div><small>Heat</small><b class="${s.heat > 0 ? 'hot' : ''}">${s.heat > 0 ? '🚔'.repeat(Math.min(5, s.heat)) : 'clean'}</b></div></div>`
        + `<div class="tb-cols"><span></span><span>Bean</span><span>Doing</span><span>Holding</span><span>❤️</span><span>🍔</span></div>${rows}`
        + (this.texts.length ? `<div class="tb-texts"><small>💍 Kevin</small>${this.texts.slice(-2).map((t) => `<p>${esc(t)}</p>`).join('')}</div>` : '')
        + `<div class="tb-foot">Esc for settings and the invite link</div>`);
    }

    this.el.end.classList.toggle('hidden', s.phase !== 'ended');
    if (s.phase === 'ended') this.el.end.querySelector('h1')!.textContent = s.ending;

    this.el.dev.classList.toggle('hidden', !opts.dev);
    if (opts.dev) this.el.dev.textContent = opts.dev;
  }

  /** Three pockets, bottom center. The held item's name pops up above when it changes. */
  private hotbar(s: SharedState, sel: number, myId: number, dt: number) {
    let selItem: ItemState | undefined;
    for (let n = 0; n < 3; n++) {
      const it = s.items.find((i) => i.h === myId && i.sl === n);
      if (n === sel) selItem = it;
      const el = this.slots[n];
      const key = it ? `${it.id}:${it.k}:${Math.round(it.d * 10)}:${it.p}` : '';
      el.classList.toggle('sel', n === sel);
      if (key === this.slotKeys[n]) continue;
      this.slotKeys[n] = key;
      const kind = it ? KINDS[it.k] : undefined;
      const count = !it ? '' : it.k === 'jerrycan' ? it.d.toFixed(1) : it.k === 'sponge' ? (it.d > 0 ? String(it.d) : '')
        : kind?.uses && kind.uses > 1 && it.k !== 'extinguisher' ? String(it.d) : '';
      el.querySelector('.hb-icon')!.textContent = it ? itemIcon(it.k) : '';
      el.querySelector('.hb-count')!.textContent = count;
      el.querySelector('.hb-price')!.textContent = it && it.p > 0 ? `$${it.p % 1 ? it.p.toFixed(2) : it.p}` : '';
      el.title = it ? itemName(it.k, it.d) : '';
    }
    const k = `${sel}:${selItem?.id ?? ''}`;
    if (k !== this.selKey) {
      this.selKey = k;
      this.nameT = selItem ? 2.2 : 0;
      if (selItem) this.el.hbName.textContent = itemName(selItem.k, selItem.d) + (selItem.p > 0 ? ` — $${selItem.p.toFixed(2)} unpaid` : '');
    }
    this.nameT = Math.max(0, this.nameT - dt);
    this.el.hbName.classList.toggle('show', this.nameT > 0);
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
