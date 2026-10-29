// The Little Desert Chapel at the end of the route, with a heart arch over the road (the finish line).
// Its position follows chapelZ(), which depends on the branches the crew chose.
import * as THREE from 'three';
import { PoolLight } from '../fx/LightPool';
import { chapelZ } from '../world/Route';
import { roadPoint, roadYaw } from '../world/World';

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class ChapelView {
  readonly group = new THREE.Group();
  private neon: THREE.MeshStandardMaterial;
  private placedZ = NaN;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const white = new THREE.MeshStandardMaterial({ color: '#fbf7f0', roughness: 0.7 });
    const pink = new THREE.MeshStandardMaterial({ color: '#f48fb1', roughness: 0.5 });
    this.neon = new THREE.MeshStandardMaterial({ color: '#ff4f9a', emissive: '#ff2d86', emissiveIntensity: 2 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return mesh;
    };

    // --- arch over the road (local x across the road, z along it) ---
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.35, 0.45, 9, 12), white, s * 10, 4.5, 0);
      add(new THREE.SphereGeometry(0.6, 12, 10), pink, s * 10, 9.3, 0);
    }
    const arch = add(new THREE.TorusGeometry(10, 0.35, 10, 48, Math.PI), this.neon, 0, 9, 0);
    arch.castShadow = false;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      map: tex(1024, 200, (g) => {
        g.fillStyle = '#fff0f6'; g.fillRect(0, 0, 1024, 200);
        g.strokeStyle = '#ff2d86'; g.lineWidth = 12; g.strokeRect(8, 8, 1008, 184);
        g.fillStyle = '#c2185b'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 96px Georgia, serif'; g.fillText('♥ JUST MARRIED ♥', 512, 100);
      }),
    }));
    banner.position.set(0, 13.2, 0); this.group.add(banner);
    // hearts on the arch
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.5); heartShape.bezierCurveTo(-1, 0.2, -0.5, 0.9, 0, 0.45); heartShape.bezierCurveTo(0.5, 0.9, 1, 0.2, 0, -0.5);
    const heartGeo = new THREE.ShapeGeometry(heartShape);
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * (i + 0.5)) / 7;
      const h = new THREE.Mesh(heartGeo, this.neon); h.scale.setScalar(0.7);
      h.position.set(Math.cos(a) * 10, 9 + Math.sin(a) * 10, 0.4); this.group.add(h);
    }

    // --- the chapel on the right side of the road ---
    const cx = 26, cz = -14;
    add(new THREE.BoxGeometry(10, 6, 14), white, cx, 3, cz);
    const roof = add(new THREE.CylinderGeometry(0, 8, 4, 4, 1), pink, cx, 8, cz); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 1.4);
    add(new THREE.BoxGeometry(3, 6, 3), white, cx - 3.5, 9, cz + 5);
    add(new THREE.ConeGeometry(2.2, 5, 4), pink, cx - 3.5, 14.5, cz + 5).rotation.y = Math.PI / 4;
    add(new THREE.BoxGeometry(0.2, 1.6, 0.2), gold, cx - 3.5, 17.6, cz + 5);
    add(new THREE.BoxGeometry(1, 0.2, 0.2), gold, cx - 3.5, 17.9, cz + 5);
    add(new THREE.BoxGeometry(0.2, 3, 2.4), new THREE.MeshStandardMaterial({ color: '#8d6e63' }), cx - 5.05, 1.5, cz);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.4), new THREE.MeshBasicMaterial({
      map: tex(768, 200, (g) => {
        g.fillStyle = '#1a0010'; g.fillRect(0, 0, 768, 200);
        g.shadowColor = '#ff2d86'; g.shadowBlur = 20; g.fillStyle = '#ff6fb0'; g.textAlign = 'center';
        g.font = 'bold 64px Georgia, serif'; g.fillText('Little Desert Chapel', 384, 85);
        g.font = 'bold 40px Arial'; g.fillStyle = '#fff59d'; g.fillText('WEDDINGS 24/7 · DRIVE-THRU OK', 384, 155);
      }),
    }));
    sign.position.set(cx - 5.12, 7.2, cz); sign.rotation.y = -Math.PI / 2; this.group.add(sign);
    const glow = new PoolLight('#ff4f9a', 18, 40, 1.2); glow.position.set(0, 8, 2); this.group.add(glow);
  }

  update(focus: THREE.Vector3) {
    const z = chapelZ();
    if (z !== this.placedZ) {
      this.placedZ = z;
      const [x, zz] = roadPoint(z, 0);
      this.group.position.set(x, 0, zz);
      this.group.rotation.y = roadYaw(z);
    }
    this.group.visible = Math.abs(focus.z - this.placedZ) < 1700;
    this.neon.emissiveIntensity = 1.6 + 0.6 * Math.sin(performance.now() * 0.004);
  }
}
