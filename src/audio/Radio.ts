// The dash radio: four stations of procedurally generated music + a talk station.
// Everything is synthesized with Web Audio (no files). Songs are seeded, so they're stable per seed,
// but each player's radio runs on their own machine; only the station and power are shared state.
import { RADIO_STATIONS } from '../config';
import { PODCAST_INTRO, podcastBit, type Line } from './podcast';

type Genre = (typeof RADIO_STATIONS)[number]['genre'];
type Musical = Exclude<Genre, 'talk' | 'podcast'>;
const bedGenre = (g: Genre): Musical => (g === 'talk' || g === 'podcast' ? 'lounge' : g);

/** Mulberry32: small seeded RNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Song {
  genre: Genre;
  title: string;
  artist: string;
  bpm: number;
  root: number; // midi
  scale: number[]; // semitones
  chords: number[][]; // per bar, semitones from root
  bars: number;
  melody: (number | null)[]; // scale-degree index per 8th note, one 8-bar section
  swing: number;
}

// ---------- song generation ----------
const CH = {
  I: [0, 4, 7], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16], ii: [2, 5, 9],
  i: [0, 3, 7], iv: [5, 8, 12], Vh: [7, 11, 14], VI: [8, 12, 15], VII: [10, 14, 17], bII: [1, 5, 8],
  ii7: [2, 5, 9, 12], V7: [7, 11, 14, 17], Imaj7: [0, 4, 7, 11], VI7: [9, 13, 16, 19], iii7: [4, 7, 11, 14], IVmaj7: [5, 9, 12, 16],
};
const PROGS: Record<Musical, (keyof typeof CH)[][]> = {
  country: [['I', 'I', 'IV', 'I', 'V', 'IV', 'I', 'V'], ['I', 'IV', 'V', 'I', 'I', 'IV', 'V', 'I'], ['I', 'vi', 'IV', 'V', 'I', 'vi', 'V', 'I']],
  surf: [['i', 'i', 'VI', 'VII', 'i', 'i', 'VI', 'Vh'], ['i', 'iv', 'Vh', 'i', 'i', 'iv', 'Vh', 'Vh'], ['i', 'bII', 'i', 'bII', 'iv', 'Vh', 'i', 'Vh']],
  lounge: [['ii7', 'V7', 'Imaj7', 'VI7', 'ii7', 'V7', 'Imaj7', 'Imaj7'], ['Imaj7', 'VI7', 'ii7', 'V7', 'iii7', 'VI7', 'ii7', 'V7'], ['IVmaj7', 'iii7', 'ii7', 'Imaj7', 'IVmaj7', 'iii7', 'ii7', 'V7']],
};
const SCALES = { country: [0, 2, 4, 7, 9], surf: [0, 1, 4, 5, 7, 8, 10], lounge: [0, 2, 4, 7, 9, 11] };
const TITLES = {
  country: {
    a: ['My Truck', 'Mama', 'The Highway', 'My Ex', 'That Coyote', 'Whiskey', 'The Rodeo', 'My Dog', 'Grandpa\'s RV'],
    b: ['Left Me Too', 'Don\'t Call No More', 'Runs on Tears', 'Stole My Boots', 'Took the Long Way', 'Ain\'t Coming Home', 'Still Owes Me Money'],
    artists: ['Waylon Dusty', 'Patsy Rattlesnake', 'Hank "Two Gallons" Pruitt', 'The Tumbleweed Boys', 'Loretta Gasket', 'Billy Ray Buckle'],
  },
  surf: {
    a: ['Mojave', 'Tiki', 'Scorpion', 'Rocket', 'Sandstorm', 'Atomic', 'Cactus', 'Desert'],
    b: ['Stomp', 'Wipeout', 'Twang', 'Mirage', 'Drag Strip', 'Bikini', 'Undertow', 'Showdown'],
    artists: ['The Reverb Rattlers', 'Dick Dune & the Dry Heaves', 'The Saguaros', 'Los Twangeros', 'The Sun-Bleached Skulls'],
  },
  lounge: {
    a: ['Velvet', 'Midnight', 'Cocktail', 'Neon', 'Martini', 'Moonlight', 'Champagne', 'Lazy'],
    b: ['Oasis', 'in Henderson', 'Shuffle', 'Bossa', 'Daydream', 'at the Sands', 'for Two', 'Interlude'],
    artists: ['The Desert Mirage Trio', 'Smooth Sal Benedetto', 'Lou & the Loungers', 'The Velvet Cacti', 'Bobby Fontaine Orchestra'],
  },
};

export function makeSong(genre: Musical, seed: number): Song {
  const r = rng(seed);
  const t = TITLES[genre];
  const title = genre === 'surf' ? `${pick(r, t.a)} ${pick(r, t.b)}` : `${pick(r, t.a)} ${pick(r, t.b)}`;
  const prog = pick(r, PROGS[genre]);
  const scale = SCALES[genre];
  // an 8-bar melodic section with an AABA shape (2 bars per letter, 8th-note grid)
  const motif = () => {
    const out: (number | null)[] = [];
    let deg = Math.floor(scale.length * (1 + r()));
    const density = genre === 'lounge' ? 0.45 : genre === 'surf' ? 0.75 : 0.6;
    for (let i = 0; i < 16; i++) {
      if (r() < density || i === 0) {
        deg += pick(r, [-2, -1, -1, 0, 1, 1, 2, 3, -3]);
        deg = Math.max(0, Math.min(scale.length * 3 - 1, deg));
        out.push(deg);
      } else out.push(null);
    }
    return out;
  };
  const A = motif(), B = motif();
  const A2 = A.map((d, i) => (i >= 12 && d !== null ? Math.max(0, d - 1) : d)); // cadence variation
  return {
    genre, title, artist: pick(r, t.artists),
    bpm: genre === 'country' ? 96 + Math.floor(r() * 18) : genre === 'surf' ? 150 + Math.floor(r() * 22) : 72 + Math.floor(r() * 16),
    root: genre === 'country' ? pick(r, [55, 57, 52, 50]) : genre === 'surf' ? pick(r, [52, 57, 50]) : pick(r, [53, 58, 51]),
    scale, chords: prog.map((k) => CH[k]),
    bars: 24,
    melody: [...A, ...A2, ...B, ...A2],
    swing: genre === 'lounge' ? 0.18 : genre === 'country' ? 0.08 : 0,
  };
}

// ---------- talk radio ----------
export interface TalkCtx {
  hour: number; storm: number; heat: number; cop: boolean; shark: boolean; mile: number; total: number; lastText: string;
}
const DJ = 'Desert Dale';
export function talkLine(r: () => number, c: TalkCtx): string {
  const lines: string[] = [
    `This is ${DJ} on AM twelve-twenty, Desert Talk. If you can hear me, you're too far from anywhere.`,
    `Today's horoscope: Sagittarius, avoid casinos. Leo, avoid Sagittarius. Everyone else, check your oil.`,
    `Reminder from the Highway Patrol: the speed limit is sixty-five. Sheriff Roscoe says, and I quote, "I have a radar gun and nothing but time."`,
    `Rusty's Oasis, mile one hundred. Gas so cheap you'll wonder what's in it. Don't wonder. Just pump.`,
    `The Lucky Scorpion Diner wants you to know the meatloaf is, legally, food.`,
    `Caller on line two says his RV's fuse box popped and now the radio only gets this station. Sir, that is not a bug. That is a gift.`,
    `Fun fact: a grease fire doubles in size every thirty seconds. Another fun fact: the extinguisher is by the door.`,
    `The Rusty Cactus Casino. The house always wins, but the buffet is only nine ninety-nine.`,
    `Road hypnosis is real, folks. If the white lines start talking to you, pull over. Or honk. Honking helps everything.`,
    `Dusty at the Canyon Junkyard will buy anything. He bought my first marriage. Long story.`,
    `Coming up after the break: is the desert getting bigger, or are you just driving slower? Our expert says yes.`,
  ];
  if (c.storm > 0.3) lines.push(`Weather update: there's a sandstorm. You know there's a sandstorm. Wipers on, windows up, mouths closed.`);
  else lines.push(c.hour >= 19 || c.hour < 6 ? `Clear skies tonight, folks. Turn your headlights on. Your headlights. The knob on the left.` : `Weather: hot. Tomorrow: also hot. Ten-day forecast: we're in a desert.`);
  if (c.cop) lines.push(`Scanner traffic says Sheriff Roscoe is chasing a beige RV down the highway. If that's you: pull over, it's cheaper.`);
  else if (c.heat > 0) lines.push(`Word on the scanner is somebody's been naughty on this highway. Roscoe's got a list, and he checks it twice.`);
  if (c.shark) lines.push(`If a black muscle car with spikes is following you, that's not a fan. That's a creditor.`);
  if (c.lastText) lines.push(`We got a text from a listener named Kevin. Kevin writes: "${c.lastText.replace(/[^\w\s',.?!-]/g, '')}" Kevin, buddy, we're all rooting for you.`);
  const left = Math.max(0, Math.round(c.total - c.mile));
  if (left > 5) lines.push(`Las Vegas, ${left} miles. Elvis is in the building, and the building is a drive-through chapel.`);
  return pick(r, lines);
}
function bumper(r: () => number, call: string, freq: string, tag: string, last: Song | null) {
  const intro = last ? pick(r, [`That was "${last.title}" by ${last.artist}.`, `"${last.title}", ${last.artist}. Beautiful.`, `${last.artist} there with "${last.title}".`]) : '';
  const id = pick(r, [`${call} ${freq}, ${tag}.`, `You're listening to ${call}, ${freq}.`, `${tag}, ${call} ${freq}. Keep it between the lines.`]);
  return `${intro} ${id}`.trim();
}

// ---------- the radio ----------
export interface RadioFrame {
  on: boolean;
  station: number;
  signal: number; // 0 bad … 1 clear
  muffle: number; // 0 in the cab … 1 far outside through walls
  level: number; // 0 silent … 1 full (distance)
  talk: TalkCtx;
}

export class Radio {
  private music: GainNode;
  private duck: GainNode;
  private tone: BiquadFilterNode;
  private muffleF: BiquadFilterNode;
  private levelG: GainNode;
  private staticG: GainNode;
  private delay: DelayNode;
  private delayG: GainNode;
  private station = -1;
  private wasOn = false;
  private song: Song | null = null;
  private step = 0;
  private nextT = 0;
  private gapUntil = 0;
  private tuneBurst = 0;
  private talkNext = 0;
  private seed = (Math.random() * 1e9) | 0;
  private r = rng(this.seed);
  /** Spoken + captioned lines (DJ bumpers, talk). */
  onSay: (text: string, who: string, volume: number) => void = () => {};
  onStop: () => void = () => {};
  /** True while the browser voice is still talking (so lines don't overlap). */
  isSpeaking: () => boolean = () => false;
  private podQueue: Line[] = [];

  constructor(private ctx: AudioContext, out: AudioNode, private noiseBuf: AudioBuffer) {
    // music → "speaker" EQ → (muffle) → level → out
    this.music = ctx.createGain(); this.music.gain.value = 0.5;
    this.duck = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 4200;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 1.6); }
    shaper.curve = curve;
    this.muffleF = ctx.createBiquadFilter(); this.muffleF.type = 'lowpass'; this.muffleF.frequency.value = 20000;
    this.levelG = ctx.createGain(); this.levelG.gain.value = 0;
    // a little "spring reverb" slapback
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.16;
    this.delayG = ctx.createGain(); this.delayG.gain.value = 0.22;
    this.music.connect(this.duck);
    this.duck.connect(hp);
    this.duck.connect(this.delay); this.delay.connect(this.delayG).connect(this.delay); this.delayG.connect(hp);
    hp.connect(this.tone).connect(shaper).connect(this.muffleF).connect(this.levelG).connect(out);
    // static
    this.staticG = ctx.createGain(); this.staticG.gain.value = 0;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.5;
    n.connect(nf).connect(this.staticG).connect(this.muffleF); n.start();
  }

  /** Station metadata the HUD can show. */
  nowPlaying() {
    const st = RADIO_STATIONS[this.station];
    if (!st) return '';
    if (st.genre === 'talk') return `${st.call} ${st.freq} · ${DJ}`;
    if (st.genre === 'podcast') return `${st.call} ${st.freq} · The Void Cast`;
    return this.song ? `${st.call} ${st.freq} · "${this.song.title}" — ${this.song.artist}` : `${st.call} ${st.freq}`;
  }

  update(f: RadioFrame) {
    const ctx = this.ctx, now = ctx.currentTime;
    const on = f.on && f.level > 0.001;
    if (f.on && (!this.wasOn || f.station !== this.station)) this.tune(f.station);
    if (!f.on && this.wasOn) { this.onStop(); this.song = null; this.station = -1; }
    this.wasOn = f.on;

    const st = RADIO_STATIONS[this.station];
    this.tuneBurst = Math.max(0, this.tuneBurst - 1 / 60);
    // quiet bed of static; only bad reception (storms, canyon) or a tuning sweep brings it up
    const hiss = f.on ? Math.min(0.14, Math.max(0, 0.88 - f.signal) * 0.1 + this.tuneBurst * 0.16 + 0.0008) : 0;
    const flutter = f.signal < 0.6 ? 0.75 + 0.25 * Math.sin(now * 2.3) * Math.sin(now * 0.7) : 1; // fading reception
    this.staticG.gain.setTargetAtTime(hiss, now, 0.08);
    this.levelG.gain.setTargetAtTime(on ? f.level : 0, now, 0.15);
    this.music.gain.setTargetAtTime((st?.genre === 'talk' ? 0.12 : st?.genre === 'podcast' ? 0 : 0.5) * flutter * (this.tuneBurst > 0.2 ? 0.2 : 1), now, 0.1);
    this.muffleF.frequency.setTargetAtTime(20000 * (1 - f.muffle) + 700 * f.muffle, now, 0.1);
    if (!f.on || !st) return;

    // podcast: two hosts trade lines, no music
    if (st.genre === 'podcast' && now > this.talkNext && !this.isSpeaking()) {
      if (!this.podQueue.length) this.podQueue = [...podcastBit(this.r, f.talk)];
      const [who, text] = this.podQueue.shift()!;
      this.onSay(text, who, f.level * f.signal);
      this.talkNext = now + 1.2 + text.length * 0.06 + (this.podQueue.length ? 0.4 : 4 + this.r() * 6);
    }

    // talk station: the DJ talks over a quiet lounge bed
    if (st.genre === 'talk' && now > this.talkNext && !this.isSpeaking()) {
      const text = talkLine(this.r, f.talk);
      this.onSay(text, DJ, f.level * f.signal);
      this.talkNext = now + 3 + text.length * 0.068 + this.r() * 4;
    }

    // sequencer: schedule a little ahead (the watchdog may only call us every 100 ms)
    while (this.song && this.nextT < now + 0.35) {
      const s = this.song;
      const total = s.bars * 16;
      if (this.step >= total) {
        // song over: DJ bumper, short gap, next song
        this.gapUntil = this.nextT + 1.2;
        if (st.genre !== 'talk' && this.r() < 0.7) { const b = bumper(this.r, st.call, st.freq, st.tag, s); this.onSay(b, st.call, f.level * f.signal); this.duckFor(b.length * 0.07); }
        this.newSong(bedGenre(st.genre), 0);
        this.nextT = this.gapUntil;
        continue;
      }
      this.playStep(s, this.step, this.nextT);
      const sixteenth = 60 / s.bpm / 4;
      this.step++;
      this.nextT += sixteenth;
    }
  }

  private duckFor(sec: number) {
    const now = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(now);
    this.duck.gain.setTargetAtTime(0.35, now, 0.2);
    this.duck.gain.setTargetAtTime(1, now + sec, 0.6);
  }

  private tune(station: number) {
    this.onStop();
    this.station = station;
    this.tuneBurst = 0.7;
    const st = RADIO_STATIONS[station];
    if (!st) return;
    // tune in mid-song, like a real radio
    if (st.genre === 'podcast') { this.song = null; this.podQueue = [...PODCAST_INTRO]; this.talkNext = this.ctx.currentTime + 1.0; return; }
    this.newSong(bedGenre(st.genre), st.genre === 'talk' ? 0 : Math.floor(this.r() * 12) * 16);
    this.talkNext = this.ctx.currentTime + 1.2;
  }

  private newSong(genre: Musical, startStep: number) {
    this.song = makeSong(genre, (this.r() * 1e9) | 0);
    this.step = startStep;
    this.nextT = Math.max(this.ctx.currentTime + 0.05, this.nextT);
  }

  // ---------- instruments ----------
  private playStep(s: Song, step: number, t0: number) {
    const bar = Math.floor(step / 16) % s.chords.length;
    const pos = step % 16; // 16th within the bar
    const beat = pos / 4;
    const sixteenth = 60 / s.bpm / 4;
    const t = t0 + (pos % 2 === 1 ? s.swing * sixteenth * 2 : 0);
    const chord = s.chords[bar];
    const R = s.root;
    const section = Math.floor(step / 16) % 8;
    const intro = step < 16; // first bar: rhythm only

    // melody (8th grid) with downbeats snapped to chord tones
    const mel = (deg: number | null) => {
      if (deg === null) return null;
      const oct = Math.floor(deg / s.scale.length);
      let semi = s.scale[deg % s.scale.length] + 12 * oct;
      if (pos % 8 === 0) {
        const tones = chord.map((c) => c % 12);
        let best = semi, bd = 99;
        for (let d = -3; d <= 3; d++) { if (tones.includes((((semi + d) % 12) + 12) % 12) && Math.abs(d) < bd) { bd = Math.abs(d); best = semi + d; } }
        semi = best;
      }
      return R + 12 + semi;
    };

    if (s.genre === 'country') {
      if (pos % 4 === 0) this.kick(t, beat % 2 === 0 ? 0.32 : 0.0);
      if (pos === 4 || pos === 12) this.snare(t, 0.12, 0.09);
      if (pos % 2 === 0) this.hat(t, 0.03);
      // boom-chick bass: root on 1, fifth on 3, chord strums on 2 & 4
      if (pos === 0) this.bass(mtof(R - 12 + chord[0]), t, sixteenth * 3.5, 0.32);
      if (pos === 8) this.bass(mtof(R - 12 + chord[2] - 12), t, sixteenth * 3.5, 0.28);
      if (pos === 4 || pos === 12) chord.forEach((c, i) => this.pluck(mtof(R + c), t + i * 0.012, 0.25, 'triangle', 0.06, 1.0));
      if (!intro && pos % 2 === 0) { const m = mel(s.melody[(section * 8 + pos / 2) % s.melody.length]); if (m !== null) this.pluck(mtof(m), t, sixteenth * 2.6, 'sawtooth', 0.05, 1.03); }
    } else if (s.genre === 'surf') {
      if ([0, 6, 8, 14].includes(pos)) this.kick(t, 0.34);
      if (pos === 4 || pos === 12) this.snare(t, 0.2, 0.11);
      if (pos % 2 === 0) this.hat(t, 0.035, 9000);
      if (pos % 2 === 0) this.bass(mtof(R - 12 + chord[0] + (pos === 14 ? 7 : 0)), t, sixteenth * 1.7, 0.26, 'sawtooth');
      // tremolo-picked lead: every 16th re-picks the current 8th-grid note
      if (!intro) {
        const m = mel(s.melody[(section * 8 + Math.floor(pos / 2)) % s.melody.length]);
        if (m !== null) this.pluck(mtof(m), t, sixteenth * 0.9, 'square', 0.035, 1.0);
      } else if (pos % 4 === 0) this.pluck(mtof(R + chord[0]), t, sixteenth * 3, 'square', 0.03, 1.0);
    } else {
      // lounge: brushes, walking bass, soft pads, vibraphone lead
      if (pos === 0) this.kick(t, 0.16);
      if (pos === 4 || pos === 12) this.snare(t, 0.06, 0.22);
      if (pos === 0 || pos === 6 || pos === 8 || pos === 14) this.hat(t, 0.025, 6000);
      if (pos % 4 === 0) {
        const walk = [chord[0], chord[1], chord[2], chord[2] + 1][beat];
        this.bass(mtof(R - 12 + walk), t, sixteenth * 3.6, 0.28, 'sine');
      }
      if (pos === 0) chord.forEach((c) => this.pad(mtof(R + c), t, sixteenth * 15, 0.03));
      if (!intro && pos % 2 === 0) { const m = mel(s.melody[(section * 8 + pos / 2) % s.melody.length]); if (m !== null) this.bell(mtof(m + 12), t, 0.6, 0.05); }
    }
  }

  private env(t: number, dur: number, vol: number, attack = 0.004) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.music);
    return g;
  }
  private osc(type: OscillatorType, f: number, t: number, dur: number, out: AudioNode) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(out); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  private pluck(f: number, t: number, dur: number, type: OscillatorType, vol: number, bend: number) {
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
    lp.connect(this.env(t, dur, vol));
    const o = this.osc(type, f * bend, t, dur, lp);
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(f, t + 0.06); // country twang
  }
  private bass(f: number, t: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    lp.connect(this.env(t, dur, vol, 0.006));
    this.osc(type, f, t, dur, lp);
  }
  private pad(f: number, t: number, dur: number, vol: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.music);
    this.osc('triangle', f, t, dur, g);
    this.osc('sine', f * 1.003, t, dur, g);
  }
  private bell(f: number, t: number, dur: number, vol: number) {
    const out = this.env(t, dur, vol, 0.002);
    this.osc('sine', f, t, dur, out);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.3; g2.connect(out);
    this.osc('sine', f * 4, t, dur * 0.3, g2);
  }
  private kick(t: number, vol: number) {
    if (vol <= 0) return;
    const out = this.env(t, 0.18, vol, 0.002);
    const o = this.osc('sine', 130, t, 0.18, out);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  }
  private noise(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    src.connect(f).connect(this.env(t, dur, vol, 0.002));
    src.start(t, Math.random() * 0.8); src.stop(t + dur + 0.05);
  }
  private snare(t: number, vol: number, dur: number) { this.noise(t, dur, vol, 'bandpass', 2200); }
  private hat(t: number, vol: number, freq = 7500) { this.noise(t, 0.04, vol, 'highpass', freq); }
}
