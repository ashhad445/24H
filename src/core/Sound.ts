// Procedural Web Audio SFX. Real samples replace these in Phase 6.

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private engOsc1!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private hornGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private radioGain!: GainNode;
  private sizzleGain!: GainNode;
  private fireGain!: GainNode;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

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
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();

    // horn: two detuned squares
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    for (const f of [349, 440]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      o.connect(hf); o.start();
    }
    hf.connect(this.hornGain).connect(this.master);

    // radio static bed
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0;
    const rn = ctx.createBufferSource(); rn.buffer = this.noiseBuf; rn.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1500; rf.Q.value = 0.7;
    rn.connect(rf).connect(this.radioGain).connect(this.master);
    rn.start();

    // sizzle + fire loops
    this.sizzleGain = ctx.createGain(); this.sizzleGain.gain.value = 0;
    const sz = ctx.createBufferSource(); sz.buffer = this.noiseBuf; sz.loop = true;
    const szf = ctx.createBiquadFilter(); szf.type = 'highpass'; szf.frequency.value = 3500;
    sz.connect(szf).connect(this.sizzleGain).connect(this.master); sz.start();
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    const fr = ctx.createBufferSource(); fr.buffer = this.noiseBuf; fr.loop = true; fr.playbackRate.value = 0.5;
    const frf = ctx.createBiquadFilter(); frf.type = 'lowpass'; frf.frequency.value = 600;
    fr.connect(frf).connect(this.fireGain).connect(this.master); fr.start();
  }

  update(rpm: number, running: boolean, load: number, horn: boolean, radio: boolean, sizzle = 0, flames = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fire = Math.max(rpm, 1) / 30; // 4-cyl firing frequency
    this.engOsc1.frequency.setTargetAtTime(fire, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(250 + rpm * 0.25 + load * 600, t, 0.05);
    this.engGain.gain.setTargetAtTime(running ? 0.12 + load * 0.12 : 0, t, 0.08);
    this.hornGain.gain.setTargetAtTime(horn ? 0.14 : 0, t, 0.015);
    this.radioGain.gain.setTargetAtTime(radio ? 0.025 : 0, t, 0.1);
    this.sizzleGain.gain.setTargetAtTime(sizzle * 0.05, t, 0.2);
    this.fireGain.gain.setTargetAtTime(flames * 0.35, t, 0.2);
  }

  play(name: string) {
    if (!this.ctx) return;
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
    src.connect(f).connect(g).connect(this.master);
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
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
