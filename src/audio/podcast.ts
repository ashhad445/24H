// "The Void Cast": a very dark comedy podcast on the radio. Two hosts trade lines.
// Bits are short scripted exchanges; some react to what's happening on the road.
import type { TalkCtx } from './Radio';

export const MORT = 'Mortimer Graves';
export const PIP = 'Pip';
export type Line = [string, string];

const L = (m: string, p: string, ...rest: string[]): Line[] => {
  const out: Line[] = [[MORT, m], [PIP, p]];
  rest.forEach((t, i) => out.push([i % 2 === 0 ? MORT : PIP, t]));
  return out;
};

const BITS: Line[][] = [
  L(`Pip, my wife says I'm emotionally unavailable.`, `She's right. You're only available on weekends, and only after three drinks.`, `Fair. Put that on my tombstone.`, `We already put it on your tab.`),
  L(`I finally slept with my therapist.`, `Mort! That's unethical.`, `It was the only way to get a refund.`),
  L(`Pip, how do you pick up women at a funeral?`, `You don't. You wait for the widow to become single and available. That's called "patience."`, `That's called "a felony," Pip.`, `Potato, felony.`),
  L(`A man in Reno was caught selling weed to a cop. He said he thought it was a plant.`, `Of the cop kind or the weed kind?`, `Both. He had a lot of bad ideas that week.`),
  L(`My mother taught me everything I know about love.`, `Like what?`, `That it's temporary and expensive and sometimes arrives in a casket.`),
  L(`A listener asks: "Is it okay to cry during sex?"`, `Only if you're doing it right. Or wrong. Honestly, it's a coin flip with feelings.`, `Pip, you're an inspiration to the coroner's office.`),
  L(`I'd like to thank my ex for the experience.`, `Which one?`, `The experience of watching someone I love pack a bag at 3 a.m. We should all be so lucky.`),
  L(`Today's weather: a ninety percent chance of regret, with scattered showers of bad decisions.`, `And a cold front of your father's disappointment moving in from the east.`),
  L(`Pip, my doctor says I need to cut back on drinking, smoking, and sex.`, `Which one are you keeping?`, `The one that doesn't require a second person to walk out on me.`),
  L(`Folks, our sponsor tonight is Casket Direct. Because why wait for the discount?`, `Their slogan: "Coffins so comfy you'll die to try them."`, `Pip, that's a tort.`, `It's a coffin, Mort. It's a box with ambition.`),
  L(`I read that the human body is sixty percent water.`, `That's why when I get stabbed, I make a puddle and a poor decision.`),
  L(`Prostitution is the world's oldest profession, Pip.`, `Second oldest. The first is whoever invented the bill.`, `And third is the guy who walks in and says, "I thought this was a dentist."`),
  L(`Pip, what's the difference between a politician and a stray dog?`, `The dog has fleas but also loyalty.`, `That's the whole joke?`, `I'm saving the rest for the sentencing.`),
  L(`It's Friday night. Somewhere, a man is making a terrible decision with a stranger.`, `Mort, that's you. That's every Friday.`, `Yes. And God willing, it'll be the death of me.`),
  L(`New study: people who drink wine daily live longer.`, `Which is great news for the vineyards and the people who lived long enough to regret it.`),
  L(`I told my kid there's no Santa. He told me there's no daddy. We're even.`, `Mort, you're a monster.`, `I'm a realist with a mortgage.`),
  L(`My neighbour's a drug dealer. Nice guy. Never late with the product, never early with the apology.`, `Does he deliver?`, `Everything but justice.`),
  L(`Welcome back to The Void Cast, the only podcast recorded in a bunker, for a bunker.`, `Mort, it's a studio apartment. The bunker is metaphorical.`, `Pip, everything is metaphorical. That's what the void is for.`),
  L(`Today's topic: the afterlife. Is it real?`, `Great question. I called the afterlife for a comment and it left me on hold.`, `So, yes. Hell. It's hell. Customer service is hell.`),
  L(`A listener writes: "My doctor says I have six months to live." Pip, advice?`, `Tell him to book the dentist for month seven. Be efficient with your hope.`),
  L(`Let's talk road safety. Statistically, driving is the most dangerous thing most people do all day.`, `And you're doing it in a beater RV with a manual gearbox and a debit card shared by four idiots.`, `We believe in you. We believe in the statistics more.`),
  L(`Pip, what would your last meal be?`, `Gas station meat. Eaten slowly. Like a coward.`, `That's what's in the RV right now, isn't it.`, `Yes. And that's the point. The meat is always watching.`),
  L(`New study says the average person will spend a third of their life asleep.`, `And the other two thirds wishing they were.`, `Pip, that's the most hopeful thing you've said this month.`),
  L(`My therapist says I should try to live in the moment.`, `And how's the moment?`, `Short. Very short. It keeps ending.`),
  L(`Pip, I've been thinking about our legacy.`, `We have a podcast with eleven listeners and four of them are in a moving vehicle.`, `That's a legacy, Pip. That's four more than the vultures.`),
  L(`A fun fact about the desert: it's not empty. It's just full of things that are already dead.`, `Reassuring. Like a family reunion.`),
  L(`In other news, a man was arrested for stealing a hearse.`, `He said he was just trying to get ahead.`, `The hearse is currently on probation.`),
  L(`Pip, do you believe in fate?`, `I believe in the fine print. Fate is just the fine print with better lighting.`),
  L(`Our sponsor today is Dread, the app that sends you a push notification when something terrible is probably going to happen.`, `It's been going off nonstop since the nineties.`, `Dread. Because someone has to be ready.`),
  L(`Pip, what's your biggest fear?`, `Dying with unread emails.`, `That's a lie. You're afraid of the moths.`, `The moths know what they did.`),
  L(`A listener asks: "Is it normal to feel nothing at weddings?"`, `Only if you've been to the funerals first. Weddings are just funerals where everyone's dressed up and lying about the future.`, `And there's cake.`, `And there's cake. The cake is real. That's the only thing that's real.`),
  L(`Today in history: nothing good happened. Come back tomorrow.`, `Tomorrow, nothing good will happen again. We're consistent.`),
  L(`Let's open the mailbag. "How do I stay positive in a world that's going downhill?"`, `Take the highway. It goes uphill. Eventually you'll get to the part where you coast.`, `Pip, that was a metaphor for death.`, `It was a metaphor for gas mileage. But also yes.`),
  L(`A new poll says most people would rather be remembered than be happy.`, `Most people also vote against flossing. Let's not put too much faith in people.`),
  L(`I think I saw my own ghost in the mirror today.`, `Was he older or younger?`, `Annoyingly, he looked well-rested.`),
  L(`The RV rental industry reports that every beater has at least one dead body in its history.`, `And at least one fuse that blew out on purpose to cover it up.`, `Allegedly.`, `Always allegedly. It's the only word keeping us out of court.`),
  L(`Pip, what's the secret to a long marriage?`, `Outliving your spouse. Strategically.`, `That's, uh, not what I was going to ask.`, `It's what I'm going to say. They're the same podcast.`),
  L(`Next up: a man tried to sue the sun for burning him. The sun has not responded.`, `The sun doesn't need a lawyer. The sun has a long game.`),
  L(`I read the entire terms and conditions on my life contract.`, `And?`, `No refunds. Also, you were already signed up before you could read it.`),
];

/** Context bits: the hosts notice what's happening to the crew. */
function reactions(c: TalkCtx): Line[][] {
  const out: Line[][] = [];
  if (c.storm > 0.3) out.push(L(`Listeners report a sandstorm. Pip, thoughts?`, `The desert is trying to sand you down into a smaller, more manageable problem.`, `That's the nicest thing it's ever done.`));
  if (c.shark) out.push(L(`Pip, there's a loan shark on the highway.`, `Pay him. Or don't. Either way you'll be remembered. Mostly by him.`, `That's a threat, isn't it.`, `That's accounting.`));
  if (c.cop) out.push(L(`The scanner says Sheriff Roscoe is on someone's tail.`, `Pull over. Nothing is as permanent as a speeding ticket, except the other thing.`, `Which other thing?`, `The one at the end of the road. We've been over this.`));
  if (c.hour >= 21 || c.hour < 5) out.push(L(`It's the dead of night, folks. Anyone still driving is either brave or has nowhere to be.`, `Or both. Bravery is just nowhere to be, with momentum.`, `Pip, that's good. Put it on a mug.`));
  if (c.total - c.mile < 25) out.push(L(`Listeners, you are almost at the wedding.`, `Enjoy the ceremony. It's the last time the two of them will agree on anything.`, `Pip!`, `I'm joking. They'll agree on a second thing. The divorce.`));
  if (c.lastText) out.push(L(`We got a text from a listener named Kevin, who says: "${c.lastText.replace(/[^\w\s',.?!-]/g, '')}"`, `Kevin sounds like a man who has never once enjoyed a Tuesday.`, `Kevin, if you're listening: the void is fine. Bring a jacket.`));
  return out;
}

export function podcastBit(r: () => number, c: TalkCtx): Line[] {
  const react = reactions(c);
  if (react.length && r() < 0.45) return react[Math.floor(r() * react.length)];
  return BITS[Math.floor(r() * BITS.length)];
}

/** Intro played when tuning in. */
export const PODCAST_INTRO: Line[] = [[PIP, `You're listening to The Void Cast.`], [MORT, `Nobody is coming to save us. Let's begin.`]];
