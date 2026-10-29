// Keyboard + mouse state with per-frame edge detection and pointer lock.

export class Input {
  private keys = new Set<string>();
  private pressedKeys = new Set<string>();
  private releasedKeys = new Set<string>();
  private clicks = new Set<number>();
  private buttons = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  sensitivity = 0.0022;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.releasedKeys.add(e.code);
    });
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) { this.lock(); return; }
      this.clicks.add(e.button);
      this.buttons.add(e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
  }

  lock() { this.el.requestPointerLock?.(); }

  down(code: string) { return this.keys.has(code); }
  pressed(code: string) { return this.pressedKeys.has(code); }
  released(code: string) { return this.releasedKeys.has(code); }
  clicked(button: number) { return this.clicks.has(button); }
  mouseDown(button: number) { return this.buttons.has(button); }

  endFrame() {
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.clicks.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
