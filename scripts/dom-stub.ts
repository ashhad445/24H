// Minimal canvas stub so RV/World modules can be constructed in Node for headless tests.
const noop = () => {};
const ctx: any = new Proxy({}, { get: (_t, k) => ((k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
