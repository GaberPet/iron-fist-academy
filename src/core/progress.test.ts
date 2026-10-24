import { computeStats, emptyProgress, lessonUnlocked, migrateSettings, recommend, recordAttempt, recordComboAttempt, resetProgress, setLessonPart, stageUnlock, DEFAULT_SETTINGS, passes, type AttemptRecord } from './progress';
import { BUNDLED, buildCharacter, lessonsFor } from '../data';

const anna = buildCharacter(BUNDLED[0].frames, BUNDLED[0].curated);
const lessons = lessonsFor(anna);
const at = (d: string) => new Date(d).toISOString();

const combo = (success: boolean, step?: number, when = '2026-10-20T12:00:00'): AttemptRecord => ({ at: at(when), char: 'anna', kind: 'combo', itemId: 'anna-bnb', success, errorStep: step, errorStepText: step !== undefined ? 'HAM.2,1' : undefined, errorType: success ? undefined : 'wrong-button' });

describe('combo mastery', () => {
  it('requires N consecutive clean runs and resets the streak on failure', () => {
    let p = emptyProgress();
    for (let i = 0; i < 4; i++) p = recordComboAttempt(p, combo(true), 5);
    p = recordComboAttempt(p, combo(false, 2), 5);
    expect(p.combos['anna:anna-bnb']).toMatchObject({ streak: 0, bestStreak: 4, mastered: false, attempts: 5, successes: 4 });
    for (let i = 0; i < 5; i++) p = recordComboAttempt(p, combo(true), 5);
    expect(p.combos['anna:anna-bnb'].mastered).toBe(true);
  });
});

describe('lesson mastery and unlocking', () => {
  it('a lesson is mastered only when both guided and challenge parts pass', () => {
    let p = emptyProgress();
    p = setLessonPart(p, 'anna', 'a-pokes', 'guided', 1, true, at('2026-10-20'));
    expect(p.lessons['anna:a-pokes'].mastered).toBe(false);
    p = setLessonPart(p, 'anna', 'a-pokes', 'challenge', 0.9, true, at('2026-10-20'));
    expect(p.lessons['anna:a-pokes'].mastered).toBe(true);
  });

  it('general lessons are shared between characters', () => {
    let p = emptyProgress();
    p = setLessonPart(p, 'anna', 'g-notation', 'guided', 1, true, at('2026-10-20'));
    expect(Object.keys(p.lessons)).toEqual(['general:g-notation']);
  });

  it('stage 2 stays locked until stage 1 is mastered, including its stage test; opening lessons does not unlock', () => {
    let p = emptyProgress();
    expect(stageUnlock(lessons, p, 'anna', 2, 1).unlocked).toBe(false);
    for (const l of lessons.filter((x) => x.stage === 1 && !x.isStageTest)) {
      p = setLessonPart(p, 'anna', l.id, 'guided', 1, true, at('2026-10-20'));
      p = setLessonPart(p, 'anna', l.id, 'challenge', 1, true, at('2026-10-20'));
    }
    const s2 = stageUnlock(lessons, p, 'anna', 2, 1);
    expect(s2.unlocked).toBe(false);
    expect(s2.reason).toMatch(/Stage 1 test/);
    p = setLessonPart(p, 'anna', 'a-s1-test', 'guided', 1, true, at('2026-10-20'));
    p = setLessonPart(p, 'anna', 'a-s1-test', 'challenge', 1, true, at('2026-10-20'));
    expect(stageUnlock(lessons, p, 'anna', 2, 1).unlocked).toBe(true);
  });

  it('stage tests open only after the stage lessons have been attempted', () => {
    const test = lessons.find((l) => l.id === 'a-s1-test')!;
    expect(lessonUnlocked(lessons, emptyProgress(), 'anna', test, 1).unlocked).toBe(false);
  });

  it('honours a lower unlock requirement', () => {
    let p = emptyProgress();
    const s1 = lessons.filter((x) => x.stage === 1);
    for (const l of s1.slice(0, Math.ceil(s1.length / 2))) {
      p = setLessonPart(p, 'anna', l.id, 'guided', 1, true, at('2026-10-20'));
      p = setLessonPart(p, 'anna', l.id, 'challenge', 1, true, at('2026-10-20'));
    }
    p = setLessonPart(p, 'anna', 'a-s1-test', 'guided', 1, true, at('2026-10-20'));
    p = setLessonPart(p, 'anna', 'a-s1-test', 'challenge', 1, true, at('2026-10-20'));
    expect(stageUnlock(lessons, p, 'anna', 2, 0.5).unlocked).toBe(true);
  });
});

describe('stats and recommendations', () => {
  it('finds the weakest combo transition and recommends a focused drill for it', () => {
    let p = emptyProgress();
    for (let i = 0; i < 4; i++) p = recordComboAttempt(p, combo(false, 3), 5);
    p = recordComboAttempt(p, combo(true), 5);
    const now = new Date('2026-10-21T10:00:00');
    const st = computeStats(p, 'anna', now);
    expect(st.weaknesses[0]).toMatchObject({ kind: 'combo-step', comboId: 'anna-bnb', stepIndex: 3, failures: 4 });
    const recs = recommend(lessons, p, DEFAULT_SETTINGS, 'anna', now);
    expect(recs[0]).toMatchObject({ type: 'focus-step', comboId: 'anna-bnb', stepIndex: 3 });
  });

  it('computes success rate, streak days and per-day buckets', () => {
    let p = emptyProgress();
    p = recordAttempt(p, { ...combo(true, undefined, '2026-10-19T10:00:00') });
    p = recordAttempt(p, { ...combo(false, 1, '2026-10-20T10:00:00') });
    p = recordAttempt(p, { ...combo(true, undefined, '2026-10-21T10:00:00') });
    const st = computeStats(p, 'anna', new Date('2026-10-21T20:00:00'));
    expect(st.attempts).toBe(3);
    expect(st.successRate).toBeCloseTo(2 / 3);
    expect(st.streakDays).toBe(3);
    expect(st.days[st.days.length - 1]).toMatchObject({ date: '2026-10-21', attempts: 1, successes: 1 });
  });

  it('recommends the first unlocked unmastered lesson for a new user and never invents data', () => {
    const recs = recommend(lessons, emptyProgress(), DEFAULT_SETTINGS, 'anna', new Date());
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ type: 'lesson', lessonId: lessons[0].id });
    expect(computeStats(emptyProgress(), 'anna').attempts).toBe(0);
  });

  it('suggests reviews for mastered lessons not practised recently', () => {
    let p = emptyProgress();
    p = setLessonPart(p, 'anna', 'g-notation', 'guided', 1, true, at('2026-09-01'));
    p = setLessonPart(p, 'anna', 'g-notation', 'challenge', 1, true, at('2026-09-01'));
    const recs = recommend(lessons, p, DEFAULT_SETTINGS, 'anna', new Date('2026-10-21'));
    expect(recs.some((r) => r.type === 'review' && r.lessonId === 'g-notation')).toBe(true);
  });
});

describe('reset, migration, thresholds', () => {
  it('resets one character without touching the other', () => {
    let p = emptyProgress();
    p = recordComboAttempt(p, combo(true), 5);
    p = recordComboAttempt(p, { ...combo(true), char: 'armor-king', itemId: 'ak-bnb' }, 5);
    p = resetProgress(p, 'anna');
    expect(p.attempts.every((a) => a.char === 'armor-king')).toBe(true);
    expect(Object.keys(p.combos)).toEqual(['armor-king:ak-bnb']);
  });

  it('migrates partial settings safely', () => {
    const s = migrateSettings({ masteryThreshold: 0.9, controller: { p2Side: true } });
    expect(s.masteryThreshold).toBe(0.9);
    expect(s.controller.p2Side).toBe(true);
    expect(s.controller.tekken.square).toEqual([1]);
    expect(s.recognizer.simulWindow).toBe(DEFAULT_SETTINGS.recognizer.simulWindow);
  });

  it('pass threshold', () => {
    expect(passes(8, 10, 0.8)).toBe(true);
    expect(passes(7, 10, 0.8)).toBe(false);
    expect(passes(0, 0, 0.8)).toBe(false);
  });
});
