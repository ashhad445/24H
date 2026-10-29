var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// relay.ts
var MAX_PEERS = 4;
var relay_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (req.headers.get("Upgrade") !== "websocket") return env.ASSETS.fetch(req);
    return env.HUB.get(env.HUB.idFromName("hub")).fetch(req);
  }
};
var Hub = class {
  static {
    __name(this, "Hub");
  }
  rooms = /* @__PURE__ */ new Map();
  nextId = 1;
  fetch() {
    const pair = new WebSocketPair();
    const [client, ws] = [pair[0], pair[1]];
    ws.accept();
    const peer = { id: this.nextId++, name: "Player", ws, room: null };
    ws.addEventListener("message", (e) => this.onMessage(peer, e.data));
    ws.addEventListener("close", () => this.leave(peer));
    ws.addEventListener("error", () => this.leave(peer));
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  }
  makeCode() {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let c = "";
    do {
      c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");
    } while (this.rooms.has(c));
    return c;
  }
  welcome(peer, room) {
    const peers = [...room.peers.values()].map((p) => ({ id: p.id, name: p.name }));
    this.send(peer.ws, { t: "welcome", id: peer.id, code: room.code, hostId: room.hostId, peers });
  }
  leave(peer) {
    const room = peer.room;
    if (!room) return;
    room.peers.delete(peer.id);
    peer.room = null;
    if (peer.id === room.hostId) {
      for (const p of room.peers.values()) {
        this.send(p.ws, { t: "host-left" });
        p.room = null;
      }
      this.rooms.delete(room.code);
    } else {
      for (const p of room.peers.values()) this.send(p.ws, { t: "peer-leave", id: peer.id });
    }
  }
  onMessage(peer, raw) {
    let m;
    try {
      m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (m.t === "create" && !peer.room) {
      peer.name = String(m.name ?? "Host").slice(0, 16);
      const room = { code: this.makeCode(), hostId: peer.id, peers: /* @__PURE__ */ new Map([[peer.id, peer]]) };
      this.rooms.set(room.code, room);
      peer.room = room;
      this.welcome(peer, room);
      return;
    }
    if (m.t === "join" && !peer.room) {
      const room = this.rooms.get(String(m.code ?? "").toUpperCase());
      if (!room) return this.send(peer.ws, { t: "error", msg: "Room not found" });
      if (room.peers.size >= MAX_PEERS) return this.send(peer.ws, { t: "error", msg: "Room is full (4 max)" });
      peer.name = String(m.name ?? "Player").slice(0, 16);
      for (const p of room.peers.values()) this.send(p.ws, { t: "peer-join", id: peer.id, name: peer.name });
      room.peers.set(peer.id, peer);
      peer.room = room;
      this.welcome(peer, room);
      return;
    }
    if (m.t === "relay" && peer.room) {
      const room = peer.room;
      const out = JSON.stringify({ t: "msg", from: peer.id, data: m.data });
      const to = m.to;
      for (const p of room.peers.values()) {
        if (p.id === peer.id) continue;
        if (to === "all" || to === "host" && p.id === room.hostId || to === p.id) {
          if (p.ws.readyState === 1) p.ws.send(out);
        }
      }
    }
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-NPoWmH/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = relay_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-NPoWmH/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Hub,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=relay.js.map
