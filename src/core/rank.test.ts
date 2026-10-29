import { describe, expect, it } from 'vitest';
import { RANKS, rankFor, rankPoints, rankThreshold } from './rank';
import { emptyProgress } from './progress';

describe('ranks', () => {
  it('climb in order from Beginner to God of Destruction', () => {
    expect(rankFor(0).name).toBe('Beginner');
    expect(rankFor(rankThreshold(1)).name).toBe('1st Dan');
    expect(rankFor(rankThreshold(1) - 1).name).toBe('Beginner');
    expect(rankFor(10_000_000).name).toBe('God of Destruction');
    expect(rankFor(10_000_000).next).toBeNull();
    for (let i = 1; i < RANKS.length; i++) expect(rankThreshold(i)).toBeGreaterThan(rankThreshold(i - 1));
  });

  it('count points from mastered lessons, combos, successes, fight wins and training days', () => {
    const p = emptyProgress();
    p.lessons['anna:a'] = { guidedPassed: true, challengePassed: true, mastered: true };
    p.lessons['anna:b'] = { guidedPassed: true, challengePassed: false, mastered: false };
    p.combos['anna:c'] = { attempts: 5, successes: 5, streak: 5, bestStreak: 5, mastered: true };
    p.attempts.push(
      { at: '2026-10-01T10:00:00Z', char: 'anna', kind: 'quiz', itemId: 'q1', success: true },
      { at: '2026-10-02T10:00:00Z', char: 'anna', kind: 'drill', itemId: 'fight:jin', success: true },
      { at: '2026-10-02T11:00:00Z', char: 'anna', kind: 'drill', itemId: 'fight:jin', success: false },
    );
    const b = rankPoints(p);
    expect(b).toMatchObject({ lessons: 1, combos: 1, successes: 1, fightWins: 1, activeDays: 2 });
    expect(b.total).toBe(100 + 80 + 2 + 30 + 50);
  });
});
