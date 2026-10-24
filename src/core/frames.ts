// Derived frame-data interpretations. Everything here is computed from imported numbers using
// general Tekken rules (i10 is the fastest standard punisher; most characters launch at -15).
import type { Move, PunisherEntry } from '../types';

export type Safety = 'plus' | 'safe' | 'punishable' | 'launch-punishable' | 'varies' | 'unknown';

export const SAFETY_TEXT: Record<Safety, string> = {
  plus: 'Plus on block',
  safe: 'Safe on block',
  punishable: 'Punishable on block',
  'launch-punishable': 'Launch punishable (most characters)',
  varies: 'Varies (depends on delay/timing)',
  unknown: 'No block data',
};

export const SAFETY_EXPLAIN: Record<Safety, string> = {
  plus: 'You recover first after it is blocked, so you keep your turn.',
  safe: 'You are minus, but by less than 10 frames, so no standard punisher (i10) is guaranteed.',
  punishable: 'The opponent recovers 10+ frames earlier and has a guaranteed punish with a fast move.',
  'launch-punishable': 'At -15 or worse most characters can launch you for a full combo.',
  varies: 'Frame advantage changes with how long the move is delayed or charged.',
  unknown: 'Block frames are not recorded for this move (e.g. throws, stances, parries).',
};

export function classifySafety(m: Pick<Move, 'blockRange' | 'blockFrame' | 'isThrow'>): Safety {
  if (m.isThrow || m.blockFrame === null || !m.blockRange) return 'unknown';
  const [lo, hi] = m.blockRange;
  if (lo !== hi && (lo < -9) !== (hi < -9)) return 'varies';
  const v = lo;
  if (v >= 1) return 'plus';
  if (v >= -9) return 'safe';
  if (v >= -14) return 'punishable';
  return 'launch-punishable';
}

/** Hit-level letters as used by Wavu Wiki. */
export function hitLevelName(code: string): string {
  const c = code.replace(/[()]/g, '');
  const map: Record<string, string> = {
    h: 'High', m: 'Mid', l: 'Low', s: 'Special', sl: 'Special low', sm: 'Special mid',
    H: 'High (hits grounded)', M: 'Mid (hits grounded)', L: 'Low (hits grounded)',
    SL: 'Special low (hits grounded)', SM: 'Special mid (hits grounded)',
    t: 'Throw', th: 'Throw (high)', 'th(h)': 'Throw (high)', 'th(m)': 'Throw (mid)', sp: 'Special (no hit)',
  };
  if (map[code]) return map[code];
  if (map[c]) return map[c];
  if (code.endsWith('!')) return `${hitLevelName(code.slice(0, -1))}, unblockable`;
  if (/^t/i.test(code)) return 'Throw';
  return code;
}

/** Simplified block requirement for the first hit: what a defender must do. */
export function firstHitLevel(m: Move): 'high' | 'mid' | 'low' | 'throw' | 'unblockable' | 'other' {
  const c = m.hitLevels[0] ?? '';
  if (!c) return 'other';
  if (c.endsWith('!')) return 'unblockable';
  if (/^t/i.test(c)) return 'throw';
  const k = c.toLowerCase();
  if (k === 'h') return 'high';
  if (k === 'm' || k === 'sm') return 'mid';
  if (k === 'l' || k === 'sl') return 'low';
  return 'other';
}

/** Parse "r30" / "r24 FC" into recovery frames. */
export function recoveryFrames(m: Move): number | null {
  const r = /r(\d+)/.exec(m.recovery || '');
  return r ? Number(r[1]) : null;
}

/** Best guaranteed punisher(s) from a punisher table for an opponent move at `minus` (e.g. -13). */
export function punishersFor(table: PunisherEntry[], minus: number, stance: 'standing' | 'crouching'): PunisherEntry[] {
  const window = -minus;
  const usable = table.filter((p) => p.stance === stance && -p.window <= window);
  if (!usable.length) return [];
  const best = Math.min(...usable.map((p) => p.window)); // most negative = slowest usable = usually strongest
  return usable.filter((p) => p.window === best);
}

export function isPunishable(m: Move): boolean {
  const s = classifySafety(m);
  return s === 'punishable' || s === 'launch-punishable';
}
