import { describe, expect, it } from 'vitest';
import { MAX_PACKED, decodeTransfer, encodeTransfer, mergeProgress } from './transfer';
import { emptyProgress, resetProgress, type ProgressData } from './progress';

function sample(n: number): ProgressData {
  const p = emptyProgress();
  for (let i = 0; i < 40; i++) p.lessons[`anna:l${i}`] = { guidedPassed: true, challengePassed: i % 2 === 0, mastered: i % 3 === 0, bestGuided: 0.9 };
  for (let i = 0; i < 20; i++) p.combos[`anna:c${i}`] = { attempts: 5, successes: 3, streak: 1, bestStreak: 2, mastered: false };
  p.practiceSeconds['2026-10-28'] = 600;
  for (let i = 0; i < n; i++) p.attempts.push({ at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), char: 'anna', kind: 'combo', itemId: `c${i % 20}`, success: i % 2 === 0, errorType: 'early' });
  return p;
}

describe('send to phone', () => {
  it('round-trips through a QR-sized code and keeps the newest attempts when it must cut', async () => {
    const p = sample(3000);
    const { data, attempts, total } = await encodeTransfer(p, 'Gaber', 'desktop');
    expect(data.length).toBeLessThanOrEqual(MAX_PACKED);
    expect(total).toBe(3000);
    expect(attempts).toBeGreaterThan(20);
    const t = await decodeTransfer(data);
    expect(t.from).toBe('Gaber');
    expect(Object.keys(t.progress.lessons)).toHaveLength(40);
    expect(t.progress.attempts.at(-1)?.at).toBe(p.attempts.at(-1)?.at);
  });

  it('merges without losing anything, and merging twice changes nothing', () => {
    const phone = sample(2);
    phone.lessons['anna:l1'] = { guidedPassed: true, challengePassed: true, mastered: true };
    const desk = sample(5);
    const once = mergeProgress(phone, desk);
    expect(once.lessons['anna:l1'].mastered).toBe(true);
    expect(once.attempts).toHaveLength(5);
    expect(mergeProgress(once, desk)).toEqual(once);
  });

  it('rejects a code that is not ours', async () => {
    await expect(decodeTransfer('not-a-code')).rejects.toThrow();
  });

  it('a reset on one device reaches the others, but progress made after the reset stays', () => {
    const old = '2026-10-01T10:00:00.000Z';
    const base = emptyProgress();
    base.lessons['anna:l1'] = { guidedPassed: true, challengePassed: true, mastered: true, lastPracticed: old };
    base.lessons['jin:l1'] = { guidedPassed: true, challengePassed: true, mastered: true, lastPracticed: old };
    base.attempts.push({ at: old, char: 'anna', kind: 'combo', itemId: 'c1', success: true });
    const phone = structuredClone(base);
    const pc = resetProgress(structuredClone(base), 'anna', new Date('2026-10-02T10:00:00Z'));
    // The phone trains Anna again after the reset, then syncs.
    phone.lessons['anna:l2'] = { guidedPassed: true, challengePassed: false, mastered: false, lastPracticed: '2026-10-03T10:00:00.000Z' };
    const synced = mergeProgress(phone, pc);
    expect(synced.lessons['anna:l1']).toBeUndefined(); // reset reached the phone
    expect(synced.attempts.filter((a) => a.char === 'anna')).toHaveLength(0);
    expect(synced.lessons['anna:l2']).toBeDefined(); // newer progress kept
    expect(synced.lessons['jin:l1']).toBeDefined(); // other characters untouched
    expect(mergeProgress(pc, synced).lessons['anna:l1']).toBeUndefined(); // and it does not come back to the PC
    const wiped = mergeProgress(phone, resetProgress(structuredClone(base), 'all', new Date('2026-10-02T10:00:00Z')));
    expect(Object.keys(wiped.lessons)).toEqual(['anna:l2']);
  });
});
