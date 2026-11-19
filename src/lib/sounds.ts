// Short synthesized chimes for trade events. Muted state persists per browser.
const KEY = 'sosderiv:sound';
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try { return window.localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundEnabled(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

function tone(freqs: number[], step = 0.11, type: OscillatorType = 'sine') {
  if (typeof window === 'undefined' || !soundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = type; o.frequency.value = f;
      const s = t0 + i * step;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + step + 0.15);
      o.connect(g).connect(ctx!.destination);
      o.start(s); o.stop(s + step + 0.2);
    });
  } catch { /* audio unavailable */ }
}

export const sounds = {
  buy: () => tone([660], 0.06, 'triangle'),
  tick: () => tone([880], 0.03, 'sine'),
  win: () => tone([523, 659, 784, 1047], 0.09),
  loss: () => tone([392, 311], 0.16, 'triangle'),
};
