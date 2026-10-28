// Headless drivetrain test: launch, shift up at 95% of each gear band, then cruise.
import { CFG, gearInfo } from '../src/config';
import { newRVState, shift, stepRV, type RVAux } from '../src/rv/Drivetrain';

const rv = newRVState(0, 0, 0);
const aux: RVAux = { crankT: 0, lugT: 0, hornT: 0 };
const dt = 1 / 60;
let t = 0;
const run = (sec: number, th: number, br = 0, st = 0, autoShift = false) => {
  const end = t + sec;
  while (t < end) {
    const ev = stepRV(rv, aux, { th, br, st, horn: false }, dt, false);
    if (ev.length) console.log(`  t=${t.toFixed(1)} events: ${ev.join(',')}`);
    if (autoShift && rv.gear >= 1 && rv.gear < 5 && rv.speed / (gearInfo(rv.gear).top / CFG.MPH) > 0.95) {
      shift(rv, 1); console.log(`  t=${t.toFixed(1)} → gear ${rv.gear} at ${(rv.speed * CFG.MPH).toFixed(0)} mph`);
    }
    t += dt;
  }
};
const mph = () => (rv.speed * CFG.MPH).toFixed(1);

rv.ignition = 1; run(1.2, 0);
console.log('ignition', rv.ignition, 'rpm', rv.rpm.toFixed(0));
rv.handbrake = false; shift(rv, 1);
let reached60 = -1;
const t0 = t;
while (t - t0 < 60) { run(0.1, 1, 0, 0, true); if (reached60 < 0 && rv.speed * CFG.MPH >= 60) reached60 = t - t0; }
console.log(`0-60 mph: ${reached60.toFixed(1)}s, after 60s full throttle: ${mph()} mph gear ${rv.gear} rpm ${rv.rpm.toFixed(0)} temp ${rv.temp.toFixed(0)}`);
// cruise ~60 at partial throttle for 5 min
const fuel0 = rv.fuel, odo0 = rv.odometer;
for (let i = 0; i < 3000; i++) run(0.1, rv.speed * CFG.MPH < 60 ? 0.7 : 0.3);
console.log(`cruise 5 min: ${mph()} mph, temp ${rv.temp.toFixed(0)}F, fuel used ${(fuel0 - rv.fuel).toFixed(2)} gal, miles ${((rv.odometer - odo0) * CFG.MILES_PER_METER).toFixed(1)}`);
// steering at speed
const yaw0 = rv.yaw; run(1, 0.3, 0, 1); console.log(`1s full left at ${mph()} mph: yaw change ${((rv.yaw - yaw0) * 57.3).toFixed(1)} deg`);
// brake to stop in 5th → stall
run(8, 0, 1); console.log(`brake 8s: ${mph()} mph, ignition ${rv.ignition}`);
// start in 4th → stall
rv.ignition = 2; rv.gear = 4; run(3, 1); console.log(`launch in 4th: ${mph()} mph ignition ${rv.ignition}`);
