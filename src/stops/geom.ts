// Static collision sets for roadside stops. Each set has its own frame (origin + yaw);
// boxes are axis-aligned in that frame, like the RV's colliders.
import type { Box2 } from '../rv/RV';

export interface StaticSet { x: number; z: number; yaw: number; boxes: Box2[] }

export function toSetLocal(set: StaticSet, wx: number, wz: number): [number, number] {
  const dx = wx - set.x, dz = wz - set.z; const c = Math.cos(set.yaw), s = Math.sin(set.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}
export function fromSetLocal(set: StaticSet, lx: number, lz: number): [number, number] {
  const c = Math.cos(set.yaw), s = Math.sin(set.yaw);
  return [set.x + lx * c + lz * s, set.z - lx * s + lz * c];
}

/**
 * Push a circle (radius r, feet/bottom height y) out of boxes it's below the top of.
 * Returns the new local position and the highest surface it stands over (for floors).
 */
export function collideCircle(lx: number, lz: number, r: number, y: number, boxes: Box2[], stepUp = 0.12): { x: number; z: number; floor: number } {
  let floor = 0;
  for (const b of boxes) {
    const top = b.top ?? 99;
    const over = lx > b.x0 && lx < b.x1 && lz > b.z0 && lz < b.z1;
    if (over && y >= top - stepUp) { floor = Math.max(floor, top); continue; }
    if (y >= top - stepUp) continue;
    const cx = Math.min(b.x1, Math.max(b.x0, lx)), cz = Math.min(b.z1, Math.max(b.z0, lz));
    let dx = lx - cx, dz = lz - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 < 1e-8) {
      const px = Math.min(lx - b.x0, b.x1 - lx), pz = Math.min(lz - b.z0, b.z1 - lz);
      if (px < pz) lx = lx - b.x0 < b.x1 - lx ? b.x0 - r : b.x1 + r; else lz = lz - b.z0 < b.z1 - lz ? b.z0 - r : b.z1 + r;
    } else { const d = Math.sqrt(d2); dx /= d; dz /= d; lx = cx + dx * r; lz = cz + dz * r; }
  }
  return { x: lx, z: lz, floor };
}

/** Does an oriented rectangle (center, yaw, half extents) overlap an AABB in the set frame? (2D SAT) */
export function obbHitsBox(cx: number, cz: number, yaw: number, hw: number, hl: number, b: Box2): boolean {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // RV local axes expressed in the set frame
  const ax = [c, -s], az = [s, c];
  const bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2, bhx = (b.x1 - b.x0) / 2, bhz = (b.z1 - b.z0) / 2;
  const dx = bx - cx, dz = bz - cz;
  const axes: [number, number][] = [[1, 0], [0, 1], [ax[0], ax[1]], [az[0], az[1]]];
  for (const [nx, nz] of axes) {
    const rA = hw * Math.abs(ax[0] * nx + ax[1] * nz) + hl * Math.abs(az[0] * nx + az[1] * nz);
    const rB = bhx * Math.abs(nx) + bhz * Math.abs(nz);
    if (Math.abs(dx * nx + dz * nz) > rA + rB) return false;
  }
  return true;
}

/** Two oriented rectangles in the same 2D frame overlap? yaw = rotation about Y (three.js convention). */
export function obbObb(
  ax: number, az: number, ayaw: number, ahw: number, ahl: number,
  bx: number, bz: number, byaw: number, bhw: number, bhl: number,
): boolean {
  // local x axis = (cos, −sin), local z axis = (sin, cos)
  const A = [[Math.cos(ayaw), -Math.sin(ayaw)], [Math.sin(ayaw), Math.cos(ayaw)]];
  const B = [[Math.cos(byaw), -Math.sin(byaw)], [Math.sin(byaw), Math.cos(byaw)]];
  const dx = bx - ax, dz = bz - az;
  for (const [nx, nz] of [...A, ...B]) {
    const rA = ahw * Math.abs(A[0][0] * nx + A[0][1] * nz) + ahl * Math.abs(A[1][0] * nx + A[1][1] * nz);
    const rB = bhw * Math.abs(B[0][0] * nx + B[0][1] * nz) + bhl * Math.abs(B[1][0] * nx + B[1][1] * nz);
    if (Math.abs(dx * nx + dz * nz) > rA + rB) return false;
  }
  return true;
}

/**
 * Like obbObb, but returns the contact: the axis of least overlap (unit, pointing from A to B)
 * and how deep they overlap along it. null = no contact.
 */
export function obbMtv(
  ax: number, az: number, ayaw: number, ahw: number, ahl: number,
  bx: number, bz: number, byaw: number, bhw: number, bhl: number,
): { nx: number; nz: number; depth: number } | null {
  const A = [[Math.cos(ayaw), -Math.sin(ayaw)], [Math.sin(ayaw), Math.cos(ayaw)]];
  const B = [[Math.cos(byaw), -Math.sin(byaw)], [Math.sin(byaw), Math.cos(byaw)]];
  const dx = bx - ax, dz = bz - az;
  let best: { nx: number; nz: number; depth: number } | null = null;
  for (const [nx, nz] of [...A, ...B]) {
    const rA = ahw * Math.abs(A[0][0] * nx + A[0][1] * nz) + ahl * Math.abs(A[1][0] * nx + A[1][1] * nz);
    const rB = bhw * Math.abs(B[0][0] * nx + B[0][1] * nz) + bhl * Math.abs(B[1][0] * nx + B[1][1] * nz);
    const d = dx * nx + dz * nz;
    const depth = rA + rB - Math.abs(d);
    if (depth <= 0) return null;
    if (!best || depth < best.depth) best = d >= 0 ? { nx, nz, depth } : { nx: -nx, nz: -nz, depth };
  }
  return best;
}
