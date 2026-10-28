// Host-only RV simulation: arcade bicycle model + manual gearbox, fuel, temperature.
import { CFG, ENGINE, NOS, WHEELBASE, gearInfo } from '../config';
import type { DriveInput, RVState } from '../types';
import { CHARM2_QUOTES, CHARM_QUOTES } from './charmQuotes';

export interface RVAux { crankT: number; lugT: number; hornT: number }

export function newRVState(x: number, z: number, yaw: number): RVState {
  return {
    x, z, yaw, speed: 0, steer: 0, gear: 0, rpm: 0,
    fuel: CFG.START_FUEL, temp: 95, ignition: 0,
    handbrake: true, headlights: false, wipers: false, dome: false, radio: false, station: 0, charm: Math.floor(Math.random() * CHARM_QUOTES.length), charm2: Math.floor(Math.random() * CHARM2_QUOTES.length),
    nos: NOS.CHARGES, nosT: 0, rocks: 0, rearWin: false,
    doorOpen: false, horn: false, steam: false,
    grime: 0.15, integrity: 100, odometer: 0, throttle: 0, brake: 0,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Advance the RV by dt. Returns event names ('stall', 'started', 'nofuel', 'overheat'). */
export function stepRV(rv: RVState, aux: RVAux, input: DriveInput, dt: number, offroad: boolean): string[] {
  const ev: string[] = [];
  const { IDLE, REDLINE } = ENGINE;

  // ignition
  if (rv.ignition === 1) {
    aux.crankT += dt;
    if (aux.crankT > ENGINE.CRANK_TIME) {
      if (rv.fuel > 0) { rv.ignition = 2; ev.push('started'); } else { rv.ignition = 0; ev.push('nofuel'); }
    }
  }
  const on = rv.ignition === 2;
  const boost = on && rv.nosT > 0;
  if (rv.nosT > 0) rv.nosT = Math.max(0, rv.nosT - dt);
  const th = on ? clamp(input.th, 0, 1) : 0;
  rv.throttle = th;
  rv.brake = clamp(input.br, 0, 1);

  // engine rpm
  const g = gearInfo(rv.gear);
  const topMs = Math.abs(g.top) / CFG.MPH;
  const wheelR = rv.gear !== 0 ? Math.abs(rv.speed) / topMs : 0; // 0..1 of gear band
  let targetRpm = 0;
  if (on) targetRpm = rv.gear === 0 ? IDLE + th * (REDLINE - IDLE) * 0.92 : Math.min(REDLINE * 1.08, Math.max(IDLE, wheelR * REDLINE * 0.97));
  rv.rpm += (targetRpm - rv.rpm) * Math.min(1, dt * (rv.gear === 0 ? 4 : 12));

  // drive force
  let acc = 0;
  const dir = rv.gear === -1 ? -1 : 1;
  if (on && rv.gear !== 0) {
    let torque = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(wheelR, 1) * 0.85 + 0.15);
    if (wheelR >= (boost ? NOS.OVER : 1)) torque = 0; // rev limiter (nitrous lifts it)
    let power = th * torque * g.acc + (boost && wheelR < NOS.OVER ? NOS.ACC * (0.5 + 0.5 * th) : 0);
    if (rv.steam) power *= 0.55;
    acc += dir * power;
    // idle creep in 1st / R
    if ((rv.gear === 1 || rv.gear === -1) && th < 0.05 && Math.abs(rv.speed) < 1.3 && !rv.handbrake && rv.brake < 0.1) acc += dir * 0.6;
    // engine braking
    if (th < 0.05) acc -= Math.sign(rv.speed) * (0.25 + 0.06 * Math.abs(rv.gear));

    // stall: stopped / lugging in 2nd or higher
    if (rv.gear >= 2 && wheelR < 0.05) {
      aux.lugT += dt;
      if (aux.lugT > ENGINE.STALL_TIME) { rv.ignition = 0; aux.lugT = 0; ev.push('stall'); }
    } else aux.lugT = 0;
  } else aux.lugT = 0;

  // resistance & brakes
  const rolling = 0.12 + (offroad ? 0.9 : 0);
  const aero = 0.00032 * rv.speed * rv.speed;
  const brakes = rv.brake * 6.5 + (rv.handbrake ? 4.5 : 0);
  rv.speed += acc * dt;
  const resist = (rolling + aero + brakes) * dt;
  if (Math.abs(rv.speed) <= resist) {
    // hold still when brakes overpower the engine
    if (Math.abs(acc) * dt <= resist) rv.speed = 0;
  } else rv.speed -= Math.sign(rv.speed) * resist;

  // fuel
  if (on) {
    rv.fuel = Math.max(0, rv.fuel - (0.004 + 0.05 * th * (rv.rpm / REDLINE)) * dt);
    if (rv.fuel <= 0) { rv.ignition = 0; ev.push('nofuel'); }
  }

  // temperature
  const airflow = Math.min(1, Math.abs(rv.speed) / 60) * 36; // fast air cools the radiator
  const target = on ? 175 + 60 * (rv.rpm / REDLINE) * (0.3 + 0.7 * th) + (rv.rpm > 5600 ? 40 : 0) + (boost ? 30 : 0) - airflow : 95;
  rv.temp += (target - rv.temp) * dt * 0.02;
  if (!rv.steam && rv.temp > ENGINE.OVERHEAT_F) { rv.steam = true; ev.push('overheat'); }
  if (rv.steam && rv.temp < ENGINE.OVERHEAT_CLEAR_F) rv.steam = false;

  // steering (input + = left). Max angle shrinks with speed.
  const v = Math.abs(rv.speed);
  // also capped to ~1.7 g of lateral accel so 200 mph isn't a coin flip
  const maxSteer = Math.min(0.6 / (1 + Math.pow(v / 6, 1.3)), (17 * WHEELBASE) / Math.max(1, v * v));
  const targetSteer = clamp(input.st, -1, 1) * maxSteer;
  const rate = input.st === 0 ? 2.5 : 1.4;
  rv.steer += clamp(targetSteer - rv.steer, -rate * dt, rate * dt);

  // integrate pose (local forward = −Z)
  rv.yaw += (rv.speed * Math.tan(rv.steer) / WHEELBASE) * dt;
  rv.x += -Math.sin(rv.yaw) * rv.speed * dt;
  rv.z += -Math.cos(rv.yaw) * rv.speed * dt;
  rv.odometer += v * dt;

  // windshield grime
  if (v > 2) rv.grime = Math.min(1, rv.grime + dt * 0.0025 * (v / 27) * (offroad ? 4 : 1));
  if (rv.wipers) rv.grime = Math.max(0, rv.grime - dt * 0.25);

  // horn
  aux.hornT = Math.max(0, aux.hornT - dt);
  rv.horn = input.horn || aux.hornT > 0;

  return ev;
}

/** Try to shift by dir. Returns 'shift', 'grind' or null. */
export function shift(rv: RVState, dir: number): 'shift' | 'grind' | null {
  const ng = clamp(rv.gear + dir, -1, 7);
  if (ng === rv.gear) return null;
  if (ng === -1 && rv.speed > 1.5) return 'grind';
  if (ng >= 1 && rv.speed < -1) return 'grind';
  if (ng >= 1) {
    const top = gearInfo(ng).top / CFG.MPH;
    if (rv.speed / top > 1.12) return 'grind';
  }
  rv.gear = ng;
  return 'shift';
}
