// Ranks: one overall rank earned from training points. Points are worked out from the saved
// progress every time (never stored), so they stay right after syncing, importing or resets.
import type { ProgressData } from './progress';

/** Tekken 8's ladder of rank names, lowest first. */
export const RANKS = [
  'Beginner', '1st Dan', '2nd Dan', 'Fighter', 'Strategist', 'Combatant', 'Brawler', 'Ranger', 'Cavalier', 'Warrior',
  'Assailant', 'Dominator', 'Vanquisher', 'Destroyer', 'Eliminator', 'Garyu', 'Shinryu', 'Tenryu', 'Mighty Ruler', 'Flame Ruler',
  'Battle Ruler', 'Fujin', 'Raijin', 'Kishin', 'Bushin', 'Tekken King', 'Tekken Emperor', 'Tekken God', 'Tekken God Supreme', 'God of Destruction',
] as const;

/** Points needed for rank i: grows faster as you climb (1st Dan 40, Garyu ≈ 15 000, God of Destruction ≈ 66 000). */
export const rankThreshold = (i: number) => (i <= 0 ? 0 : Math.round(40 * i ** 2.2));

export const POINTS = { lesson: 100, combo: 80, success: 2, fightWin: 30, activeDay: 25 } as const;

export interface PointsBreakdown { lessons: number; combos: number; successes: number; fightWins: number; activeDays: number; total: number }

export function rankPoints(p: ProgressData): PointsBreakdown {
  const lessons = Object.values(p.lessons).filter((l) => l.mastered).length;
  const combos = Object.values(p.combos).filter((c) => c.mastered).length;
  const fightWins = p.attempts.filter((a) => a.success && a.itemId.startsWith('fight:')).length;
  const successes = p.attempts.filter((a) => a.success).length - fightWins;
  const days = new Set([...p.attempts.map((a) => a.at.slice(0, 10)), ...Object.keys(p.practiceSeconds).filter((d) => p.practiceSeconds[d] > 0)]);
  const total = lessons * POINTS.lesson + combos * POINTS.combo + successes * POINTS.success + fightWins * POINTS.fightWin + days.size * POINTS.activeDay;
  return { lessons, combos, successes, fightWins, activeDays: days.size, total };
}

export interface Rank { index: number; name: string; points: number; next: { name: string; points: number } | null; progress: number }

export function rankFor(points: number): Rank {
  let i = 0;
  while (i + 1 < RANKS.length && points >= rankThreshold(i + 1)) i++;
  const lo = rankThreshold(i);
  const hasNext = i + 1 < RANKS.length;
  const hi = hasNext ? rankThreshold(i + 1) : lo;
  return { index: i, name: RANKS[i], points, next: hasNext ? { name: RANKS[i + 1], points: hi } : null, progress: hasNext ? (points - lo) / (hi - lo) : 1 };
}
