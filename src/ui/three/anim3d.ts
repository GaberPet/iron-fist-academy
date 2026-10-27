// Procedural animation: engine fighter state -> 3D pose (joint angles in degrees).
// Rig convention: the fighter faces +Z, +X is its left. Arms/legs hang down: a negative X
// rotation swings a limb forward; knees bend with positive X; +Z abducts the left arm.
import type { Move } from '../../types';
import type { Fighter, FightEngine } from '../../core/fight';
import { moveLevel } from '../../core/fight';
import type { Euler3, Joint, Pose3 } from './fighter3d';

type J = Partial<Record<Joint, Euler3>>;
const P = (j: J, hipY = 0, extra: Partial<Pose3> = {}): Pose3 => ({ j, hipY, ...extra });
/** Override some joints of a pose. */
const over = (base: Pose3, j: J, extra: Partial<Pose3> = {}): Pose3 => ({ ...base, ...extra, j: { ...base.j, ...j } });
const mixP = (a: Pose3, b: Pose3, t: number): Pose3 => {
  const j: J = {};
  const keys = new Set([...Object.keys(a.j), ...Object.keys(b.j)]) as Set<Joint>;
  for (const k of keys) {
    const x = a.j[k] ?? [0, 0, 0], y = b.j[k] ?? [0, 0, 0];
    j[k] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  const l = (p?: number, q?: number) => (p ?? 0) + ((q ?? 0) - (p ?? 0)) * t;
  const ra = a.root ?? [0, 0, 0], rb = b.root ?? [0, 0, 0];
  return { j, hipY: l(a.hipY, b.hipY), lift: l(a.lift, b.lift), side: l(a.side, b.side), root: [l(ra[0], rb[0]), l(ra[1], rb[1]), l(ra[2], rb[2])] };
};
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------- base poses ----------

export const STANCE = P({
  hips: [0, -22, 0], spine: [6, 0, 0], chest: [4, -10, 0], neck: [-4, 14, 0], head: [-4, 16, 0],
  lSh: [-62, 0, 16], lEl: [-108, 0, 0], rSh: [-42, 0, -24], rEl: [-128, 0, 0],
  lHip: [-24, 10, 5], lKnee: [30, 0, 0], lFoot: [-6, 0, 0], rHip: [16, -10, -5], rKnee: [24, 0, 0], rFoot: [-38, 0, 0],
}, -0.05);
const GUARD = over(STANCE, { spine: [12, 0, 0], head: [8, 16, 0], lSh: [-80, 0, 22], lEl: [-135, 0, 0], rSh: [-76, 0, -22], rEl: [-138, 0, 0] }, { hipY: -0.07 });
const CROUCH = P({
  hips: [0, -20, 0], spine: [24, 0, 0], chest: [8, -8, 0], neck: [-12, 12, 0], head: [-14, 12, 0],
  lSh: [-60, 0, 18], lEl: [-110, 0, 0], rSh: [-50, 0, -20], rEl: [-125, 0, 0],
  lHip: [-80, 8, 8], lKnee: [115, 0, 0], lFoot: [-35, 0, 0], rHip: [-40, -8, -8], rKnee: [125, 0, 0], rFoot: [-85, 0, 0],
}, -0.46);
const CROUCH_GUARD = over(CROUCH, { spine: [30, 0, 0], lSh: [-82, 0, 20], lEl: [-138, 0, 0], rSh: [-80, 0, -20], rEl: [-140, 0, 0], head: [0, 12, 0] });
const HIT_HIGH = over(STANCE, { spine: [-14, 0, 0], chest: [-12, 0, 0], neck: [-25, 0, 0], head: [-25, 0, 0], lSh: [-25, 0, 30], lEl: [-40, 0, 0], rSh: [-25, 0, -30], rEl: [-45, 0, 0] }, { root: [-6, 0, 0] });
const HIT_MID = over(STANCE, { spine: [34, 0, 0], chest: [16, 0, 0], head: [16, 0, 0], lSh: [-35, 0, 8], lEl: [-100, 0, 0], rSh: [-35, 0, -8], rEl: [-105, 0, 0], lKnee: [40, 0, 0], rKnee: [36, 0, 0] }, { hipY: -0.1 });
const HIT_LOW = over(STANCE, { spine: [18, 0, 0], lHip: [-40, 10, 5], lKnee: [70, 0, 0], lFoot: [-30, 0, 0], rKnee: [40, 0, 0] }, { hipY: -0.13 });
const AIR = P({
  spine: [-10, 0, 0], chest: [-8, 0, 0], neck: [-20, 0, 0], head: [-20, 0, 0],
  lSh: [-150, 0, 35], lEl: [-30, 0, 0], rSh: [-140, 0, -35], rEl: [-35, 0, 0],
  lHip: [-45, 0, 10], lKnee: [60, 0, 0], rHip: [-25, 0, -10], rKnee: [40, 0, 0],
});
const DOWN = P({
  spine: [-4, 0, 0], head: [12, 0, 0], lSh: [-20, 0, 40], lEl: [-20, 0, 0], rSh: [-25, 0, -45], rEl: [-30, 0, 0],
  lHip: [-30, 0, 8], lKnee: [50, 0, 0], rHip: [-8, 0, -8], rKnee: [14, 0, 0],
});
const SPLAT = P({ spine: [-12, 0, 0], head: [-18, 0, 0], lSh: [-35, 0, 80], lEl: [-20, 0, 0], rSh: [-35, 0, -80], rEl: [-20, 0, 0], lHip: [-10, 0, 8], lKnee: [25, 0, 0], rHip: [-5, 0, -8], rKnee: [20, 0, 0] });
const WIN = over(STANCE, { hips: [0, 0, 0], chest: [-6, 0, 0], neck: [-10, 0, 0], head: [-12, 0, 0], lSh: [-165, 0, 22], lEl: [-25, 0, 0], rSh: [-160, 0, -22], rEl: [-20, 0, 0], lHip: [-6, 0, 6], lKnee: [8, 0, 0], rHip: [4, 0, -6], rKnee: [6, 0, 0], rFoot: [-10, 0, 0] }, { hipY: 0 });

// ---------- attack animation classes ----------

export type StrikeKind =
  | 'jab' | 'straight' | 'hookL' | 'hookR' | 'uppercut' | 'body' | 'elbow' | 'double' | 'lowPunch'
  | 'frontKickL' | 'frontKickR' | 'highKickL' | 'highKickR' | 'lowKickL' | 'lowKickR' | 'sweep' | 'knee' | 'risingKick'
  | 'throw' | 'heatBurst' | 'rageArt';

export function strikeKind(m: Move): StrikeKind {
  const id = m.id.replace(/^[A-Za-z]{1,5}\./, '');
  const btn = /([1-4](?:\+[1-4])*)[^1-4]*$/.exec(id)?.[1] ?? '1';
  const name = `${m.name} ${m.notes}`.toLowerCase();
  const lv = moveLevel(m);
  const launch = /\d+a/.test(m.hit);
  if (/Heat Burst/.test(m.notes)) return 'heatBurst';
  if (/Rage Art/.test(m.notes)) return 'rageArt';
  if (m.isThrow) return 'throw';
  const kick = /[34]/.test(btn) && !/[12]/.test(btn);
  const both = btn.includes('+') && btn.split('+').length >= 2;
  const left = /^[13]/.test(btn);
  if (kick) {
    if (/knee/.test(name)) return 'knee';
    if (lv === 'low') return /sweep|spin/.test(name) || btn === '3+4' ? 'sweep' : left ? 'lowKickL' : 'lowKickR';
    if (launch && /^(uf|u|ub)\+/.test(id)) return 'risingKick';
    if (lv === 'high' || /spin|roundhouse|axe|hook kick/.test(name)) return left ? 'highKickL' : 'highKickR';
    return left ? 'frontKickL' : 'frontKickR';
  }
  if (both) return lv === 'low' ? 'lowPunch' : 'double';
  if (/elbow/.test(name)) return 'elbow';
  if (lv === 'low') return 'lowPunch';
  if (launch || /upper/.test(name)) return 'uppercut';
  if (/hook|haymaker|swing/.test(name)) return left ? 'hookL' : 'hookR';
  if (lv === 'mid' && /^(df|d)\+/.test(id)) return 'body';
  return left ? 'jab' : 'straight';
}

const STRIKES: Record<StrikeKind, { windup: Pose3; strike: Pose3 }> = (() => {
  const s = STANCE;
  const kickBase = (L: boolean): J => (L ? { rKnee: [20, 0, 0], rHip: [10, -10, -5] } : { lKnee: [24, 0, 0], lHip: [-10, 10, 5] });
  return {
    jab: { windup: over(s, { lSh: [-55, 0, 18], lEl: [-120, 0, 0] }), strike: over(s, { hips: [0, -30, 0], chest: [4, -26, 0], lSh: [-90, 0, 4], lEl: [-4, 0, 0], head: [-4, 22, 0] }) },
    straight: { windup: over(s, { chest: [4, -24, 0], rSh: [-30, 0, -26] }), strike: over(s, { hips: [0, 6, 0], chest: [8, 26, 0], rSh: [-90, 0, -4], rEl: [-4, 0, 0], lSh: [-50, 0, 24], lEl: [-120, 0, 0], rHip: [26, -8, -5], rKnee: [10, 0, 0], neck: [-4, -8, 0] }) },
    hookL: { windup: over(s, { chest: [4, 14, 0], lSh: [-60, 0, 55], lEl: [-95, 0, 0] }), strike: over(s, { hips: [0, -10, 0], chest: [6, -48, 0], lSh: [-82, -30, 70], lEl: [-95, 0, 0] }) },
    hookR: { windup: over(s, { chest: [4, -30, 0], rSh: [-55, 0, -55], rEl: [-95, 0, 0] }), strike: over(s, { hips: [0, 10, 0], chest: [6, 40, 0], rSh: [-82, 30, -70], rEl: [-95, 0, 0] }) },
    uppercut: { windup: over(s, { spine: [26, 0, 0], rSh: [-10, 0, -20], rEl: [-90, 0, 0], lKnee: [55, 0, 0], rKnee: [50, 0, 0] }, { hipY: -0.16 }), strike: over(s, { spine: [-14, 0, 0], chest: [-6, 20, 0], rSh: [-160, 0, -12], rEl: [-60, 0, 0], lKnee: [8, 0, 0], rKnee: [6, 0, 0], head: [-14, 10, 0] }, { hipY: 0.02 }) },
    body: { windup: over(s, { rSh: [-30, 0, -20], rEl: [-100, 0, 0] }, { hipY: -0.1 }), strike: over(s, { spine: [22, 0, 0], chest: [6, 22, 0], rSh: [-72, 0, -6], rEl: [-12, 0, 0], lKnee: [50, 0, 0], rKnee: [40, 0, 0] }, { hipY: -0.16 }) },
    elbow: { windup: over(s, { chest: [4, -24, 0] }), strike: over(s, { chest: [6, 34, 0], rSh: [-85, 20, -40], rEl: [-150, 0, 0], rHip: [24, -8, -5] }) },
    double: { windup: over(s, { lSh: [-40, 0, 20], rSh: [-40, 0, -20], lEl: [-120, 0, 0], rEl: [-120, 0, 0], spine: [-4, 0, 0] }), strike: over(s, { hips: [0, -6, 0], chest: [8, 0, 0], lSh: [-88, 0, 8], lEl: [-8, 0, 0], rSh: [-88, 0, -8], rEl: [-8, 0, 0] }) },
    lowPunch: { windup: CROUCH, strike: over(CROUCH, { lSh: [-62, 0, 6], lEl: [-6, 0, 0], chest: [10, -24, 0] }) },
    frontKickL: { windup: over(s, { lHip: [-70, 10, 5], lKnee: [100, 0, 0], ...kickBase(true) }), strike: over(s, { spine: [-12, 0, 0], lHip: [-95, 10, 5], lKnee: [8, 0, 0], lFoot: [20, 0, 0], ...kickBase(true) }) },
    frontKickR: { windup: over(s, { rHip: [-70, -10, -5], rKnee: [100, 0, 0], ...kickBase(false) }), strike: over(s, { hips: [0, 10, 0], spine: [-14, 0, 0], rHip: [-95, -10, -5], rKnee: [6, 0, 0], rFoot: [20, 0, 0], ...kickBase(false) }) },
    highKickL: { windup: over(s, { hips: [0, 10, 0], lHip: [-60, 0, 30], lKnee: [90, 0, 0], ...kickBase(true) }), strike: over(s, { hips: [0, 55, 0], spine: [0, 0, -24], chest: [0, 0, -10], lHip: [-100, 0, 60], lKnee: [10, 0, 0], ...kickBase(true) }) },
    highKickR: { windup: over(s, { hips: [0, -30, 0], rHip: [-60, 0, -30], rKnee: [90, 0, 0], ...kickBase(false) }), strike: over(s, { hips: [0, -70, 0], spine: [0, 0, 24], chest: [0, 0, 10], rHip: [-100, 0, -60], rKnee: [10, 0, 0], ...kickBase(false) }) },
    lowKickL: { windup: over(s, { lHip: [-40, 10, 10], lKnee: [70, 0, 0], rKnee: [40, 0, 0] }, { hipY: -0.1 }), strike: over(s, { spine: [14, 0, 0], lHip: [-48, 10, 12], lKnee: [10, 0, 0], lFoot: [10, 0, 0], rKnee: [45, 0, 0], rHip: [20, -10, -5] }, { hipY: -0.14 }) },
    lowKickR: { windup: over(s, { rHip: [-40, -10, -10], rKnee: [70, 0, 0], lKnee: [40, 0, 0] }, { hipY: -0.1 }), strike: over(s, { hips: [0, 10, 0], spine: [14, 0, 0], rHip: [-48, -10, -12], rKnee: [10, 0, 0], rFoot: [10, 0, 0], lKnee: [45, 0, 0], lHip: [-20, 10, 5] }, { hipY: -0.14 }) },
    sweep: { windup: CROUCH, strike: over(CROUCH, { hips: [0, 70, 0], rHip: [-75, 0, -70], rKnee: [5, 0, 0], spine: [30, 0, 0] }) },
    knee: { windup: over(s, { lSh: [-80, 0, 10], rSh: [-80, 0, -10], lEl: [-60, 0, 0], rEl: [-60, 0, 0] }), strike: over(s, { spine: [8, 0, 0], lSh: [-60, 0, 10], rSh: [-60, 0, -10], lEl: [-90, 0, 0], rEl: [-90, 0, 0], rHip: [-118, -10, -5], rKnee: [135, 0, 0], rFoot: [-20, 0, 0] }, { hipY: 0.03 }) },
    risingKick: { windup: over(CROUCH, {}, { hipY: -0.3 }), strike: over(s, { spine: [-24, 0, 0], chest: [-10, 0, 0], rHip: [-155, -10, -5], rKnee: [4, 0, 0], lKnee: [4, 0, 0], lHip: [10, 0, 5], lSh: [-30, 0, 60], rSh: [-30, 0, -60], lEl: [-20, 0, 0], rEl: [-20, 0, 0] }, { lift: 0.25, hipY: 0.02 }) },
    throw: { windup: over(s, { lSh: [-70, 0, 30], rSh: [-70, 0, -30], lEl: [-40, 0, 0], rEl: [-40, 0, 0] }), strike: over(s, { spine: [16, 0, 0], lSh: [-88, 0, -12], rSh: [-88, 0, 12], lEl: [-30, 0, 0], rEl: [-30, 0, 0] }) },
    heatBurst: { windup: over(s, { spine: [16, 0, 0], lSh: [-20, 0, 30], rSh: [-20, 0, -30], lEl: [-120, 0, 0], rEl: [-120, 0, 0] }, { hipY: -0.14 }), strike: over(s, { hips: [0, 0, 0], chest: [-12, 0, 0], head: [-14, 0, 0], lSh: [-30, 0, 85], rSh: [-30, 0, -85], lEl: [-10, 0, 0], rEl: [-10, 0, 0] }, { hipY: -0.02 }) },
    rageArt: { windup: over(s, { chest: [4, -40, 0], rSh: [-20, 0, -40], rEl: [-110, 0, 0] }, { hipY: -0.12 }), strike: over(s, { hips: [0, 14, 0], chest: [10, 40, 0], rSh: [-92, 0, -2], rEl: [-2, 0, 0], rHip: [30, -8, -5] }, { hipY: -0.1 }) },
  };
})();

/** Walk cycle on top of the stance. */
function walk(phase: number, dir: number): Pose3 {
  const s = Math.sin(phase), c = Math.cos(phase);
  return over(STANCE, {
    lHip: [-24 + 16 * s * dir, 10, 5], lKnee: [30 + 18 * Math.max(0, c), 0, 0],
    rHip: [16 - 16 * s * dir, -10, -5], rKnee: [24 + 18 * Math.max(0, -c), 0, 0],
  }, { hipY: -0.05 + 0.012 * Math.abs(c) });
}

export interface AnimOut {
  pose: Pose3;
  k: number; // blend speed
  lift: number; // m
}

/** The pose for a fighter this frame. */
export function poseFor(e: FightEngine, x: Fighter, now: number, walkPhase: number): AnimOut {
  const y = x.y / 100;
  const t = now - x.stateAt;
  const breathe = Math.sin(now / 22 + x.side) * 0.008;
  switch (x.state) {
    case 'attack': {
      const m = x.move;
      if (!m) break;
      const st = STRIKES[strikeKind(m)];
      const startup = Math.max(1, x.hitAt - x.moveStart);
      if (now < x.hitAt - 1) {
        const p = smooth((now - x.moveStart) / Math.max(1, startup - 2));
        return { pose: mixP(st.windup, st.strike, p * p * 0.35), k: 0.5, lift: 0 };
      }
      if (now <= x.hitAt + 5) return { pose: st.strike, k: 0.75, lift: 0 };
      const rec = smooth((now - x.hitAt - 5) / Math.max(1, x.endAt - x.hitAt - 5));
      return { pose: mixP(st.strike, x.crouching ? CROUCH : STANCE, rec), k: 0.35, lift: 0 };
    }
    case 'throwing': {
      const p = smooth(t / 20);
      return { pose: over(STRIKES.throw.strike, { spine: [16 + 30 * p, 0, 0] }), k: 0.4, lift: 0 };
    }
    case 'thrown':
      return { pose: over(HIT_HIGH, { lSh: [-60, 0, 30], rSh: [-60, 0, -30] }), k: 0.4, lift: 0 };
    case 'blockstun':
      return { pose: over(x.crouching ? CROUCH_GUARD : GUARD, {}, { root: [-5, 0, 0] }), k: 0.6, lift: 0 };
    case 'hitstun': {
      const base = x.hitHeight > 130 ? HIT_HIGH : x.hitHeight < 60 ? HIT_LOW : HIT_MID;
      const recover = smooth((t - 6) / Math.max(1, x.until - x.stateAt - 6));
      return { pose: t < 6 ? base : mixP(base, STANCE, recover * 0.7), k: t < 4 ? 0.7 : 0.3, lift: 0 };
    }
    case 'air': {
      const spin = x.tornadoUsed ? (now * 18) % 360 : 0;
      const tilt = -70 + Math.max(-20, Math.min(20, x.vy * 2.5));
      return { pose: over(AIR, {}, { root: [tilt, spin, 0], hipY: -0.35 }), k: 0.35, lift: y + 0.15 };
    }
    case 'splat':
      return { pose: over(SPLAT, {}, { root: [-8, 0, 0] }), k: 0.5, lift: y };
    case 'down':
      return { pose: over(DOWN, {}, { root: [-88, 0, 0], hipY: -0.6 }), k: 0.3, lift: -0.18 };
    case 'getup': {
      const p = smooth(t / 26);
      return { pose: mixP(over(DOWN, {}, { root: [-88, 0, 0], hipY: -0.6, lift: -0.18 }), CROUCH, p), k: 0.5, lift: -0.18 * (1 - p) };
    }
    case 'techroll': {
      const p = Math.min(1, t / 20);
      return { pose: over(CROUCH, { spine: [50, 0, 0] }, { root: [-60 * (1 - p), 0, 360 * p * (x.step?.dir ?? 1)], hipY: -0.5 }), k: 0.6, lift: 0 };
    }
    case 'ko':
      if (x.y > 0 || x.vy > 0) return { pose: over(AIR, {}, { root: [-80, 0, 0], hipY: -0.35 }), k: 0.3, lift: y + 0.15 };
      return { pose: over(DOWN, { head: [20, 30, 0] }, { root: [-89, 0, 0], hipY: -0.6 }), k: 0.15, lift: -0.18 };
    case 'step': {
      const p = Math.sin((Math.PI * t) / 22);
      const d = x.step?.dir ?? 1;
      return { pose: over(STANCE, { lHip: [-14, 10, 5 + 12 * p], rHip: [10, -10, -5 - 12 * p], lKnee: [36, 0, 0], rKnee: [34, 0, 0] }, { root: [0, 0, d * -6 * p], hipY: -0.08 }), k: 0.4, lift: 0 };
    }
    case 'dash':
      return { pose: over(STANCE, { spine: [20, 0, 0], lHip: [-45, 10, 5], lKnee: [55, 0, 0], rHip: [28, -10, -5], rKnee: [40, 0, 0] }, { hipY: -0.1 }), k: 0.45, lift: 0 };
    case 'backdash':
      return { pose: over(STANCE, { spine: [-6, 0, 0], lHip: [6, 10, 5], lKnee: [20, 0, 0], rHip: [-28, -10, -5], rKnee: [44, 0, 0] }, { root: [-5, 0, 0], hipY: -0.08 }), k: 0.45, lift: 0 };
    case 'jump':
      return { pose: over(STANCE, { lHip: [-60, 10, 5], lKnee: [90, 0, 0], rHip: [-50, -10, -5], rKnee: [95, 0, 0] }, { hipY: -0.05 }), k: 0.4, lift: y };
  }
  // neutral
  if (e.phase === 'over' && e.winner === x.side) return { pose: WIN, k: 0.08, lift: 0 };
  if (x.crouching) return { pose: x.guard === 'crouch' ? CROUCH_GUARD : CROUCH, k: 0.35, lift: 0 };
  if (x.walking !== 0) return { pose: walk(walkPhase, x.walking), k: 0.3, lift: 0 };
  const base = x.guard === 'stand' ? STANCE : STANCE;
  return { pose: over(base, {}, { hipY: (base.hipY ?? 0) + breathe }), k: 0.18, lift: 0 };
}
