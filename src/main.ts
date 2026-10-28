// Boot, lobby, and the main loop. The host runs HostSim; everyone renders the shared state.
import * as THREE from 'three';
import { CFG, DEV, PLAYER, gearInfo } from './config';
import { Input } from './core/Input';
import { Sound } from './core/Sound';
import { KINDS, itemName } from './items/Items';
import { ItemViews } from './items/ItemViews';
import { HostSim } from './net/Host';
import type { Net } from './net/Net';
import { Effects } from './fx/Effects';
import { Avatar } from './player/Avatar';
import { Player } from './player/Player';
import { RVModel } from './rv/RV';
import { RUSTY_FRAME, RUSTY_SET } from './stops/rusty';
import { RustyView } from './stops/RustyView';
import { TrafficView } from './traffic/TrafficView';
import { ChapelView } from './stops/ChapelView';
import { MapView } from './ui/MapView';
import { FORKS, chapelZ, forkZ, setRouteChoices } from './world/Route';
import type { GameMsg, ItemState, Pose, SharedState } from './types';
import { HUD } from './ui/HUD';
import { runLobby } from './ui/Lobby';
import { setupSettings } from './ui/Settings';
import { LANE_OFFSET, World, clearHazardsBeyond, roadX, roadYaw } from './world/World';

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
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fx.setScale(renderer.domElement.clientHeight * renderer.getPixelRatio(), camera.fov);
});

const world = new World(scene);
const rv = new RVModel();
scene.add(rv.root);
/** World-space dynamic objects (items and avatars outside the RV). */
const dyn = new THREE.Group();
scene.add(dyn);

// rear-view mirror (render target)
const mirrorRT = new THREE.WebGLRenderTarget(320, 104);
const mirrorCam = new THREE.PerspectiveCamera(40, 320 / 104, 0.5, 600);
rv.mirrorAnchor.add(mirrorCam);
mirrorCam.rotation.x = -0.12;
const mirrorTex = mirrorRT.texture;
mirrorTex.colorSpace = THREE.SRGBColorSpace;
mirrorTex.repeat.x = -1; mirrorTex.offset.x = 1; // mirror flip
(rv.mirror.material as THREE.MeshBasicMaterial).map = mirrorTex;
(rv.mirror.material as THREE.MeshBasicMaterial).color.set('#ffffff');

const input = new Input(canvas);
const sound = new Sound();
const settings = setupSettings(sound, input);
canvas.addEventListener('mousedown', () => { const first = !sound.ctx; sound.init(); if (first) settings.reapply(); });
const hud = new HUD();
const player = new Player(camera, rv, scene);
player.statics.push(RUSTY_SET);
const rusty = new RustyView(scene);
const traffic = new TrafficView(scene, rv);
const chapel = new ChapelView(scene);
const mapView = new MapView();
const avatars = new Map<number, Avatar>();
const raycaster = new THREE.Raycaster();
raycaster.camera = camera;
const fx = new Effects(rv, dyn);
fx.setScale(innerHeight * renderer.getPixelRatio(), camera.fov);
const nozzlePos = new THREE.Vector3(), nozzleDir = new THREE.Vector3();

// render the world behind the lobby
const preview = new HostSim(() => {});
rv.update(preview.s.rv, preview.s.cab, 0);

const isDescendant = (o: THREE.Object3D | null, of: THREE.Object3D) => { for (; o; o = o.parent) if (o === of) return true; return false; };

async function start() {
  const net: Net = await runLobby();
  lobbyLoop = false;
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
    else if (m.k === 'sfx') sound.play(m.name);
    else if (m.k === 'jolt') player.jolt(m.mag);
    else if (m.k === 'fed' && m.to === net.myId) player.stamina = Math.min(100, Math.max(0, player.stamina + m.stam));
  };

  if (isHost) {
    host = new HostSim((m) => { applyEvent(m); net.broadcast(m); }, (open) => rv.activeColliders(open));
    host.names = nameOf;
    host.crew(net.myId);
    shared = host.s;
  } else {
    shared = new HostSim(() => {}).s;
    shared.items = [];
  }
  const items = new ItemViews(rv, dyn, camera, avatars, net.myId);
  const poses = new Map<number, Pose>();
  /** World position of a player's hands, from their latest pose. */
  const handOf = (id: number): [number, number, number] | null => {
    const p = id === net.myId ? player.pose() : poses.get(id);
    if (!p) return null;
    if (!p.inRV) return [p.x, p.y + 1.2, p.z];
    const r = shared.rv; const c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    return [r.x + p.x * c + p.z * sn, p.y + 1.2, r.z - p.x * sn + p.z * c];
  };
  if (host) host.handOf = handOf;

  net.setHandler({
    onMsg(from, m) {
      if (m.t === 'pose') {
        let a = avatars.get(from);
        if (!a) { a = new Avatar(from, nameOf(from), rv, dyn); avatars.set(from, a); }
        a.setPose(m.p);
        poses.set(from, m.p);
        host?.crew(from);
      } else if (m.t === 'snap') {
        if (!isHost) { snaps.push({ t: performance.now() / 1000, s: m.s }); if (snaps.length > 30) snaps.shift(); }
      } else if (m.t === 'ev') {
        if (!isHost) applyEvent(m);
      } else if (host) host.handle(from, m);
    },
    onJoin(id, name) { hud.toast(`${name} hopped in the RV`); host?.crew(id); },
    onLeave(id) {
      hud.toast(`${nameOf(id)} left`);
      avatars.get(id)?.dispose(); avatars.delete(id);
      host?.peerGone(id);
    },
    onHostLeft() { hud.toast('Host left — run over.'); shared.phase = 'ended'; shared.ending = 'The host left the RV.'; },
  });
  if (!net.solo) hud.toast(isHost ? `Room code: ${net.code} — share it with your crew (Tab)` : `Joined room ${net.code}`);

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
  if (DEV) (window as any).game = { net, get host() { return host; }, player, rv, world, input, rusty, RUSTY_SET, get shared() { return shared; }, act };

  let last = performance.now();
  let snapAcc = 0, poseAcc = 0, sprayAcc = 0, holdAcc = 0, frame = 0, fps = 0, fpsAcc = 0, fpsN = 0;
  /** Interactions that repeat while the button is held (pumping gas, siphoning). */
  const HOLD_IDS = new Set(['fuelport', 'rusty:suv']);
  const fireWorld = new THREE.Vector3();

  /** What the reticle is on: an interactable id, plus whether it's bare RV hull. */
  const lookAt = (held: ItemState | undefined): { id: string; prompt: string; hull: boolean } => {
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = PLAYER.reach;
    const ctx = { held: held?.k ?? '', cab: shared.cab };
    for (const hit of raycaster.intersectObjects([rv.root, dyn, rusty.group], true)) {
      const o = hit.object;
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (o.type === 'Sprite' || (mat && !Array.isArray(mat) && mat.transparent) || isDescendant(o, camera)) continue;
      const id: string = o.userData.iid ?? '';
      if (!id) {
        const hull = isDescendant(o, rv.root);
        if (hull && held && (held.k === 'hammer' || held.k === 'tape')) {
          return { id: 'hull', hull: true, prompt: held.k === 'hammer' ? `Hammer out dents (RV ${Math.round(shared.rv.integrity)}%)` : `Duct-tape the RV (RV ${Math.round(shared.rv.integrity)}%)` };
        }
        return { id: '', prompt: '', hull };
      }
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
      if (id === 'roscoe') return { id, hull: false, prompt: held?.k === 'card' ? 'Hand Roscoe the card (pay the ticket)' : 'ROSCOE: "Card, please." (bring the debit card)' };
      const prompt = id.startsWith('rusty:') ? rusty.promptFor(id, shared, ctx) : rv.promptFor(id, shared.rv, ctx);
      return prompt ? { id, prompt, hull: false } : { id: '', prompt: '', hull: false };
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

    // keep the road in sync with the host's fork decisions
    const changedZ = setRouteChoices(shared.route);
    if (changedZ !== null) clearHazardsBeyond(changedZ);

    rv.update(shared.rv, shared.cab, dt);
    rv.root.updateMatrixWorld(true);

    const drive = player.update(dt, input, shared, net.myId);
    if (drive) net.toHost({ t: 'drive', i: drive });

    // seated / driver shortcuts
    if (player.seat) {
      if (input.pressed('KeyF')) act('stand');
      if (player.seat === 'driver') {
        if (input.pressed('KeyE')) act('shift_up');
        if (input.pressed('KeyQ')) act('shift_down');
        if (input.pressed('Space')) act('handbrake');
      }
    }

    // ---------- interaction ----------
    const held = shared.items.find((i) => i.h === net.myId);
    const look = lookAt(held);
    const holding = input.mouseDown(0) || (input.down('KeyE') && player.seat !== 'driver');
    if (look.id && HOLD_IDS.has(look.id) && holding && !input.clicked(0) && !input.pressed('KeyE')) {
      if ((holdAcc += dt) >= 0.2) { holdAcc = 0; act(look.id); }
    } else holdAcc = 0;
    if (look.id) {
      // the driver's E is the upshift, so they interact with the mouse only
      if ((input.pressed('KeyE') && player.seat !== 'driver') || input.clicked(0)) act(look.id, 0);
      else if (input.clicked(2)) act(look.id, 2);
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
      else if (input.clicked(0) && KINDS[held.k]?.food) act('self');
      if (input.clicked(2)) dropHeld(7);
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
    fx.update(dt, shared.cab.fire);
    rusty.update(dt, shared, rv.root.position, (id) => items.worldPosOf(id), (n) => sound.play(n));
    const siren = traffic.update(dt, shared, camera.getWorldPosition(new THREE.Vector3()), world.daylight);

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
      if (next) devJump(forkZ(next) + 600, `before the fork at mile ${next.mile}`);
    }
    if (DEV && input.pressed('F8')) devJump(chapelZ() + 300, 'to the chapel');
    if (DEV && host && input.pressed('F7')) { host.s.weather.storm = 1; (host as any).stormLeft = 60; hud.toast('DEV: sandstorm'); }
    if (DEV && host && input.pressed('F6')) { host.s.clock = (22 - CFG.START_HOUR) * 3600; hud.toast('DEV: 22:00'); }
    items.sync(shared.items, dt);

    const camPos = camera.getWorldPosition(new THREE.Vector3());
    world.update(rv.root.position, camPos, CFG.START_HOUR + shared.clock / 3600, shared.weather.storm, shared.weather.wind, dt);
    chapel.update(rv.root.position);

    const pan = shared.items.find((i) => i.s === 'skillet');
    const sizzle = pan && shared.cab.stoveOn && player.inRV ? 1 : 0;
    sound.update(shared.rv.rpm, shared.rv.ignition === 2, shared.rv.throttle, shared.rv.horn, shared.rv.radio && !shared.cab.fuseOut, sizzle, player.inRV ? shared.cab.fire : shared.cab.fire * 0.3, siren, shared.weather.storm * (player.inRV ? 0.45 : 1) + Math.abs(shared.weather.wind) * 0.15);

    // networking
    snapAcc += rawDt; poseAcc += rawDt;
    if (isHost && snapAcc >= 1 / CFG.SNAPSHOT_HZ) { snapAcc = 0; net.broadcast({ t: 'snap', s: shared }); }
    if (poseAcc >= 1 / CFG.POSE_HZ) { poseAcc = 0; net.broadcast({ t: 'pose', p: player.pose() }); }

    const players = [...net.names.entries()].map(([id, n]) =>
      `${n}${id === net.hostId ? ' (host)' : ''}${id === net.myId ? ' ← you' : ''}${shared.seats.driver === id ? ' 🚗' : shared.seats.nav === id ? ' 🗺️' : ''}`);
    hud.update(shared, {
      prompt: look.prompt,
      seat: player.seat, locked: input.locked, tab: input.down('Tab'), room: net.solo ? 'SOLO' : net.code, players,
      myId: net.myId, stamina: player.stamina, held: held ? itemName(held.k, held.d) : '', inRV: player.inRV,
      dev: DEV ? `fps ${fps}\n${(Math.abs(shared.rv.speed) * CFG.MPH).toFixed(0)} mph  gear ${gearInfo(shared.rv.gear).name}  rpm ${shared.rv.rpm.toFixed(0)}\nfuel ${shared.rv.fuel.toFixed(2)} gal  temp ${shared.rv.temp.toFixed(0)}°F  grime ${shared.rv.grime.toFixed(2)}  hp ${shared.rv.integrity.toFixed(0)}\nplayer ${player.inRV ? 'RV' : 'world'} ${player.pos.x.toFixed(2)},${player.pos.y.toFixed(2)},${player.pos.z.toFixed(2)}  items ${shared.items.length}` : '',
    });

    if (!render) { input.endFrame(); return; }
    if (frame % 2 === 0) {
      rv.mirror.visible = false;
      renderer.setRenderTarget(mirrorRT);
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(null);
      rv.mirror.visible = true;
    }
    renderer.render(scene, camera);
    input.endFrame();
  };

  /** Let go of the held item from the hand, tossed along the look direction. */
  const dropHeld = (speed: number) => {
    const dir = player.lookDir();
    const p = player.eyePos().addScaledVector(dir, 0.45);
    p.y -= 0.2;
    const v = dir.multiplyScalar(speed).add(player.vel);
    v.y += speed > 2 ? 1.5 : 0;
    net.toHost({ t: 'drop', inRV: player.inRV, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
  };

  // rAF drives rendering; a watchdog keeps the sim alive when frames stop (background tab)
  const frameLoop = () => { requestAnimationFrame(frameLoop); tick(true); };
  requestAnimationFrame(frameLoop);
  setInterval(() => { if (performance.now() - last > 150) tick(false); }, 100);
}

// idle render behind the lobby
camera.position.set(14, 4, -12);
camera.lookAt(rv.root.position.x, 1.5, 0);
scene.add(camera);
let lobbyLoop = true;
const lobbyRender = () => {
  if (!lobbyLoop) return;
  requestAnimationFrame(lobbyRender);
  world.update(rv.root.position, camera.position, 7.5);
  renderer.render(scene, camera);
};
lobbyRender();
start();
