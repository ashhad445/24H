// The unfolded paper map: the whole route LA → Vegas, forks, stops, and where the RV is.
import { CFG } from '../config';
import { FORKS, chosen, progressMiles, totalMiles } from '../world/Route';
import type { SharedState } from '../types';

const STOPS: [number, string][] = [[50, "Rusty's Oasis"]];

export class MapView {
  private el = document.getElementById('map')!;
  private ctx = (document.getElementById('map-canvas') as HTMLCanvasElement).getContext('2d')!;
  open = false;
  private lastDraw = 0;

  toggle(v = !this.open) { this.open = v; this.el.classList.toggle('hidden', !v); this.lastDraw = 0; }

  update(s: SharedState) {
    if (!this.open) return;
    const now = performance.now();
    if (now - this.lastDraw < 400) return;
    this.lastDraw = now;
    const g = this.ctx, W = 900, H = 620;
    // parchment
    g.fillStyle = '#ead7a8'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,80,30,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 20, 2 + Math.random() * 8); }
    g.strokeStyle = 'rgba(90,60,20,.25)'; g.lineWidth = 2;
    for (const x of [W / 3, (2 * W) / 3]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();

    g.fillStyle = '#5b3a1a'; g.textAlign = 'center';
    g.font = 'bold 34px Georgia, serif'; g.fillText('ROUTE 66 & BEYOND  —  LOS ANGELES → LAS VEGAS', W / 2, 48);

    const total = totalMiles();
    // map miles to x along a wobbly route line
    const X0 = 70, X1 = W - 90, Y = 340;
    const mx = (mile: number) => X0 + ((X1 - X0) * mile) / Math.max(total, CFG.ROUTE_MILES + 20);
    const wob = (mile: number) => Y + Math.sin(mile / 18) * 14;

    // main road
    g.strokeStyle = '#8d1f1f'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mx(0), wob(0));
    for (let m = 0; m <= total; m += 2) g.lineTo(mx(m), wob(m));
    g.stroke();

    // forks: both branches, the untaken one dashed/faded
    for (const f of FORKS) {
      const decided = s.route[f.id] !== -1;
      f.branches.forEach((b, k) => {
        const taken = chosen(f.id) === k;
        const dy = b.side < 0 ? -70 : 70;
        g.save();
        g.globalAlpha = decided && !taken ? 0.3 : 1;
        g.setLineDash(decided && !taken ? [8, 8] : []);
        g.strokeStyle = b.canyon ? '#b5532a' : '#8d1f1f'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(mx(f.mile), wob(f.mile));
        g.quadraticCurveTo(mx(f.mile + 8), wob(f.mile) + dy, mx(f.mile + 22), wob(f.mile) + dy);
        g.stroke();
        g.fillStyle = '#3e2410'; g.font = 'bold 17px Georgia, serif'; g.textAlign = 'left';
        g.fillText(`${b.name} (${b.delta > 0 ? '+' : ''}${b.delta} mi)`, mx(f.mile + 22) + 8, wob(f.mile) + dy - 4);
        g.font = 'italic 15px Georgia, serif';
        g.fillText(`→ ${b.stop}`, mx(f.mile + 22) + 8, wob(f.mile) + dy + 16);
        g.restore();
      });
      g.fillStyle = '#3e2410'; g.font = 'bold 15px Arial'; g.textAlign = 'center';
      g.fillText(`FORK · mile ${f.mile}`, mx(f.mile), wob(f.mile) + (f.id % 2 ? 26 : -18));
    }

    // stops
    const pin = (mile: number, label: string, color: string) => {
      const x = mx(mile), y = wob(mile);
      g.fillStyle = color; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3e2410'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#3e2410'; g.font = 'bold 16px Georgia, serif'; g.textAlign = 'center';
      g.fillText(label, x, y + 32);
    };
    pin(0, 'LA rental lot', '#90a4ae');
    for (const [m, n] of STOPS) pin(m, n, '#f0ad4e');
    pin(total, '💒 Chapel', '#f06292');
    g.fillText(`mile ${total}`, mx(total), wob(total) + 52);

    // you are here
    const here = Math.min(total, progressMiles(s.rv.z));
    const hx = mx(here), hy = wob(here);
    g.fillStyle = '#1565c0'; g.beginPath(); g.moveTo(hx, hy - 26); g.lineTo(hx - 11, hy - 44); g.lineTo(hx + 11, hy - 44); g.closePath(); g.fill();
    g.font = 'bold 15px Arial'; g.fillStyle = '#0d47a1'; g.fillText(`YOU · mile ${here.toFixed(0)}`, hx, hy - 52);

    // legend
    const left = CFG.RUN_HOURS * 3600 - s.clock;
    g.textAlign = 'left'; g.fillStyle = '#3e2410'; g.font = '18px Georgia, serif';
    g.fillText(`Wedding in ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m · ${(total - here).toFixed(0)} miles to go`, 40, H - 60);
    g.fillText(`Card balance: $${s.money.toFixed(2)} (need $${CFG.WEDDING_MIN_BALANCE} for the gift)`, 40, H - 32);
    g.textAlign = 'right'; g.font = 'italic 15px Georgia, serif';
    g.fillText('Stay right at a fork to keep the default branch · steer into the other lane to take the other', W - 30, H - 32);
  }
}
