// Room relay for Roadtrip Roulette. Pure message forwarding, no game logic.
// The first peer in a room is the host; the host runs the authoritative simulation.
// In production the same server also serves the built client from dist/ (one service, one URL).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? process.env.RELAY_PORT ?? 3001);
const MAX_PEERS = 4;
const DIST = resolve(process.cwd(), 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
};

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200).end('ok'); return; }
  if (!existsSync(DIST)) { res.writeHead(200, { 'content-type': 'text/plain' }).end('Roadtrip Roulette relay is running. (No dist/ build to serve.)'); return; }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${DIST}${'/'}assets`) || file.includes(`${DIST}\\assets`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': type, 'cache-control': cache });
  createReadStream(file).pipe(res);
});

interface Peer { id: number; name: string; ws: WebSocket; room: Room | null; alive: boolean }
interface Room { code: string; hostId: number; peers: Map<number, Peer> }

const rooms = new Map<string, Room>();
let nextId = 1;

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function makeCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  do {
    c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  } while (rooms.has(c));
  return c;
}

function peerList(room: Room) {
  return [...room.peers.values()].map((p) => ({ id: p.id, name: p.name }));
}

function welcome(peer: Peer, room: Room) {
  send(peer.ws, { t: 'welcome', id: peer.id, code: room.code, hostId: room.hostId, peers: peerList(room) });
}

function leave(peer: Peer) {
  const room = peer.room;
  if (!room) return;
  room.peers.delete(peer.id);
  peer.room = null;
  if (peer.id === room.hostId) {
    for (const p of room.peers.values()) { send(p.ws, { t: 'host-left' }); p.room = null; }
    rooms.delete(room.code);
    console.log(`[relay] room ${room.code} closed (host left)`);
  } else {
    for (const p of room.peers.values()) send(p.ws, { t: 'peer-leave', id: peer.id });
    console.log(`[relay] ${peer.name} left ${room.code}`);
  }
}

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  const peer: Peer = { id: nextId++, name: 'Player', ws, room: null, alive: true };
  ws.on('pong', () => { peer.alive = true; });

  ws.on('message', (raw) => {
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.t === 'create' && !peer.room) {
      peer.name = String(m.name ?? 'Host').slice(0, 16);
      const room: Room = { code: makeCode(), hostId: peer.id, peers: new Map([[peer.id, peer]]) };
      rooms.set(room.code, room);
      peer.room = room;
      welcome(peer, room);
      console.log(`[relay] ${peer.name} created ${room.code}`);
      return;
    }

    if (m.t === 'join' && !peer.room) {
      const room = rooms.get(String(m.code ?? '').toUpperCase());
      if (!room) return send(ws, { t: 'error', msg: 'Room not found' });
      if (room.peers.size >= MAX_PEERS) return send(ws, { t: 'error', msg: 'Room is full (4 max)' });
      peer.name = String(m.name ?? 'Player').slice(0, 16);
      for (const p of room.peers.values()) send(p.ws, { t: 'peer-join', id: peer.id, name: peer.name });
      room.peers.set(peer.id, peer);
      peer.room = room;
      welcome(peer, room);
      console.log(`[relay] ${peer.name} joined ${room.code}`);
      return;
    }

    if (m.t === 'relay' && peer.room) {
      const room = peer.room;
      const out = JSON.stringify({ t: 'msg', from: peer.id, data: m.data });
      const to = m.to;
      for (const p of room.peers.values()) {
        if (p.id === peer.id) continue;
        if (to === 'all' || (to === 'host' && p.id === room.hostId) || to === p.id) {
          if (p.ws.readyState === WebSocket.OPEN) p.ws.send(out);
        }
      }
    }
  });

  ws.on('close', () => leave(peer));
  ws.on('error', () => leave(peer));
});

// keep connections alive through hosting proxies (most drop idle sockets after ~60 s)
setInterval(() => {
  for (const ws of wss.clients) ws.ping();
}, 25000);

http.listen(PORT, () => console.log(`[relay] listening on :${PORT}${existsSync(DIST) ? ' (serving dist/)' : ''}`));
