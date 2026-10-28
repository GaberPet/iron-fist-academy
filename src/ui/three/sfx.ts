import { canPersist } from '../../runtime/storage';
// Fight sounds, synthesised with Web Audio (no audio files): impacts, blocks, whooshes,
// body falls, wall crashes, Heat / Rage cues and the K.O. boom.
import type { FightEvent } from '../../core/fight';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('ifa.sfx.muted') === '1';
  } catch {
    return false;
  }
})();

export const sfxMuted = () => muted;
export function setSfxMuted(m: boolean) {
  muted = m;
  try {
    if (canPersist()) localStorage.setItem('ifa.sfx.muted', m ? '1' : '0');
  } catch {
    /* private mode */
  }
  if (master) master.gain.value = m ? 0 : 0.55;
}

/** Create / resume the audio context (call from a user gesture). */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
    }
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch {
    ctx = null;
  }
}

function noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, q = 1) {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const sounds = {
  hit(power: number) {
    const t = ctx!.currentTime;
    tone(t, 0.16 + power * 0.08, 150 - power * 40, 45, 0.9);
    noise(t, 0.09, 'lowpass', 2400, 400, 0.8 * power + 0.3, 0.8);
    noise(t, 0.03, 'highpass', 3000, 2000, 0.35);
  },
  counter() {
    const t = ctx!.currentTime;
    sounds.hit(1.2);
    tone(t, 0.35, 1400, 900, 0.18, 'triangle');
  },
  block() {
    const t = ctx!.currentTime;
    noise(t, 0.06, 'bandpass', 1800, 900, 0.7, 3);
    tone(t, 0.07, 320, 180, 0.3, 'square');
  },
  whiff() {
    const t = ctx!.currentTime;
    noise(t, 0.16, 'bandpass', 600, 2400, 0.25, 2);
  },
  launch() {
    const t = ctx!.currentTime;
    sounds.hit(1);
    noise(t + 0.02, 0.25, 'bandpass', 500, 2600, 0.25, 2);
  },
  fall() {
    const t = ctx!.currentTime;
    tone(t, 0.25, 90, 35, 0.8);
    noise(t, 0.2, 'lowpass', 800, 100, 0.6);
  },
  wall() {
    const t = ctx!.currentTime;
    tone(t, 0.4, 70, 30, 1);
    noise(t, 0.5, 'lowpass', 3000, 200, 0.9);
    noise(t + 0.05, 0.35, 'highpass', 4000, 1500, 0.25);
  },
  grab() {
    const t = ctx!.currentTime;
    noise(t, 0.12, 'bandpass', 900, 500, 0.5, 2);
  },
  heat() {
    const t = ctx!.currentTime;
    tone(t, 0.7, 220, 880, 0.22, 'sawtooth');
    tone(t, 0.7, 330, 1320, 0.12, 'sawtooth');
    noise(t, 0.6, 'highpass', 2000, 8000, 0.25);
  },
  rage() {
    const t = ctx!.currentTime;
    tone(t, 1.1, 110, 40, 0.9, 'sawtooth');
    tone(t, 0.9, 55, 30, 1);
    noise(t, 0.8, 'lowpass', 1200, 80, 0.7);
  },
  ko() {
    const t = ctx!.currentTime;
    tone(t, 1.6, 80, 25, 1);
    noise(t, 1.4, 'lowpass', 2500, 60, 0.9);
    tone(t + 0.05, 1.2, 600, 300, 0.12, 'triangle');
  },
  round() {
    const t = ctx!.currentTime;
    tone(t, 0.25, 520, 520, 0.18, 'square');
    tone(t + 0.28, 0.45, 780, 780, 0.18, 'square');
  },
  tech() {
    const t = ctx!.currentTime;
    noise(t, 0.2, 'bandpass', 1400, 600, 0.3, 2);
  },
};

/** Play the sounds for a batch of fight events. */
export function playEvents(ev: FightEvent[]) {
  if (!ctx || muted || ctx.state !== 'running') return;
  let hitDone = false;
  for (const e of ev) {
    switch (e.type) {
      case 'hit':
        if (!hitDone) sounds.hit(Math.min(1.4, (e.damage ?? 10) / 22));
        hitDone = true;
        break;
      case 'counter':
        sounds.counter();
        hitDone = true;
        break;
      case 'block':
        sounds.block();
        break;
      case 'whiff':
      case 'step-evade':
        sounds.whiff();
        break;
      case 'launch':
      case 'tornado':
        sounds.launch();
        break;
      case 'wall':
      case 'balcony':
        sounds.wall();
        break;
      case 'throw':
        sounds.grab();
        break;
      case 'break':
      case 'parry':
        sounds.block();
        break;
      case 'heat':
      case 'heat-smash':
      case 'heat-dash':
        sounds.heat();
        break;
      case 'rage-art':
        sounds.rage();
        break;
      case 'ko':
        sounds.ko();
        break;
      case 'fight':
      case 'round-start':
        sounds.round();
        break;
      case 'tech':
        sounds.tech();
        break;
    }
  }
}

/** Body-fall thud (called when a fighter lands). */
export function playFall() {
  if (ctx && !muted && ctx.state === 'running') sounds.fall();
}
