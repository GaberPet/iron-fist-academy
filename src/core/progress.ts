// Progress tracking, mastery and recommendations. Pure functions over a plain JSON object
// so it is easy to persist, export and test.
import type { Lesson } from '../types';
import { DEFAULT_CONTROLLER, type ControllerConfig } from './input';
import { DEFAULT_OPTIONS, type RecognizerOptions } from './recognizer';

export type AttemptKind = 'input' | 'combo' | 'quiz' | 'drill' | 'checklist' | 'punish';

export interface AttemptRecord {
  at: string; // ISO timestamp
  char: string;
  kind: AttemptKind;
  itemId: string; // combo id, drill id, quiz question id, lesson exercise id...
  success: boolean;
  lessonId?: string;
  mode?: string; // combo trainer mode, drill difficulty...
  errorType?: string;
  errorStep?: number;
  errorStepText?: string;
  durationMs?: number;
  detail?: string;
}

export interface LessonState {
  guidedPassed: boolean;
  challengePassed: boolean;
  mastered: boolean;
  masteredAt?: string;
  lastPracticed?: string;
  bestGuided?: number;
  bestChallenge?: number;
}

export interface ComboState {
  attempts: number;
  successes: number;
  streak: number;
  bestStreak: number;
  mastered: boolean;
  masteredAt?: string;
  lastPracticed?: string;
}

export interface ProgressData {
  version: 1;
  createdAt: string;
  attempts: AttemptRecord[];
  lessons: Record<string, LessonState>;
  combos: Record<string, ComboState>;
  /** seconds of active practice per local date (YYYY-MM-DD) */
  practiceSeconds: Record<string, number>;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  version: 1;
  activeChar: string;
  masteryThreshold: number; // 0..1, quiz/input accuracy needed to pass
  comboConsistency: number; // consecutive clean executions to master a combo outside lessons
  unlockRequirement: number; // 0..1 share of previous stage lessons mastered to unlock next
  allowPreview: boolean; // read locked lessons (no credit)
  dailyGoalMinutes: number;
  sessionMinutes: number; // configurable practice duration (session timer)
  reviewAfterDays: number;
  drillDifficulty: Difficulty;
  throwBreakWindow: number; // frames
  recognizer: RecognizerOptions;
  controller: ControllerConfig;
  keyboardEnabled: boolean;
  rumble: boolean;
  sound: boolean;
  theme: Theme;
}

export type Theme = 'dark' | 'light' | 'arcade';
export const THEMES: Theme[] = ['light', 'dark', 'arcade'];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: 'dark',
  activeChar: 'anna',
  masteryThreshold: 0.8,
  comboConsistency: 5,
  unlockRequirement: 1,
  allowPreview: true,
  dailyGoalMinutes: 20,
  sessionMinutes: 30,
  reviewAfterDays: 7,
  drillDifficulty: 'normal',
  throwBreakWindow: 20,
  recognizer: { ...DEFAULT_OPTIONS },
  controller: { ...DEFAULT_CONTROLLER },
  keyboardEnabled: true,
  rumble: true,
  sound: true,
};

export const MAX_ATTEMPTS = 20000;

export function emptyProgress(now = new Date()): ProgressData {
  return { version: 1, createdAt: now.toISOString(), attempts: [], lessons: {}, combos: {}, practiceSeconds: {} };
}

/** Merge persisted data over defaults, tolerating missing / older fields. */
export function migrateProgress(raw: unknown): ProgressData {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProgressData>;
  return {
    version: 1,
    createdAt: r.createdAt ?? base.createdAt,
    attempts: Array.isArray(r.attempts) ? r.attempts.filter((a) => a && typeof a.itemId === 'string') : [],
    lessons: r.lessons && typeof r.lessons === 'object' ? r.lessons : {},
    combos: r.combos && typeof r.combos === 'object' ? r.combos : {},
    practiceSeconds: r.practiceSeconds && typeof r.practiceSeconds === 'object' ? r.practiceSeconds : {},
  };
}

export function migrateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS);
  const r = raw as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    version: 1,
    theme: THEMES.includes(r.theme as Theme) ? (r.theme as Theme) : 'dark',
    recognizer: { ...DEFAULT_SETTINGS.recognizer, ...(r.recognizer ?? {}) },
    controller: {
      ...DEFAULT_SETTINGS.controller,
      ...(r.controller ?? {}),
      rawIndex: { ...DEFAULT_SETTINGS.controller.rawIndex, ...(r.controller?.rawIndex ?? {}) },
      tekken: { ...(r.controller?.tekken ?? DEFAULT_SETTINGS.controller.tekken) },
    },
  };
}

export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const lessonKey = (char: string, lessonId: string) => (lessonId.startsWith('g-') ? `general:${lessonId}` : `${char}:${lessonId}`);
export const comboKey = (char: string, comboId: string) => `${char}:${comboId}`;

export function recordAttempt(p: ProgressData, a: AttemptRecord): ProgressData {
  const attempts = [...p.attempts, a];
  if (attempts.length > MAX_ATTEMPTS) attempts.splice(0, attempts.length - MAX_ATTEMPTS);
  return { ...p, attempts };
}

/** Record one combo execution and update streak-based mastery. */
export function recordComboAttempt(p: ProgressData, a: AttemptRecord, consistencyNeeded: number): ProgressData {
  const key = comboKey(a.char, a.itemId);
  const prev: ComboState = p.combos[key] ?? { attempts: 0, successes: 0, streak: 0, bestStreak: 0, mastered: false };
  const streak = a.success ? prev.streak + 1 : 0;
  const mastered = prev.mastered || streak >= consistencyNeeded;
  const next: ComboState = {
    attempts: prev.attempts + 1,
    successes: prev.successes + (a.success ? 1 : 0),
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    mastered,
    masteredAt: prev.masteredAt ?? (mastered ? a.at : undefined),
    lastPracticed: a.at,
  };
  return { ...recordAttempt(p, a), combos: { ...p.combos, [key]: next } };
}

export function setLessonPart(p: ProgressData, char: string, lessonId: string, part: 'guided' | 'challenge', score: number, passed: boolean, at: string): ProgressData {
  const key = lessonKey(char, lessonId);
  const prev: LessonState = p.lessons[key] ?? { guidedPassed: false, challengePassed: false, mastered: false };
  const next: LessonState = { ...prev, lastPracticed: at };
  if (part === 'guided') {
    next.guidedPassed = prev.guidedPassed || passed;
    next.bestGuided = Math.max(prev.bestGuided ?? 0, score);
  } else {
    next.challengePassed = prev.challengePassed || passed;
    next.bestChallenge = Math.max(prev.bestChallenge ?? 0, score);
  }
  next.mastered = next.guidedPassed && next.challengePassed;
  if (next.mastered && !prev.mastered) next.masteredAt = at;
  return { ...p, lessons: { ...p.lessons, [key]: next } };
}

export function lessonState(p: ProgressData, char: string, lessonId: string): LessonState {
  return p.lessons[lessonKey(char, lessonId)] ?? { guidedPassed: false, challengePassed: false, mastered: false };
}

export interface UnlockInfo {
  unlocked: boolean;
  reason?: string;
}

/** Stage gating: stage N unlocks when enough of stage N-1 is mastered AND its stage test is passed. */
export function stageUnlock(lessons: Lesson[], p: ProgressData, char: string, stage: number, requirement: number): UnlockInfo {
  if (stage <= 1) return { unlocked: true };
  const prev = lessons.filter((l) => l.stage === stage - 1);
  if (!prev.length) return { unlocked: true };
  const mastered = prev.filter((l) => lessonState(p, char, l.id).mastered).length;
  const share = mastered / prev.length;
  const test = prev.find((l) => l.isStageTest);
  const testOk = !test || lessonState(p, char, test.id).mastered;
  const needed = Math.ceil(requirement * prev.length);
  if (share + 1e-9 >= requirement && testOk) return { unlocked: true };
  const parts: string[] = [];
  if (share + 1e-9 < requirement) parts.push(`master ${needed} of ${prev.length} Stage ${stage - 1} lessons (${mastered} done)`);
  if (!testOk && test) parts.push(`pass "${test.title}"`);
  return { unlocked: false, reason: `To unlock: ${parts.join(' and ')}.` };
}

export function lessonUnlocked(lessons: Lesson[], p: ProgressData, char: string, lesson: Lesson, requirement: number): UnlockInfo {
  const st = stageUnlock(lessons, p, char, lesson.stage, requirement);
  if (!st.unlocked) return st;
  if (lesson.isStageTest) {
    const others = lessons.filter((l) => l.stage === lesson.stage && !l.isStageTest);
    const notDone = others.filter((l) => !lessonState(p, char, l.id).mastered);
    // A stage test opens once the other lessons in its stage are at least attempted (guided passed).
    const notStarted = notDone.filter((l) => !lessonState(p, char, l.id).guidedPassed);
    if (notStarted.length) return { unlocked: false, reason: `To unlock: pass the guided part of ${notStarted.length} more Stage ${lesson.stage} lesson(s).` };
  }
  return { unlocked: true };
}

// ---------- statistics ----------

export interface DayStat {
  date: string;
  attempts: number;
  successes: number;
  seconds: number;
}

export interface Weakness {
  kind: 'combo-step' | 'error-type' | 'drill';
  key: string;
  label: string;
  failures: number;
  total: number;
  comboId?: string;
  stepIndex?: number;
  drillId?: string;
}

export interface Stats {
  attempts: number;
  successes: number;
  successRate: number;
  byKind: Record<string, { attempts: number; successes: number }>;
  days: DayStat[];
  streakDays: number;
  errorTypes: { type: string; count: number }[];
  weaknesses: Weakness[];
  todaySeconds: number;
  avgComboMs: number | null;
}

export function computeStats(p: ProgressData, char: string, now = new Date(), days = 14): Stats {
  const mine = p.attempts.filter((a) => a.char === char);
  const byKind: Stats['byKind'] = {};
  for (const a of mine) {
    const k = (byKind[a.kind] ??= { attempts: 0, successes: 0 });
    k.attempts++;
    if (a.success) k.successes++;
  }
  const successes = mine.filter((a) => a.success).length;

  const dayList: DayStat[] = [];
  const idx = new Map<string, DayStat>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    const ds = { date: key, attempts: 0, successes: 0, seconds: p.practiceSeconds[key] ?? 0 };
    dayList.push(ds);
    idx.set(key, ds);
  }
  for (const a of mine) {
    const ds = idx.get(localDate(new Date(a.at)));
    if (ds) {
      ds.attempts++;
      if (a.success) ds.successes++;
    }
  }

  // streak: consecutive days (ending today or yesterday) with any attempt or practice time, any character
  const active = new Set<string>([...p.attempts.map((a) => localDate(new Date(a.at))), ...Object.keys(p.practiceSeconds).filter((k) => p.practiceSeconds[k] > 0)]);
  let streak = 0;
  const cursor = new Date(now);
  if (!active.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (active.has(localDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const errCount = new Map<string, number>();
  for (const a of mine) if (!a.success && a.errorType) errCount.set(a.errorType, (errCount.get(a.errorType) ?? 0) + 1);

  // Weaknesses within the recent window (last 30 days)
  const since = now.getTime() - 30 * 86400000;
  const recent = mine.filter((a) => new Date(a.at).getTime() >= since);
  const weak: Weakness[] = [];
  const stepFails = new Map<string, Weakness>();
  const comboTotals = new Map<string, number>();
  for (const a of recent.filter((x) => x.kind === 'combo')) {
    comboTotals.set(a.itemId, (comboTotals.get(a.itemId) ?? 0) + 1);
    if (!a.success && a.errorStep !== undefined) {
      const key = `${a.itemId}#${a.errorStep}`;
      const w = stepFails.get(key) ?? { kind: 'combo-step', key, label: `${a.itemId} → step ${a.errorStep + 1}${a.errorStepText ? ` (${a.errorStepText})` : ''}`, failures: 0, total: 0, comboId: a.itemId, stepIndex: a.errorStep };
      w.failures++;
      stepFails.set(key, w);
    }
  }
  for (const w of stepFails.values()) {
    w.total = comboTotals.get(w.comboId!) ?? w.failures;
    weak.push(w);
  }
  const drillTotals = new Map<string, { f: number; t: number }>();
  for (const a of recent.filter((x) => x.kind === 'drill')) {
    const d = drillTotals.get(a.itemId) ?? { f: 0, t: 0 };
    d.t++;
    if (!a.success) d.f++;
    drillTotals.set(a.itemId, d);
  }
  for (const [id, d] of drillTotals) if (d.t >= 5 && d.f / d.t > 0.3) weak.push({ kind: 'drill', key: `drill:${id}`, label: id, failures: d.f, total: d.t, drillId: id });
  weak.sort((a, b) => b.failures - a.failures || b.failures / b.total - a.failures / a.total);

  const comboDurations = mine.filter((a) => a.kind === 'combo' && a.success && a.durationMs).map((a) => a.durationMs!);
  return {
    attempts: mine.length,
    successes,
    successRate: mine.length ? successes / mine.length : 0,
    byKind,
    days: dayList,
    streakDays: streak,
    errorTypes: [...errCount.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    weaknesses: weak.slice(0, 8),
    todaySeconds: p.practiceSeconds[localDate(now)] ?? 0,
    avgComboMs: comboDurations.length ? comboDurations.reduce((s, x) => s + x, 0) / comboDurations.length : null,
  };
}

export type Recommendation =
  | { type: 'focus-step'; title: string; reason: string; comboId: string; stepIndex: number }
  | { type: 'drill'; title: string; reason: string; drillId: string }
  | { type: 'review'; title: string; reason: string; lessonId: string }
  | { type: 'lesson'; title: string; reason: string; lessonId: string }
  | { type: 'done'; title: string; reason: string };

/** Next best thing to practise: fix a recurring weakness, review decayed skills, then continue the path. */
export function recommend(lessons: Lesson[], p: ProgressData, s: Settings, char: string, now = new Date()): Recommendation[] {
  const recs: Recommendation[] = [];
  const st = computeStats(p, char, now);
  const step = st.weaknesses.find((w) => w.kind === 'combo-step' && w.failures >= 3);
  if (step)
    recs.push({
      type: 'focus-step',
      title: `Focus drill: ${step.label}`,
      reason: `You dropped this transition ${step.failures} times recently. Practise just this step instead of the whole combo.`,
      comboId: step.comboId!,
      stepIndex: step.stepIndex!,
    });
  const drill = st.weaknesses.find((w) => w.kind === 'drill');
  if (drill) recs.push({ type: 'drill', title: `Bot drill: ${drill.label}`, reason: `${drill.failures}/${drill.total} recent rounds failed.`, drillId: drill.drillId! });

  const reviewMs = s.reviewAfterDays * 86400000;
  for (const l of lessons) {
    const ls = lessonState(p, char, l.id);
    if (ls.mastered && ls.lastPracticed && now.getTime() - new Date(ls.lastPracticed).getTime() > reviewMs) {
      recs.push({ type: 'review', title: `Review: ${l.title}`, reason: `Mastered, last practised ${Math.floor((now.getTime() - new Date(ls.lastPracticed).getTime()) / 86400000)} days ago.`, lessonId: l.id });
      if (recs.filter((r) => r.type === 'review').length >= 2) break;
    }
  }
  const next = lessons.find((l) => !lessonState(p, char, l.id).mastered && lessonUnlocked(lessons, p, char, l, s.unlockRequirement).unlocked);
  if (next) recs.push({ type: 'lesson', title: `Next lesson: ${next.title}`, reason: `Stage ${next.stage}${next.isStageTest ? ' test' : ''}.`, lessonId: next.id });
  if (!recs.length) recs.push({ type: 'done', title: 'Curriculum complete', reason: 'Every lesson is mastered. Keep reviewing and play matches.' });
  return recs;
}

export function addPracticeSeconds(p: ProgressData, seconds: number, now = new Date()): ProgressData {
  const key = localDate(now);
  return { ...p, practiceSeconds: { ...p.practiceSeconds, [key]: (p.practiceSeconds[key] ?? 0) + seconds } };
}

/** Remove one character's progress (general lessons are kept unless `all`). */
export function resetProgress(p: ProgressData, char: string | 'all'): ProgressData {
  if (char === 'all') return emptyProgress();
  const lessons = Object.fromEntries(Object.entries(p.lessons).filter(([k]) => !k.startsWith(`${char}:`)));
  const combos = Object.fromEntries(Object.entries(p.combos).filter(([k]) => !k.startsWith(`${char}:`)));
  return { ...p, attempts: p.attempts.filter((a) => a.char !== char), lessons, combos };
}

/** Score of an exercise run: share of successful items. */
export function passes(successes: number, total: number, threshold: number): boolean {
  return total > 0 && successes / total + 1e-9 >= threshold;
}
