// Two clients against `npm run relay:worker` (ws://localhost:8787): create, join, relay, host-left.
import { WebSocket } from 'ws';
const URL = process.argv[2] ?? 'ws://localhost:8787';
const open = (): Promise<{ ws: WebSocket; msgs: any[] }> => new Promise((res, rej) => {
  const ws = new WebSocket(URL); const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  ws.on('open', () => res({ ws, msgs })); ws.on('error', rej);
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(ms, 1500)));
const ok = (c: boolean, m: string) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const a = await open(); a.ws.send(JSON.stringify({ t: 'create', name: 'Host' })); await wait(300);
const code = a.msgs.find((m) => m.t === 'welcome')?.code; ok(/^[A-Z]{4}$/.test(code), `room code ${code}`);
const b = await open(); b.ws.send(JSON.stringify({ t: 'join', code, name: 'Guest' })); await wait(300);
ok(b.msgs.some((m) => m.t === 'welcome' && m.peers.length === 2), 'guest welcomed with 2 peers');
ok(a.msgs.some((m) => m.t === 'peer-join'), 'host sees peer-join');
b.ws.send(JSON.stringify({ t: 'relay', to: 'host', data: { hi: 1 } })); await wait(200);
ok(a.msgs.some((m) => m.t === 'msg' && m.data.hi === 1), 'guest→host relay');
a.ws.send(JSON.stringify({ t: 'relay', to: 'all', data: { yo: 2 } })); await wait(200);
ok(b.msgs.some((m) => m.t === 'msg' && m.data.yo === 2), 'host→all relay');
const c = await open(); c.ws.send(JSON.stringify({ t: 'join', code: 'ZZZZ', name: 'X' })); await wait(200);
ok(c.msgs.some((m) => m.t === 'error'), 'bad code rejected');
a.ws.close(); await wait(300);
ok(b.msgs.some((m) => m.t === 'host-left'), 'host-left on host close');
process.exit();
