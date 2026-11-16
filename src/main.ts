// Boot, lobby, and the main loop. The host runs HostSim; everyone renders the shared state.
import * as THREE from 'three';
import { CFG, DEV, PLAYER, PLAYER_COLORS, RV as RVDIM, gearInfo } from './config';
import { Input } from './core/Input';
import { Assets } from './core/AssetLoader';
import { Sound } from './core/Sound';
import { KINDS, buildItemMesh, itemName } from './items/Items';
import { ItemViews } from './items/ItemViews';
import { HostSim } from './net/Host';
import type { Net } from './net/Net';
import { Effects } from './fx/Effects';
import { LightPool } from './fx/LightPool';
import { initShaderWarm, warm } from './fx/ShaderWarm';
import { Avatar, type Look } from './player/Avatar';
import { Character } from './models/Character';
import { Player } from './player/Player';
import { RVModel } from './rv/RV';
import { RUSTY_FRAME, RUSTY_SET } from './stops/rusty';
import { RustyView } from './stops/RustyView';
import { CarHeist } from './stops/CarHeist';
import { TrafficView, vehicleSamples } from './traffic/TrafficView';
import { EncounterView } from './road/EncounterView';
import { ENC_KINDS } from './road/Encounters';
import { ChapelView } from './stops/ChapelView';
import { StopsView } from './stops/Stops';
import { MapView } from './ui/MapView';
import { FORKS, branchAt, chapelZ, forkZ, progressMiles, setRouteChoices, totalMiles } from './world/Route';
import type { EncKind, GameMsg, ItemState, Pose, Receipt, SharedState } from './types';
import { HUD } from './ui/HUD';
import { objective } from './ui/Objective';
import { lobbyChoice, runLobby } from './ui/Lobby';
import { Pings } from './ui/Pings';
import { setupSettings } from './ui/Settings';
import { Vultures } from './world/Vultures';
import { CanyonView } from './world/CanyonView';
import { LANE_OFFSET, World, clearHazardsBeyond, groundY, nextRadar, onRoad, roadPoint, roadX, roadYaw } from './world/World';
import { applyRunSeed, dailySeed, newRunSeed } from './world/RunSeed';
import { RockPiles } from './world/RockPiles';
import { Graphics } from './fx/Graphics';
import { MafiaView } from './traffic/MafiaView';

// ---------- renderer & scene ----------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 2500);
const lightPool = new LightPool(scene);
addEventListener('resize', () => {
  gfx.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fx.setScale(renderer.domElement.clientHeight * renderer.getPixelRatio(), camera.fov);
});

const world = new World(scene);
const gfx = new Graphics(renderer, scene, camera, world.skyMaterial, world.sun);
void Assets.preload(); // Blender models; everything falls back to procedural until they arrive
const rv = new RVModel();
scene.add(rv.root);
/** World-space dynamic objects (items and avatars outside the RV). */
const dyn = new THREE.Group();
scene.add(dyn);

// rear-view mirror (render target)
const mirrorRT = new THREE.WebGLRenderTarget(320, 104);
const mirrorCam = new THREE.PerspectiveCamera(40, 320 / 104, 0.5, 2500);
rv.mirrorAnchor.add(mirrorCam);
mirrorCam.rotation.x = -0.12;
const mirrorTex = mirrorRT.texture;
initShaderWarm(renderer, camera, scene, mirrorRT);
mirrorTex.colorSpace = THREE.SRGBColorSpace;
mirrorTex.repeat.x = -1; mirrorTex.offset.x = 1; // mirror flip
(rv.mirror.material as THREE.MeshBasicMaterial).map = mirrorTex;
(rv.mirror.material as THREE.MeshBasicMaterial).color.set('#ffffff');

// side mirrors: a camera at each mirror head looking back, rendered into the glass
const sideRT = [new THREE.WebGLRenderTarget(192, 320), new THREE.WebGLRenderTarget(192, 320)];
const sideCams = rv.sideMirrors.sideCams.map((c) => {
  const cam = new THREE.PerspectiveCamera(48, 192 / 320, 0.3, 2500);
  cam.position.set(c.x, c.y, c.z); cam.rotation.y = c.yaw; rv.body.add(cam);
  return cam;
});
const sideGlass = [rv.sideMirrors.sideGlass.left, rv.sideMirrors.sideGlass.right];
sideRT.forEach((rt, i) => {
  rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.repeat.x = -1; rt.texture.offset.x = 1; // mirror flip
  const m = sideGlass[i].material as THREE.MeshBasicMaterial; m.map = rt.texture; m.color.set('#ffffff');
});

const input = new Input(canvas);
const sound = new Sound();
const settings = setupSettings(sound, input, (q) => { gfx.setQuality(q); world.quality = q; fx.setScale(renderer.domElement.clientHeight * renderer.getPixelRatio(), camera.fov); });
canvas.addEventListener('mousedown', () => { const first = !sound.ctx; sound.init(); if (first) settings.reapply(); });
const hud = new HUD();
// interface sounds: every button and menu control clicks
document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('button, select, summary, input[type=range]')) sound.play('ui'); });
document.addEventListener('mouseover', (e) => { if ((e.target as HTMLElement).closest?.('button')) sound.play('tick'); });
sound.onCaption = (who, text) => hud.caption(who, text);
const player = new Player(camera, rv, scene);
player.statics.push(RUSTY_SET);
const rusty = new RustyView(scene);
const traffic = new TrafficView(scene, rv);
const chapel = new ChapelView(scene);
const vultures = new Vultures(scene);
const canyonView = new CanyonView(scene);
const encView = new EncounterView(scene, rv, (n, at) => sound.play(n, at));
const rockPiles = new RockPiles();
scene.add(rockPiles.group);
const mafiaView = new MafiaView();
scene.add(mafiaView.group);
const stopsView = new StopsView(scene, player.statics, (n, at) => sound.play(n, at));
const heist = new CarHeist(camera, (n) => sound.play(n));
const mapView = new MapView();
const avatars = new Map<number, Avatar>();
const raycaster = new THREE.Raycaster();
raycaster.camera = camera;
const fx = new Effects(rv, dyn);
gfx.setQuality(settings.gfx); world.quality = settings.gfx;
// GPU reset (driver timeout, tab out of video memory): three restores the context itself; rebuild the post targets too
canvas.addEventListener('webglcontextrestored', () => { gfx.setQuality(gfx.quality); console.warn('WebGL context restored'); });
canvas.addEventListener('webglcontextlost', () => console.warn('WebGL context lost'));
fx.setScale(renderer.domElement.clientHeight * renderer.getPixelRatio(), camera.fov);
const nozzlePos = new THREE.Vector3(), nozzleDir = new THREE.Vector3();

// render the world behind the lobby
const preview = new HostSim(() => {});
rv.update(preview.s.rv, preview.s.cab, 0);

const seen = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const isDescendant = (o: THREE.Object3D | null, of: THREE.Object3D) => { for (; o; o = o.parent) if (o === of) return true; return false; };

async function start() {
  const net: Net = await runLobby();
  const TIPS = ['The driver shifts with E and Q. Everyone else: keep them fed.', 'The card has to be in your hand to pay for anything.', 'Speed cameras are the only place the limit counts.', 'A cheeseburger settles most arguments with Sheriff Roscoe.', 'Coffee keeps the driver awake. So does a slap.', 'Out of gas? There are two jerrycans in the back.', 'Press T to ping something for the crew.'];
  hud.loading(true, TIPS[Math.floor(Math.random() * TIPS.length)]);
  await Assets.wait(5000);
  await new Promise((r) => setTimeout(r, 60)); // let the veil paint before the shader warm-up blocks the thread
  lobbyLoop = false;
  // compile everything up front (hidden stops, every car type, every item) so nothing stalls mid-drive
  const samples = new THREE.Group();
  samples.add(vehicleSamples());
  samples.add(EncounterView.samples());
  for (const k of Object.keys(KINDS)) samples.add(buildItemMesh(k));
  void warm(scene); void warm(samples);
  Assets.onReady(() => void warm(scene));
  rv.body.add(camera);
  hud.show();
  input.lock();

  const isHost = net.isHost;
  let shared: SharedState;
  let host: HostSim | null = null;
  const snaps: { t: number; s: SharedState }[] = [];
  const nameOf = (id: number) => net.names.get(id) ?? `Bean ${id}`;

  const applyEvent = (m: GameMsg) => {
    if (m.t !== 'ev') return;
    if (m.k === 'toast') hud.toast(m.text);
    else if (m.k === 'sfx') { sound.play(m.name, m.at); if (m.name === 'camera') hud.flash(); }
    else if (m.k === 'emote') avatars.get(m.who)?.char[m.what]();
    else if (m.k === 'text') { hud.text(m.from, m.text); sound.play('buzz'); }
    else if (m.k === 'jolt') player.jolt(m.mag);
    else if (m.k === 'fade' && m.to === net.myId) {
      hud.blackout(m.dur);
      if (m.ko) { heist.cancel(); player.stamina = Math.max(0, player.stamina - 30); }
      else { sound.play('kiss'); player.stamina = Math.min(player.stamina, 25); }
    }
    else if (m.k === 'fed' && m.to === net.myId) { player.stamina = Math.min(100, Math.max(0, player.stamina + m.stam)); if (m.boost) player.addBoost(...m.boost); }
    else if (m.k === 'puke' && m.to === net.myId) { hud.puke(); hud.hurt(0.3); }
    else if (m.k === 'wake' && m.to === net.myId) setTimeout(() => player.wakeInRV(), 2500); // moved while the screen is black
    else if (m.k === 'receipt') { receipt = m.r; hud.showReceipt(m.r); }
    else if (m.k === 'restart') resetRun();
  };
  let receipt: Receipt | null = null;
  let endShown = false, runSaved = false;
  const poses = new Map<number, Pose>();
  const looks = new Map<number, Look>();
  const pings = new Pings(rv, camera);
  const blankState = () => { const b = new HostSim(() => {}).s; b.items = []; return b; };

  /** Host: build a fresh simulation (a new road and stop layout, unless today's road was picked). */
  const startRun = () => {
    if (applyRunSeed(lobbyChoice.daily ? dailySeed() : newRunSeed())) clearHazardsBeyond(1e9);
    host = new HostSim((m) => { applyEvent(m); net.broadcast(m); }, (open) => rv.activeColliders(open));
    host.names = nameOf;
    host.handOf = handOf;
    for (const id of net.names.keys()) host.crew(id);
    shared = host.s;
  };
  /** Everyone: a new run started in this room. Drop everything left over from the last one. */
  const resetRun = () => {
    receipt = null; endShown = false; runSaved = false; snaps.length = 0;
    if (!host) shared = blankState();
    hud.hideReceipt(); heist.cancel(); mapView.toggle(false); pings.clear();
    flushViews();
    player.respawn();
    lastGear = 0; lastHP = 100; returnT = -1; lastDrive = ''; lastPose = '';
    hud.toast('🚐 New run, same crew. Try to keep the RV in one piece this time.');
    hud.intro();
    input.lock();
  };
  /** Feed every state-driven view an empty world once, so nothing from the last run lingers under a reused id. */
  const flushViews = () => {
    const b = blankState(), cam = camera.getWorldPosition(new THREE.Vector3());
    items.sync([], 0, {});
    traffic.update(0, b, cam, world.daylight);
    encView.update(b, 0, cam);
    canyonView.update(0, b);
    mafiaView.update(b);
    stopsView.update(b, 0, rv.root.position, () => null);
    rusty.update(0, b, rv.root.position, () => null, () => {});
  };

  /** World position of a player's hands, from their latest pose. */
  const handOf = (id: number): [number, number, number] | null => {
    const p = id === net.myId ? player.pose() : poses.get(id);
    if (!p) return null;
    if (!p.inRV) return [p.x, p.y + 1.2, p.z];
    const r = shared.rv; const c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    return [r.x + p.x * c + p.z * sn, p.y + 1.2, r.z - p.x * sn + p.z * c];
  };
  if (isHost) startRun();
  else shared = blankState();
  const items = new ItemViews(rv, dyn, camera, avatars, net.myId);
  items.setArmColor(lobbyChoice.look.c);
  const avatarOf = (id: number) => {
    let a = avatars.get(id);
    if (!a) { a = new Avatar(id, nameOf(id), rv, dyn, looks.get(id)); avatars.set(id, a); }
    return a;
  };
  const sendLook = () => net.broadcast({ t: 'look', c: lobbyChoice.look.c, h: lobbyChoice.look.h });

  const applyPose = (from: number, p: Pose) => {
    avatarOf(from).setPose(p);
    poses.set(from, p);
    host?.crew(from);
  };
  net.setHandler({
    onMsg(from, m) {
      if (m.t === 'pose') applyPose(from, m.p);
      else if (m.t === 'snap') {
        if (isHost) return;
        snaps.push({ t: performance.now() / 1000, s: m.s }); if (snaps.length > 30) snaps.shift();
        if (m.p) applyPose(from, m.p); // the host's own pose rides along with the snapshot
      } else if (m.t === 'chat') {
        if (typeof m.text === 'string' && m.text) { hud.chat(nameOf(from), m.text.slice(0, 120)); sound.play('buzz'); }
      } else if (m.t === 'look') {
        if (typeof m.c !== 'string' || typeof m.h !== 'string') return;
        looks.set(from, { c: m.c, h: m.h });
        avatars.get(from)?.setLook(looks.get(from));
      } else if (m.t === 'emo') {
        const c = avatars.get(from)?.char;
        if (m.what === 'wave') c?.wave(); else if (m.what === 'dance') c?.dance(); else if (m.what === 'cheer') c?.cheer();
      } else if (m.t === 'ping') {
        if (Array.isArray(m.p) && m.p.length === 3) { pings.add(nameOf(from), !!m.rv, m.p); sound.play('ding'); }
      } else if (m.t === 'ev') {
        if (!isHost) applyEvent(m);
      } else if (host) host.handle(from, m);
    },
    onJoin(id, name) { hud.toast(`${name} hopped in the RV`); host?.crew(id); sendLook(); },
    onLeave(id) {
      hud.toast(`${nameOf(id)} left`);
      avatars.get(id)?.dispose(); avatars.delete(id); looks.delete(id); poses.delete(id);
      host?.peerGone(id);
    },
    onHostLeft() { hud.toast('Host left — run over.'); shared.phase = 'ended'; shared.ending = 'The host left the RV.'; },
  });
  if (!net.solo) {
    hud.toast(isHost ? `Room code: ${net.code} — share it with your crew (Tab, or Esc → Copy invite link)` : `Joined room ${net.code}`);
    hud.invite(`${location.origin}${location.pathname}?room=${net.code}`);
    sendLook();
  }

  /** Client-side snapshot interpolation of the RV pose. */
  const interpolate = () => {
    if (!snaps.length) return;
    const rt = performance.now() / 1000 - CFG.INTERP_DELAY;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i - 1].t > rt) i--;
    const b = snaps[i], a = snaps[Math.max(0, i - 1)];
    const f = b.t === a.t ? 1 : THREE.MathUtils.clamp((rt - a.t) / (b.t - a.t), 0, 1);
    const latest = snaps[snaps.length - 1].s;
    const rvA = a.s.rv, rvB = b.s.rv;
    const L = (p: number, q: number) => p + (q - p) * f;
    let dy = rvB.yaw - rvA.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    shared = { ...latest, rv: { ...latest.rv, x: L(rvA.x, rvB.x), z: L(rvA.z, rvB.z), yaw: rvA.yaw + dy * f, speed: L(rvA.speed, rvB.speed), steer: L(rvA.steer, rvB.steer), rpm: L(rvA.rpm, rvB.rpm) } };
    while (snaps.length > 2 && snaps[1].t < rt) snaps.shift();
  };

  const act = (id: string, btn = 0) => net.toHost({ t: 'act', id, btn });
  if (DEV) (window as any).game = {
    net, get host() { return host; }, pings, player, rv, world, input, rusty, RUSTY_SET, avatars, camera, scene, renderer, sideRT, sideCams,
    /** Dev: spawn a fake crewmate in front of the camera (RV-local pose). */
    dummy(id = 2, p: Partial<Pose> = {}) {
      let a = avatars.get(id); if (!a) { a = new Avatar(id, 'Dev Bean ' + id, rv, dyn); avatars.set(id, a); }
      a.setPose({ inRV: true, x: 0, y: 0.65, z: 0, yaw: Math.PI, pitch: 0, seat: '', ...p } as Pose); return a;
    }, get shared() { return shared; }, act,
    /** Dev: start a road encounter ahead of the RV ('hitch', 'motorist', 'cattle', 'ostrich', 'suitcase', 'roadwork', 'train'). */
    roadPoint,
    enc(k: EncKind, ahead?: number) { if (!host) return null; host.s.enc.list = []; return host.enc.spawn(k, ahead === undefined ? undefined : host.s.rv.z - ahead); },
    /** Teleport the RV to a mile (host only), choosing fork branches first if given. */
    tp(mile: number, route?: number[]) {
      if (!host) return;
      if (route) { host.s.route = route.slice(); setRouteChoices(host.s.route); }
      const z = -mile / CFG.MILES_PER_METER, yaw = roadYaw(z), r = host.s.rv;
      r.x = roadX(z) + LANE_OFFSET * Math.cos(yaw); r.z = z - LANE_OFFSET * Math.sin(yaw); r.yaw = yaw; r.speed = 0;
      (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
    },
  };

  let devEnc = 0;
  let last = performance.now();
  let snapAcc = 0, poseAcc = 0, sprayAcc = 0, holdAcc = 0, frame = 0, fps = 0, fpsAcc = 0, fpsN = 0;
  let driveAcc = 0, lastDrive = '', lastPose = '', returnT = 0, chatOpen = false, lastStepN = 0, wasOnGround = true;
  /** Interactions that repeat while the button is held (pumping gas, siphoning). */
  const HOLD_IDS = new Set(['fuelport']);
  /** Clicking a parked car at Rusty's starts a minigame: jerrycan = siphon, empty hands = strip. */
  const startHeist = (i: number, held: { k: string; d: number } | undefined) => {
    const car = shared.rusty.cars[i];
    if (!car) return;
    const at = camera.getWorldPosition(new THREE.Vector3());
    if (held?.k === 'jerrycan') {
      if (car.gas <= 0) hud.toast('Bone dry. Somebody already got here.');
      else if (held.d >= 5) hud.toast('Jerrycan is full');
      else { heist.start('siphon', i, at); hud.toast('⛽ HOLD to suck… RELEASE when the gas hits the green band. Too long = mouthful.'); }
    } else if (!held) {
      if (car.parts <= 0) hud.toast('Nothing left but a shell.');
      else { heist.start('strip', i, at, ['battery', 'cat', 'wheel'][3 - car.parts], i < 2); hud.toast('🔧 CLICK when the red needle is in the green — one per bolt. Miss = CLANG.'); }
    } else hud.toast('Empty hands to strip it, or a jerrycan to siphon');
  };
  const fireWorld = new THREE.Vector3();
  let lastGear = 0, lastHP = 100, fov = settings.fov;
  camera.fov = fov; camera.updateProjectionMatrix();
  const camRight = new THREE.Vector3();

  /** Prompt + id for an interactable (shared by the reticle and the dev `nearby` listing). */
  const describe = (id: string, held: ItemState | undefined): { id: string; prompt: string; hull: boolean } => {
    const ctx = { held: held?.k ?? '', cab: shared.cab };
    if (id.startsWith('item:')) {
      const t = shared.items.find((i) => i.id === Number(id.slice(5)));
      if (!t || t.h !== -1) return { id: '', prompt: '', hull: false };
      if (!held) return { id, prompt: `Grab ${itemName(t.k, t.d)}${t.p > 0 ? ` — $${t.p.toFixed(2)} (unpaid)` : ''}`, hull: false };
      const pair = (x: string, y: string) => (held.k === x && t.k === y) || (held.k === y && t.k === x);
      if (pair('patty', 'bun') || pair('burger', 'cheese')) return { id, prompt: `Combine with ${itemName(t.k, t.d)}`, hull: false };
      return { id: '', prompt: '', hull: false };
    }
    if (id.startsWith('player:')) {
      const pid = Number(id.slice(7));
      if (held && KINDS[held.k]?.food) return { id, prompt: `Feed ${nameOf(pid)} the ${itemName(held.k, held.d)}`, hull: false };
      if (!held && pid === shared.seats.driver) return { id, prompt: `Slap ${nameOf(pid)} awake`, hull: false };
      return { id: '', prompt: '', hull: false };
    }
    if (id.startsWith('rocks:')) return { id, hull: false, prompt: held ? 'Hands full — drop it first' : '🪨 Grab a rock (throw them at the cops from the rear window)' };
    if (id === 'bandit') return shared.bandits.phase === 2 ? { id, hull: false, prompt: held ? `Toss the bandits your ${itemName(held.k, held.d)} (fed bandits only take half)` : '🤠 "WHATCHA GOT FOR US?" (hand them food)' } : { id: '', prompt: '', hull: false };
    if (id === 'roscoe') return { id, hull: false, prompt: held?.k === 'card' ? 'Hand Roscoe the card (pay the ticket)' : held ? `Offer Roscoe your ${itemName(held.k, held.d)} (bribe?)` : 'ROSCOE: "Card, please." (or try a cheeseburger)' };
    if (id === 'seat_driver' || id === 'seat_nav') {
      const who = shared.seats[id === 'seat_driver' ? 'driver' : 'nav'];
      if (who !== -1 && who !== net.myId) return { id: '', hull: false, prompt: `${nameOf(who)} is ${id === 'seat_driver' ? 'driving' : 'navigating'}` };
    }
    const prompt = id.startsWith('enc:') ? encView.promptFor(id, shared, held?.k ?? '') : id.startsWith('rusty:') ? rusty.promptFor(id, shared, ctx) : id.startsWith('stop:') ? stopsView.promptFor(id, shared, ctx) : rv.promptFor(id, shared.rv, ctx);
    return prompt ? { id, prompt, hull: false } : { id: '', prompt: '', hull: false };
  };

  /** What the reticle is on: an interactable id, plus whether it's bare RV hull. */
  const lookAt = (held: ItemState | undefined): { id: string; prompt: string; hull: boolean } => {
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = PLAYER.reach;
    for (const hit of raycaster.intersectObjects([rv.root, dyn, rusty.group, stopsView.root, rockPiles.group, encView.root], true)) {
      const o = hit.object;
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!seen(o)) continue; // raycasts ignore .visible, so hidden things (Roscoe off-duty) must be skipped here
      if (o.type === 'Sprite' || (mat && !Array.isArray(mat) && mat.transparent && !o.userData.iid) || isDescendant(o, camera)) continue;
      const id: string = o.userData.iid ?? '';
      if (id) return describe(id, held);
      if (!id) {
        const hull = isDescendant(o, rv.root);
        if (hull && held && (held.k === 'hammer' || held.k === 'tape')) {
          return { id: 'hull', hull: true, prompt: held.k === 'hammer' ? `Hammer out dents (RV ${Math.round(shared.rv.integrity)}%)` : `Duct-tape the RV (RV ${Math.round(shared.rv.integrity)}%)` };
        }
        return { id: '', prompt: '', hull };
      }
    }
    return { id: '', prompt: '', hull: false };
  };

  const tick = (render: boolean) => {
    const now = performance.now();
    const rawDt = Math.min(1, (now - last) / 1000);
    const dt = Math.min(0.05, rawDt);
    last = now;
    frame++;
    fpsAcc += rawDt; fpsN++; if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

    if (host) {
      // substep so a throttled background host still simulates real time
      for (let left = rawDt; left > 1e-4; left -= 0.05) host.step(Math.min(0.05, left), rv.accelLocal);
      shared = host.s;
    } else interpolate();

    // same road as the host (seed arrives with the first snapshot), and the same fork decisions
    if (typeof shared.seed === 'number' && applyRunSeed(shared.seed)) clearHazardsBeyond(1e9);
    const changedZ = setRouteChoices(shared.route);
    if (changedZ !== null) clearHazardsBeyond(changedZ);

    rv.update(shared.rv, shared.cab, dt);
    rv.root.updateMatrixWorld(true);

    const lookDX = input.mouseDX, lookDY = input.mouseDY;
    const drive = player.update(dt, input, shared, net.myId);
    if (drive) {
      // send changes at once, otherwise just often enough to keep the host's input alive
      const key = `${drive.th}|${drive.br}|${drive.st}|${drive.horn}`;
      driveAcc += rawDt;
      if (isHost || key !== lastDrive || driveAcc >= 1 / CFG.DRIVE_HZ) { lastDrive = key; driveAcc = 0; net.toHost({ t: 'drive', i: drive }); }
    } else lastDrive = '';

    // footsteps + landing
    const stepN = Math.floor(player.stepPhase / Math.PI);
    if (stepN !== lastStepN) { lastStepN = stepN; sound.play(player.inRV ? 'step' : 'stepdirt'); }
    if (player.onGround && !wasOnGround && !player.seat) sound.play('land');
    wasOnGround = player.onGround;

    // crew chat
    if (input.pressed('Enter') && !chatOpen && input.locked) {
      chatOpen = true;
      hud.chatPrompt((text) => {
        chatOpen = false;
        if (!text) return;
        hud.chat(nameOf(net.myId), text);
        net.broadcast({ t: 'chat', text });
      });
    }

    // emotes + pings (not while typing)
    if (!chatOpen && input.locked && shared.phase === 'drive') {
      for (const [key, what] of [['KeyB', 'wave'], ['KeyV', 'dance'], ['KeyC', 'cheer']] as const) {
        if (input.pressed(key)) { net.broadcast({ t: 'emo', what }); hud.toast(what === 'wave' ? '👋 You wave' : what === 'dance' ? '🕺 You bust a move' : '🙌 You cheer'); }
      }
      if (input.pressed('KeyT') || input.clicked(1)) {
        camera.updateMatrixWorld(true);
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        raycaster.far = 400;
        const hit = raycaster.intersectObjects(scene.children, true).find((h) => seen(h.object) && h.object.type !== 'Sprite' && h.object.type !== 'Points' && !isDescendant(h.object, camera) && h.distance > 0.3);
        if (hit) {
          const inRV = isDescendant(hit.object, rv.root);
          const q = inRV ? rv.body.worldToLocal(hit.point.clone()) : hit.point;
          const pt: [number, number, number] = [q.x, q.y, q.z];
          pings.add(nameOf(net.myId), inRV, pt);
          net.broadcast({ t: 'ping', rv: inRV, p: pt });
          sound.play('ding');
        }
      }
    }
    pings.update(rawDt);

    // left behind: hold R to catch up with the RV
    const leftBehind = !player.inRV && !player.seat && shared.phase === 'drive' && Math.hypot(player.pos.x - shared.rv.x, player.pos.z - shared.rv.z) > 80;
    if (!leftBehind) { if (returnT >= 0) { returnT = -1; hud.returnHint(null); } }
    else {
      const unpaid = shared.items.some((i) => i.h === net.myId && i.p > 0);
      const hunted = shared.cop.foot?.who === net.myId || shared.rusty.cletus.chase?.who === net.myId;
      returnT = !unpaid && !hunted && input.down('KeyR') ? Math.max(0, returnT) + rawDt : 0;
      hud.returnHint(unpaid ? 'Pay for (or drop) the unpaid stuff before you can catch up with the RV' : hunted ? "No catching up while you're being chased" : 'Hold R to catch up with the RV', returnT / 1.5);
      if (returnT >= 1.5) { returnT = 0; hud.blackout(1.6); player.wakeInRV(); hud.toast('You sprinted after the RV and dove through the door.'); }
    }

    // seated / driver shortcuts
    if (player.seat) {
      if (input.pressed('KeyF')) act('stand');
      if (player.seat === 'driver') {
        if (input.pressed('KeyE')) act('shift_up');
        if (input.pressed('KeyQ')) act('shift_down');
        if (input.pressed('KeyN')) act('nos');
        if (input.pressed('Space')) act('handbrake');
      }
    }

    // ---------- interaction ----------
    const mySlot = shared.crew[net.myId]?.slot ?? 0;
    const held = shared.items.find((i) => i.h === net.myId && i.sl === mySlot);
    rockPiles.update(shared.rv.z);
    mafiaView.update(shared);
    const look = lookAt(held);
    // a rock is always a throw (RMB), even while looking at something clickable like the rear window
    const rockThrow = held?.k === 'rock' && input.clicked(2);
    if (rockThrow) dropHeld(32);
    // pistol: LMB fires along the crosshair (unless pointing at a shop/dealer prompt)
    const gunShot = held?.k === 'pistol' && input.clicked(0) && !look.id.startsWith('rusty:');
    if (gunShot) { items.punch(-0.6); player.kick(-0.01); const o = camera.getWorldPosition(new THREE.Vector3()), d = camera.getWorldDirection(new THREE.Vector3()); net.toHost({ t: 'shoot', o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] }); }
    const holding = input.mouseDown(0) || (input.down('KeyE') && player.seat !== 'driver');
    const holdable = HOLD_IDS.has(look.id);
    const heistCar = /^rusty:(?:car(\d+)|suv)$/.exec(look.id);
    const busy = heist.active;
    if (busy) {
      const res = heist.update(dt, input, camera.getWorldPosition(new THREE.Vector3()));
      if (res === 'ok' || res === 'fail') act(`rusty:car${heist.car}:${res}`);
    }
    if (!busy && look.id && holdable && holding && !input.clicked(0) && !input.pressed('KeyE')) {
      if ((holdAcc += dt) >= 0.2) { holdAcc = 0; act(look.id); }
    } else holdAcc = 0;
    if (busy) { /* minigame owns the mouse */ } else if (look.id) {
      // the driver's E is the upshift, so they interact with the mouse only
      if (gunShot) { /* fired */ } else if ((input.pressed('KeyE') && player.seat !== 'driver') || input.clicked(0)) {
        if (heistCar) startHeist(heistCar[1] ? Number(heistCar[1]) : 1, held);
        else { act(look.id, 0); if (held) items.punch(0.7); }
      } else if (input.clicked(2) && !rockThrow) act(look.id, 2);
    } else if (held) {
      if (held.k === 'extinguisher') {
        // hold LMB to spray; tell the host when the nozzle points at the fire
        if (input.mouseDown(0) && (sprayAcc += dt) >= 0.2) {
          sprayAcc = 0;
          rv.body.localToWorld(fireWorld.set(1.0, 1.75, 0.53));
          const cam = camera.getWorldPosition(new THREE.Vector3());
          const dir = camera.getWorldDirection(new THREE.Vector3());
          const to = fireWorld.clone().sub(cam);
          const aimed = to.length() < 4 && dir.angleTo(to) < 0.45;
          act('spray', aimed ? 1 : 0);
        }
      } else if (held.k === 'map' && input.clicked(0)) mapView.toggle();
      else if (input.clicked(0) && (KINDS[held.k]?.food || held.k === 'scratch' || held.k === 'suitcase')) { act('self'); items.punch(); }
      if (input.clicked(2) && !rockThrow) dropHeld(7);
    }
    if (held && input.pressed('KeyG')) dropHeld(1.2);
    if (held?.k === 'map' && input.pressed('KeyM')) mapView.toggle();
    if (mapView.open && held?.k !== 'map') mapView.toggle(false);
    mapView.update(shared);

    for (const a of avatars.values()) {
      a.update(dt);
      if ((shared.crew[a.id]?.spray ?? 0) > 0) { a.nozzle(nozzlePos, nozzleDir); fx.spray(nozzlePos, nozzleDir, dt); }
    }
    // own spray: driven by the mouse directly so it feels instant
    if (held?.k === 'extinguisher' && held.d > 0 && input.mouseDown(0) && !look.id) {
      camera.localToWorld(nozzlePos.set(0.2, -0.14, -0.62));
      camera.getWorldDirection(nozzleDir);
      fx.spray(nozzlePos, nozzleDir, dt);
    }
    Character.tickAll(dt);
    fx.update(dt, shared.cab.fire);
    rusty.update(dt, shared, rv.root.position, (id) => items.worldPosOf(id), (n) => sound.play(n));
    const siren = traffic.update(dt, shared, camera.getWorldPosition(new THREE.Vector3()), world.daylight);
    vultures.update(dt, shared, rv.root.position);
    canyonView.update(dt, shared);
    encView.update(shared, dt, camera.getWorldPosition(new THREE.Vector3()));

    // dev: F9 teleports the RV to just before Rusty's Oasis
    if (DEV && host && input.pressed('F9')) {
      const z = RUSTY_FRAME.z + 160, yaw = roadYaw(z), r = host.s.rv;
      r.x = roadX(z) + LANE_OFFSET * Math.cos(yaw); r.z = z - LANE_OFFSET * Math.sin(yaw); r.yaw = yaw; r.speed = 0;
      (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
      hud.toast("DEV: teleported to Rusty's Oasis");
    }
    const devJump = (z: number, label: string) => {
      if (!host) return;
      const yaw = roadYaw(z), r = host.s.rv;
      r.x = roadX(z) + LANE_OFFSET * Math.cos(yaw); r.z = z - LANE_OFFSET * Math.sin(yaw); r.yaw = yaw; r.speed = 0;
      (host as any).prevPose = { x: r.x, z: r.z, yaw: r.yaw };
      hud.toast(`DEV: teleported ${label}`);
    };
    if (DEV && input.pressed('F10')) {
      const next = FORKS.find((f) => shared.route[f.id] === -1);
      if (next) devJump(forkZ(next) + 1600, `before the fork at mile ${next.mile}`);
    }
    if (DEV && input.pressed('F8')) devJump(chapelZ() + 300, 'to the chapel');
    if (DEV && host && input.pressed('F7')) { host.s.weather.storm = 1; (host as any).stormLeft = 60; hud.toast('DEV: sandstorm'); }
    if (DEV && host && input.pressed('F5')) { const k = ENC_KINDS[devEnc++ % ENC_KINDS.length]; host.s.enc.list = []; host.enc.spawn(k); hud.toast(`DEV: encounter ${k}`); }
    if (DEV && host && input.pressed('F6')) { host.s.clock = (22 - CFG.START_HOUR) * 3600; hud.toast('DEV: 22:00'); }
    items.feel(dt, lookDX, lookDY, player.stepPhase, player.onGround && !player.seat && player.vel.lengthSq() > 1, player.seat ? 0 : player.vel.y);
    items.sync(shared.items, dt, shared.crew);
    if (input.wheel) { act(`slot:${input.wheel > 0 ? 1 : -1}`); sound.play('tick'); }
    for (const [k, n] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]] as const) if (input.pressed(k)) act(`slot:${(n - (shared.crew[net.myId]?.slot ?? 0) + 3) % 3}`);

    const camPos = camera.getWorldPosition(new THREE.Vector3());
    world.update(rv.root.position, camPos, CFG.START_HOUR + shared.clock / 3600, shared.weather.storm, shared.weather.wind, dt);
    chapel.update(rv.root.position);
    stopsView.update(shared, dt, rv.root.position, (id) => items.worldPosOf(id));

    const pan = shared.items.find((i) => i.s === 'skillet');
    const sizzle = pan && shared.cab.stoveOn && player.inRV ? 1 : 0;
    const r = shared.rv, spd = Math.abs(r.speed), mph = spd * CFG.MPH;
    const rvDist = Math.hypot(camPos.x - r.x, camPos.z - r.z);
    const hour = (CFG.START_HOUR + shared.clock / 3600) % 24;
    const night = hour >= 20 || hour < 5 ? 1 : hour >= 19 ? hour - 19 : hour < 6 ? 6 - hour : 0;
    const offroad = !onRoad(r.x, r.z);
    // reception: sandstorms and canyon walls eat the signal; AM carries better at night
    const amStation = r.station === 3;
    const signal = Math.max(0.05, 1 - shared.weather.storm * 0.6 - (branchAt(r.z)?.canyon ? 0.45 : 0) - (amStation ? 0.25 * (1 - night) : 0));
    camera.getWorldDirection(camRight).cross(camera.up).normalize();
    sound.setListener(camPos.x, camPos.y, camPos.z, camRight.x, camRight.z);
    sound.update({
      dt, rpm: r.rpm, running: r.ignition === 2, load: r.throttle, horn: r.horn,
      speed: spd, brake: r.brake, offroad, doorOpen: r.doorOpen,
      sizzle, flames: player.inRV ? shared.cab.fire : shared.cab.fire * 0.3, siren,
      wind: shared.weather.storm * (player.inRV ? 0.45 : 1) + Math.abs(shared.weather.wind) * 0.15,
      inRV: player.inRV, rvDist, night,
      radio: {
        on: r.radio && !shared.cab.fuseOut, station: r.station, signal,
        talk: { hour, storm: shared.weather.storm, heat: shared.heat, cop: shared.cop.phase === 1 || shared.cop.phase === 2, shark: shared.shark.on, mile: progressMiles(r.z), total: totalMiles(), lastText: hud.texts[hud.texts.length - 1] ?? '' },
      },
    });

    // ---------- juice ----------
    // speed widens the view a touch; the cabin rumbles with the engine and the road
    const targetFov = settings.fov + (player.sprinting ? 4 : 0) + (player.inRV ? Math.min(1, Math.max(0, (mph - 40) / 160)) * 14 + (r.nosT > 0 ? 9 : 0) : 0);
    if (Math.abs(targetFov - fov) > 0.01) {
      fov += (targetFov - fov) * Math.min(1, dt * 2);
      camera.fov = fov; camera.updateProjectionMatrix();
      fx.setScale(renderer.domElement.clientHeight * renderer.getPixelRatio(), fov);
    }
    player.rumble = (r.ignition === 2 ? 0.25 + r.rpm / 6000 * 0.25 : 0) + Math.min(1, spd / 90) * (offroad ? 1.6 : 0.5) + (shared.cab.flat >= 0 && spd > 2 ? 0.6 : 0) + (r.nosT > 0 ? 0.9 : 0);
    if (r.gear !== lastGear) { if (player.inRV) player.kick(r.gear > lastGear ? 0.012 : 0.02); lastGear = r.gear; }
    if (r.integrity < lastHP - 0.4) hud.hurt(Math.min(1, (lastHP - r.integrity) / 8));
    lastHP = r.integrity;
    hud.fx(dt, mph, player.inRV, r.nosT > 0);
    const camAhead = player.inRV ? nextRadar(r.z) : null;

    // networking
    snapAcc += rawDt; poseAcc += rawDt;
    if (isHost) {
      // the host's pose rides in the snapshot: one message per tick instead of two
      if (snapAcc >= 1 / CFG.SNAPSHOT_HZ) { snapAcc = 0; net.broadcast({ t: 'snap', s: shared, p: player.pose() }); }
    } else {
      // full rate while moving or looking around, a slow heartbeat while standing still
      const p = player.pose();
      const key = `${p.inRV}|${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}|${p.yaw.toFixed(2)}|${p.pitch.toFixed(2)}|${p.seat}`;
      if (poseAcc >= 1 / (key !== lastPose ? CFG.POSE_HZ : CFG.POSE_IDLE_HZ)) { poseAcc = 0; lastPose = key; net.broadcast({ t: 'pose', p }); }
    }

    // the run just ended: free the mouse and offer a way back in
    if (shared.phase === 'ended' && !endShown) {
      endShown = true;
      document.exitPointerLock?.();
      mapView.toggle(false);
      const home = () => { location.href = location.pathname + (DEV ? '?dev' : ''); };
      const again = () => { if (!host || shared.phase !== 'ended') return; startRun(); const m: GameMsg = { t: 'ev', k: 'restart' }; applyEvent(m); net.broadcast(m); };
      hud.endButtons(isHost ? again : null, home,
        net.solo ? '' : isHost ? 'Play again starts a new run right here: the crew stays in the room.' : 'Stay put: when the host hits Play again, the new run starts for everyone.');
    }
    if (endShown && receipt && !runSaved) {
      runSaved = true;
      try {
        const runs = JSON.parse(localStorage.getItem('rr-runs') ?? '[]');
        runs.push({ ending: shared.ending, miles: receipt.miles, total: receipt.total, money: receipt.money, seed: receipt.seed });
        localStorage.setItem('rr-runs', JSON.stringify(runs.slice(-50)));
      } catch { /* storage blocked */ }
    }

    const colorOf = (id: number) => id === net.myId ? lobbyChoice.look.c : looks.get(id)?.c ?? '#' + new THREE.Color(PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length]).getHexString();
    const players = [...net.names.entries()].map(([id, name]) => ({ id, name, color: colorOf(id), host: id === net.hostId, you: id === net.myId }));
    const crewList = [...net.names.entries()].filter(([id]) => id !== net.myId).map(([id, name]) => ({ id, name, color: looks.get(id)?.c ?? '#' + new THREE.Color(PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length]).getHexString() }));
    hud.update(shared, {
      crew: crewList,
      prompt: look.prompt, objective: objective(shared, net.myId, player.seat, nameOf),
      seat: player.seat, locked: input.locked, tab: input.down('Tab'), room: net.solo ? 'SOLO' : net.code, players,
      dt, cam: camAhead ? r.z - camAhead.z : null, myId: net.myId, stamina: player.stamina, boost: player.boost, held: held ? itemName(held.k, held.d) : '', inRV: player.inRV,
      dev: DEV ? `fps ${fps}\n${(Math.abs(shared.rv.speed) * CFG.MPH).toFixed(0)} mph  gear ${gearInfo(shared.rv.gear).name}  rpm ${shared.rv.rpm.toFixed(0)}\nfuel ${shared.rv.fuel.toFixed(2)} gal  temp ${shared.rv.temp.toFixed(0)}°F  grime ${shared.rv.grime.toFixed(2)}  hp ${shared.rv.integrity.toFixed(0)}\nplayer ${player.inRV ? 'RV' : 'world'} ${player.pos.x.toFixed(2)},${player.pos.y.toFixed(2)},${player.pos.z.toFixed(2)}  items ${shared.items.length}` : '',
    });

    if (!render) { input.endFrame(); return; }
    lightPool.update(camPos, dt);
    if (frame % 2 === 0) {
      rv.mirror.visible = false;
      renderer.setRenderTarget(mirrorRT);
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(null);
      rv.mirror.visible = true;
    }
    if (frame % 4 === 1 || frame % 4 === 3) {
      const i = frame % 4 === 1 ? 0 : 1;
      sideGlass[i].visible = false;
      renderer.setRenderTarget(sideRT[i]);
      renderer.render(scene, sideCams[i]);
      renderer.setRenderTarget(null);
      sideGlass[i].visible = true;
    }
    // free casino drinks: the world sways and smears
    const drunk = shared.crew[net.myId]?.drunk ?? 0;
    const tt = now / 1000;
    const sway = drunk > 0 ? Math.min(1, drunk / 30) : 0;
    if (sway > 0) camera.rotateZ(Math.sin(tt * 0.9) * 0.06 * sway);
    canvas.style.filter = sway > 0 ? `blur(${(0.4 + 0.6 * Math.abs(Math.sin(tt * 0.7))) * sway}px) saturate(${1 + 0.4 * sway})` : '';
    gfx.update(dt, 1 - world.daylight, world.stormLevel);
    gfx.render();
    if (sway > 0) camera.rotateZ(-Math.sin(tt * 0.9) * 0.06 * sway);
    input.endFrame();
  };

  /** Let go of the held item from the hand, tossed along the look direction. */
  const dropHeld = (speed: number) => {
    const dir = player.lookDir();
    const p = player.eyePos().addScaledVector(dir, 0.45);
    p.y -= 0.2;
    const v = dir.multiplyScalar(speed).add(player.vel);
    v.y += speed > 20 ? 0.8 : speed > 2 ? 1.5 : 0;
    if (speed > 2) { sound.play('throw'); items.punch(); }
    net.toHost({ t: 'drop', inRV: player.inRV, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
  };

  // ---------- dev hooks for scripted / agent playtests (only with ?dev) ----------
  if (DEV) {
    const roots = () => [rv.root, dyn, rusty.group, stopsView.root, rockPiles.group, encView.root];
    const heldNow = () => shared.items.find((i) => i.h === net.myId && i.sl === (shared.crew[net.myId]?.slot ?? 0));
    const find = (id: string) => { let hit: THREE.Object3D | null = null; for (const r of roots()) r.traverse((o) => { if (!hit && o.userData.iid === id && seen(o)) hit = o; }); return hit as THREE.Object3D | null; };
    const centre = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    Object.assign((window as any).game, {
      /** Interactables within r metres of the eye: id, what the reticle prompt would say, distance, inside the RV? */
      nearby(r = 8) {
        const eye = camera.getWorldPosition(new THREE.Vector3()), out = new Map<string, { id: string; prompt: string; d: number; inRV: boolean }>();
        const held = heldNow();
        for (const root of roots()) root.traverse((o) => {
          const id: string = o.userData.iid; if (!id || out.has(id) || !seen(o) || (o as THREE.Mesh).isMesh !== true) return;
          if (id === `player:${net.myId}`) return;
          const d = centre(o).distanceTo(eye); if (d > r) return;
          const p = describe(id, held); if (!p.prompt) return;
          out.set(id, { id, prompt: p.prompt, d: Math.round(d * 10) / 10, inRV: isDescendant(o, rv.root) });
        });
        return [...out.values()].sort((a, b) => a.d - b.d);
      },
      /** Walk up to an interactable (teleport-walk; inside the RV or up to 120 m away outside) and face it. */
      goto(id: string) {
        const o = find(id); if (!o) return 'not found / not visible: ' + id;
        if (player.seat) act('stand');
        const P = centre(o), eye = camera.getWorldPosition(new THREE.Vector3());
        if (P.distanceTo(eye) > 120) return `too far (${Math.round(P.distanceTo(eye))} m) — get the RV closer first`;
        player.vel.set(0, 0, 0);
        if (isDescendant(o, rv.root)) {
          const L = rv.root.worldToLocal(P.clone());
          if (!player.inRV) player.setInRV(true);
          const tx = THREE.MathUtils.clamp(L.x, -RVDIM.innerHalfW + 0.35, RVDIM.innerHalfW - 0.35), tz = THREE.MathUtils.clamp(L.z, RVDIM.zFront + 0.5, RVDIM.zRear - 0.4);
          // stand ~0.7 m off it, toward the aisle
          const ax = tx * 0.35, dx = tx - ax, dz = 0.0001; const len = Math.hypot(dx, dz) || 1;
          player.pos.set(ax + (dx / len) * Math.max(0, len - 0.7), RVDIM.floorY, tz);
          player.yaw = Math.atan2(-(L.x - player.pos.x), -(L.z - player.pos.z));
          player.pitch = Math.atan2(L.y - (RVDIM.floorY + PLAYER.eye), Math.hypot(L.x - player.pos.x, L.z - player.pos.z));
        } else {
          if (player.inRV) player.setInRV(false);
          const dir = new THREE.Vector3(P.x - eye.x, 0, P.z - eye.z); const len = dir.length() || 1; dir.divideScalar(len);
          const sx = P.x - dir.x * 1.1, sz = P.z - dir.z * 1.1;
          player.pos.set(sx, groundY(sx, sz) + 0.05, sz);
          player.yaw = Math.atan2(-(P.x - sx), -(P.z - sz));
          player.pitch = Math.atan2(P.y - (player.pos.y + PLAYER.eye), 1.1);
        }
        return 'ok';
      },
      /** Interact with something within reach (like E / LMB / RMB on it). Rusty's car heists play the minigame with ~75% skill. */
      use(id: string, btn = 0) {
        if (id === 'hull') { const h = heldNow(); if (!h || (h.k !== 'hammer' && h.k !== 'tape')) return 'hold a hammer or duct tape first'; act('hull', btn); return 'ok'; }
        const o = find(id); if (!o) return 'not found / not visible: ' + id;
        const d = centre(o).distanceTo(camera.getWorldPosition(new THREE.Vector3()));
        if (d > 4.5) return `out of reach (${d.toFixed(1)} m) — goto it first`;
        const hc = /^rusty:(?:car(\d+)|suv)$/.exec(id);
        if (hc) { const i = hc[1] ? Number(hc[1]) : 1; act(`rusty:car${i}:${Math.random() < 0.75 ? 'ok' : 'fail'}`); return 'minigame played'; }
        act(id, btn); return 'ok';
      },
      /** Use the item in hand on yourself / the world (eat, scratch, open, spray at the stove fire). */
      useHeld() {
        const h = heldNow(); if (!h) return 'empty hands';
        if (h.k === 'extinguisher') { for (let k = 0; k < 15; k++) setTimeout(() => act('spray', 1), k * 200); return 'spraying 3 s'; }
        if (KINDS[h.k]?.food || h.k === 'scratch' || h.k === 'suitcase') { act('self'); return 'ok'; }
        return 'nothing to do with ' + h.k + ' by itself — use it on something';
      },
      drop: (speed = 1.2) => { if (!heldNow()) return 'empty hands'; dropHeld(speed); return 'ok'; },
      held: () => { const h = heldNow(); return h ? itemName(h.k, h.d) : null; },
      hud, itemName, nameOf,
    });
  }

  // rAF drives rendering; a watchdog keeps the sim alive when frames stop (background tab)
  let framesShown = 0;
  const frameLoop = () => { requestAnimationFrame(frameLoop); tick(true); if (++framesShown === 3) { hud.loading(false); hud.intro(); } };
  requestAnimationFrame(frameLoop);
  // Browsers throttle a hidden tab's own timers to ~1 Hz, which starves the host sim (and everyone's game with it).
  // A worker's timer isn't throttled, so it drives the watchdog; plain setInterval is the fallback.
  const watchdog = () => { if (performance.now() - last > 150) tick(false); };
  try {
    const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'], { type: 'text/javascript' })));
    ticker.onmessage = watchdog;
    ticker.onerror = () => setInterval(watchdog, 100);
  } catch { setInterval(watchdog, 100); }
}

// idle render behind the lobby
camera.position.set(14, 4, -12);
camera.lookAt(rv.root.position.x, 1.5, 0);
scene.add(camera);
let lobbyLoop = true;
const lobbyRender = () => {
  if (!lobbyLoop) return;
  requestAnimationFrame(lobbyRender);
  // slow orbit around the parked RV in the late-afternoon light
  const a = performance.now() / 1000 * 0.07 + 0.6, rp = rv.root.position;
  camera.position.set(rp.x + Math.sin(a) * 10.5 + 4, 2.9 + Math.sin(a * 0.7) * 0.7, rp.z - 1 - Math.cos(a) * 10.5);
  camera.lookAt(rp.x + 4, 1.7, rp.z - 0.5);
  world.update(rp, camera.position, 17.4);
  chapel.update(rp);
  gfx.render();
};
lobbyRender();
start();
