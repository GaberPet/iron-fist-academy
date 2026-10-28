import { describe, expect, it } from 'vitest';
import { bestPunisher, duckable, pressure, punishable } from './matchup';
import { loadCharacter } from '../data/testData';

describe('matchup', () => {
  const yours = [
    { window: -10, moveId: '1,2', stance: 'standing' as const },
    { window: -12, moveId: 'f+2', stance: 'standing' as const },
    { window: -15, moveId: 'df+2', stance: 'standing' as const },
    { window: -11, moveId: 'ws4', stance: 'crouching' as const },
  ];

  it('picks the strongest punisher that is fast enough', () => {
    expect(bestPunisher(yours, -13, 'standing')?.moveId).toBe('f+2');
    expect(bestPunisher(yours, -18, 'standing')?.moveId).toBe('df+2');
    expect(bestPunisher(yours, -9, 'standing')).toBeUndefined();
    expect(bestPunisher(yours, -14, 'crouching')?.moveId).toBe('ws4');
  });

  it('lists a real opponent: unsafe moves worst first, duckable highs, plus pressure', () => {
    const king = loadCharacter('king');
    const rows = punishable(king, yours);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => (r.move.blockFrame as number) <= -10)).toBe(true);
    expect(rows[0].move.blockFrame! <= rows[rows.length - 1].move.blockFrame!).toBe(true);
    expect(duckable(king).every((m) => /^h/.test(m.hitLevels[m.hitLevels.length - 1]))).toBe(true);
    expect(pressure(king).every((m) => (m.blockFrame as number) >= 0)).toBe(true);
  });
});
