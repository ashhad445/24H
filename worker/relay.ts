// Cloudflare Worker version of server/relay.ts: same protocol, same pure forwarding, no game logic.
// Also serves the built client, so one Worker is the whole game (one URL, same-origin WebSocket).
// Also serves the built client, so one Worker is the whole game (one URL, same-origin WebSocket).
// One Durable Object ("hub") holds every room in memory; the Worker just hands it each WebSocket.
interface Env { HUB: DurableObjectNamespace; ASSETS: Fetcher }

const MAX_PEERS = 4;

interface Peer { id: number; name: string; ws: WebSocket; room: Room | null }
interface Room { code: string; hostId: number; peers: Map<number, Peer> }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    // everything that isn't a WebSocket is the built client (dist/), served as static assets
    if (req.headers.get('Upgrade') !== 'websocket') return env.ASSETS.fetch(req);
    return env.HUB.get(env.HUB.idFromName('hub')).fetch(req);
  },
};

export class Hub {
  rooms = new Map<string, Room>();
  nextId = 1;

  fetch(): Response {
    const pair = new WebSocketPair();
    const [client, ws] = [pair[0], pair[1]];
    ws.accept();
    const peer: Peer = { id: this.nextId++, name: 'Player', ws, room: null };
    ws.addEventListener('message', (e) => this.onMessage(peer, e.data));
    ws.addEventListener('close', () => this.leave(peer));
    ws.addEventListener('error', () => this.leave(peer));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws: WebSocket, obj: unknown) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  makeCode(): string {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c = '';
    do {
      c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
    } while (this.rooms.has(c));
    return c;
  }

  welcome(peer: Peer, room: Room) {
    const peers = [...room.peers.values()].map((p) => ({ id: p.id, name: p.name }));
    this.send(peer.ws, { t: 'welcome', id: peer.id, code: room.code, hostId: room.hostId, peers });
  }

  leave(peer: Peer) {
    const room = peer.room;
    if (!room) return;
    room.peers.delete(peer.id);
    peer.room = null;
    if (peer.id === room.hostId) {
      for (const p of room.peers.values()) { this.send(p.ws, { t: 'host-left' }); p.room = null; }
      this.rooms.delete(room.code);
    } else {
      for (const p of room.peers.values()) this.send(p.ws, { t: 'peer-leave', id: peer.id });
    }
  }

  onMessage(peer: Peer, raw: string | ArrayBuffer) {
    let m: any;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }

    if (m.t === 'create' && !peer.room) {
      peer.name = String(m.name ?? 'Host').slice(0, 16);
      const room: Room = { code: this.makeCode(), hostId: peer.id, peers: new Map([[peer.id, peer]]) };
      this.rooms.set(room.code, room);
      peer.room = room;
      this.welcome(peer, room);
      return;
    }

    if (m.t === 'join' && !peer.room) {
      const room = this.rooms.get(String(m.code ?? '').toUpperCase());
      if (!room) return this.send(peer.ws, { t: 'error', msg: 'Room not found' });
      if (room.peers.size >= MAX_PEERS) return this.send(peer.ws, { t: 'error', msg: 'Room is full (4 max)' });
      peer.name = String(m.name ?? 'Player').slice(0, 16);
      for (const p of room.peers.values()) this.send(p.ws, { t: 'peer-join', id: peer.id, name: peer.name });
      room.peers.set(peer.id, peer);
      peer.room = room;
      this.welcome(peer, room);
      return;
    }

    if (m.t === 'relay' && peer.room) {
      const room = peer.room;
      const out = JSON.stringify({ t: 'msg', from: peer.id, data: m.data });
      const to = m.to;
      for (const p of room.peers.values()) {
        if (p.id === peer.id) continue;
        if (to === 'all' || (to === 'host' && p.id === room.hostId) || to === p.id) {
          if (p.ws.readyState === 1) p.ws.send(out);
        }
      }
    }
  }
}
