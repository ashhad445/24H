// Title screen: host a room, join by code, or play solo.
import { CFG } from '../config';
import { Net } from '../net/Net';

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
  server.value = location.port === '3000'
    ? `ws://${location.hostname || 'localhost'}:${CFG.RELAY_PORT}`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  const params = new URLSearchParams(location.search);
  if (params.get('room')) code.value = params.get('room')!.toUpperCase();

  return new Promise((resolve) => {
    const done = (n: Net) => {
      try { localStorage.setItem('rr-name', name.value); } catch { /* ignore */ }
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
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('l-join').click(); });
  });
}
