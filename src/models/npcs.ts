// The cast: recognizable silhouettes for every NPC (hat, build, props, idle pose).
import type { Group } from 'three';
import { Character, type CharOpts } from './Character';

export type NpcId = 'cletus' | 'roscoe' | 'flo' | 'earl' | 'dusty' | 'bouncer' | 'generic';

const CAST: Record<NpcId, CharOpts> = {
  // Rusty's clerk: lanky old farmer, overalls, big white beard, straw-colored cowboy hat
  cletus: { kind: 'human', body: '#3f5a8a', pants: '#2f4770', hat: 'cowboy', hatColor: '#c9a66b', beard: '#eeeeee', skin: '#d9a066', belly: 1.12, pose: 'read', vest: '#2f4770' },
  // Sheriff: tan uniform, aviators, mustache, badge, clipboard
  roscoe: { kind: 'human', body: '#c8b27a', pants: '#6d5a3a', hat: 'sheriff', hatColor: '#5d4037', shades: true, mustache: '#3e2723', badge: true, belly: 1.15, pose: 'notepad', skin: '#d9a066' },
  // Diner waitress: pink uniform, white apron, beehive, order pad
  flo: { kind: 'human', body: '#ec407a', pants: '#ad1457', hat: 'beehive', hatColor: '#8d6e63', apron: '#fafafa', glasses: true, skin: '#e8b98a', pose: 'notepad' },
  // Last Chance Gas clerk: grumpy trucker cap, glasses, big belly, wipes the counter
  earl: { kind: 'human', body: '#546e7a', pants: '#37474f', hat: 'trucker', hatColor: '#c62828', glasses: true, belly: 1.4, mustache: '#6d4c41', pose: 'wipe' },
  // Junkyard dealer: hardhat, grease-stained vest, gray beard, hands on hips
  dusty: { kind: 'human', body: '#8d6e63', pants: '#4e342e', hat: 'hardhat', hatColor: '#fbc02d', beard: '#9e9e9e', vest: '#ef6c00', belly: 1.1, pose: 'hips', skin: '#c68e5d' },
  // Casino bouncer: huge, black suit, shades, arms crossed
  bouncer: { kind: 'human', body: '#1a1a1d', pants: '#101012', shoes: '#000', shades: true, tie: '#b71c1c', belly: 1.3, height: 1.18, pose: 'cross', skin: '#a9744f' },
  generic: { kind: 'human', body: '#78909c' },
};

/** Build an NPC. Pass overrides for one-off clerks. Returns the animated root group. */
export function makeNpc(who: NpcId | string, over: Partial<CharOpts> = {}): Group {
  const base = CAST[who as NpcId] ?? CAST.generic;
  return new Character({ ...base, ...over, npc: true }).root;
}
