// Title screen: host a room, join by code, or play solo.
import { CFG } from '../config';
import { Net } from '../net/Net';
import { LOOK_COLORS, LOOK_HATS, type Look } from '../player/Avatar';

/** What the player picked on the title screen. */
export const lobbyChoice: { look: Look; daily: boolean } = { look: { c: LOOK_COLORS[0], h: 'cap' }, daily: false };
const HAT_NAMES: Record<string, string> = { none: 'No hat', cap: 'Ball cap', cowboy: 'Cowboy hat', beanie: 'Beanie', bucket: 'Bucket hat', trucker: 'Trucker cap', party: 'Party hat', hardhat: 'Hard hat', sheriff: 'Sheriff hat', beehive: 'Beehive' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function runLobby(): Promise<Net> {
  const name = $<HTMLInputElement>('l-name');
  const code = $<HTMLInputElement>('l-code');
  const server = $<HTMLInputElement>('l-server');
  const status = $('l-status');
  const lobby = $('lobby');

  try { name.value = localStorage.getItem('rr-name') ?? ''; } catch { /* storage blocked */ }
  if (!name.value) name.value = `Bean${Math.floor(Math.random() * 900 + 100)}`;
  // dev (Vite on :3000) → separate relay on :3001; deployed → relay is the same server that served the page
  // VITE_RELAY_URL (build time) points a static deploy (Cloudflare Pages) at a separate relay Worker
  const relayUrl = (import.meta as any).env?.VITE_RELAY_URL as string | undefined;
  server.value = relayUrl
    ? relayUrl
    : location.port === '3000'
      ? `ws://${location.hostname || 'localhost'}:${CFG.RELAY_PORT}`
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  const params = new URLSearchParams(location.search);
  if (params.get('room')) code.value = params.get('room')!.toUpperCase();

  // bean colour + hat (remembered)
  const look = lobbyChoice.look;
  try {
    const saved = JSON.parse(localStorage.getItem('rr-look') ?? 'null');
    if (saved && LOOK_COLORS.includes(saved.c) && (LOOK_HATS as string[]).includes(saved.h)) { look.c = saved.c; look.h = saved.h; }
    else { look.c = LOOK_COLORS[Math.floor(Math.random() * LOOK_COLORS.length)]; look.h = LOOK_HATS[1 + Math.floor(Math.random() * 4)]; }
  } catch { /* storage blocked */ }
  const colors = $('l-colors'), hat = $<HTMLSelectElement>('l-hat'), route = $<HTMLSelectElement>('l-route');
  const paint = () => { for (const b of colors.children) b.classList.toggle('on', (b as HTMLElement).dataset.c === look.c); };
  for (const c of LOOK_COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', `Bean colour ${c}`);
    b.onclick = () => { look.c = c; paint(); };
    colors.append(b);
  }
  paint();
  for (const h of LOOK_HATS) hat.add(new Option(HAT_NAMES[h] ?? h, h));
  hat.value = look.h;
  hat.onchange = () => { look.h = hat.value; };
  try { route.value = localStorage.getItem('rr-route') === 'daily' ? 'daily' : 'random'; } catch { /* ignore */ }

  return new Promise((resolve) => {
    const done = (n: Net) => {
      lobbyChoice.daily = route.value === 'daily';
      try { localStorage.setItem('rr-name', name.value); localStorage.setItem('rr-look', JSON.stringify(look)); localStorage.setItem('rr-route', route.value); } catch { /* ignore */ }
      lobby.classList.add('hidden');
      resolve(n);
    };
    const go = async (mode: { create: true } | { join: string }) => {
      status.textContent = 'Connecting…';
      status.classList.remove('err');
      try { done(await Net.connect(server.value, mode, name.value.trim() || 'Bean')); }
      catch (e) { status.textContent = (e as Error).message + ' — is `npm run dev` running?'; status.classList.add('err'); }
    };
    $('l-host').onclick = () => go({ create: true });
    $('l-join').onclick = () => {
      const c = code.value.trim().toUpperCase();
      if (c.length !== 4) { status.textContent = 'Enter the 4-letter room code'; status.classList.add('err'); return; }
      go({ join: c });
    };
    $('l-solo').onclick = () => done(Net.solo(name.value.trim() || 'Bean'));
    // last run, for bragging rights
    try {
      const runs: { ending: string; miles: number; total: number; money: number }[] = JSON.parse(localStorage.getItem('rr-runs') ?? '[]');
      const last = runs[runs.length - 1];
      if (last) {
        const wins = runs.filter((r) => /DELIVERED|SHOWDOWN WON/.test(r.ending)).length;
        const won = runs.filter((r) => /DELIVERED|SHOWDOWN WON/.test(r.ending));
        const best = won.length ? ` Best delivery: $${Math.max(...won.map((r) => r.money)).toFixed(0)} left on the card.` : '';
        $('l-last').textContent = `Last run: ${last.ending.split(' — ')[0]} at mile ${Math.round(last.miles)} of ${last.total}, $${last.money.toFixed(0)} on the card. ${wins} of ${runs.length} runs delivered.${best}`;
      }
    } catch { /* storage blocked */ }
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('l-join').click(); });
  });
}
