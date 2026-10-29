// The Bonetti goons who wait at the chapel: standing in suits, flat when shot.
import * as THREE from 'three';
import { makeNpc } from '../models/npcs';
import type { SharedState } from '../types';

export class MafiaView {
  readonly group = new THREE.Group();
  private men = new Map<number, THREE.Group>();

  update(s: SharedState) {
    for (const th of s.mafia.thugs) {
      let m = this.men.get(th.id);
      if (!m) {
        m = new THREE.Group();
        m.add(makeNpc('generic', { body: '#16161a', pants: '#0c0c0e', shoes: '#000', shades: true, tie: '#b71c1c', pose: 'cross', skin: th.id % 2 ? '#d9a066' : '#a9744f' }));
        this.men.set(th.id, m); this.group.add(m);
      }
      m.position.set(th.x, th.hp > 0 ? 0 : 0.25, th.z);
      // face the road centre; fall over when dead
      m.rotation.set(th.hp > 0 ? 0 : -Math.PI / 2, th.hp > 0 ? Math.atan2(-(s.rv.x - th.x), -(s.rv.z - th.z)) : 0.4, 0);
    }
    for (const [id, m] of this.men) if (!s.mafia.thugs.some((t) => t.id === id)) { this.group.remove(m); this.men.delete(id); }
  }
}
