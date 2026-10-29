// Procedural Web Audio: vehicle loops, road + ambience, one-shot SFX (optionally positional), the radio.
import { Radio, type TalkCtx } from '../audio/Radio';

/** Everything the per-frame mix needs. */
export interface AudioFrame {
  dt: number;
  rpm: number; running: boolean; load: number; horn: boolean;
  speed: number; // m/s (abs)
  brake: number; offroad: boolean; doorOpen: boolean;
  sizzle: number; flames: number; siren: number; wind: number;
  inRV: boolean; rvDist: number; // listener distance from the RV (m)
  night: number; // 0 day … 1 night
  radio: { on: boolean; station: number; signal: number; talk: TalkCtx };
}

export interface Volumes { master: number; vehicle: number; effects: number; radio: number }
export const DEFAULT_VOLUMES: Volumes = { master: 0.8, vehicle: 0.8, effects: 0.9, radio: 0.7 };

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Mixer buses: engine + horn, everything else, radio. */
  private vehicleBus!: GainNode;
  private sfxBus!: GainNode;
  private radioBus!: GainNode;
  private windGain!: GainNode;
  private vol: Volumes = { ...DEFAULT_VOLUMES };
  private engOsc1!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private hornGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private sizzleGain!: GainNode;
  private fireGain!: GainNode;
  private sirenGain!: GainNode;
  private roadGain!: GainNode;
  private roadF!: BiquadFilterNode;
  private gravelGain!: GainNode;
  private airGain!: GainNode;
  private squealGain!: GainNode;
  private exterior!: BiquadFilterNode; // muffles the vehicle when you're outside / far away
  private dest!: AudioNode; // where one-shots go (sfxBus, or a positional chain)
  radio: Radio | null = null;
  private lastThrottle = 0;
  private lastRpm = 0;
  private ambT = 0;
  private listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  /** Radio speech captions (HUD). */
  onCaption: (who: string, text: string) => void = () => {};
  private voice: SpeechSynthesisVoice | null = null;
  private voices: { dale: SpeechSynthesisVoice | null; mort: SpeechSynthesisVoice | null; pip: SpeechSynthesisVoice | null } = { dale: null, mort: null, pip: null };

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.vehicleBus = ctx.createGain(); this.vehicleBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.radioBus = ctx.createGain(); this.radioBus.connect(this.master);
    this.applyVolumes();

    // noise buffer
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // engine
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(g2).connect(this.engFilter);
    this.exterior = ctx.createBiquadFilter(); this.exterior.type = 'lowpass'; this.exterior.frequency.value = 20000;
    this.exterior.connect(this.vehicleBus);
    this.engFilter.connect(this.engGain).connect(this.exterior);
    this.engOsc1.start(); this.engOsc2.start();

    // horn: two detuned squares
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    for (const f of [349, 440]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      o.connect(hf); o.start();
    }
    hf.connect(this.hornGain).connect(this.vehicleBus);
    this.dest = this.sfxBus;

    // the radio
    this.radio = new Radio(ctx, this.radioBus, this.noiseBuf);
    this.radio.onSay = (text, who, vol) => this.say(text, who, vol);
    this.radio.onStop = () => { try { speechSynthesis.cancel(); } catch { /* no speech */ } };
    this.radio.isSpeaking = () => { try { return speechSynthesis.speaking; } catch { return false; } };
    this.pickVoice();

    // tires on asphalt, gravel off-road, wind rush, brake squeal
    const loop = (rate: number) => { const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; n.playbackRate.value = rate; n.start(); return n; };
    this.roadF = ctx.createBiquadFilter(); this.roadF.type = 'lowpass'; this.roadF.frequency.value = 300;
    this.roadGain = ctx.createGain(); this.roadGain.gain.value = 0;
    loop(0.6).connect(this.roadF).connect(this.roadGain).connect(this.exterior);
    const gf = ctx.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 1400; gf.Q.value = 0.8;
    this.gravelGain = ctx.createGain(); this.gravelGain.gain.value = 0;
    loop(0.8).connect(gf).connect(this.gravelGain).connect(this.exterior);
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 800; af.Q.value = 0.4;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0;
    loop(1).connect(af).connect(this.airGain).connect(this.exterior);
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0;
    const sq = ctx.createOscillator(); sq.type = 'triangle'; sq.frequency.value = 2350;
    const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 40;
    vib.connect(vg).connect(sq.frequency); sq.connect(this.squealGain).connect(this.exterior); sq.start(); vib.start();

    // sizzle + fire loops
    this.sizzleGain = ctx.createGain(); this.sizzleGain.gain.value = 0;
    const sz = ctx.createBufferSource(); sz.buffer = this.noiseBuf; sz.loop = true;
    const szf = ctx.createBiquadFilter(); szf.type = 'highpass'; szf.frequency.value = 3500;
    sz.connect(szf).connect(this.sizzleGain).connect(this.sfxBus); sz.start();
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    const fr = ctx.createBufferSource(); fr.buffer = this.noiseBuf; fr.loop = true; fr.playbackRate.value = 0.5;
    const frf = ctx.createBiquadFilter(); frf.type = 'lowpass'; frf.frequency.value = 600;
    fr.connect(frf).connect(this.fireGain).connect(this.sfxBus); fr.start();

    // police siren: a wailing tone swept by a slow LFO
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 800;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(so.frequency);
    so.connect(this.sirenGain).connect(this.sfxBus); so.start(); lfo.start();

    // wind / sandstorm: low rumbling noise
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wn = ctx.createBufferSource(); wn.buffer = this.noiseBuf; wn.loop = true; wn.playbackRate.value = 0.35;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.6;
    wn.connect(wf).connect(this.windGain).connect(this.sfxBus); wn.start();
  }

  /** Set mixer levels (0–1 each). Safe to call before init(). */
  setVolumes(v: Volumes) { this.vol = { ...v }; this.applyVolumes(); }
  get volumes() { return { ...this.vol }; }
  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // perceptual curve: slider² so the low end isn't all "loud"
    this.master.gain.setTargetAtTime(this.vol.master ** 2 * 0.9, t, 0.03);
    this.vehicleBus.gain.setTargetAtTime(this.vol.vehicle ** 2, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.effects ** 2, t, 0.03);
    this.radioBus.gain.setTargetAtTime(this.vol.radio ** 2, t, 0.03);
  }

  /** Listener pose for positional one-shots (world position + right vector). */
  setListener(x: number, y: number, z: number, rx: number, rz: number) { this.listener = { x, y, z, rx, rz }; }

  update(f: AudioFrame) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { rpm, running, load } = f;
    // outside, the RV is a muffled thing over there
    const near = f.inRV ? 1 : 1 / (1 + Math.max(0, f.rvDist - 3) / 9);
    const muff = f.inRV ? (f.doorOpen ? 9000 : 5200) : 2400 * near + 400;
    this.exterior.frequency.setTargetAtTime(muff, t, 0.1);
    const fire = Math.max(rpm, 1) / 30; // 4-cyl firing frequency
    this.engOsc1.frequency.setTargetAtTime(fire, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(250 + rpm * 0.25 + load * 600, t, 0.05);
    this.engGain.gain.setTargetAtTime(running ? (0.12 + load * 0.12) * near : 0, t, 0.08);
    this.hornGain.gain.setTargetAtTime(f.horn ? 0.14 * Math.max(near, 0.35) : 0, t, 0.015);
    const sp = Math.min(1, f.speed / 90);
    this.roadGain.gain.setTargetAtTime((f.offroad ? 0.1 : 0.22) * sp * near, t, 0.15);
    this.roadF.frequency.setTargetAtTime(180 + sp * 650, t, 0.2);
    this.gravelGain.gain.setTargetAtTime(f.offroad ? Math.min(1, f.speed / 20) * 0.28 * near * (0.7 + 0.3 * Math.random()) : 0, t, 0.05);
    this.airGain.gain.setTargetAtTime(sp * sp * (f.doorOpen || !f.inRV ? 0.3 : 0.09) * near, t, 0.2);
    this.squealGain.gain.setTargetAtTime(f.brake > 0.7 && f.speed > 2 && f.speed < 16 ? 0.025 * near : 0, t, 0.05);
    this.sizzleGain.gain.setTargetAtTime(f.sizzle * 0.05, t, 0.2);
    this.fireGain.gain.setTargetAtTime(f.flames * 0.35, t, 0.2);
    this.sirenGain.gain.setTargetAtTime(f.siren * 0.07, t, 0.2);
    this.windGain.gain.setTargetAtTime(f.wind * 0.5, t, 0.4);

    // backfire: lifting off the throttle at high rpm, or a big rev jump on a downshift
    if (running && this.lastThrottle > 0.6 && load < 0.15 && rpm > 3600 && Math.random() < 0.55) this.backfire(near);
    else if (running && this.lastRpm > 0 && rpm - this.lastRpm > 1500 && Math.random() < 0.5) this.backfire(near);
    this.lastThrottle = load; this.lastRpm = rpm;

    // desert ambience: crickets + coyotes at night, the odd bird by day
    this.ambT -= f.dt;
    if (this.ambT <= 0) {
      this.ambT = 0.12 + Math.random() * 0.25;
      const amb = f.inRV ? (f.doorOpen ? 0.5 : 0.18) : 1;
      if (f.night > 0.5 && Math.random() < 0.55) this.cricket(amb * 0.05 * f.night);
      if (f.night > 0.5 && Math.random() < 0.003) this.coyote(amb * 0.07);
      if (f.night < 0.3 && Math.random() < 0.02) this.bird(amb * 0.04);
    }

    // radio: it lives in the dash, so walking away makes it quieter and muffled
    const r = f.radio;
    this.radio?.update({
      on: r.on, station: r.station, signal: r.signal, talk: r.talk,
      level: f.inRV ? 1 : Math.max(0, 1 - f.rvDist / (f.doorOpen ? 35 : 18)) * (f.doorOpen ? 0.8 : 0.45),
      muffle: f.inRV ? 0 : f.doorOpen ? 0.55 : 0.9,
    });
  }

  private pickVoice() {
    try {
      const choose = () => {
        const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
        // neural / "natural" voices (Edge, Chrome online) sound far more human than the default ones
        const score = (v: SpeechSynthesisVoice) => (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|premium|enhanced/i.test(v.name) ? 2 : 0) + (/en-US|en-GB/.test(v.lang) ? 1 : 0);
        const best = [...vs].sort((a, b) => score(b) - score(a));
        const male = best.filter((v) => /david|guy|daniel|mark|george|ryan|james|male|fred|alex|eric|davis|brian|roger/i.test(v.name));
        const female = best.filter((v) => /aria|jenny|zira|hazel|susan|samantha|sonia|libby|michelle|ana|emma|female|karen|victoria/i.test(v.name));
        this.voices = { dale: male[0] ?? best[0] ?? null, mort: male[1] ?? male[0] ?? best[0] ?? null, pip: female[0] ?? best[1] ?? best[0] ?? null };
        this.voice = best[0] ?? null;
      };
      choose();
      speechSynthesis.addEventListener('voiceschanged', choose);
    } catch { /* no speech synthesis */ }
  }

  /** The radio talks: Web Speech (if available) + a HUD caption. */
  private say(text: string, who: string, level: number) {
    if (level < 0.12) return;
    this.onCaption(who, text);
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.volume = Math.min(1, this.vol.master ** 2 * this.vol.radio ** 2 * level * 1.2);
      if (u.volume < 0.02) return;
      u.rate = who === 'Pip' ? 1.06 : who === 'Mortimer Graves' ? 0.93 : 1.0;
      u.pitch = who === 'Desert Dale' ? 0.9 : who === 'Mortimer Graves' ? 0.8 : who === 'Pip' ? 1.12 : 1.0;
      const v = who === 'Pip' ? this.voices.pip : who === 'Mortimer Graves' ? this.voices.mort : who === 'Desert Dale' ? this.voices.dale : this.voice;
      if (v ?? this.voice) u.voice = (v ?? this.voice)!;
      speechSynthesis.speak(u);
    } catch { /* no speech synthesis */ }
  }

  private backfire(level: number) {
    const v = 0.55 * Math.max(level, 0.3);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const d = i * (0.07 + Math.random() * 0.06); this.noiseBurst(0.09, 250, v, d, 'lowpass'); this.tone(110, 50, 0.08, 'square', v * 0.4, d); }
  }
  private cricket(v: number) {
    const f = 4100 + Math.random() * 500;
    for (let i = 0; i < 3; i++) this.tone(f, f, 0.025, 'sine', v, i * 0.045);
  }
  private coyote(v: number) {
    this.tone(500, 1100, 0.6, 'triangle', v); this.tone(1100, 700, 0.9, 'triangle', v, 0.55);
    this.tone(520, 1150, 0.5, 'triangle', v * 0.5, 1.6); this.tone(1150, 650, 0.8, 'triangle', v * 0.5, 2.05);
  }
  private bird(v: number) {
    this.tone(2600, 3400, 0.12, 'sine', v); this.tone(3400, 2400, 0.16, 'sine', v, 0.14);
  }

  /** One-shot. With `at` (world position) it's quieter with distance and panned. */
  play(name: string, at?: [number, number, number]) {
    if (!this.ctx) return;
    if (at) {
      const L = this.listener;
      const dx = at[0] - L.x, dz = at[2] - L.z, d = Math.hypot(dx, dz);
      if (d > 150) return;
      const g = this.ctx.createGain(); g.gain.value = 1 / (1 + Math.max(0, d - 12) / 12);
      const p = this.ctx.createStereoPanner(); p.pan.value = d > 0.5 ? Math.max(-0.8, Math.min(0.8, (dx * L.rx + dz * L.rz) / d)) : 0;
      g.connect(p).connect(this.sfxBus);
      this.dest = g;
      setTimeout(() => { g.disconnect(); p.disconnect(); }, 6000);
    }
    try { this.oneShot(name); } finally { this.dest = this.sfxBus; }
  }

  private oneShot(name: string) {
    switch (name) {
      case 'click': this.noiseBurst(0.03, 3000, 0.25); break;
      case 'ratchet': for (let i = 0; i < 4; i++) this.noiseBurst(0.02, 2500, 0.2, i * 0.05); break;
      case 'shift': this.noiseBurst(0.06, 900, 0.3); break;
      case 'grind': this.noiseBurst(0.45, 4000, 0.35, 0, 'highpass'); break;
      case 'crank': for (let i = 0; i < 6; i++) this.noiseBurst(0.08, 300, 0.35, i * 0.14); break;
      case 'stall': this.tone(90, 40, 0.5, 'sawtooth', 0.2); break;
      case 'door': this.tone(220, 140, 0.25, 'triangle', 0.15); this.noiseBurst(0.08, 600, 0.3, 0.2); break;
      case 'cash': this.tone(1320, 1320, 0.12, 'sine', 0.2); this.tone(1760, 1760, 0.25, 'sine', 0.2, 0.1); break;
      case 'error': this.tone(200, 150, 0.25, 'square', 0.12); break;
      case 'grab': this.noiseBurst(0.05, 1200, 0.2); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noiseBurst(0.06, 700, 0.3, i * 0.12); break;
      case 'slap': this.noiseBurst(0.08, 2000, 0.6); break;
      case 'pop': this.tone(900, 300, 0.12, 'square', 0.2); this.noiseBurst(0.1, 3000, 0.4); break;
      case 'bang': this.noiseBurst(0.5, 300, 0.9, 0, 'lowpass'); break;
      case 'thump': this.tone(70, 40, 0.25, 'sine', 0.6); this.noiseBurst(0.12, 400, 0.4, 0, 'lowpass'); break;
      case 'clank': this.tone(1400, 1200, 0.15, 'triangle', 0.2); this.tone(2100, 1900, 0.1, 'triangle', 0.1); break;
      case 'hammer': this.tone(600, 500, 0.08, 'square', 0.25); this.noiseBurst(0.05, 2500, 0.4); break;
      case 'tape': this.noiseBurst(0.4, 2500, 0.25, 0, 'highpass'); break;
      case 'pour': this.noiseBurst(0.8, 900, 0.25); break;
      case 'whoosh': this.noiseBurst(0.7, 500, 0.7, 0, 'lowpass'); break;
      case 'sizzle': this.noiseBurst(0.5, 4000, 0.3, 0, 'highpass'); break;
      case 'honk': this.tone(420, 420, 0.35, 'square', 0.08); this.tone(520, 520, 0.35, 'square', 0.08); break;
      case 'nos': this.tone(160, 1100, 1.6, 'sawtooth', 0.28); this.noiseBurst(4.6, 2600, 0.5, 0, 'highpass'); this.noiseBurst(0.4, 300, 0.9, 0, 'lowpass'); break;
      case 'shot': this.noiseBurst(0.12, 1800, 0.9); this.noiseBurst(0.35, 400, 0.6, 0.02, 'lowpass'); this.tone(140, 40, 0.18, 'sine', 0.7); break;
      case 'bonk': this.tone(220, 60, 0.25, 'sine', 0.8); this.noiseBurst(0.12, 700, 0.7); for (let i = 0; i < 4; i++) this.tone(2400 - i * 200, 2600 - i * 200, 0.12, 'sine', 0.06, 0.3 + i * 0.15); break;
      case 'puke': this.tone(160, 90, 0.5, 'sawtooth', 0.25); this.noiseBurst(0.6, 600, 0.45, 0.1); this.noiseBurst(0.3, 400, 0.3, 0.8); break;
      case 'rumble': this.noiseBurst(1.8, 120, 0.9); this.tone(55, 35, 1.6, 'sawtooth', 0.25); for (let i = 0; i < 5; i++) this.noiseBurst(0.1, 900, 0.3, 0.3 + i * 0.25); break;
      case 'snore': this.tone(90, 70, 0.9, 'sawtooth', 0.12); this.noiseBurst(0.7, 300, 0.15, 0.1); this.tone(300, 500, 0.25, 'sine', 0.05, 1.2); break;
      case 'clack': for (let i = 0; i < 18; i++) this.tone(1800, 1600, 0.02, 'square', 0.08, i * (0.08 + i * 0.012)); break;
      case 'ding': this.tone(2093, 2093, 0.6, 'sine', 0.25); break;
      case 'giggle': for (let i = 0; i < 6; i++) this.tone(500 + (i % 2) * 120, 450, 0.09, 'sine', 0.18, i * 0.12); break;
      case 'coin': this.tone(1500, 1500, 0.05, 'square', 0.1); this.tone(2000, 2000, 0.12, 'square', 0.1, 0.05); break;
      case 'claw': this.tone(300, 320, 0.8, 'sawtooth', 0.05); this.tone(900, 700, 0.1, 'square', 0.08, 0.8); break;
      case 'alarm': for (let i = 0; i < 8; i++) this.tone(i % 2 ? 700 : 1100, i % 2 ? 1100 : 700, 0.3, 'square', 0.12, i * 0.3); break;
      case 'kiss': for (const t of [0.3, 0.9, 1.6, 2.1, 3.0]) { this.tone(900, 380, 0.07, 'sine', 0.3, t); this.noiseBurst(0.05, 3200, 0.12, t + 0.03, 'highpass'); } break;
      case 'camera': this.noiseBurst(0.05, 5000, 0.4); this.tone(2000, 2000, 0.08, 'sine', 0.15, 0.06); break;
      case 'bullhorn': this.tone(180, 220, 0.25, 'sawtooth', 0.25); this.tone(220, 160, 0.4, 'sawtooth', 0.25, 0.28); break;
      case 'jukebox': {
        const notes = [392, 440, 494, 587, 494, 440, 392, 330, 392, 440, 392, 294];
        notes.forEach((f, i) => { this.tone(f, f, 0.32, 'triangle', 0.12, i * 0.34); this.tone(f / 2, f / 2, 0.3, 'square', 0.05, i * 0.34); });
        break;
      }
      case 'scrub': for (let i = 0; i < 3; i++) this.noiseBurst(0.09, 1800, 0.25, i * 0.1); break;
      case 'yell': this.tone(320, 520, 0.18, 'sawtooth', 0.25); this.tone(520, 260, 0.35, 'sawtooth', 0.25, 0.18); break;
      case 'bell': for (let i = 0; i < 3; i++) this.tone(1568, 1568, 0.3, 'sine', 0.2, i * 0.15); break;
      case 'buzz': for (let i = 0; i < 2; i++) this.tone(180, 175, 0.18, 'square', 0.08, i * 0.26); this.tone(1320, 1320, 0.08, 'sine', 0.1, 0.55); break;
      case 'crunch': this.noiseBurst(0.35, 900, 0.7); this.noiseBurst(0.25, 2800, 0.35, 0.04, 'highpass'); this.tone(90, 45, 0.3, 'sine', 0.6); break;
      case 'moo': this.tone(150, 118, 0.9, 'sawtooth', 0.22); this.tone(300, 236, 0.9, 'triangle', 0.08); break;
      case 'hiss': this.noiseBurst(0.9, 5200, 0.28, 0, 'highpass'); for (let i = 0; i < 6; i++) this.noiseBurst(0.04, 6500, 0.12, 0.9 + i * 0.05, 'highpass'); break;
      case 'trainhorn': for (const [f, d] of [[311, 0], [370, 0], [466, 0], [311, 1.4], [370, 1.4], [466, 1.4]] as const) this.tone(f, f * 0.98, 1.1, 'sawtooth', 0.09, d); break;
      case 'scrape': this.noiseBurst(0.45, 3200, 0.16, 0, 'highpass'); this.tone(220, 180, 0.4, 'square', 0.03); break;
      case 'squawk': this.tone(700, 1300, 0.12, 'sawtooth', 0.18); this.tone(1300, 600, 0.18, 'sawtooth', 0.16, 0.12); this.tone(800, 1400, 0.1, 'square', 0.08, 0.32); break;
      case 'jackpot': for (let i = 0; i < 8; i++) this.tone(880 + i * 110, 880 + i * 110, 0.12, 'square', 0.12, i * 0.09); break;
    }
  }

  private noiseBurst(dur: number, freq: number, vol: number, delay = 0, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
