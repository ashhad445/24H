// Kevin, the groom, texts the crew. Host-side: time milestones + reactions to what the crew is doing.
import { CFG } from '../config';
import type { SharedState } from '../types';
import { FORKS, progressMiles, totalMiles } from '../world/Route';

export const GROOM = 'Kevin 💍';

/** Elapsed-hour milestones. A function gets to look at the run so far. */
const TIMELINE: [number, (s: SharedState, prog: number) => string][] = [
  [0.02, () => 'DUDE. you guys are actually coming right?? ceremony is 6am tomorrow. Elvis is officiating 🙏'],
  [1.5, () => 'Tracy\'s mom asked if you\'re "the RV people". I said yes. don\'t make me regret it'],
  [4, (_s, p) => (p < 0.1 ? 'how far are you? like... out of LA yet??' : 'how\'s the drive?? send pics. not of the RV. of anything else')],
  [7, () => 'reminder: the gift table is a thing. Tracy is VERY into the gift table 🎁'],
  [10, (s) => (s.money >= CFG.WEDDING_MIN_BALANCE ? 'you still have the gift money right? right. obviously. just checking' : 'Tracy asked what you\'re getting us. I said "a surprise". please make it a surprise and not nothing')],
  [12, (_s, p) => (p < 0.4 ? 'halfway there right?? ...you\'re not halfway are you' : 'halfway!! I believe in you. mostly')],
  [15, () => 'rehearsal dinner happened without you. it was fine. everything is fine'],
  [18, (_s, p) => (p > 0.7 ? 'you\'re close!! I can feel it. or that\'s the 4 espressos' : 'ok so the best man speech. who\'s giving it if you\'re in the desert. asking for me')],
  [20, () => '4 hours. putting on my tux. is a powder blue tux too much. don\'t answer that'],
  [22, () => 'TWO HOURS. the officiant is an Elvis. he does NOT wait. he has a 7am'],
  [23, () => 'I can hear Elvis warming up. "a little less conversation" is not a good sign'],
  [23.6, () => 'if you\'re not here in 20 min I\'m doing this without a best man and I will tell EVERYONE why'],
];

export class Groom {
  private sent = new Set<string>();
  private lastFire = 0;
  constructor(private text: (msg: string) => void) {}

  private once(key: string, msg: string) {
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.text(msg);
  }

  step(s: SharedState, dt: number) {
    if (s.phase !== 'drive') return;
    const hours = s.clock / 3600;
    const prog = progressMiles(s.rv.z) / totalMiles();
    for (const [h, msg] of TIMELINE) if (hours >= h) this.once(`t${h}`, msg(s, prog));

    // reactions
    if (s.money < CFG.WEDDING_MIN_BALANCE) this.once('low', 'my bank app says the card is under $100?? why do I get notifications for your card. why is it going DOWN');
    if (s.money < 0) this.once('od', 'a man just called asking for "the RV people". he said "tick tock". who is that. WHO IS THAT');
    if (s.money > 300) this.once('rich', 'Tracy\'s cousin says she saw you on a casino jumbotron?? are you WINNING??');
    if (s.cop.phase === 1) this.once('cop', 'why is there a police scanner livestream about a beige RV');
    if (s.rv.integrity < 40) this.once('wreck', 'saw a pic of a smoking RV on the news. was that you. is that smoke. is that FIRE');
    if (s.cab.fire > 0.3) { this.lastFire += dt; if (this.lastFire > 8) this.once('fire', 'I smell burning. I\'m 200 miles away and I smell burning'); } else this.lastFire = 0;
    if (s.weather.storm > 0.6) this.once('storm', 'news says sandstorm out there. close the windows. close your MOUTHS');
    if (s.shark.on) this.once('shark', 'my cousin Vinnie says never borrow from Big Sal. please tell me you didn\'t borrow from Big Sal');
    const [a, b] = FORKS;
    if (s.route[a.id] === 1) this.once('canyon', 'DEVIL\'S CANYON?? Kyle went that way for his bachelor party. he lost a shoe. and a tooth');
    if (s.route[a.id] === 0) this.once('i15', 'I-15, good, smart, safe. this is the most responsible thing you\'ve ever done');
    if (s.route[b.id] === 1) this.once('casino', 'do NOT go into the casino. I know you. DO NOT');
    if (s.route[b.id] === 0) this.once('motel', 'a MOTEL?? are you SLEEPING?? I haven\'t slept in two days');
    const left = totalMiles() - progressMiles(s.rv.z);
    if (left < 3) this.once('close', 'I SEE HEADLIGHTS. IS THAT YOU. HONK IF ITS YOU');
  }
}
