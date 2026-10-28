// Network transport. Browser build talks to the WebSocket relay in server/relay.ts.
// Solo mode runs with no socket: the local player is the host.
import type { GameMsg } from '../types';

export interface NetHandler {
  onMsg(from: number, data: GameMsg): void;
  onJoin(id: number, name: string): void;
  onLeave(id: number): void;
  onHostLeft(): void;
}

/** Trim floats to 3 decimals to keep snapshots small. */
const roundNums = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);

export class Net {
  myId = 1;
  hostId = 1;
  code = 'SOLO';
  names = new Map<number, string>();
  private ws: WebSocket | null = null;
  private handler: NetHandler | null = null;
  private queue: { from: number; data: GameMsg }[] = [];

  get isHost() { return this.myId === this.hostId; }
  get solo() { return this.ws === null; }

  static solo(name: string): Net {
    const n = new Net();
    n.names.set(1, name);
    return n;
  }

  static connect(url: string, mode: { create: true } | { join: string }, name: string): Promise<Net> {
    return new Promise((resolve, reject) => {
      const n = new Net();
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch (e) { reject(new Error('Bad server URL')); return; }
      n.ws = ws;
      let settled = false;
      const fail = (msg: string) => { if (!settled) { settled = true; reject(new Error(msg)); ws.close(); } };
      const timer = setTimeout(() => fail('Could not reach the relay server'), 5000);

      ws.onopen = () => {
        ws.send(JSON.stringify('create' in mode ? { t: 'create', name } : { t: 'join', code: mode.join, name }));
      };
      ws.onerror = () => fail('Could not reach the relay server');
      ws.onclose = () => { if (settled) n.handler?.onHostLeft(); else fail('Connection closed'); };
      ws.onmessage = (ev) => {
        let m: any;
        try { m = JSON.parse(ev.data); } catch { return; }
        switch (m.t) {
          case 'welcome':
            n.myId = m.id; n.hostId = m.hostId; n.code = m.code;
            for (const p of m.peers) n.names.set(p.id, p.name);
            settled = true; clearTimeout(timer); resolve(n);
            break;
          case 'error': clearTimeout(timer); fail(m.msg); break;
          case 'peer-join': n.names.set(m.id, m.name); n.handler?.onJoin(m.id, m.name); break;
          case 'peer-leave': n.names.delete(m.id); n.handler?.onLeave(m.id); break;
          case 'host-left': n.handler?.onHostLeft(); break;
          case 'msg':
            if (n.handler) n.handler.onMsg(m.from, m.data);
            else n.queue.push({ from: m.from, data: m.data });
            break;
        }
      };
    });
  }

  setHandler(h: NetHandler) {
    this.handler = h;
    for (const q of this.queue) h.onMsg(q.from, q.data);
    this.queue = [];
  }

  /** Send to the host. On the host this loops back immediately. */
  toHost(data: GameMsg) {
    if (this.isHost) this.handler?.onMsg(this.myId, data);
    else this.raw({ t: 'relay', to: 'host', data });
  }

  /** Send to every other peer. */
  broadcast(data: GameMsg) {
    if (this.ws) this.raw({ t: 'relay', to: 'all', data });
  }

  private raw(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj, roundNums));
  }
}
