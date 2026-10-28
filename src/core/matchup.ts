// "How to beat…": the opponent's frame data read from your side. Pure functions over the data;
// no advice is invented here (coach notes come from the opponent's curated counterplay text).
import type { CharacterData, Move, PunisherEntry } from '../types';
import { firstHitLevel } from './frames';

export interface PunishRow {
  move: Move;
  /** Your best guaranteed punisher for this window, if your table has one. */
  punisher?: PunisherEntry;
}

const isPlain = (m: Move) => !m.isThrow && m.blockFrame !== null && m.hitLevels.length > 0;

/** Your strongest punisher that is fast enough for a move at `block` frames (e.g. -14 → windows -10…-14). */
export function bestPunisher(yours: PunisherEntry[], block: number, stance: 'standing' | 'crouching'): PunisherEntry | undefined {
  return yours
    .filter((p) => p.stance === stance && p.window >= block)
    .sort((a, b) => a.window - b.window)[0];
}

/** Opponent moves that are -10 or worse on block (worst first), each with your punisher. Lows use crouching punishers. */
export function punishable(opp: CharacterData, yours: PunisherEntry[], limit = 30): PunishRow[] {
  return opp.frames.moves
    .filter((m) => isPlain(m) && (m.blockFrame as number) <= -10)
    .sort((a, b) => (a.blockFrame as number) - (b.blockFrame as number))
    .slice(0, limit)
    .map((move) => ({ move, punisher: bestPunisher(yours, move.blockFrame as number, firstHitLevel(move) === 'low' ? 'crouching' : 'standing') }));
}

/** Strings whose last hit is high: duck it and punish while standing up. */
export function duckable(opp: CharacterData, limit = 20): Move[] {
  return opp.frames.moves
    .filter((m) => m.parent && m.hitLevels.length > 0 && /^h/.test(m.hitLevels[m.hitLevels.length - 1]) && !m.isThrow)
    .slice(0, limit);
}

/** Their safe or plus pressure tools (mid or high, -9 or better): respect these, do not press after them. */
export function pressure(opp: CharacterData, limit = 12): Move[] {
  return opp.frames.moves
    .filter((m) => isPlain(m) && !m.parent && (m.blockFrame as number) >= 0 && ['mid', 'high'].includes(firstHitLevel(m)))
    .sort((a, b) => (b.blockFrame as number) - (a.blockFrame as number))
    .slice(0, limit);
}
