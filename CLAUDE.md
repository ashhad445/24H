# 🚐 Roadtrip Roulette — Master Game Plan (CLAUDE.md)

> **Pitch:** *How to Fish* meets *The Long Drive*. 1–4 friends have **24 hours** and a **shared $200 debit card** to drive an absolute beater of an RV across a procedural desert to a Vegas wedding — and they must show up with **at least $100 left on the card** for the wedding gift.

| | |
| :--- | :--- |
| **Genre** | Chill‑to‑Chaos co‑op physics comedy / shared‑wallet roguelite roadtrip |
| **Players** | 1–4 online co‑op (host‑authoritative). Multiplayer is core, not a late add‑on |
| **Perspective** | First‑person, physical "bean" avatars with 3D hands |
| **Inspirations** | *Gamble With Your Friends*, *How to Fish*, *Bombanana*, *The Long Drive*, *RV There Yet*, *Lethal Company* |
| **Platform** | Browser build for dev & playtests → PC (Steam) via Electron + steamworks.js |
| **Stack** | **Three.js + TypeScript + Vite** client · **Node + `ws`** relay server |
| **Session length** | One run ≈ 60 real minutes (24 in‑game hours) |

---

## 0. Engineering Rules (read first)

- **Run:** `npm run dev` starts the Vite client (port 3000) **and** the relay server (port 3001). `npm run typecheck` = `tsc --noEmit`.
- **Verify every change** with `npm run typecheck` and a live browser check. Open two tabs to test multiplayer.
- **Conventions:** right‑handed, +Y up, **−Z forward**. Units = meters / seconds. RV local space: origin at floor center, −Z toward the cab.
- **Single source of truth** for networked state: `GameState` on the host. Clients never mutate shared state directly; they send *intents* (`interact`, `grab`, `drive input`) to the host.
- **Diegetic UI.** No 2D buttons for vehicle controls / minigames. Debug tools only behind `?dev` URL flag.
- **No asset 404s.** Everything starts procedural; real `.glb` models get swapped in through `AssetLoader` later.
- **One phase at a time.** Don't start Phase N+1 until Phase N is fun.
- Keep modules small; one system per file in `src/<area>/`.

---

## 1. Revisions vs. the original plan (2026‑10‑28)

| # | Original | Revised | Why |
| :- | :--- | :--- | :--- |
| 1 | 48 in‑game hours | **24 in‑game hours** (1 real s = 24 game s → 60 real min) | Brief: "24 h to reach the wedding" |
| 2 | Win = reach chapel in time | Win = reach chapel in time **AND card balance ≥ $100** (wedding gift). Arrive broke = "Showed Up Empty‑Handed" fail ending | Brief: minimum balance. Makes every gamble/purchase a real decision |
| 3 | Distances literal (250 mi) | **Compressed miles:** odometer miles = world meters × `MILE_SCALE`. A leg ≈ 6–9 real minutes of driving | 250 literal miles at 60 MPH = 4 real hours of driving |
| 4 | Route mileage inconsistent (Mile 42 stop, Mile 140 fork, "I‑95") | Fixed 5‑leg route (see §10). LA→Vegas is **I‑15**, not I‑95 | Consistency |
| 5 | Networking in Phase 7 | **Networking skeleton in Phase 1.** Every system is written host‑authoritative from day one | Retrofitting netcode onto a physics game is the #1 project killer |
| 6 | WebRTC / Steam P2P | Browser: **WebSocket relay** (`server/`, rooms with 4‑letter codes). Transport behind an interface so Steam P2P can replace it | Simplest thing that works on LAN + internet |
| 7 | Rapier for everything | **Arcade kinematic RV** (custom bicycle model) + **custom lightweight prop physics** in RV-local space (`items/ItemPhysics.ts`: gravity, surfaces, walls, inertial pseudo-force). No Rapier | Hand-tuned feel, tiny net snapshots, no WASM, no jitter at speed. Revisit Rapier only if tumbling/stacking becomes a core need |
| 8 | Avatars sync fully on host | **Each client owns its own avatar pose** (sent in RV‑local space at 20 Hz). Host owns RV, props, economy, NPCs | Responsive movement, no input lag on walking |
| 9 | Kenney + custom GLBs already exist | **Start procedural**; import Kenney CC0 / Blender models later | Starting from scratch |
| 10 | Solo AI co‑pilot | Solo play allowed; difficulty eases (slower hunger, fewer breakdowns) when 1 player | Keep solo viable without AI work |

---

## 2. Core Concept & Fantasy

Your friend is getting married in Vegas in **24 hours**. The crew pooled **$200** on one physical debit card and rented the cheapest RV on the lot — a smoking 1980s Class‑C with a manual gearbox, sticky wipers, and a fuse box that pops if you look at it wrong.

**Everything is manual and physical:**
- One person **drives** (stick shift, handbrake, ignition key, wipers, lights).
- One **navigates** with a giant paper map that blows around if the door is open.
- Someone **cooks questionable gas‑station meat** in the back to keep the driver fed and awake.
- Someone **duct‑tapes the RV back together** mid‑drive.

When the money runs low, you pull into bizarre roadside stops — rigged slots, crab racing, scratch‑offs, siphoning gas — to fund the next 50 miles. But spend too much and you show up to the wedding with no gift.

## 3. Design Pillars
1. **Everything Is Physical.** Look at a switch, click it. Hold the card to pay. Carry the nozzle to the tank.
2. **Chill‑to‑Chaos.** Calm highway stretches punctuated by stacked disasters.
3. **Shared Wallet, Shared Blame.** One card, one balance, one receipt at the end assigning blame.
4. **Everyone Always Has a Job.** Driver, navigator, cook, mechanic.
5. **Friendship‑Ruining Comedy.** Physics, proximity voice, dumb decisions.
6. **One Phase at a Time.**

## 4. Core Loop
```
Highway Leg (drive · cook · navigate · repair)
   → Y‑Fork (pick exit on paper map)
   → Roadside Stop (spend: fuel/food/parts · earn: jobs/gambling/crime)
   → Card balance check (< $0 → Loan Shark hunts you)
   → next leg …
   → Mile 250 Chapel: before 24:00 and balance ≥ $100 → WIN
```
Lose: clock hits 24:00 · RV destroyed · stranded (no fuel, no money) · arrive with < $100.

## 5. Player Roles
| Role | Jobs | Failure |
| :--- | :--- | :--- |
| 🚗 Driver | Steer, throttle, H‑shifter R/N/1–5, handbrake, ignition, wipers, lights, horn | Crashes, stalls, overheating, hypnosis swerves |
| 🗺️ Navigator | Map, call exits, spot speed traps, radio | Wrong exit → longer route, more heat |
| 🍳 Cook | Fry patties, assemble burgers, feed driver, coffee, fight grease fires | Hangry / hypnotised driver, smoke |
| 🔧 Mechanic | Fuses, radiator, flat tires, refuel, duct tape | Lights out, steam, RV pulls sideways |

## 6. The Beater RV
1980s Class‑C. Cream `#f4efe6`, orange `#f0ad4e` / maroon `#d9534f` stripes. **2.8 m wide × 7.0 m long** (incl. cab nose), cabin floor y = 0.65 above ground.

**Interior (front → back):** Cockpit (driver seat left, navigator right, wheel, woodgrain dash with 4 analog gauges + gear LED, ignition, lights/wiper switches, radio, card tray, map) · floor console (H‑shifter, handbrake) · overcab loft · right‑side entry door · dinette · galley (stove + skillet, sink, fridge, extinguisher) · rear (fuse box, tools, rear window).

**Exterior:** chrome bumpers, headlights (real spotlights), clearance lights, mirrors, roof AC, ladder, spare tire, left fuel port, 4 wheels that steer and spin.

## 7. Driving & Vehicle Systems
| System | Spec |
| :--- | :--- |
| Transmission | `R N 1–7` (updated Phase 6: tops 30/56/84/114/146/178/208 MPH). Lugging below band, redline above |
| RPM | 0 off, ~820 idle, ~6200 limit |
| Ignition | Physical key; must be ON. Stalls if lugging hard in high gear at low speed |
| Handbrake | Physical lever |
| Fuel | 25 gal; burns with throttle × RPM. Empty → coast |
| Radiator | Rises under load; > 235 °F → steam, power loss |
| Windshield grime | Accumulates; 3D wipers clear it |
| Jolts | Potholes / rams inject Δv impulses into cabin props and players |
| Integrity | 0–100; collisions reduce; hammer / duct tape repair |

## 8. Passenger Jobs
- **Cooking:** raw → cooked → burnt (>135%) → grease fire. Extinguisher. Plate assembly (patty + bun + cheese). Hand‑feed driver.
- **Driver survival:** Hunger (hangry red pulse + throttle wobble), Road Hypnosis (vignette + micro‑swerves; cured by coffee/energy drink/slap/horn).
- **Repairs:** Popped fuse (jolt ≥ 0.8, 15% chance, then 120 s with no pops: `SURV.FUSE_CHANCE` / `FUSE_GRACE`) · overheated radiator (coolant jug) · flat tire (spare + lug wrench) · damage (hammer / duct tape).

## 9. Shared Debit Card Economy
- One physical card, **$200 start**, lives on the dash tray. Must be **held** to pay. Can be dropped / lost.
- Every transaction logged with *who* did it (for the receipt).
- **Overdraft (< $0)** → Loan Shark hunts the RV until balance ≥ $0.
- **Wedding gift minimum: $100** at the chapel (`WEDDING_MIN_BALANCE`, tunable).

| Action | Cost / Payout |
| :--- | :--- |
| Fuel | $2.50 / gal |
| Energy soda | −$4 → +25 stamina, +20 hunger |
| Burger kit (patty+bun+cheese) | −$6 |
| Scratch‑off | −$5 → 1:4 win $10, 1:20 win $50 |
| Lucky 777 slot | −$5 → pair +$15, triple +$100 |
| Crab Derby | −$15 → win +$45 (1 in 3) |
| Car wash job | +$35 |
| Diner burger‑flip shift | +$40 (costs ~1.5 in‑game h) |
| Pawn your stuff | +$10–60 per prop |
| Police ticket | −$50 |
| Siphon gas | Free +2 gal, 25% spotted (+1 heat) |
| Shoplift | Free if clerk isn't looking |

## 10. World & Route (revised)
250 compressed miles of procedural desert, LA → Vegas. Two‑lane highway along −Z. Endless chunk streaming. Each leg ends at a physical **Y‑fork** with overhead signs matching the paper map.

| Leg | Miles | Content |
| :- | :--- | :--- |
| 0 | 0 | **Rental Lot** — tutorial: grab keys & card, learn controls, leave the lot |
| 1 | 0 → 50 | Route 66 desert → **Rusty's Oasis Gas & Slots** (pumps, car wash, store w/ Cletus, backroom slots, crab derby, siphon target SUV) |
| 2 | 50 → 120 | **Fork A:** *I‑15 (smooth, +20 mi)* → **Lucky Scorpion Diner** (cheap food, burger‑flip job, jukebox) **vs** *Dead Man's Canyon (rough, −15 mi, rockfalls, no gas)* → **Canyon Junkyard** (pawn props, spare parts) |
| 3 | 120 → 190 | **Fork B:** **Roadside Motel** (sleep to restore stamina but lose time, ice machine) **vs** **Rusty Cactus Casino** (blackjack, roulette, high‑roller slots, bouncer) |
| 4 | 190 → 230 | Radar zones & Sheriff Roscoe heavy stretch → **Last Chance Gas** (expensive fuel $4/gal, pawn shop) |
| 5 | 230 → 250 | Vegas outskirts, traffic → **Desert Wedding Chapel** — drive through the arch |

**Time / weather:** clock drives sun (06:00 start → night → next morning). Headlights needed at night. Sandstorms & crosswinds on leg 2/4.

## 11. Side‑Hustles
- **Honest:** car wash (sponge, bucket, 8 splatters), burger flipping, fixing a local's car.
- **Fueling:** swipe card at pump → carry nozzle on stretchy hose to rear‑left fuel port → squeeze. Jerrycan for manual carry.
- **Gambling:** 3‑reel physical slots, Crab Derby (Pinchy / Claws / Old Bay), scratch‑offs, blackjack & roulette (casino).
- **Crime:** siphon timing bar (Suck → Pinch → Fill), shoplifting while Cletus isn't looking, lawn‑flamingo theft → heat.

## 12. Highway Chaos
| Threat | Trigger | Behaviour | Resolution |
| :--- | :--- | :--- | :--- |
| NPC traffic | Always | Sedans, pickups, campers both lanes | Drive well |
| Sheriff Roscoe | Heat > 0 | Lights + siren, tails, boxes in | Outrun to exit or pay $50 |
| Loan Shark | Balance < $0 | Matte‑black V8, rams / PIT | Balance ≥ $0 |

## 13. Characters
Crew (bean avatars, hats) · Groom (texts increasingly panicked messages to the radio/phone) · Rusty · Old Man Cletus · Sheriff Roscoe · Loan Shark · Tourist · Crabs Pinchy, Claws, Old Bay.

## 14. Items
Debit card · paper map · raw patty / bun / cheese / burger · soda / energy drink / coffee · fire extinguisher · fuse · duct tape · hammer · coolant jug · spare tire + lug wrench · fuel nozzle · jerrycan + siphon · sponge · scratch‑off · lawn flamingo.

## 15. Controls
| Context | Input | Action |
| :--- | :--- | :--- |
| On foot | WASD / Shift / Space | Walk / sprint / jump |
| | Mouse | Look |
| | E / LMB | Interact with 3D object / sit |
| | G | Drop held item |
| | Wheel / 1 2 3 | Switch hotbar slot (3 pockets) |
| | F / LMB | Use held item |
| Driver seat | W / S | Throttle / brake |
| | A / D | Steer |
| | E ↑ · Q ↓ | Upshift / downshift (driver interacts with the mouse only) |
| | N | Nitrous burst |
| | Space | Handbrake toggle |
| | H | Horn |
| | Mouse + LMB | Click dash switches / key / shifter |
| | F | Stand up |
| Any | Tab | Player list / room code |
| | Esc | Release mouse / pause menu |

## 16. HUD (diegetic first)
Center reticle + context prompt · top‑left clock (countdown to 24:00), odometer, card balance (crimson if < $100 gift line, flashing if < $0), hazard badges · bottom‑left vitals + held item · bottom‑center key hints · top‑right toasts · Tab: room code & players.

## 17. Audio
Procedural Web Audio (engine, road, ambience, SFX) + procedural radio stations (Phase 6). Real audio files later. 3D proximity voice (WebRTC, Phase 7), muffled through RV walls.

## 18. Multiplayer Architecture
- **Relay server** (`server/relay.ts`, Node `ws`): rooms keyed by 4‑letter code, max 4 peers, first peer = host. Pure relay — no game logic.
- **Host** runs the authoritative simulation: RV physics + controls, world, props, economy, NPCs, clock. Broadcasts **snapshots at 20 Hz** + reliable **events** (toasts, transactions, sounds).
- **Clients** send: own avatar pose (RV‑local or world, 20 Hz), driver inputs when seated as driver, interaction intents (`interact <id>`, `grab <id>`, `drop`). Clients interpolate snapshots (~100 ms buffer).
- **Seats** are host‑assigned (one driver at a time).
- Host migration: not supported (host leaves → run ends) — documented limitation.
- Transport interface `NetTransport` → swap `WebSocketTransport` for `SteamTransport` later.

## 18b. Hosting
- **Production = one Node service**: `npm run build` then `npm start`. `server/relay.ts` serves `dist/` over HTTP and the WebSocket relay on the same port (`PORT` env). The lobby auto-targets `wss://<same host>`; on Vite dev (:3000) it targets `ws://host:3001`.
- **Live: Cloudflare Worker (free plan, no card)** → **https://roadtrip-relay.weddingweed.workers.dev**
  - One Worker is the whole game. `worker/relay.ts` serves `dist/` as static assets and runs the relay on the same URL. The relay is a Durable Object (`Hub`), one instance holding every room, with the same protocol as `server/relay.ts`. Config: `worker/wrangler.toml`.
  - **Auto-deploy**: the Worker is connected to GitHub `ashhad445/24H` (Workers Builds).
    - Every push to `main` runs `npm run build`, then `npx wrangler deploy --config worker/wrangler.toml`, and goes live in a few minutes.
    - Other branches get preview builds; the live site only changes from `main`.
    - A failed build keeps the last good version live. Check the dashboard under `roadtrip-relay` → Deployments.
    - A deploy restarts the relay, which disconnects games in progress, so don't push while people are playing.
  - Manual deploy from a logged-in machine: `npm run deploy`.
  - Local test: `npm run relay:worker` (port 8787), then `npx tsx scripts/test-worker.ts [wss://host]`.
  - `VITE_RELAY_URL` (build time) points a client at a relay on another host. It is unset for the Worker, which uses the same host.
  - **Free plan limits** (as of 2026-10; check Cloudflare's docs). Going over doesn't bill you; requests just fail until the daily reset at 00:00 UTC.
    - Workers: 100k requests/day and 10 ms CPU per request. `run_worker_first` means every asset fetch counts, about 7 per page load. Each WebSocket connect is 1.
    - Durable Objects: 100k requests/day; 13,000 GB-s/day of duration; 5 GB storage (unused).
      - **Incoming WebSocket messages count as 1 request per 20.** Outgoing messages are free.
      - The hub stays in memory while any socket is open. 128 MB × 24 h ≈ 11,000 GB-s, so even round-the-clock play fits.
    - **The real ceiling is message volume.** Every client sends poses at 20 Hz and the host sends snapshots at 20 Hz.
      - 4 players ≈ 80+ msg/s ≈ 15k DO requests per hour, so about **6 hours of 4-player play a day**.
      - 2 players ≈ 12 h/day.
      - If that bites, lower the pose/snapshot rate or batch messages.
    - Workers Builds: 3,000 build minutes/month, one build at a time.
- **Old / alternatives**:
  - `npm run build && npm start` runs the Node relay that serves `dist/` (see above). `render.yaml` remains, but Render now wants a card.
  - For a quick playtest from this PC: `npx cloudflared tunnel --url http://localhost:3001`.
  - The Pages project `roadtrip-roulette-eoo` is a stale direct upload and can be deleted.
- Health check: `GET /health`. Server pings sockets every 25 s so proxies don't drop idle connections.

## 19. Win / Lose & Meta
- **Win:** through the chapel arch at Mile 250 before 24:00 with balance ≥ $100.
- **Endings:** *Just Married* (win) · *Missed It* (time) · *Empty‑Handed* (arrived broke) · *Totaled* (RV destroyed) · *Stranded*.
- **Receipt & Blame Board:** money lost at slots per player, burgers cooked/burnt, cars washed vs siphoned, fuses popped, final gift.
- **Unlocks (post‑MVP):** RV variants, paint, hats.

## 20. Technical Architecture
```
E:\24H
├── CLAUDE.md            ← this file
├── index.html
├── package.json / tsconfig.json / vite.config.ts
├── server/relay.ts      ← WebSocket room relay
└── src/
    ├── main.ts          ← boot, lobby, game loop
    ├── config.ts        ← all tuning constants
    ├── types.ts
    ├── core/   Input.ts · GameState.ts · Sound.ts · Clock.ts
    ├── net/    Net.ts (transport + host/client roles) · protocol.ts
    ├── rv/     RV.ts (hull, interior, dash) · Drivetrain.ts
    ├── world/  World.ts (sky, light, terrain, road chunks) · stops/*.ts
    ├── player/ Player.ts (local FP controller) · Avatar.ts (remote beans)
    └── ui/     HUD.ts · Lobby.ts
```

## 21. Art Direction
Bright chunky low‑poly toon desert, warm golden hour, ACES filmic tone mapping, soft shadows. Procedural meshes first; Kenney CC0 packs + Blender (`blender-mcp` available) to replace.

## 22. Roadmap
> Golden rule: polish one phase before starting the next.

### Phase 1 — RV Cabin, Driving Feel & Netcode Skeleton  ← **current**
- [x] Vite + TS + Three.js scaffold, relay server, lobby (host / join by code / solo)
- [x] Desert highway with chunk streaming, sky, lighting, time-of-day sun
- [x] RV hull + interior, walkable while moving (RV‑local transport), door, inertial jolts on players
- [x] Driver & navigator seats (E sit / F stand)
- [x] Manual drivetrain R/N/1–5, RPM, fuel, temp, stall, grind; ignition, handbrake, horn, wipers, lights, dome, radio
- [x] 4 analog gauges + gear LED, clickable 3D dash, live rear-view mirror
- [x] Remote bean avatars + RV snapshot sync (20 Hz, 100 ms interpolation)
- [x] Clock (24 h) + odometer + HUD
- [ ] Human playtest of the gate below (feel tuning: steering, jolt strength, gauge size)
- **Gate:** two players in one RV; one drives through gears, the other walks around the cabin at 70 MPH without jitter.

### Phase 2 — Cooking, Survival & Repairs  ← **built, needs human playtest**
- [x] Host-authoritative items (19 props + spare): grab (E), drop (G), throw (RMB), held in hand, synced
- [x] Prop physics in RV-local space: surfaces, walls, braking flings, pothole bounces, items can fly out the door
- [x] Galley: burner knob, skillet, cook raw → cooked (35 s) → burnt → grease fire; extinguisher (hold LMB) puts it out; coffee maker (20 s brew)
- [x] Burger assembly: patty + bun → burger (raw/burnt variants), + cheese → cheeseburger
- [x] Eat (LMB) or hand-feed another player (look at them + E). Hunger, stamina, caffeine
- [x] Driver hangry (throttle wobble + red pulse) and road hypnosis (eyelids + swerves, asleep at 100%). Cures: coffee, energy drink, horn, slap
- [x] Road hazards: potholes (jolts, damage, fuse pops), tire debris (blowouts). Deterministic per chunk
- [x] Repairs: fuse back into fuse box (or duct tape), coolant / energy drink into radiator (front grille), spare tire onto flat (4 bolts, RV stopped) or duct tape, hammer / tape the hull for integrity
- [x] HUD vitals (hunger, stamina, awake), held item, hazard badges, smoke overlay
- Tests: `npx tsx scripts/sim-phase2.ts`, `npx tsx scripts/sim-hazards.ts`
### Phase 3 — Rusty's Oasis (Mile 50)  ← **built, needs human playtest**
- [x] Physical shared debit card (starts on the dash tray); must be held to pay. Overdraft allowed to −$100, then DECLINED. Ledger of every transaction (host) for the receipt
- [x] Stop framework: stop-local layout (`stops/rusty.ts`), static colliders for players / props / RV (RV crashes into buildings), scenery clear-zones
- [x] Pumps: swipe card → authorized; nozzle on a sagging hose (snaps back past 7 m); hold at the RV fuel port (rear-left) to pump $2.50/gal; live pump display; jerrycan fill
- [x] General store: priced merchandise on display tables, checkout zone by the register (pay with the card), scratch-offs
- [x] Cletus: alternates watching / reading the paper; unpaid items leaving the building = stolen (+1 heat if he's watching)
- [x] Backroom: Lucky 777 slot (3 physical reels; pair = money back, triple $100, 777 $250), Crab Derby (bet $15 on Pinchy / Claws / Old Bay, winner pays $45)
- [x] Car wash job: sponge + bucket (5 scrubs per dip), 8 mud splats × 2 scrubs → +$35, new car in 50 s
- [x] Siphoning the stranger's SUV with the jerrycan (hold 3 s → +2 gal, 25% caught → +1 heat)
- [x] Driver HUD gear readout (Q ▼ / E ▲, speed, rpm bar)
- Deviations: siphon is hold-to-use instead of a timing-bar minigame; Cletus yells (+heat) instead of chasing — the chase lands with police in Phase 4
- Dev: `?dev` + **F9** teleports the RV to Rusty's. Test: `npx tsx scripts/sim-phase3.ts`
### Phase 4 — Highway Chaos  ← **built, needs human playtest**
- [x] NPC traffic (sedans, pickups, campers) in both lanes, host-simulated in road coordinates: cruise, stopping-distance following, overtaking through the oncoming lane when clear, oncoming cars swerve + honk if the RV is in their lane
- [x] RV vs traffic collisions (OBB): fender benders / head-ons → jolts, damage, wrecked NPC
- [x] Radar speed traps (limit 55, ticketed above 60) every few chunks, deterministic like hazards → +1 heat
- [x] Sheriff Roscoe: spawns ~25 s after heat > 0, chases with lights + siren, tails; stop the RV → he walks to the driver window → hand him the card = $50 (+$25 per extra heat, +$50 if you fled) and heat resets. Driving off mid-ticket = +2 heat and rams
- [x] Loan Shark: matte-black spiked muscle car spawns ~12 s after the card goes negative, rams every 8–12 s (speed + yaw kick, jolt, −4 integrity), bullhorn threats; peels off once balance ≥ $0
- [x] HUD warnings, siren audio, mirror shows pursuers
- [x] **Outrunning** (`CHASE` in `config.ts`): Roscoe tops out at ~175 mph and the shark at ~170, below the RV's ~198. Stay more than 280 m ahead for 8 s (after a 15 s grace) and you lose them. Losing Roscoe = −1 heat, and he's back in 75 s if heat is still above 0. The shark comes back after 60 s while the card is negative. The mafia Cadillac can't be outrun. Roscoe's "radios for backup" (+1 heat) only happens while he's within 120 m, at most once per chase, so escaping never adds heat. Test: `npx tsx scripts/sim-chase.ts`
- [x] Fix: cabin acceleration clamped to ~1.3 g and props can only leave through the open door (crashes used to fling everything through the walls)
- Tests: `npx tsx scripts/sim-phase4.ts`, `npx tsx scripts/sim-containment.ts`
### Phase 5 — Route, forks, night, weather, finale, stops  ← **built, needs human playtest**
- [x] Route model (`world/Route.ts`): road = base highway + per-fork lateral offsets, so the branch you drive down becomes the road. Host locks the branch 260 m past the split; choices sync in snapshots; World rebuilds chunks and hazards
- [x] Fork A (mile 100): I-15 (+20 mi, smooth) vs Devil's Canyon (−15 mi, cliffs, ×2.6 potholes, ×1.6 wind). Fork B (mile 170): Motel Row vs Cactus Strip (+5 mi). Overhead green gantries + gore chevrons; the untaken branch is drawn 1.6 km then fades
- [x] Paper map item (navigator dash): hold + M / click → parchment route map with forks, branch deltas, stops, YOU marker, time & money
- [x] Night: stars, moonlight, near-black hemisphere light → headlights matter; windshield grime lit correctly
- [x] Sandstorms (random, more on windy branches): brown sky, 75 m fog, blowing dust, grime build-up, wind audio; gusty crosswind pushes the RV sideways
- [x] Little Desert Chapel + neon heart arch at `chapelZ()` (moves with route choices); driving through it ends the run (JUST MARRIED vs EMPTY-HANDED)
- [x] HUD mile counter = progress miles / route total; volume mixer (Master / Vehicle / Effects / Radio) + mouse sensitivity in the Esc pause menu
- [x] 4-lane highway (2 each way, double yellow, dashed lanes, speed limit 65); RV tops out ~104 mph (0–60 ≈ 13 s)
- [x] Traffic rewrite: per-lane cars, overtaking within their side, keep-right, spaced spawns, wrecks limp to the shoulder, safe speed vs *every* obstacle ahead (no cut-out crashes). Fixed a feedback bug where cars drifted along curves (caused bunching + roaming)
- [x] Damage softened: crashes capped at −14, rams −1.6…−2, potholes −0.6×; Roscoe only rams if you fled a ticket
- [x] **Stop kit** (`stops/kit.ts`, `parts.ts`, `games.ts`, `defs.ts`, `Stops.ts`): a stop = frame (mile + branch) + parts. Parts: lot, building, table, pylon, decor, junk cars, shop + clerk (checkout zone, shoplifting), pumps (hose, tether, any price), pawn bin, vending, ice machine, motel bed, scrap loot, slot machine, roulette, blackjack, diner grill job, jukebox. Host activates a stop within 1.5 km once its branch is chosen; state lives in `shared.stops`
- [x] **Lucky Scorpion Diner** (I-15, mile 120): Flo's counter (burgers $8, cheeseburgers $10, coffee…), grill shift job ($8 per correctly cooked patty, 6 tickets), jukebox, booths
- [x] **Canyon Junkyard** (Devil's Canyon, mile 120): Dusty's pawn crate (sell anything: spare $45, extinguisher $18…), free scrap loot among wrecked cars, cola machine
- [x] **Roadside Motel** (Motel Row, mile 190): Room 6 — $40 to sleep 4 h (resets hypnosis, costs hunger + time), free ice (cools the radiator), energy vending, pool
- [x] **Rusty Cactus Casino** (Cactus Strip, mile 190): high-roller slots ($25 → $300 / $1000), penny slots, roulette ($10, red/black 2×, green 14×), blackjack ($20, 3:2 on naturals), bouncer, neon saguaro
- [x] **Last Chance Gas** (every route, mile 230): $4/gal pumps, Earl's overpriced store, pawn crate
- Dev: `game.tp(mile, [forkA, forkB])` teleports (host). Test: `npx tsx scripts/sim-stops.ts`
- Dev (`?dev`): F9 Rusty's · F10 next fork · F8 chapel · F7 sandstorm · F6 jump to 22:00 · F5 road encounter. Tests: `sim-phase5.ts`, `sim-parked.ts`
### Phase 6 — Audio, radio, juice  ← **built, needs human playtest**
- [x] Dash radio (`audio/Radio.ts`): power knob + tune knob, dial needle. 4 stations of procedurally generated, seeded songs — **KCAC 98.1 Cactus Country** (boom-chick, twang), **SURF 66.6 Reverb Rock** (tremolo lead, slapback), **MIRAGE 103.5 Smooth Lounge** (walking bass, pads, vibes), **KDST AM 1220 Desert Talk** (DJ Desert Dale: ads, weather, scanner news, reads the groom's texts). Tune in mid-song; DJ bumpers between songs
- [x] Radio voice = Web Speech API + on-screen captions. Reception: static in sandstorms / Devil's Canyon, AM better at night; muffled + quieter when you walk away from the RV
- [x] Groom texts (`net/Groom.ts`, host): Kevin texts on a timeline (escalating panic) + reactions (low balance, overdraft, cops, wreck, fire, storm, fork choices, almost there). Phone pop-ups + buzz, last texts on Tab
- [x] Sound: tire hum, gravel off-road, wind rush at speed, brake squeal, backfires, crash crunch; vehicle muffled from outside; positional stop/Rusty SFX (distance + stereo pan); crickets + coyotes at night, birds by day
- [x] Juice: speed FOV (+9° at 100 mph), speed vignette, cabin rumble (engine / road / gravel / flat), gear-shift camera kick, red damage flash, animated balance with flying +$/−$ chips, toast + text pop-in animations
- [x] **Model polish pass**: `models/Character.ts` (one procedural builder: bean + human, faces w/ blinking, arms/hands, hats, walk/sit/hold/eat/slap/wave animations, talk mouth) · `models/npcs.ts` cast (Cletus, Roscoe, Flo, Earl, Dusty, bouncer) · `rv/RVPolish.ts` (textured wood/vinyl/carpet, curtains, window trim, rounded roof rails, fender arcs, mirrors, plate; dents / rust / cracked windshield by integrity; flat tire shows rim) · traffic rebuilt from side-profile extrusions (sedan, pickup, camper, **semi** (new), cop, shark) with drivers, rolling wheels, brake lights, turn signals, hazards · item meshes (sesame burgers, extinguisher w/ gauge+hose, hammer, tape, jugs, cans, map, jerrycan)
- [x] RV acceleration raised ~65% (0–60 ≈ 7.5 s, top speed still ~104 mph)
- Dev: `game.dummy(id, pose)` spawns a fake crewmate
- [x] **Speed rework**: 6-lane highway (3 each way), speed limit **120 mph** (radar tickets above 127), **7-speed gearbox** (R N 1–7, tops 30/56/84/114/146/178/208 mph, ~198 mph real top, 0–60 ≈ 6 s), speedometer to 240. Route doubled to **500 base miles** (forks at 200 / 340, stops at 100 / 240 / 380 / 460; branch deltas ×2) so a run still takes about an hour; forks stretch (1500 m split, lock 650 m past), traffic 40–70 m/s with 3-lane overtaking + longer sight lines, chasers ~170–175 mph (outrunnable, see Phase 4). Stop frames sit beside the wider road
- [x] **Tires**: blowouts only from rare tire debris (2% of chunks), 60% chance per hit, plus a 90 s no-blowout grace after any flat or repair; potholes ~40% rarer
- [x] **Side mirrors**: live left/right mirror views beside the cab windows (rear-view mirror far plane fixed too). **Skull charm** hangs from the driver's mirror with pendulum physics (swings with accel/turns, streams back at speed) — rub it (E/click) for a random dark quote
- [x] **Radio podcast** — 5th station *VOID 91.3, The Void Cast*: Mortimer Graves + Pip trade very dark comedy bits (some react to storms, cops, the loan shark, night, groom texts)
- Fix: raycasts skip hidden objects (Roscoe's prompt no longer appears at the window when he's off-duty)
- [x] **Item physics**: real Coulomb friction (items stay put until pushed harder than their grip, carpet slicker than counters/dirt; hard landings shed sideways speed) so thrown items no longer skate across counters, plus soft item-item separation so loose props never pile up on one spot (`ItemPhysics.separate`)
- [x] **Speed cameras**: the limit (120) is only enforced by cameras now. Overhead gantries (`World.chunkRadar`, every 8 chunks, spans the road, red lenses) with yellow "SPEED CAMERA AHEAD 500/250 m" signs and a HUD countdown banner within 1400 m (turns red above the limit). Over 127 mph at a gantry = white flash + shutter sound + 1 heat. Everywhere else: floor it
- [x] **Radio hiss** quieted (baseline ~7× lower; only storms / canyon / tuning sweeps bring it up)
- [x] **Nitrous (NOS)**: blue tank on the dash with 3 charge lights, starts full (3 shots). Driver presses **N**: 5 s burn (+7 m/s², rev limiter lifted 25%, blue flame at the exhaust, FOV/blue vignette/rumble, 🔥 on the gear panel). Refill by pouring **Rocket fuel** (item `rocket`: $55 at Rusty's, $85 at Last Chance Gas) into the tank. Tunables: `NOS` in `config.ts`
- [x] **Rear-view mirror charm**: a tiny coffin (`charm2`, 20 dark-joke quotes in `CHARM2_QUOTES`) with the same pendulum physics as the skull
- [x] **Rocks**: roadside rock piles every other chunk (`World.chunkRocks`, 6 rocks each, view in `world/RockPiles.ts`, host tracks what's left). Pick up one at a time (E), stash them in the **rock bin** by the rear window (12 max; E to store / take out), open the **rear window hatch** (click the latch) and throw with RMB (32 m/s, light aim assist). 3 hits wreck Roscoe's cruiser: chase over, heat cleared, wreck towed after 14 s (`TrafficSim.hitCop`). Test: `npx tsx scripts/sim-phase7.ts`
- [x] **Plot change — the stash**: the crew now delivers a bag of weed (`weed` item, starts in the RV) to the wedding. Drive through the arch with it (within 25 m of the RV) = win; without it = "NO STASH". Miss 24:00 and the **Bonetti mafia** wakes up (`s.mafia.on`): a black Cadillac (the shark car, 4 bullets) chases non-stop and 6 goons wait at the chapel and shoot the RV. Win by delivering (even late) **or** killing every goon
- [x] **Pistol** (`pistol`, 12 rounds, LMB fires a hitscan ray; `GameMsg 'shoot'`): bought from **Vinnie** behind Rusty's ($120, ammo box $20). Cops take 3 hits, mafia cars 4, civilian cars wreck at once (+1 heat), goons 2
- [x] **Behind Rusty's**: Tammy ($25 favor — only the acceptor gets a ~6 s blackout + kiss sounds and drops to 25% hunger/stamina; 20 game-min cooldown). 3 junkers + the wash sedan + the SUV can be **stripped** (battery / catalytic converter / wheel, sold to Vinnie $40 / $90 / $30) or **siphoned** (3 charges each)
- [x] **3-slot inventory**: mouse wheel or 1/2/3 switches the item in hand (`slot:N` act, `ItemState.sl`, `CrewState.slot`)
- [x] Fixes: car-wash mud (transparent splats were skipped by the reticle ray), scratch-offs (LMB now uses them). Speed cameras every 20 chunks (5 km). 18 new dark billboards + **"SPEED UNTIL YOU DIE"** board (every 12 chunks): no cameras for 3 km after it (`noLimitAt`)
- [x] Radio: hiss almost gone, hosts use different (preferably neural) browser voices, podcast has a quiet music bed, new station KRYP 107.7, more dark jokes. Test: `npx tsx scripts/sim-phase8.ts`
- [x] **Crime has teeth** (`stops/chase.ts`, `chaseView.ts`, `CarHeist.ts`):
  - Cletus and every kit-shop clerk come after you with a bat when they see a theft. That includes eating or scratching unpaid stock inside the store, and stuff they notice missing when they look up from the paper. If they catch you, you black out and the stolen goods (`it.st`) are taken back.
  - Roscoe gets out of the cruiser (`cop.phase 5`) when the wanted player (`s.wanted`) is on foot, or when nobody pays within 20 s. His taser blacks you out and he takes the fine plus $25. If the RV drives off while he's out, that counts as fleeing.
  - Car stripping and siphoning are client minigames:
    - Siphon is **Suck & Pinch**: hold to suck, release in the green band.
    - Strip is **Wrench Timing**: click in the green arc, once per bolt.
    - The client sends `rusty:carN:ok|fail` to the host.
    - Pass → 90% clean (10% the owner spots you). Fail → +1 heat and a chase. Both games were made easier: wider green zones, a slower pointer and fill, and 3 siphon tries.
    - The wash car and the SUV have alarms.
  - The RV starts with 2 full 5-gal jerrycans. Test: `npx tsx scripts/sim-phase9.ts`
- [x] **Health, canyon dangers, crash physics, bribes, livelier stops** (test: `npx tsx scripts/sim-phase10.ts`):
  - **Health** (`CrewState.hp`, tunables `HP` in `config.ts`):
    - Hunger under 20% slowly drains it, and empty hunger drains it faster. A full belly regenerates it.
    - Crashes hurt anyone standing (not seated). Bonks and tasers cost 10. Raw or burnt food = puke + −15.
    - At 0 hp you pass out: blackout, wake on the RV floor at 35 hp, $40 "Desert Urgent Care" bill.
    - Vultures circle the RV while anyone is under 25 hp (`world/Vultures.ts`).
  - **Potholes** are bigger (r 0.8–1.4) with a grey patch, an orange spray-paint ring, cones, and hand-painted warning signs 200 m ahead ("HOAL" in the canyon).
  - **Devil's Canyon**:
    - Rockfall (`world/Canyon.ts`, `CanyonView.ts`): boulders drop off the cliffs ahead every 20–35 s and land on the road. Hitting one costs 10 integrity; one landing on the roof costs 15.
    - Bandits (`TrafficSim.stepBandits`): 50% once per canyon run. Two pickups overtake and park sideways as a roadblock with a couch. Stop near them for 2 s and they take all the money (half if you hand them food).
    - Ways past the bandits: ram through, squeeze by on the shoulder, or shoot (2 hits each).
  - **Crash physics** (`geom.obbMtv`, `TrafficSim.collide`):
    - The boxes push apart and trade momentum by mass. Masses: RV 5, sedan 1.4, semi 14.
    - Glancing hits twist the RV. Wrecked cars become free bodies that skid and spin, and light cars barrel-roll on big hits.
    - Buildings: the RV slides along walls instead of stopping dead.
  - **Bribes**: hand Roscoe food at the window.
    - A cheeseburger always works. A burger works if heat ≤ 2, coffee if heat ≤ 1.
    - Burnt or raw food gives +1 heat.
    - The stash: he hands it back, takes −1 heat, then tails you for 30 s, giggling on the bullhorn.
    - A drunk driver adds a $50 DUI.
  - **Speed cameras**:
    - Placement is deterministic: never inside a no-limit zone, never within 800 m of a stop. It no longer depends on loaded clear-zones.
    - They fire on crossing the gantry line, so no frame can skip one.
  - **Diner** (`stops/diner.ts`):
    - Checkered floor, red booths, stools, menu board, pie case, ceiling fans, neon EAT sign.
    - Regulars: a trucker, a couple, a guy asleep in his pancakes (snores), a kid kicking the booth, and a cowboy who hates the jukebox. A parked semi outside.
    - **Scorpion Challenge**: $15 for a 4-lb burger, 4 bites (7 s chew each) in 60 s. Win $40 and a spot on the Wall of Fame. Come hungry, or you might puke.
  - **Casino** (`stops/casino.ts`):
    - 4 more slots (Wedding Bells, Divorce 777).
    - Big Wheel: 2× / 5× / 10× / 🌵 cactus.
    - Dice table: real thrown dice. 7 or 11 pays 2×.
    - Coin pusher: slapping it can tilt it and get you bonked.
    - Claw machine: a one-button timing drop and a 40% grip.
    - A cocktail waitress with free drinks (drunk = wobbly camera + steering drift).
    - Elvis, a cashier cage, gamblers on "DAY 3", chandeliers, carpet.
    - The bouncer KOs anyone with 3 big wins in a row.
  - New poses `sit / eat / sleep / kick / slots / sing` in `models/Character.ts`. New items: scorpion burger, cocktail, cactus, stuffed scorpion, toy card, dice.
- [x] **Blender models** (`art/*.py` → `public/models/*.glb`; listed in `public/models/index.json`, loaded by `core/AssetLoader.ts`):
  - **Build:** run with the Blender MCP: `exec(open(r'E:\24H\art\people.py').read())`. `art/lib.py` holds the shared helpers; author in game coordinates with `G(x,y,z)`.
  - **Fallback:** everything stays procedural until the models load, or if a file is missing.
  - **Tinting:** materials named `tint_*` get recolored per use (shirt, skin, hat, trim, awning…).
  - **`desert.glb`:** saguaros, Joshua trees, barrel/prickly-pear cacti, rocks, shrubs, layered mesas, canyon cliffs, power pole. They are baked into vertex colors and instanced in `World` (`sceneryVariants`).
  - **`people.glb`:**
    - The human kit is split into parts at the same joints `Character` animates, so every pose still works. Parts: legs/boots, torso with belt, head with nose/ears/brows, arms with hands, gut.
    - Clothing: vest, apron, tie, badge.
    - Hair, beard, mustache.
    - Hats: cowboy, sheriff, cap, trucker, hardhat, beehive.
    - `Character.useKit()` swaps it in; eyes and mouth stay procedural.
  - **`buildings.glb`:**
    - Kit pieces: window, door frame, awning, cornice, plinth, pilaster, drain pipe, AC, vent, dish, wall lamp, bulb strings, casino portal.
    - Hero piece: a scorpion roof statue for the diner.
    - Yard props: dumpster, trash can, barrel, crate, tires, bench, picnic table, news box.
    - `stops/buildingKit.ts` `dressBuilding()` fits the kit to any `building()` rect and to Rusty's store. Colliders don't change. Signs move up to rooftop boards, walls get a plaster texture, and new options are `windows / pilasters / portal`.
  - Fixes: canyon cliffs no longer bury the Canyon Junkyard; sign text shrinks to fit instead of clipping.
- [x] **Stall fix, hotbar, food & fridges** (test: `npx tsx scripts/sim-shop.ts`):
  - **1–2 s freezes fixed.** Three.js recompiles every shader when the visible light count changes (a cop or the shark spawning, NOS, a grease fire, a stop entering/leaving range).
    - Local lights are `PoolLight` markers (`fx/LightPool.ts`); 4 real point lights follow the nearest ones, so the count never changes. **Never add a `THREE.PointLight`/`SpotLight` at runtime; use `PoolLight`.**
    - `fx/ShaderWarm.ts` `warm(obj)` pre-compiles (incl. the mirror render-target variant): the whole scene + every vehicle type + every item at start, each road chunk, and each kit stop (hidden until compiled).
  - **Hotbar**: Minecraft-style 3 slots, bottom center, icons (`itemIcon`), uses/gallons count, red unpaid price tag, item name pops up on switch.
  - **FOV slider** (60–110°) in the Esc menu, saved with the other settings.
  - **Caffeine buzz** (`food.boost`): coffee = +60 stamina, 150 s of sprint drain ×0.4 / refill ×2.2; energy drink = +35, 70 s at ×0.7 / ×1.5; candy bar = small 25 s buzz. ☕/⚡ timer on the stamina bar.
  - **New food**: bottled water (sobers you up), hot dog, gas-station burrito, beef jerky, chips, glazed donut, candy bar.
  - **Store fixtures** (`stops/dispensers.ts`): glass-door drinks fridge (open the door, take a drink), hot-dog roller, snack rack. Taking one puts it in your hand at its price; pay at the counter or steal it. Restock 1 per 90 s. At Rusty's (kit stop `rustyx` sharing Rusty's frame, so Cletus's checkout/theft rules apply), the Diner (fridge + donuts) and Last Chance Gas.
  - **RV fridge**: click to put food/drinks in (8 max) or take the last one out; door swings open, contents show on the shelves. Starts with a soda + 2 waters.
- [x] **Road encounters** (`road/Encounters.ts` director + `road/kinds/*.ts`, view `road/EncounterView.ts`, meshes `road/meshes.ts`; test: `npx tsx scripts/sim-road.ts`):
  - **Director** (host): one encounter every 55–100 s of driving (timer runs above 8 m/s, ×1.2 slower solo). Never two at once, never within 1.2 km of a stop / 2.2 km of a fork / 2.5 km of the chapel, not during bandits or the mafia, no repeat of the last 2 kinds. Spawns `clamp(speed × 14 s, 450, 1600)` m ahead so it's reachable at 200 mph. State: `s.enc` (`list`, `rider`, `weeds`, `rolling`, `cone`, `bird`).
  - **Traffic** brakes for and merges around encounter obstacles (`TrafficSim.obstacles`: cows, closed lanes, the flagger on STOP, lowered crossing gates).
  - **Hitchhiker**: stop within 25 m with the door open → they ride at the dinette. Drifter (poncho) pays $20 when leaving · shady guy (hoodie) steals a loose item · preacher (black suit) eases the driver's hypnosis · convict (orange jumpsuit) = +2 heat + Roscoe after a minute. They get out at the next stop, after 6 min, or when asked (`enc:rider`, RV stopped).
  - **Broken-down motorist**: hood up, hazards on. Bring the fuse / coolant / 2 gal of gas they need (or duct tape): $35–60 or a free item. Pistol = rob them for $40 (50% +1 heat).
  - **Cattle crossing**: 8–14 cows walk across. Horn = they bolt off the road. Hitting one: −6, big jolt, and a **rancher pickup** rams you up to 3 times (`TrafficSim.spawnRancher`).
  - **Tumbleweeds** (sandstorms): roll across the road; the ones that hit the cab stick to the windshield (max 5, +grime). Wipers knock one off every 1.6 s; or pull one off by hand while stopped (`enc:weed`).
  - **Ostrich**: races the RV on the shoulder (~42 mph). Throw it food → tamed; it follows, hops in through the open door, pecks standing players, and pays a $70 reward at the next stop.
  - **Lost suitcase**: run it over = clothes everywhere. Grab it and LMB to open: 35% cash, 35% an item, 20% a **rattlesnake** (item `snake`, slithers to the nearest standing player and bites −8; grab it and throw it out the door), 10% Hawaiian shirts.
  - **Road work**: 450 m zone, lanes 1–2 coned off, flagger with STOP (25 s) / SLOW (15 s), arrow board, workers, 45 MPH. Running STOP, speeding through, or making a worker dive = +1 heat each. Hit cones fly; 30% one jams under the bumper (scraping, drag) until a mechanic pulls it (`enc:cone`).
  - **Train crossing**: bells + flashers when you're ~9 s away, gates drop, a 22–36 car freight train crosses at 22 m/s. The engineer's horn (long-long-short-long, muffled by distance) carries ~2.5 km, so you hear the train before you see it. Train hits the RV = −35. Squeeze across first = "BEAT THE TRAIN". Snapping a gate in front of Roscoe = +1 heat.
  - New sounds: moo, hiss, train horn, scrape, squawk.
  - Dev (`?dev`): **F5** cycles encounter kinds ahead of the RV; `game.enc('train', 300)` forces one at a distance.
- [x] **Graphics pass** (in progress):
  - **Headless Blender**: `pip install bpy` (Blender 5.2 as a Python module) into a venv. `BPY_PY=<venv python> scripts/art-build.sh [names]` builds `art/*.py` → `public/models/*.glb` without the Blender app. `art/lib.py` reads `ART_OUT` / `ART_DIR`, so the same scripts still run in Blender via the MCP. `<venv python> art/preview.py <glb> out.png [filter] [cols] [--side|--fast]` renders a Cycles contact sheet for checking a model.
  - **Quality setting** (`fx/Graphics.ts`, Esc menu → Graphics):
    - Low: direct render, 1024 shadows, pixel ratio 1.
    - Medium: half-res bloom + grade, 2048 shadows.
    - High: full bloom, 4096 shadows, pixel ratio ≤ 2.
  - **Look**: sky reflections (a PMREM env map baked from the sky dome every 4 s, on at every quality so shaders never change), bloom, a warm color grade, vignette and grain. The composer renders the scene into a half-float target, which uses the same shader variant as the mirrors, so `warm()` still covers it.
### Phase 7 — Voice chat, cosmetics, player list polish, Return‑to‑RV
### Phase 8 — Chapel finale, receipt, Electron + Steam

## 23. Current Build Status
**2026‑10‑29 — Phase 6 built**: radio, groom texts, road/ambient audio, juice.

**2026‑10‑29 — Phase 5 complete**: all five new stops built on the stop kit.

**2026‑10‑29 — Phase 5 core built** (forks, map, night, sandstorms, chapel ending, 4-lane highway, traffic rewrite, volume menu).

**2026‑10‑29 — Phase 4 built** (traffic, radar, Roscoe, Loan Shark).

**2026‑10‑29 — Phase 3 built** (Rusty's Oasis). Food can now be restocked; money matters.

**2026‑10‑28 — Phase 2 built** (checklist above). Hazard pacing at 55 MPH: ~6 pothole jolts, ~1 fuse pop, ~5% integrity per 3 min. Hunger 100→0 in 12 min, hypnosis 0→1 in 4 min (×0.6 solo). Food runs out without Phase 3 shops.

**2026‑10‑28 — Phase 1 playable.**
- `npm run dev` → open http://localhost:3000 (add `?dev` for debug readout + `window.game` hook). Second player: open another tab, join with the room code (or `?room=CODE`).
- Headless drivetrain check: `npx tsx scripts/sim-drive.ts` (0–60 ≈ 18 s, ~38 compressed miles per 5 min at 60 MPH, ~5.7 gal per 5 min).
- Host keeps simulating in background tabs (rAF loop + 100 ms watchdog with substeps). Chrome throttles hidden tabs to ~1 Hz timers, so long host alt-tabs still degrade; a Web Worker sim is the real fix (later).
- Known gaps: road is flat (no potholes yet); drivers' input has one RTT of latency on clients (no prediction); seat prompt doesn't say who is sitting there.

## 24. Risks & Open Questions
| Risk | Mitigation |
| :--- | :--- |
| Physics jitter in a fast RV | RV‑local interior simulation |
| Netcode with many props | Host‑authoritative, sync only active props, interpolate |
| Browser → Steam | Electron + steamworks.js, test in Phase 7 |
| Scope creep | Phase gates; ship with 3–4 stop types |

Open: final name? · exact `WEDDING_MIN_BALANCE` ($100?) · monetisation · solo AI helper?
